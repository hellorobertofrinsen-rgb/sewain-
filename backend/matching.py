"""Deterministic lead <-> unit matching and issue categorisation (no AI, no cost)."""
from __future__ import annotations

import re

# What a unit is, and what a prospect can ask for (the same vocabulary on both sides).
UNIT_CATEGORIES = ('apartemen', 'rumah')
TYPES_BY_CATEGORY = {
    'apartemen': ['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom'],
    'rumah': ['1 Bedroom', '2 Bedroom', '3 Bedroom', '4 Bedroom'],
}
UNIT_SIZES = ('Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom')  # what a unit can be (the add-unit form)
FURNISHING = ('furnished', 'semi', 'unfurnished')
RENT_TERMS = ('harian', 'bulanan', 'tahunan')
TERM_PRICE = {'harian': 'daily_price', 'bulanan': 'monthly_price', 'tahunan': 'yearly_price'}
TERM_LABEL = {'harian': 'Ada harga harian', 'bulanan': 'Ada harga bulanan', 'tahunan': 'Ada harga tahunan'}


def pref_sizes(lead: dict) -> set[str]:
    """'apartemen:Studio', 'rumah:2 Bedroom' -> {'Studio', '2 Bedroom'}."""
    return {x.split(':', 1)[-1] for x in lead.get('pref_types') or []}


def clean_prefs(category: str | None, types: list[str] | None, terms: list[str] | None) -> dict:
    """Keep only valid preference values; unit sizes must belong to the chosen category."""
    cat = category if category in ('apartemen', 'rumah', 'keduanya') else None
    allowed = {f'{c}:{t}' for c in UNIT_CATEGORIES if cat in (c, 'keduanya') for t in TYPES_BY_CATEGORY[c]}
    kept = []
    for x in types or []:
        if x in allowed and x not in kept:
            kept.append(x)
    return {'pref_category': cat, 'pref_types': kept,
            'pref_terms': [t for t in RENT_TERMS if t in (terms or [])]}


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


def match_score(lead: dict, unit: dict, property_name: str = '', property_area: str = '') -> tuple[int, list[str]]:
    score, reasons = 0, []
    # Preferences picked in the prospect form.
    # A unit matches a prospect looking for the same type (Studio, 1 Bedroom, …).
    ucat = unit.get('category')
    if lead.get('pref_types'):
        if unit.get('unit_type') in pref_sizes(lead):
            score += 40
            reasons.append(f'Tipe {unit.get("unit_type")}')
    elif lead.get('pref_category') and ucat and lead['pref_category'] in (ucat, 'keduanya'):
        score += 25
        reasons.append(ucat.capitalize())
    for term in lead.get('pref_terms') or []:
        if unit.get(TERM_PRICE[term]):
            score += 15
            reasons.append(TERM_LABEL[term])
            break
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
    loc = (lead.get('preferred_location') or '').strip().lower()
    hay = ' '.join(filter(None, [property_name, property_area, unit.get('city') or '', unit.get('area') or ''])).lower()
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


def rank_units(lead: dict, units: list[dict], limit: int = 3) -> list[tuple[int, list[str], dict]]:
    """Best units for a lead. `units` are unit_out() dicts (with property_name/property_area)."""
    scored = []
    for u in units:
        s, r = match_score(lead, u, u.get('property_name', ''), u.get('property_area', ''))
        if s > 0:
            scored.append((s, r, u))
    scored.sort(key=lambda x: -x[0])
    return scored[:limit]


# A lead is auto-linked to its best unit only when the match is convincing.
AUTO_MATCH_MIN_SCORE = 50

ISSUE_KEYWORDS = [
    ('AC', ['ac', 'aircon', 'pendingin']),
    ('Air', ['bocor', 'air', 'keran', 'pipa', 'toilet', 'wc', 'mampet', 'saluran', 'banjir']),
    ('Listrik', ['listrik', 'lampu', 'mcb', 'sekring', 'stop kontak', 'colokan', 'token']),
    ('Internet', ['wifi', 'wi-fi', 'internet']),
    ('Kebersihan', ['kotor', 'sampah', 'bau', 'kecoa', 'tikus', 'semut']),
    ('Furniture', ['kasur', 'lemari', 'meja', 'kursi', 'sofa', 'pintu', 'kunci', 'jendela']),
]
_ISSUE_PATTERNS = [(cat, re.compile(r'\b(' + '|'.join(re.escape(w) for w in words) + r')\b'))
                   for cat, words in ISSUE_KEYWORDS]


def guess_issue_category(description: str) -> str:
    text = description.lower()
    for category, pattern in _ISSUE_PATTERNS:
        if pattern.search(text):
            return category
    return 'Lainnya'
