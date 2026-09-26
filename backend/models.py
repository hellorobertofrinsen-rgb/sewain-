from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Any, List, Optional

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field, BeforeValidator
from typing_extensions import Annotated

WIB = timezone(timedelta(hours=7))


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def today_wib() -> datetime:
    return datetime.now(WIB)


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
    unit_type: str = 'Studio'
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
    source: str = 'manual'  # manual | chat_import
    last_contact_at: Optional[datetime] = None


class Conversation(BaseDocument):
    source_type: str = 'paste'  # paste | txt | csv
    raw_text: str = ''
    message_count: int = 0
    participant_count: int = 0
    lead_count: int = 0
    potential_value: int = 0
    followup_count: int = 0


class Viewing(BaseDocument):
    lead_id: str
    unit_id: str
    scheduled_at: datetime
    note: Optional[str] = None
    status: str = 'menunggu'  # menunggu | terjadwal | selesai | batal


class Tenant(BaseDocument):
    lead_id: Optional[str] = None
    unit_id: str
    name: str
    phone: Optional[str] = None
    start_date: str  # YYYY-MM-DD
    end_date: Optional[str] = None
    monthly_rent: int = 0
    deposit: int = 0
    payment_due_day: int = 10
    status: str = 'aktif'  # aktif | checkout


class Payment(BaseDocument):
    tenant_id: str
    unit_id: str
    period: str  # YYYY-MM
    amount: int = 0
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
    status: str = 'baru'  # baru | sedang | selesai
    reported_by: Optional[str] = None
    resolved_at: Optional[datetime] = None


class Activity(BaseDocument):
    action: str
    entity: str
    entity_id: Optional[str] = None
    title: str
    detail: Optional[str] = None


class AIInsight(BaseDocument):
    type: str
    input_ref: Optional[str] = None
    output: dict = Field(default_factory=dict)


class TanyaMessage(BaseDocument):
    role: str  # user | assistant
    text: str
    actions: List[dict] = Field(default_factory=list)
