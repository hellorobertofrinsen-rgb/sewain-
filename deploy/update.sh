#!/usr/bin/env bash
# Pull the latest Sewain from GitHub and restart. Usage: sudo bash /opt/sewain/deploy/update.sh
set -euo pipefail
cd /opt/sewain
git pull --ff-only
cd deploy
docker compose up -d --build
docker image prune -f >/dev/null
bash /opt/sewain/deploy/install-cron.sh
echo "Sewain sudah diperbarui."
