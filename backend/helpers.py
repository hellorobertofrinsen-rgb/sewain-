from __future__ import annotations

import calendar
from datetime import datetime, date, timedelta, timezone

from bson import ObjectId
from fastapi import HTTPException

from models import now_utc, today_wib, Payment

MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus',
             'September', 'Oktober', 'November', 'Desember']


def oid(value: str | None, what: str = 'Data') -> ObjectId:
    """Parse an id from the URL/body; malformed ids are a 404, not a server error."""
    if not value or not ObjectId.is_valid(value):
        raise HTTPException(404, f'{what} tidak ditemukan')
    return ObjectId(value)


def parse_date(s):
    if not s:
        return None
    s = str(s).strip()
    for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y'):
        try:
            return datetime.strptime(s[:10], fmt).date()
        except Exception:
            continue
    return None


def last_day_of_month(y: int, m: int) -> int:
    return calendar.monthrange(y, m)[1]


def add_months(d: date, months: int) -> date:
    y, m = divmod(d.month - 1 + months, 12)
    y, m = d.year + y, m + 1
    return date(y, m, min(d.day, last_day_of_month(y, m)))


def contract_end(start_iso: str, months: int) -> str:
    """Last day of a contract of `months` months starting on start (1 Okt + 12 bln -> 30 Sep)."""
    start = parse_date(start_iso) or today_wib().date()
    return (add_months(start, months) - timedelta(days=1)).isoformat()


def period_label(period: str, months: int = 1) -> str:
    try:
        y, m = (int(x) for x in period.split('-'))
        if months > 1:
            end = add_months(date(y, m, 1), months - 1)
            return f'{MONTHS_ID[m - 1][:3]} {y}–{MONTHS_ID[end.month - 1][:3]} {end.year}'
        return f'{MONTHS_ID[m - 1]} {y}'
    except Exception:
        return period


async def log_activity_async(account_id: str, action: str, entity: str, title: str,
                             entity_id: str | None = None, detail: str | None = None,
                             origin: str = 'user'):
    from bson import ObjectId
    from database import activities
    await activities.insert_one({
        '_id': ObjectId(),
        'account_id': account_id,
        'action': action,
        'entity': entity,
        'entity_id': entity_id,
        'title': title,
        'detail': detail,
        'origin': origin,
        'created_at': now_utc(),
    })


PAYMENT_INTERVALS = (1, 3, 6, 12)


def generate_payments(account_id: str, tenant_id: str, unit_id: str, monthly_rent: int,
                      start_date: str, end_date: str | None, due_day: int,
                      origin: str = 'user', interval: int = 1) -> list[dict]:
    """Rent bills for a contract, one per `interval` months counted from the start date.

    A 6-month contract has 6 monthly bills (or 1 bill with interval 6), whatever day of
    the month it starts. Each bill is due on `due_day` of the month its period starts
    (the first one never before move-in). The last bill only covers the months left.
    Capped at 60 bills.
    """
    interval = interval if interval in PAYMENT_INTERVALS else 1
    start = parse_date(start_date) or today_wib().date()
    end = parse_date(end_date) or (add_months(start, 12) - timedelta(days=1))
    due_day = max(1, min(28, int(due_day or 10)))
    out = []
    k = 0
    while len(out) < 60:
        p_start = add_months(start, k * interval)
        if p_start > end:
            break
        covered = sum(1 for j in range(interval) if add_months(start, k * interval + j) <= end)
        due = date(p_start.year, p_start.month, min(due_day, last_day_of_month(p_start.year, p_start.month)))
        if k == 0 and due < start:
            due = start
        p = Payment(
            account_id=account_id, tenant_id=tenant_id, unit_id=unit_id,
            period=f'{p_start.year:04d}-{p_start.month:02d}', amount=monthly_rent * covered, months=covered,
            due_date=due.isoformat(), origin=origin,
        )
        out.append(p.to_mongo())
        k += 1
    return out


def days_since(d: datetime | None) -> int | None:
    if not d:
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return max(0, (now_utc() - d).days)


def days_late(due_iso: str) -> int:
    due = parse_date(due_iso)
    if not due:
        return 0
    return max(0, (today_wib().date() - due).days)
