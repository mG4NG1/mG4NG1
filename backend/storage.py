"""Private profile photo storage in the same MongoDB database as ChopOut.

Uses Motor GridFS: no Emergent key, proxy or third-party object-store account.
Images remain accessible only through the application's authenticated /api/files route.
"""
import logging

from gridfs.errors import NoFile
from motor.motor_asyncio import AsyncIOMotorGridFSBucket

APP_NAME = "chopout"
logger = logging.getLogger(__name__)


class StorageError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


async def put_object(db, path: str, data: bytes, content_type: str) -> None:
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="profile_images")
    try:
        upload = bucket.open_upload_stream(path, metadata={"content_type": content_type})
        await upload.write(data)
        await upload.close()
    except Exception as exc:
        logger.error("GridFS image upload failed: %s", exc)
        raise StorageError(503, "Photo storage is temporarily unavailable") from exc


async def get_object(db, path: str) -> tuple[bytes, str]:
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="profile_images")
    try:
        stream = await bucket.open_download_stream_by_name(path)
        contents = await stream.read()
        return contents, (stream.metadata or {}).get("content_type", "application/octet-stream")
    except NoFile as exc:
        raise StorageError(404, "File not found") from exc
    except Exception as exc:
        logger.error("GridFS image download failed: %s", exc)
        raise StorageError(503, "Photo storage is temporarily unavailable") from exc


async def delete_object(db, path: str) -> None:
    bucket = AsyncIOMotorGridFSBucket(db, bucket_name="profile_images")
    try:
        stream = await bucket.open_download_stream_by_name(path)
        await bucket.delete(stream._id)
    except NoFile:
        return
