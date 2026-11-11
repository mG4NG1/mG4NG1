import asyncio
import logging
import math
import os
import re
import secrets
import uuid
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel
from starlette.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from google.oauth2 import id_token as google_id_token
from google.auth.transport.requests import Request as GoogleAuthRequest

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import storage  # noqa: E402

MAX_PICTURE_BYTES = 5 * 1024 * 1024
REVENUECAT_API_KEY = (os.environ.get("REVENUECAT_API_KEY") or "").strip()
PRO_ENTITLEMENT = "pro"
PRO_CACHE_SECONDS = 60
_pro_cache: dict[str, tuple[float, bool]] = {}
# Accounts granted Pro for life (owner/VIP), comma-separated emails
LIFETIME_PRO_EMAILS = {e.strip().lower() for e in (os.environ.get("LIFETIME_PRO_EMAILS") or "").split(",") if e.strip()}


def has_lifetime_pro(user: dict) -> bool:
    return bool(user.get("lifetime_pro")) or (user.get("email") or "").lower() in LIFETIME_PRO_EMAILS


def full_user(doc: dict) -> "FullUser":
    return FullUser(**{**doc, "lifetime_pro": has_lifetime_pro(doc)})

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

GOOGLE_CLIENT_IDS = {v.strip() for v in os.environ.get("GOOGLE_CLIENT_IDS", "").split(",") if v.strip()}
NEARBY_RADIUS_KM = 25
LOCATION_MAX_AGE_HOURS = 24 * 7
TRADES = [
    "Electrician", "Carpenter", "Plumber", "Steelfixer", "Concreter", "Landscaper",
    "Machine Operator", "Bricklayer", "Labourer", "Tiler", "Painter", "Roofer",
    "Plasterer", "Scaffolder", "Welder", "Other",
]

INDEXES: dict[str, list[IndexModel]] = {
    "users": [
        IndexModel([("user_id", ASCENDING)], name="user_id", unique=True),
        IndexModel([("email", ASCENDING)], name="email", unique=True),
        IndexModel([("phone_key", ASCENDING)], name="phone_key"),
    ],
    "user_sessions": [
        IndexModel([("session_token", ASCENDING)], name="session_token", unique=True),
        IndexModel([("user_id", ASCENDING)], name="user_id"),
        IndexModel([("expires_at", ASCENDING)], name="expires_ttl", expireAfterSeconds=0),
    ],
    "connections": [
        IndexModel([("from_id", ASCENDING), ("to_id", ASCENDING)], name="pair", unique=True),
        IndexModel([("to_id", ASCENDING), ("status", ASCENDING)], name="to_status"),
        IndexModel([("from_id", ASCENDING), ("status", ASCENDING)], name="from_status"),
    ],
    "user_blocks": [IndexModel([("blocker_id", ASCENDING), ("blocked_id", ASCENDING)], name="pair", unique=True)],
    "moderation_reports": [IndexModel([("created_at", DESCENDING)], name="created_at")],
    "messages": [
        IndexModel([("conv_key", ASCENDING), ("created_at", ASCENDING)], name="conv_time"),
        IndexModel([("participants", ASCENDING), ("created_at", DESCENDING)], name="participants_time"),
    ],
    "crew_notices": [
        IndexModel([("notice_id", ASCENDING)], name="notice_id", unique=True),
        IndexModel([("expires_at", ASCENDING)], name="notices_ttl", expireAfterSeconds=0),
        IndexModel([("author_id", ASCENDING), ("created_at", DESCENDING)], name="author_time"),
    ],
    "files": [IndexModel([("path", ASCENDING)], name="path", unique=True)],
    "invites": [IndexModel([("from_id", ASCENDING), ("created_at", DESCENDING)], name="from_time")],
    "posts": [
        IndexModel([("post_id", ASCENDING)], name="post_id", unique=True),
        IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)], name="user_time"),
        IndexModel([("expires_at", ASCENDING)], name="expires"),
    ],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logging.getLogger(__name__).error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)


app = FastAPI()


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api = APIRouter(prefix="/api")


# ---------------- Models ----------------
class PublicUser(BaseModel):
    user_id: str
    name: str = ""
    picture: Optional[str] = None
    trade: Optional[str] = None
    business_name: Optional[str] = None
    bio: Optional[str] = None
    suburb: Optional[str] = None
    profile_complete: bool = False
    picture_kind: Optional[str] = None  # photo | logo
    phone_verified: bool = False


class FullUser(PublicUser):
    email: str
    phone: Optional[str] = None
    approx_lat: Optional[float] = None
    approx_lng: Optional[float] = None
    lifetime_pro: bool = False
    radar_visible: bool = False


class PersonOut(PublicUser):
    connection: str = "none"  # none | sent | received | connected
    connection_id: Optional[str] = None
    distance_km: Optional[float] = None


class NearbyPerson(PersonOut):
    approx_lat: float
    approx_lng: float


class CrewMember(PublicUser):
    phone: Optional[str] = None
    approx_lat: Optional[float] = None
    approx_lng: Optional[float] = None
    connection_id: str


class GoogleLoginIn(BaseModel):
    id_token: str = Field(min_length=50, max_length=8192)


class ProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    phone: str = Field(min_length=6, max_length=25)
    trade: str
    business_name: Optional[str] = Field(default=None, max_length=100)
    bio: Optional[str] = Field(default=None, max_length=300)


class LocationIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    suburb: Optional[str] = Field(default=None, max_length=80)


class RadarVisibilityIn(BaseModel):
    visible: bool


class ContactsIn(BaseModel):
    phones: List[str] = Field(max_length=5000)


class RequestIn(BaseModel):
    user_id: str


class RespondIn(BaseModel):
    accept: bool


class MessageIn(BaseModel):
    to_user_id: str
    text: str = Field(min_length=1, max_length=1000)


class PhoneIn(BaseModel):
    phone: str = Field(min_length=6, max_length=25)


class VerifyIn(PhoneIn):
    code: str = Field(min_length=4, max_length=10)


class InviteIn(BaseModel):
    phones: List[str] = Field(min_length=1, max_length=20)


class MessageOut(BaseModel):
    message_id: str
    from_id: str
    to_id: str
    text: str
    created_at: str


class ConversationOut(BaseModel):
    other: PublicUser
    last_text: str
    last_at: str
    last_from_me: bool


# ---------------- Helpers ----------------
def phone_key(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    return digits[-9:] if len(digits) >= 6 else ""


def approx(v: float) -> float:
    # ~2 km grid so exact positions are never stored
    return round(round(v / 0.02) * 0.02, 4)


def haversine(lat1, lng1, lat2, lng2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


async def ensure_not_blocked(a: str, b: str) -> None:
    blocked = await db.user_blocks.find_one({
        "$or": [
            {"blocker_id": a, "blocked_id": b},
            {"blocker_id": b, "blocked_id": a},
        ]
    }, {"_id": 1})
    if blocked:
        raise HTTPException(403, "Messaging and crew requests are unavailable between these members")


def conv_key(a: str, b: str) -> str:
    return "|".join(sorted([a, b]))


def iso(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


async def user_from_token(token: str) -> dict:
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(401, "Invalid session")
    exp = session["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(401, "Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user


async def current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(401, "Not authenticated")
    return await user_from_token(auth[7:].strip())


def first_name(u: dict) -> str:
    return (u.get("name") or "A contractor").split(" ")[0]


async def is_pro(user: dict) -> bool:
    """Server-side Pro check: lifetime grant, else RevenueCat entitlement 'pro' (cached briefly per user)."""
    import time
    if has_lifetime_pro(user):
        return True
    user_id = user["user_id"]
    hit = _pro_cache.get(user_id)
    now = time.monotonic()
    if hit and hit[0] > now:
        return hit[1]
    pro = False
    if REVENUECAT_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=8) as hc:
                r = await hc.get(f"https://api.revenuecat.com/v1/subscribers/{user_id}",
                                 headers={"Authorization": f"Bearer {REVENUECAT_API_KEY}", "X-Platform": "android"})
            if r.status_code in (200, 201):
                ent = r.json().get("subscriber", {}).get("entitlements", {}).get(PRO_ENTITLEMENT)
                if ent and ent.get("expires_date"):
                    pro = datetime.fromisoformat(ent["expires_date"].replace("Z", "+00:00")) > datetime.now(timezone.utc)
                elif ent:
                    pro = True
        except Exception as exc:
            logging.getLogger(__name__).warning("revenuecat check failed for %s: %s", user_id, exc)
            return False  # never reuse expired Pro cache after an entitlement check fails
    _pro_cache[user_id] = (now + PRO_CACHE_SECONDS, pro)
    return pro


async def pro_user(user: dict = Depends(current_user)) -> dict:
    if not await is_pro(user):
        raise HTTPException(402, "ChopOut Pro is required for this")
    return user


async def connection_map(me: str) -> dict:
    """other_user_id -> (status, connection_id)"""
    out = {}
    async for c in db.connections.find({"$or": [{"from_id": me}, {"to_id": me}]}, {"_id": 0}):
        other = c["to_id"] if c["from_id"] == me else c["from_id"]
        if c["status"] == "accepted":
            out[other] = ("connected", c["connection_id"])
        elif c["status"] == "pending":
            out[other] = ("sent" if c["from_id"] == me else "received", c["connection_id"])
    return out


def to_person(u: dict, cmap: dict, distance: Optional[float] = None) -> PersonOut:
    status, cid = cmap.get(u["user_id"], ("none", None))
    return PersonOut(**PublicUser(**u).model_dump(), connection=status, connection_id=cid,
                     distance_km=None if distance is None else round(distance, 1))


# ---------------- Auth ----------------
def verify_google_login(raw_token: str) -> dict:
    """Verify Google's cryptographic signature, expiry, issuer and expected OAuth client."""
    if not GOOGLE_CLIENT_IDS:
        raise HTTPException(503, "Google sign-in has not been configured on the server")
    try:
        claims = google_id_token.verify_oauth2_token(raw_token, GoogleAuthRequest())
    except Exception:
        raise HTTPException(401, "Google sign-in token is invalid or expired")
    if claims.get("aud") not in GOOGLE_CLIENT_IDS:
        raise HTTPException(401, "Google sign-in token has the wrong audience")
    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(401, "Google sign-in issuer is invalid")
    if claims.get("email_verified") not in (True, "true"):
        raise HTTPException(401, "Google account email is not verified")
    if not claims.get("sub") or not claims.get("email"):
        raise HTTPException(401, "Google account is missing required information")
    return claims


@api.post("/auth/google")
async def auth_google(body: GoogleLoginIn):
    data = await run_in_threadpool(verify_google_login, body.id_token)
    email = data["email"].strip().lower()
    google_sub = data["sub"]
    now = datetime.now(timezone.utc)
    # Match a previously registered Google account by its verified email so
    # users keep their crew connections and RevenueCat user_id after migration.
    existing = await db.users.find_one({"google_sub": google_sub}, {"_id": 0})
    if not existing:
        existing = await db.users.find_one({"email": email}, {"_id": 0})
        if existing and existing.get("google_sub") not in (None, google_sub):
            raise HTTPException(409, "This email belongs to another Google account")
    if existing:
        user_id = existing["user_id"]
        update = {"google_sub": google_sub}
        # Preserve a profile photo previously uploaded by the user.
        if not existing.get("picture_path") and data.get("picture"):
            update["picture"] = data["picture"]
        await db.users.update_one({"user_id": user_id}, {"$set": update})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "google_sub": google_sub, "email": email,
            "name": data.get("name") or "", "picture": data.get("picture"),
            "profile_complete": False, "created_at": now,
        })
    token = secrets.token_urlsafe(48)
    await db.user_sessions.insert_one({
        "session_token": token, "user_id": user_id,
        "expires_at": now + timedelta(days=7), "created_at": now,
    })
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"session_token": token, "user": full_user(user).model_dump()}


@api.get("/auth/me", response_model=FullUser)
async def me(user: dict = Depends(current_user)):
    return full_user(user)


@api.post("/auth/logout")
async def logout(request: Request, user: dict = Depends(current_user)):
    token = request.headers.get("Authorization", "")[7:].strip()
    await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


class DeleteAccountIn(BaseModel):
    confirmation: str


@api.post("/account/delete")
async def delete_account(body: DeleteAccountIn, user: dict = Depends(current_user)):
    """Delete an authenticated account and its live-service data.

    Subscription cancellation is separate and remains handled by Google Play.
    Backups and any legally required moderation records need their own retention policy.
    """
    if body.confirmation != "DELETE":
        raise HTTPException(422, "Enter DELETE to confirm account deletion")
    uid = user["user_id"]
    photo = user.get("picture_path")
    # Delete associated live records before removing the user account.
    await db.user_sessions.delete_many({"user_id": uid})
    await db.messages.delete_many({"participants": uid})
    await db.connections.delete_many({"$or": [{"from_id": uid}, {"to_id": uid}]})
    await db.crew_notices.delete_many({"author_id": uid})
    await db.posts.delete_many({"user_id": uid})
    await db.user_blocks.delete_many({"$or": [{"blocker_id": uid}, {"blocked_id": uid}]})
    await db.invites.delete_many({"from_id": uid})
    await db.files.delete_many({"user_id": uid})
    if photo:
        await db.files.delete_many({"path": photo})
        try:
            await storage.delete_object(db, photo)
        except Exception as exc:
            logger.warning("Could not remove account image from storage: %s", exc)
    await db.users.delete_one({"user_id": uid})
    return {"ok": True}


# ---------------- Profile ----------------
@api.get("/trades")
async def trades():
    return TRADES


@api.put("/profile", response_model=FullUser)
async def update_profile(body: ProfileIn, user: dict = Depends(current_user)):
    if body.trade not in TRADES:
        raise HTTPException(422, "Unknown trade")
    key = phone_key(body.phone)
    if not key:
        raise HTTPException(422, "Enter a valid mobile number")
    update = {
        "name": body.name.strip(), "phone": body.phone.strip(), "phone_key": key, "trade": body.trade,
        "bio": (body.bio or "").strip() or None,
        "profile_complete": True,
    }
    if body.business_name is not None and await is_pro(user):
        update["business_name"] = body.business_name.strip() or None  # business profile is a Pro feature
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": update})
    return full_user(await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0}))


# ---------------- Display picture (portrait photo or business logo) ----------------
@api.post("/profile/picture", response_model=FullUser)
async def upload_picture(file: UploadFile = File(...), kind: str = Form("photo"), user: dict = Depends(current_user)):
    if kind not in ("photo", "logo"):
        raise HTTPException(422, "kind must be photo or logo")
    ctype = (file.content_type or "").lower()
    if not ctype.startswith("image/"):
        raise HTTPException(422, "Please choose an image")
    data = await file.read()
    if not data:
        raise HTTPException(422, "Empty file")
    if len(data) > MAX_PICTURE_BYTES:
        raise HTTPException(413, "Image is too large (max 5 MB)")
    ext = {"image/png": "png", "image/webp": "webp", "image/gif": "gif"}.get(ctype, "jpg")
    path = f"{storage.APP_NAME}/uploads/{user['user_id']}/{uuid.uuid4().hex}.{ext}"
    try:
        await storage.put_object(db, path, data, ctype)
    except storage.StorageError as exc:
        raise HTTPException(exc.status, str(exc))
    except Exception as exc:
        logging.getLogger(__name__).error("upload_picture: %s", exc)
        raise HTTPException(502, "Couldn't save the photo. Please try again.")
    if user.get("picture_path"):
        await db.files.update_one({"path": user["picture_path"]}, {"$set": {"removed": True, "removed_at": datetime.now(timezone.utc)}})
    await db.files.insert_one({"path": path, "owner_id": user["user_id"], "content_type": ctype, "size": len(data),
                               "created_at": datetime.now(timezone.utc)})
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {
        "picture": f"/api/files/{path}", "picture_kind": kind, "picture_path": path}})
    return full_user(await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0}))


@api.delete("/profile/picture", response_model=FullUser)
async def remove_picture(user: dict = Depends(current_user)):
    if user.get("picture_path"):
        await db.files.update_one({"path": user["picture_path"]}, {"$set": {"removed": True, "removed_at": datetime.now(timezone.utc)}})
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"picture": None, "picture_kind": None, "picture_path": None}})
    return full_user(await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0}))


@api.get("/files/{path:path}")
async def get_file(path: str, request: Request, token: Optional[str] = None):
    # Pictures are visible to any signed-in member. Web <img> can't send headers, so a ?token= is accepted too.
    auth = request.headers.get("Authorization", "")
    tok = auth[7:].strip() if auth.lower().startswith("bearer ") else (token or "")
    if not tok:
        raise HTTPException(401, "Not authenticated")
    await user_from_token(tok)
    rec = await db.files.find_one({"path": path, "removed": {"$ne": True}}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "File not found")
    try:
        content, ctype = await storage.get_object(db, path)
    except storage.StorageError as exc:
        raise HTTPException(exc.status, str(exc))
    return Response(content=content, media_type=rec.get("content_type") or ctype,
                    headers={"Cache-Control": "private, max-age=86400"})


@api.post("/location", response_model=FullUser)
async def update_location(body: LocationIn, user: dict = Depends(current_user)):
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {
        "approx_lat": approx(body.lat), "approx_lng": approx(body.lng),
        "suburb": body.suburb, "location_at": datetime.now(timezone.utc),
    }})
    return full_user(await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0}))


@api.put("/location/visibility", response_model=FullUser)
async def set_radar_visibility(body: RadarVisibilityIn, user: dict = Depends(current_user)):
    if body.visible and user.get("approx_lat") is None:
        raise HTTPException(400, "Share your approximate area before enabling Radar")
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"radar_visible": body.visible}})
    return full_user(await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0}))


@api.get("/users/{user_id}", response_model=PersonOut)
async def get_user(user_id: str, user: dict = Depends(current_user)):
    u = await db.users.find_one({"user_id": user_id, "profile_complete": True}, {"_id": 0})
    if not u:
        raise HTTPException(404, "User not found")
    return to_person(u, await connection_map(user["user_id"]))


# ---------------- Find people ----------------
@api.get("/search", response_model=List[PersonOut])
async def search(q: str = Query("", max_length=60), trade: Optional[str] = None, user: dict = Depends(pro_user)):
    flt: dict = {"profile_complete": True, "user_id": {"$ne": user["user_id"]}}
    q = q.strip()
    if q:
        key = phone_key(q)
        ors = [{"name": {"$regex": re.escape(q), "$options": "i"}},
               {"business_name": {"$regex": re.escape(q), "$options": "i"}}]
        if key:
            ors.append({"phone_key": key})
        flt["$or"] = ors
    if trade:
        flt["trade"] = trade
    users = await db.users.find(flt, {"_id": 0}).limit(50).to_list(50)
    cmap = await connection_map(user["user_id"])
    return [to_person(u, cmap) for u in users]


@api.post("/contacts/match", response_model=List[PersonOut])
async def match_contacts(body: ContactsIn, user: dict = Depends(pro_user)):
    keys = list({k for k in (phone_key(p) for p in body.phones) if k})
    if not keys:
        return []
    users = await db.users.find(
        {"phone_key": {"$in": keys}, "profile_complete": True, "user_id": {"$ne": user["user_id"]}}, {"_id": 0}
    ).to_list(500)
    cmap = await connection_map(user["user_id"])
    return [to_person(u, cmap) for u in users]


@api.post("/contacts/check")
async def check_contacts(body: ContactsIn, user: dict = Depends(pro_user)):
    """Which of these numbers already belong to members (last-9-digit keys only). Used to build the invite list."""
    keys = list({k for k in (phone_key(p) for p in body.phones) if k})
    if not keys:
        return {"member_keys": []}
    found = await db.users.distinct("phone_key", {"phone_key": {"$in": keys}, "profile_complete": True})
    return {"member_keys": found}


@api.get("/nearby", response_model=List[NearbyPerson])
async def nearby(trade: Optional[str] = None, user: dict = Depends(pro_user)):
    if user.get("approx_lat") is None:
        raise HTTPException(400, "Share your area first")
    if not user.get("trade"):
        raise HTTPException(400, "Choose your trade in your profile first")
    lat, lng = user["approx_lat"], user["approx_lng"]
    dlat = NEARBY_RADIUS_KM / 111.0
    dlng = NEARBY_RADIUS_KM / (111.0 * max(math.cos(math.radians(lat)), 0.01))
    flt: dict = {
        "user_id": {"$ne": user["user_id"]}, "profile_complete": True,
        "radar_visible": True,
        "location_at": {"$gte": datetime.now(timezone.utc) - timedelta(hours=LOCATION_MAX_AGE_HOURS)},
        "trade": user.get("trade"),
        "approx_lat": {"$gte": lat - dlat, "$lte": lat + dlat},
        "approx_lng": {"$gte": lng - dlng, "$lte": lng + dlng},
    }
    # Radar displays the viewer\u0027s own profession only.
    users = await db.users.find(flt, {"_id": 0}).limit(300).to_list(300)
    cmap = await connection_map(user["user_id"])
    res = []
    for u in users:
        d = haversine(lat, lng, u["approx_lat"], u["approx_lng"])
        if d <= NEARBY_RADIUS_KM:
            res.append(NearbyPerson(**to_person(u, cmap, d).model_dump(), approx_lat=u["approx_lat"], approx_lng=u["approx_lng"]))
    res.sort(key=lambda p: p.distance_km or 0)
    return res


# ---------------- Connections ----------------
@api.post("/connections/request", response_model=PersonOut)
async def send_request(body: RequestIn, user: dict = Depends(pro_user)):
    me_id = user["user_id"]
    if body.user_id == me_id:
        raise HTTPException(400, "You can't add yourself")
    await ensure_not_blocked(me_id, body.user_id)
    other = await db.users.find_one({"user_id": body.user_id, "profile_complete": True}, {"_id": 0})
    if not other:
        raise HTTPException(404, "User not found")
    reverse = await db.connections.find_one({"from_id": body.user_id, "to_id": me_id}, {"_id": 0})
    if reverse and reverse["status"] == "pending":
        await db.connections.update_one({"connection_id": reverse["connection_id"]},
                                        {"$set": {"status": "accepted", "responded_at": datetime.now(timezone.utc)}})
    elif not reverse or reverse["status"] != "accepted":
        existing = await db.connections.find_one({"from_id": me_id, "to_id": body.user_id}, {"_id": 0, "status": 1})
        await db.connections.update_one(
            {"from_id": me_id, "to_id": body.user_id},
            {"$set": {"status": "pending", "created_at": datetime.now(timezone.utc)},
             "$setOnInsert": {"connection_id": f"conn_{uuid.uuid4().hex[:12]}"}},
            upsert=True,
        )
    return to_person(other, await connection_map(me_id))


@api.get("/connections/requests", response_model=List[PersonOut])
async def incoming_requests(user: dict = Depends(current_user)):
    conns = await db.connections.find({"to_id": user["user_id"], "status": "pending"}, {"_id": 0}).to_list(500)
    ids = [c["from_id"] for c in conns]
    users = {u["user_id"]: u async for u in db.users.find({"user_id": {"$in": ids}}, {"_id": 0})}
    cmap = await connection_map(user["user_id"])
    return [to_person(users[i], cmap) for i in ids if i in users]


@api.post("/connections/{connection_id}/respond")
async def respond(connection_id: str, body: RespondIn, user: dict = Depends(current_user)):
    c = await db.connections.find_one({"connection_id": connection_id, "to_id": user["user_id"], "status": "pending"})
    if not c:
        raise HTTPException(404, "Request not found")
    await db.connections.update_one({"connection_id": connection_id}, {"$set": {
        "status": "accepted" if body.accept else "declined", "responded_at": datetime.now(timezone.utc)}})
    return {"ok": True, "status": "accepted" if body.accept else "declined"}


@api.get("/connections", response_model=List[CrewMember])
async def crew(user: dict = Depends(pro_user)):
    me_id = user["user_id"]
    conns = await db.connections.find(
        {"$or": [{"from_id": me_id}, {"to_id": me_id}], "status": "accepted"}, {"_id": 0}).to_list(2000)
    cid = {(c["to_id"] if c["from_id"] == me_id else c["from_id"]): c["connection_id"] for c in conns}
    users = await db.users.find({"user_id": {"$in": list(cid)}}, {"_id": 0}).to_list(2000)
    users.sort(key=lambda u: (u.get("trade") or "", u.get("name") or ""))
    return [CrewMember(**u, connection_id=cid[u["user_id"]]) for u in users]


@api.get("/connections/stats")
async def crew_stats(user: dict = Depends(current_user)):
    me_id = user["user_id"]
    return {
        "crew": await db.connections.count_documents({"$or": [{"from_id": me_id}, {"to_id": me_id}], "status": "accepted"}),
        "sent_pending": await db.connections.count_documents({"from_id": me_id, "status": "pending"}),
        "incoming": await db.connections.count_documents({"to_id": me_id, "status": "pending"}),
    }


@api.delete("/connections/{connection_id}")
async def remove_connection(connection_id: str, user: dict = Depends(current_user)):
    me_id = user["user_id"]
    r = await db.connections.update_one(
        {"connection_id": connection_id, "$or": [{"from_id": me_id}, {"to_id": me_id}]},
        {"$set": {"status": "removed", "removed_at": datetime.now(timezone.utc)}},
    )
    if not r.matched_count:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# ---------------- Messages ----------------
@api.post("/messages", response_model=MessageOut)
async def send_message(body: MessageIn, user: dict = Depends(current_user)):
    if body.to_user_id == user["user_id"]:
        raise HTTPException(400, "Can't message yourself")
    if not await db.users.find_one({"user_id": body.to_user_id}, {"_id": 1}):
        raise HTTPException(404, "User not found")
    key = conv_key(user["user_id"], body.to_user_id)
    await ensure_not_blocked(user["user_id"], body.to_user_id)
    if not await is_pro(user):
        # Free members can only reply to someone who has messaged them first
        if not await db.messages.find_one({"conv_key": key, "from_id": body.to_user_id}, {"_id": 1}):
            raise HTTPException(402, "Upgrade to Pro to start new chats")
    msg = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}", "from_id": user["user_id"], "to_id": body.to_user_id,
        "participants": [user["user_id"], body.to_user_id], "conv_key": key,
        "text": body.text.strip(), "created_at": datetime.now(timezone.utc),
    }
    await db.messages.insert_one(dict(msg))
    return MessageOut(**{**msg, "created_at": iso(msg["created_at"])})


@api.get("/messages/{other_id}", response_model=List[MessageOut])
async def get_messages(other_id: str, user: dict = Depends(current_user)):
    msgs = await db.messages.find({"conv_key": conv_key(user["user_id"], other_id)}, {"_id": 0}) \
        .sort("created_at", 1).limit(500).to_list(500)
    return [MessageOut(**{**m, "created_at": iso(m["created_at"])}) for m in msgs]


@api.get("/conversations", response_model=List[ConversationOut])
async def conversations(user: dict = Depends(current_user)):
    me_id = user["user_id"]
    pipeline = [
        {"$match": {"participants": me_id}},
        {"$sort": {"created_at": -1}},
        {"$group": {"_id": "$conv_key", "last": {"$first": "$$ROOT"}}},
        {"$sort": {"last.created_at": -1}},
        {"$limit": 100},
    ]
    rows = await db.messages.aggregate(pipeline).to_list(100)
    others = [(r["last"]["to_id"] if r["last"]["from_id"] == me_id else r["last"]["from_id"]) for r in rows]
    users = {u["user_id"]: u async for u in db.users.find({"user_id": {"$in": others}}, {"_id": 0})}
    out = []
    for r, oid in zip(rows, others):
        if oid in users:
            last = r["last"]
            out.append(ConversationOut(other=PublicUser(**users[oid]), last_text=last["text"],
                                       last_at=iso(last["created_at"]), last_from_me=last["from_id"] == me_id))
    return out


app.include_router(api)

import noticeboard  # noqa: E402
app.include_router(noticeboard.router, prefix="/api")

import safety  # noqa: E402
app.include_router(safety.router, prefix="/api")

import posts  # noqa: E402  (imports from this module; must come after the definitions above)

api_posts = posts.router
app.include_router(api_posts, prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def start_index_build():
    app.state.index_task = asyncio.create_task(ensure_indexes())


@app.on_event("shutdown")
async def shutdown_db_client():
    app.state.index_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    client.close()
