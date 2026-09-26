"""Owner-only endpoint to change an account's plan after a manual payment.

Disabled unless the ADMIN_SECRET env var is set. Example:

  curl -X POST https://<your-app>/api/admin/set-plan \
    -H "X-Admin-Secret: $ADMIN_SECRET" -H "Content-Type: application/json" \
    -d '{"email": "agen@contoh.com", "plan": "premium", "premium_until": "2026-12-31"}'
"""
from __future__ import annotations

import hmac
import os

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from plans import set_user_plan

router = APIRouter(prefix='/api/admin')


class SetPlanIn(BaseModel):
    email: str
    plan: str
    premium_until: str | None = None


@router.post('/set-plan')
async def admin_set_plan(body: SetPlanIn, x_admin_secret: str | None = Header(default=None)):
    secret = os.environ.get('ADMIN_SECRET', '')
    if not secret:
        raise HTTPException(404, 'Not found')
    if not x_admin_secret or not hmac.compare_digest(x_admin_secret, secret):
        raise HTTPException(403, 'Admin secret salah')
    try:
        return await set_user_plan(body.email, body.plan, body.premium_until)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
