#!/usr/bin/env bash
# Installiert oder aktualisiert die Landjugend-Kasse auf dem Kaminfeger-Server.
# Die Kaminfeger-App bleibt unberührt: eigener Benutzer (landjugend), eigener Ordner (/opt/landjugend),
# eigener Dienst (landjugend-kasse), eigener Port, eigene Einstellungen (/etc/landjugend-kasse.env).
# Gemeinsam genutzt werden nur Node.js (/opt/node) und Caddy – dort kommt eine eigene Site-Datei dazu.
#
# Aufruf als root (erneut aufrufen = Update):
#   DOMAIN=kasse.example.de BRANCH=main bash install.sh
#   DOMAIN=auto …   → vorläufige Adresse kasse-<IP>.sslip.io, funktioniert ohne DNS-Eintrag
set -euo pipefail

BRANCH=${BRANCH:-main}
PORT=${PORT:-3101}
BASE=/opt/landjugend
APP=$BASE/app
DIR=$APP/landjugend-kasse
DATA=$BASE/data
ENV=/etc/landjugend-kasse.env
CADDY_SITE=/etc/caddy/landjugend-kasse.caddy
CADDYFILE=/etc/caddy/Caddyfile
export PATH=/opt/node/bin:$PATH
say() { echo "==> $*"; }

[ "$(id -u)" = 0 ] || { echo "Bitte als root ausführen (sudo)."; exit 1; }
command -v node >/dev/null || { echo "Node.js fehlt unter /opt/node/bin."; exit 1; }

TOKEN=$(curl -s -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' || true)
PUBLIC_IP=$(curl -s -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 || true)
if [ "${DOMAIN:-}" = auto ] || [ -z "${DOMAIN:-}" ]; then
  [ -n "$PUBLIC_IP" ] || { echo "Öffentliche IP unbekannt – bitte DOMAIN angeben."; exit 1; }
  DOMAIN="kasse-${PUBLIC_IP//./-}.sslip.io"
fi
say "Adresse: https://$DOMAIN (Port intern $PORT, Zweig $BRANCH)"

# Port darf nicht von etwas anderem belegt sein (z. B. Kaminfeger auf 3000)
if ss -ltnH "( sport = :$PORT )" | grep -q . && ! systemctl is-active -q landjugend-kasse; then
  echo "Port $PORT ist schon belegt. Bitte mit PORT=… einen freien Port wählen."; exit 1
fi

# ---- Benutzer und Ordner ----
id landjugend >/dev/null 2>&1 || useradd --system --home-dir $BASE --shell /usr/sbin/nologin landjugend
mkdir -p $DATA $BASE/backups

# ---- Code holen (eigene Kopie; das Kaminfeger-Verzeichnis wird nur gelesen, um die Repo-Adresse zu kennen) ----
REPO_URL=${REPO_URL:-$(git config -f /opt/kaminfeger/app/.git/config --get remote.origin.url)}
G="git -c safe.directory=$APP"
if [ -d $APP/.git ]; then
  say "Code aktualisieren"
  $G -C $APP fetch --depth 1 origin "$BRANCH"
  $G -C $APP reset --hard FETCH_HEAD
else
  say "Code klonen"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" $APP
fi

say "Abhängigkeiten installieren und bauen"
cd $DIR
npm ci --no-audit --no-fund
npm run build
npm prune --omit=dev --no-audit --no-fund
chown -R landjugend:landjugend $BASE

# ---- Einstellungen (bestehende bleiben, nur BASE_URL/PORT werden angepasst) ----
if [ ! -f $ENV ]; then
  say "Einstellungen anlegen: $ENV"
  BUCKET=$(grep -E '^BACKUP_S3_BUCKET=' /etc/kaminfeger.env 2>/dev/null | cut -d= -f2- || true)
  BREGION=$(grep -E '^BACKUP_S3_REGION=' /etc/kaminfeger.env 2>/dev/null | cut -d= -f2- || true)
  umask 027
  cat > $ENV <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=$PORT
BASE_URL=https://$DOMAIN
DATA_DIR=$DATA
APP_SECRET=$(openssl rand -hex 32)
TZ=Europe/Berlin
UPLOAD_MAX_MB=15
# Externe Sicherung (gleicher Bucket wie Kaminfeger, eigener Unterordner landjugend/)
BACKUP_S3_BUCKET=$BUCKET
BACKUP_S3_REGION=$BREGION
EOF
else
  sed -i "s|^BASE_URL=.*|BASE_URL=https://$DOMAIN|; s|^PORT=.*|PORT=$PORT|" $ENV
fi
chown root:landjugend $ENV && chmod 640 $ENV

# ---- Dienst ----
cat > /etc/systemd/system/landjugend-kasse.service <<EOF
[Unit]
Description=Landjugend-Kasse
After=network.target

[Service]
User=landjugend
WorkingDirectory=$DIR
EnvironmentFile=$ENV
ExecStart=/opt/node/bin/node --disable-warning=ExperimentalWarning server/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA

[Install]
WantedBy=multi-user.target
EOF

# ---- Tägliche Sicherung (03:40, 14 Tage lokal, optional S3) ----
cat > /etc/systemd/system/landjugend-kasse-backup.service <<EOF
[Unit]
Description=Sicherung der Landjugend-Kasse

[Service]
Type=oneshot
User=landjugend
EnvironmentFile=$ENV
ExecStart=/bin/bash $DIR/deploy/backup.sh
EOF
cat > /etc/systemd/system/landjugend-kasse-backup.timer <<EOF
[Unit]
Description=Tägliche Sicherung der Landjugend-Kasse

[Timer]
OnCalendar=*-*-* 03:40
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable -q landjugend-kasse landjugend-kasse-backup.timer
systemctl restart landjugend-kasse
systemctl start landjugend-kasse-backup.timer

say "Warte auf die App"
for i in $(seq 1 30); do
  curl -sf http://127.0.0.1:$PORT/api/health >/dev/null && break
  sleep 1
  [ "$i" = 30 ] && { journalctl -u landjugend-kasse -n 40 --no-pager; echo "App startet nicht."; exit 1; }
done
say "App läuft: $(curl -s http://127.0.0.1:$PORT/api/health)"

# ---- Caddy: eigene Site-Datei, im Caddyfile nur eine import-Zeile ----
cat > $CADDY_SITE <<EOF
# Landjugend-Kasse (verwaltet von landjugend-kasse/deploy/install.sh)
$DOMAIN {
	encode gzip
	request_body {
		max_size 20MB
	}
	reverse_proxy 127.0.0.1:$PORT
}
EOF
if ! grep -qF "import $CADDY_SITE" $CADDYFILE; then
  cp $CADDYFILE "$CADDYFILE.vor-landjugend-$(date +%Y%m%d%H%M%S)"
  printf '\nimport %s\n' "$CADDY_SITE" >> $CADDYFILE
fi
if ! caddy validate --config $CADDYFILE --adapter caddyfile >/tmp/caddy-validate.log 2>&1; then
  cat /tmp/caddy-validate.log
  LAST=$(ls -t $CADDYFILE.vor-landjugend-* 2>/dev/null | head -1)
  [ -n "$LAST" ] && cp "$LAST" $CADDYFILE
  echo "Caddy-Konfiguration ungültig – Änderung zurückgenommen, Caddy unverändert."; exit 1
fi
systemctl reload caddy
say "Caddy neu geladen (Kaminfeger-Seite unverändert)"

RESOLVED=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)
if [ -n "$PUBLIC_IP" ] && [ "$RESOLVED" != "$PUBLIC_IP" ]; then
  echo
  echo "Hinweis: $DOMAIN zeigt noch nicht auf diesen Server ($PUBLIC_IP, gefunden: ${RESOLVED:-nichts})."
  echo "Bitte beim DNS-Anbieter einen A-Eintrag $DOMAIN → $PUBLIC_IP anlegen. Caddy holt das Zertifikat dann von selbst."
fi
echo
say "Fertig: https://$DOMAIN"
