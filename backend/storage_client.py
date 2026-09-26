from __future__ import annotations

import os
import uuid

import requests
from fastapi import UploadFile
from starlette.concurrency import run_in_threadpool

STORAGE_BASE = (os.environ.get('INTEGRATION_PROXY_URL') or '').strip() or 'https://integrations.emergentagent.com'
STORAGE_URL = STORAGE_BASE.rstrip('/') + '/objstore/api/v1/storage'
APP_NAME = 'sewain'

storage_key: str | None = None


def init_storage() -> str:
    global storage_key
    if storage_key:
        return storage_key
    resp = requests.post(
        f'{STORAGE_URL}/init',
        json={'emergent_key': os.environ['EMERGENT_LLM_KEY']},
        timeout=30,
    )
    resp.raise_for_status()
    storage_key = resp.json()['storage_key']
    return storage_key


def _put(path: str, data: bytes, content_type: str) -> dict:
    global storage_key
    key = init_storage()
    resp = requests.put(
        f'{STORAGE_URL}/objects/{path}',
        headers={'X-Storage-Key': key, 'Content-Type': content_type},
        data=data,
        timeout=120,
    )
    if resp.status_code == 503 and storage_key:
        # stale key: re-init once
        storage_key = None
        key = init_storage()
        resp = requests.put(
            f'{STORAGE_URL}/objects/{path}',
            headers={'X-Storage-Key': key, 'Content-Type': content_type},
            data=data, timeout=120,
        )
    resp.raise_for_status()
    return resp.json()


def _get(path: str) -> tuple[bytes, str]:
    key = init_storage()
    resp = requests.get(f'{STORAGE_URL}/objects/{path}', headers={'X-Storage-Key': key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get('Content-Type', 'application/octet-stream')


ALLOWED_IMG = {'png', 'jpg', 'jpeg', 'webp'}


async def upload_unit_photo(account_id: str, file: UploadFile) -> dict:
    ext = (file.filename or '').split('.')[-1].lower()
    if ext not in ALLOWED_IMG:
        raise ValueError('Format foto harus PNG, JPG, atau WEBP')
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise ValueError('Ukuran foto maksimal 5 MB')
    path = f'{APP_NAME}/uploads/{account_id}/{uuid.uuid4().hex}.{ext}'
    content_type = file.content_type or 'image/jpeg'
    result = await run_in_threadpool(_put, path, data, content_type)
    return {'path': path, 'content_type': content_type, 'size': len(data), 'result': result}


def read_object(path: str) -> tuple[bytes, str]:
    return _get(path)
