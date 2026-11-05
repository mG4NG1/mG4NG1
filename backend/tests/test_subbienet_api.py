"""SubbieNet API regression tests: auth/me, display picture, SMS (Twilio unconfigured), invites, profile, search,
connections, messages, nearby. Uses seeded tokens test_token_1 (Test Tester) and test_token_2 (Jack Mason)."""
import base64
import os
import struct
import zlib

import pytest
import requests


def _load_base_url():
    url = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
    if not url:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    url = line.split("=", 1)[1].strip().strip('"')
    return url.rstrip("/")


BASE_URL = _load_base_url()
API = f"{BASE_URL}/api"
H1 = {"Authorization": "Bearer test_token_1"}
H2 = {"Authorization": "Bearer test_token_2"}


def tiny_png() -> bytes:
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    raw = b"\x00\xff\x00\x00"
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


# ---------- Auth ----------
class TestAuth:
    def test_me_has_new_fields(self):
        r = requests.get(f"{API}/auth/me", headers=H1)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["user_id"] == "user_test1"
        for k in ("picture_kind", "phone_verified", "sms_alerts"):
            assert k in d
        assert isinstance(d["phone_verified"], bool)
        assert isinstance(d["sms_alerts"], bool)
        assert "_id" not in d

    def test_me_unauth(self):
        assert requests.get(f"{API}/auth/me").status_code == 401
        assert requests.get(f"{API}/auth/me", headers={"Authorization": "Bearer nope"}).status_code == 401


# ---------- Display picture ----------
class TestPicture:
    def test_upload_fetch_delete(self):
        files = {"file": ("logo.png", tiny_png(), "image/png")}
        r = requests.post(f"{API}/profile/picture", headers=H1, files=files, data={"kind": "logo"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["picture"].startswith("/api/files/")
        assert d["picture_kind"] == "logo"
        path = d["picture"]

        g = requests.get(f"{BASE_URL}{path}", params={"token": "test_token_2"})
        assert g.status_code == 200, g.text
        assert g.headers["content-type"].startswith("image/png")
        assert g.content == tiny_png()

        assert requests.get(f"{BASE_URL}{path}", headers=H2).status_code == 200
        assert requests.get(f"{BASE_URL}{path}").status_code == 401
        assert requests.get(f"{BASE_URL}{path}", params={"token": "bad"}).status_code == 401
        assert requests.get(f"{API}/files/subbienet/uploads/nope.png", headers=H1).status_code == 404

        dl = requests.delete(f"{API}/profile/picture", headers=H1)
        assert dl.status_code == 200
        assert dl.json()["picture"] is None and dl.json()["picture_kind"] is None
        assert requests.get(f"{API}/auth/me", headers=H1).json()["picture"] is None

        # leave a logo in place for UI tests
        r2 = requests.post(f"{API}/profile/picture", headers=H1,
                           files={"file": ("logo.png", tiny_png(), "image/png")}, data={"kind": "logo"})
        assert r2.status_code == 200

    def test_invalid_kind(self):
        r = requests.post(f"{API}/profile/picture", headers=H1,
                          files={"file": ("a.png", tiny_png(), "image/png")}, data={"kind": "invalid"})
        assert r.status_code == 422

    def test_non_image(self):
        r = requests.post(f"{API}/profile/picture", headers=H1,
                          files={"file": ("a.txt", b"hello", "text/plain")}, data={"kind": "photo"})
        assert r.status_code == 422
        assert "image" in r.json()["detail"].lower()

    def test_upload_unauth(self):
        r = requests.post(f"{API}/profile/picture", files={"file": ("a.png", tiny_png(), "image/png")})
        assert r.status_code == 401


# ---------- SMS (Twilio intentionally not configured) ----------
class TestSms:
    def test_status(self):
        r = requests.get(f"{API}/sms/status")
        assert r.status_code == 200
        assert r.json() == {"messaging": False, "verify": False}

    def test_send_code_503(self):
        r = requests.post(f"{API}/phone/send-code", headers=H1, json={"phone": "0412000001"})
        assert r.status_code == 503
        assert r.json()["detail"] == "Text messaging isn't set up yet"

    def test_verify_503(self):
        r = requests.post(f"{API}/phone/verify", headers=H1, json={"phone": "0412000001", "code": "123456"})
        assert r.status_code == 503
        assert r.json()["detail"] == "Text messaging isn't set up yet"

    def test_invites(self):
        r = requests.post(f"{API}/invites", headers=H1, json={"phones": ["0412999999", "0412000002"]})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["sent"] == 0
        assert d["results"][0]["ok"] is False and d["results"][0]["error"] == "Text messaging isn't set up yet"
        assert d["results"][1]["ok"] is False and d["results"][1]["error"] == "Already on SubbieNet"
        assert isinstance(d["remaining_today"], int)

    def test_invites_empty_list_422(self):
        assert requests.post(f"{API}/invites", headers=H1, json={"phones": []}).status_code == 422

    def test_contacts_check(self):
        r = requests.post(f"{API}/contacts/check", headers=H1, json={"phones": ["0412999999", "+61 412 000 002"]})
        assert r.status_code == 200
        assert r.json()["member_keys"] == ["412000002"]

    def test_settings_toggle(self):
        r = requests.put(f"{API}/settings", headers=H1, json={"sms_alerts": False})
        assert r.status_code == 200 and r.json()["sms_alerts"] is False
        assert requests.get(f"{API}/auth/me", headers=H1).json()["sms_alerts"] is False
        r = requests.put(f"{API}/settings", headers=H1, json={"sms_alerts": True})
        assert r.json()["sms_alerts"] is True


# ---------- Profile ----------
class TestProfile:
    def test_phone_change_resets_verified(self):
        base = {"name": "Test Tester", "trade": "Electrician"}
        r = requests.put(f"{API}/profile", headers=H1, json={**base, "phone": "0412999998"})
        assert r.status_code == 200, r.text
        assert r.json()["phone_verified"] is False and r.json()["phone"] == "0412999998"
        r = requests.put(f"{API}/profile", headers=H1, json={**base, "phone": "0412000001"})
        assert r.status_code == 200 and r.json()["phone"] == "0412000001"

    def test_profile_validation(self):
        assert requests.put(f"{API}/profile", headers=H1,
                            json={"name": "X", "phone": "0412000001", "trade": "Astronaut"}).status_code == 422


# ---------- Search / connections / messages ----------
class TestSocial:
    def test_search_jack(self):
        r = requests.get(f"{API}/search", headers=H1, params={"q": "Jack"})
        assert r.status_code == 200
        names = [p["name"] for p in r.json()]
        assert "Jack Mason" in names
        jack = next(p for p in r.json() if p["name"] == "Jack Mason")
        assert "phone" not in jack  # phone not exposed in search

    def test_request_accept_flow(self):
        r = requests.post(f"{API}/connections/request", headers=H2, json={"user_id": "user_test1"})
        assert r.status_code == 200, r.text
        assert r.json()["connection"] in ("sent", "connected")
        reqs = requests.get(f"{API}/connections/requests", headers=H1)
        assert reqs.status_code == 200
        jack = next((p for p in reqs.json() if p["user_id"] == "user_test2"), None)
        assert jack is not None and jack["connection"] == "received"
        cid = jack["connection_id"]
        acc = requests.post(f"{API}/connections/{cid}/respond", headers=H1, json={"accept": True})
        assert acc.status_code == 200 and acc.json()["status"] == "accepted"
        crew1 = requests.get(f"{API}/connections", headers=H1).json()
        assert any(c["user_id"] == "user_test2" for c in crew1)
        crew2 = requests.get(f"{API}/connections", headers=H2).json()
        assert any(c["user_id"] == "user_test1" for c in crew2)
        # respond twice -> 404
        assert requests.post(f"{API}/connections/{cid}/respond", headers=H1, json={"accept": True}).status_code == 404
        # restore pending state for UI tests: remove then re-request
        assert requests.delete(f"{API}/connections/{cid}", headers=H1).status_code == 200
        r = requests.post(f"{API}/connections/request", headers=H2, json={"user_id": "user_test1"})
        assert r.json()["connection"] == "sent"

    def test_cannot_add_self(self):
        assert requests.post(f"{API}/connections/request", headers=H1, json={"user_id": "user_test1"}).status_code == 400

    def test_messages_and_conversations(self):
        r = requests.post(f"{API}/messages", headers=H1, json={"to_user_id": "user_test2", "text": "TEST_hello"})
        assert r.status_code == 200, r.text
        mid = r.json()["message_id"]
        pytest.created_message_ids = getattr(pytest, "created_message_ids", []) + [mid]
        convs = requests.get(f"{API}/conversations", headers=H1)
        assert convs.status_code == 200
        c = next(c for c in convs.json() if c["other"]["user_id"] == "user_test2")
        assert c["last_text"] == "TEST_hello" and c["last_from_me"] is True
        msgs = requests.get(f"{API}/messages/user_test1", headers=H2).json()
        assert any(m["message_id"] == mid for m in msgs)

    def test_nearby(self):
        r = requests.get(f"{API}/nearby", headers=H1)
        assert r.status_code == 400 and r.json()["detail"] == "Share your area first"
        assert requests.post(f"{API}/location", headers=H2, json={"lat": -33.87, "lng": 151.21, "suburb": "TEST_Sydney"}).status_code == 200
        loc = requests.post(f"{API}/location", headers=H1, json={"lat": -33.88, "lng": 151.20, "suburb": "TEST_Sydney"})
        assert loc.status_code == 200 and loc.json()["approx_lat"] is not None
        n = requests.get(f"{API}/nearby", headers=H1)
        assert n.status_code == 200
        jack = next((p for p in n.json() if p["user_id"] == "user_test2"), None)
        assert jack is not None and jack["distance_km"] is not None and jack["distance_km"] <= 25


# ---------- restore seeded test users to original state (only fields this suite touches) ----------
@pytest.fixture(scope="module", autouse=True)
def _restore_test_users():
    from dotenv import dotenv_values
    from pymongo import MongoClient
    env = dotenv_values("/app/backend/.env")
    db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
    unset = {"approx_lat": "", "approx_lng": "", "suburb": "", "location_at": ""}
    db.users.update_many({"user_id": {"$in": ["user_test1", "user_test2"]}}, {"$unset": unset})
    yield
    db.users.update_many({"user_id": {"$in": ["user_test1", "user_test2"]}}, {"$unset": unset})
    ids = getattr(pytest, "created_message_ids", [])
    if ids:
        db.messages.delete_many({"message_id": {"$in": ids}})
