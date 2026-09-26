#!/usr/bin/env bash
# Daily backup of the Sewain database (MongoDB Atlas free tier has no backups of its own).
# Installed as a daily cron job by setup.sh / update.sh; run by hand any time:
#   sudo bash /opt/sewain/deploy/backup.sh
# Restore (overwrites!):  docker run --rm -i mongo:7 mongorestore --uri "$MONGO_URL" --archive --gzip --drop < FILE
set -euo pipefail
DIR=/opt/sewain/backups
KEEP=14
mkdir -p "$DIR"
chmod 700 "$DIR"
MONGO_URL=$(grep '^MONGO_URL=' /opt/sewain/deploy/.env | cut -d= -f2- | sed "s/^'//; s/'$//")
out="$DIR/sewain-$(date +%Y-%m-%d).archive.gz"
docker run --rm mongo:7 mongodump --uri "$MONGO_URL" --archive --gzip --quiet > "$out.tmp"
mv "$out.tmp" "$out"
chmod 600 "$out"
ls -1t "$DIR"/sewain-*.archive.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "Backup: $out ($(du -h "$out" | cut -f1))"
