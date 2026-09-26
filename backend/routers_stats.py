"""Laporan: a conversion funnel built only from steps the agent recorded.

  Prospek → Viewing → Negosiasi → Deal → Perpanjang

Every number is "X of Y" from facts in the database (a viewing that took place, a
negotiation that was saved, a deal, a contract extension). Nothing is estimated:
the app can't see WhatsApp, so things like reply speed are deliberately not reported.
Accounts are small (tens to hundreds of documents), so filtering happens in Python.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from auth_utils import account_id, current_account
from database import activities, leads, tenants, viewings
from models import now_utc

router = APIRouter(prefix='/api')


def _utc(v) -> datetime | None:
    if not isinstance(v, datetime):
        return None
    return v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v


def _step(key: str, label: str, done: int, base: int) -> dict:
    return {'key': key, 'label': label, 'count': done, 'of': base,
            'percent': round(done / base * 100) if base else None}


@router.get('/stats')
async def stats(days: int = Query(default=0, ge=0, le=3650), user: dict = Depends(current_account)):
    """days=0: all time. Otherwise only prospects/tenants added in the last `days` days."""
    aid = account_id(user)
    now = now_utc()
    start = now - timedelta(days=days) if days else None

    def in_period(v) -> bool:
        d = _utc(v)
        return start is None or bool(d and d >= start)

    cohort = [l for l in await leads.find({'account_id': aid, 'deleted_at': None}).to_list(None) if in_period(l.get('created_at'))]
    ids = {str(l['_id']) for l in cohort}

    # A viewing counts once it has taken place (its time has passed and it wasn't cancelled).
    viewed = set()
    for v in await viewings.find({'account_id': aid, 'deleted_at': None, 'status': {'$ne': 'batal'}}).to_list(None):
        when = _utc(v.get('scheduled_at'))
        if v.get('lead_id') in ids and when and when <= now:
            viewed.add(v['lead_id'])
    negotiated = {str(l['_id']) for l in cohort if l.get('negotiation') or l.get('status') == 'negotiation'}
    deals = {str(l['_id']) for l in cohort if l.get('status') == 'deal'}

    # Every tenant is a closed deal (from a prospect or added directly); extended = renewed at least once.
    all_tenants = [t for t in await tenants.find({'account_id': aid, 'deleted_at': None}).to_list(None) if in_period(t.get('created_at'))]
    ext_ids = {a.get('entity_id') for a in await activities.find({'account_id': aid, 'action': 'tenant_extended'}).to_list(None)}
    extended = [t for t in all_tenants if (t.get('extensions') or 0) > 0 or str(t['_id']) in ext_ids]

    return {
        'days': days,
        'prospects': len(cohort),
        'steps': [
            _step('viewing', 'Prospek → Viewing', len(viewed), len(cohort)),
            _step('negotiation', 'Viewing → Negosiasi', len(viewed & negotiated), len(viewed)),
            _step('deal', 'Negosiasi → Deal', len(negotiated & deals), len(negotiated)),
            _step('extend', 'Deal → Perpanjang', len(extended), len(all_tenants)),
        ],
        'totals': {'viewing': len(viewed), 'negotiation': len(negotiated), 'deal': len(deals),
                   'tenants': len(all_tenants), 'extended': len(extended),
                   'direct_deals': len(deals - negotiated)},
    }
