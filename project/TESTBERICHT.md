# Testbericht – Kaminfeger-Termine (Prototyp)
Stand: 28.09.2026 · automatisiert durchgeklickt in Demo.dc.html (3 Apps live verbunden)

## Ergebnis: 89 Prüfungen bestanden, 2 Fehler gefunden und behoben

### A · Kaminfeger-Registrierung & Betreiber-Prüfung
- Falscher Bezirk → Warnung, Weiter gesperrt ✓
- Ohne Dokumente/Häkchen kein Absenden ✓
- Betreiber: Freigeben erst nach 4 Häkchen ✓ · Dokument-Viewer ✓ · Dokumente nach Entscheidung gelöscht ✓
- Kaminfeger sieht Freigabe live → Freischaltlink → App ✓
- Ablehnung: Kaminfeger sieht Grund, Dokumente zurückgesetzt, erneut einreichen, wieder in Prüfliste ✓
- Rückfrage an Behörde/Innung ✓ · Ablehnen ohne Grund gesperrt ✓ · Protokoll ✓

### B · Zeitfenster & Buchung
- Zeitfenster bearbeiten, Slot-Vorschau, senden → Kunde bekommt Nachricht ✓
- Kunde registrieren (PLZ-Prüfung, Bezirk erkannt, E-Mail-Code, Kundennummer) ✓
- Vergebene Slots gesperrt (5/8) ✓ · Schlüssel beim Nachbarn ✓ · Kalender ✓
- Kaminfeger sieht Buchung sofort in der Route ✓

### C · Termintag
- Route starten → Kunde sieht „2 Häuser entfernt“ → „jetzt bei Ihnen“ ✓
- „Niemand da“ → Kunde bekommt Nachricht + „Neue Zeit wählen“ → neu gebucht ✓

### D/E · Änderungen & Kommunikation
- Verschieben (anderer Tag) ✓ · Absagen → „Lieber verschieben“ ✓ · Trotzdem absagen ✓
- Kaminfeger sieht Absage, ruft an, trägt Zeit telefonisch ein ✓
- „Offene erinnern“ und Verspätungs-Nachricht an Route ✓

### F · Profil
- Mitbewohner einladen ✓ · Benachrichtigungen ✓ · Umzug melden → Zugang beendet ✓
- Abmelden → Willkommen · Anmelden per E-Mail-Code ✓

### G · Mieter-Bestätigung
- Betreiber fragt Kaminfeger → Anfrage erscheint beim Kaminfeger → „Ja, wohnt dort“ → Protokoll ✓
- Bestätigungs-E-Mail erneut senden ✓

### H · Alternative Registrierungen
- Einladungslink vom Kaminfeger (2 statt 3 Schritte) ✓
- Adresse ohne teilnehmenden Kaminfeger (Berlin) ✓
- „Vom Kaminfeger bestätigen lassen“ per E-Mail ✓

## Behobene Fehler
1. „an 1 Haushalte“ → jetzt „1 Haushalt“ (Nachrichten beim Kaminfeger)
2. Adresse ohne teilnehmenden Kaminfeger bot trotzdem Kaminfeger-Bestätigung an → Konto wird angelegt, Wohnsitz später bestätigt

## Grenzen des Prototyps (für den Server relevant)
- Keine echten Konten: jeder eingeloggte Kunde ist „Familie Keller, Lindenstraße 7“
- Codes/Links werden nicht geprüft (jede 6-stellige Zahl gilt)
- Kehrbuch, Bezirksverzeichnis und Dokument-Upload sind simuliert
- Daten liegen nur im Browser (localStorage), nicht geräteübergreifend
- Adresssuche nutzt den öffentlichen OpenStreetMap-Dienst (Photon) – für Produktion eigenen Dienst/Vertrag nutzen
