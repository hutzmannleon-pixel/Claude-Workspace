# Testdaten (frei erfunden)

Alle Namen, Adressen, Kundennummern und Telefonnummern sind erfunden. PLZ 99999 und Ort „Musterstadt“ gibt es nicht. E-Mail-Adressen sind absichtlich leer, damit keine Mail an Fremde gehen kann.

| Datei | Wofür | Wo importieren |
|---|---|---|
| `kundenliste-musterstadt.csv` | 7 Straßen, 60 Haushalte als Kundenliste eines Test-Betriebs | Kaminfeger-App → Mehr → Kundenliste importieren |

**Test-Betrieb anlegen:** In der Kaminfeger-App registrieren und als Betriebsadresse die **PLZ 99999** angeben (z. B. „Testweg 1, 99999 Musterstadt“). Als Nachweis genügt zum Testen ein beliebiges Foto – bitte kein echtes Ausweisdokument. Danach im Betreiber-Bereich freischalten.

**Als Bewohner registrieren:** Adresse aus der Datei (z. B. Birkenallee 5, 99999 Musterstadt) und die passende Kundennummer aus der Spalte `kundennummer`.

Ein erneuter Import aktualisiert vorhandene Einträge – bestehende Buchungen bleiben erhalten.

**Aufräumen vor dem echten Start:** `npm run go-live` zeigt, was entfernt würde; `npm run go-live -- --ausfuehren` entfernt alle Haushalte mit PLZ 99999 und alle Betriebe, die mit PLZ 99999 angemeldet sind.
