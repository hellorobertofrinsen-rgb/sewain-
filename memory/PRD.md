# Sewain — Product Requirements & Build Log

## Original Problem Statement
Build "Sewain", a production-ready web+mobile app for the Building Indonesia competition: an **AI admin / operating system for people who RUN rental properties** (kos, apartemen, villa, kontrakan, coliving) in Indonesia. Not a marketplace, not an Airbnb clone, not just a chatbot. Main promise: **"Unit banyak. Admin nggak harus ikut banyak."** Must have persistent data, real AI analysis, file uploads, polished responsive UI. Full lifecycle: unit kosong → calon penyewa → AI memahami & mencocokkan → follow-up → viewing → deal → tenant → pembayaran → maintenance → renewal/checkout.

## Architecture
- **Backend**: FastAPI + Motor (async MongoDB). All routes `/api/*`. JWT auth (bcrypt). Modules: `database.py`, `models.py` (PyObjectId/BaseDocument, account-scoped), `auth_utils.py`, `ai_service.py` (Emergent LLM key, gpt-5.4 + gpt-5.4-mini), `storage_client.py` (Emergent Object Storage for unit photos), `seed.py` (Indonesian demo data), `routers_auth.py`, `routers_main.py`, `routers_ai.py`.
- **Frontend**: Expo Router (React Native Web). Dark charcoal theme (`src/theme.ts`, Rubik fonts, custom SVG Icon set + negative-space "s" LogoMark). Web = left sidebar; mobile = bottom tabs (5 primary: Hari Ini, Unit, Calon, Tenant, Masalah). React Query for all server state. Toast + bottom Sheet components.
- **Data hierarchy**: Account → Properties → Units → Leads → Conversations → Viewings → Tenants → Payments → Maintenance → AI Insights → Activities. Fully account-scoped & multi-property (scales 10 → 1000 units).

## User Personas
Indonesian rental owner/operator: individual owner (10 apartment units), kos operator (30 rooms), villa/coliving operator, professional property manager (100+ units).

## Core Requirements (static)
Today action-queue home, killer AI chat analysis (extract leads + match units + draft follow-up), Units + AI matching, Calon Penyewa, Viewing, Tenant conversion, rent Payment tracker + AI reminders, Maintenance AI classification, Tanya Sewain (AI over live data), honest Impact page + activity log, email auth + one-tap demo, seeded demo data distinct from real activity.

## Implemented (2026-09-20) — all verified functional
- Auth: register / login / one-tap "Coba Demo" / stable `demo@sewain.id`; account isolation.
- Today: greeting + real GPT daily summary, 4 stat cards, "Beresin satu-satu", unit occupancy bar, unified action queue (follow-up / viewing / payment / maintenance) with inline actions + smooth removal.
- Killer AI (FLOW A): paste/upload .txt/CSV or sample chat → staged processing → real GPT extracts leads (name, budget, type, interest, follow-up reason, quote, confidence) → unit matching with reasons → editable follow-up draft → mark contacted. Uncertainty shown when confidence < 0.6.
- Units: list + status filters, add/edit, CSV import, photo upload (Object Storage), detail with status change, "Cari Penyewa yang Cocok" AI ranking.
- Leads: list + filters, detail, schedule viewing, mark deal → tenant + payments + unit terisi, not-interested.
- Viewings: confirm / reschedule / cancel, surfaced on Today.
- Tenants + Payments: list, unpaid summary, detail, mark paid (→ Lunas ✓), AI reminder draft, checkout → unit kosong.
- Maintenance: report → real GPT category/priority/unit/summary, start/resolve, urgent surfaced on Today.
- Tanya Sewain: quick chips + free-text, real GPT answers over live DB with action buttons.
- Impact: metrics from real `origin:user` activity only (demo seed excluded), before/after, activity log with "contoh" badges, Tentang Sewain story.
- Setup / Settings: manual property+unit, CSV import (+template), account, logout.
- Testing: 28/28 backend pytest pass; frontend Playwright verified all flows.

## Backlog (P1/P2)
- P1: WhatsApp deep-link auto-fill of drafted message (currently copy-to-clipboard).
- P1: Native date/time picker for viewing scheduling (currently text fields).
- P2: Renewal reminders near lease end; bulk "Ingatkan semua" from Tanya action.
- P2: Migrate remaining `pointerEvents` prop usages; PATCH endpoint for partial unit updates.

## Next tasks
- Await user feedback; polish per competition demo run.
