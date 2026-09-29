#!/bin/bash
# Sicherung zurückspielen:  sudo deploy/restore.sh /opt/kaminfeger/backups/kaminfeger-2026-10-01.sqlite
#                     oder: sudo deploy/restore.sh s3://BUCKET/daily/kaminfeger-2026-10-01.sqlite
# Der aktuelle Stand wird vorher als kaminfeger.sqlite.vor-restore-<Zeit> aufgehoben.
set -euo pipefail
SRC=${1:?Aufruf: restore.sh <Datei oder s3://…>}
DATA=$(grep -E '^DATA_DIR=' /etc/kaminfeger.env | cut -d= -f2-); DATA=${DATA:-/opt/kaminfeger/data}
TMP=$(mktemp); trap 'rm -f "$TMP"' EXIT
if [[ "$SRC" == s3://* ]]; then aws s3 cp "$SRC" "$TMP" --only-show-errors; else cp "$SRC" "$TMP"; fi
systemctl stop kaminfeger
STAMP=$(date +%Y%m%d-%H%M%S)
for f in kaminfeger.sqlite kaminfeger.sqlite-wal kaminfeger.sqlite-shm; do [ -f "$DATA/$f" ] && mv "$DATA/$f" "$DATA/$f.vor-restore-$STAMP"; done
install -o kaminfeger -g kaminfeger -m 600 "$TMP" "$DATA/kaminfeger.sqlite"
systemctl start kaminfeger
echo "Zurückgespielt: $SRC (alter Stand: $DATA/kaminfeger.sqlite.vor-restore-$STAMP)"
