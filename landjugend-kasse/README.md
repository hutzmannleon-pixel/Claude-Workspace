# Landjugend-Kasse

Kassenbuch für die Landjugend: Bankkonto und Barkasse führen, Zahlungen erfassen, Belege hochladen und prüfen, Zahlungen den Belegen oder Kostenstellen zuordnen und Auslagen erstatten. Mehrere Vorstände arbeiten gleichzeitig im Browser, auch vom Handy.

Funktionen und Abläufe orientieren sich am Kassen-Bereich von campflow (Zahlungen + Belege). Name und Gestaltung sind eigenständig.

## Was die Kasse kann

**Zahlungen**
- Konten oben als Karten: Bankkonten und Barkassen mit aktuellem Stand (Anfangsbestand + alle Zahlungen). Klick auf eine Karte filtert die Liste.
- *Zahlung erfassen*: Ein- oder Ausgang mit Betrag, Datum, Konto, Name und Verwendungszweck (Bankumsätze werden von Hand eingetragen).
- *Umbuchung*: Geld zwischen eigenen Konten verschieben, z. B. Bargeld zur Bank. Beide Seiten werden angelegt und gelten als erledigt.
- Klick auf eine Zahlung öffnet die **Zuordnung**:
  - passende Belege mit *Zuordnen* verknüpfen (auch mehrere Belege für eine Zahlung oder eine Teilzahlung)
  - über das Plus: *Beleg hochladen*, *Eigenbeleg ohne Datei*, *Spende*, *Zuschuss* oder *Etwas anderes* direkt auf Kostenstelle/Kategorie buchen
  - Status je Zahlung: nicht, teilweise oder vollständig zugeordnet
- Suche, Zeitraum (Monat, Jahr, Vorjahr) und „Zugeordnete ausblenden“.

**Belege**
- Hochladen per Knopf oder Drag & Drop (PDF, JPG, PNG). Fotos werden vor dem Hochladen verkleinert.
- **Ungeprüfte Belege**: Neue Belege landen erst hier. Beim Prüfen werden Art (Ausgabe/Einnahme), Beschreibung, Betrag, Datum, Auslage sowie Kostenstellen und Kategorien eingetragen, auf Wunsch auf mehrere Kostenstellen aufgeteilt. Beim Speichern bekommt der Beleg eine fortlaufende Nummer je Jahr (2026-1, 2026-2 …).
- Neue Kostenstellen oder Kategorien einfach eintippen, sie werden dann automatisch angelegt.
- **Mit dem Handy** (QR-Code + PIN):
  - *Für mich*: Code scannen, Beleg fotografieren, fertig.
  - *Für mein Team*: Link mit PIN weitergeben. Mitglieder laden Belege mit Name, Betrag und „privat bezahlt“ hoch, ohne eigenes Konto. Der Link lässt sich ein- und ausschalten oder neu erzeugen.
- **Auslagen**: Ein Hinweis zeigt offene Auslagen („Ihr müsst noch 2 Auslagen in Höhe von 107,89 € an 2 Personen erstatten“). *Auslagen erstatten* bucht die Auszahlung (bar oder per Überweisung) und ordnet sie den Belegen zu.
- Filter nach Kostenstelle, Belegart und Status. Der Punkt rechts zeigt: leer = offen, halb = teilweise bezahlt, voll = erledigt.

**Einstellungen**: Vereinsname, Konten, Kostenstellen (mit Farbe), Kategorien, Zugänge (Admin oder normal) und das eigene Passwort.

## Aufbau

```
server/          Node.js (Fastify) + SQLite (in Node eingebaut, node:sqlite)
  routes/        account (Einrichtung, Login, Nutzer), kasse (Konten, Zahlungen, Belege), upload (Handy-Links)
  test/          Integrationstest aller Abläufe (npm test)
web/             React-App (Vite)
data/            Datenbank kasse.sqlite + Ordner belege/ (wird beim Start angelegt)
```

Alle Beträge werden in Cent gespeichert, sodass keine Rundungsfehler entstehen. Hochgeladene Dateien werden anhand ihres Inhalts geprüft: Angenommen werden nur PDF und Bilder.

## Lokal ausprobieren

Voraussetzung: Node.js 22.13 oder neuer.

```bash
cd landjugend-kasse
npm install
npm run dev        # Server auf :3000, Oberfläche auf http://localhost:5173
npm test           # Integrationstest
```

Beim ersten Aufruf richtest du die Kasse ein: Vereinsname, dein Name, E-Mail und Passwort. Dabei wird eine Barkasse angelegt. Das Bankkonto fügst du über das Plus bei den Konten hinzu. Weitere Vorstände legst du unter *Einstellungen → Nutzer:innen → Einladen* mit einem Start-Passwort an.

## Auf einem Server betreiben

Du brauchst einen kleinen Linux-Server mit Docker und eine (Sub-)Domain, die auf ihn zeigt.

```bash
cd landjugend-kasse
cp .env.example .env      # DOMAIN, BASE_URL und APP_SECRET eintragen
docker compose up -d --build
```

Caddy holt automatisch ein HTTPS-Zertifikat. Danach ist die Kasse unter `https://<deine-domain>` erreichbar.
`BASE_URL` muss stimmen, weil diese Adresse im QR-Code für das Hochladen per Handy steckt.

**Sicherung:** Alles Wichtige liegt in `landjugend-kasse/data/` (Datenbank und Belege). Den Ordner regelmäßig sichern, z. B. nachts per `rsync` auf einen anderen Rechner.
Für eine konsistente Sicherung im laufenden Betrieb (eine vorhandene `data/backup.sqlite` vorher löschen):

```bash
docker compose exec app node -e "new (require('node:sqlite').DatabaseSync)('data/kasse.sqlite').exec(\"VACUUM INTO 'data/backup.sqlite'\")"
```

**Update:** `git pull && docker compose up -d --build`

## Betrieb auf dem Kaminfeger-Server

Die Kasse läuft auf demselben EC2-Server wie die Kaminfeger-Verwaltung (`i-0ba1ee2f39dff0ff1`, eu-north-1), aber komplett getrennt:

| Teil | Wo |
|---|---|
| Adresse | https://kasse.landjugend-reinstetten.com (DNS bei IONOS: A-Eintrag `kasse` → 13.61.247.225) |
| Dienst | `landjugend-kasse` (systemd, Benutzer `landjugend`, Port 3101 nur lokal) |
| Code | `/opt/landjugend/app/landjugend-kasse` |
| Daten | `/opt/landjugend/data` (`kasse.sqlite` + `belege/`) |
| Einstellungen | `/etc/landjugend-kasse.env` (`APP_SECRET` nie ändern) |
| HTTPS | Caddy: eigene Datei `/etc/caddy/landjugend-kasse.caddy`, im `Caddyfile` nur `import` |
| Sicherung | täglich 03:40 UTC nach `/opt/landjugend/backups` (14 Tage) und S3 `…/landjugend/` |

Zugang über AWS Session Manager. **Update** (Code holen, bauen, neu starten; Daten bleiben):

```
curl -fsSL https://raw.githubusercontent.com/hutzmannleon-pixel/Claude-Workspace/<branch>/landjugend-kasse/deploy/install.sh -o /root/landjugend-install.sh
sudo DOMAIN=kasse.landjugend-reinstetten.com BRANCH=<branch> bash /root/landjugend-install.sh
```

Status und Protokoll: `systemctl status landjugend-kasse`, `journalctl -u landjugend-kasse -n 100`.

## Bewusst (noch) nicht enthalten

- Automatischer Abruf der Bankumsätze. Zahlungen werden von Hand erfasst. Ein CSV-Import aus dem Online-Banking ließe sich später ergänzen.
- Auswertungen (Kassenbericht, EÜR, Export), Mitglieder, Beiträge, Events und Rundmails.
