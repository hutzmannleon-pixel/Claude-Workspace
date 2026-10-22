#!/usr/bin/env bash
# Tägliche Sicherung der Landjugend-Kasse: Datenbank (konsistent) + Belege, 14 Tage lokal, optional nach S3 (Unterordner landjugend/)
set -euo pipefail
DATA=${DATA_DIR:-/opt/landjugend/data}
OUT=/opt/landjugend/backups
DAY=$(date +%F)
mkdir -p $OUT
rm -f "$OUT/kasse-$DAY.sqlite"
/opt/node/bin/node --disable-warning=ExperimentalWarning -e "new (require('node:sqlite').DatabaseSync)(process.argv[1]).exec(\"VACUUM INTO '\" + process.argv[2] + \"'\")" "$DATA/kasse.sqlite" "$OUT/kasse-$DAY.sqlite"
tar czf "$OUT/belege-$DAY.tar.gz" -C "$DATA" belege
find $OUT -type f -mtime +14 -delete
if [ -n "${BACKUP_S3_BUCKET:-}" ] && command -v aws >/dev/null; then
  R=${BACKUP_S3_REGION:-eu-central-1}
  aws s3 cp "$OUT/kasse-$DAY.sqlite" "s3://$BACKUP_S3_BUCKET/landjugend/kasse-$DAY.sqlite" --sse AES256 --region "$R" --only-show-errors
  aws s3 cp "$OUT/belege-$DAY.tar.gz" "s3://$BACKUP_S3_BUCKET/landjugend/belege-$DAY.tar.gz" --sse AES256 --region "$R" --only-show-errors
fi
echo "Sicherung $DAY fertig"
