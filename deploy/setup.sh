#!/usr/bin/env bash
# One-time setup of Sewain on a fresh Ubuntu 22.04/24.04 VPS (1 GB RAM is enough).
#
#   curl -fsSL https://raw.githubusercontent.com/hellorobertofrinsen-rgb/sewain-/main/deploy/setup.sh | sudo bash
#
# Safe to run again: it keeps an existing deploy/.env and just rebuilds.
set -euo pipefail

REPO="https://github.com/hellorobertofrinsen-rgb/sewain-.git"
DIR="/opt/sewain"
ENV_FILE="$DIR/deploy/.env"

if [ "$(id -u)" -ne 0 ]; then
  echo "Jalankan dengan sudo:  curl -fsSL <url setup.sh> | sudo bash"
  exit 1
fi

ask() { # ask "Pertanyaan" -> answer (reads from the keyboard even when piped from curl)
  local answer
  read -r -p "$1" answer </dev/tty
  printf '%s' "$answer"
}

echo "==> 1/5  Memasang Docker & git"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl openssl ca-certificates >/dev/null
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
systemctl enable --now docker >/dev/null 2>&1 || true

echo "==> 2/5  Menyiapkan swap (supaya build muat di RAM kecil)"
mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$mem_mb" -lt 3000 ] && [ -z "$(swapon --show --noheadings)" ]; then
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "     swap 2 GB aktif"
fi

echo "==> 3/5  Mengambil kode Sewain"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only -q
else
  git clone -q --depth 1 "$REPO" "$DIR"
fi

echo "==> 4/5  Konfigurasi"
if [ -f "$ENV_FILE" ]; then
  echo "     $ENV_FILE sudah ada — dipakai apa adanya"
  # shellcheck disable=SC1090
  DOMAIN=$(grep '^DOMAIN=' "$ENV_FILE" | cut -d= -f2- | tr -d "'")
else
  MONGO_URL=""
  while [[ "$MONGO_URL" != mongodb* ]]; do
    MONGO_URL=$(ask "     Connection string MongoDB Atlas (mongodb+srv://...): ")
  done
  DOMAIN=$(ask "     Domain untuk Sewain (mis. sewain.duckdns.org) — kosongkan untuk pakai alamat IP: ")
  if [ -z "$DOMAIN" ]; then
    ip=$(curl -fsS --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}')
    DOMAIN="${ip//./-}.sslip.io"
    echo "     memakai $DOMAIN"
  fi
  EMAIL=""
  while [[ "$EMAIL" != *@* ]]; do
    EMAIL=$(ask "     Email kamu (untuk sertifikat HTTPS): ")
  done
  umask 077
  cat > "$ENV_FILE" <<ENV
# Sewain production settings — keep this file private (chmod 600).
MONGO_URL='$MONGO_URL'
DB_NAME=sewain
AUTH_SECRET=$(openssl rand -hex 32)
ADMIN_SECRET=$(openssl rand -hex 24)
DOMAIN=$DOMAIN
ACME_EMAIL=$EMAIL
ENV
  chmod 600 "$ENV_FILE"
fi

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443 >/dev/null
fi

echo "==> 5/5  Build & menjalankan (pertama kali 5–15 menit, mohon tunggu)"
cd "$DIR/deploy"
docker compose up -d --build
docker image prune -f >/dev/null

printf "     menunggu app siap"
for _ in $(seq 1 60); do
  if docker compose exec -T app python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health', timeout=3)" >/dev/null 2>&1; then
    echo " ✓"
    echo
    echo "Sewain sudah jalan:  https://$DOMAIN"
    echo "(sertifikat HTTPS bisa butuh 1–2 menit di kunjungan pertama)"
    echo
    echo "ADMIN_SECRET untuk upgrade Premium ada di: $ENV_FILE"
    echo "Update ke versi terbaru nanti:  sudo bash $DIR/deploy/update.sh"
    exit 0
  fi
  printf "."
  sleep 5
done
echo
echo "App belum merespons. Cek log:  cd $DIR/deploy && docker compose logs app --tail 50"
exit 1
