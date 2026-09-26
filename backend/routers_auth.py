from __future__ import annotations

import logging
import secrets
from datetime import timedelta

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

from auth_utils import create_token, current_account, hash_password, verify_password
from database import users, delete_account_data
from models import now_utc
from plans import DEMO_RETENTION_DAYS, effective_plan, plan_summary
from seed import seed_demo_account

router = APIRouter(prefix='/api')
logger = logging.getLogger('sewain')


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


def public_user(u: dict) -> dict:
    return {'id': str(u['_id']), 'name': u.get('name', ''), 'email': u.get('email', ''),
            'is_demo': bool(u.get('is_demo')), 'plan': effective_plan(u)}


async def _create_account(name: str, email: str, password: str | None, is_demo: bool) -> dict:
    doc = {
        '_id': ObjectId(), 'name': name, 'email': email,
        'password_hash': hash_password(password or secrets.token_hex(16)),
        'is_demo': is_demo, 'plan': 'free', 'created_at': now_utc(),
    }
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
async def register(body: RegisterIn):
    email = body.email.lower().strip()
    if await users.find_one({'email': email}):
        raise HTTPException(409, 'Email sudah terdaftar. Coba masuk saja.')
    doc = await _create_account(body.name.strip(), email, body.password, is_demo=False)
    return {'token': create_token(str(doc['_id'])), 'user': public_user(doc)}


@router.post('/auth/login')
async def login(body: LoginIn):
    email = body.email.lower().strip()
    user = await users.find_one({'email': email})
    stored = (user and user.get('password_hash')) or hash_password('dummy-for-timing')
    if not verify_password(body.password, stored) or not user:
        raise HTTPException(401, 'Email atau password salah.')
    return {'token': create_token(str(user['_id'])), 'user': public_user(user)}


@router.post('/auth/demo')
async def demo_login():
    await cleanup_expired_demos()
    email = f'demo+{secrets.token_hex(4)}@sewain.id'
    doc = await _create_account('Roberto', email, None, is_demo=True)
    return {'token': create_token(str(doc['_id'])), 'user': public_user(doc)}


@router.get('/me')
async def me(user: dict = Depends(current_account)):
    return public_user(user)


@router.get('/plan')
async def plan(user: dict = Depends(current_account)):
    return await plan_summary(user)
