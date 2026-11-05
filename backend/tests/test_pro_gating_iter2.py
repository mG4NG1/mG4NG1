"""Iteration 2: server-side Pro gating (free user), free-user reply-only chat, business_name gating,
picture removal 404s old file. Uses seeded tokens test_token_1 / test_token_2 (both free) and a TEST_ user inserted directly."""
import os
import struct
import uuid
import zlib
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


def tiny_png() -> bytes:
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"\x00\xff\x00\x00")) + chunk(b"IEND", b""))


@pytest.fixture(scope="module")
def stranger():
    """A TEST_ member (complete profile) who has never messaged user_test1."""
    uid = f"user_TEST_{uuid.uuid4().hex[:8]}"
    tok = f"TEST_tok_{uuid.uuid4().hex}"
    db.users.insert_one({"user_id": uid, "email": f"{uid}@subbienet.test", "name": "TEST_ Stranger", "trade": "Tiler",
                         "phone": "0499" + uid[-6:].replace("_", "0")[:6], "profile_complete": True})
    db.user_sessions.insert_one({"session_token": tok, "user_id": uid,
                                 "expires_at": datetime.now(timezone.utc) + timedelta(days=1)})
    yield {"user_id": uid, "token": tok}
    key = "|".join(sorted(["user_test1", uid]))
    db.messages.delete_many({"conv_key": key})
    db.user_sessions.delete_one({"session_token": tok})
    db.users.delete_one({"user_id": uid})


# ---------- Pro gating ----------
class TestProGating:
    def test_nearby_402_for_free(self):
        r = requests.get(f"{API}/nearby", headers=H1)
        assert r.status_code == 402, r.text
        assert "Pro" in r.json()["detail"]

    def test_connections_402_for_free(self):
        r = requests.get(f"{API}/connections", headers=H1)
        assert r.status_code == 402, r.text

    def test_connections_stats_still_free(self):
        r = requests.get(f"{API}/connections/stats", headers=H1)
        assert r.status_code == 200 and "crew" in r.json()

    def test_start_new_chat_402(self, stranger):
        r = requests.post(f"{API}/messages", headers=H1, json={"to_user_id": stranger["user_id"], "text": "TEST_ hi"})
        assert r.status_code == 402, r.text
        assert r.json()["detail"] == "Upgrade to Pro to start new chats"

    def test_reply_allowed_after_incoming(self, stranger):
        uid = stranger["user_id"]
        key = "|".join(sorted(["user_test1", uid]))
        db.messages.insert_one({"message_id": f"msg_TEST_{uuid.uuid4().hex[:8]}", "from_id": uid, "to_id": "user_test1",
                                "participants": [uid, "user_test1"], "conv_key": key, "text": "TEST_ hello from stranger",
                                "created_at": datetime.now(timezone.utc)})
        r = requests.post(f"{API}/messages", headers=H1, json={"to_user_id": uid, "text": "TEST_ reply"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["from_id"] == "user_test1" and d["to_id"] == uid and d["text"] == "TEST_ reply"
        msgs = requests.get(f"{API}/messages/{uid}", headers=H1).json()
        assert [m["text"] for m in msgs][-2:] == ["TEST_ hello from stranger", "TEST_ reply"]

    def test_stranger_also_free_cannot_continue_without_incoming(self, stranger):
        # stranger now has an incoming message from user_test1 -> stranger can reply too
        r = requests.post(f"{API}/messages", headers={"Authorization": f"Bearer {stranger['token']}"},
                          json={"to_user_id": "user_test1", "text": "TEST_ second"})
        assert r.status_code == 200, r.text

    def test_business_name_ignored_for_free(self):
        me = requests.get(f"{API}/auth/me", headers=H1).json()
        body = {"name": me["name"], "phone": me["phone"], "trade": me["trade"], "bio": me.get("bio"),
                "business_name": "TEST_ Biz Pty Ltd"}
        r = requests.put(f"{API}/profile", headers=H1, json=body)
        assert r.status_code == 200, r.text
        assert r.json()["business_name"] is None
        assert requests.get(f"{API}/auth/me", headers=H1).json()["business_name"] is None


# ---------- Picture removal ----------
class TestPictureRemoval:
    def test_delete_picture_then_old_file_404(self):
        r = requests.post(f"{API}/profile/picture", headers=H1, data={"kind": "photo"},
                          files={"file": ("p.png", tiny_png(), "image/png")})
        assert r.status_code == 200, r.text
        pic = r.json()["picture"]
        assert pic.startswith("/api/files/")
        ok = requests.get(f"{BASE_URL}{pic}?token=test_token_1")
        assert ok.status_code == 200 and ok.content[:4] == b"\x89PNG"
        d = requests.delete(f"{API}/profile/picture", headers=H1)
        assert d.status_code == 200 and d.json()["picture"] is None and d.json()["picture_kind"] is None
        gone = requests.get(f"{BASE_URL}{pic}?token=test_token_1")
        assert gone.status_code == 404, gone.text
        gone2 = requests.get(f"{BASE_URL}{pic}", headers=H2)
        assert gone2.status_code == 404
