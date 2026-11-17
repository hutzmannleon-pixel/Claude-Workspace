# Kaminfeger Verwaltung

Der Kaminfeger gibt pro Straße Zeitfenster frei, die Bewohner wählen die halbe Stunde, in der sie zu Hause sind. So steht er seltener vor verschlossenen Türen.

Die App ist für die **freien Arbeiten** gedacht: Kehren, Überprüfen und Messen. Amtliche Aufgaben des Bezirksschornsteinfegers – vor allem die **Feuerstättenschau** – laufen nicht über die App. Deshalb gibt es keine Kehrbezirke: Mitmachen kann jeder Betrieb aus dem Schornsteinfegerregister, und er lädt seine **eigene Kundenliste** hoch, nicht das Kehrbuch.

Die App besteht aus drei Teilen, die über einen gemeinsamen Server live verbunden sind:

| Adresse | Für wen | Was |
|---|---|---|
| `/kunde` | Bewohner | Registrieren (Adresse, E-Mail-Code, Wohnsitz-Nachweis), Zeit buchen, verschieben/absagen, live sehen, wie weit der Kaminfeger weg ist, Nachrichten, Profil |
| `/kaminfeger` | Kaminfeger-Betriebe | Betrieb anmelden mit Nachweis, Kundenliste importieren, Zeitfenster pro Straße (mit Art der Arbeit), Tagesroute, Nachrichten, Mieter bestätigen |
| `/betreiber` | Sie als Betreiber | Betriebe (Abgleich mit dem Schornsteinfegerregister) und Bewohner prüfen, Nachweis ansehen (danach gelöscht), Protokoll, Vorschau, Feedback lesen |
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
  public/vorlagen/  CSV-Vorlage für die Kundenliste
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

1. Kaminfeger: Betrieb anmelden (zum Testen mit PLZ 99999) und als Nachweis ein beliebiges Foto hochladen.
2. Betreiber: mit `ich@example.de` entsperren – den Code finden Sie im Test-Postfach links –, den Betrieb prüfen und freischalten. Er ist sofort aktiv.
3. Kaminfeger: Kundenliste (CSV, Beispiel in `testdaten/`) importieren und dabei bestätigen, dass es eigene Kundendaten sind.
4. Kaminfeger: Zeitfenster für eine Straße anlegen, Art der Arbeit wählen und senden.
5. Bewohner: mit einer Adresse aus der Kundenliste registrieren, Kundennummer eingeben, Zeit buchen.
6. Kaminfeger: Route starten und Häuser abhaken. Der Bewohner sieht live „2 Häuser entfernt“.

„Alles löschen“ auf der Testseite setzt die Datenbank zurück.

**Entwicklung mit Hot-Reload:** `npm run dev` (Web unter http://localhost:5173, API auf Port 3000).
**Tests:** `npm test` spielt 38 Szenarien gegen temporäre Datenbanken durch.

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
| `ADMIN_PASSKEY=required` | Betreiber nur noch per Passkey (kein E-Mail-Code mehr, sobald einer eingerichtet ist). Standard: E-Mail-Code immer möglich, Passkey freiwillig |
| `BACKUP_DIR`, `BACKUP_S3_BUCKET`, `BACKUP_S3_REGION` | Tägliche Sicherung (`deploy/backup.sh`), optional zusätzlich nach S3 |
| `BAFA_REGISTER_URL` | Link für „Im BAFA-Register prüfen“ bei der Prüfung eines Betriebs (Standard: Websuche nach der Registerauskunft) |
| `IP_CODES_PER_HOUR` (30), `IP_LOGINS_PER_HOUR` (60) | Obergrenzen pro Anschluss gegen Missbrauch |
| `TEST_MODE=1` | Testseite `/test` und Test-Postfach; Route auch vor dem Termintag startbar. **Nie in Produktion** |

**E-Mail-Zustellung:** Nutzen Sie einen Anbieter mit Servern in der EU (Brevo, Mailjet, Amazon SES Frankfurt) und richten Sie für Ihre Absender-Domain **SPF, DKIM und DMARC** ein, sonst landen die Codes im Spam.

## Start in den echten Betrieb

Ausführliche Gesamtdokumentation (Bedienung, Betrieb, Technik): **[DOKUMENTATION.md](DOKUMENTATION.md)**, auch als PDF.

Siehe **[BETRIEB.md](BETRIEB.md)**: Start-Check (`npm run launch-check`), Startschalter (`deploy/go-live.sh`), Sicherung/Wiederherstellung, Überwachung und E-Mail über Brevo.

## CSV-Formate

Trennzeichen Semikolon oder Komma, UTF-8, erste Zeile = Spaltennamen. Vorlagen gibt es in der App bzw. unter `web/public/vorlagen/`.

**Kundenliste** (Kaminfeger → Mehr → Kundenliste importieren):
`strasse; hausnummer; plz; ort; kunde; kundennummer; email; telefon`
- Nur eigene Kundendaten des Betriebs – nicht das Kehrbuch eines Kehrbezirks. Das bestätigt der Kaminfeger bei jedem Import.
- `kundennummer`: damit bestätigen Bewohner ihren Wohnsitz sofort.
- `email`: beim Senden der Zeitfenster bekommt dieser Haushalt eine Einladung, der Link bestätigt den Wohnsitz.
- `telefon`: für „Anrufen“ bei offenen Haushalten.

Ein erneuter Import aktualisiert vorhandene Einträge.

## Wie die Prüfungen funktionieren

- **E-Mail:** 6-stelliger Code, gespeichert nur als Hash, 10 Minuten gültig, höchstens 5 Versuche, höchstens 6 Codes pro Stunde. Kein Passwort.
- **Kaminfeger-Betriebe:** Der Betreiber vergleicht Betrieb, Anschrift und Inhaber/in mit dem Schornsteinfegerregister des BAFA, sieht den Nachweis (Handwerkskarte oder Ausweis; nur ansehen, mit Wasserzeichen) und hakt 3 Punkte ab. Mit der Freigabe ist der Betrieb sofort freigeschaltet. Nach der Entscheidung, spätestens nach 14 Tagen, wird der Nachweis gelöscht.
- **Bewohner:** entweder über die Kundennummer aus der Kundenliste (sie steht auf der Rechnung des Kaminfegers), über den Einladungslink des Kaminfegers oder über eine Bestätigung durch den Kaminfeger. Kann er nicht bestätigen, wird der Eigentümer per E-Mail gefragt, sonst entscheidet der Betreiber. Bei dreimal falscher Kundennummer landet der Fall beim Betreiber.
- **Passkeys:** Anmeldung per Fingerabdruck, Gesicht oder Geräte-PIN (WebAuthn). Für alle freiwillig (Profil, Konto bzw. Betreiber → Passkeys), der E-Mail-Code geht immer. Mit `ADMIN_PASSKEY=required` wird der Passkey für Betreiber wieder Pflicht. Notfall (Gerät verloren): auf dem Server `npm run reset-passkeys -- name@example.de admin`.
- **Betreiber:** Login nur für `ADMIN_EMAILS`. Er wird nach 5 Minuten Inaktivität gesperrt. Das Protokoll hält fest, wer was entschieden hat, aber keine Dokumente.

## Noch nicht enthalten

- **Push-Mitteilungen** aufs Handy. Erinnerungen und Nachrichten kommen per E-Mail und live in der App.
- **Adresssuche:** Straßenvorschläge kommen vom öffentlichen OpenStreetMap-Dienst Photon (komoot). Für den Echtbetrieb eigenen Dienst oder Vertrag nutzen.
- **Rechtliches:** `/impressum` und `/datenschutz` sind als Vorlage enthalten – Betreiberangaben über `OPERATOR_*` setzen und vor einem echten Betrieb rechtlich prüfen lassen. Verträge zur Auftragsverarbeitung mit den Kaminfeger-Betrieben (Kundenlisten) fehlen noch. Die Abgrenzung zu den amtlichen Aufgaben (Feuerstättenschau, Kehrbuch) beruht auf Recherche und sollte von Innung oder Anwalt bestätigt werden.
- Screenshots von Dokumenten lassen sich im Browser technisch nicht verhindern. Die App zeigt nur einen Hinweis und ein Wasserzeichen.
