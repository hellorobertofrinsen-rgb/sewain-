"""Unit photos stored inside MongoDB (no separate object-storage service to pay for).

Photos are downscaled to max 1280px JPEG (~100-250 KB) before saving, so even the
free 512 MB MongoDB Atlas tier holds a few thousand photos. If that ever becomes
too small, swap save_photo/read_photo for an S3-compatible bucket (e.g. Cloudflare R2).
"""
from __future__ import annotations

import io
import uuid

from bson import Binary
from fastapi import UploadFile
from PIL import Image, ImageOps, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

from database import files
from models import now_utc

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_SIDE = 1280
MAX_PHOTOS_PER_UNIT = 10


def _compress(data: bytes) -> bytes:
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)
    except (UnidentifiedImageError, OSError):
        raise ValueError('File bukan foto yang valid (pakai JPG, PNG, atau WEBP)')
    img = img.convert('RGB')
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    out = io.BytesIO()
    img.save(out, 'JPEG', quality=80, optimize=True, progressive=True)
    return out.getvalue()


async def save_photo(account_id: str, file: UploadFile) -> str:
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise ValueError('Ukuran foto maksimal 10 MB')
    jpeg = await run_in_threadpool(_compress, data)
    path = f'{account_id}/{uuid.uuid4().hex}.jpg'
    await files.insert_one({'path': path, 'owner_id': account_id, 'content_type': 'image/jpeg',
                            'size': len(jpeg), 'data': Binary(jpeg), 'created_at': now_utc()})
    return path


async def read_photo(path: str, account_id: str) -> tuple[bytes, str] | None:
    rec = await files.find_one({'path': path, 'owner_id': account_id})
    if not rec or 'data' not in rec:
        return None
    return bytes(rec['data']), rec.get('content_type', 'image/jpeg')
