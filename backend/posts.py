"""Work board: 'need a subbie' job posts and 'looking for work' broadcasts.

Each Pro member has their own board. A post is visible to Pro members who are either in the
poster's crew or within NEARBY_RADIUS_KM of the poster's approximate area.
"""
import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from server import (NEARBY_RADIUS_KM, PersonOut, TRADES, connection_map, conv_key, db, haversine, iso, pro_user, to_person)

router = APIRouter(prefix="/posts")

JOB_DAYS = 2  # Auto-hide jobs 48 hours after posting
WORK_DAYS = 2 # Auto-hide availability notices after 48 hours
PAY_WIDTH = 20  # each band is $20 wide: 40-60, 50-70, 60-80 ...
PAY_STEP = 10
PAY_MIN, PAY_MAX = 20, 180
DURATIONS = ["1 day", "2-3 days", "1 week", "2+ weeks", "Ongoing"]


class PostIn(BaseModel):
    type: Literal["job", "work"]
    trade: str
    title: str = Field(min_length=3, max_length=80)
    details: Optional[str] = Field(default=None, max_length=600)
    start: Optional[str] = Field(default=None, max_length=40)
    duration: Optional[str] = Field(default=None, max_length=20)
    pay_min: Optional[int] = None  # $/hr, 20-dollar bands e.g. 50-70
    suburb: Optional[str] = Field(default=None, max_length=60)


class Responder(BaseModel):
    user_id: str
    name: str
    picture: Optional[str] = None
    picture_kind: Optional[str] = None
    trade: Optional[str] = None
    at: str


class PostOut(BaseModel):
    post_id: str
    type: str
    trade: str
    title: str
    details: Optional[str] = None
    start: Optional[str] = None
    duration: Optional[str] = None
    pay_min: Optional[int] = None
    pay_max: Optional[int] = None
    suburb: Optional[str] = None
    created_at: str
    expires_at: str
    author: PersonOut
    mine: bool
    is_crew: bool
    distance_km: Optional[float] = None
    keen: bool
    keen_count: int
    responders: List[Responder] = []


def pay_label(lo: Optional[int], hi: Optional[int]) -> str:
    return f"${lo}-{hi}/hr" if lo and hi else "Pay negotiable"


async def _visible_author_ids(me: dict) -> tuple[set, dict]:
    """Crew ids + ids of members within radius of me. Returns (ids, distances)."""
    cmap = await connection_map(me["user_id"])
    crew = {uid for uid, (status, _) in cmap.items() if status == "connected"}
    dist: dict = {}
    if me.get("approx_lat") is not None:
        lat, lng = me["approx_lat"], me["approx_lng"]
        dlat = NEARBY_RADIUS_KM / 111.0
        dlng = NEARBY_RADIUS_KM / (111.0 * max(math.cos(math.radians(lat)), 0.01))
        cur = db.users.find({"profile_complete": True, "approx_lat": {"$gte": lat - dlat, "$lte": lat + dlat},
                             "approx_lng": {"$gte": lng - dlng, "$lte": lng + dlng}},
                            {"_id": 0, "user_id": 1, "approx_lat": 1, "approx_lng": 1})
        async for u in cur:
            d = haversine(lat, lng, u["approx_lat"], u["approx_lng"])
            if d <= NEARBY_RADIUS_KM:
                dist[u["user_id"]] = d
    return crew | set(dist) | {me["user_id"]}, dist


async def _to_out(posts: list, me: dict, cmap: dict, crew: set, dist: dict, with_responders: bool = False) -> List[PostOut]:
    author_ids = list({p["user_id"] for p in posts})
    users = {u["user_id"]: u async for u in db.users.find({"user_id": {"$in": author_ids}}, {"_id": 0})}
    out = []
    for p in posts:
        a = users.get(p["user_id"])
        if not a:
            continue
        responders = p.get("responders", [])
        resp_out: List[Responder] = []
        if with_responders and responders:
            rusers = {u["user_id"]: u async for u in db.users.find({"user_id": {"$in": [r["user_id"] for r in responders]}}, {"_id": 0})}
            resp_out = [Responder(user_id=r["user_id"], name=rusers[r["user_id"]].get("name", ""), picture=rusers[r["user_id"]].get("picture"),
                                  picture_kind=rusers[r["user_id"]].get("picture_kind"), trade=rusers[r["user_id"]].get("trade"), at=iso(r["at"]))
                        for r in responders if r["user_id"] in rusers]
        out.append(PostOut(
            post_id=p["post_id"], type=p["type"], trade=p["trade"], title=p["title"], details=p.get("details"), start=p.get("start"),
            duration=p.get("duration"), pay_min=p.get("pay_min"), pay_max=p.get("pay_max"), suburb=p.get("suburb"),
            created_at=iso(p["created_at"]), expires_at=iso(p["expires_at"]),
            author=to_person(a, cmap, dist.get(p["user_id"])), mine=p["user_id"] == me["user_id"],
            is_crew=p["user_id"] in crew, distance_km=None if p["user_id"] not in dist else round(dist[p["user_id"]], 1),
            keen=any(r["user_id"] == me["user_id"] for r in responders), keen_count=len(responders), responders=resp_out,
        ))
    return out


def _active_filter() -> dict:
    return {"closed": {"$ne": True}, "expires_at": {"$gt": datetime.now(timezone.utc)}}


class PublicPostOut(BaseModel):
    post_id: str
    type: Literal["job", "work"]
    trade: str
    title: str
    details: Optional[str] = None
    start: Optional[str] = None
    duration: Optional[str] = None
    pay_min: Optional[int] = None
    pay_max: Optional[int] = None
    suburb: Optional[str] = None
    created_at: str
    expires_at: str
    author_name: str


@router.get("/public", response_model=List[PublicPostOut])
async def public_board(type: Optional[Literal["job", "work"]] = None):
    """Public read-only listings: no exact positions, phone numbers or responder details."""
    flt = _active_filter()
    if type:
        flt["type"] = type
    rows = await db.posts.find(flt, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    ids = list({p["user_id"] for p in rows})
    authors = {u["user_id"]: u async for u in db.users.find(
        {"user_id": {"$in": ids}, "profile_complete": True},
        {"_id": 0, "user_id": 1, "name": 1},
    )}
    return [
        PublicPostOut(
            post_id=p["post_id"], type=p["type"], trade=p["trade"], title=p["title"],
            details=p.get("details"), start=p.get("start"), duration=p.get("duration"),
            pay_min=p.get("pay_min"), pay_max=p.get("pay_max"), suburb=p.get("suburb"),
            created_at=iso(p["created_at"]), expires_at=iso(p["expires_at"]),
            author_name=authors[p["user_id"]].get("name") or "Tradie",
        ) for p in rows if p["user_id"] in authors
    ]


@router.post("/{post_id}/chopped-out")
async def chopped_out(post_id: str, user: dict = Depends(pro_user)):
    """Only the original Pro advertiser can mark a job filled."""
    result = await db.posts.update_one(
        {"post_id": post_id, "user_id": user["user_id"], "closed": {"$ne": True}},
        {"$set": {"closed": True, "closed_reason": "chopped_out", "closed_at": datetime.now(timezone.utc)}},
    )
    if not result.matched_count:
        raise HTTPException(404, "Open listing not found or not yours")
    return {"ok": True, "status": "chopped_out"}


@router.get("", response_model=List[PostOut])
async def list_posts(type: Optional[str] = None, trade: Optional[str] = None, mine: bool = False, user: dict = Depends(pro_user)):
    visible, dist = await _visible_author_ids(user)
    flt = {**_active_filter(), "user_id": user["user_id"] if mine else {"$in": list(visible)}}
    if type in ("job", "work"):
        flt["type"] = type
    if trade:
        flt["trade"] = trade
    posts = await db.posts.find(flt, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
    cmap = await connection_map(user["user_id"])
    crew = {uid for uid, (st, _) in cmap.items() if st == "connected"}
    return await _to_out(posts, user, cmap, crew, dist, with_responders=mine)


@router.get("/options")
async def post_options(user: dict = Depends(pro_user)):
    bands = [{"min": lo, "max": lo + PAY_WIDTH, "label": f"${lo}-{lo + PAY_WIDTH}/hr"} for lo in range(PAY_MIN, PAY_MAX + 1, PAY_STEP)]
    return {"pay_bands": bands, "durations": DURATIONS, "trades": TRADES, "job_days": JOB_DAYS, "work_days": WORK_DAYS}


@router.post("", response_model=PostOut)
async def create_post(body: PostIn, user: dict = Depends(pro_user)):
    if body.trade not in TRADES:
        raise HTTPException(422, "Pick a trade")
    if body.pay_min is not None and (body.pay_min < PAY_MIN or body.pay_min > PAY_MAX or body.pay_min % PAY_STEP != 0):
        raise HTTPException(422, "Pick a pay range from the list")
    if body.duration and body.duration not in DURATIONS:
        raise HTTPException(422, "Pick a duration from the list")
    open_count = await db.posts.count_documents({"user_id": user["user_id"], **_active_filter()})
    if open_count >= 10:
        raise HTTPException(429, "You have 10 live posts. Close one before adding more.")
    now = datetime.now(timezone.utc)
    post = {
        "post_id": f"post_{uuid.uuid4().hex[:12]}", "user_id": user["user_id"], "type": body.type, "trade": body.trade,
        "title": body.title.strip(), "details": (body.details or "").strip() or None, "start": (body.start or "").strip() or None,
        "duration": body.duration, "pay_min": body.pay_min, "pay_max": None if body.pay_min is None else body.pay_min + PAY_WIDTH,
        "suburb": (body.suburb or "").strip() or user.get("suburb"), "lat": user.get("approx_lat"), "lng": user.get("approx_lng"),
        "created_at": now, "expires_at": now + timedelta(days=JOB_DAYS if body.type == "job" else WORK_DAYS),
        "closed": False, "responders": [],
    }
    await db.posts.insert_one(post)
    post.pop("_id", None)
    cmap = await connection_map(user["user_id"])
    return (await _to_out([post], user, cmap, set(), {}, with_responders=True))[0]


async def _get_visible_post(post_id: str, user: dict) -> tuple[dict, dict, set, dict]:
    post = await db.posts.find_one({"post_id": post_id}, {"_id": 0})
    if not post or post.get("closed") or post.get("expires_at", datetime.now(timezone.utc)) <= datetime.now(timezone.utc):
        raise HTTPException(404, "This post is no longer available")
    visible, dist = await _visible_author_ids(user)
    if post["user_id"] not in visible:
        raise HTTPException(403, "This post is only visible to the poster's crew and nearby members")
    cmap = await connection_map(user["user_id"])
    crew = {uid for uid, (st, _) in cmap.items() if st == "connected"}
    return post, cmap, crew, dist


@router.get("/{post_id}", response_model=PostOut)
async def get_post(post_id: str, user: dict = Depends(pro_user)):
    post, cmap, crew, dist = await _get_visible_post(post_id, user)
    return (await _to_out([post], user, cmap, crew, dist, with_responders=post["user_id"] == user["user_id"]))[0]


@router.post("/{post_id}/keen", response_model=PostOut)
async def keen(post_id: str, user: dict = Depends(pro_user)):
    """'I'm keen': records interest and drops the poster a message so they can reply."""
    post, cmap, crew, dist = await _get_visible_post(post_id, user)
    if post["user_id"] == user["user_id"]:
        raise HTTPException(400, "That's your own post")
    exp = post["expires_at"] if post["expires_at"].tzinfo else post["expires_at"].replace(tzinfo=timezone.utc)
    if exp <= datetime.now(timezone.utc):
        raise HTTPException(404, "This post has expired")
    if not any(r["user_id"] == user["user_id"] for r in post.get("responders", [])):
        now = datetime.now(timezone.utc)
        await db.posts.update_one({"post_id": post_id}, {"$push": {"responders": {"user_id": user["user_id"], "at": now}}})
        lead = "I'm keen on your job" if post["type"] == "job" else "Saw you're looking for work"
        text = f"{lead}: \"{post['title']}\" ({pay_label(post.get('pay_min'), post.get('pay_max'))}). Give me a shout."
        await db.messages.insert_one({
            "message_id": f"msg_{uuid.uuid4().hex[:12]}", "from_id": user["user_id"], "to_id": post["user_id"],
            "participants": [user["user_id"], post["user_id"]], "conv_key": conv_key(user["user_id"], post["user_id"]),
            "text": text, "post_id": post_id, "created_at": now,
        })
        post = await db.posts.find_one({"post_id": post_id}, {"_id": 0})
    return (await _to_out([post], user, cmap, crew, dist))[0]


@router.delete("/{post_id}", response_model=dict)
async def close_post(post_id: str, user: dict = Depends(pro_user)):
    r = await db.posts.update_one({"post_id": post_id, "user_id": user["user_id"]},
                                  {"$set": {"closed": True, "closed_at": datetime.now(timezone.utc)}})
    if not r.matched_count:
        raise HTTPException(404, "Post not found")
    return {"ok": True}


@router.get("/by-user/{user_id}", response_model=List[PostOut])
async def posts_by_user(user_id: str, user: dict = Depends(pro_user)):
    """A member's board, if they're in my crew or nearby."""
    visible, dist = await _visible_author_ids(user)
    if user_id not in visible:
        return []
    posts = await db.posts.find({"user_id": user_id, **_active_filter()}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    cmap = await connection_map(user["user_id"])
    crew = {uid for uid, (st, _) in cmap.items() if st == "connected"}
    return await _to_out(posts, user, cmap, crew, dist, with_responders=user_id == user["user_id"])
