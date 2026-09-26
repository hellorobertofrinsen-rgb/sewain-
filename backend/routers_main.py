from __future__ import annotations

import csv
import io
import re
from datetime import datetime, timedelta, timezone

import jwt
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

from auth_utils import ALGORITHM, SECRET, bearer, current_account, account_id
from database import properties, units, leads, viewings, tenants, payments, maintenance, activities, bookings, files
from helpers import (PAYMENT_INTERVALS, log_activity_async, generate_payments, days_late, days_since,
                     parse_date, oid, contract_end, period_label)
from matching import (AUTO_MATCH_MIN_SCORE, TYPES_BY_CATEGORY, UNIT_CATEGORIES, clean_prefs,
                      guess_issue_category, match_score, rank_units)
from models import Booking, Property, Unit, Lead, Viewing, Tenant, Maintenance, now_utc, today_wib, local_tz
from plans import (CLOSED_LEAD_STATUSES, ensure_can_create_lead, ensure_can_create_units,
                   require_feature, unit_query)

router = APIRouter(prefix='/api')


def noid(d: dict) -> dict:
    d = dict(d)
    d['id'] = str(d.pop('_id'))
    return d


async def _props_map(aid: str) -> dict:
    docs = await properties.find({'account_id': aid, 'deleted_at': None}).to_list(None)
    return {str(p['_id']): p for p in docs}


async def _units_map(aid: str) -> dict:
    """All of the account's units by id — for showing names. Use unit_query() to decide visibility."""
    docs = await units.find({'account_id': aid, 'deleted_at': None}).to_list(None)
    return {str(u['_id']): u for u in docs}


async def _visible_units(user: dict, **extra) -> list[dict]:
    return await units.find(await unit_query(user, **extra)).sort('name', 1).to_list(None)


def unit_location(u: dict, pmap: dict) -> str:
    """Where the unit is, from what the agent entered: property, address, area, city."""
    p = pmap.get(u.get('property_id') or '', {}) if u else {}
    pname = p.get('name') if p.get('name') != DEFAULT_PROPERTY else None
    parts = [(u or {}).get('address'), pname, p.get('address'), p.get('area'), p.get('city') or (u or {}).get('city')]
    seen: list[str] = []
    for x in parts:
        if x and x.strip() and x.strip() not in seen:
            seen.append(x.strip())
    return ', '.join(seen)


def unit_out(u: dict, pmap: dict) -> dict:
    d = noid(u)
    p = pmap.get(u.get('property_id') or '', {})
    d['property_name'] = p.get('name', '')
    d['property_type'] = p.get('type', '')
    d['property_area'] = p.get('area', '')
    d['location'] = unit_location(u, pmap)
    return d


def unit_brief(u: dict, pmap: dict | None = None) -> dict:
    return {'id': str(u['_id']), 'name': u['name'], 'category': u.get('category'), 'unit_type': u.get('unit_type', ''),
            'monthly_price': u.get('monthly_price', 0), 'daily_price': u.get('daily_price'),
            'yearly_price': u.get('yearly_price'), 'status': u.get('status'),
            'property_name': ((pmap or {}).get(u.get('property_id') or '') or {}).get('name', '')}


def lead_out(l: dict, umap: dict, pmap: dict | None = None) -> dict:
    d = noid(l)
    u = umap.get(l.get('matched_unit_id') or '')
    if u:
        d['matched_unit'] = unit_brief(u, pmap)
    return d


def _iso(v) -> str | None:
    return v.isoformat() if isinstance(v, datetime) else (str(v) if v else None)


def _aware(v: datetime | None) -> datetime | None:
    """MongoDB hands datetimes back without a zone; they are stored in UTC."""
    if isinstance(v, datetime) and v.tzinfo is None:
        return v.replace(tzinfo=timezone.utc)
    return v


def _parse_when(s: str) -> datetime:
    try:
        when = datetime.fromisoformat(s)
    except Exception:
        raise HTTPException(400, 'Format tanggal tidak valid')
    return when.replace(tzinfo=local_tz()) if when.tzinfo is None else when


def _check_date(s: str | None, label: str = 'Tanggal') -> str | None:
    if not s:
        return None
    d = parse_date(s)
    if not d:
        raise HTTPException(400, f'{label} harus format YYYY-MM-DD')
    return d.isoformat()


# ============================== Properties ===================================

class PropertyIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    type: str = 'apartment'
    city: str | None = None
    area: str | None = None
    address: str | None = None
    notes: str | None = None


@router.get('/properties')
async def list_properties(user: dict = Depends(current_account)):
    aid = account_id(user)
    docs = await properties.find({'account_id': aid, 'deleted_at': None}).sort('created_at', 1).to_list(None)
    out = []
    for p in docs:
        d = noid(p)
        d['unit_count'] = await units.count_documents({'account_id': aid, 'property_id': d['id'], 'deleted_at': None})
        out.append(d)
    return out


@router.post('/properties')
async def create_property(body: PropertyIn, user: dict = Depends(current_account)):
    aid = account_id(user)
    p = Property(account_id=aid, **body.model_dump())
    await properties.insert_one(p.to_mongo())
    await log_activity_async(aid, 'property_added', 'property', f'Menambahkan properti {p.name}', p.id)
    return noid(p.to_mongo())


@router.put('/properties/{pid}')
async def update_property(pid: str, body: PropertyIn, user: dict = Depends(current_account)):
    res = await properties.update_one({'_id': oid(pid, 'Properti'), 'account_id': account_id(user), 'deleted_at': None},
                                      {'$set': body.model_dump()})
    if not res.matched_count:
        raise HTTPException(404, 'Properti tidak ditemukan')
    return {'ok': True}


@router.delete('/properties/{pid}')
async def delete_property(pid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    if await units.count_documents({'account_id': aid, 'property_id': pid, 'deleted_at': None}):
        raise HTTPException(400, 'Hapus atau pindahkan unit di properti ini dulu')
    await properties.update_one({'_id': oid(pid, 'Properti'), 'account_id': aid},
                                {'$set': {'deleted_at': now_utc()}})
    return {'ok': True}


# ============================== Units =========================================

UNIT_STATUSES = ('kosong', 'terisi', 'reserved', 'maintenance')


class UnitIn(BaseModel):
    property_id: str | None = None
    property_name: str | None = Field(default=None, max_length=120)  # creates the property if new
    name: str = Field(min_length=1, max_length=60)
    category: str | None = None  # apartemen | rumah
    address: str | None = Field(default=None, max_length=200)
    unit_type: str = 'Studio'
    monthly_price: int = Field(default=0, ge=0)
    deposit: int = Field(default=0, ge=0)
    bedrooms: int = 1
    bathrooms: int = 1
    furnished: bool = True
    facilities: list[str] = Field(default_factory=list)
    available_date: str | None = None
    status: str = 'kosong'
    notes: str | None = None
    owner_name: str | None = Field(default=None, max_length=80)
    owner_phone: str | None = Field(default=None, max_length=40)
    daily_price: int | None = Field(default=None, ge=0)
    yearly_price: int | None = Field(default=None, ge=0)


class UnitPatch(BaseModel):
    property_id: str | None = None
    name: str | None = Field(default=None, min_length=1, max_length=60)
    category: str | None = None
    address: str | None = Field(default=None, max_length=200)
    unit_type: str | None = None
    monthly_price: int | None = Field(default=None, ge=0)
    deposit: int | None = Field(default=None, ge=0)
    bedrooms: int | None = None
    bathrooms: int | None = None
    furnished: bool | None = None
    facilities: list[str] | None = None
    available_date: str | None = None
    status: str | None = None
    notes: str | None = None
    owner_name: str | None = Field(default=None, max_length=80)
    owner_phone: str | None = Field(default=None, max_length=40)
    daily_price: int | None = Field(default=None, ge=0)
    yearly_price: int | None = Field(default=None, ge=0)


DEFAULT_PROPERTY = 'Properti utama'


def _check_unit_kind(category: str | None, unit_type: str | None) -> None:
    """A unit is an apartment or a house, with a size from that category's list."""
    if category is None:
        return
    if category not in UNIT_CATEGORIES:
        raise HTTPException(400, 'Jenis unit harus Apartemen atau Rumah')
    if unit_type not in TYPES_BY_CATEGORY[category]:
        raise HTTPException(400, 'Tipe unit tidak sesuai jenisnya')


async def _resolve_property(aid: str, property_id: str | None, property_name: str | None) -> dict:
    """Units don't need a property set up first: pick one by id or name, or make one."""
    pmap = await _props_map(aid)
    if property_id:
        p = pmap.get(property_id)
        if not p:
            raise HTTPException(404, 'Properti tidak ditemukan')
        return p
    name = (property_name or '').strip() or DEFAULT_PROPERTY
    for p in pmap.values():
        if p.get('name', '').strip().lower() == name.lower():
            return p
    prop = Property(account_id=aid, name=name, type='lainnya')
    await properties.insert_one(prop.to_mongo())
    return prop.to_mongo()


async def _get_visible_unit(user: dict, uid: str) -> dict:
    u = await units.find_one(await unit_query(user, _id=oid(uid, 'Unit')))
    if not u:
        raise HTTPException(404, 'Unit tidak ditemukan')
    return u


@router.get('/units')
async def list_units(status: str | None = None, user: dict = Depends(current_account)):
    extra = {'status': status} if status and status != 'semua' else {}
    docs = await _visible_units(user, **extra)
    pmap = await _props_map(account_id(user))
    return [unit_out(u, pmap) for u in docs]


@router.post('/units')
async def create_unit(body: UnitIn, user: dict = Depends(current_account)):
    aid = account_id(user)
    if body.status not in UNIT_STATUSES:
        raise HTTPException(400, 'Status unit tidak valid')
    _check_unit_kind(body.category, body.unit_type)
    await ensure_can_create_units(user)
    p = await _resolve_property(aid, body.property_id, body.property_name)
    pmap = await _props_map(aid)
    data = body.model_dump(exclude={'property_name'}) | {'property_id': str(p['_id'])}
    # No price of any kind yet: the unit isn't on the market, so it shows as "Renovating…".
    if not (body.monthly_price or body.daily_price or body.yearly_price) and body.status == 'kosong':
        data['status'] = 'maintenance'
    u = Unit(account_id=aid, **data)
    u.city = p.get('city')
    u.available_date = _check_date(body.available_date, 'Tanggal available')
    if u.status == 'kosong':
        u.vacant_since = now_utc()
    await units.insert_one(u.to_mongo())
    await log_activity_async(aid, 'unit_added', 'unit', f'Menambahkan unit {u.name}', u.id)
    return unit_out(u.to_mongo(), pmap)


@router.get('/units/{uid}')
async def get_unit(uid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    u = await _get_visible_unit(user, uid)
    out = unit_out(u, await _props_map(aid))
    t = await tenants.find_one({'account_id': aid, 'unit_id': uid, 'status': 'aktif', 'deleted_at': None})
    out['tenant'] = {'id': str(t['_id']), 'name': t['name'], 'end_date': t.get('end_date'),
                     'days_left': _days_left(t.get('end_date'))} if t else None
    return out


@router.put('/units/{uid}')
@router.patch('/units/{uid}')
async def update_unit(uid: str, body: UnitPatch, user: dict = Depends(current_account)):
    aid = account_id(user)
    old = await _get_visible_unit(user, uid)
    data = body.model_dump(exclude_unset=True)
    if 'category' in data or 'unit_type' in data:
        _check_unit_kind(data.get('category', old.get('category')), data.get('unit_type', old.get('unit_type')))
    if 'status' in data and data['status'] not in UNIT_STATUSES:
        raise HTTPException(400, 'Status unit tidak valid')
    if 'property_id' in data:
        p = (await _props_map(aid)).get(data['property_id'] or '')
        if not p:
            raise HTTPException(404, 'Properti tidak ditemukan')
        data['city'] = p.get('city')
    if 'available_date' in data:
        data['available_date'] = _check_date(data['available_date'], 'Tanggal available')
    new_status = data.get('status')
    if new_status == 'kosong' and old.get('status') != 'kosong':
        data['vacant_since'] = now_utc()
        data['occupied_since'] = None
    if new_status == 'terisi' and old.get('status') != 'terisi':
        data['occupied_since'] = now_utc()
        data['vacant_since'] = None
    if data:
        await units.update_one({'_id': old['_id']}, {'$set': data})
    return await get_unit(uid, user)


@router.delete('/units/{uid}')
async def delete_unit(uid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    u = await _get_visible_unit(user, uid)
    if await tenants.count_documents({'account_id': aid, 'unit_id': uid, 'status': 'aktif', 'deleted_at': None}):
        raise HTTPException(400, f'Unit {u["name"]} masih ada tenant aktif. Proses checkout dulu.')
    await units.update_one({'_id': u['_id']}, {'$set': {'deleted_at': now_utc()}})
    await log_activity_async(aid, 'unit_deleted', 'unit', f'Menghapus unit {u["name"]}', uid)
    return {'ok': True}


@router.get('/units/{uid}/matches')
async def unit_matches(uid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    u = await _get_visible_unit(user, uid)
    pmap = await _props_map(aid)
    p = pmap.get(u.get('property_id') or '', {})
    uo = unit_out(u, pmap)
    lead_docs = await leads.find({'account_id': aid, 'deleted_at': None,
                                  'status': {'$nin': CLOSED_LEAD_STATUSES}}).to_list(None)
    scored = []
    for l in lead_docs:
        s, r = match_score(l, uo, p.get('name', ''), p.get('area', ''))
        if s > 0:
            scored.append((s, r, l))
    scored.sort(key=lambda x: -x[0])
    return {'unit': uo, 'matches': [
        {'lead': lead_out(l, {}), 'score': s, 'reasons': r} for s, r, l in scored[:5]
    ]}


def _csv_int(v, default=0):
    digits = re.sub(r'[^\d]', '', str(v or ''))
    return int(digits) if digits else default


@router.post('/units/import-csv')
async def import_units_csv(body: dict, user: dict = Depends(current_account)):
    require_feature(user, 'bulk_import', 'feature_bulk_import')
    aid = account_id(user)
    text = (body.get('csv_text') or '').strip()
    if not text:
        raise HTTPException(400, 'CSV kosong')
    rows = list(csv.DictReader(io.StringIO(text)))
    await ensure_can_create_units(user, len(rows))
    holder = await _resolve_property(aid, None, None)
    kinds = {'apartemen': 'apartemen', 'apartment': 'apartemen', 'apt': 'apartemen', 'rumah': 'rumah', 'house': 'rumah'}
    imported, errors = 0, []
    for i, row in enumerate(rows, start=2):
        row = {(k or '').strip().lower(): (v or '').strip() for k, v in row.items() if isinstance(v, str) or v is None}
        name = row.get('name') or row.get('nama')
        category = kinds.get((row.get('jenis') or row.get('category') or '').lower())
        unit_type = _norm_size(row.get('tipe') or row.get('unit_type') or '')
        address = row.get('alamat') or row.get('address') or row.get('lokasi')
        if not name or not category or not address:
            errors.append(f'Baris {i}: kolom nama, jenis (apartemen/rumah), dan alamat wajib diisi')
            continue
        if unit_type not in TYPES_BY_CATEGORY[category]:
            errors.append(f'Baris {i}: tipe "{row.get("tipe") or row.get("unit_type") or ""}" tidak ada untuk {category}')
            continue
        monthly = _csv_int(row.get('harga_bulanan') or row.get('monthly_price') or row.get('harga'))
        daily = _csv_int(row.get('harga_harian') or row.get('daily_price')) or None
        yearly = _csv_int(row.get('harga_tahunan') or row.get('yearly_price')) or None
        status = {'vacant': 'kosong', 'occupied': 'terisi', 'kosong': 'kosong', 'terisi': 'terisi',
                  'reserved': 'reserved', 'maintenance': 'maintenance',
                  'perbaikan': 'maintenance'}.get((row.get('status') or 'kosong').lower(), 'kosong')
        if not (monthly or daily or yearly) and status == 'kosong':
            status = 'maintenance'  # no price yet: "Renovating…"
        u = Unit(account_id=aid, property_id=str(holder['_id']), name=name, category=category, unit_type=unit_type,
                 address=address, monthly_price=monthly, daily_price=daily, yearly_price=yearly,
                 bedrooms=1 if unit_type == 'Studio' else int(unit_type[0]), status=status,
                 vacant_since=now_utc() if status == 'kosong' else None)
        await units.insert_one(u.to_mongo())
        imported += 1
    await log_activity_async(aid, 'units_imported', 'unit', f'Impor {imported} unit dari CSV')
    return {'imported': imported, 'errors': errors}


def _norm_size(v: str) -> str:
    """'studio', '2br', '2 kamar' -> the size names used in the app."""
    x = v.strip().lower()
    if x == 'studio':
        return 'Studio'
    m = re.match(r'^(\d)\s*(bedroom|br|kamar|kt|kamar tidur)?$', x)
    return f'{m.group(1)} Bedroom' if m else v.strip()


async def _set_person_photo(coll, doc: dict, aid: str, file: UploadFile | None) -> str | None:
    """Replace (or with file=None remove) the photo of a prospect or tenant."""
    path = None
    if file is not None:
        from storage import save_photo
        try:
            path = await save_photo(aid, file)
        except ValueError as e:
            raise HTTPException(400, str(e))
    await coll.update_one({'_id': doc['_id']}, {'$set': {'photo': path}})
    if doc.get('photo'):
        await files.delete_one({'path': doc['photo'], 'owner_id': aid})
    return path


@router.post('/leads/{lid}/photo')
async def upload_lead_photo(lid: str, file: UploadFile, user: dict = Depends(current_account)):
    aid = account_id(user)
    return {'photo': await _set_person_photo(leads, await _get_lead(aid, lid), aid, file)}


@router.delete('/leads/{lid}/photo')
async def delete_lead_photo(lid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    return {'photo': await _set_person_photo(leads, await _get_lead(aid, lid), aid, None)}


@router.post('/tenants/{tid}/photo')
async def upload_tenant_photo(tid: str, file: UploadFile, user: dict = Depends(current_account)):
    aid = account_id(user)
    return {'photo': await _set_person_photo(tenants, await _get_tenant(aid, tid), aid, file)}


@router.delete('/tenants/{tid}/photo')
async def delete_tenant_photo(tid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    return {'photo': await _set_person_photo(tenants, await _get_tenant(aid, tid), aid, None)}


@router.post('/units/{uid}/photos')
async def upload_unit_photo(uid: str, file: UploadFile, user: dict = Depends(current_account)):
    from storage import MAX_PHOTOS_PER_UNIT, save_photo
    u = await _get_visible_unit(user, uid)
    if len(u.get('photos') or []) >= MAX_PHOTOS_PER_UNIT:
        raise HTTPException(400, f'Maksimal {MAX_PHOTOS_PER_UNIT} foto per unit')
    try:
        path = await save_photo(account_id(user), file)
    except ValueError as e:
        raise HTTPException(400, str(e))
    await units.update_one({'_id': u['_id']}, {'$push': {'photos': path}})
    return {'path': path, 'url': f'/api/files/{path}'}


# ============================== Daily bookings ================================

class BookingIn(BaseModel):
    guest_name: str = Field(min_length=1, max_length=80)
    phone: str | None = Field(default=None, max_length=40)
    check_in: str
    check_out: str
    price_per_night: int | None = Field(default=None, ge=0)
    note: str | None = Field(default=None, max_length=300)


@router.get('/units/{uid}/bookings')
async def list_bookings(uid: str, user: dict = Depends(current_account)):
    u = await _get_visible_unit(user, uid)
    docs = await bookings.find({'account_id': account_id(user), 'unit_id': str(u['_id']), 'deleted_at': None})\
        .sort('check_in', -1).to_list(None)
    return [noid(b) for b in docs]


@router.post('/units/{uid}/bookings')
async def create_booking(uid: str, body: BookingIn, user: dict = Depends(current_account)):
    aid = account_id(user)
    u = await _get_visible_unit(user, uid)
    cin, cout = parse_date(body.check_in), parse_date(body.check_out)
    if not cin or not cout:
        raise HTTPException(400, 'Tanggal check-in dan check-out harus format YYYY-MM-DD')
    if cout <= cin:
        raise HTTPException(400, 'Check-out harus setelah check-in')
    clash = await bookings.find_one({'account_id': aid, 'unit_id': str(u['_id']), 'deleted_at': None,
                                     'check_in': {'$lt': cout.isoformat()}, 'check_out': {'$gt': cin.isoformat()}})
    if clash:
        raise HTTPException(409, f'Tanggal bentrok dengan booking {clash["guest_name"]}')
    nights = (cout - cin).days
    price = body.price_per_night if body.price_per_night is not None else (u.get('daily_price') or 0)
    b = Booking(account_id=aid, unit_id=str(u['_id']), guest_name=body.guest_name.strip(), phone=body.phone,
                check_in=cin.isoformat(), check_out=cout.isoformat(), nights=nights, price_per_night=price,
                total=nights * price, note=body.note)
    await bookings.insert_one(b.to_mongo())
    await log_activity_async(aid, 'booking_added', 'booking', f'Booking {b.guest_name} di unit {u["name"]} ({nights} malam)', b.id)
    return noid(b.to_mongo())


@router.delete('/bookings/{bid}')
async def delete_booking(bid: str, user: dict = Depends(current_account)):
    res = await bookings.update_one({'_id': oid(bid, 'Booking'), 'account_id': account_id(user), 'deleted_at': None},
                                    {'$set': {'deleted_at': now_utc()}})
    if not res.matched_count:
        raise HTTPException(404, 'Booking tidak ditemukan')
    return {'ok': True}


@router.get('/files/{fpath:path}')
async def get_file(fpath: str, token: str | None = None,
                   cred: HTTPAuthorizationCredentials | None = Depends(bearer)):
    """Serve an uploaded photo to its owner. Native sends the Bearer header; web <img> uses ?token=."""
    from storage import read_photo
    raw = (cred.credentials if cred else None) or token
    try:
        aid = jwt.decode(raw, SECRET, algorithms=[ALGORITHM]).get('sub') if raw else None
    except Exception:
        aid = None
    if not aid:
        raise HTTPException(401, 'Tidak punya akses ke file ini')
    found = await read_photo(fpath, aid)
    if not found:
        raise HTTPException(404, 'File tidak ditemukan')
    data, ctype = found
    return Response(content=data, media_type=ctype, headers={'Cache-Control': 'private, max-age=604800'})


# ============================== Leads =========================================

class LeadIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    phone: str | None = Field(default=None, max_length=40)
    budget_min: int | None = Field(default=None, ge=0)
    budget_max: int | None = Field(default=None, ge=0)
    preferred_location: str | None = None
    unit_type: str | None = None
    move_in_date: str | None = None
    occupants: int | None = None
    requirements: list[str] = Field(default_factory=list)
    interest: str = 'medium'
    notes: str | None = Field(default=None, max_length=2000)
    next_followup_date: str | None = None
    pref_category: str | None = None
    pref_types: list[str] = Field(default_factory=list)
    pref_terms: list[str] = Field(default_factory=list)


class LeadPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    phone: str | None = Field(default=None, max_length=40)
    budget_min: int | None = Field(default=None, ge=0)
    budget_max: int | None = Field(default=None, ge=0)
    preferred_location: str | None = None
    unit_type: str | None = None
    move_in_date: str | None = None
    occupants: int | None = None
    requirements: list[str] | None = None
    interest: str | None = None
    notes: str | None = Field(default=None, max_length=2000)
    next_followup_date: str | None = None
    matched_unit_id: str | None = None
    pref_category: str | None = None
    pref_types: list[str] | None = None
    pref_terms: list[str] | None = None


LEAD_CRITERIA = {'budget_min', 'budget_max', 'preferred_location', 'unit_type', 'requirements',
                 'pref_category', 'pref_types', 'pref_terms'}


async def _get_lead(aid: str, lid: str) -> dict:
    l = await leads.find_one({'_id': oid(lid, 'Calon penyewa'), 'account_id': aid, 'deleted_at': None})
    if not l:
        raise HTTPException(404, 'Calon penyewa tidak ditemukan')
    return l


async def _available_units(user: dict) -> list[dict]:
    pmap = await _props_map(account_id(user))
    docs = await _visible_units(user, status={'$in': ['kosong', 'reserved']})
    return [unit_out(u, pmap) for u in docs]


async def _auto_match(user: dict, lead: dict) -> dict:
    """Best available unit for the lead (deterministic score). Empty dict when nothing convincing."""
    best = rank_units(lead, await _available_units(user), limit=1)
    if best and best[0][0] >= AUTO_MATCH_MIN_SCORE:
        score, reasons, u = best[0]
        return {'matched_unit_id': u['id'], 'match_score': score, 'match_reasons': reasons}
    return {}


@router.get('/leads')
async def list_leads(status: str | None = None, user: dict = Depends(current_account)):
    aid = account_id(user)
    q: dict = {'account_id': aid, 'deleted_at': None}
    if status == 'aktif':
        q['status'] = {'$nin': CLOSED_LEAD_STATUSES}
    elif status and status != 'semua':
        q['status'] = status
    docs = await leads.find(q).sort([('last_interaction_at', -1)]).to_list(None)
    umap = await _units_map(aid)
    # Viewing facts the agent recorded, for "Sudah viewing 3 hari lalu" / "Viewing Sabtu 14.00".
    now = now_utc()
    pmap = await _props_map(aid)
    last_v: dict[str, datetime] = {}
    next_v: dict[str, datetime] = {}
    next_doc: dict[str, dict] = {}
    for v in await viewings.find({'account_id': aid, 'deleted_at': None, 'status': {'$ne': 'batal'}}).to_list(None):
        when = _aware(v.get('scheduled_at'))
        lid = v.get('lead_id') or ''
        if not when:
            continue
        if when <= now:
            if lid not in last_v or when > last_v[lid]:
                last_v[lid] = when
        elif v.get('status') in ('menunggu', 'terjadwal') and (lid not in next_v or when < next_v[lid]):
            next_v[lid] = when
            next_doc[lid] = v
    out = []
    for l in docs:
        d = lead_out(l, umap)
        d['last_viewing_at'] = _iso(last_v.get(d['id']))
        d['next_viewing_at'] = _iso(next_v.get(d['id']))
        nv = next_doc.get(d['id'])
        if nv:
            d['next_viewing'] = {'id': str(nv['_id']), 'at': _iso(next_v[d['id']]),
                                 **viewing_units(nv, umap, pmap), 'calendar_added': bool(nv.get('calendar_added'))}
        out.append(d)
    return out


@router.post('/leads')
async def create_lead(body: LeadIn, user: dict = Depends(current_account)):
    aid = account_id(user)
    await ensure_can_create_lead(user)
    data = body.model_dump()
    data['next_followup_date'] = _check_date(body.next_followup_date, 'Tanggal follow-up')
    if data['interest'] not in ('high', 'medium', 'low'):
        data['interest'] = 'medium'
    data['requirements'] = [r.strip()[:60] for r in data['requirements'] if r.strip()][:8]
    data.update(clean_prefs(data.pop('pref_category'), data.pop('pref_types'), data.pop('pref_terms')))
    data.update(await _auto_match(user, data))
    l = Lead(account_id=aid, **data, last_interaction_at=now_utc(), status='baru')
    await leads.insert_one(l.to_mongo())
    await log_activity_async(aid, 'lead_added', 'lead', f'Menambahkan calon penyewa {l.name}', l.id)
    return lead_out(l.to_mongo(), await _units_map(aid))


@router.get('/leads/{lid}')
async def get_lead(lid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    l = await _get_lead(aid, lid)
    umap = await _units_map(aid)
    pmap = await _props_map(aid)
    out = lead_out(l, umap, pmap)
    vdocs = await viewings.find({'account_id': aid, 'lead_id': out['id'], 'deleted_at': None})\
        .sort('scheduled_at', -1).to_list(None)
    out['viewings'] = []
    for v in vdocs:
        out['viewings'].append(noid(v) | viewing_units(v, umap, pmap))
    out['suggestions'] = []
    if l.get('status') not in CLOSED_LEAD_STATUSES:
        for s, r, u in rank_units(l, await _available_units(user), limit=3):
            out['suggestions'].append({'unit': {k: u.get(k) for k in ('id', 'name', 'category', 'unit_type', 'monthly_price', 'daily_price', 'yearly_price', 'status', 'property_name')},
                                       'score': s, 'reasons': r})
    t = await tenants.find_one({'account_id': aid, 'lead_id': out['id'], 'deleted_at': None}, {'_id': 1})
    out['tenant_id'] = str(t['_id']) if t else None
    return out


@router.put('/leads/{lid}')
@router.patch('/leads/{lid}')
async def update_lead(lid: str, body: LeadPatch, user: dict = Depends(current_account)):
    """Partial update: only fields present in the request change (AI/stage data is preserved)."""
    aid = account_id(user)
    l = await _get_lead(aid, lid)
    data = body.model_dump(exclude_unset=True)
    if 'next_followup_date' in data:
        data['next_followup_date'] = _check_date(data['next_followup_date'], 'Tanggal follow-up')
    if 'interest' in data and data['interest'] not in ('high', 'medium', 'low'):
        data.pop('interest')
    if 'requirements' in data:
        data['requirements'] = [r.strip()[:60] for r in (data['requirements'] or []) if r.strip()][:8]
    if {'pref_category', 'pref_types', 'pref_terms'} & data.keys():
        data.update(clean_prefs(data.get('pref_category', l.get('pref_category')),
                                data.get('pref_types', l.get('pref_types')) or [],
                                data.get('pref_terms', l.get('pref_terms')) or []))
    if 'matched_unit_id' in data:
        if data['matched_unit_id']:
            u = await _get_visible_unit(user, data['matched_unit_id'])
            s, r = match_score({**l, **data}, u)
            data.update({'match_score': s, 'match_reasons': r})
        else:
            data.update({'match_score': None, 'match_reasons': []})
    elif LEAD_CRITERIA & data.keys() and not l.get('matched_unit_id') and l.get('status') not in CLOSED_LEAD_STATUSES:
        data.update(await _auto_match(user, {**l, **data}))
    if data:
        await leads.update_one({'_id': l['_id']}, {'$set': data})
    return await get_lead(lid, user)


@router.delete('/leads/{lid}')
async def delete_lead(lid: str, user: dict = Depends(current_account)):
    await leads.update_one({'_id': oid(lid, 'Calon penyewa'), 'account_id': account_id(user)},
                           {'$set': {'deleted_at': now_utc()}})
    return {'ok': True}


class ContactedIn(BaseModel):
    message: str | None = Field(default=None, max_length=4000)
    next_followup_date: str | None = None


@router.post('/leads/{lid}/contacted')
async def lead_contacted(lid: str, body: ContactedIn, user: dict = Depends(current_account)):
    aid = account_id(user)
    l = await _get_lead(aid, lid)
    setq: dict = {'last_contact_at': now_utc(), 'needs_followup': False, 'last_interaction_at': now_utc(),
                  'next_followup_date': _check_date(body.next_followup_date, 'Tanggal follow-up'),
                  'suggested_followup': None}
    if l.get('status') in ('baru', 'perlu_followup'):
        setq['status'] = 'sedang_ngobrol'
    if not l.get('first_contact_at'):
        setq['first_contact_at'] = now_utc()
    if body.message:
        setq['last_message'] = body.message
    await leads.update_one({'_id': l['_id']}, {'$set': setq})
    await log_activity_async(aid, 'followup_sent', 'lead', f'Follow-up {l["name"]} dikirim', lid)
    return await get_lead(lid, user)


class NotInterestedIn(BaseModel):
    reason: str | None = Field(default=None, max_length=200)


@router.post('/leads/{lid}/not-interested')
async def lead_not_interested(lid: str, body: NotInterestedIn | None = None, user: dict = Depends(current_account)):
    aid = account_id(user)
    l = await _get_lead(aid, lid)
    await leads.update_one({'_id': l['_id']}, {'$set': {'status': 'tidak_jadi', 'needs_followup': False,
                                                        'next_followup_date': None, 'closed_at': now_utc(),
                                                        'lost_reason': (body.reason if body else None)}})
    await viewings.update_many({'account_id': aid, 'lead_id': lid, 'status': {'$in': ['menunggu', 'terjadwal']}},
                               {'$set': {'status': 'batal'}})
    await log_activity_async(aid, 'lead_lost', 'lead', f'{l["name"]} tidak jadi', lid)
    return {'ok': True}


@router.post('/leads/{lid}/reopen')
async def lead_reopen(lid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    l = await _get_lead(aid, lid)
    if l.get('status') != 'tidak_jadi':
        raise HTTPException(400, 'Calon penyewa ini masih aktif')
    await ensure_can_create_lead(user)
    await leads.update_one({'_id': l['_id']}, {'$set': {'status': 'sedang_ngobrol', 'last_interaction_at': now_utc()}})
    return await get_lead(lid, user)


class NegotiationIn(BaseModel):
    unit_id: str | None = None
    agreed_price: int | None = Field(default=None, ge=0)
    deposit: int | None = Field(default=None, ge=0)
    contract_months: int | None = Field(default=None, ge=1, le=60)
    payment_interval_months: int | None = None
    commission: int | None = Field(default=None, ge=0)
    note: str | None = Field(default=None, max_length=1000)


@router.post('/leads/{lid}/negotiation')
async def lead_negotiation(lid: str, body: NegotiationIn, user: dict = Depends(current_account)):
    """Move a lead into negotiation and remember the terms; the deal form starts from these."""
    aid = account_id(user)
    l = await _get_lead(aid, lid)
    if l.get('status') in CLOSED_LEAD_STATUSES:
        raise HTTPException(400, 'Calon penyewa ini sudah ditutup')
    unit_id = body.unit_id or (l.get('negotiation') or {}).get('unit_id') or l.get('matched_unit_id')
    if unit_id:
        await _get_visible_unit(user, unit_id)
    terms = body.model_dump() | {'unit_id': unit_id, 'updated_at': now_utc()}
    setq = {'status': 'negotiation', 'negotiation': terms, 'needs_followup': False,
            'last_interaction_at': now_utc()}
    if unit_id:
        setq['matched_unit_id'] = unit_id
    await leads.update_one({'_id': l['_id']}, {'$set': setq})
    # Viewings that already happened are done once negotiation starts.
    await viewings.update_many({'account_id': aid, 'lead_id': lid, 'status': {'$in': ['menunggu', 'terjadwal']},
                                'scheduled_at': {'$lt': now_utc()}}, {'$set': {'status': 'selesai'}})
    await log_activity_async(aid, 'lead_negotiation', 'lead', f'Negosiasi dengan {l["name"]}', lid)
    return await get_lead(lid, user)


class DealIn(BaseModel):
    unit_id: str | None = None
    start_date: str | None = None
    contract_months: int | None = Field(default=None, ge=1, le=60)
    end_date: str | None = None
    due_day: int | None = Field(default=None, ge=1, le=28)
    monthly_rent: int | None = Field(default=None, ge=0)
    deposit: int | None = Field(default=None, ge=0)
    payment_interval_months: int | None = None
    commission: int | None = Field(default=None, ge=0)


def _interval(v: int | None) -> int:
    if v is None:
        return 1
    if v not in PAYMENT_INTERVALS:
        raise HTTPException(400, 'Pembayaran harus tiap 1, 3, 6, atau 12 bulan')
    return v


@router.post('/leads/{lid}/deal')
async def lead_deal(lid: str, body: DealIn, user: dict = Depends(current_account)):
    """Close the deal: the lead becomes a tenant, unit becomes terisi, monthly bills are created.

    Defaults come from the negotiation terms, then the unit — the agent never re-types data.
    """
    aid = account_id(user)
    l = await _get_lead(aid, lid)
    if l.get('status') == 'deal':
        raise HTTPException(400, f'{l["name"]} sudah jadi tenant')
    nego = l.get('negotiation') or {}
    unit_id = body.unit_id or nego.get('unit_id') or l.get('matched_unit_id')
    if not unit_id:
        raise HTTPException(400, 'Pilih unit dulu sebelum menandai deal')
    u = await _get_visible_unit(user, unit_id)
    if u.get('status') == 'terisi':
        raise HTTPException(400, f'Unit {u["name"]} sudah terisi')
    start = _check_date(body.start_date, 'Tanggal mulai') or today_wib().date().isoformat()
    months = body.contract_months or nego.get('contract_months') or 12
    end = _check_date(body.end_date, 'Tanggal selesai') or contract_end(start, months)
    if end < start:
        raise HTTPException(400, 'Tanggal selesai harus setelah tanggal mulai')
    rent = body.monthly_rent if body.monthly_rent is not None else (nego.get('agreed_price') or u.get('monthly_price', 0))
    deposit = body.deposit if body.deposit is not None else (nego.get('deposit') if nego.get('deposit') is not None else u.get('deposit', 0))
    due_day = body.due_day or 10
    interval = _interval(body.payment_interval_months or nego.get('payment_interval_months'))
    commission = body.commission if body.commission is not None else nego.get('commission')
    t = Tenant(account_id=aid, lead_id=lid, unit_id=str(u['_id']), name=l['name'], phone=l.get('phone'),
               start_date=start, end_date=end, monthly_rent=rent, deposit=deposit, payment_due_day=due_day,
               payment_interval_months=interval, commission=commission)
    await tenants.insert_one(t.to_mongo())
    docs = generate_payments(aid, t.id, str(u['_id']), rent, start, end, due_day, interval=interval)
    if docs:
        await payments.insert_many(docs)
    await units.update_one({'_id': u['_id']}, {'$set': {'status': 'terisi', 'occupied_since': now_utc(), 'vacant_since': None}})
    await leads.update_one({'_id': l['_id']}, {'$set': {'status': 'deal', 'needs_followup': False,
                                                        'next_followup_date': None, 'matched_unit_id': str(u['_id']),
                                                        'closed_at': now_utc()}})
    await viewings.update_many({'account_id': aid, 'lead_id': lid, 'status': {'$in': ['menunggu', 'terjadwal']}},
                               {'$set': {'status': 'selesai'}})
    await log_activity_async(aid, 'lead_deal', 'lead', f'{l["name"]} resmi jadi tenant di unit {u["name"]}', lid)
    return {'tenant_id': t.id, 'unit_id': str(u['_id']), 'payments_created': len(docs)}


# ============================== Viewings ======================================

def viewing_unit_ids(v: dict) -> list[str]:
    return list(v.get('unit_ids') or ([v['unit_id']] if v.get('unit_id') else []))


def viewing_units(v: dict, umap: dict, pmap: dict) -> dict:
    """Names and locations of every unit in a viewing (one trip can cover several units)."""
    us = [umap[i] for i in viewing_unit_ids(v) if i in umap]
    locs: list[str] = []
    for u in us:
        loc = unit_location(u, pmap)
        if loc and loc not in locs:
            locs.append(loc)
    return {'unit_name': ', '.join(u['name'] for u in us) or '-', 'location': '; '.join(locs),
            'units': [{'id': str(u['_id']), 'name': u['name'], 'location': unit_location(u, pmap)} for u in us]}


class ViewingIn(BaseModel):
    lead_id: str
    unit_id: str | None = None
    unit_ids: list[str] = Field(default_factory=list, max_length=5)
    scheduled_at: str
    note: str | None = None


@router.get('/viewings')
async def list_viewings(user: dict = Depends(current_account)):
    aid = account_id(user)
    docs = await viewings.find({'account_id': aid, 'deleted_at': None, 'status': {'$in': ['menunggu', 'terjadwal']}})\
        .sort('scheduled_at', 1).to_list(None)
    umap = await _units_map(aid)
    pmap = await _props_map(aid)
    lmap = {str(l['_id']): l for l in await leads.find({'account_id': aid}, {'name': 1}).to_list(None)}
    out = []
    for v in docs:
        d = noid(v) | viewing_units(v, umap, pmap)
        d['lead_name'] = (lmap.get(v.get('lead_id') or '') or {}).get('name', '-')
        out.append(d)
    return out


@router.post('/viewings')
async def create_viewing(body: ViewingIn, user: dict = Depends(current_account)):
    aid = account_id(user)
    l = await _get_lead(aid, body.lead_id)
    ids: list[str] = []
    for uid in [*body.unit_ids, *([body.unit_id] if body.unit_id else [])]:
        if uid and uid not in ids:
            ids.append(uid)
    if not ids:
        raise HTTPException(400, 'Pilih setidaknya 1 unit untuk viewing')
    for uid in ids:
        await _get_visible_unit(user, uid)
    v = Viewing(account_id=aid, lead_id=body.lead_id, unit_id=ids[0], unit_ids=ids,
                scheduled_at=_parse_when(body.scheduled_at), note=body.note)
    await viewings.insert_one(v.to_mongo())
    setq = {'needs_followup': False, 'next_followup_date': None, 'last_interaction_at': now_utc()}
    if l.get('status') != 'negotiation':
        setq['status'] = 'viewing'
    if not l.get('matched_unit_id'):
        setq['matched_unit_id'] = ids[0]
    await leads.update_one({'_id': l['_id']}, {'$set': setq})
    await log_activity_async(aid, 'viewing_scheduled', 'viewing', f'Viewing {l["name"]} dijadwalkan', v.id)
    return noid(v.to_mongo())


@router.post('/viewings/{vid}/calendar')
async def viewing_calendar(vid: str, user: dict = Depends(current_account)):
    """The agent added this viewing to Google Calendar."""
    v = await _get_viewing(account_id(user), vid)
    await viewings.update_one({'_id': v['_id']}, {'$set': {'calendar_added': True}})
    return {'ok': True}


async def _get_viewing(aid: str, vid: str) -> dict:
    v = await viewings.find_one({'_id': oid(vid, 'Viewing'), 'account_id': aid, 'deleted_at': None})
    if not v:
        raise HTTPException(404, 'Viewing tidak ditemukan')
    return v


@router.post('/viewings/{vid}/confirm')
async def confirm_viewing(vid: str, user: dict = Depends(current_account)):
    v = await _get_viewing(account_id(user), vid)
    await viewings.update_one({'_id': v['_id']}, {'$set': {'status': 'terjadwal'}})
    return {'ok': True}


@router.post('/viewings/{vid}/reschedule')
async def reschedule_viewing(vid: str, body: dict, user: dict = Depends(current_account)):
    v = await _get_viewing(account_id(user), vid)
    when = _parse_when(str(body.get('scheduled_at') or ''))
    await viewings.update_one({'_id': v['_id']}, {'$set': {'scheduled_at': when, 'status': 'menunggu', 'calendar_added': False}})
    return {'ok': True}


async def _back_to_followup(aid: str, lead_id: str | None, days: int = 3) -> None:
    """After a cancelled / inconclusive viewing, the lead returns to the follow-up list."""
    if not lead_id or not ObjectId.is_valid(lead_id):
        return
    open_left = await viewings.count_documents({'account_id': aid, 'lead_id': lead_id,
                                                'status': {'$in': ['menunggu', 'terjadwal']}})
    if open_left:
        return
    await leads.update_one({'_id': ObjectId(lead_id), 'account_id': aid, 'status': 'viewing'},
                           {'$set': {'status': 'sedang_ngobrol',
                                     'next_followup_date': (today_wib().date() + timedelta(days=days)).isoformat()}})


@router.post('/viewings/{vid}/cancel')
async def cancel_viewing(vid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    v = await _get_viewing(aid, vid)
    await viewings.update_one({'_id': v['_id']}, {'$set': {'status': 'batal'}})
    await _back_to_followup(aid, v.get('lead_id'), days=1)
    return {'ok': True}


@router.post('/viewings/{vid}/complete')
async def complete_viewing(vid: str, body: dict | None = None, user: dict = Depends(current_account)):
    """Mark a viewing as done. body.next = 'followup' puts the lead back on the follow-up list;
    'negotiation' leaves it for the negotiation step (the app opens that form next)."""
    aid = account_id(user)
    v = await _get_viewing(aid, vid)
    await viewings.update_one({'_id': v['_id']}, {'$set': {'status': 'selesai'}})
    if (body or {}).get('next') == 'followup':
        await _back_to_followup(aid, v.get('lead_id'))
    await log_activity_async(aid, 'viewing_done', 'viewing', 'Viewing selesai', vid)
    return {'ok': True}


# ============================== Tenants & Payments ============================

class TenantIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    unit_id: str | None = None
    phone: str | None = Field(default=None, max_length=40)
    start_date: str
    contract_months: int = Field(default=12, ge=1, le=60)
    end_date: str | None = None
    monthly_rent: int = Field(ge=0)
    deposit: int = Field(default=0, ge=0)
    payment_due_day: int = Field(default=10, ge=1, le=28)
    payment_interval_months: int | None = None
    commission: int | None = Field(default=None, ge=0)


def _days_left(end_date: str | None) -> int | None:
    end = parse_date(end_date)
    return (end - today_wib().date()).days if end else None


async def _get_tenant(aid: str, tid: str) -> dict:
    t = await tenants.find_one({'_id': oid(tid, 'Tenant'), 'account_id': aid, 'deleted_at': None})
    if not t:
        raise HTTPException(404, 'Tenant tidak ditemukan')
    return t


@router.get('/tenants')
async def list_tenants(user: dict = Depends(current_account)):
    aid = account_id(user)
    docs = await tenants.find({'account_id': aid, 'deleted_at': None, 'status': 'aktif'}).sort('name', 1).to_list(None)
    umap = await _units_map(aid)
    out = []
    for t in docs:
        d = noid(t)
        u = umap.get(t.get('unit_id') or '') or {}
        d['unit_name'] = u.get('name', '-')
        d['owner_name'] = u.get('owner_name')
        d['days_left'] = _days_left(t.get('end_date'))
        unpaid = await payments.find({'account_id': aid, 'tenant_id': d['id'], 'status': 'belum_bayar',
                                      'deleted_at': None}).sort('due_date', 1).to_list(1)
        if unpaid:
            d['next_due'] = unpaid[0]['due_date']
            d['next_amount'] = unpaid[0].get('amount', 0)
            d['overdue'] = days_late(unpaid[0]['due_date'])
            d['payment_status'] = 'belum_bayar'
        else:
            d['payment_status'] = 'lunas'
        out.append(d)
    return out


@router.get('/tenants/{tid}')
async def get_tenant(tid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    t = await _get_tenant(aid, tid)
    d = noid(t)
    u = (await _units_map(aid)).get(t.get('unit_id') or '') or {}
    d['unit_name'] = u.get('name', '-')
    d['owner'] = {'name': u.get('owner_name'), 'phone': u.get('owner_phone')} if u.get('owner_name') or u.get('owner_phone') else None
    d['days_left'] = _days_left(t.get('end_date'))
    pays = await payments.find({'account_id': aid, 'tenant_id': tid, 'deleted_at': None}).sort('due_date', 1).to_list(None)
    d['payments'] = [noid(p) | {'days_late': days_late(p['due_date']) if p['status'] == 'belum_bayar' else 0} for p in pays]
    # Context carried over from the lead -> viewing -> negotiation journey.
    d['history'] = None
    if t.get('lead_id') and ObjectId.is_valid(t['lead_id']):
        l = await leads.find_one({'_id': ObjectId(t['lead_id']), 'account_id': aid})
        if l:
            d['history'] = {
                'lead_id': str(l['_id']), 'source': l.get('source'), 'since': _iso(l.get('created_at')),
                'budget_max': l.get('budget_max') or l.get('budget_min'), 'unit_type': l.get('unit_type'),
                'requirements': l.get('requirements') or [], 'occupants': l.get('occupants'),
                'notes': l.get('notes') or l.get('summary') or l.get('ai_note'), 'quote': l.get('quote'),
                'negotiation_note': (l.get('negotiation') or {}).get('note'),
                'viewings': await viewings.count_documents({'account_id': aid, 'lead_id': str(l['_id']), 'status': 'selesai'}),
            }
    return d


@router.post('/tenants')
async def create_tenant(body: TenantIn, user: dict = Depends(current_account)):
    aid = account_id(user)
    # A tenant always lives in a unit from the unit list: add the unit first.
    if not body.unit_id:
        raise HTTPException(400, 'Pilih unit dari daftar unit. Belum ada? Tambah unitnya dulu.')
    u = await _get_visible_unit(user, body.unit_id)
    if u.get('status') == 'terisi':
        raise HTTPException(400, f'Unit {u["name"]} sudah terisi')
    start = _check_date(body.start_date, 'Tanggal mulai')
    end = _check_date(body.end_date, 'Tanggal selesai') or contract_end(start, body.contract_months)
    interval = _interval(body.payment_interval_months)
    t = Tenant(account_id=aid, unit_id=body.unit_id, name=body.name, phone=body.phone, start_date=start,
               end_date=end, monthly_rent=body.monthly_rent, deposit=body.deposit,
               payment_due_day=body.payment_due_day, payment_interval_months=interval,
               commission=body.commission)
    await tenants.insert_one(t.to_mongo())
    docs = generate_payments(aid, t.id, body.unit_id, body.monthly_rent, start, end, body.payment_due_day,
                             interval=interval)
    if docs:
        await payments.insert_many(docs)
    await units.update_one({'_id': u['_id']}, {'$set': {'status': 'terisi', 'occupied_since': now_utc(), 'vacant_since': None}})
    await log_activity_async(aid, 'tenant_added', 'tenant', f'{t.name} resmi jadi tenant di unit {u["name"]}', t.id)
    return {'tenant_id': t.id}


class ExtendIn(BaseModel):
    months: int = Field(ge=1, le=36)


@router.post('/tenants/{tid}/extend')
async def extend_tenant(tid: str, body: ExtendIn, user: dict = Depends(current_account)):
    """Renew the lease by N months and create the bills for the new months."""
    aid = account_id(user)
    t = await _get_tenant(aid, tid)
    if t.get('status') != 'aktif':
        raise HTTPException(400, 'Tenant sudah checkout')
    old_end = parse_date(t.get('end_date')) or today_wib().date()
    new_start = (old_end + timedelta(days=1)).isoformat()
    new_end = contract_end(new_start, body.months)
    existing = {p['period'] for p in await payments.find({'account_id': aid, 'tenant_id': tid, 'deleted_at': None},
                                                         {'period': 1}).to_list(None)}
    docs = [p for p in generate_payments(aid, tid, t['unit_id'], t.get('monthly_rent', 0), new_start, new_end,
                                         t.get('payment_due_day', 10), interval=t.get('payment_interval_months') or 1)
            if p['period'] not in existing]
    if docs:
        await payments.insert_many(docs)
    await tenants.update_one({'_id': t['_id']}, {'$set': {'end_date': new_end}, '$inc': {'extensions': 1}})
    await log_activity_async(aid, 'tenant_extended', 'tenant', f'Kontrak {t["name"]} diperpanjang {body.months} bulan', tid)
    return {'end_date': new_end, 'payments_created': len(docs)}


@router.post('/tenants/{tid}/checkout')
async def checkout_tenant(tid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    t = await _get_tenant(aid, tid)
    if t.get('status') != 'aktif':
        raise HTTPException(400, 'Tenant sudah checkout')
    today = today_wib().date().isoformat()
    await tenants.update_one({'_id': t['_id']}, {'$set': {'status': 'checkout', 'end_date': today}})
    # Bills for months after move-out are no longer owed; overdue ones stay visible.
    removed = await payments.update_many({'account_id': aid, 'tenant_id': tid, 'status': 'belum_bayar',
                                          'deleted_at': None, 'due_date': {'$gt': today}},
                                         {'$set': {'deleted_at': now_utc()}})
    if ObjectId.is_valid(t.get('unit_id') or ''):
        await units.update_one({'_id': ObjectId(t['unit_id']), 'account_id': aid},
                               {'$set': {'status': 'kosong', 'vacant_since': now_utc(), 'occupied_since': None}})
    await log_activity_async(aid, 'tenant_checkout', 'tenant', f'{t["name"]} checkout — unit kembali kosong', tid)
    return {'ok': True, 'payments_cancelled': removed.modified_count}


@router.get('/payments')
async def list_payments(status: str | None = None, user: dict = Depends(current_account)):
    aid = account_id(user)
    q: dict = {'account_id': aid, 'deleted_at': None}
    if status and status != 'semua':
        q['status'] = status
    docs = await payments.find(q).sort('due_date', 1).to_list(None)
    umap = await _units_map(aid)
    tmap = {str(t['_id']): t for t in await tenants.find({'account_id': aid}).to_list(None)}
    out = []
    for p in docs:
        d = noid(p)
        d['tenant_name'] = (tmap.get(p.get('tenant_id') or '') or {}).get('name', '-')
        d['unit_name'] = (umap.get(p.get('unit_id') or '') or {}).get('name', '-')
        d['days_late'] = days_late(p['due_date']) if p['status'] == 'belum_bayar' else 0
        out.append(d)
    return out


async def _get_payment(aid: str, pid: str) -> dict:
    p = await payments.find_one({'_id': oid(pid, 'Pembayaran'), 'account_id': aid, 'deleted_at': None})
    if not p:
        raise HTTPException(404, 'Pembayaran tidak ditemukan')
    return p


@router.post('/payments/{pid}/mark-paid')
async def mark_paid(pid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    p = await _get_payment(aid, pid)
    await payments.update_one({'_id': p['_id']}, {'$set': {'status': 'lunas', 'paid_at': now_utc()}})
    t = await tenants.find_one({'_id': oid(p['tenant_id']), 'account_id': aid})
    await log_activity_async(aid, 'payment_paid', 'payment',
                             f'Pembayaran {t["name"] if t else "-"} {period_label(p["period"], p.get("months") or 1)} lunas', pid)
    return {'ok': True}


@router.post('/payments/{pid}/mark-unpaid')
async def mark_unpaid(pid: str, user: dict = Depends(current_account)):
    p = await _get_payment(account_id(user), pid)
    await payments.update_one({'_id': p['_id']}, {'$set': {'status': 'belum_bayar', 'paid_at': None}})
    return {'ok': True}


@router.post('/payments/{pid}/reminded')
async def payment_reminded(pid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    p = await _get_payment(aid, pid)
    await payments.update_one({'_id': p['_id']},
                              {'$set': {'last_reminded_at': now_utc()}, '$inc': {'reminder_count': 1}})
    t = await tenants.find_one({'_id': oid(p['tenant_id']), 'account_id': aid})
    await log_activity_async(aid, 'payment_reminded', 'payment',
                             f'Pengingat bayar dikirim ke {t["name"] if t else "-"}', pid)
    return {'ok': True}


# ============================== Issues (maintenance) ===========================

class MaintIn(BaseModel):
    description: str = Field(min_length=3, max_length=300)
    unit_id: str | None = None
    tenant_id: str | None = None
    scheduled_at: str | None = None  # YYYY-MM-DDTHH:MM
    urgent: bool = False


class MaintPatch(BaseModel):
    description: str | None = Field(default=None, min_length=3, max_length=300)
    scheduled_at: str | None = None


async def _todo_links(aid: str, unit_id: str | None, tenant_id: str | None) -> tuple[str | None, str | None]:
    """Pick a tenant and its unit follows; pick a unit and its current tenant follows."""
    if tenant_id:
        t = await tenants.find_one({'_id': oid(tenant_id, 'Tenant'), 'account_id': aid, 'deleted_at': None})
        if not t:
            raise HTTPException(404, 'Tenant tidak ditemukan')
        return t.get('unit_id'), tenant_id
    if unit_id:
        if unit_id not in await _units_map(aid):
            raise HTTPException(404, 'Unit tidak ditemukan')
        t = await tenants.find_one({'account_id': aid, 'unit_id': unit_id, 'status': 'aktif', 'deleted_at': None})
        return unit_id, (str(t['_id']) if t else None)
    return None, None


@router.get('/maintenance')
async def list_maintenance(status: str | None = None, user: dict = Depends(current_account)):
    aid = account_id(user)
    q: dict = {'account_id': aid, 'deleted_at': None}
    if status == 'aktif':
        q['status'] = {'$in': ['baru', 'sedang']}
    elif status and status != 'semua':
        q['status'] = status
    docs = await maintenance.find(q).sort('created_at', -1).to_list(None)
    umap = await _units_map(aid)
    pmap = await _props_map(aid)
    tmap = {str(t['_id']): t for t in await tenants.find({'account_id': aid}).to_list(None)}
    out = []
    for m in docs:
        d = noid(m)
        u = umap.get(m.get('unit_id') or '')
        t = tmap.get(m.get('tenant_id') or '')
        d['unit_name'] = u.get('name') if u else None
        d['location'] = unit_location(u, pmap) if u else ''
        d['tenant_name'] = t.get('name') if t else None
        d['tenant_phone'] = t.get('phone') if t else None
        d['scheduled_at'] = _iso(_aware(m.get('scheduled_at')))
        out.append(d)
    far = '9999'
    # Open first, soonest scheduled first; then done/cancelled.
    out.sort(key=lambda x: (x['status'] in ('selesai', 'batal'), x.get('scheduled_at') or far))
    return out


@router.post('/maintenance')
async def create_maintenance(body: MaintIn, user: dict = Depends(current_account)):
    aid = account_id(user)
    unit_id, tenant_id = await _todo_links(aid, body.unit_id, body.tenant_id)
    m = Maintenance(account_id=aid, description=body.description.strip(), unit_id=unit_id, tenant_id=tenant_id,
                    category=guess_issue_category(body.description),
                    scheduled_at=_parse_when(body.scheduled_at) if body.scheduled_at else None,
                    priority='urgent' if body.urgent else 'normal', status='baru')
    await maintenance.insert_one(m.to_mongo())
    await log_activity_async(aid, 'maintenance_reported', 'maintenance',
                             f'Laporan baru: {m.category} — {m.description[:60]}', m.id)
    return noid(m.to_mongo())


async def _get_issue(aid: str, mid: str) -> dict:
    m = await maintenance.find_one({'_id': oid(mid, 'Masalah'), 'account_id': aid, 'deleted_at': None})
    if not m:
        raise HTTPException(404, 'Masalah tidak ditemukan')
    return m


@router.patch('/maintenance/{mid}')
async def update_maintenance(mid: str, body: MaintPatch, user: dict = Depends(current_account)):
    m = await _get_issue(account_id(user), mid)
    setq: dict = {}
    if body.description is not None:
        setq['description'] = body.description.strip()
    if body.scheduled_at is not None:
        setq['scheduled_at'] = _parse_when(body.scheduled_at) if body.scheduled_at else None
        setq['calendar_added'] = False  # a new time needs a new calendar entry
    if setq:
        await maintenance.update_one({'_id': m['_id']}, {'$set': setq})
    return {'ok': True}


@router.post('/maintenance/{mid}/calendar')
async def maintenance_calendar(mid: str, user: dict = Depends(current_account)):
    """The agent added this to-do to Google Calendar (the app opens the pre-filled event)."""
    m = await _get_issue(account_id(user), mid)
    await maintenance.update_one({'_id': m['_id']}, {'$set': {'calendar_added': True}})
    return {'ok': True}


@router.post('/maintenance/{mid}/cancel')
async def cancel_maintenance(mid: str, user: dict = Depends(current_account)):
    m = await _get_issue(account_id(user), mid)
    await maintenance.update_one({'_id': m['_id']}, {'$set': {'status': 'batal', 'calendar_added': False}})
    return {'ok': True}


@router.post('/maintenance/{mid}/start')
async def start_maintenance(mid: str, user: dict = Depends(current_account)):
    m = await _get_issue(account_id(user), mid)
    await maintenance.update_one({'_id': m['_id']}, {'$set': {'status': 'sedang'}})
    return {'ok': True}


@router.post('/maintenance/{mid}/resolve')
async def resolve_maintenance(mid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    m = await _get_issue(aid, mid)
    await maintenance.update_one({'_id': m['_id']}, {'$set': {'status': 'selesai', 'resolved_at': now_utc()}})
    if m.get('unit_id') and ObjectId.is_valid(m['unit_id']):
        await units.update_one({'_id': ObjectId(m['unit_id']), 'account_id': aid, 'status': 'maintenance'},
                               {'$set': {'status': 'kosong', 'vacant_since': now_utc()}})
    await log_activity_async(aid, 'maintenance_resolved', 'maintenance',
                             f'Masalah selesai: {(m.get("ai_summary") or m.get("description") or "")[:60]}', mid)
    return {'ok': True}


# ============================== Hari Ini ======================================

LEASE_HORIZON = 30    # leases ending within this many days show up on Hari Ini
PAYMENT_HORIZON = 3   # bills due within this many days show up on Hari Ini


def followup_reason(l: dict, today_iso: str, now: datetime) -> str | None:
    """A follow-up shows on Hari Ini only when the agent scheduled it (next_followup_date).

    No guessing from "days since last contact": the app can't see WhatsApp, so a
    guess would often be wrong.
    """
    if l.get('status') in CLOSED_LEAD_STATUSES:
        return None
    nxt = l.get('next_followup_date')
    if not nxt or nxt > today_iso:
        return None
    return 'Jadwal follow-up hari ini' if nxt == today_iso else 'Jadwal follow-up terlewat'


@router.get('/today')
async def today(user: dict = Depends(current_account)):
    aid = account_id(user)
    now = now_utc()
    today_d = today_wib().date()
    today_iso = today_d.isoformat()
    umap = await _units_map(aid)
    pmap = await _props_map(aid)
    items: list[dict] = []

    ldocs = await leads.find({'account_id': aid, 'deleted_at': None,
                              'status': {'$nin': CLOSED_LEAD_STATUSES}}).to_list(None)
    lmap = {str(l['_id']): l for l in ldocs}
    for l in ldocs:
        reason = followup_reason(l, today_iso, now)
        if not reason:
            continue
        u = umap.get(l.get('matched_unit_id') or '')
        items.append({
            'type': 'followup', 'id': str(l['_id']), 'lead_id': str(l['_id']), 'name': l['name'],
            'status': l.get('status'), 'reason': reason, 'phone': l.get('phone'),
            'unit_type': l.get('unit_type'), 'budget_max': l.get('budget_max') or l.get('budget_min'),
            'note': l.get('notes') or l.get('ai_note') or l.get('interest_note'),
            'suggested_followup': l.get('suggested_followup'), 'negotiation': l.get('negotiation'),
            'last_interaction_at': _iso(l.get('last_interaction_at')),
            'unit': unit_brief(u, pmap) if u else None,
            'hot': l.get('interest') == 'high',
            'pref_category': l.get('pref_category'), 'pref_types': l.get('pref_types') or [],
            'pref_terms': l.get('pref_terms') or [],
            'priority': 1 if l.get('status') == 'negotiation' else 2,
        })

    vdocs = await viewings.find({'account_id': aid, 'deleted_at': None,
                                 'status': {'$in': ['menunggu', 'terjadwal']}}).sort('scheduled_at', 1).to_list(None)
    for v in vdocs:
        when = _aware(v.get('scheduled_at'))
        l = lmap.get(v.get('lead_id') or '') or {}
        vu = viewing_units(v, umap, pmap)
        past = bool(when and when < now - timedelta(hours=1))
        items.append({
            'type': 'viewing_result' if past else 'viewing', 'id': str(v['_id']), 'viewing_id': str(v['_id']),
            'lead_id': v.get('lead_id'), 'unit_id': v.get('unit_id'), 'phone': l.get('phone'),
            'name': l.get('name', '-'), 'unit_name': vu['unit_name'], 'location': vu['location'], 'units': vu['units'],
            'calendar_added': bool(v.get('calendar_added')),
            'scheduled_at': _iso(when), 'status': v.get('status'),
            'priority': 1,
        })

    # All tenants (incl. checked out): an overdue bill stays owed after move-out.
    tmap = {str(t['_id']): t for t in await tenants.find({'account_id': aid, 'deleted_at': None}).to_list(None)}
    tdocs = [t for t in tmap.values() if t.get('status') == 'aktif']
    horizon = (today_d + timedelta(days=PAYMENT_HORIZON)).isoformat()
    unpaid_amount = 0
    pays = await payments.find({'account_id': aid, 'deleted_at': None, 'status': 'belum_bayar',
                                'due_date': {'$lte': horizon}}).sort('due_date', 1).to_list(None)
    for p in pays:
        t = tmap.get(p.get('tenant_id') or '')
        if not t:
            continue
        late = days_late(p['due_date'])
        unpaid_amount += p.get('amount', 0)
        items.append({
            'type': 'payment', 'id': str(p['_id']), 'payment_id': str(p['_id']),
            'tenant_id': p.get('tenant_id'), 'name': t['name'],
            'unit_name': (umap.get(p.get('unit_id') or '') or {}).get('name', '-'), 'amount': p.get('amount', 0),
            'period': p.get('period'), 'months': p.get('months') or 1, 'due_date': p['due_date'], 'days_late': late, 'phone': t.get('phone'),
            'priority': 0 if late > 0 else 1,
        })

    for t in tdocs:
        left = _days_left(t.get('end_date'))
        if left is None or left > LEASE_HORIZON:
            continue
        items.append({
            'type': 'lease', 'id': str(t['_id']), 'tenant_id': str(t['_id']), 'name': t['name'],
            'unit_name': (umap.get(t.get('unit_id') or '') or {}).get('name', '-'), 'phone': t.get('phone'),
            'end_date': t.get('end_date'), 'days_left': left, 'priority': 0 if left <= 7 else 2,
        })

    mdocs = await maintenance.find({'account_id': aid, 'deleted_at': None, 'status': {'$in': ['baru', 'sedang']}}).to_list(None)
    todos_today = 0
    for m in mdocs:
        urgent = m.get('priority') == 'urgent'
        when = _aware(m.get('scheduled_at'))
        if when and when.astimezone(local_tz()).date() <= today_d:
            todos_today += 1
        items.append({
            'type': 'maintenance', 'id': str(m['_id']), 'maintenance_id': str(m['_id']),
            'description': m.get('ai_summary') or m.get('description'),
            'category': m.get('category'), 'status': m.get('status'),
            'scheduled_at': _iso(when),
            'unit_name': (umap.get(m.get('unit_id') or '') or {}).get('name'),
            'urgent': urgent, 'priority': 0 if urgent else 3,
        })

    items.sort(key=lambda x: x.get('priority', 3))
    visible = await _visible_units(user)
    stat = {
        'total': len(visible),
        'terisi': sum(1 for u in visible if u.get('status') == 'terisi'),
        'kosong': sum(1 for u in visible if u.get('status') == 'kosong'),
        'reserved': sum(1 for u in visible if u.get('status') == 'reserved'),
        'maintenance': sum(1 for u in visible if u.get('status') == 'maintenance'),
    }
    counts = {
        'followups': sum(1 for i in items if i['type'] == 'followup'),
        'viewings': sum(1 for i in items if i['type'] in ('viewing', 'viewing_result')),
        'unpaid_amount': unpaid_amount,
        'unpaid_count': sum(1 for i in items if i['type'] == 'payment'),
        'leases': sum(1 for i in items if i['type'] == 'lease'),
        'issues': sum(1 for i in items if i['type'] == 'maintenance'),
        'active_leads': len(ldocs),
        'todos': len(mdocs),
        'todos_today': todos_today,
        'urgent': sum(1 for i in items if i['type'] == 'maintenance' and i.get('urgent')),
        'total': len(items),
    }
    return {'name': user.get('name', ''), 'is_demo': bool(user.get('is_demo')),
            'units': stat, 'counts': counts, 'items': items}


@router.get('/activities')
async def list_activities(limit: int = 50, user: dict = Depends(current_account)):
    aid = account_id(user)
    docs = await activities.find({'account_id': aid}).sort('created_at', -1).to_list(min(max(limit, 1), 100))
    return [{'id': str(a['_id']), 'action': a.get('action'), 'title': a.get('title'),
             'origin': a.get('origin', 'user'), 'created_at': _iso(a.get('created_at'))} for a in docs]


# ============================== Import / export ===============================

@router.get('/examples/units-csv')
async def example_units_csv():
    return {'csv': """nama,jenis,tipe,alamat,harga_bulanan,harga_harian,harga_tahunan,status
Tokyo Riverside A12,apartemen,Studio,"PIK 2, Jakarta Utara",3200000,,,kosong
Tokyo Riverside C21,apartemen,1 Bedroom,"PIK 2, Jakarta Utara",4500000,650000,,kosong
Rumah Bintaro Sektor 9,rumah,3 Bedroom,"Jl. Kasuari, Bintaro",9000000,,100000000,terisi
Villa Canggu 2,rumah,2 Bedroom,"Canggu, Bali",,1500000,,kosong"""}


EXPORTS = {
    'units': ['name', 'category', 'unit_type', 'address', 'status', 'monthly_price', 'daily_price', 'yearly_price'],
    'leads': ['name', 'phone', 'status', 'hot_buyer', 'pref_category', 'pref_types', 'pref_terms',
              'matched_unit', 'created_at'],
    'tenants': ['name', 'phone', 'unit', 'status', 'start_date', 'end_date', 'monthly_rent', 'deposit',
                'payment_due_day'],
    'payments': ['tenant', 'unit', 'period', 'amount', 'due_date', 'status', 'paid_at'],
}


@router.get('/export/{kind}')
async def export_csv(kind: str, user: dict = Depends(current_account)):
    require_feature(user, 'export_data', 'feature_export')
    if kind not in EXPORTS:
        raise HTTPException(404, 'Jenis export tidak dikenal')
    aid = account_id(user)
    umap = await _units_map(aid)
    pmap = await _props_map(aid)
    uname = lambda i: (umap.get(i or '') or {}).get('name', '')  # noqa: E731
    base = {'account_id': aid, 'deleted_at': None}
    rows: list[dict] = []
    if kind == 'units':
        for u in umap.values():
            rows.append({**u, 'address': unit_location(u, pmap)})
    elif kind == 'leads':
        for l in await leads.find(base).to_list(None):
            rows.append({**l, 'hot_buyer': 'ya' if l.get('interest') == 'high' else 'tidak',
                         'pref_types': ', '.join(l.get('pref_types') or []),
                         'pref_terms': ', '.join(l.get('pref_terms') or []),
                         'matched_unit': uname(l.get('matched_unit_id')), 'created_at': _iso(l.get('created_at'))})
    elif kind == 'tenants':
        for t in await tenants.find(base).to_list(None):
            rows.append({**t, 'unit': uname(t.get('unit_id'))})
    else:
        tnames = {str(t['_id']): t['name'] for t in await tenants.find({'account_id': aid}, {'name': 1}).to_list(None)}
        for p in await payments.find(base).sort('due_date', 1).to_list(None):
            rows.append({**p, 'tenant': tnames.get(p.get('tenant_id') or '', ''), 'unit': uname(p.get('unit_id')),
                         'paid_at': _iso(p.get('paid_at'))})
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=EXPORTS[kind], extrasaction='ignore')
    w.writeheader()
    for r in rows:
        w.writerow({k: ('' if r.get(k) is None else r.get(k)) for k in EXPORTS[kind]})
    fname = f'sewain-{kind}-{today_wib().date().isoformat()}.csv'
    return Response(content='﻿' + buf.getvalue(), media_type='text/csv; charset=utf-8',
                    headers={'Content-Disposition': f'attachment; filename="{fname}"'})
