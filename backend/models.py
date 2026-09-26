from __future__ import annotations

from contextvars import ContextVar
from datetime import datetime, timezone, timedelta
from typing import Any, List, Optional

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field, BeforeValidator
from typing_extensions import Annotated

WIB = timezone(timedelta(hours=7))

# Indonesia has three zones and no daylight saving, so fixed offsets are exact.
TIMEZONES = {
    'Asia/Jakarta': ('WIB', timezone(timedelta(hours=7))),
    'Asia/Makassar': ('WITA', timezone(timedelta(hours=8))),
    'Asia/Jayapura': ('WIT', timezone(timedelta(hours=9))),
}
DEFAULT_TIMEZONE = 'Asia/Jakarta'

# The signed-in account's zone for the current request (set by auth_utils.current_account),
# so "today", due dates and viewing times follow the agent's own clock.
_request_tz: ContextVar[timezone] = ContextVar('request_tz', default=WIB)


def set_request_timezone(name: str | None) -> None:
    _request_tz.set(TIMEZONES.get(name or DEFAULT_TIMEZONE, TIMEZONES[DEFAULT_TIMEZONE])[1])


def local_tz() -> timezone:
    return _request_tz.get()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def today_wib() -> datetime:
    """Now in the account's local zone (named for the original WIB-only version)."""
    return datetime.now(local_tz())


def _oid(v: Any) -> Any:
    if isinstance(v, ObjectId):
        return str(v)
    return v


PyObjectId = Annotated[str, BeforeValidator(_oid)]


class BaseDocument(BaseModel):
    id: PyObjectId = Field(default_factory=lambda: str(ObjectId()), alias='_id')
    account_id: PyObjectId
    created_at: datetime = Field(default_factory=now_utc)
    origin: str = 'user'  # "user" = real activity, "seed" = contoh data bawaan
    deleted_at: Optional[datetime] = None

    model_config = ConfigDict(populate_by_name=True, extra='ignore', arbitrary_types_allowed=True)

    def to_mongo(self) -> dict:
        d = self.model_dump(by_alias=True, exclude_none=True)
        if isinstance(d.get('_id'), str) and ObjectId.is_valid(d['_id']):
            d['_id'] = ObjectId(d['_id'])
        return d

    def to_update(self) -> dict:
        d = self.model_dump(by_alias=True, exclude={'id'}, exclude_unset=True, exclude_none=True)
        d.pop('_id', None)
        return {'$set': d}

    @classmethod
    def from_mongo(cls, doc: dict):
        doc = dict(doc)
        if '_id' in doc:
            doc['id'] = str(doc.pop('_id'))
        return cls(**doc)


# ------------------------------- Accounts ------------------------------------

class User(BaseModel):
    id: PyObjectId = Field(default_factory=lambda: str(ObjectId()), alias='_id')
    name: str
    email: str
    password_hash: str
    is_demo: bool = False
    # 'free' | 'premium'. Only changed manually by the owner (set_plan.py / admin endpoint),
    # never from a user-facing endpoint. Missing = free (older accounts).
    plan: str = 'free'
    premium_until: Optional[str] = None  # YYYY-MM-DD inclusive; None = no expiry
    trial: bool = False  # premium came from the automatic 14-day trial, not a payment
    timezone: str = 'Asia/Jakarta'  # Asia/Jakarta (WIB) | Asia/Makassar (WITA) | Asia/Jayapura (WIT)
    language: str = 'id'  # id | en
    # Profile (shown on invoices and testimonials)
    phone: Optional[str] = None
    agency: Optional[str] = None
    domicile: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    bank_holder: Optional[str] = None
    office_bank_name: Optional[str] = None  # agency account, the other choice on invoices
    office_bank_account: Optional[str] = None
    office_bank_holder: Optional[str] = None
    photo: Optional[str] = None  # file path, see storage.py
    onboarding_tour_seen: bool = False
    onboarding_dismissed: bool = False
    created_at: datetime = Field(default_factory=now_utc)
    model_config = ConfigDict(populate_by_name=True, extra='ignore')

    def to_mongo(self) -> dict:
        d = self.model_dump(by_alias=True, exclude_none=True)
        if isinstance(d.get('_id'), str) and ObjectId.is_valid(d['_id']):
            d['_id'] = ObjectId(d['_id'])
        return d

    @classmethod
    def from_mongo(cls, doc: dict):
        doc = dict(doc)
        if '_id' in doc:
            doc['id'] = str(doc.pop('_id'))
        return cls(**doc)


# ------------------------------- Portfolio -----------------------------------

class Property(BaseDocument):
    name: str
    type: str = 'apartment'  # apartment | kos | villa | kontrakan | coliving | lainnya
    city: Optional[str] = None
    area: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


class Unit(BaseDocument):
    property_id: str
    name: str
    category: Optional[str] = None  # apartemen | rumah
    unit_type: str = 'Studio'
    address: Optional[str] = None  # where the unit is (shown in viewing invites and shares)
    residence: Optional[str] = None  # cluster or apartment name, e.g. 'Tokyo Riverside PIK 2'
    size_m2: Optional[int] = None
    furnishing: Optional[str] = None  # furnished | semi | unfurnished
    view: Optional[str] = None  # e.g. 'City view', 'Pool'
    city: Optional[str] = None
    monthly_price: int = 0
    deposit: int = 0
    bedrooms: int = 0
    bathrooms: int = 0
    furnished: bool = True
    facilities: List[str] = Field(default_factory=list)
    available_date: Optional[str] = None  # YYYY-MM-DD
    status: str = 'kosong'  # kosong | terisi | reserved | maintenance
    photos: List[str] = Field(default_factory=list)
    notes: Optional[str] = None
    owner_name: Optional[str] = None   # pemilik unit (agents manage units owned by others)
    owner_phone: Optional[str] = None
    daily_price: Optional[int] = None  # per night, for units also rented daily
    yearly_price: Optional[int] = None  # per year
    vacant_since: Optional[datetime] = None
    occupied_since: Optional[datetime] = None


# ------------------------------- Leads ----------------------------------------

class Lead(BaseDocument):
    name: str
    phone: Optional[str] = None
    budget_min: Optional[int] = None
    budget_max: Optional[int] = None
    preferred_location: Optional[str] = None
    unit_type: Optional[str] = None
    move_in_date: Optional[str] = None
    occupants: Optional[int] = None
    requirements: List[str] = Field(default_factory=list)
    interest: str = 'medium'  # high | medium | low
    interest_note: Optional[str] = None
    summary: Optional[str] = None
    quote: Optional[str] = None
    last_interaction_at: Optional[datetime] = None
    needs_followup: bool = False
    followup_when: Optional[str] = None
    followup_reason: Optional[str] = None
    suggested_followup: Optional[str] = None
    confidence: Optional[float] = None
    status: str = 'baru'  # baru | sedang_ngobrol | perlu_followup | viewing | negotiation | deal | tidak_jadi
    ai_note: Optional[str] = None
    matched_unit_id: Optional[str] = None
    match_score: Optional[int] = None
    match_reasons: List[str] = Field(default_factory=list)
    conversation_id: Optional[str] = None
    source: str = 'manual'  # manual | chat_import (older AI-imported leads)
    last_contact_at: Optional[datetime] = None
    notes: Optional[str] = None
    next_followup_date: Optional[str] = None  # YYYY-MM-DD — shows up on Hari Ini from this day
    last_message: Optional[str] = None  # last follow-up text the agent sent
    # Terms agreed during negotiation; pre-fill the deal -> tenant form.
    # {unit_id, agreed_price, deposit, contract_months, note, updated_at}
    negotiation: Optional[dict] = None
    first_contact_at: Optional[datetime] = None  # for the response-time metric
    lost_reason: Optional[str] = None
    closed_at: Optional[datetime] = None  # when it became deal / tidak_jadi
    # What the prospect is looking for (all optional).
    pref_category: Optional[str] = None  # apartemen | rumah | keduanya
    pref_types: List[str] = Field(default_factory=list)  # 'apartemen:Studio', 'rumah:2 Bedroom', …
    pref_terms: List[str] = Field(default_factory=list)  # harian | bulanan | tahunan
    photo: Optional[str] = None  # uploaded file path


class Viewing(BaseDocument):
    lead_id: str
    unit_id: str  # the first of unit_ids (older viewings only have this)
    unit_ids: List[str] = Field(default_factory=list)
    scheduled_at: datetime
    note: Optional[str] = None
    status: str = 'menunggu'  # menunggu | terjadwal | selesai | batal
    calendar_added: bool = False  # agent added it to Google Calendar


class Tenant(BaseDocument):
    lead_id: Optional[str] = None
    unit_id: str
    name: str
    photo: Optional[str] = None  # uploaded file path
    phone: Optional[str] = None
    start_date: str  # YYYY-MM-DD
    end_date: Optional[str] = None
    monthly_rent: int = 0
    deposit: int = 0
    payment_due_day: int = 10
    # Bills every N months (1, 3, 6 or 12): many rentals are paid 6 or 12 months upfront.
    payment_interval_months: int = 1
    commission: Optional[int] = None  # agent's commission on this deal (Rupiah)
    extensions: int = 0  # how many times the contract was renewed
    status: str = 'aktif'  # aktif | checkout


class Payment(BaseDocument):
    tenant_id: str
    unit_id: str
    period: str  # YYYY-MM
    amount: int = 0
    months: int = 1  # how many months this bill covers
    due_date: str  # YYYY-MM-DD
    status: str = 'belum_bayar'  # belum_bayar | lunas
    paid_at: Optional[datetime] = None
    reminder_count: int = 0
    last_reminded_at: Optional[datetime] = None


class Maintenance(BaseDocument):
    unit_id: Optional[str] = None
    tenant_id: Optional[str] = None
    description: str
    category: str = 'Lainnya'
    priority: str = 'normal'  # urgent | normal | rendah
    ai_summary: Optional[str] = None
    status: str = 'baru'  # baru | sedang | selesai | batal
    reported_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    scheduled_at: Optional[datetime] = None  # when the agent plans to handle it
    calendar_added: bool = False


class Booking(BaseDocument):
    """A daily/nightly stay in a unit (villa, kos harian)."""
    unit_id: str
    guest_name: str
    phone: Optional[str] = None
    check_in: str  # YYYY-MM-DD
    check_out: str  # YYYY-MM-DD (the morning they leave)
    nights: int = 1
    price_per_night: int = 0
    total: int = 0
    note: Optional[str] = None


class Activity(BaseDocument):
    action: str
    entity: str
    entity_id: Optional[str] = None
    title: str
    detail: Optional[str] = None
