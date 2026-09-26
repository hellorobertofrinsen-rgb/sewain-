"""Laporan: the three numbers Sewain is judged by, plus a per-owner breakdown.

1. Response speed  — how fast a new prospect gets a first reply.
2. Retention       — how many ending leases are renewed instead of moving out.
3. Lost leads      — prospects that went cold or said no.

Everything is computed from data the agent already records; nothing is estimated.
Accounts are small (tens to hundreds of documents), so filtering happens in Python.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from statistics import median

from fastapi import APIRouter, Depends, Query

from auth_utils import account_id, current_account
from database import activities, leads, payments, tenants, units
from helpers import parse_date
from models import now_utc, today_wib
from plans import CLOSED_LEAD_STATUSES, unit_query

router = APIRouter(prefix='/api')

COLD_DAYS = 7  # an active prospect with no contact for this long is about to be lost


def _utc(v) -> datetime | None:
    if not isinstance(v, datetime):
        return None
    return v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v


def _in(v, start: datetime) -> bool:
    d = _utc(v)
    return bool(d and d >= start)


@router.get('/stats')
async def stats(days: int = Query(default=30, ge=7, le=365), user: dict = Depends(current_account)):
    aid = account_id(user)
    now = now_utc()
    start = now - timedelta(days=days)
    today = today_wib().date()

    # ------------------------------ Speed --------------------------------------
    all_leads = await leads.find({'account_id': aid, 'deleted_at': None}).to_list(None)
    new_leads = [l for l in all_leads if _in(l.get('created_at'), start)]
    response_minutes = []
    for l in new_leads:
        created, first = _utc(l.get('created_at')), _utc(l.get('first_contact_at'))
        if created and first and first >= created:
            response_minutes.append((first - created).total_seconds() / 60)
    waiting = [l for l in all_leads if l.get('status') == 'baru' and not l.get('last_contact_at')]
    oldest_wait = max(((now - _utc(l['created_at'])).total_seconds() / 3600 for l in waiting if _utc(l.get('created_at'))),
                      default=None)

    # ------------------------------ Lost leads ---------------------------------
    closed = [l for l in all_leads if _in(l.get('closed_at'), start)]
    deals = [l for l in closed if l.get('status') == 'deal']
    lost = [l for l in closed if l.get('status') == 'tidak_jadi']
    cold = []
    for l in all_leads:
        if l.get('status') in CLOSED_LEAD_STATUSES:
            continue
        last = _utc(l.get('last_interaction_at') or l.get('created_at'))
        if last and last < now - timedelta(days=COLD_DAYS):
            cold.append({'id': str(l['_id']), 'name': l['name'], 'days': (now - last).days, 'status': l.get('status')})
    cold.sort(key=lambda x: -x['days'])
    reasons: dict[str, int] = {}
    for l in lost:
        key = (l.get('lost_reason') or 'Tanpa alasan').strip() or 'Tanpa alasan'
        reasons[key] = reasons.get(key, 0) + 1

    # ------------------------------ Retention ----------------------------------
    acts = await activities.find({'account_id': aid, 'action': {'$in': ['tenant_extended', 'tenant_checkout']}}).to_list(None)
    acts = [a for a in acts if _in(a.get('created_at'), start)]
    extended = sum(1 for a in acts if a['action'] == 'tenant_extended')
    moved_out = sum(1 for a in acts if a['action'] == 'tenant_checkout')
    all_tenants = await tenants.find({'account_id': aid, 'deleted_at': None}).to_list(None)
    active = [t for t in all_tenants if t.get('status') == 'aktif']
    ending_soon = 0
    for t in active:
        end = parse_date(t.get('end_date'))
        if end and 0 <= (end - today).days <= 60:
            ending_soon += 1

    # ------------------------------ Money --------------------------------------
    pays = await payments.find({'account_id': aid, 'deleted_at': None}).to_list(None)
    paid = [p for p in pays if p.get('status') == 'lunas' and _in(p.get('paid_at'), start)]
    overdue = [p for p in pays if p.get('status') == 'belum_bayar' and (p.get('due_date') or '9999') <= today.isoformat()]
    commission = sum(t.get('commission') or 0 for t in all_tenants if _in(t.get('created_at'), start))

    # ------------------------------ Owners -------------------------------------
    visible = await units.find(await unit_query(user)).to_list(None)
    unit_owner = {str(u['_id']): (u.get('owner_name') or '').strip() or 'Tanpa nama pemilik' for u in visible}
    owners: dict[str, dict] = {}
    for u in visible:
        o = owners.setdefault(unit_owner[str(u['_id'])], {
            'name': unit_owner[str(u['_id'])], 'phone': u.get('owner_phone'),
            'units': 0, 'terisi': 0, 'kosong': 0, 'paid': 0, 'overdue': 0})
        o['units'] += 1
        o['phone'] = o['phone'] or u.get('owner_phone')
        if u.get('status') == 'terisi':
            o['terisi'] += 1
        elif u.get('status') == 'kosong':
            o['kosong'] += 1
    for p in paid:
        o = owners.get(unit_owner.get(p.get('unit_id') or '', ''))
        if o:
            o['paid'] += p.get('amount', 0)
    for p in overdue:
        o = owners.get(unit_owner.get(p.get('unit_id') or '', ''))
        if o:
            o['overdue'] += p.get('amount', 0)

    occupied = sum(1 for u in visible if u.get('status') == 'terisi')
    return {
        'days': days,
        'speed': {
            'median_minutes': round(median(response_minutes)) if response_minutes else None,
            'within_hour': sum(1 for m in response_minutes if m <= 60),
            'responded': len(response_minutes),
            'waiting': len(waiting),
            'oldest_wait_hours': round(oldest_wait, 1) if oldest_wait is not None else None,
        },
        'leads': {
            'new': len(new_leads),
            'deals': len(deals),
            'lost': len(lost),
            'conversion': round(len(deals) / (len(deals) + len(lost)) * 100) if (deals or lost) else None,
            'cold': cold[:10],
            'cold_count': len(cold),
            'lost_reasons': sorted(({'reason': k, 'count': v} for k, v in reasons.items()), key=lambda x: -x['count']),
        },
        'retention': {
            'extended': extended,
            'moved_out': moved_out,
            'rate': round(extended / (extended + moved_out) * 100) if (extended + moved_out) else None,
            'active_tenants': len(active),
            'ending_soon': ending_soon,
        },
        'money': {
            'collected': sum(p.get('amount', 0) for p in paid),
            'overdue': sum(p.get('amount', 0) for p in overdue),
            'commission': commission,
        },
        'occupancy': round(occupied / len(visible) * 100) if visible else None,
        'owners': sorted(owners.values(), key=lambda o: (-o['units'], o['name'])),
    }
