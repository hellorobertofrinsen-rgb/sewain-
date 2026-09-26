# Sewain

Admin buat agen sewa properti: **mengelola prospek, unit, dan tenant**. Tiga ukuran sukses, dan ketiganya terlihat di halaman **Laporan**:

1. **Kecepatan layanan** — prospek baru langsung naik ke paling atas *Hari Ini* sampai dibalas.
2. **Retensi** — kontrak yang mau habis muncul 30 hari sebelumnya, perpanjangan satu ketukan.
3. **Prospek hilang sedikit** — prospek yang lama tanpa kabar ditandai, alasan “tidak jadi” dicatat.

Alur utama: **Prospek → unit cocok → follow-up → viewing → negosiasi → deal → tenant → tagihan / kontrak / masalah**. Data yang sudah dicatat ikut terbawa ke tahap berikutnya — tidak perlu ketik ulang. Chat WhatsApp bisa ditempel (atau dibagikan langsung dari WhatsApp ke Sewain) dan nama, nomor, budget, serta tipe unit terisi otomatis.

## Stack (sengaja dibuat sederhana & murah)

| Bagian | Pakai |
|---|---|
| Aplikasi | Expo Router (React Native Web) → di-build jadi **PWA** yang bisa di-install di iPhone, Android, dan Chrome desktop |
| Backend | FastAPI (Python) — sekaligus menyajikan file web-nya. **Satu service, satu URL.** |
| Database | MongoDB (cukup MongoDB Atlas **free M0**, 512 MB) |
| Foto unit | Disimpan di MongoDB (otomatis dikecilkan ke ±150 KB) — tidak perlu layanan storage terpisah |
| Login | Email + password (bcrypt), token JWT |
| AI | **Tidak ada** di versi ini (nol biaya AI). Pencocokan unit & pesan WhatsApp pakai aturan/template. |

Tidak ada Redis, antrean, atau layanan berbayar lain. Satu-satunya cron: backup database harian di VPS.

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

Cek sebelum push (GitHub Actions menjalankan hal yang sama di setiap PR):

```bash
cd backend && pytest                     # tes API, pakai MongoDB in-memory (tanpa internet)
cd frontend && yarn typecheck && yarn lint
cd frontend && yarn build:web && cd .. && pip install -r e2e/requirements.txt \
  && python -m playwright install chromium && pytest e2e   # tes end-to-end di browser sungguhan
```

## Deploy (murah): VPS ± Rp50 ribu/bulan + MongoDB Atlas gratis

Data tersimpan di MongoDB Atlas, jadi VPS-nya bisa diganti kapan saja tanpa kehilangan data.

1. **Database** — cluster **free (M0)** di [MongoDB Atlas](https://www.mongodb.com/pricing). *Network Access* → tambahkan `0.0.0.0/0`. Salin connection string (ganti `<db_password>`).
2. **Domain gratis (disarankan)** — buat subdomain di [duckdns.org](https://www.duckdns.org) (login Google/GitHub), mis. `sewain.duckdns.org`, arahkan ke IP VPS. Domain sendiri juga bisa. Tanpa domain, skrip memakai `IP.sslip.io` (kadang gagal dapat sertifikat HTTPS).
3. **VPS** — Ubuntu 22.04/24.04, 1 GB RAM cukup (mis. Biznet Gio NEO Lite). Login SSH, lalu jalankan:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/hellorobertofrinsen-rgb/sewain-/main/deploy/setup.sh | sudo bash
   ```

   Skrip memasang Docker, menanyakan connection string / domain / email, membuat secret otomatis, lalu menjalankan Sewain + HTTPS (Caddy). Selesai → buka `https://domain-kamu`.
4. Di HP: **Pasang aplikasi** (Android/Chrome) atau Safari → **Bagikan → Tambah ke Layar Utama** (iPhone).

Perintah di VPS:

```bash
sudo bash /opt/sewain/deploy/update.sh                                  # update ke versi terbaru dari GitHub
sudo bash /opt/sewain/deploy/set-plan.sh agen@contoh.com premium 2026-12-31   # upgrade manual
sudo bash /opt/sewain/deploy/reset-link.sh agen@contoh.com              # link reset password (kirim via WA)
sudo bash /opt/sewain/deploy/backup.sh                                  # backup sekarang (otomatis tiap malam)
cd /opt/sewain/deploy && sudo docker compose logs app --tail 50          # lihat log kalau ada masalah
```

**Backup.** Atlas gratis (M0) tidak punya backup. `update.sh`/`setup.sh` memasang cron yang setiap malam (02.30 WIB) menyimpan `mongodump` ke `/opt/sewain/backups` (14 hari terakhir). Sesekali salin ke laptop: `scp -i KEY user@IP:/opt/sewain/backups/*.gz .`. Restore: lihat komentar di `deploy/backup.sh`.

**Pantau.** Daftar gratis di [UptimeRobot](https://uptimerobot.com), buat monitor HTTP ke `https://domain-kamu/api/health` (tiap 5 menit) → dapat email/WA kalau Sewain mati. Isi database (batas M0 512 MB): `curl -H "X-Admin-Secret: …" https://domain-kamu/api/admin/db-stats`.

**Lupa password.** Tidak ada email otomatis: agen menekan “Lupa password?” → WhatsApp ke kamu → jalankan `reset-link.sh` → kirim link-nya (sekali pakai, 24 jam).

Konfigurasi produksi ada di `/opt/sewain/deploy/.env` (termasuk `ADMIN_SECRET`). Alternatif tanpa VPS: `Dockerfile` di root juga jalan di Render (`render.yaml`) atau host Docker lain.

## Paket Free / Premium

Semua angka ada di **satu file**: `backend/plans.py` (`PLAN_LIMITS`, `PRICING`, `UPGRADE_WHATSAPP`). Ubah di sana, frontend ikut otomatis.

| | Free | Premium |
|---|---|---|
| Unit | 3 | tanpa batas |
| Prospek aktif (belum deal / tidak jadi) | 20 | tanpa batas |
| Impor CSV, export data | – | ✓ |
| Semua alur lain (follow-up, viewing, nego, deal, tenant, tagihan, masalah) | ✓ | ✓ |

- Akun baru otomatis **Trial Premium 14 hari** (`TRIAL_DAYS`), supaya setup semua unit tidak mentok di batas Free. Setelah itu jadi Free.
- Batas dicek di **backend**; user tidak bisa mengubah paketnya sendiri.
- Kalau Premium habis dan akun kembali Free: hanya **3 unit pertama** yang tampil. Unit lain **disembunyikan, tidak dihapus** — muncul lagi saat upgrade.
- Tombol Upgrade membuka WhatsApp owner dengan pesan otomatis (paket + email akun). Tidak ada billing otomatis.

### Upgrade manual (setelah transfer dikonfirmasi)

Di VPS: `sudo bash /opt/sewain/deploy/set-plan.sh agen@contoh.com premium 2026-12-31`. Atau dari folder `backend` di komputer mana pun, dengan `MONGO_URL` mengarah ke database produksi:

```bash
python set_plan.py agen@contoh.com premium 2026-12-31   # premium sampai tanggal itu (inklusif)
python set_plan.py agen@contoh.com premium              # premium tanpa tanggal akhir
python set_plan.py agen@contoh.com free                 # kembali ke free
```

Atau lewat endpoint admin (`ADMIN_SECRET` ada di `deploy/.env` di VPS):

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
  plans.py           ← semua aturan Free/Premium/Trial
  routers_main.py    unit, prospek, viewing, nego, deal, tenant, tagihan, masalah, Hari Ini, export
  routers_stats.py   Laporan: kecepatan balas, prospek hilang, retensi, uang, per pemilik
  routers_auth.py    login/daftar/demo, profil & zona waktu, ganti/reset password, hapus akun
  routers_admin.py   ganti paket, link reset password, isi database (dikunci ADMIN_SECRET)
  ratelimit.py       batas percobaan login/daftar/demo
  matching.py        skor kecocokan prospek ↔ unit (tanpa AI)
  storage.py         foto unit di MongoDB
  seed.py            data akun demo
  set_plan.py, reset_link.py   CLI untuk owner
frontend/
  app/(tabs)/        Hari Ini, Prospek, Unit, Tenant (+ tombol tambah cepat), Masalah, Laporan
  app/lead, unit, tenant/[id].tsx   detail (di desktop tampil di samping daftar)
  app/privasi, ketentuan, reset     halaman publik
  src/theme.ts       warna, jarak, ukuran huruf — satu tempat
  src/components/    ui (tombol, kartu, daftar), Sheet, Illustration, Celebrate
  src/lib/parseChat.ts  ambil nama/nomor/budget dari chat WhatsApp (tanpa AI)
  src/lib/plan.tsx   info paket + sheet Upgrade
  src/lib/messages.ts  template pesan WhatsApp (termasuk laporan ke pemilik)
  public/            manifest (termasuk “Bagikan ke Sewain”), service worker, ikon PWA
e2e/                 tes end-to-end (Playwright) + server lokal in-memory
deploy/              docker compose, Caddy, setup/update/backup/reset-link
```
