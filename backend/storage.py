"""Emergent Managed Object Storage (profile photos / business logos). Sync helpers — use run_in_threadpool."""
import logging
import os

import requests

logger = logging.getLogger(__name__)

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
APP_NAME = "subbienet"

_storage_key: str | None = None


class StorageError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def init_storage() -> str:
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": os.environ.get("EMERGENT_LLM_KEY")}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _reset_key():
    global _storage_key
    _storage_key = None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    for attempt in range(2):
        key = init_storage()
        resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
        if resp.status_code == 503 and attempt == 0:
            _reset_key()
            continue
        if resp.status_code == 402:
            raise StorageError(402, "Photo storage is out of credits right now. Please try again later.")
        if not resp.ok:
            logger.error("put_object(%s): %s %s", path, resp.status_code, resp.text[:200])
            raise StorageError(502, "Couldn't save the photo. Please try again.")
        return resp.json()
    raise StorageError(503, "Photo storage is temporarily unavailable.")


def get_object(path: str) -> tuple[bytes, str]:
    for attempt in range(2):
        key = init_storage()
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
        if resp.status_code == 503 and attempt == 0:
            _reset_key()
            continue
        if not resp.ok:
            raise StorageError(404, "File not found")
        return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
    raise StorageError(503, "Photo storage is temporarily unavailable.")
