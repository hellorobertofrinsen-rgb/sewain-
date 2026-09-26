"""Freemium plans — the single place where plan limits, prices and upgrade contact live.

Change a number here (e.g. free max_active_leads 20 -> 50) and both the backend
enforcement and the frontend copy follow; the frontend reads everything through
GET /api/plan.

Plans are changed MANUALLY by the owner after payment is confirmed outside the app
(see set_plan.py / POST /api/admin/set-plan). There is intentionally no billing
integration.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from bson import ObjectId
from fastapi import HTTPException

from database import leads, units
from models import today_wib

UNLIMITED = None  # a limit of None means "no limit"

PLAN_LIMITS: dict[str, dict] = {
    'free': {
        'max_units': 3,
        'max_active_leads': 20,
        'bulk_import': False,
        'export_data': False,
    },
    'premium': {
        'max_units': UNLIMITED,
        'max_active_leads': UNLIMITED,
        'bulk_import': True,
        'export_data': True,
    },
    # One-tap "Coba Demo" accounts: full product so the seeded 12 units are usable,
    # but the account (and its data) is deleted after DEMO_RETENTION_DAYS.
    'demo': {
        'max_units': UNLIMITED,
        'max_active_leads': UNLIMITED,
        'bulk_import': True,
        'export_data': True,
    },
}

PLAN_LABELS = {'free': 'Free', 'premium': 'Premium', 'demo': 'Demo'}

# Shown on the upgrade sheet. Prices in Rupiah.
PRICING = [
    {'id': 'bulanan', 'label': 'Bulanan', 'price': 277_000, 'months': 1},
    {'id': '6bulan', 'label': '6 Bulan', 'price': 777_777, 'months': 6, 'best': True},
]
UPGRADE_WHATSAPP = '6282122232421'

DEMO_RETENTION_DAYS = 7

# Lead statuses that no longer count as "active" (closed either way).
CLOSED_LEAD_STATUSES = ['deal', 'tidak_jadi']

LIMIT_MESSAGES = {
    'limit_units': 'Kamu sudah punya {limit} unit — batas paket Free. Upgrade ke Premium untuk kelola unit tanpa batas.',
    'limit_leads': 'Kamu sudah punya {limit} calon penyewa aktif — batas paket Free. Upgrade ke Premium untuk calon penyewa tanpa batas.',
    'feature_bulk_import': 'Impor unit dari CSV tersedia di paket Premium.',
    'feature_export': 'Export data tersedia di paket Premium.',
}


def effective_plan(user: dict) -> str:
    """The plan that applies right now. Premium lapses to free after premium_until (inclusive, WIB)."""
    if user.get('is_demo'):
        return 'demo'
    if user.get('plan') == 'premium':
        until = user.get('premium_until')
        if not until or until >= today_wib().date().isoformat():
            return 'premium'
    return 'free'


def get_plan_limit(user: dict, key: str):
    return PLAN_LIMITS[effective_plan(user)][key]


def can_use_feature(user: dict, feature: str) -> bool:
    return bool(get_plan_limit(user, feature))


def plan_error(code: str, limit: int | None = None) -> HTTPException:
    """403 with a machine-readable code; the frontend opens the upgrade sheet on these."""
    return HTTPException(403, {'code': code, 'message': LIMIT_MESSAGES[code].format(limit=limit), 'limit': limit})


def require_feature(user: dict, feature: str, code: str) -> None:
    if not can_use_feature(user, feature):
        raise plan_error(code)


async def count_units(aid: str) -> int:
    return await units.count_documents({'account_id': aid, 'deleted_at': None})


async def count_active_leads(aid: str) -> int:
    return await leads.count_documents({'account_id': aid, 'deleted_at': None,
                                        'status': {'$nin': CLOSED_LEAD_STATUSES}})


async def ensure_can_create_units(user: dict, how_many: int = 1) -> None:
    limit = get_plan_limit(user, 'max_units')
    if limit is not None and await count_units(str(user['_id'])) + how_many > limit:
        raise plan_error('limit_units', limit)


async def ensure_can_create_lead(user: dict) -> None:
    limit = get_plan_limit(user, 'max_active_leads')
    if limit is not None and await count_active_leads(str(user['_id'])) >= limit:
        raise plan_error('limit_leads', limit)


async def visible_unit_ids(user: dict) -> list[ObjectId] | None:
    """Units the plan lets the user see, or None when every unit is visible.

    After a downgrade to Free only the first `max_units` units the user added stay
    visible; the rest are hidden (never deleted) and come back on re-upgrade.
    """
    limit = get_plan_limit(user, 'max_units')
    if limit is None:
        return None
    docs = await units.find({'account_id': str(user['_id']), 'deleted_at': None}, {'_id': 1})\
        .sort([('created_at', 1), ('_id', 1)]).limit(limit).to_list(None)
    return [d['_id'] for d in docs]


async def unit_query(user: dict, **extra) -> dict:
    """Mongo filter for the units this user may see (use for every unit read/write)."""
    q = {'account_id': str(user['_id']), 'deleted_at': None, **extra}
    ids = await visible_unit_ids(user)
    if ids is not None:
        if '_id' in extra:
            q['_id'] = extra['_id'] if extra['_id'] in ids else {'$in': []}
        else:
            q['_id'] = {'$in': ids}
    return q


async def plan_summary(user: dict) -> dict:
    aid = str(user['_id'])
    plan = effective_plan(user)
    unit_count = await count_units(aid)
    limits = PLAN_LIMITS[plan]
    hidden = 0 if limits['max_units'] is None else max(0, unit_count - limits['max_units'])
    out = {
        'plan': plan,
        'label': PLAN_LABELS[plan],
        'premium_until': user.get('premium_until') if plan == 'premium' else None,
        'limits': limits,
        'usage': {'units': unit_count, 'active_leads': await count_active_leads(aid)},
        'hidden_units': hidden,
        'pricing': PRICING,
        'upgrade_whatsapp': UPGRADE_WHATSAPP,
    }
    if plan == 'demo' and isinstance(user.get('created_at'), datetime):
        created = user['created_at']
        out['demo_expires_at'] = (created + timedelta(days=DEMO_RETENTION_DAYS)).isoformat()
    return out


async def set_user_plan(email: str, plan: str, premium_until: str | None = None) -> dict:
    """Owner-only: switch an account between free and premium (used by set_plan.py and /api/admin)."""
    from database import users
    from helpers import parse_date

    if plan not in ('free', 'premium'):
        raise ValueError("plan harus 'free' atau 'premium'")
    if premium_until and not parse_date(premium_until):
        raise ValueError('premium_until harus format YYYY-MM-DD')
    user = await users.find_one({'email': email.lower().strip()})
    if not user:
        raise LookupError(f'Akun {email} tidak ditemukan')
    until = parse_date(premium_until).isoformat() if (plan == 'premium' and premium_until) else None
    await users.update_one({'_id': user['_id']}, {'$set': {'plan': plan, 'premium_until': until}})
    return {'email': user['email'], 'plan': plan, 'premium_until': until}
