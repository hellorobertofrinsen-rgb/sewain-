"""Laporan: portfolio numbers for any date range, compared with the range before it.

Everything comes from what the agent recorded. Nothing is estimated: the app can't
see WhatsApp, so things like reply speed are deliberately not reported.

  GET /api/stats?start=YYYY-MM-DD&end=YYYY-MM-DD   (inclusive, in the account's timezone)

The previous range is the same number of days directly before `start`.
Accounts are small (tens to hundreds of documents), so filtering happens in Python.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from auth_utils import account_id, current_account
from database import activities, bookings, leads, payments, tenants, units, viewings
from helpers import parse_date
from models import local_tz, now_utc, today_wib
from plans import unit_query

router = APIRouter(prefix='/api')


def _utc(v) -> datetime | None:
    if not isinstance(v, datetime):
        return None
    return v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v


def _step(key: str, label: str, done: int, base: int) -> dict:
    return {'key': key, 'label': label, 'count': done, 'of': base,
            'percent': round(done / base * 100) if base else None}


class Window:
    def __init__(self, start: date, end: date):
        self.start, self.end = start, end
        tz = local_tz()
        self.t0 = datetime.combine(start, time.min, tzinfo=tz)
        self.t1 = datetime.combine(end + timedelta(days=1), time.min, tzinfo=tz)  # exclusive

    def has(self, v) -> bool:
        d = _utc(v)
        return bool(d and self.t0 <= d < self.t1)

    def iso(self) -> dict:
        return {'start': self.start.isoformat(), 'end': self.end.isoformat(), 'days': (self.end - self.start).days + 1}


def _tenant_active_on(t: dict, day: date) -> bool:
    start = parse_date(t.get('start_date'))
    end = parse_date(t.get('end_date'))
    return bool(start and start <= day and (end is None or end >= day))


def _booking_nights_in(b: dict, w: Window) -> int:
    cin, cout = parse_date(b.get('check_in')), parse_date(b.get('check_out'))
    if not cin or not cout:
        return 0
    first = max(cin, w.start)
    last = min(cout, w.end + timedelta(days=1))  # nights are counted by the evening they start
    return max(0, (last - first).days)


def _numbers(w: Window, all_leads, all_tenants, all_units, all_bookings, all_payments) -> dict:
    active = [t for t in all_tenants if _tenant_active_on(t, w.end)]
    nights = [(b, _booking_nights_in(b, w)) for b in all_bookings]
    return {
        'prospects': sum(1 for l in all_leads if w.has(l.get('created_at'))),
        'tenants': len(active),
        'units': sum(1 for u in all_units if (_utc(u.get('created_at')) or now_utc()) < w.t1),
        'monthly_income': sum(t.get('monthly_rent') or 0 for t in active),
        'daily_income': sum(n * (b.get('price_per_night') or 0) for b, n in nights),
        'daily_nights': sum(n for _, n in nights),
        'collected': sum(p.get('amount', 0) for p in all_payments if p.get('status') == 'lunas' and w.has(p.get('paid_at'))),
    }


@router.get('/stats')
async def stats(start: str | None = Query(default=None), end: str | None = Query(default=None),
                user: dict = Depends(current_account)):
    aid = account_id(user)
    today = today_wib().date()
    s = parse_date(start) or today.replace(day=1)
    e = parse_date(end) or today
    if e < s:
        raise HTTPException(400, 'Tanggal akhir harus setelah tanggal mulai')
    if (e - s).days > 3660:
        raise HTTPException(400, 'Rentang maksimal 10 tahun')
    cur = Window(s, e)
    length = (e - s).days + 1
    prev = Window(s - timedelta(days=length), s - timedelta(days=1))

    all_leads = await leads.find({'account_id': aid, 'deleted_at': None}).to_list(None)
    all_tenants = await tenants.find({'account_id': aid, 'deleted_at': None}).to_list(None)
    all_units = await units.find(await unit_query(user)).to_list(None)
    all_bookings = await bookings.find({'account_id': aid, 'deleted_at': None}).to_list(None)
    all_payments = await payments.find({'account_id': aid, 'deleted_at': None}).to_list(None)
    all_viewings = await viewings.find({'account_id': aid, 'deleted_at': None, 'status': {'$ne': 'batal'}}).to_list(None)

    # ---------------- Funnel (prospects added in the range) ----------------
    now = now_utc()
    cohort = [l for l in all_leads if cur.has(l.get('created_at'))]
    ids = {str(l['_id']) for l in cohort}
    viewed = set()
    for v in all_viewings:
        when = _utc(v.get('scheduled_at'))
        if v.get('lead_id') in ids and when and when <= now:  # counts once it has taken place
            viewed.add(v['lead_id'])
    negotiated = {str(l['_id']) for l in cohort if l.get('negotiation') or l.get('status') == 'negotiation'}
    deals = {str(l['_id']) for l in cohort if l.get('status') == 'deal'}
    new_tenants = [t for t in all_tenants if cur.has(t.get('created_at'))]
    ext_ids = {a.get('entity_id') for a in await activities.find({'account_id': aid, 'action': 'tenant_extended'}).to_list(None)}
    extended = [t for t in new_tenants if (t.get('extensions') or 0) > 0 or str(t['_id']) in ext_ids]

    # ---------------- Hot / least-performing units in the range ----------------
    per_unit: dict[str, dict] = {str(u['_id']): {'viewings': 0, 'prospects': 0, 'nights': 0} for u in all_units}
    for v in all_viewings:
        if cur.has(v.get('scheduled_at')):
            for uid in v.get('unit_ids') or [v.get('unit_id')]:
                if uid in per_unit:
                    per_unit[uid]['viewings'] += 1
    for l in cohort:
        if l.get('matched_unit_id') in per_unit:
            per_unit[l['matched_unit_id']]['prospects'] += 1
    for b in all_bookings:
        if b.get('unit_id') in per_unit:
            per_unit[b['unit_id']]['nights'] += _booking_nights_in(b, cur)

    def row(u: dict) -> dict:
        c = per_unit[str(u['_id'])]
        vacant = _utc(u.get('vacant_since'))
        return {'id': str(u['_id']), 'name': u['name'], 'status': u.get('status'), **c,
                'score': c['viewings'] + c['prospects'] + c['nights'],
                'vacant_days': (now - vacant).days if (vacant and u.get('status') == 'kosong') else None}

    rows = [row(u) for u in all_units]
    hot = sorted([r for r in rows if r['score'] > 0], key=lambda r: (-r['score'], r['name']))[:3]
    # Least performing: units still looking for a tenant, least interest first, then empty longest.
    open_rows = [r for r in rows if r['status'] != 'terisi']
    least = sorted(open_rows, key=lambda r: (r['score'], -(r['vacant_days'] or 0), r['name']))[:3]

    return {
        'period': cur.iso(),
        'previous_period': prev.iso(),
        'current': _numbers(cur, all_leads, all_tenants, all_units, all_bookings, all_payments),
        'previous': _numbers(prev, all_leads, all_tenants, all_units, all_bookings, all_payments),
        'prospects': len(cohort),
        'steps': [
            _step('viewing', 'Prospek → Viewing', len(viewed), len(cohort)),
            _step('negotiation', 'Viewing → Negosiasi', len(viewed & negotiated), len(viewed)),
            _step('deal', 'Negosiasi → Deal', len(negotiated & deals), len(negotiated)),
            _step('extend', 'Deal → Perpanjang', len(extended), len(new_tenants)),
        ],
        'totals': {'direct_deals': len(deals - negotiated)},
        'hot_units': hot,
        'least_units': least,
    }
