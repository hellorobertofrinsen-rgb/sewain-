"""Owner-only endpoint to change an account's plan after a manual payment.

Disabled unless the ADMIN_SECRET env var is set. Example:

  curl -X POST https://<your-app>/api/admin/set-plan \
    -H "X-Admin-Secret: $ADMIN_SECRET" -H "Content-Type: application/json" \
    -d '{"email": "agen@contoh.com", "plan": "premium", "premium_until": "2026-12-31"}'

  curl -X POST https://<your-app>/api/admin/reset-link \
    -H "X-Admin-Secret: $ADMIN_SECRET" -H "Content-Type: application/json" \
    -d '{"email": "agen@contoh.com"}'
"""
from __future__ import annotations

import hmac
import os

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel

from database import db
from plans import set_user_plan

router = APIRouter(prefix='/api/admin')


class SetPlanIn(BaseModel):
    email: str
    plan: str
    premium_until: str | None = None


def _check_secret(given: str | None) -> None:
    secret = os.environ.get('ADMIN_SECRET', '')
    if not secret:
        raise HTTPException(404, 'Not found')
    if not given or not hmac.compare_digest(given, secret):
        raise HTTPException(403, 'Admin secret salah')


def public_url(request: Request | None = None) -> str:
    url = os.environ.get('PUBLIC_URL', '').rstrip('/')
    if url:
        return url
    return f'https://{request.headers.get("host")}' if request else ''


@router.post('/set-plan')
async def admin_set_plan(body: SetPlanIn, x_admin_secret: str | None = Header(default=None)):
    _check_secret(x_admin_secret)
    try:
        return await set_user_plan(body.email, body.plan, body.premium_until)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


class ResetLinkIn(BaseModel):
    email: str


@router.post('/reset-link')
async def admin_reset_link(body: ResetLinkIn, request: Request, x_admin_secret: str | None = Header(default=None)):
    """A one-time password-reset link (valid 24 hours) to send to the agent over WhatsApp."""
    _check_secret(x_admin_secret)
    from routers_auth import create_reset_token
    try:
        token = await create_reset_token(body.email)
    except LookupError as e:
        raise HTTPException(404, str(e))
    return {'url': f'{public_url(request)}/reset?token={token}', 'valid_hours': 24}


@router.get('/db-stats')
async def admin_db_stats(x_admin_secret: str | None = Header(default=None)):
    """How full the database is (MongoDB Atlas M0 stops accepting writes at 512 MB)."""
    _check_secret(x_admin_secret)
    s = await db.command('dbStats')
    used = int(s.get('dataSize', 0) + s.get('indexSize', 0))
    return {'used_mb': round(used / 1024 / 1024, 1), 'limit_mb': 512,
            'percent': round(used / (512 * 1024 * 1024) * 100, 1),
            'collections': {name: await db[name].estimated_document_count()
                            for name in ('users', 'units', 'leads', 'tenants', 'payments', 'files')}}
