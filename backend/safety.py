"""User reporting and two-way blocking for ChopOut.

Reports are private to moderation staff; public endpoints never list them.
Blocking prevents connection requests and direct messages in either direction.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from server import current_user, db

router = APIRouter(prefix="/safety")


class ReportIn(BaseModel):
    user_id: str = Field(min_length=1, max_length=100)
    reason: str = Field(min_length=4, max_length=500)
    notice_id: str | None = Field(default=None, max_length=100)


class BlockIn(BaseModel):
    user_id: str = Field(min_length=1, max_length=100)


@router.post("/report", status_code=201)
async def report(body: ReportIn, user: dict = Depends(current_user)):
    if body.user_id == user["user_id"]:
        raise HTTPException(400, "You cannot report yourself")
    if not await db.users.find_one({"user_id": body.user_id}, {"_id": 1}):
        raise HTTPException(404, "Member not found")
    if body.notice_id:
        notice = await db.crew_notices.find_one(
            {"notice_id": body.notice_id, "author_id": body.user_id}, {"_id": 1})
        if not notice:
            raise HTTPException(404, "Notice not found")
    await db.moderation_reports.insert_one({
        "report_id": "report_" + uuid.uuid4().hex,
        "reporter_id": user["user_id"], "reported_user_id": body.user_id,
        "notice_id": body.notice_id, "reason": body.reason.strip(),
        "status": "open", "created_at": datetime.now(timezone.utc),
    })
    return {"ok": True}


@router.post("/block")
async def block(body: BlockIn, user: dict = Depends(current_user)):
    if body.user_id == user["user_id"]:
        raise HTTPException(400, "You cannot block yourself")
    if not await db.users.find_one({"user_id": body.user_id}, {"_id": 1}):
        raise HTTPException(404, "Member not found")
    await db.user_blocks.update_one(
        {"blocker_id": user["user_id"], "blocked_id": body.user_id},
        {"$setOnInsert": {"created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    await db.connections.delete_many({
        "$or": [
            {"from_id": user["user_id"], "to_id": body.user_id},
            {"from_id": body.user_id, "to_id": user["user_id"]},
        ]
    })
    return {"ok": True}


@router.delete("/block/{other_user_id}")
async def unblock(other_user_id: str, user: dict = Depends(current_user)):
    await db.user_blocks.delete_one({"blocker_id": user["user_id"], "blocked_id": other_user_id})
    return {"ok": True}
