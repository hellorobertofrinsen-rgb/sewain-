#!/usr/bin/env bash
# Change an account's plan on this server. Examples:
#   sudo bash /opt/sewain/deploy/set-plan.sh agen@contoh.com premium 2026-12-31
#   sudo bash /opt/sewain/deploy/set-plan.sh agen@contoh.com free
set -euo pipefail
cd /opt/sewain/deploy
docker compose exec -T app python set_plan.py "$@"
