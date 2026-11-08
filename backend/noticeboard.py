"""48-hour crew-only noticeboard.

Pro members can publish notices. Their own posts and posts by accepted crew
connections appear in the feed, regardless of the reader's subscription tier.
Pending, declined and removed connections NEVER grant access.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel
from server import db, current_user, pro_user, iso

router = APIRouter(prefix="/noticeboard")
NOTICE_LIFETIME = timedelta(hours=48)


class NoticeIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)


class NoticeOut(BaseModel):
    notice_id: str
    author_id: str
    author_name: str
    trade: str | None = None
    text: str
    created_at: str
    expires_at: str
    mine: bool


async def _crew_ids(user_id: str) -> set[str]:
    ids = {user_id}
    async for c in db.connections.find(
        {"status": "accepted", "$or": [{"from_id": user_id}, {"to_id": user_id}]},
        {"from_id": 1, "to_id": 1},
    ):
        ids.add(c["to_id"] if c["from_id"] == user_id else c["from_id"])
    return ids


@router.get("", response_model=List[NoticeOut])
async def feed(user: dict = Depends(current_user)):
    allowed = await _crew_ids(user["user_id"])
    now = datetime.now(timezone.utc)
    rows = await db.crew_notices.find(
        {"author_id": {"$in": list(allowed)}, "expires_at": {"$gt": now}},
        {"_id": 0},
    ).sort("created_at", DESCENDING).limit(100).to_list(100)
    return [
        NoticeOut(
            notice_id=row["notice_id"],
            author_id=row["author_id"],
            author_name=row["author_name"],
            trade=row.get("trade"),
            text=row["text"],
            created_at=iso(row["created_at"]),
            expires_at=iso(row["expires_at"]),
            mine=row["author_id"] == user["user_id"],
        )
        for row in rows
    ]


@router.post("", response_model=NoticeOut, status_code=201)
async def publish(body: NoticeIn, user: dict = Depends(pro_user)):
    now = datetime.now(timezone.utc)
    text = body.text.strip()
    if not text:
        raise HTTPException(422, "Notice cannot be blank")
    notice = {
        "notice_id": "notice_" + uuid.uuid4().hex[:16],
        "author_id": user["user_id"],
        "author_name": user.get("name") or "Tradie",
        "trade": user.get("trade"),
        "text": text,
        "created_at": now,
        "expires_at": now + NOTICE_LIFETIME,
    }
    await db.crew_notices.insert_one(dict(notice))
    return NoticeOut(**{**notice, "created_at": iso(now), "expires_at": iso(notice["expires_at"]), "mine": True})


@router.delete("/{notice_id}")
async def delete(notice_id: str, user: dict = Depends(current_user)):
    result = await db.crew_notices.delete_one({"notice_id": notice_id, "author_id": user["user_id"]})
    if not result.deleted_count:
        raise HTTPException(404, "Notice not found")
    return {"ok": True}
