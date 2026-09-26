# Sewain

Admin buat bisnis sewa properti — untuk agen & pengelola sewa. Catat calon penyewa, cocokkan dengan unit, ingatkan follow-up, jadwalkan viewing, catat negosiasi, jadikan tenant, lalu lacak tagihan dan sisa kontrak. Semua dari satu layar **Hari Ini**: “siapa yang harus aku urus sekarang?”

Alur utama: **Calon penyewa → unit cocok → follow-up → viewing → negosiasi → deal → tenant → tagihan / kontrak / masalah**. Data yang sudah dicatat ikut terbawa ke tahap berikutnya — tidak perlu ketik ulang.

## Stack (sengaja dibuat sederhana & murah)

| Bagian | Pakai |
|---|---|
| Aplikasi | Expo Router (React Native Web) → di-build jadi **PWA** yang bisa di-install di iPhone, Android, dan Chrome desktop |
| Backend | FastAPI (Python) — sekaligus menyajikan file web-nya. **Satu service, satu URL.** |
| Database | MongoDB (cukup MongoDB Atlas **free M0**, 512 MB) |
| Foto unit | Disimpan di MongoDB (otomatis dikecilkan ke ±150 KB) — tidak perlu layanan storage terpisah |
| Login | Email + password (bcrypt), token JWT |
| AI | **Tidak ada** di versi ini (nol biaya AI). Pencocokan unit & pesan WhatsApp pakai aturan/template. |

Tidak ada Redis, antrean, cron, atau layanan berbayar lain.

## Jalankan di komputer

```bash
# backend
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env            # isi MONGO_URL (Atlas atau MongoDB lokal) & AUTH_SECRET
uvicorn server:app --reload --port 8000

# web app (terminal lain)
cd frontend
yarn install
EXPO_PUBLIC_BACKEND_URL=http://localhost:8000 yarn web
```

Atau persis seperti produksi: `cd frontend && yarn build:web`, lalu buka `http://localhost:8000` — backend otomatis menyajikan `frontend/dist`.

Cek sebelum push:

```bash
cd backend && pytest            # tes lokal, pakai MongoDB in-memory (tanpa internet)
cd frontend && yarn typecheck && yarn lint
```

## Deploy (murah)

1. **Database** — buat cluster **free (M0)** di [MongoDB Atlas](https://www.mongodb.com/pricing). Network Access: izinkan `0.0.0.0/0`. Salin connection string.
2. **App** — di [Render](https://render.com): *New → Blueprint* → pilih repo ini (pakai `render.yaml`), isi `MONGO_URL`. `AUTH_SECRET` & `ADMIN_SECRET` dibuat otomatis.
   - Paket free Render **tidur setelah 15 menit** tanpa pengunjung (buka pertama ±1 menit). Kalau sudah ada user beneran, naikkan ke Starter (±$7/bulan) supaya selalu nyala.
   - `Dockerfile` di root juga jalan di host Docker lain (Koyeb, Fly.io, Railway, VPS).
3. Buka URL-nya → di HP pilih **Pasang aplikasi** (Android/Chrome) atau **Bagikan → Tambah ke Layar Utama** (iPhone).

Env vars: lihat `backend/.env.example`.

## Paket Free / Premium

Semua angka ada di **satu file**: `backend/plans.py` (`PLAN_LIMITS`, `PRICING`, `UPGRADE_WHATSAPP`). Ubah di sana, frontend ikut otomatis.

| | Free | Premium |
|---|---|---|
| Unit | 3 | tanpa batas |
| Calon penyewa aktif (belum deal / tidak jadi) | 20 | tanpa batas |
| Impor CSV, export data | – | ✓ |
| Semua alur lain (follow-up, viewing, nego, deal, tenant, tagihan, masalah) | ✓ | ✓ |

- Batas dicek di **backend**; user tidak bisa mengubah paketnya sendiri.
- Kalau Premium habis dan akun kembali Free: hanya **3 unit pertama** yang tampil. Unit lain **disembunyikan, tidak dihapus** — muncul lagi saat upgrade.
- Tombol Upgrade membuka WhatsApp owner dengan pesan otomatis (paket + email akun). Tidak ada billing otomatis.

### Upgrade manual (setelah transfer dikonfirmasi)

```bash
# dari folder backend, dengan MONGO_URL mengarah ke database produksi
python set_plan.py agen@contoh.com premium 2026-12-31   # premium sampai tanggal itu (inklusif)
python set_plan.py agen@contoh.com premium              # premium tanpa tanggal akhir
python set_plan.py agen@contoh.com free                 # kembali ke free
```

Tanpa akses shell (mis. Render free), pakai endpoint admin — `ADMIN_SECRET` ada di dashboard env var:

```bash
curl -X POST https://APP-KAMU/api/admin/set-plan \
  -H "X-Admin-Secret: ADMIN_SECRET_KAMU" -H "Content-Type: application/json" \
  -d '{"email":"agen@contoh.com","plan":"premium","premium_until":"2026-12-31"}'
```

Premium dengan `premium_until` otomatis kembali ke Free setelah tanggal itu lewat.

## Akun demo

“Coba Demo” di halaman login membuat akun contoh berisi 12 unit + alur lengkap. Akun demo dan datanya **dihapus otomatis setelah 7 hari** (`DEMO_RETENTION_DAYS`).

## Peta kode

```
backend/
  server.py          app FastAPI + sajikan web build
  plans.py           ← semua aturan Free/Premium
  routers_main.py    unit, calon penyewa, viewing, nego, deal, tenant, tagihan, masalah, Hari Ini, export
  routers_auth.py    login/daftar/demo, /me, /plan
  routers_admin.py   ganti paket (dikunci ADMIN_SECRET)
  matching.py        skor kecocokan calon ↔ unit (tanpa AI)
  storage.py         foto unit di MongoDB
  seed.py            data akun demo
  set_plan.py        CLI ganti paket
frontend/
  app/(tabs)/        Hari Ini, Unit, Calon, Tenant, Masalah
  app/lead, unit, tenant/[id].tsx   detail
  src/lib/plan.tsx   info paket + sheet Upgrade
  src/lib/messages.ts  template pesan WhatsApp
  public/            manifest, service worker, ikon PWA
```
