#!/usr/bin/env bash
# Daily backup at 02:30 WIB (19:30 UTC). Safe to run again.
set -euo pipefail
cat > /etc/cron.d/sewain-backup <<'CRON'
30 19 * * * root bash /opt/sewain/deploy/backup.sh >> /var/log/sewain-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/sewain-backup
