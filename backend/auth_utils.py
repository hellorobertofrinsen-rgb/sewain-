from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from bson import ObjectId
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from database import users
from models import set_request_timezone

SECRET = os.environ['AUTH_SECRET']
ALGORITHM = 'HS256'
TOKEN_DAYS = 90

bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(account_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {'sub': account_id, 'iat': now, 'exp': now + timedelta(days=TOKEN_DAYS)}
    return jwt.encode(payload, SECRET, algorithm=ALGORITHM)


def unauthorized(detail: str = 'Sesi tidak valid. Silakan masuk lagi.') -> HTTPException:
    return HTTPException(status_code=401, detail=detail)


async def current_account(cred: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict:
    if not cred or cred.scheme.lower() != 'bearer':
        raise unauthorized()
    try:
        payload = jwt.decode(cred.credentials, SECRET, algorithms=[ALGORITHM])
    except Exception:
        raise unauthorized()
    sub = payload.get('sub')
    if not sub or not ObjectId.is_valid(sub):
        raise unauthorized()
    user = await users.find_one({'_id': ObjectId(sub)})
    if not user:
        raise unauthorized()
    # Changing or resetting the password signs out every older session.
    changed = user.get('password_changed_at')
    if isinstance(changed, datetime):
        if changed.tzinfo is None:
            changed = changed.replace(tzinfo=timezone.utc)
        if int(payload.get('iat') or 0) < int(changed.timestamp()):
            raise unauthorized()
    set_request_timezone(user.get('timezone'))
    return user


def account_id(user: dict) -> str:
    return str(user['_id'])
