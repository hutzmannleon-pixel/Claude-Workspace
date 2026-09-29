# Betrieb: Start, Sicherung, Überwachung, E-Mail

Alles hier bezieht sich auf den Server `kaminfeger-verwaltung.com` (App in `/opt/kaminfeger/app`, Einstellungen in `/etc/kaminfeger.env`, Daten in `/opt/kaminfeger/data`).

## 1. Vor dem Start: Checkliste

| Punkt | Wie | Erledigt? |
|---|---|---|
| Impressum | `OPERATOR_NAME` und `OPERATOR_ADDRESS` (ladungsfähige Anschrift) in `/etc/kaminfeger.env` | |
| E-Mail an alle Adressen | Brevo einrichten (Abschnitt 5) – Amazon SES ist noch im Sandbox-Modus | |
| Betreiber-Passkey | `/betreiber` per Code entsperren → Passkey einrichten | |
| Echte Bezirke | `/betreiber` → Verzeichnis → CSV mit den echten Kehrbezirken hochladen | |
| Externe Sicherung | `BACKUP_S3_BUCKET` gesetzt (Abschnitt 3) | |
| Überwachung | E-Mail von AWS SNS bestätigt (Abschnitt 4) | |

Den Stand prüft der **Start-Check**. Er ändert nichts:

```
sudo /opt/kaminfeger/app/deploy/launch-check.sh
```

## 2. Startschalter

```
sudo /opt/kaminfeger/app/deploy/go-live.sh
```

Das macht der Startschalter:

1. Er entfernt die Test-Einstellungen aus `/etc/kaminfeger.env`: `ALLOWED_EMAILS`, `ALLOW_EARLY_ROUTE`, `TEST_MODE` und `ADMIN_PASSKEY`. Die alte Datei bleibt als `kaminfeger.env.vor-start-…` erhalten.
2. Er sichert die Datenbank nach `data/vor-start-….sqlite`.
3. Er entfernt den **Testbezirk** mit allem, was dazugehört. Als Testbezirk gilt das Bundesland „Testland“ oder die PLZ 99999. Entfernt werden:
   - Haushalte
   - Straßen-Runden und Termine
   - Nachrichten
   - die Kaminfeger- und Bewohner-Konten dieses Bezirks
4. Er startet die App neu und führt den Start-Check aus.

Was genau entfernt würde, zeigt vorher (ohne etwas zu ändern):
`cd /opt/kaminfeger/app && sudo -u kaminfeger env $(grep -E '^DATA_DIR=' /etc/kaminfeger.env) npm run go-live`

Das bleibt erhalten:
- der Betreiber-Zugang samt Passkey
- das Feedback
- das Protokoll
- alle echten Bezirke

## 3. Sicherung

- **Täglich um 03:15** (`kaminfeger-backup.timer`) läuft `deploy/backup.sh`:
  - Es erstellt eine konsistente Kopie der Datenbank und ein Archiv der hochgeladenen Dateien.
  - Beides landet in `/opt/kaminfeger/backups` und wird dort 14 Tage aufbewahrt.
- **Externe Sicherung:** Steht `BACKUP_S3_BUCKET=…` in `/etc/kaminfeger.env`, geht jede Sicherung zusätzlich in den S3-Bucket.
  - Der Bucket liegt in Frankfurt.
  - Die Dateien sind verschlüsselt, der Bucket ist privat.
  - Alte Sicherungen löscht der Bucket nach 90 Tagen automatisch.
- **Sofort sichern:** `sudo systemctl start kaminfeger-backup`
- **Zurückspielen:**
  - Der aktuelle Stand wird vorher aufgehoben.
  - Aus einer lokalen Sicherung:
    ```
    sudo /opt/kaminfeger/app/deploy/restore.sh /opt/kaminfeger/backups/kaminfeger-2026-10-01.sqlite
    ```
  - Aus S3:
    ```
    sudo /opt/kaminfeger/app/deploy/restore.sh s3://BUCKET/daily/kaminfeger-2026-10-01.sqlite
    ```

## 4. Überwachung

- **Health-Check:** Ein AWS-Route-53-Health-Check ruft alle 30 Sekunden `https://kaminfeger-verwaltung.com/api/health` auf.
- **Alarm:** Antwortet die Seite mehrmals hintereinander nicht, schickt AWS eine E-Mail an den Betreiber.
- **Einmalig bestätigen:** Nach dem Einrichten kommt eine Mail „AWS Notification – Subscription Confirmation“. Darin auf **Confirm subscription** klicken, sonst kommen keine Alarme.
- **Selbstheilung:** Der Server startet die App nach einem Absturz selbst neu (systemd). Den Status zeigt `systemctl status kaminfeger`.
- **Protokoll:** `journalctl -u kaminfeger -n 100`

## 5. E-Mail über Brevo einrichten

Amazon SES verschickt im Sandbox-Modus nur an bestätigte Adressen. Brevo (für deutsche Kunden: Brevo GmbH, Berlin) verschickt an alle Adressen. Die Server stehen in der EU, und es gibt einen AVV. Der kostenlose Tarif erlaubt 300 Mails pro Tag. Für den Start reicht das, bei mehr Nutzern braucht es den Starter-Tarif.

1. **Konto anlegen** auf brevo.com.
   - Firmen- bzw. Betreiberangaben eintragen.
   - Brevo prüft neue Konten manchmal kurz, dann kommt eine Mail.
2. **Domain hinzufügen:**
   - Pfad: Menü oben rechts (Profil) → **Senders, Domains & Dedicated IPs** → **Domains** → **Add a domain**.
   - `kaminfeger-verwaltung.com` eintragen.
   - „Authenticate the domain yourself“ wählen.
3. **DNS-Einträge bei IONOS anlegen:**
   - Brevo zeigt 3–4 Einträge an:
     - einen `TXT` mit `brevo-code:…`
     - DKIM, als `TXT` oder `CNAME` auf `brevo1._domainkey` / `brevo2._domainkey`
     - DMARC, `TXT` auf `_dmarc`
   - Diese Einträge bei IONOS unter **Domains & SSL → kaminfeger-verwaltung.com → DNS → Eintrag hinzufügen** exakt so übernehmen.
   - Ein vorhandener DMARC-Eintrag von Amazon SES wird **ersetzt**, nicht doppelt angelegt.
   - Danach in Brevo **Authenticate** klicken. Das kann bis zu einige Stunden dauern.
4. **Absender anlegen:** Unter **Senders** → `no-reply@kaminfeger-verwaltung.com` mit dem Namen „Kaminfeger Verwaltung“.
5. **SMTP-Schlüssel erzeugen:**
   - Pfad: **SMTP & API** → Reiter **SMTP** → **Generate a new SMTP key**.
   - Den Schlüssel **nicht in den Chat kopieren**. Ablegen im AWS-Parameter-Store (Region eu-north-1) als `SecureString` unter dem Namen `/kaminfeger/smtp-pass`.
   - Auf derselben Seite steht der **Login**, z. B. `8a1b2c001@smtp-brevo.com`. Den darf man weitergeben.
6. **Umschalten:** Dem Assistenten Bescheid geben. Er holt den Schlüssel aus dem Parameter-Store und stellt ein:
   ```
   SMTP_HOST=smtp-relay.brevo.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=<Login aus Schritt 5>
   SMTP_PASS=<aus dem Parameter-Store>
   ```
   Danach schickt er eine Testmail an eine fremde Adresse. Die Datenschutzerklärung nennt Brevo dann automatisch als Dienstleister.
7. **AVV:** Er ist Teil der Brevo-Nutzungsbedingungen (**Anhang 3 „Datenschutzvereinbarung (DSV)“**, TOM in Anhang 4) und gilt mit der Registrierung. Die Seite https://www.brevo.com/de/legal/termsofuse/ als PDF speichern und ablegen.

## 6. Updates einspielen

```
cd /opt/kaminfeger/app && sudo git pull && sudo npm ci && sudo npm run build && sudo npm prune --omit=dev \
  && sudo chown -R kaminfeger:kaminfeger . && sudo systemctl restart kaminfeger
```

- Neue Datenbank-Spalten legt die App beim Start selbst an.
- Wer die App während eines Updates offen hat, bekommt die neue Version automatisch.

## 7. Notfälle

| Problem | Lösung |
|---|---|
| Betreiber-Passkey verloren | `cd /opt/kaminfeger/app && sudo -u kaminfeger env $(grep -E '^(DATA_DIR\|APP_SECRET)=' /etc/kaminfeger.env \| xargs) npm run reset-passkeys -- E-Mail admin` → danach per E-Mail-Code entsperren und neuen Passkey einrichten |
| Seite nicht erreichbar | `systemctl status kaminfeger caddy`, `journalctl -u kaminfeger -n 100` |
| Falsche Daten nach Fehlbedienung | Sicherung vom Vortag zurückspielen (Abschnitt 3) |
