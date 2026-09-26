from __future__ import annotations

import json
from datetime import datetime, timedelta

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth_utils import current_account, account_id
from database import units, leads, properties, payments, tenants, maintenance, viewings, conversations, ai_insights, tanya_messages
from helpers import log_activity_async, days_late, days_since
from models import Conversation, Lead, TanyaMessage, now_utc, today_wib
from routers_main import noid, _units_map, _props_map, unit_out, lead_out

router = APIRouter(prefix='/api')

SAMPLE = None


class AnalyzeIn(BaseModel):
    text: str = Field(min_length=1, max_length=200000)
    source_type: str = 'paste'


class AskIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


@router.post('/ai/analyze-chat')
async def analyze_chat(body: AnalyzeIn, user: dict = Depends(current_account)):
    from ai_service import (llm_json, analyze_prompt, parse_chat_stats,
                            best_match, match_score, SYSTEM_ADMIN, MODEL_STRONG)
    aid = account_id(user)
    text = body.text.strip()[:80000]
    if len(text) < 20:
        raise HTTPException(400, 'Percakapan terlalu pendek untuk dianalisis.')

    msg_count, part_count = parse_chat_stats(text)
    pmap = await _props_map(aid)
    unit_docs = await units.find({'account_id': aid, 'deleted_at': None,
                                  'status': {'$in': ['kosong', 'reserved']}}).to_list(None)
    unit_ctx = []
    for u in unit_docs:
        d = unit_out(u, pmap)
        unit_ctx.append(d)

    today = today_wib()
    try:
        result = await llm_json(f'analyze-{aid}', SYSTEM_ADMIN,
                                analyze_prompt(text, unit_ctx, today), MODEL_STRONG, timeout_s=150)
    except Exception:
        raise HTTPException(502, 'AI sedang tidak bisa menganalisis. Coba lagi sebentar.')

    raw_leads = result.get('leads') or []
    if not raw_leads:
        raise HTTPException(422, 'Tidak ada calon penyewa yang terbaca dari percakapan ini.')

    conv = Conversation(account_id=aid, source_type=body.source_type, raw_text=text[:40000],
                        message_count=msg_count, participant_count=part_count)
    await conversations.insert_one(conv.to_mongo())

    umap_all = await _units_map(aid)
    unit_by_id = {u['id']: u for u in unit_ctx}
    out_leads, potential, followup_found = [], 0, 0

    for rl in raw_leads[:50]:
        name = str(rl.get('name') or '').strip() or 'Tanpa nama'
        try:
            conf = min(1.0, max(0.0, float(rl.get('confidence') or 0)))
        except Exception:
            conf = 0.0

        def to_int(v):
            if isinstance(v, (int, float)):
                return int(v)
            if isinstance(v, str):
                digits = ''.join(ch for ch in v if ch.isdigit())
                return int(digits) if digits else None
            return None

        days_ago = rl.get('last_interaction_days_ago')
        last_at = now_utc() - timedelta(days=int(days_ago)) if isinstance(days_ago, (int, float)) and int(days_ago) >= 0 else None
        needs = bool(rl.get('needs_followup'))

        matched_id = rl.get('matched_unit_id')
        unit = unit_by_id.get(matched_id) if matched_id else None
        score, reasons = 0, []
        if unit:
            score, reasons = match_score(rl, unit, unit.get('property_name', ''))
            if not reasons and rl.get('match_reasons'):
                reasons = [str(r)[:60] for r in rl['match_reasons'][:3]]
        else:
            cand_id, cand_score, cand_reasons = best_match(rl, unit_ctx)
            if cand_id and cand_score >= 50:
                matched_id, score, reasons = cand_id, cand_score, cand_reasons
                unit = unit_by_id.get(cand_id)

        status = 'perlu_followup' if needs else ('sedang_ngobrol' if rl.get('interest') == 'medium' else 'baru')
        lead = Lead(account_id=aid, name=name, phone=rl.get('phone'),
                    budget_min=to_int(rl.get('budget_min')), budget_max=to_int(rl.get('budget_max')),
                    preferred_location=rl.get('preferred_location'), unit_type=rl.get('unit_type'),
                    move_in_date=str(rl.get('move_in_date')) if rl.get('move_in_date') else None,
                    occupants=rl.get('occupants') if isinstance(rl.get('occupants'), int) else None,
                    requirements=[str(r)[:60] for r in (rl.get('requirements') or [])[:6]],
                    interest=rl.get('interest') if rl.get('interest') in ('high', 'medium', 'low') else 'medium',
                    interest_note=rl.get('interest_note'), quote=rl.get('quote'),
                    summary=rl.get('summary'), last_interaction_at=last_at,
                    needs_followup=needs, followup_when=rl.get('followup_when'),
                    followup_reason=rl.get('followup_reason'),
                    suggested_followup=rl.get('suggested_followup'),
                    confidence=conf, status=status,
                    ai_note=rl.get('interest_note') or rl.get('summary'),
                    matched_unit_id=matched_id, match_score=score or None,
                    match_reasons=[str(r)[:60] for r in reasons[:3]],
                    conversation_id=conv.id, source='chat_import', origin='user')
        await leads.insert_one(lead.to_mongo())
        d = noid(lead.to_mongo() | {'_id': ObjectId(lead.id)})
        if unit:
            d['matched_unit'] = {'id': unit['id'], 'name': unit['name'], 'unit_type': unit.get('unit_type', ''),
                                 'monthly_price': unit.get('monthly_price', 0), 'status': unit.get('status')}
        out_leads.append(d)
        if needs:
            followup_found += 1
            if unit:
                potential += unit.get('monthly_price', 0)
        await log_activity_async(aid, 'lead_analyzed', 'lead', f'{name} ditemukan dari percakapan', lead.id)
        if needs:
            await log_activity_async(aid, 'followup_found', 'lead', f'{name} perlu di-follow-up', lead.id)

    await conversations.update_one({'_id': ObjectId(conv.id)},
                                   {'$set': {'lead_count': len(out_leads),
                                             'potential_value': potential,
                                             'followup_count': followup_found}})
    await ai_insights.insert_one({'account_id': aid, 'type': 'chat_analysis',
                                  'input_ref': conv.id,
                                  'output': {'leads_found': len(out_leads), 'raw': result},
                                  'created_at': now_utc()})
    await log_activity_async(aid, 'chat_analyzed', 'conversation',
                             f'Menganalisis {msg_count} pesan ({len(out_leads)} calon penyewa ditemukan)', conv.id)

    return {'conversation_id': conv.id, 'messages_read': msg_count,
            'participants': part_count, 'leads': out_leads,
            'followup_found': followup_found, 'potential_value': potential}


@router.get('/ai/sample-chat')
async def sample_chat():
    t = today_wib()

    def d(days_ago, h, m):
        dt = t - timedelta(days=days_ago)
        return f'[{dt.day}/{dt.month}/{dt.year}, {h:02d}.{m:02d}]'

    return {'text': f"""{d(8, 9, 14)} Jessica: Hai kak, mau tanya unit di Tokyo Riverside
{d(8, 9, 16)} Admin: Hai kak, silakan 😊 Mau tipe apa kak?
{d(8, 9, 17)} Jessica: Ada studio sekitar 3 jutaan ga kak?
{d(8, 9, 20)} Admin: Ada kak, Tokyo Riverside A12 studio, 3.2 juta sudah fully furnished.
{d(8, 9, 22)} Jessica: Fully furnished ya kak? Sama dibalik kasur ada lemari kan?
{d(8, 9, 25)} Admin: Iya kak, lengkap. Kasur, lemari, meja, AC, wifi juga ada.
{d(8, 9, 30)} Jessica: Ok kak, budgetnya masih masuk. Boleh lihat unitnya minggu ini?
{d(8, 9, 33)} Admin: Boleh kak, nanti aku bantu jadwalkan.
{d(8, 14, 5)} Jessica: Aku diskusi sama suami dulu ya kak.
{d(8, 14, 7)} Admin: Siap kak, aku tunggu kabarnya ya 😊

{d(1, 12, 2)} Budi: Kak, kos di Cempaka Putih yang bagian belakang masih ada?
{d(1, 12, 10)} Admin: Ada kak, M04 kosong. Kost 4x5, ada AC dan kamar mandi dalam.
{d(1, 12, 15)} Budi: Berapa per bulan kak?
{d(1, 12, 16)} Admin: 1.8 juta kak, udah termasuk listrik.
{d(1, 12, 21)} Budi: Masih kosong nggak kak untuk bulan depan?
{d(1, 12, 22)} Admin: Masih kak, aman. Mau sekalian lihat kamar minggu ini?
{d(0, 8, 40)} Budi: Insya allah kak, aku kabari besok ya.

{d(5, 19, 30)} Maya: Kak kos di Cempaka Putih yang ada AC berapa ya?
{d(5, 19, 40)} Admin: Ada kak, mulai 1.5 juta, AC + kamar mandi dalam.
{d(5, 19, 55)} Maya: Hmm oke kak, aku cek budget dulu.
{d(5, 20, 1)} Admin: Siap kak, kalau mau lihat kamar bilang aja ya.

{d(2, 10, 11)} Rizky: Kak, kalau 2 kamar sekitar 6-7 juta ada ga kak? Buat keluarga.
{d(2, 10, 15)} Admin: Ada kak, Tokyo Riverside D11, 2 bedroom 6.8 juta, furnished, ada dapur.
{d(2, 10, 20)} Rizky: Boleh kak. Rencananya pindah bulan agustus, istri dan anak ikut.
{d(2, 10, 24)} Admin: Siap kak, D11 masih kosong. Nanti aku follow-up lagi ya sebelum agustus.
{d(2, 10, 30)} Rizky: Oke kak makasih banyak.

{d(13, 16, 45)} Sari: Kak, unit C21 yang 1 bedroom masih ada? Renov dulu rumahku sih hehe
{d(13, 16, 50)} Admin: Masih kak, 4.5 juta. Mau dijadwalkan lihat?
{d(13, 16, 59)} Sari: Nanti kabari lagi ya kak.

{d(0, 7, 50)} Andre: Kak apartemen ada ga yang 1 jutaan? Berenang gratis pula
{d(0, 7, 55)} Admin: Belum ada kak, rentangan kami mulai 2.9 juta.
{d(0, 7, 58)} Andre: Yah oke deh kak makasih"""}


@router.post('/ai/ask')
async def ask(body: AskIn, user: dict = Depends(current_account)):
    from ai_service import llm_json, tanya_prompt, TANYA_SYSTEM, MODEL_STRONG
    aid = account_id(user)
    today = today_wib()
    umap = await _units_map(aid)
    pmap = await _props_map(aid)

    all_units = list(umap.values())
    kosong = [{'id': str(u['_id']), 'name': u['name'],
               'properti': (pmap.get(u.get('property_id') or '') or {}).get('name', ''),
               'tipe': u.get('unit_type'), 'harga': u.get('monthly_price'),
               'hari_kosong': days_since(u.get('vacant_since'))}
              for u in all_units if u.get('status') == 'kosong']

    tmap = {str(t['_id']): t for t in await tenants.find({'account_id': aid, 'deleted_at': None}).to_list(None)}
    belum = []
    for p in await payments.find({'account_id': aid, 'status': 'belum_bayar'}).sort('due_date', 1).to_list(None):
        t = tmap.get(p.get('tenant_id') or '')
        u = umap.get(p.get('unit_id') or '')
        belum.append({'id': str(p['_id']), 'tenant': t['name'] if t else '-',
                      'unit': u['name'] if u else '-', 'jumlah': p.get('amount'),
                      'jatuh_tempo': p.get('due_date'), 'hari_terlambat': days_late(p['due_date'])})

    ldocs = await leads.find({'account_id': aid, 'deleted_at': None,
                              'status': {'$nin': ['deal', 'tidak_jadi']}}).to_list(None)
    leads_ctx = []
    for l in ldocs:
        u = umap.get(l.get('matched_unit_id') or '')
        leads_ctx.append({'id': str(l['_id']), 'nama': l.get('name'), 'status': l.get('status'),
                          'budget_max': l.get('budget_max'), 'tipe': l.get('unit_type'),
                          'catatan_ai': l.get('ai_note') or l.get('interest_note'),
                          'unit_cocok': u['name'] if u else None,
                          'chat_terakhir_hari_lalu': days_since(l.get('last_interaction_at') or l.get('created_at'))})

    vdocs = await viewings.find({'account_id': aid, 'deleted_at': None,
                                 'status': {'$in': ['menunggu', 'terjadwal']}}).sort('scheduled_at', 1).to_list(None)
    viewings_ctx = []
    for v in vdocs:
        l = await leads.find_one({'_id': ObjectId(v['lead_id'])}) if v.get('lead_id') else None
        u = umap.get(v.get('unit_id') or '')
        viewings_ctx.append({'id': str(v['_id']), 'lead': l['name'] if l else '-',
                             'unit': u['name'] if u else '-',
                             'waktu': v['scheduled_at'].isoformat() if isinstance(v.get('scheduled_at'), datetime) else str(v.get('scheduled_at')),
                             'status': v.get('status')})

    mdocs = await maintenance.find({'account_id': aid, 'deleted_at': None,
                                    'status': {'$in': ['baru', 'sedang']}}).to_list(None)
    maint_ctx = [{'id': str(m['_id']), 'unit': (umap.get(m.get('unit_id') or '') or {}).get('name'),
                  'kategori': m.get('category'), 'prioritas': m.get('priority'),
                  'ringkasan': m.get('ai_summary')} for m in mdocs]

    context = {
        'today': today.strftime('%Y-%m-%d'),
        'unit_ringkas': {'total': len(all_units),
                         'terisi': sum(1 for u in all_units if u.get('status') == 'terisi'),
                         'kosong': len(kosong)},
        'unit_kosong': kosong[:30],
        'pembayaran_belum_bayar': belum[:30],
        'calon_penyewa_aktif': leads_ctx[:50],
        'viewing_mendatang': viewings_ctx[:20],
        'masalah_aktif': maint_ctx[:20],
        'tenant_aktif': [{'nama': t['name'], 'unit': (umap.get(t.get('unit_id') or '') or {}).get('name'),
                          'sewa': t.get('monthly_rent')} for t in tmap.values()][:50],
    }

    try:
        result = await llm_json(f'ask-{aid}', TANYA_SYSTEM, tanya_prompt(body.question, context),
                                MODEL_STRONG, timeout_s=90)
    except Exception:
        raise HTTPException(502, 'Sewain sedang sibuk membaca data. Coba lagi sebentar.')

    answer = str(result.get('answer') or '').strip() or 'Aku tidak yakin. Coba tanya dengan cara lain ya.'
    valid_actions = []
    allowed_types = {'remind_payments', 'open_leads', 'open_unit'}
    for a in (result.get('actions') or [])[:3]:
        if not isinstance(a, dict) or a.get('type') not in allowed_types:
            continue
        ids = [i for i in (a.get('ids') or []) if isinstance(i, str)]
        if not ids:
            continue
        valid_actions.append({'type': a['type'], 'label': str(a.get('label') or 'Lakukan')[:40], 'ids': ids[:10]})

    await tanya_messages.insert_one(TanyaMessage(account_id=aid, role='user', text=body.question).to_mongo())
    await tanya_messages.insert_one(TanyaMessage(account_id=aid, role='assistant', text=answer,
                                                 actions=valid_actions).to_mongo())
    return {'answer': answer, 'actions': valid_actions}


@router.get('/tanya/history')
async def tanya_history(user: dict = Depends(current_account)):
    aid = account_id(user)
    docs = await tanya_messages.find({'account_id': aid, 'deleted_at': None})\
        .sort('created_at', 1).to_list(200)
    return [{'id': str(m['_id']), 'role': m.get('role'), 'text': m.get('text'),
             'actions': m.get('actions', []),
             'created_at': m['created_at'].isoformat() if isinstance(m.get('created_at'), datetime) else str(m.get('created_at'))} for m in docs]


@router.get('/examples/units-csv')
async def example_units_csv():
    return {'csv': """name,property,city,unit_type,monthly_price,deposit,bedrooms,bathrooms,furnished,facilities,available_date,status,notes
A12,Tokyo Riverside Apartment,Jakarta Utara,Studio,3200000,1200000,1,1,ya,"AC,WiFi,Kasur,Kamar Mandi Dalam",,kosong,Ada balkon
B07,Tokyo Riverside Apartment,Jakarta Utara,Studio,2900000,1200000,1,1,ya,"AC,WiFi,Kasur",,terisi,Langsung pindah
C21,Tokyo Riverside Apartment,Jakarta Utara,1 Bedroom,4500000,1500000,1,1,ya,"AC,WiFi,Sofa,Dapur",2026-07-01,kosong,View kolam
M01,Kos Melati Putih,Jakarta Pusat,Kost 3x3,1500000,500000,1,1,ya,"AC,WiFi,Kasur",,terisi,Kamar belakang
M02,Kos Melati Putih,Jakarta Pusat,Kost 3x3,1500000,500000,1,1,ya,"AC,WiFi,Kasur",,kosong,Termasuk listrik"""}
