#!/bin/bash
# Tägliche Sicherung: Datenbank (konsistente Kopie) + hochgeladene Dateien.
# Lokal 14 Tage, zusätzlich verschlüsselt nach S3, wenn BACKUP_S3_BUCKET in /etc/kaminfeger.env steht.
# Läuft über kaminfeger-backup.timer (siehe deploy/kaminfeger-backup.*).
set -euo pipefail
ENV=${KF_ENV:-/etc/kaminfeger.env}
val() { grep -E "^$1=" "$ENV" | tail -1 | cut -d= -f2- || true; }
DATA=$(val DATA_DIR); DATA=${DATA:-/opt/kaminfeger/data}
OUT=$(val BACKUP_DIR); OUT=${OUT:-/opt/kaminfeger/backups}
BUCKET=$(val BACKUP_S3_BUCKET); REGION=$(val BACKUP_S3_REGION); REGION=${REGION:-eu-central-1}
DAY=$(date +%F)
# Gruppe kaminfeger darf lesen (für den Start-Check), sonst niemand
mkdir -p "$OUT"; chmod 750 "$OUT"; chgrp kaminfeger "$OUT" 2>/dev/null || true

DB="$OUT/kaminfeger-$DAY.sqlite"
rm -f "$DB"
${NODE:-/opt/node/bin/node} --no-warnings -e "new (require('node:sqlite').DatabaseSync)(process.argv[1], { readOnly: true }).exec(\"VACUUM INTO '\" + process.argv[2] + \"'\")" "$DATA/kaminfeger.sqlite" "$DB"
chmod 640 "$DB"; chgrp kaminfeger "$DB" 2>/dev/null || true
tar czf "$OUT/uploads-$DAY.tar.gz" -C "$DATA" uploads && chmod 640 "$OUT/uploads-$DAY.tar.gz"
find "$OUT" -maxdepth 1 -type f \( -name 'kaminfeger-*.sqlite' -o -name 'uploads-*.tar.gz' \) -mtime +14 -delete

if [ -n "$BUCKET" ]; then
  aws s3 cp "$DB" "s3://$BUCKET/daily/kaminfeger-$DAY.sqlite" --sse AES256 --region "$REGION" --only-show-errors
  aws s3 cp "$OUT/uploads-$DAY.tar.gz" "s3://$BUCKET/daily/uploads-$DAY.tar.gz" --sse AES256 --region "$REGION" --only-show-errors
  echo "Sicherung $DAY lokal und in s3://$BUCKET"
else
  echo "Sicherung $DAY lokal (kein BACKUP_S3_BUCKET gesetzt)"
fi
