from __future__ import annotations

from datetime import datetime, timedelta, time as dtime

from bson import ObjectId

from database import properties, units, leads, tenants, payments, maintenance, viewings, activities
from helpers import add_months, contract_end, generate_payments, log_activity_async
from models import (
    Property, Unit, Lead, Tenant, Maintenance, Viewing, now_utc, today_wib, WIB,
)

def _p(id_: str) -> str:
    return f'https://images.unsplash.com/photo-{id_}?auto=format&fit=crop&w=900&q=70'

# 12 distinct, catalog-quality compact-apartment interiors (varied palettes).
UNIT_PHOTOS = [
    _p('1522708323590-d24dbb6b0267'),  # A12 warm beige + light wood bedroom
    _p('1505693416388-ac5ce068fe85'),  # B07 white + soft gray bed
    _p('1560448204-e02f11c3d0e2'),     # C21 dark walnut + cream living
    _p('1616486338812-3dadae4b4ace'),  # D11 sage/green minimalist
    _p('1522771739844-6a9f6d5f14af'),  # A05 navy accents studio
    _p('1502672260266-1c1ef2d93688'),  # B12 cream minimalist bright
    _p('1586023492125-27b2c045efd7'),  # C03 terracotta / warm sofa
    _p('1560185007-cde436f6a4d0'),     # D08 monochrome apartment
    _p('1493809842364-78817add7ffb'),  # M01 warm brown hotel style
    _p('1598928506311-c55ded91a20c'),  # M02 soft pastel neutral living
    _p('1567767292278-a4f21aa2d36e'),  # M03 warm bedroom
    _p('1554995207-c18c203602cb'),     # M04 clean modern living
]

IN_N = 7  # timezone offset hours (WIB)


def _dt(days_ago: int = 0, hour: int = 0, minute: int = 0) -> datetime:
    base = today_wib() - timedelta(days=days_ago)
    return base.replace(hour=hour, minute=minute, second=0, microsecond=0)


def _next_saturday_14() -> datetime:
    t = today_wib()
    ahead = (5 - t.weekday()) % 7
    if ahead == 0:
        ahead = 7
    d = (t + timedelta(days=ahead))
    return datetime.combine(d.date(), dtime(14, 0), tzinfo=WIB)


async def seed_demo_account(account_id: str) -> None:
    # ---------------- Properties ----------------
    tokyo = Property(account_id=account_id, name='Tokyo Riverside Apartment', type='apartment',
                     city='Jakarta Utara', area='PIK 2',
                     notes='Apartemen utama. Akses dekat halte LRT.', origin='seed')
    melati = Property(account_id=account_id, name='Kos Melati Putih', type='kos',
                      city='Jakarta Pusat', area='Cempaka Putih',
                      notes='Kos putri, campur kamar mandi dalam & luar.', origin='seed')
    await properties.insert_one(tokyo.to_mongo())
    await properties.insert_one(melati.to_mongo())

    # ---------------- Units (12) ----------------
    OWNERS = {'A': ('Pak Hendra', '+62 812-1111-2222'), 'B': ('Bu Lina', '+62 813-3333-4444'),
              'C': ('Pak Hendra', '+62 812-1111-2222'), 'D': ('Pak Anton', '+62 811-7777-8888'),
              'M': ('Bu Sari', '+62 857-5555-6666')}

    def U(pid, name, utype, price, dep, bed, bath, status, facilities, vacant_days=None, photos=None,
          available_date=None, notes=None):
        owner_name, owner_phone = OWNERS[name[0]]
        u = Unit(account_id=account_id, property_id=pid, name=name, unit_type=utype, city='Jakarta Utara' if pid == tokyo.id else 'Jakarta Pusat',
                 monthly_price=price, deposit=dep, bedrooms=bed, bathrooms=bath, furnished=True,
                 facilities=facilities, status=status, photos=photos or [], available_date=available_date,
                 notes=notes, vacant_since=_dt(vacant_days, 9) if vacant_days is not None else None,
                 owner_name=owner_name, owner_phone=owner_phone, origin='seed')
        return u

    unit_docs = [
        U(tokyo.id, 'A12', 'Studio', 3_200_000, 1_200_000, 1, 1, 'kosong',
          ['AC', 'WiFi', 'Kasur', 'Kamar Mandi Dalam', 'Balkon'], vacant_days=20, photos=[UNIT_PHOTOS[0]],
          notes='Ada balkon kecil, view kolam.'),
        U(tokyo.id, 'B07', 'Studio', 2_900_000, 1_200_000, 1, 1, 'terisi', ['AC', 'WiFi', 'Kasur', 'Kamar Mandi Dalam'], photos=[UNIT_PHOTOS[1]]),
        U(tokyo.id, 'C21', '1 Bedroom', 4_500_000, 1_500_000, 1, 1, 'kosong',
          ['AC', 'WiFi', 'Sofa', 'Kamar Mandi Dalam', 'Dapur'], vacant_days=35, photos=[UNIT_PHOTOS[2]]),
        U(tokyo.id, 'D11', '2 Bedroom', 6_800_000, 2_000_000, 2, 1, 'kosong',
          ['AC', 'WiFi', 'Sofa', 'Dapur', '2 Kasur'], vacant_days=12, photos=[UNIT_PHOTOS[3]]),
        U(tokyo.id, 'A05', 'Studio', 3_000_000, 1_200_000, 1, 1, 'terisi', ['AC', 'WiFi', 'Kasur', 'Shower'], photos=[UNIT_PHOTOS[4]]),
        U(tokyo.id, 'B12', 'Studio', 2_900_000, 1_200_000, 1, 1, 'terisi', ['AC', 'WiFi', 'Kasur'], photos=[UNIT_PHOTOS[5]]),
        U(tokyo.id, 'C03', '1 Bedroom', 4_600_000, 1_500_000, 1, 1, 'kosong',
          ['AC', 'WiFi', 'Sofa', 'Dapur'], vacant_days=50, photos=[UNIT_PHOTOS[6]]),
        U(tokyo.id, 'D08', '2 Bedroom', 6_500_000, 2_000_000, 2, 1, 'reserved',
          ['AC', 'WiFi', 'Sofa', 'Dapur'], available_date=None, photos=[UNIT_PHOTOS[7]], notes='Ditahan calon tenant lama.'),
        U(melati.id, 'M01', 'Kost 3x3', 1_500_000, 500_000, 1, 1, 'terisi', ['AC', 'WiFi', 'Kasur'], photos=[UNIT_PHOTOS[8]]),
        U(melati.id, 'M02', 'Kost 3x3', 1_500_000, 500_000, 1, 1, 'kosong', ['AC', 'WiFi', 'Kasur'], vacant_days=6, photos=[UNIT_PHOTOS[9]]),
        U(melati.id, 'M03', 'Kost 4x5', 1_800_000, 500_000, 1, 1, 'maintenance', ['AC', 'WiFi', 'Kasur', 'Kamar Mandi Dalam'],
          photos=[UNIT_PHOTOS[10]], notes='Perbaikan AC berjalan.'),
        U(melati.id, 'M04', 'Kost 4x5', 1_800_000, 500_000, 1, 1, 'kosong', ['AC', 'WiFi', 'Kasur', 'Kamar Mandi Dalam'], vacant_days=18, photos=[UNIT_PHOTOS[11]]),
    ]
    umap: dict[str, str] = {}
    for u in unit_docs:
        await units.insert_one(u.to_mongo())
        umap[u.name] = u.id

    # ---------------- Tenants + payments ----------------
    today = today_wib().date()
    cur_period = f'{today.year:04d}-{today.month:02d}'

    def T(name, phone, uname, rent, start, end, dep):
        return Tenant(account_id=account_id, unit_id=umap[uname], name=name, phone=phone,
                      start_date=start, end_date=end, monthly_rent=rent, deposit=dep,
                      payment_due_day=10, origin='seed', commission=rent // 2,
                      created_at=datetime.fromisoformat(start).replace(tzinfo=WIB))

    month1 = today.replace(day=1)

    def started(months_ago: int) -> str:
        return add_months(month1, -months_ago).isoformat()

    # Kevin's 12-month lease ends this month -> shows up as "kontrak habis" on Hari Ini.
    tenant_plan = [
        ('Kevin', '+62 812-7700-2314', 'B07', 2_900_000, started(11), contract_end(started(11), 12), 1_200_000, 'late4'),
        ('Sinta', '+62 813-2200-8845', 'B12', 2_900_000, started(7), contract_end(started(7), 12), 1_200_000, 'paid'),
        ('Dewi', '+62 856-4400-1290', 'M01', 1_500_000, started(5), contract_end(started(5), 12), 500_000, 'today'),
        ('Rina', '+62 878-3300-5521', 'A05', 3_000_000, started(4), contract_end(started(4), 12), 1_200_000, 'soon'),
    ]
    for name, phone, uname, rent, start, end, dep, mode in tenant_plan:
        t = T(name, phone, uname, rent, start, end, dep)
        await tenants.insert_one(t.to_mongo())
        docs = generate_payments(account_id, t.id, umap[uname], rent, start, end, 10, origin='seed')
        for d in docs:
            if d['period'] < cur_period:
                d['status'] = 'lunas'
                d['paid_at'] = datetime.fromisoformat(d['due_date']).replace(tzinfo=WIB) - timedelta(days=1)
            elif d['period'] == cur_period:
                if mode == 'late4':
                    d['due_date'] = (today - timedelta(days=4)).isoformat()
                elif mode == 'paid':
                    d['status'] = 'lunas'
                    d['paid_at'] = _dt(5, 10)
                elif mode == 'today':
                    d['due_date'] = today.isoformat()
                elif mode == 'soon':
                    d['due_date'] = (today + timedelta(days=2)).isoformat()
        if docs:
            await payments.insert_many(docs)

    # ---------------- Leads ----------------
    def L(**kw):
        # Every seeded prospect got a first reply within the hour (feeds the Laporan speed metric).
        first = kw.get('last_interaction_at') or now_utc()
        kw.setdefault('created_at', first - timedelta(days=3, minutes=40))
        kw.setdefault('first_contact_at', kw['created_at'] + timedelta(minutes=25))
        return Lead(account_id=account_id, origin='seed', source='manual', **kw)

    jessica = L(
        name='Jessica', phone='+62 811-9000-3342', budget_min=3_000_000, budget_max=3_500_000,
        preferred_location='PIK 2', unit_type='Studio', move_in_date='Juli', occupants=2,
        requirements=['Fully furnished', 'Ada balkon'], interest='high',
        interest_note='Budget jelas, tanya detail unit, cuma menunggu restu suami.',
        quote='Aku diskusi sama suami dulu ya kak.',
        last_interaction_at=_dt(8, 15), needs_followup=True,
        followup_when='Hari ini juga', followup_reason='High buying intent. Belum ada follow-up setelah 8 hari.',
        suggested_followup='Hai Jessica 👋 Mau follow-up sedikit ya. Unit A12 yang kemarin kamu lihat masih available. '
                           'Kalau masih interested, aku bisa bantu jadwalkan viewing.',
        confidence=0.95, status='perlu_followup', ai_note='Tertarik, tapi ingin diskusi dengan suami.',
        matched_unit_id=umap['A12'], match_score=92, match_reasons=['Masuk budget', 'Tipe Studio', 'Tersedia sekarang'],
    )
    rizky = L(
        name='Rizky', phone='+62 812-3456-7788', budget_min=6_000_000, budget_max=7_000_000,
        preferred_location='PIK 2', unit_type='2 Bedroom', move_in_date='Bulan depan', occupants=3,
        requirements=['Ada dapur', 'Untuk keluarga'], interest='high',
        quote='Kalau 2 kamar sekitar 6-7 juta ada ga kak?', last_interaction_at=_dt(4, 11),
        needs_followup=False, status='negotiation',
        notes='Sudah lihat D08, cocok. Minta diskon sedikit karena kontrak setahun.',
        matched_unit_id=umap['D08'], match_score=85, match_reasons=['Masuk budget', 'Tipe 2 Bedroom'],
        negotiation={'unit_id': umap['D08'], 'agreed_price': 6_300_000, 'deposit': 2_000_000,
                     'contract_months': 12, 'note': 'Owner OK turun Rp200rb kalau kontrak 12 bulan.',
                     'updated_at': _dt(4, 11)},
    )
    maya = L(
        name='Maya', phone='+62 857-1111-2048', budget_min=1_200_000, budget_max=2_500_000,
        preferred_location='Cempaka Putih', unit_type='Kost', move_in_date='Bulan ini', occupants=1,
        requirements=['Kamar mandi dalam'], interest='medium',
        quote='Kak kos di Cempaka Putih yang ada AC berapa ya?', last_interaction_at=_dt(5, 20),
        needs_followup=True, followup_when='Besok', followup_reason='Percakapan terhenti saat tanya-tanya harga.',
        suggested_followup='Hai Maya 👋 Kemarin tadi aku sempat cerita soal kos di Melati Putih. '
                           'Kamar M02 kosong nih, ada AC dan kamar mandi dalam, Rp1.500.000/bulan. '
                           'Mau aku bantu jadwalkan lihat kamar?',
        confidence=0.9, status='perlu_followup', ai_note='Butuh kamar mandi dalam, sensitif harga.',
        matched_unit_id=umap['M02'], match_score=90, match_reasons=['Masuk budget', 'Lokasi sesuai', 'Tersedia sekarang'],
    )
    budi = L(
        name='Budi', phone='+62 813-5555-9012', budget_min=1_500_000, budget_max=2_000_000,
        preferred_location='Cempaka Putih', unit_type='Kost', move_in_date='Juli', occupants=1,
        requirements=['Kost putra'], interest='high',
        quote='Masih kosong nggak kak untuk bulan depan?', last_interaction_at=_dt(1, 9),
        needs_followup=False, confidence=0.8, status='viewing', notes='Lihat kamar M04 kemarin sore.',
        matched_unit_id=umap['M04'], match_score=86, match_reasons=['Masuk budget', 'Tersedia sekarang'],
    )
    liliana = L(
        name='Liliana', phone='+62 815-2222-6677', budget_min=6_000_000, budget_max=7_500_000,
        preferred_location='PIK 2', unit_type='2 Bedroom', move_in_date='September', occupants=4,
        requirements=['Furnished', '2 kamar'], interest='high',
        quote='Oke kak, boleh dijadwalkan view-nya akhir pekan ini?', last_interaction_at=_dt(1, 16),
        needs_followup=False, confidence=0.9, status='viewing', ai_note='Serius, minta viewing akhir pekan.',
        matched_unit_id=umap['D11'], match_score=91, match_reasons=['Masuk budget', 'Tipe 2 Bedroom', 'Furnished'],
    )
    # Just came in and nobody has replied yet -> top of Hari Ini.
    nadia = Lead(account_id=account_id, origin='seed', source='manual', name='Nadia', phone='+62 821-4400-7781',
                 budget_max=3_200_000, unit_type='Studio', preferred_location='PIK 2', move_in_date='Bulan depan',
                 notes='Tanya studio furnished dekat LRT.', created_at=now_utc() - timedelta(minutes=20),
                 last_interaction_at=now_utc() - timedelta(minutes=20), status='baru')
    # Closed in the last weeks: one lost (with a reason), one signed.
    andre = L(name='Andre', phone='+62 812-0000-1111', budget_max=2_000_000, unit_type='Studio',
              last_interaction_at=_dt(9, 10), status='tidak_jadi', lost_reason='Harga terlalu mahal',
              closed_at=_dt(9, 10))
    fina = L(name='Fina', phone='+62 812-0000-2222', budget_max=3_000_000, unit_type='Studio',
             last_interaction_at=_dt(12, 10), status='deal', closed_at=_dt(12, 10))
    for l in (jessica, rizky, maya, budi, liliana, nadia, andre, fina):
        await leads.insert_one(l.to_mongo())

    viewing = Viewing(account_id=account_id, lead_id=liliana.id, unit_id=umap['D11'],
                      scheduled_at=_next_saturday_14(), status='menunggu', origin='seed')
    await viewings.insert_one(viewing.to_mongo())
    v_done = Viewing(account_id=account_id, lead_id=rizky.id, unit_id=umap['D08'],
                     scheduled_at=_dt(6, 14), status='selesai', origin='seed')
    await viewings.insert_one(v_done.to_mongo())
    v_result = Viewing(account_id=account_id, lead_id=budi.id, unit_id=umap['M04'],
                       scheduled_at=_dt(1, 16), status='terjadwal', origin='seed')
    await viewings.insert_one(v_result.to_mongo())

    # ---------------- Maintenance ----------------
    m1 = Maintenance(account_id=account_id, unit_id=umap['M03'], description='AC kamar M03 bocor dari tadi malam dan airnya kena kasur.',
                     category='AC', priority='urgent', status='baru',
                     ai_summary='AC bocor dan berpotensi merusak kasur. Perlu teknisi hari ini.', origin='seed')
    await maintenance.insert_one(m1.to_mongo())
    m2 = Maintenance(account_id=account_id, unit_id=None, description='Lampu area parkir kos mati.',
                     category='Listrik', priority='normal', status='selesai',
                     ai_summary='Lampu parkir perlu penggantian bohlam.', resolved_at=_dt(3, 16), origin='seed')
    await maintenance.insert_one(m2.to_mongo())

    # ---------------- Seed activities ----------------
    for act in [
        ('property_added', 'property', 'Menambahkan properti Tokyo Riverside Apartment'),
        ('property_added', 'property', 'Menambahkan properti Kos Melati Putih'),
        ('units_imported', 'unit', 'Impor 12 unit properti'),
        ('tenant_extended', 'tenant', 'Kontrak Sinta diperpanjang 12 bulan'),
        ('tenant_extended', 'tenant', 'Kontrak Dewi diperpanjang 6 bulan'),
        ('tenant_checkout', 'tenant', 'Yoga checkout — unit kembali kosong'),
    ]:
        await log_activity_async(account_id, act[0], act[1], act[2], origin='seed')
