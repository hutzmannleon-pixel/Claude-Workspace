# Kaminfeger Verwaltung

Der Kaminfeger gibt pro Straße Zeitfenster frei, die Bewohner wählen die halbe Stunde, in der sie zu Hause sind. So steht er seltener vor verschlossenen Türen.

Die App besteht aus drei Teilen, die über einen gemeinsamen Server live verbunden sind:

| Adresse | Für wen | Was |
|---|---|---|
| `/kunde` | Bewohner | Registrieren (Adresse, E-Mail-Code, Wohnsitz-Nachweis), Zeit buchen, verschieben/absagen, live sehen, wie weit der Kaminfeger weg ist, Nachrichten, Profil |
| `/kaminfeger` | Bezirks-Kaminfeger | Registrieren mit Bezirksabgleich und Nachweis, Kehrbuch importieren, Zeitfenster pro Straße, Tagesroute, Nachrichten, Mieter bestätigen |
| `/betreiber` | Sie als Betreiber | Kaminfeger und Bewohner prüfen, Dokumente ansehen (danach gelöscht), Protokoll, Bezirksverzeichnis importieren, Feedback lesen |
| `/test` | nur im Testmodus | Alle drei Apps nebeneinander, Schritt-Anleitung, Test-Postfach für Codes und Links |

**Feedback:** Auf allen Seiten gibt es einen Feedback-Knopf, auch ohne Anmeldung (dann mit freiwilliger E-Mail für Rückfragen) (Sprechblase unten rechts, am Desktop in der Seitenleiste). Er macht ein Bild der aktuellen Ansicht, der Nutzer zieht einen Rahmen um die betroffene Stelle und schreibt etwas dazu. Alles landet beim Betreiber unter **Feedback**.

**Am Desktop** (ab 1024 px Fensterbreite) zeigen Betreiber und Kaminfeger eine Seitenleiste, links die Liste (Prüfungen bzw. Straßen) und rechts die Details. In Chrome/Edge lässt sich die Seite über ⋮ → „App installieren“ als eigenes Fenster einrichten. Die Bewohner-App bleibt als Handy-Ansicht.

Das Design stammt 1:1 aus dem Claude-Design-Prototyp (Nocturne), siehe `project/` und `chats/`.

## Aufbau

```
server/          Node.js (Fastify) + SQLite (in Node eingebaut, node:sqlite)
  routes/        API: public (Login, Links), customer, sweep, admin
  test/          Integrationstest aller Abläufe (npm test)
web/             React-App (Vite), Designsystem in web/src/ds/nocturne.css
  public/vorlagen/  CSV-Vorlagen für Bezirksverzeichnis und Kehrbuch
project/, chats/ Design-Vorlage aus Claude Design (nur Referenz)
```

Voraussetzung: **Node.js 22.13 oder neuer**.

## Lokal ausprobieren

```bash
npm install
npm run build
TEST_MODE=1 ADMIN_EMAILS=ich@example.de npm start
```

Dann **http://localhost:3000/test** öffnen. Es gibt **keine Beispieldaten**, Sie legen alles selbst an:

1. Betreiber: mit `ich@example.de` entsperren. Den Code finden Sie im Test-Postfach links. Unter **Verzeichnis** das Bezirksverzeichnis als CSV importieren.
2. Kaminfeger: registrieren (Name wie im Verzeichnis), Bezirk wählen, Urkunde und Ausweis hochladen.
3. Betreiber: prüfen und freigeben. Der Freischaltlink geht an die E-Mail **aus dem Verzeichnis**.
4. Kaminfeger: Link aus dem Postfach öffnen, dann Kehrbuch (CSV) importieren und Zeitfenster senden.
5. Bewohner: mit einer Adresse aus dem Kehrbuch registrieren, Kundennummer eingeben, Zeit buchen.
6. Kaminfeger: Route starten und Häuser abhaken. Der Bewohner sieht live „2 Häuser entfernt“.

„Alles löschen“ auf der Testseite setzt die Datenbank zurück.

**Entwicklung mit Hot-Reload:** `npm run dev` (Web unter http://localhost:5173, API auf Port 3000).
**Tests:** `npm test` spielt 27 Szenarien gegen eine temporäre Datenbank durch.

## Online bringen (eigener Server)

Empfohlen: ein kleiner Server in Deutschland (z. B. Hetzner CX22, ca. 4 €/Monat) mit Docker.

1. **Domain:** einen DNS-A-Eintrag, z. B. `termine.ihre-domain.de`, auf die Server-IP setzen.
2. **Projekt auf den Server** kopieren (per `git clone` oder `scp`).
3. **Konfiguration:** `cp .env.example .env` und ausfüllen (Domain, `APP_SECRET` mit `openssl rand -hex 32`, Ihre Admin-E-Mail, SMTP-Zugang).
4. **Starten:** `docker compose up -d --build`

Caddy holt automatisch das HTTPS-Zertifikat. Die App läuft dann unter `https://termine.ihre-domain.de`. Auf dem Handy in Chrome öffnen und im Menü ⋮ **„App installieren“** tippen, dann läuft sie im Vollbild mit eigenem Symbol.

**Datensicherung:** Der Ordner `data/` enthält die Datenbank (`kaminfeger.sqlite`) und die hochgeladenen Dokumente. Sichern Sie ihn regelmäßig, z. B. täglich per `sqlite3 data/kaminfeger.sqlite ".backup backup.sqlite"`.

**Update:** `git pull && docker compose up -d --build`

### Ohne Docker

```bash
npm ci && npm run build
NODE_ENV=production BASE_URL=https://… APP_SECRET=… ADMIN_EMAILS=… SMTP_HOST=… npm start
```

Davor gehört ein Reverse-Proxy mit HTTPS (Caddy, nginx). Für die Live-Anzeige muss er Server-Sent Events durchreichen, d. h. `/api/events` nicht puffern.

## Konfiguration

| Variable | Bedeutung |
|---|---|
| `BASE_URL` | Öffentliche Adresse, wird in E-Mail-Links verwendet |
| `APP_SECRET` | Geheimnis für Code- und Session-Hashes (**Pflicht in Produktion**) |
| `ADMIN_EMAILS` | Kommagetrennte E-Mail-Adressen, die sich als Betreiber anmelden dürfen |
| `ALLOWED_EMAILS` | Testbetrieb: Nur diese Adressen (oder `@domain.de`) dürfen Codes anfordern und bekommen E-Mails. Leer = alle |
| `ALLOW_EARLY_ROUTE=1` | Route auch vor dem Termintag startbar (zum Testen der Live-Anzeige) |
| `OPERATOR_NAME`, `OPERATOR_ADDRESS`, `OPERATOR_EMAIL` | Angaben für Impressum und Datenschutzerklärung (`/impressum`, `/datenschutz`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | E-Mail-Versand. Ohne SMTP werden Mails nur ins Server-Log geschrieben |
| `PORT` (3000), `DATA_DIR` (`data`) | Port und Datenordner |
| `ADMIN_PASSKEY=optional` | Nur für lokale Tests: Betreiber ohne Passkey zulassen. Standard ist Passkey-Pflicht |
| `BACKUP_DIR`, `BACKUP_S3_BUCKET`, `BACKUP_S3_REGION` | Tägliche Sicherung (`deploy/backup.sh`), optional zusätzlich nach S3 |
| `BAFA_REGISTER_URL` | Link für „Im BAFA-Register prüfen“ bei selbst angegebenen Bezirken (Standard: Websuche nach der Registerauskunft) |
| `IP_CODES_PER_HOUR` (30), `IP_LOGINS_PER_HOUR` (60) | Obergrenzen pro Anschluss gegen Missbrauch |
| `TEST_MODE=1` | Testseite `/test` und Test-Postfach; Route auch vor dem Termintag startbar. **Nie in Produktion** |

**E-Mail-Zustellung:** Nutzen Sie einen Anbieter mit Servern in der EU (Brevo, Mailjet, Amazon SES Frankfurt) und richten Sie für Ihre Absender-Domain **SPF, DKIM und DMARC** ein, sonst landen die Codes im Spam.

## Start in den echten Betrieb

Siehe **[BETRIEB.md](BETRIEB.md)**: Start-Check (`npm run launch-check`), Startschalter (`deploy/go-live.sh`), Sicherung/Wiederherstellung, Überwachung und E-Mail über Brevo.

## CSV-Formate

Trennzeichen Semikolon oder Komma, UTF-8, erste Zeile = Spaltennamen. Vorlagen gibt es in der App bzw. unter `web/public/vorlagen/`.

**Bezirksverzeichnis** (Betreiber → Verzeichnis):
`bundesland; kreis; bezirk; name; email; betriebsadresse; bestellt_bis`
Der Freischaltlink geht an `email`. Das muss die Adresse aus dem amtlichen Verzeichnis sein, nicht eine, die der Kaminfeger selbst angibt.

**Kehrbuch** (Kaminfeger → Kehrbuch importieren):
`strasse; hausnummer; plz; ort; eigentuemer; kundennummer; email; telefon`
- `kundennummer`: damit bestätigen Bewohner ihren Wohnsitz sofort.
- `email`: beim Senden der Zeitfenster bekommt dieser Haushalt eine Einladung, der Link bestätigt den Wohnsitz.
- `telefon`: für „Anrufen“ bei offenen Haushalten.

Ein erneuter Import aktualisiert vorhandene Einträge.

## Wie die Prüfungen funktionieren

- **E-Mail:** 6-stelliger Code, gespeichert nur als Hash, 10 Minuten gültig, höchstens 5 Versuche, höchstens 6 Codes pro Stunde. Kein Passwort.
- **Kaminfeger:** Name und Bezirksnummer werden mit dem Bezirksverzeichnis abgeglichen. Der Betreiber sieht Urkunde und Ausweis (nur ansehen, mit Wasserzeichen) und hakt 4 Punkte ab. Nach der Entscheidung, spätestens nach 14 Tagen, werden die Dokumente gelöscht. Der Freischaltlink (48 h gültig) geht an die Verzeichnis-Adresse.
- **Bewohner:** entweder über die Kundennummer aus dem Kehrbuch, über den Einladungslink des Kaminfegers oder über eine Bestätigung durch den Kaminfeger. Kann er nicht bestätigen, wird der Eigentümer per E-Mail gefragt, sonst entscheidet der Betreiber. Bei dreimal falscher Kundennummer landet der Fall beim Betreiber.
- **Passkeys:** Anmeldung per Fingerabdruck, Gesicht oder Geräte-PIN (WebAuthn). Für den Betreiber Pflicht: nach dem ersten Entsperren per E-Mail-Code muss ein Passkey eingerichtet werden, danach wird kein E-Mail-Code mehr angenommen. Für Kaminfeger und Bewohner freiwillig (Profil bzw. Konto), der E-Mail-Code bleibt dort als Ausweg. Notfall (Gerät verloren): auf dem Server `npm run reset-passkeys -- name@example.de admin`.
- **Betreiber:** Login nur für `ADMIN_EMAILS`. Er wird nach 5 Minuten Inaktivität gesperrt. Das Protokoll hält fest, wer was entschieden hat, aber keine Dokumente.

## Noch nicht enthalten

- **Push-Mitteilungen** aufs Handy. Erinnerungen und Nachrichten kommen per E-Mail und live in der App.
- **Adresssuche:** Straßenvorschläge kommen vom öffentlichen OpenStreetMap-Dienst Photon (komoot). Für den Echtbetrieb eigenen Dienst oder Vertrag nutzen.
- **Rechtliches:** `/impressum` und `/datenschutz` sind als Vorlage enthalten – Betreiberangaben über `OPERATOR_*` setzen und vor einem echten Betrieb rechtlich prüfen lassen. Verträge zur Auftragsverarbeitung mit den Kaminfegern (Kehrbuch-Daten) fehlen noch.
- Screenshots von Dokumenten lassen sich im Browser technisch nicht verhindern. Die App zeigt nur einen Hinweis und ein Wasserzeichen.
