#!/usr/bin/env bash
# One-time password-reset link for an agent (send it to them over WhatsApp). Example:
#   sudo bash /opt/sewain/deploy/reset-link.sh agen@contoh.com
set -euo pipefail
cd /opt/sewain/deploy
docker compose exec -T app python reset_link.py "$@"
