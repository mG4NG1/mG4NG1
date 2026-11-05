"""Idempotent seed of two test members + session tokens for API/UI testing."""
import asyncio
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent / ".env")

USERS = [("user_test1", "test_token_1", "Test Tester", "Electrician", "0412000001"),
         ("user_test2", "test_token_2", "Jack Mason", "Plumber", "0412000002")]


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    now = datetime.now(timezone.utc)
    for uid, tok, name, trade, phone in USERS:
        await db.users.update_one({"user_id": uid}, {"$set": {
            "user_id": uid, "email": f"{uid}@subbienet.test", "name": name, "trade": trade, "phone": phone,
            "phone_key": phone[-9:], "profile_complete": True, "sms_alerts": True},
            "$setOnInsert": {"created_at": now}}, upsert=True)
        await db.user_sessions.update_one({"session_token": tok}, {"$set": {
            "session_token": tok, "user_id": uid, "expires_at": now + timedelta(days=30), "created_at": now}}, upsert=True)
    print("seeded", [u[0] for u in USERS])


asyncio.run(main())
