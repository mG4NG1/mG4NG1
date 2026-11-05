"""Iteration 3: Work board (posts) — options, create/validation, Pro gating, visibility (crew / 25 km),
keen (responder + auto chat message, idempotent), responders, close, by-user.
Uses test_token_1 (free), test_token_2 (lifetime Pro) and a TEST_ Pro user inserted directly in Mongo."""
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from pymongo import MongoClient


def _env(path, key):
    with open(path) as f:
        for line in f:
            if line.startswith(key + "="):
                return line.split("=", 1)[1].strip().strip('"')


BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or _env("/app/frontend/.env", "EXPO_PUBLIC_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
H1 = {"Authorization": "Bearer test_token_1"}
H2 = {"Authorization": "Bearer test_token_2"}
db = MongoClient(_env("/app/backend/.env", "MONGO_URL"))[_env("/app/backend/.env", "DB_NAME")]

UID3 = f"TEST_user_{uuid.uuid4().hex[:8]}"
TOK3 = f"TEST_tok_{uuid.uuid4().hex}"
H3 = {"Authorization": f"Bearer {TOK3}"}
created_posts: list = []


@pytest.fixture(scope="module", autouse=True)
def third_user():
    now = datetime.now(timezone.utc)
    t2_before = db.users.find_one({"user_id": "user_test2"}, {"_id": 0, "approx_lat": 1, "approx_lng": 1, "suburb": 1, "location_at": 1})
    db.users.insert_one({"user_id": UID3, "email": f"{UID3}@subbienet.test", "name": "TEST Third", "trade": "Carpenter",
                         "phone": "0412999333", "phone_key": "412999333", "profile_complete": True, "lifetime_pro": True,
                         "created_at": now})
    db.user_sessions.insert_one({"session_token": TOK3, "user_id": UID3, "expires_at": now + timedelta(days=1), "created_at": now})
    yield
    db.users.delete_one({"user_id": UID3})
    db.user_sessions.delete_one({"session_token": TOK3})
    db.connections.delete_many({"$or": [{"from_id": UID3}, {"to_id": UID3}]})
    db.messages.delete_many({"participants": UID3})
    for pid in created_posts:
        db.posts.delete_one({"post_id": pid})
    # restore user_test2 location state
    unset = {k: "" for k in ("approx_lat", "approx_lng", "suburb", "location_at") if k not in (t2_before or {})}
    upd = {}
    if unset:
        upd["$unset"] = unset
    keep = {k: v for k, v in (t2_before or {}).items()}
    if keep:
        upd["$set"] = keep
    if upd:
        db.users.update_one({"user_id": "user_test2"}, upd)


def _post(body, h=H2):
    r = requests.post(f"{API}/posts", json=body, headers=h)
    if r.status_code == 200:
        created_posts.append(r.json()["post_id"])
    return r


BASE = {"type": "job", "trade": "Plumber", "title": "TEST_ need a plumber", "details": "rough-in", "start": "Mon",
        "duration": "1 week", "pay_min": 50, "suburb": "Richmond"}


# --- options ---
def test_options():
    r = requests.get(f"{API}/posts/options", headers=H2)
    assert r.status_code == 200
    d = r.json()
    mins = [b["min"] for b in d["pay_bands"]]
    assert mins == list(range(20, 181, 10))
    assert all(b["max"] == b["min"] + 20 for b in d["pay_bands"])
    assert d["durations"] and "1 week" in d["durations"]
    assert "Plumber" in d["trades"]


# --- create + validation ---
def test_create_job_and_work():
    r = _post(BASE)
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["pay_min"] == 50 and p["pay_max"] == 70 and p["mine"] is True and p["keen_count"] == 0
    days = (datetime.fromisoformat(p["expires_at"].replace("Z", "+00:00")) - datetime.fromisoformat(p["created_at"].replace("Z", "+00:00"))).days
    assert 13 <= days <= 14
    r = _post({**BASE, "type": "work", "title": "TEST_ free next week", "pay_min": None})
    assert r.status_code == 200, r.text
    w = r.json()
    assert w["pay_min"] is None and w["pay_max"] is None
    hrs = (datetime.fromisoformat(w["expires_at"].replace("Z", "+00:00")) - datetime.fromisoformat(w["created_at"].replace("Z", "+00:00"))).total_seconds() / 3600
    assert 71 <= hrs <= 72.1


@pytest.mark.parametrize("patch", [{"pay_min": 25}, {"pay_min": 10}, {"pay_min": 190}, {"trade": "Astronaut"},
                                   {"title": "ab"}, {"duration": "forever"}, {"type": "gig"}])
def test_create_invalid(patch):
    r = _post({**BASE, **patch})
    assert r.status_code == 422, (patch, r.status_code, r.text)


def test_free_user_402():
    assert requests.get(f"{API}/posts", headers=H1).status_code == 402
    assert requests.post(f"{API}/posts", json=BASE, headers=H1).status_code == 402
    assert requests.get(f"{API}/posts/options", headers=H1).status_code == 402


def test_no_auth_401():
    assert requests.get(f"{API}/posts").status_code == 401


# --- visibility ---
def test_visibility_flow():
    pid = created_posts[0]
    # not crew, no location -> hidden
    r = requests.get(f"{API}/posts", headers=H3)
    assert r.status_code == 200
    assert not any(p["author"]["user_id"] == "user_test2" for p in r.json())
    assert requests.get(f"{API}/posts/{pid}", headers=H3).status_code == 403
    assert requests.post(f"{API}/posts/{pid}/keen", headers=H3).status_code == 403
    assert requests.get(f"{API}/posts/by-user/user_test2", headers=H3).json() == []

    # nearby ~5 km
    assert requests.post(f"{API}/location", json={"lat": -37.8136, "lng": 144.9631, "suburb": "Melbourne"}, headers=H2).status_code == 200
    assert requests.post(f"{API}/location", json={"lat": -37.8586, "lng": 144.9631, "suburb": "St Kilda"}, headers=H3).status_code == 200
    r = requests.get(f"{API}/posts", headers=H3)
    mine = [p for p in r.json() if p["post_id"] == pid]
    assert mine, "post should be visible to nearby Pro member"
    assert mine[0]["distance_km"] is not None and 3 <= mine[0]["distance_km"] <= 7
    assert mine[0]["is_crew"] is False and mine[0]["mine"] is False

    # far away (> 25 km) -> hidden again
    requests.post(f"{API}/location", json={"lat": -38.3, "lng": 144.9631}, headers=H3)
    assert not any(p["post_id"] == pid for p in requests.get(f"{API}/posts", headers=H3).json())

    # crew -> visible with is_crew
    r = requests.post(f"{API}/connections/request", json={"user_id": "user_test2"}, headers=H3)
    assert r.status_code == 200, r.text
    cid = r.json()["connection_id"]
    assert requests.post(f"{API}/connections/{cid}/respond", json={"accept": True}, headers=H2).status_code == 200
    r = requests.get(f"{API}/posts", headers=H3)
    mine = [p for p in r.json() if p["post_id"] == pid]
    assert mine and mine[0]["is_crew"] is True and mine[0]["distance_km"] is None
    # filters
    assert all(p["type"] == "work" for p in requests.get(f"{API}/posts?type=work", headers=H3).json())
    assert all(p["trade"] == "Plumber" for p in requests.get(f"{API}/posts?trade=Plumber", headers=H3).json())


# --- keen ---
def test_keen_flow():
    pid = created_posts[0]
    r = requests.post(f"{API}/posts/{pid}/keen", headers=H3)
    assert r.status_code == 200, r.text
    assert r.json()["keen"] is True and r.json()["keen_count"] == 1
    msgs = requests.get(f"{API}/messages/user_test2", headers=H3).json()
    assert any("TEST_ need a plumber" in m["text"] and "$50-70/hr" in m["text"] for m in msgs)
    r = requests.post(f"{API}/posts/{pid}/keen", headers=H3)
    assert r.json()["keen_count"] == 1
    msgs2 = requests.get(f"{API}/messages/user_test2", headers=H3).json()
    assert len(msgs2) == len(msgs), "repeated keen must not duplicate message"
    assert requests.post(f"{API}/posts/{pid}/keen", headers=H2).status_code == 400
    # poster sees responders
    d = requests.get(f"{API}/posts/{pid}", headers=H2).json()
    assert [x["user_id"] for x in d["responders"]] == [UID3]
    # non-poster does not see responders
    assert requests.get(f"{API}/posts/{pid}", headers=H3).json()["responders"] == []
    mine = requests.get(f"{API}/posts?mine=true", headers=H2).json()
    p = next(x for x in mine if x["post_id"] == pid)
    assert p["responders"] and p["responders"][0]["name"] == "TEST Third"
    # conversations for poster include third
    convs = requests.get(f"{API}/conversations", headers=H2).json()
    assert any(c["other"]["user_id"] == UID3 for c in convs)


def test_by_user():
    r = requests.get(f"{API}/posts/by-user/user_test2", headers=H3)
    assert r.status_code == 200
    ids = [p["post_id"] for p in r.json()]
    assert created_posts[0] in ids and created_posts[1] in ids


def test_close():
    pid = created_posts[0]
    assert requests.delete(f"{API}/posts/{pid}", headers=H3).status_code == 404
    r = requests.delete(f"{API}/posts/{pid}", headers=H2)
    assert r.status_code == 200 and r.json()["ok"] is True
    assert requests.get(f"{API}/posts/{pid}", headers=H2).status_code == 404
    assert not any(p["post_id"] == pid for p in requests.get(f"{API}/posts?mine=true", headers=H2).json())
    assert requests.post(f"{API}/posts/{pid}/keen", headers=H3).status_code == 404
    assert requests.delete(f"{API}/posts/post_doesnotexist", headers=H2).status_code == 404
