from __future__ import annotations

import hashlib
import logging
import secrets
from datetime import timedelta

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from pydantic import BaseModel, EmailStr, Field

from auth_utils import create_token, current_account, hash_password, verify_password
from database import files, users, delete_account_data
from models import TIMEZONES, now_utc
from plans import DEMO_RETENTION_DAYS, effective_plan, plan_summary, trial_until
from ratelimit import client_ip, hit
from seed import seed_demo_account

router = APIRouter(prefix='/api')
logger = logging.getLogger('sewain')

RESET_HOURS = 24


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    timezone: str | None = None
    language: str | None = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


PROFILE_FIELDS = ('phone', 'agency', 'domicile', 'bank_name', 'bank_account', 'bank_holder',
                  'office_bank_name', 'office_bank_account', 'office_bank_holder')


def public_user(u: dict) -> dict:
    return {'id': str(u['_id']), 'name': u.get('name', ''), 'email': u.get('email', ''),
            'is_demo': bool(u.get('is_demo')), 'plan': effective_plan(u),
            'timezone': u.get('timezone') or 'Asia/Jakarta', 'language': u.get('language') or 'id',
            'photo': u.get('photo'),
            'onboarding_tour_seen': bool(u.get('onboarding_tour_seen')),
            'onboarding_dismissed': bool(u.get('onboarding_dismissed')),
            **{k: u.get(k) for k in PROFILE_FIELDS}}


async def _create_account(name: str, email: str, password: str | None, is_demo: bool,
                          timezone_name: str | None = None, language: str | None = None) -> dict:
    doc = {
        '_id': ObjectId(), 'name': name, 'email': email,
        'password_hash': hash_password(password or secrets.token_hex(16)),
        'is_demo': is_demo, 'plan': 'free', 'created_at': now_utc(),
        'timezone': timezone_name if timezone_name in TIMEZONES else 'Asia/Jakarta',
        'language': language if language in ('id', 'en') else 'id',
    }
    if not is_demo:
        doc |= {'plan': 'premium', 'premium_until': trial_until(), 'trial': True}
    await users.insert_one(doc)
    if is_demo:
        await seed_demo_account(str(doc['_id']))
    return doc


async def cleanup_expired_demos() -> int:
    """Delete demo accounts (and all their data) older than DEMO_RETENTION_DAYS."""
    cutoff = now_utc() - timedelta(days=DEMO_RETENTION_DAYS)
    old = await users.find({'is_demo': True, 'created_at': {'$lt': cutoff}}, {'_id': 1}).to_list(500)
    for u in old:
        await delete_account_data(str(u['_id']))
        await users.delete_one({'_id': u['_id']})
    if old:
        logger.info('Removed %d expired demo accounts', len(old))
    return len(old)


@router.post('/auth/register')
async def register(body: RegisterIn, request: Request):
    hit(f'register:{client_ip(request)}', 5, 3600)
    email = body.email.lower().strip()
    if await users.find_one({'email': email}):
        raise HTTPException(409, 'Email sudah terdaftar. Coba masuk saja.')
    doc = await _create_account(body.name.strip(), email, body.password, is_demo=False, timezone_name=body.timezone,
                                language=body.language)
    return {'token': create_token(str(doc['_id'])), 'user': public_user(doc)}


@router.post('/auth/login')
async def login(body: LoginIn, request: Request):
    email = body.email.lower().strip()
    hit(f'login-ip:{client_ip(request)}', 20, 600)
    hit(f'login-email:{email}', 8, 600)  # guessing one account's password from many addresses
    user = await users.find_one({'email': email})
    stored = (user and user.get('password_hash')) or hash_password('dummy-for-timing')
    if not verify_password(body.password, stored) or not user or user.get('is_demo'):
        raise HTTPException(401, 'Email atau password salah.')
    return {'token': create_token(str(user['_id'])), 'user': public_user(user)}


@router.post('/auth/demo')
async def demo_login(request: Request):
    hit(f'demo:{client_ip(request)}', 5, 3600)
    await cleanup_expired_demos()
    email = f'demo+{secrets.token_hex(4)}@sewain.id'
    doc = await _create_account('Roberto', email, None, is_demo=True)
    return {'token': create_token(str(doc['_id'])), 'user': public_user(doc)}


@router.get('/me')
async def me(user: dict = Depends(current_account)):
    return public_user(user)


@router.post('/auth/refresh')
async def refresh_session(user: dict = Depends(current_account)):
    """A fresh 90-day token each time the app opens, so an agent who uses SewAIn
    even once every few months never has to sign in again."""
    return {'token': create_token(str(user['_id'])), 'user': public_user(user)}


class ProfileIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    timezone: str | None = None
    language: str | None = None
    phone: str | None = Field(default=None, max_length=40)
    agency: str | None = Field(default=None, max_length=120)
    domicile: str | None = Field(default=None, max_length=120)
    bank_name: str | None = Field(default=None, max_length=60)
    bank_account: str | None = Field(default=None, max_length=40)
    bank_holder: str | None = Field(default=None, max_length=80)
    office_bank_name: str | None = Field(default=None, max_length=60)
    office_bank_account: str | None = Field(default=None, max_length=40)
    office_bank_holder: str | None = Field(default=None, max_length=80)
    onboarding_tour_seen: bool | None = None
    onboarding_dismissed: bool | None = None


@router.patch('/me')
async def update_me(body: ProfileIn, user: dict = Depends(current_account)):
    setq: dict = {}
    if body.name is not None:
        setq['name'] = body.name.strip()
    if body.timezone is not None:
        if body.timezone not in TIMEZONES:
            raise HTTPException(400, 'Zona waktu harus WIB, WITA, atau WIT')
        setq['timezone'] = body.timezone
    if body.language is not None:
        if body.language not in ('id', 'en'):
            raise HTTPException(400, 'Bahasa harus id atau en')
        setq['language'] = body.language
    for k in PROFILE_FIELDS:
        v = getattr(body, k)
        if v is not None:
            setq[k] = v.strip() or None
    for k in ('onboarding_tour_seen', 'onboarding_dismissed'):
        if getattr(body, k) is not None:
            setq[k] = getattr(body, k)
    if setq:
        await users.update_one({'_id': user['_id']}, {'$set': setq})
    return public_user(user | setq)


@router.post('/me/photo')
async def upload_my_photo(file: UploadFile, user: dict = Depends(current_account)):
    from storage import save_photo
    try:
        path = await save_photo(str(user['_id']), file)
    except ValueError as e:
        raise HTTPException(400, str(e))
    old = user.get('photo')
    await users.update_one({'_id': user['_id']}, {'$set': {'photo': path}})
    if old:
        await files.delete_one({'path': old, 'owner_id': str(user['_id'])})
    return public_user(user | {'photo': path})


@router.delete('/me/photo')
async def delete_my_photo(user: dict = Depends(current_account)):
    if user.get('photo'):
        await files.delete_one({'path': user['photo'], 'owner_id': str(user['_id'])})
    await users.update_one({'_id': user['_id']}, {'$set': {'photo': None}})
    return public_user(user | {'photo': None})


@router.get('/plan')
async def plan(user: dict = Depends(current_account)):
    return await plan_summary(user)


# ------------------------------ Passwords --------------------------------------

class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


async def _set_password(user_id, password: str) -> None:
    await users.update_one({'_id': user_id}, {
        '$set': {'password_hash': hash_password(password), 'password_changed_at': now_utc()},
        '$unset': {'reset_token_hash': '', 'reset_expires_at': ''},
    })


@router.post('/auth/change-password')
async def change_password(body: ChangePasswordIn, request: Request, user: dict = Depends(current_account)):
    hit(f'change-pw:{user["_id"]}', 8, 600)
    if user.get('is_demo'):
        raise HTTPException(400, 'Akun demo tidak punya password.')
    if not verify_password(body.current_password, user.get('password_hash', '')):
        raise HTTPException(400, 'Password lama salah.')
    await _set_password(user['_id'], body.new_password)
    fresh = await users.find_one({'_id': user['_id']})
    return {'token': create_token(str(user['_id'])), 'user': public_user(fresh)}


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def create_reset_token(email: str) -> str:
    """Owner-only (admin endpoint / reset_link.py): a one-time token valid for RESET_HOURS.

    There is no email service; the owner sends the link to the agent over WhatsApp.
    Only the token's hash is stored.
    """
    user = await users.find_one({'email': email.lower().strip(), 'is_demo': {'$ne': True}})
    if not user:
        raise LookupError(f'Akun {email} tidak ditemukan')
    token = secrets.token_urlsafe(32)
    await users.update_one({'_id': user['_id']}, {'$set': {
        'reset_token_hash': _hash_token(token), 'reset_expires_at': now_utc() + timedelta(hours=RESET_HOURS)}})
    return token


class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    new_password: str = Field(min_length=8, max_length=128)


@router.post('/auth/reset-password')
async def reset_password(body: ResetPasswordIn, request: Request):
    hit(f'reset:{client_ip(request)}', 10, 3600)
    user = await users.find_one({'reset_token_hash': _hash_token(body.token)})
    expires = user and user.get('reset_expires_at')
    if expires is not None and expires.tzinfo is None:
        from datetime import timezone
        expires = expires.replace(tzinfo=timezone.utc)
    if not user or not expires or expires < now_utc():
        raise HTTPException(400, 'Link reset sudah tidak berlaku. Minta link baru lewat WhatsApp.')
    await _set_password(user['_id'], body.new_password)
    fresh = await users.find_one({'_id': user['_id']})
    return {'token': create_token(str(user['_id'])), 'user': public_user(fresh)}


# ------------------------------ Delete account ---------------------------------

class DeleteAccountIn(BaseModel):
    password: str | None = Field(default=None, max_length=128)


@router.post('/auth/delete-account')
async def delete_account(body: DeleteAccountIn, user: dict = Depends(current_account)):
    """Permanently delete the account and every record and photo in it (UU PDP: right to erasure)."""
    hit(f'delete:{user["_id"]}', 8, 600)
    if not user.get('is_demo') and not verify_password(body.password or '', user.get('password_hash', '')):
        raise HTTPException(400, 'Password salah.')
    await delete_account_data(str(user['_id']))
    await users.delete_one({'_id': user['_id']})
    logger.info('Account deleted on request')
    return {'ok': True}
