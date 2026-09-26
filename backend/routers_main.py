from __future__ import annotations

import csv
import io
import re
from datetime import datetime, timedelta

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel, Field

from auth_utils import current_account, account_id
from auth_utils import bearer as _bearer
from fastapi.security import HTTPAuthorizationCredentials
from database import (properties, units, leads, viewings, tenants, payments,
                      maintenance, activities, summaries)
from helpers import log_activity_async, generate_payments, days_late, days_since, parse_date
from models import (Property, Unit, Lead, Viewing, Tenant, Maintenance, Payment,
                    now_utc, today_wib, WIB)

router = APIRouter(prefix='/api')


def noid(d: dict) -> dict:
    d = dict(d)
    d['id'] = str(d.pop('_id'))
    return d


async def _props_map(aid: str) -> dict:
    docs = await properties.find({'account_id': aid, 'deleted_at': None}).to_list(None)
    return {str(p['_id']): p for p in docs}


async def _units_map(aid: str) -> dict:
    docs = await units.find({'account_id': aid, 'deleted_at': None}).to_list(None)
    return {str(u['_id']): u for u in docs}


def unit_out(u: dict, pmap: dict) -> dict:
    d = noid(u)
    p = pmap.get(u.get('property_id') or '', {})
    d['property_name'] = p.get('name', '')
    d['property_type'] = p.get('type', '')
    return d


def lead_out(l: dict, umap: dict, pmap: dict) -> dict:
    d = noid(l)
    u = umap.get(l.get('matched_unit_id') or '')
    if u:
        d['matched_unit'] = {'id': str(u['_id']), 'name': u['name'], 'unit_type': u.get('unit_type', ''),
                             'monthly_price': u.get('monthly_price', 0), 'status': u.get('status')}
    return d


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
    return noid(p.to_mongo() | {'_id': p.id})


@router.put('/properties/{pid}')
async def update_property(pid: str, body: PropertyIn, user: dict = Depends(current_account)):
    aid = account_id(user)
    p = Property(account_id=aid, **body.model_dump())
    await properties.update_one({'_id': ObjectId(pid), 'account_id': aid}, {'$set': {
        k: v for k, v in p.model_dump().items() if k not in ('id', 'account_id', 'created_at')
    }})
    return {'ok': True}


@router.delete('/properties/{pid}')
async def delete_property(pid: str, user: dict = Depends(current_account)):
    await properties.update_one({'_id': ObjectId(pid), 'account_id': account_id(user)},
                                {'$set': {'deleted_at': now_utc()}})
    return {'ok': True}


# ============================== Units =========================================

class UnitIn(BaseModel):
    property_id: str
    name: str = Field(min_length=1, max_length=60)
    unit_type: str = 'Studio'
    monthly_price: int = 0
    deposit: int = 0
    bedrooms: int = 1
    bathrooms: int = 1
    furnished: bool = True
    facilities: list[str] = Field(default_factory=list)
    available_date: str | None = None
    status: str = 'kosong'
    notes: str | None = None


@router.get('/units')
async def list_units(status: str | None = None, user: dict = Depends(current_account)):
    aid = account_id(user)
    q: dict = {'account_id': aid, 'deleted_at': None}
    if status and status != 'semua':
        q['status'] = status
    docs = await units.find(q).sort('name', 1).to_list(None)
    pmap = await _props_map(aid)
    return [unit_out(u, pmap) for u in docs]


@router.post('/units')
async def create_unit(body: UnitIn, user: dict = Depends(current_account)):
    aid = account_id(user)
    u = Unit(account_id=aid, **body.model_dump())
    u.city = None
    pmap = await _props_map(aid)
    p = pmap.get(body.property_id)
    if not p:
        raise HTTPException(404, 'Properti tidak ditemukan')
    u.city = p.get('city')
    if body.status == 'kosong':
        u.vacant_since = now_utc()
    await units.insert_one(u.to_mongo())
    await log_activity_async(aid, 'unit_added', 'unit', f'Menambahkan unit {u.name}', u.id)
    return unit_out(u.to_mongo() | {'_id': ObjectId(u.id)}, pmap)


@router.get('/units/{uid}')
async def get_unit(uid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    u = await units.find_one({'_id': ObjectId(uid), 'account_id': aid, 'deleted_at': None})
    if not u:
        raise HTTPException(404, 'Unit tidak ditemukan')
    pmap = await _props_map(aid)
    return unit_out(u, pmap)


@router.put('/units/{uid}')
async def update_unit(uid: str, body: UnitIn, user: dict = Depends(current_account)):
    aid = account_id(user)
    old = await units.find_one({'_id': ObjectId(uid), 'account_id': aid})
    if not old:
        raise HTTPException(404, 'Unit tidak ditemukan')
    data = body.model_dump()
    data['vacant_since'] = old.get('vacant_since')
    data['occupied_since'] = old.get('occupied_since')
    if body.status == 'kosong' and old.get('status') != 'kosong':
        data['vacant_since'] = now_utc()
        data['occupied_since'] = None
    if body.status == 'terisi' and old.get('status') != 'terisi':
        data['occupied_since'] = now_utc()
        data['vacant_since'] = None
    await units.update_one({'_id': ObjectId(uid)}, {'$set': data})
    return await get_unit(uid, user)


@router.delete('/units/{uid}')
async def delete_unit(uid: str, user: dict = Depends(current_account)):
    await units.update_one({'_id': ObjectId(uid), 'account_id': account_id(user)},
                           {'$set': {'deleted_at': now_utc()}})
    return {'ok': True}


@router.get('/units/{uid}/matches')
async def unit_matches(uid: str, user: dict = Depends(current_account)):
    from ai_service import match_score
    aid = account_id(user)
    u = await units.find_one({'_id': ObjectId(uid), 'account_id': aid, 'deleted_at': None})
    if not u:
        raise HTTPException(404, 'Unit tidak ditemukan')
    pmap = await _props_map(aid)
    p = pmap.get(u.get('property_id') or '', {})
    uo = unit_out(u, pmap)
    lead_docs = await leads.find({'account_id': aid, 'deleted_at': None,
                                  'status': {'$nin': ['deal', 'tidak_jadi']}}).to_list(None)
    scored = []
    for l in lead_docs:
        s, r = match_score(noid(l), uo, p.get('name', ''))
        if s > 0:
            scored.append((s, r, l))
    scored.sort(key=lambda x: -x[0])
    return {'unit': uo, 'matches': [
        {'lead': lead_out(l, {}, pmap), 'score': s, 'reasons': r} for s, r, l in scored[:5]
    ]}


@router.post('/units/import-csv')
async def import_units_csv(body: dict, user: dict = Depends(current_account)):
    aid = account_id(user)
    text = (body.get('csv_text') or '').strip()
    if not text:
        raise HTTPException(400, 'CSV kosong')
    reader = csv.DictReader(io.StringIO(text))
    pmap = await _props_map(aid)
    imported, errors, props_created = 0, [], 0
    for i, row in enumerate(reader, start=2):
        row = {(k or '').strip().lower(): (v or '').strip() for k, v in row.items()}
        name = row.get('name') or row.get('nama')
        prop_name = row.get('property') or row.get('properti')
        if not name or not prop_name:
            errors.append(f'Baris {i}: kolom name/property wajib diisi')
            continue
        prop = next((p for p in pmap.values() if p['name'].lower() == prop_name.lower()), None)
        if not prop:
            prop_doc = Property(account_id=aid, name=prop_name, type=row.get('type_properti', 'apartment') or 'apartment',
                                city=row.get('city') or row.get('kota'), origin='user')
            await properties.insert_one(prop_doc.to_mongo())
            pmap[prop_doc.id] = prop_doc.to_mongo() | {'_id': ObjectId(prop_doc.id), **{}}
            pmap[prop_doc.id] = prop_doc.to_mongo()
            pmap[prop_doc.id]['_id'] = ObjectId(prop_doc.id)
            props_created += 1
            prop = pmap[prop_doc.id]
        def _int(v, default=0):
            digits = re.sub(r'[^\d]', '', str(v or ''))
            return int(digits) if digits else default
        status = (row.get('status') or 'kosong').lower()
        status = {'vacant': 'kosong', 'occupied': 'terisi', 'kosong': 'kosong', 'terisi': 'terisi',
                  'reserved': 'reserved', 'maintenance': 'maintenance', 'perbaikan': 'maintenance'}.get(status, 'kosong')
        u = Unit(account_id=aid, property_id=str(prop['_id']), name=name,
                 unit_type=row.get('unit_type') or row.get('tipe') or 'Studio',
                 monthly_price=_int(row.get('monthly_price') or row.get('harga')),
                 deposit=_int(row.get('deposit')), bedrooms=_int(row.get('bedrooms'), 1) or 1,
                 bathrooms=_int(row.get('bathrooms'), 1) or 1,
                 furnished=(row.get('furnished', 'ya').lower() not in ('tidak', 'no', 'n', 'unfurnished', '0')),
                 facilities=[f.strip() for f in re.split(r'[;,]', row.get('facilities') or row.get('fasilitas') or '') if f.strip()],
                 available_date=row.get('available_date') or None, status=status,
                 notes=row.get('notes') or row.get('catatan') or None,
                 vacant_since=now_utc() if status == 'kosong' else None, origin='user')
        await units.insert_one(u.to_mongo())
        imported += 1
    await log_activity_async(aid, 'units_imported', 'unit', f'Impor {imported} unit dari CSV')
    return {'imported': imported, 'properties_created': props_created, 'errors': errors}


@router.post('/units/{uid}/photos')
async def upload_unit_photo(uid: str, file: UploadFile, user: dict = Depends(current_account)):
    from storage_client import upload_unit_photo as _upload
    aid = account_id(user)
    u = await units.find_one({'_id': ObjectId(uid), 'account_id': aid, 'deleted_at': None})
    if not u:
        raise HTTPException(404, 'Unit tidak ditemukan')
    try:
        res = await _upload(aid, file)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:
        raise HTTPException(502, 'Gagal mengunggah foto. Coba lagi.')
    await units.update_one({'_id': ObjectId(uid)}, {'$push': {'photos': res['path']}})
    from database import files
    await files.insert_one({'path': res['path'], 'owner_id': aid, 'created_at': now_utc()})
    return {'path': res['path'], 'url': f"/api/files/{res['path']}"}


@router.get('/files/{fpath:path}')
async def get_file(fpath: str, token: str | None = None,
                   cred: 'HTTPAuthorizationCredentials | None' = Depends(_bearer)):
    """Serve an uploaded file. Native sends the Bearer header; web <img> uses ?token=."""
    from auth_utils import SECRET
    import jwt
    raw = (cred.credentials if cred else None) or token
    aid = None
    if raw:
        try:
            payload = jwt.decode(raw, SECRET, algorithms=['HS256'])
            if payload.get('sub'):
                aid = payload['sub']
        except Exception:
            aid = None
    if not aid:
        raise HTTPException(401, 'Tidak punya akses ke file ini')
    from database import files
    rec = await files.find_one({'path': fpath})
    if not rec or rec.get('owner_id') != aid:
        raise HTTPException(404, 'File tidak ditemukan')
    from starlette.concurrency import run_in_threadpool
    from fastapi.responses import Response
    from storage_client import read_object
    data, ctype = await run_in_threadpool(read_object, fpath)
    return Response(content=data, media_type=ctype,
                    headers={'Cache-Control': 'private, max-age=86400'})


# ============================== Leads =========================================

class LeadIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    phone: str | None = None
    budget_min: int | None = None
    budget_max: int | None = None
    preferred_location: str | None = None
    unit_type: str | None = None
    move_in_date: str | None = None
    occupants: int | None = None
    requirements: list[str] = Field(default_factory=list)
    ai_note: str | None = None


@router.get('/leads')
async def list_leads(status: str | None = None, user: dict = Depends(current_account)):
    aid = account_id(user)
    q: dict = {'account_id': aid, 'deleted_at': None}
    if status and status != 'semua':
        q['status'] = status
    docs = await leads.find(q).sort([('needs_followup', -1), ('last_interaction_at', -1)]).to_list(None)
    umap = await _units_map(aid)
    pmap = await _props_map(aid)
    out = []
    for l in docs:
        d = lead_out(l, umap, pmap)
        if l.get('matched_unit_id') and l['matched_unit_id'] in umap:
            u = umap[l['matched_unit_id']]
            d['matched_unit'] = {'id': str(u['_id']), 'name': u['name'], 'unit_type': u.get('unit_type', ''),
                                 'monthly_price': u.get('monthly_price', 0), 'status': u.get('status')}
        out.append(d)
    return out


@router.post('/leads')
async def create_lead(body: LeadIn, user: dict = Depends(current_account)):
    aid = account_id(user)
    l = Lead(account_id=aid, **body.model_dump(), last_interaction_at=now_utc(), status='baru', origin='user')
    await leads.insert_one(l.to_mongo())
    await log_activity_async(aid, 'lead_added', 'lead', f'Menambahkan calon penyewa {l.name}', l.id)
    return noid(l.to_mongo() | {'_id': ObjectId(l.id)})


@router.get('/leads/{lid}')
async def get_lead(lid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    l = await leads.find_one({'_id': ObjectId(lid), 'account_id': aid, 'deleted_at': None})
    if not l:
        raise HTTPException(404, 'Calon penyewa tidak ditemukan')
    umap = await _units_map(aid)
    pmap = await _props_map(aid)
    out = lead_out(l, umap, pmap)
    vdocs = await viewings.find({'account_id': aid, 'lead_id': out['id'], 'deleted_at': None})\
        .sort('scheduled_at', -1).to_list(None)
    out['viewings'] = []
    for v in vdocs:
        vd = noid(v)
        u = umap.get(v.get('unit_id') or '')
        vd['unit_name'] = u['name'] if u else '-'
        out['viewings'].append(vd)
    return out


@router.put('/leads/{lid}')
async def update_lead(lid: str, body: LeadIn, user: dict = Depends(current_account)):
    aid = account_id(user)
    l = Lead(account_id=aid, **body.model_dump())
    await leads.update_one({'_id': ObjectId(lid), 'account_id': aid},
                           {'$set': {k: v for k, v in l.model_dump().items() if k not in ('id', 'account_id', 'created_at')}})
    return await get_lead(lid, user)


@router.delete('/leads/{lid}')
async def delete_lead(lid: str, user: dict = Depends(current_account)):
    await leads.update_one({'_id': ObjectId(lid), 'account_id': account_id(user)},
                           {'$set': {'deleted_at': now_utc()}})
    return {'ok': True}


@router.post('/leads/{lid}/contacted')
async def lead_contacted(lid: str, body: dict, user: dict = Depends(current_account)):
    aid = account_id(user)
    l = await leads.find_one({'_id': ObjectId(lid), 'account_id': aid, 'deleted_at': None})
    if not l:
        raise HTTPException(404, 'Calon penyewa tidak ditemukan')
    setq: dict = {'last_contact_at': now_utc(), 'needs_followup': False,
                  'last_interaction_at': now_utc()}
    if l.get('status') in ('baru', 'perlu_followup'):
        setq['status'] = 'sedang_ngobrol'
    if body.get('message'):
        setq['suggested_followup'] = body['message']
    await leads.update_one({'_id': ObjectId(lid)}, {'$set': setq})
    await log_activity_async(aid, 'followup_sent', 'lead', f'Follow-up {l["name"]} dikirim')
    return await get_lead(lid, user)


@router.post('/leads/{lid}/draft-followup')
async def lead_draft_followup(lid: str, user: dict = Depends(current_account)):
    from ai_service import llm_json, followup_prompt, SYSTEM_ADMIN, MODEL_FAST
    aid = account_id(user)
    l = await leads.find_one({'_id': ObjectId(lid), 'account_id': aid, 'deleted_at': None})
    if not l:
        raise HTTPException(404, 'Calon penyewa tidak ditemukan')
    umap = await _units_map(aid)
    unit = umap.get(l.get('matched_unit_id') or '')
    pmap = await _props_map(aid)
    unit_ctx = None
    if unit:
        unit_ctx = {'name': unit['name'], 'unit_type': unit.get('unit_type', ''),
                    'monthly_price': unit.get('monthly_price', 0)}
    ld = noid(l)
    try:
        res = await llm_json(f'followup-{aid}', SYSTEM_ADMIN,
                             followup_prompt(ld, unit_ctx), MODEL_FAST, timeout_s=45)
        return {'draft': res.get('draft', '')}
    except Exception:
        raise HTTPException(502, 'AI sedang sibuk. Coba lagi sebentar.')


@router.post('/leads/{lid}/not-interested')
async def lead_not_interested(lid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    await leads.update_one({'_id': ObjectId(lid), 'account_id': aid}, {'$set': {'status': 'tidak_jadi'}})
    return {'ok': True}


@router.post('/leads/{lid}/deal')
async def lead_deal(lid: str, body: dict, user: dict = Depends(current_account)):
    aid = account_id(user)
    l = await leads.find_one({'_id': ObjectId(lid), 'account_id': aid, 'deleted_at': None})
    if not l:
        raise HTTPException(404, 'Calon penyewa tidak ditemukan')
    unit_id = body.get('unit_id') or l.get('matched_unit_id')
    if not unit_id:
        raise HTTPException(400, 'Pilih unit dulu sebelum menandai deal')
    u = await units.find_one({'_id': ObjectId(unit_id), 'account_id': aid, 'deleted_at': None})
    if not u:
        raise HTTPException(404, 'Unit tidak ditemukan')
    if u.get('status') == 'terisi':
        raise HTTPException(400, f'Unit {u["name"]} sudah terisi')
    start = body.get('start_date') or today_wib().date().isoformat()
    end = body.get('end_date')
    due_day = int(body.get('due_day') or 10)
    t = Tenant(account_id=aid, lead_id=lid, unit_id=str(u['_id']), name=l['name'],
               phone=l.get('phone'), start_date=start, end_date=end,
               monthly_rent=u.get('monthly_price', 0), deposit=u.get('deposit', 0),
               payment_due_day=due_day, origin='user')
    await tenants.insert_one(t.to_mongo())
    docs = generate_payments(aid, t.id, str(u['_id']), u.get('monthly_price', 0), start, end, due_day)
    if docs:
        await payments.insert_many(docs)
    await units.update_one({'_id': u['_id']}, {'$set': {'status': 'terisi', 'occupied_since': now_utc(), 'vacant_since': None}})
    await leads.update_one({'_id': ObjectId(lid)}, {'$set': {'status': 'deal'}})
    await log_activity_async(aid, 'lead_deal', 'lead', f'{l["name"]} resmi jadi tenant di unit {u["name"]}', lid)
    return {'tenant_id': t.id, 'unit_id': str(u['_id']), 'payments_created': len(docs)}


# ============================== Viewings ======================================

class ViewingIn(BaseModel):
    lead_id: str
    unit_id: str
    scheduled_at: str
    note: str | None = None


@router.get('/viewings')
async def list_viewings(user: dict = Depends(current_account)):
    aid = account_id(user)
    docs = await viewings.find({'account_id': aid, 'deleted_at': None, 'status': {'$in': ['menunggu', 'terjadwal']}})\
        .sort('scheduled_at', 1).to_list(None)
    umap = await _units_map(aid)
    out = []
    for v in docs:
        d = noid(v)
        l = await leads.find_one({'_id': ObjectId(v['lead_id'])}) if v.get('lead_id') else None
        u = umap.get(v.get('unit_id') or '')
        d['lead_name'] = l['name'] if l else '-'
        d['unit_name'] = u['name'] if u else '-'
        out.append(d)
    return out


@router.post('/viewings')
async def create_viewing(body: ViewingIn, user: dict = Depends(current_account)):
    aid = account_id(user)
    l = await leads.find_one({'_id': ObjectId(body.lead_id), 'account_id': aid, 'deleted_at': None})
    if not l:
        raise HTTPException(404, 'Calon penyewa tidak ditemukan')
    try:
        when = datetime.fromisoformat(body.scheduled_at)
        if when.tzinfo is None:
            when = when.replace(tzinfo=WIB)
    except Exception:
        raise HTTPException(400, 'Format tanggal tidak valid')
    v = Viewing(account_id=aid, lead_id=body.lead_id, unit_id=body.unit_id,
                scheduled_at=when, note=body.note, origin='user')
    await viewings.insert_one(v.to_mongo())
    await leads.update_one({'_id': ObjectId(body.lead_id)}, {'$set': {'status': 'viewing', 'needs_followup': False}})
    await log_activity_async(aid, 'viewing_scheduled', 'viewing',
                             f'Viewing {l["name"]} dijadwalkan', v.id)
    return noid(v.to_mongo() | {'_id': ObjectId(v.id)})


@router.post('/viewings/{vid}/confirm')
async def confirm_viewing(vid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    await viewings.update_one({'_id': ObjectId(vid), 'account_id': aid}, {'$set': {'status': 'terjadwal'}})
    return {'ok': True}


@router.post('/viewings/{vid}/reschedule')
async def reschedule_viewing(vid: str, body: dict, user: dict = Depends(current_account)):
    aid = account_id(user)
    try:
        when = datetime.fromisoformat(body['scheduled_at'])
        if when.tzinfo is None:
            when = when.replace(tzinfo=WIB)
    except Exception:
        raise HTTPException(400, 'Format tanggal tidak valid')
    await viewings.update_one({'_id': ObjectId(vid), 'account_id': aid},
                              {'$set': {'scheduled_at': when, 'status': 'menunggu'}})
    return {'ok': True}


@router.post('/viewings/{vid}/cancel')
async def cancel_viewing(vid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    await viewings.update_one({'_id': ObjectId(vid), 'account_id': aid}, {'$set': {'status': 'batal'}})
    return {'ok': True}


@router.post('/viewings/{vid}/complete')
async def complete_viewing(vid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    await viewings.update_one({'_id': ObjectId(vid), 'account_id': aid}, {'$set': {'status': 'selesai'}})
    return {'ok': True}


# ============================== Tenants & Payments ============================

class TenantIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    unit_id: str
    phone: str | None = None
    start_date: str
    end_date: str | None = None
    monthly_rent: int
    deposit: int = 0
    payment_due_day: int = 10


@router.get('/tenants')
async def list_tenants(user: dict = Depends(current_account)):
    aid = account_id(user)
    docs = await tenants.find({'account_id': aid, 'deleted_at': None, 'status': 'aktif'}).sort('name', 1).to_list(None)
    umap = await _units_map(aid)
    today_iso = today_wib().date().isoformat()
    out = []
    for t in docs:
        d = noid(t)
        u = umap.get(t.get('unit_id') or '')
        d['unit_name'] = u['name'] if u else '-'
        unpaid = await payments.find({'account_id': aid, 'tenant_id': d['id'], 'status': 'belum_bayar'})\
            .sort('due_date', 1).to_list(1)
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
    t = await tenants.find_one({'_id': ObjectId(tid), 'account_id': aid, 'deleted_at': None})
    if not t:
        raise HTTPException(404, 'Tenant tidak ditemukan')
    d = noid(t)
    u = await units.find_one({'_id': ObjectId(t['unit_id'])})
    d['unit_name'] = u['name'] if u else '-'
    pays = await payments.find({'account_id': aid, 'tenant_id': tid, 'deleted_at': None})\
        .sort('due_date', 1).to_list(None)
    d['payments'] = [noid(p) for p in pays]
    return d


@router.post('/tenants')
async def create_tenant(body: TenantIn, user: dict = Depends(current_account)):
    aid = account_id(user)
    u = await units.find_one({'_id': ObjectId(body.unit_id), 'account_id': aid, 'deleted_at': None})
    if not u:
        raise HTTPException(404, 'Unit tidak ditemukan')
    if u.get('status') == 'terisi':
        raise HTTPException(400, f'Unit {u["name"]} sudah terisi')
    t = Tenant(account_id=aid, unit_id=body.unit_id, **body.model_dump(exclude={'unit_id'}), origin='user')
    await tenants.insert_one(t.to_mongo())
    docs = generate_payments(aid, t.id, body.unit_id, body.monthly_rent, body.start_date, body.end_date, body.payment_due_day)
    if docs:
        await payments.insert_many(docs)
    await units.update_one({'_id': u['_id']}, {'$set': {'status': 'terisi', 'occupied_since': now_utc(), 'vacant_since': None}})
    await log_activity_async(aid, 'tenant_added', 'tenant', f'{t.name} resmi jadi tenant di unit {u["name"]}', t.id)
    return {'tenant_id': t.id}


@router.post('/tenants/{tid}/checkout')
async def checkout_tenant(tid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    t = await tenants.find_one({'_id': ObjectId(tid), 'account_id': aid, 'deleted_at': None})
    if not t:
        raise HTTPException(404, 'Tenant tidak ditemukan')
    await tenants.update_one({'_id': t['_id']},
                             {'$set': {'status': 'checkout', 'end_date': today_wib().date().isoformat()}})
    await units.update_one({'_id': ObjectId(t['unit_id'])},
                           {'$set': {'status': 'kosong', 'vacant_since': now_utc(), 'occupied_since': None}})
    await log_activity_async(aid, 'tenant_checkout', 'tenant', f'{t["name"]} checkout — unit kembali kosong', tid)
    return {'ok': True}


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
        t = tmap.get(p.get('tenant_id') or '')
        u = umap.get(p.get('unit_id') or '')
        d['tenant_name'] = t['name'] if t else '-'
        d['unit_name'] = u['name'] if u else '-'
        d['days_late'] = days_late(p['due_date']) if p['status'] == 'belum_bayar' else 0
        out.append(d)
    return out


@router.post('/payments/{pid}/mark-paid')
async def mark_paid(pid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    p = await payments.find_one({'_id': ObjectId(pid), 'account_id': aid})
    if not p:
        raise HTTPException(404, 'Pembayaran tidak ditemukan')
    await payments.update_one({'_id': p['_id']}, {'$set': {'status': 'lunas', 'paid_at': now_utc()}})
    t = await tenants.find_one({'_id': ObjectId(p['tenant_id'])})
    await log_activity_async(aid, 'payment_paid', 'payment',
                             f'Pembayaran {t["name"] if t else "-"} lunas', pid)
    return {'ok': True}


@router.post('/payments/{pid}/remind-draft')
async def payment_remind_draft(pid: str, user: dict = Depends(current_account)):
    from ai_service import llm_json, payment_reminder_prompt, SYSTEM_ADMIN, MODEL_FAST
    aid = account_id(user)
    p = await payments.find_one({'_id': ObjectId(pid), 'account_id': aid})
    if not p:
        raise HTTPException(404, 'Pembayaran tidak ditemukan')
    t = await tenants.find_one({'_id': ObjectId(p['tenant_id'])})
    u = await units.find_one({'_id': ObjectId(p['unit_id'])})
    ctx = {
        'tenant_name': t['name'] if t else '-', 'unit_name': u['name'] if u else '-',
        'period_label': _period_label(p['period']), 'amount': p.get('amount', 0),
        'due_label': p['due_date'], 'days_late': days_late(p['due_date']),
    }
    try:
        res = await llm_json(f'reminder-{aid}', SYSTEM_ADMIN, payment_reminder_prompt(ctx), MODEL_FAST, timeout_s=45)
        return {'draft': res.get('draft', '')}
    except Exception:
        raise HTTPException(502, 'AI sedang sibuk. Coba lagi sebentar.')


@router.post('/payments/{pid}/reminded')
async def payment_reminded(pid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    p = await payments.find_one({'_id': ObjectId(pid), 'account_id': aid})
    if not p:
        raise HTTPException(404, 'Pembayaran tidak ditemukan')
    await payments.update_one({'_id': p['_id']},
                              {'$set': {'last_reminded_at': now_utc()},
                               '$inc': {'reminder_count': 1}})
    t = await tenants.find_one({'_id': ObjectId(p['tenant_id'])})
    await log_activity_async(aid, 'payment_reminded', 'payment',
                             f'Pengingat bayar dikirim ke {t["name"] if t else "-"}', pid)
    return {'ok': True}


def _period_label(period: str) -> str:
    import calendar as _c
    try:
        y, m = period.split('-')
        return f'{_c.month_name[int(m)]} {y}'
    except Exception:
        return period


# ============================== Maintenance ===================================

class MaintIn(BaseModel):
    description: str = Field(min_length=3, max_length=2000)
    unit_id: str | None = None


@router.get('/maintenance')
async def list_maintenance(status: str | None = None, user: dict = Depends(current_account)):
    aid = account_id(user)
    q: dict = {'account_id': aid, 'deleted_at': None}
    if status and status != 'semua':
        if status == 'aktif':
            q['status'] = {'$in': ['baru', 'sedang']}
        else:
            q['status'] = status
    docs = await maintenance.find(q).sort('created_at', -1).to_list(None)
    umap = await _units_map(aid)
    out = []
    prio_rank = {'urgent': 0, 'normal': 1, 'rendah': 2}
    for m in docs:
        d = noid(m)
        u = umap.get(m.get('unit_id') or '')
        d['unit_name'] = u['name'] if u else None
        out.append(d)
    out.sort(key=lambda x: (x['status'] == 'selesai', prio_rank.get(x.get('priority', 'normal'), 1)))
    return out


@router.post('/maintenance')
async def create_maintenance(body: MaintIn, user: dict = Depends(current_account)):
    from ai_service import llm_json, classify_prompt, SYSTEM_ADMIN, MODEL_FAST
    aid = account_id(user)
    umap = await _units_map(aid)
    umap_names = {u['name']: str(u['_id']) for u in umap.values()}
    category, priority, ai_summary, unit_id = 'Lainnya', 'normal', body.description[:140], body.unit_id
    try:
        res = await llm_json(f'maint-{aid}', SYSTEM_ADMIN,
                             classify_prompt(body.description, list(umap_names.keys())),
                             MODEL_FAST, timeout_s=45)
        category = res.get('category') or category
        priority = res.get('priority') or priority
        ai_summary = res.get('summary') or ai_summary
        hint = (res.get('unit_name') or '').lower().strip()
        if not body.unit_id and hint:
            for uname, uid in umap_names.items():
                un = uname.lower()
                if un == hint or un in hint or hint in un:
                    unit_id = uid
                    break
        if priority not in ('urgent', 'normal', 'rendah'):
            priority = 'normal'
    except Exception:
        pass  # fallback classification above
    m = Maintenance(account_id=aid, description=body.description, unit_id=unit_id,
                    category=category, priority=priority, ai_summary=ai_summary,
                    status='baru', origin='user')
    await maintenance.insert_one(m.to_mongo())
    await log_activity_async(aid, 'maintenance_reported', 'maintenance',
                             f'Laporan baru: {category} — {ai_summary[:60]}', m.id)
    return noid(m.to_mongo() | {'_id': ObjectId(m.id)})


@router.post('/maintenance/{mid}/start')
async def start_maintenance(mid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    await maintenance.update_one({'_id': ObjectId(mid), 'account_id': aid}, {'$set': {'status': 'sedang'}})
    return {'ok': True}


@router.post('/maintenance/{mid}/resolve')
async def resolve_maintenance(mid: str, user: dict = Depends(current_account)):
    aid = account_id(user)
    m = await maintenance.find_one({'_id': ObjectId(mid), 'account_id': aid})
    if not m:
        raise HTTPException(404, 'Masalah tidak ditemukan')
    await maintenance.update_one({'_id': m['_id']},
                                 {'$set': {'status': 'selesai', 'resolved_at': now_utc()}})
    if m.get('unit_id'):
        await units.update_one({'_id': ObjectId(m['unit_id']), 'status': 'maintenance'},
                               {'$set': {'status': 'kosong', 'vacant_since': now_utc()}})
    await log_activity_async(aid, 'maintenance_resolved', 'maintenance',
                             f'Masalah selesai: {m.get("ai_summary") or m.get("category", "")[:60]}', mid)
    return {'ok': True}


# ============================== Today / Impact / Activities ===================

@router.get('/today')
async def today(user: dict = Depends(current_account)):
    aid = account_id(user)
    now = now_utc()
    today = today_wib().date()
    cutoff = now - timedelta(days=3)

    umap = await _units_map(aid)
    pmap = await _props_map(aid)
    items: list[dict] = []

    ldocs = await leads.find({'account_id': aid, 'deleted_at': None, 'status': {'$nin': ['deal', 'tidak_jadi']}}).to_list(None)
    for l in ldocs:
        stale = l.get('last_interaction_at') or l.get('created_at')
        if stale and stale.tzinfo is None:
            stale = stale.replace(tzinfo=now.tzinfo)
        needs = l.get('status') == 'perlu_followup' or (
            l.get('status') in ('baru', 'sedang_ngobrol') and stale and stale < cutoff)
        if not needs:
            continue
        u = umap.get(l.get('matched_unit_id') or '')
        unit_info = None
        if u:
            unit_info = {'id': str(u['_id']), 'name': u['name'], 'unit_type': u.get('unit_type', ''),
                         'monthly_price': u.get('monthly_price', 0),
                         'property_name': (pmap.get(u.get('property_id') or '') or {}).get('name', '')}
        d = noid(l)
        items.append({
            'type': 'followup', 'id': d['id'], 'lead_id': d['id'], 'name': l['name'],
            'subtitle': ' · '.join(filter(None, [
                l.get('unit_type') or None,
                f"Budget max Rp{(l.get('budget_max') or l.get('budget_min') or 0):,}".replace(',', '.') if (l.get('budget_max') or l.get('budget_min')) else None,
            ])),
            'ai_note': l.get('ai_note') or l.get('interest_note'),
            'suggested_followup': l.get('suggested_followup'),
            'phone': l.get('phone'),
            'last_interaction_at': d.get('last_interaction_at'),
            'unit': unit_info, 'priority': 2,
        })

    vdocs = await viewings.find({'account_id': aid, 'deleted_at': None,
                                 'status': {'$in': ['menunggu', 'terjadwal']}}).sort('scheduled_at', 1).to_list(None)
    for v in vdocs:
        if v.get('status') == 'terjadwal' and v.get('scheduled_at') and v['scheduled_at'] < now - timedelta(hours=4):
            continue
        l = await leads.find_one({'_id': ObjectId(v['lead_id'])}) if v.get('lead_id') else None
        u = umap.get(v.get('unit_id') or '')
        items.append({
            'type': 'viewing', 'id': str(v['_id']), 'viewing_id': str(v['_id']),
            'lead_id': v.get('lead_id'), 'unit_id': v.get('unit_id'),
            'name': l['name'] if l else '-', 'unit_name': u['name'] if u else '-',
            'scheduled_at': v['scheduled_at'].isoformat() if isinstance(v.get('scheduled_at'), datetime) else str(v.get('scheduled_at')),
            'status': v.get('status'), 'priority': 1,
        })

    pays = await payments.find({'account_id': aid, 'deleted_at': None, 'status': 'belum_bayar'}).sort('due_date', 1).to_list(None)
    tmap = {str(t['_id']): t for t in await tenants.find({'account_id': aid, 'deleted_at': None}).to_list(None)}
    horizon = (today + timedelta(days=3)).isoformat()
    unpaid_amount = 0
    for p in pays:
        late = days_late(p['due_date'])
        if late == 0 and p['due_date'] > horizon:
            continue
        t = tmap.get(p.get('tenant_id') or '')
        u = umap.get(p.get('unit_id') or '')
        unpaid_amount += p.get('amount', 0)
        items.append({
            'type': 'payment', 'id': str(p['_id']), 'payment_id': str(p['_id']),
            'tenant_id': p.get('tenant_id'), 'name': t['name'] if t else '-',
            'unit_name': u['name'] if u else '-', 'amount': p.get('amount', 0),
            'due_date': p['due_date'], 'days_late': late, 'phone': t.get('phone') if t else None,
            'priority': 0 if late > 0 else 1,
        })

    mdocs = await maintenance.find({'account_id': aid, 'deleted_at': None, 'status': {'$in': ['baru', 'sedang']}}).to_list(None)
    for m in mdocs:
        u = umap.get(m.get('unit_id') or '')
        items.append({
            'type': 'maintenance', 'id': str(m['_id']), 'maintenance_id': str(m['_id']),
            'description': m.get('description'), 'ai_summary': m.get('ai_summary'),
            'category': m.get('category'), 'status': m.get('status'),
            'unit_name': u['name'] if u else None,
            'urgent': m.get('priority') == 'urgent', 'priority': 0 if m.get('priority') == 'urgent' else 2,
        })

    items.sort(key=lambda x: x.get('priority', 3))
    all_units = list(umap.values())
    stat = {
        'total': len(all_units),
        'terisi': sum(1 for u in all_units if u.get('status') == 'terisi'),
        'kosong': sum(1 for u in all_units if u.get('status') == 'kosong'),
        'reserved': sum(1 for u in all_units if u.get('status') == 'reserved'),
        'maintenance': sum(1 for u in all_units if u.get('status') == 'maintenance'),
    }
    counts = {
        'followups': sum(1 for i in items if i['type'] == 'followup'),
        'viewings': sum(1 for i in items if i['type'] == 'viewing'),
        'unpaid_amount': unpaid_amount,
        'unpaid_count': sum(1 for i in items if i['type'] == 'payment'),
        'urgent': sum(1 for i in items if i['type'] == 'maintenance' and i.get('urgent')),
        'total': len(items),
    }
    return {'name': user.get('name', ''), 'is_demo': bool(user.get('is_demo')),
            'units': stat, 'counts': counts, 'items': items}


@router.get('/today/summary')
async def today_summary(user: dict = Depends(current_account)):
    from ai_service import llm_json, daily_summary_prompt, SYSTEM_ADMIN, MODEL_FAST
    aid = account_id(user)
    date_key = today_wib().strftime('%Y-%m-%d')
    cached = await summaries.find_one({'account_id': aid, 'date_key': date_key})
    if cached:
        return {'summary': cached.get('content', '')}
    base = await today(user)
    stat = base['units']
    items = [{'tipe': i['type'], 'nama': i.get('name'), 'detail': i.get('subtitle') or i.get('ai_summary') or i.get('unit_name') or ''}
             for i in base['items'][:12]]
    try:
        res = await llm_json(f'summary-{aid}-{date_key}', SYSTEM_ADMIN,
                             daily_summary_prompt(user.get('name', ''), items, stat),
                             MODEL_FAST, timeout_s=30)
        summary = (res.get('summary') or '').strip()[:300]
    except Exception:
        c = base['counts']
        summary = f"Ada {c['total']} hal yang perlu diberesin hari ini. Yang paling mendesak{' ,komplain urgent' if c['urgent'] else ''}: cek antreannya di bawah.".replace(' ,', ',')
    await summaries.insert_one({'account_id': aid, 'date_key': date_key, 'content': summary, 'created_at': now_utc()})
    return {'summary': summary}


@router.get('/impact')
async def impact(user: dict = Depends(current_account)):
    aid = account_id(user)
    from database import conversations
    acts = await activities.find({'account_id': aid, 'origin': 'user'}).to_list(None)
    counts = {
        'leads_analyzed': 0, 'followups_found': 0, 'viewings_scheduled': 0,
        'payments_reminded': 0, 'maintenance_resolved': 0, 'payments_paid': 0,
    }
    for a in acts:
        act = a.get('action')
        if act == 'lead_analyzed':
            counts['leads_analyzed'] += 1
        elif act == 'followup_found':
            counts['followups_found'] += 1
        elif act == 'viewing_scheduled':
            counts['viewings_scheduled'] += 1
        elif act == 'payment_reminded':
            counts['payments_reminded'] += 1
        elif act == 'maintenance_resolved':
            counts['maintenance_resolved'] += 1
        elif act == 'payment_paid':
            counts['payments_paid'] += 1
    convs = await conversations.find({'account_id': aid, 'origin': 'user'}).to_list(None)
    messages_read = sum(c.get('message_count', 0) for c in convs)
    base = await today(user)
    minutes = (counts['leads_analyzed'] * 2 + counts['followups_found'] * 3 +
               counts['viewings_scheduled'] * 10 + counts['payments_reminded'] * 3 +
               counts['maintenance_resolved'] * 10)
    feed = await activities.find({'account_id': aid}).sort('created_at', -1).to_list(30)
    return {
        'counts': counts, 'messages_read': messages_read, 'tasks_now': base['counts']['total'],
        'minutes_saved': minutes, 'is_demo': bool(user.get('is_demo')),
        'activities': [{
            'id': str(a['_id']), 'action': a.get('action'), 'title': a.get('title'),
            'origin': a.get('origin', 'user'), 'created_at': a['created_at'].isoformat() if isinstance(a.get('created_at'), datetime) else str(a.get('created_at')),
        } for a in feed],
    }


@router.get('/activities')
async def list_activities(limit: int = 50, user: dict = Depends(current_account)):
    aid = account_id(user)
    docs = await activities.find({'account_id': aid}).sort('created_at', -1).to_list(min(limit, 100))
    return [{'id': str(a['_id']), 'action': a.get('action'), 'title': a.get('title'),
             'origin': a.get('origin', 'user'),
             'created_at': a['created_at'].isoformat() if isinstance(a.get('created_at'), datetime) else str(a.get('created_at'))} for a in docs]
