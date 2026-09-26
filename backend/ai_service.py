from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timedelta, timezone

from emergentintegrations.llm.chat import LlmChat, UserMessage

from models import WIB

import os

EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']
MODEL_STRONG = 'gpt-5.4'
MODEL_FAST = 'gpt-5.4-mini'


def _chat(session: str, system: str, model: str = MODEL_STRONG) -> LlmChat:
    return (
        LlmChat(api_key=EMERGENT_LLM_KEY, session_id=session, system_message=system)
        .with_model('openai', model)
    )


def _extract_json(text: str) -> dict:
    text = (text or '').strip()
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```$', '', text)
    start, end = text.find('{'), text.rfind('}')
    if start == -1 or end == -1:
        raise ValueError('AI tidak mengembalikan JSON')
    return json.loads(text[start:end + 1])


async def llm_json(session: str, system: str, prompt: str, model: str = MODEL_STRONG,
                   timeout_s: float = 120.0) -> dict:
    chat = _chat(session, system, model)
    last_resp = ''
    for attempt in range(2):
        msg = prompt if attempt == 0 else prompt + '\n\nPENTING: balas HANYA dengan JSON valid, tanpa teks apa pun sebelum atau sesudahnya.'
        last_resp = str(await asyncio.wait_for(chat.send_message(UserMessage(text=msg)), timeout=timeout_s))
        try:
            return _extract_json(last_resp)
        except Exception:
            continue
    raise ValueError('AI tidak mengembalikan JSON yang valid')


SYSTEM_ADMIN = (
    'Kamu adalah Sewain, admin AI andal untuk pemilik sewa properti di Indonesia '
    '(kos, apartemen, villa, kontrakan, coliving). Kamu mengerti gaya chat WhatsApp '
    'orang Indonesia, istilah properti lokal, dan format harga Rupiah. Kamu teliti, '
    'tidak pernah mengarang data yang tidak ada di percakapan, dan tidak ragu untuk '
    'mengatakan bahwa sesuatu tidak jelas.'
)

# ------------------------------ Chat analysis --------------------------------

MSG_PATTERNS = [
    re.compile(r'^\[?\d{1,2}[/-]\d{1,2}[/-]\d{2,4}[,.]?\s+\d{1,2}[.:]\d{2}\]?\s*(?:-\s*)?([^:]{1,40}?):\s', re.M),
    re.compile(r'^([A-Z][\w .,\']{1,30}?):\s', re.M),
]
ADMIN_WORDS = {'admin', 'owner', 'pemilik', 'saya admin', 'bot'}


def parse_chat_stats(text: str) -> tuple[int, int]:
    """Return (message_count, participant_count) heuristically from WA exports."""
    senders: set[str] = set()
    total = 0
    for pat in MSG_PATTERNS:
        for m in pat.finditer(text[:120000]):
            total += 1
            name = m.group(1).strip().lower()
            if name and not any(w in name for w in ADMIN_WORDS):
                senders.add(name)
        if total > 0:
            break
    return total, len(senders) or 1


def analyze_prompt(text: str, units: list[dict], today: datetime) -> str:
    unit_list = [
        {
            'id': u['id'], 'nama': u['name'], 'properti': u.get('property_name', ''),
            'tipe': u.get('unit_type', ''), 'harga_bulanan': u['monthly_price'],
            'kota': u.get('city'), 'area': u.get('area'),
            'status': u['status'], 'available_date': u.get('available_date'),
            'furnished': u.get('furnished'),
        }
        for u in units
    ]
    return f"""Tanggal hari ini: {today.strftime('%Y-%m-%d')} (Zona waktu Indonesia barat).

Di bawah ini ada ekspor percakapan WhatsApp antara pemilik/admin properti dan calon penyewa.

TUGAS:
1. Baca seluruh percakapan.
2. Untuk SETIAP calon penyewa (orang yang bertanya ingin menyewa), ekstrak datanya.
3. Klasifikasikan tingkat ketertarikan (high / medium / low) berdasarkan isi chat.
4. Tentukan apakah perlu di-follow-up: misalnya percakapan terhenti, janji kabari, belum ada jawaban admin, atau sudah lama tidak ada kabar.
5. Cocokkan dengan daftar unit yang tersedia (JSON di bawah). matched_unit_id HARUS salah satu "id" dari daftar unit, atau null kalau tidak ada yang cocok.

DAFTAR UNIT TERSEDIA:
{json.dumps(unit_list, ensure_ascii=False)}

FORMAT JAWABAN (JSON):
{{
  "leads": [
    {{
      "name": "nama dari chat",
      "phone": "nomor kalau disebut, else null",
      "budget_min": 3000000,
      "budget_max": 3500000,
      "preferred_location": "lokasi yang diminta atau null",
      "unit_type": "Studio / 1 Bedroom / 2 Bedroom / Kost dsb (ikuti kata calon) atau null",
      "move_in_date": "YYYY-MM-DD kalau jelas, atau teks seperti 'Oktober', else null",
      "occupants": null,
      "requirements": ["fully furnished", "dekat stasiun"],
      "interest": "high|medium|low",
      "interest_note": "1 kalimat alasan klasifikasi ini",
      "last_interaction_days_ago": 8,
      "needs_followup": true,
      "followup_when": "contoh: 'dalam 1-2 hari'",
      "followup_reason": "kenapa perlu follow-up sekarang",
      "quote": "kutipan PERSIS kalimat paling mewakili dari calon penyewa",
      "summary": "ringkasan 1-2 kalimat situasinya",
      "confidence": 0.9,
      "matched_unit_id": "id unit atau null",
      "match_reasons": ["Masuk budget", "Tipe Studio", "Tersedia sekarang"]
    }}
  ]
}}

ATURAN PENTING:
- Jangan mengarang nama, angka, atau kebutuhan yang tidak ada di chat. Kalau tidak jelas, isi null dan turunkan confidence.
- budget dalam angka Rupiah penuh (contoh "3 jutaan" = 3000000, "3,5 jt" = 3500000).
- last_interaction_days_ago = hitung dari tanggal chat TERAKHIR orang tersebut sampai hari ini.
- match_reasons: maksimal 3 alasan singkat bahasa Indonesia (contoh: "Masuk budget", "Tipe Studio", "Tersedia sekarang").
- Kalau ada orang yang tanya tapi tidak cocok dengan unit manapun, tetap masukkan dengan matched_unit_id null.
- Kalau ada orang yang tampak seperti hanya tanya-tanya tanpa niat, tetap masukkan dengan interest "low".

PERCAKAPAN:
---
{text[:60000]}
---"""


# ------------------------------ Unit matching --------------------------------

TYPE_ALIASES = {
    'studio': ['studio'],
    '1 bedroom': ['1 bedroom', '1br', 'one bedroom', '1 kamar', '1 kt', '1 kamar tidur'],
    '2 bedroom': ['2 bedroom', '2br', 'two bedroom', '2 kamar', '2 kt', '2 kamar tidur'],
    '3 bedroom': ['3 bedroom', '3br', '3 kamar', '3 kt'],
}


def _norm_type(s: str | None) -> str:
    s = (s or '').strip().lower()
    for key, aliases in TYPE_ALIASES.items():
        if s in aliases:
            return key
    return s


def match_score(lead: dict, unit: dict, property_name: str = '') -> tuple[int, list[str]]:
    score, reasons = 0, []
    price = int(unit.get('monthly_price') or 0)
    bmax = lead.get('budget_max') or lead.get('budget_min')
    if bmax:
        if price <= int(bmax):
            score += 40
            reasons.append('Masuk budget')
        elif price <= int(bmax) * 1.1:
            score += 20
            reasons.append('Sedikit di atas budget')
    lt, ut = _norm_type(lead.get('unit_type')), _norm_type(unit.get('unit_type'))
    if lt and ut:
        if lt == ut or lt in ut or ut in lt:
            score += 25
            reasons.append(f'Tipe {unit.get("unit_type")}')
    loc = ' '.join(filter(None, [lead.get('preferred_location', '')])).lower()
    hay = ' '.join(filter(None, [property_name.lower(), unit.get('city') or '', unit.get('area') or '']))
    if loc and loc in hay:
        score += 15
        reasons.append('Lokasi sesuai')
    if unit.get('status') == 'kosong':
        score += 12
        reasons.append('Available sekarang')
    if lead.get('requirements') and 'furnished' in ' '.join(lead['requirements']).lower():
        if unit.get('furnished'):
            score += 8
            reasons.append('Furnished')
    return score, reasons


def best_match(lead: dict, units: list[dict]) -> tuple[str | None, int, list[str]]:
    best_id, best_score, best_reasons = None, 0, []
    for u in units:
        s, r = match_score(lead, u, u.get('property_name', ''))
        if s > best_score:
            best_id, best_score, best_reasons = u['id'], s, r
    return best_id, best_score, best_reasons


# ------------------------------ Maintenance AI --------------------------------

def classify_prompt(desc: str, unit_names: list[str]) -> str:
    return f"""Seorang tenant/operator melaporkan masalah properti berikut:

"{desc[:2000]}"

Daftar unit milik pemilik: {json.dumps(unit_names, ensure_ascii=False)}

Klasifikasikan laporan ini. Jawab JSON:
{{
  "category": "AC | Air | Listrik | Kebersihan | Furniture | Internet | Struktur | Lainnya",
  "priority": "urgent | normal | rendah",
  "unit_name": "nama unit yang paling mungkin dari daftar, atau null kalau tidak disebut",
  "summary": "ringkasan 1 baris bahasa Indonesia yang tenang dan jelas"
}}

Aturan priority: "urgent" kalau ada kerusakan yang berjalan (bocor, listrik mati, tidak bisa ditinggal) atau merusak barang; "normal" untuk gangguan biasa; "rendah" untuk hal kosmetik/penampilan."""


# ------------------------------ Drafts ---------------------------------------

def payment_reminder_prompt(t: dict) -> str:
    late = t.get('days_late') or 0
    return f"""Buat pesan WhatsApp pengingat pembayaran sewa yang sopan, hangat, dan singkat (maksimal 3 kalimat), gaya admin properti Indonesia yang ramah.

Data:
- Nama tenant: {t['tenant_name']}
- Unit: {t['unit_name']}
- Periode: {t['period_label']}
- Jumlah: Rp{t['amount']:,} (format Rupiah tanpa titik di JSON, tulis dengan titik di pesan)
- Jatuh tempo: {t['due_label']}
- {'TERLAMBAT ' + str(late) + ' hari' if late > 0 else 'belum jatuh tempo'}

Boleh satu emoji kecil kalau natural. Sebutkan unit dan nominal di pesan. Akhiri dengan ajakan mengirim bukti transfer kalau sudah bayar.
Jawab JSON: {{"draft": "..."}}"""


def followup_prompt(lead: dict, unit: dict | None) -> str:
    u = ''
    if unit:
        u = f"Unit yang cocok: {unit['name']} ({unit.get('unit_type', '')}, Rp{unit['monthly_price']:,}/bulan)."
    return f"""Buat pesan WhatsApp follow-up singkat (2-4 kalimat) dari admin properti ke calon penyewa, gaya Indonesia yang ramah dan tidak mendesak.

Data calon penyewa:
- Nama: {lead.get('name')}
- Budget: {lead.get('budget_min') or '-'} s/d {lead.get('budget_max') or '-'}
- Tipe dicari: {lead.get('unit_type') or '-'}
- Move-in: {lead.get('move_in_date') or '-'}
- Catatan AI: {lead.get('ai_note') or lead.get('interest_note') or '-'}
{k}

Kalau ada unit cocok: sebutkan unitnya, harganya, dan tawarkan bantu jadwalkan viewing.
Kalau tidak ada unit cocok: sampaikan dengan jujur dan tanyakan kebutuhannya lagi.
Boleh satu emoji kecil kalau natural.
Jawab JSON: {{"draft": "..."}}"""


# ------------------------------ Tanya Sewain ----------------------------------

TANYA_SYSTEM = (
    'Kamu adalah Sewain, asisten AI pemilik sewa properti. Kamu menjawab pertanyaan '
    'pemilik berdasarkan HANYA data JSON yang diberikan. Bahasa Indonesia santai tapi '
    'kompeten, seperti admin pribadi yang hafal seluruh bisnisnya. Jawab ringkas dan '
    'to the point, pakai poin bernomor kalau membantu. Sebutkan angka dengan tepat dari '
    'data. Kalau datanya tidak ada di JSON, katakan jujur bahwa datanya tidak ada. '
    'Jangan mengarang nama atau angka.'
)


def tanya_prompt(question: str, context: dict) -> str:
    return f"""Data bisnis properti pemilik saat ini ({context.get('today', '')}):

{json.dumps(context, ensure_ascii=False, default=str)}

Pertanyaan pemilik: "{question}"

Jawab berdasarkan data di atas. Kalau relevan, tambahkan "actions": daftar tindakan yang bisa Sewain bantu, dengan format:
- {{"type": "remind_payments", "label": "Ingatkan", "ids": ["payment_id", ...]}}
- {{"type": "open_leads", "label": "Lihat calon penyewa", "ids": ["lead_id", ...]}}
- {{"type": "open_unit", "label": "Lihat unit", "ids": ["unit_id"]}}
Hanya pakai id yang ada di data. Kalau tidak ada tindakan yang relevan, actions kosong [].

Jawab JSON: {{"answer": "...", "actions": [...]}}"""


# ------------------------------ Daily summary ---------------------------------

def daily_summary_prompt(name: str, items: list[dict], unit_stat: dict) -> str:
    return f"""Selamat siang/sore, {name}. Ini data hari ini:
{json.dumps({'unit': unit_stat, 'antrean_hari_ini': items}, ensure_ascii=False, default=str)}

Tulis 1-2 kalimat ringkasan hangat, spesifik, dan menenangkan untuk membuka hari pemilik.
Sebutkan 1-2 hal paling penting dengan angkanya. Tanpa sapaan, langsung ke intinya.
Jawab JSON: {{"summary": "..."}}"""
