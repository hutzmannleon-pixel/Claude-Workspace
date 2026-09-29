#!/bin/bash
# STARTSCHALTER – schaltet vom Testbetrieb in den echten Betrieb:
#   1. Test-Einstellungen aus /etc/kaminfeger.env entfernen (Freigabeliste, frühe Route, Testmodus, Passkey optional)
#   2. Datenbank sichern und Testbezirk samt Testkonten entfernen
#   3. App neu starten und Start-Check ausführen
# Aufruf auf dem Server:  sudo /opt/kaminfeger/app/deploy/go-live.sh
set -euo pipefail
ENV=/etc/kaminfeger.env
APP=/opt/kaminfeger/app
cp -p "$ENV" "$ENV.vor-start-$(date +%Y%m%d-%H%M%S)"
sed -i -E '/^(ALLOWED_EMAILS|ALLOW_EARLY_ROUTE|TEST_MODE|ADMIN_PASSKEY)=/d' "$ENV"
echo "Test-Einstellungen entfernt (alte Datei als $ENV.vor-start-* aufgehoben)."
in_app() { systemd-run --quiet --wait --pipe --collect -p EnvironmentFile="$ENV" -p User=kaminfeger -p WorkingDirectory="$APP" /opt/node/bin/node --disable-warning=ExperimentalWarning "$@"; }
in_app server/launch.js go-live --ausfuehren
systemctl restart kaminfeger
sleep 3
curl -fsS http://127.0.0.1:3000/api/health >/dev/null && echo "App läuft."
in_app server/launch.js check || true
