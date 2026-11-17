# Kaminfeger Verwaltung – Dokumentation

Stand: November 2026 · Betreiber: Leon Hutzmann · https://kaminfeger-verwaltung.com

Diese Dokumentation hat drei Teile:

1. **Bedienung** – was Bewohner, Kaminfeger und du als Betreiber in der App sehen und tun.
2. **Betrieb & Notfälle** – Server, Sicherung, Überwachung, E-Mail, Updates und was bei Problemen zu tun ist.
3. **Technik** – Aufbau des Codes, Datenbank, Schnittstellen und Tests, für dich oder einen späteren Entwickler.

---

## Inhalt

- [Teil 1 – Bedienung](#teil-1--bedienung)
  - [1.1 Worum es geht](#11-worum-es-geht)
  - [1.2 Die drei Apps auf einen Blick](#12-die-drei-apps-auf-einen-blick)
  - [1.3 Anmeldung: E-Mail-Code und Passkey](#13-anmeldung-e-mail-code-und-passkey)
  - [1.4 Bewohner-App](#14-bewohner-app-kunde)
  - [1.5 Kaminfeger-App](#15-kaminfeger-app-kaminfeger)
  - [1.6 Betreiber-App](#16-betreiber-app-betreiber)
  - [1.7 Ein kompletter Ablauf von Anfang bis Ende](#17-ein-kompletter-ablauf-von-anfang-bis-ende)
  - [1.8 Alle E-Mails, die die App verschickt](#18-alle-e-mails-die-die-app-verschickt)
  - [1.9 Regeln und Fristen](#19-regeln-und-fristen)
- [Teil 2 – Betrieb & Notfälle](#teil-2--betrieb--notfälle)
- [Teil 3 – Technik für Entwickler](#teil-3--technik-für-entwickler)

---

# Teil 1 – Bedienung

## 1.1 Worum es geht

Wenn der Kaminfeger zum Kehren, Überprüfen oder Messen kommt, steht er oft vor verschlossenen Türen. Die App löst das so:

- Der **Kaminfeger** gibt pro Straße ein bis drei **Zeitfenster** frei (z. B. „Di 8–12 Uhr“) und sagt dazu, **was ansteht** (z. B. „Kehren und Überprüfen“).
- Die **Bewohner** wählen darin die halbe Stunde, in der sie zu Hause sind.
- Am Termintag startet der Kaminfeger seine **Route**. Die Bewohner sehen **live**, wie viele Häuser er noch entfernt ist.

Du als **Betreiber** prüfst, dass nur echte Kaminfeger-Betriebe und echte Bewohner Zugang bekommen.

### Wofür die App da ist – und wofür nicht

Die App ist für die **freien Arbeiten** gedacht: **Kehren, Überprüfen und Messen**. Diese Arbeiten darf jeder zugelassene Kaminfeger-Betrieb ausführen, und der Kunde sucht sich seinen Betrieb selbst aus.

**Nicht über die App** laufen die **amtlichen (hoheitlichen) Aufgaben** des bevollmächtigten Bezirksschornsteinfegers, vor allem die **Feuerstättenschau**, der **Feuerstättenbescheid** und die **Bauabnahme**. Deshalb gilt in der App:

| Regel | Warum |
|---|---|
| Es gibt **keine Kehrbezirke** mehr. Mitmachen kann jeder Betrieb, der im Schornsteinfegerregister steht. | Für freie Arbeiten ist kein Kehrbezirk nötig. Ein Bezirksschornsteinfeger darf für seine privaten Leistungen auch nicht mit seinem Amt werben. |
| Der Kaminfeger lädt seine **eigene Kundenliste** hoch – **nicht das Kehrbuch**. Das bestätigt er bei jedem Import mit einem Haken. | Kehrbuch-Daten dürfen nur für amtliche Aufgaben verwendet werden (§ 19 Abs. 5 SchfHwG). |
| Als „Art der Arbeit“ lassen sich **Feuerstättenschau, Feuerstättenbescheid und Bauabnahme nicht eintragen**. | Das sind amtliche Aufgaben. |
| Bewohner sehen den **Betrieb**, nicht einen „Kehrbezirk“. | Die Zuordnung läuft über die Kundenliste des Betriebs. |

> **Wichtig:** Diese Einordnung beruht auf einer Recherche, nicht auf einer Rechtsberatung. Lass sie vor einem großen Start von der Schornsteinfeger-Innung oder einem Anwalt bestätigen.

## 1.2 Die drei Apps auf einen Blick

| Adresse | Für wen | Farbe | Hauptaufgaben |
|---|---|---|---|
| `/` | alle | Orange | Startseite mit „Ich bin Bewohner“ / „Ich bin Kaminfeger“ und Link zum Betreiber-Zugang |
| `/kunde` | Bewohner | Bernstein | Registrieren, Wohnsitz bestätigen, Zeit buchen, verschieben/absagen, live verfolgen, Nachrichten, Mitbewohner einladen |
| `/kaminfeger` | Kaminfeger-Betrieb | Glut-Orange | Betrieb anmelden mit Nachweis, Kundenliste importieren, Zeitfenster pro Straße (mit Art der Arbeit), Tagesroute, Nachrichten, Mieter bestätigen, Straße abschließen |
| `/betreiber` | du | Himbeere | Betriebe und Bewohner prüfen, Protokoll, Vorschau mit Beispieldaten, Feedback |
| `/impressum`, `/datenschutz` | alle | – | Rechtstexte, automatisch mit deinen Betreiberangaben |
| `/eigentuemer/…` | Hauseigentümer | – | Ja/Nein-Seite aus einer E-Mail: „Wohnt Familie X bei Ihnen?“ |

**Auf dem Handy** haben alle Apps unten eine Reiterleiste. **Am Desktop** (ab 1024 px Breite) zeigen Kaminfeger- und Betreiber-App links eine Seitenleiste, daneben eine Liste und rechts die Details. Die Bewohner-App erscheint am Desktop als Handy-Karte in der Mitte.

**Als App installieren:** Im Handy-Browser (Chrome: Menü ⋮ → „App installieren“, Safari: Teilen → „Zum Home-Bildschirm“) läuft die Seite im Vollbild mit eigenem Symbol.

**Feedback-Knopf:** Auf jeder Seite unten rechts (am Desktop in der Seitenleiste) gibt es eine Sprechblase. Sie macht ein Bild der aktuellen Ansicht. Der Nutzer zieht einen Rahmen um die betroffene Stelle und schreibt etwas dazu. Ohne Anmeldung kann er freiwillig eine E-Mail für Rückfragen angeben. Alles landet bei dir unter **Feedback**.

## 1.3 Anmeldung: E-Mail-Code und Passkey

Es gibt **keine Passwörter**.

- **E-Mail-Code:** Man gibt seine E-Mail ein und bekommt einen 6-stelligen Code. Er gilt 10 Minuten, erlaubt höchstens 5 Versuche und höchstens 6 Codes pro Stunde und Adresse.
- **Passkey:** Anmeldung per Fingerabdruck, Gesicht oder Geräte-PIN. Für alle freiwillig. Auch Betreiber können sich **immer** mit dem E-Mail-Code anmelden. Wer einen Passkey eingerichtet hat, kann wahlweise ihn nutzen. (Mit `ADMIN_PASSKEY=required` lässt sich die alte Passkey-Pflicht für Betreiber wieder einschalten.)
- **Angemeldet bleiben:** Bewohner und Kaminfeger bleiben 60 Tage angemeldet. Der Betreiber-Bereich sperrt sich nach **5 Minuten** ohne Aktivität.
- **Getrennte Rollen:** Bewohner, Kaminfeger und Betreiber sind getrennte Konten, auch mit derselben E-Mail. Man kann im selben Browser gleichzeitig in mehreren Apps angemeldet sein.

## 1.4 Bewohner-App (`/kunde`)

### Registrieren

Es gibt drei Wege:

1. **Mit Einladungslink** (häufigster Fall). Steht in der Kundenliste eine E-Mail, bekommt der Haushalt beim Anlegen der Zeitfenster automatisch eine Einladung. Mit dem Link ist der Wohnsitz **sofort bestätigt**. Er gilt 30 Tage und nur einmal.
2. **Selbst registrieren:**
   - Adresse eingeben. Die Straße wird beim Tippen vorgeschlagen, der Vorschlagsdienst ist Photon/OpenStreetMap.
   - Die App zeigt sofort, ob ein Kaminfeger die App für diese Adresse nutzt. **Welcher Betrieb** das ist, erfährt man erst, wenn der Wohnsitz bestätigt ist – wer bei wem Kunde ist, geht Fremde nichts an.
   - Danach E-Mail-Code eingeben.
3. **Als Mitbewohner:** Ein bestätigter Bewohner lädt über **Profil → Mitbewohner einladen** jemanden ein. Der Link gilt 14 Tage. Eingeladene sehen den Termin und bekommen Erinnerungen, ohne eigene Adressprüfung. Es sind höchstens 5 offene Einladungen gleichzeitig möglich.

### Wohnsitz bestätigen („Wohnen Sie wirklich hier?“)

Nach dem Selbst-Registrieren muss der Bewohner zeigen, dass er dort wohnt:

| Weg | Ablauf |
|---|---|
| **Kundennummer** | Steht auf der Rechnung des Kaminfegers. Passt sie zur Kundenliste, ist der Wohnsitz sofort bestätigt. Nach **3 falschen Versuchen** landet der Fall bei dir, nach 5 Versuchen ist die Eingabe gesperrt. |
| **Kaminfeger fragen** | Für Mieter ohne Kundennummer. Der Kaminfeger bekommt eine E-Mail und eine Anfrage in seiner App: „Wohnt X in der Y?“ |
| ↳ Kaminfeger sagt „Nein/weiß nicht“ | Steht eine E-Mail in der Kundenliste, wird der **Eigentümer** per E-Mail gefragt (Link gilt 14 Tage). Sonst geht der Fall an **dich**. |

Führt noch kein Betrieb die Adresse in der App, wird das Konto trotzdem angelegt. Sobald ein Kaminfeger eine Kundenliste mit dieser Adresse importiert, wird der Bewohner automatisch zugeordnet und per E-Mail gebeten, seinen Wohnsitz zu bestätigen.

**Zwei Betriebe, dieselbe Adresse:** Steht eine Adresse in den Kundenlisten mehrerer Betriebe, entscheidet die Kundennummer, zu welchem Betrieb der Haushalt gehört. Ein bestätigter Bewohner kann außerdem im **Profil** zum anderen Betrieb wechseln (nicht, solange ein Termin offen ist).

### Start-Seite

- **Nächster Termin** mit Datum, Uhrzeit, Art der Arbeit (z. B. „Kehren“) und Status, oder „Bitte Zeit wählen“, wenn noch nichts gebucht ist.
- **Kacheln:** Termin, Nachrichten, Leistungen, Profil.
- **Ihr Kaminfeger** mit Betriebsname und Anruf-Knopf.
- **Nach einer abgeschlossenen Runde:** „Erledigt – vielen Dank!“ mit dem Datum.

### Termin buchen

1. **Tag wählen.** Es erscheinen nur Tage aus den Zeitfenstern des Kaminfegers, mit Anzahl freier Zeiten.
2. **Uhrzeit wählen.** Die Slots sind 20, 30 oder 45 Minuten lang, je nach Einstellung des Kaminfegers. Belegte Zeiten sind gesperrt.
3. **Optional:** „Schlüssel bei …“ eintragen, z. B. beim Nachbarn.
4. **Prüfen und bestätigen.** Es kommt eine Bestätigungs-E-Mail. Der Termin lässt sich als Kalendereintrag (.ics) speichern.

**Verschieben und absagen** geht in der App **bis zum Vortag**. Am Termintag zeigt die App stattdessen die Telefonnummer des Kaminfegers. Tage, die schon zu nah sind, stehen als „nicht mehr buchbar“ da. Wurde man „nicht angetroffen“, darf man auch danach neu buchen.

### Live-Anzeige am Termintag

Sobald der Kaminfeger seine Route startet, zeigt die App alle Häuser der Route. Das eigene Haus ist markiert, dazu kommt „noch 2 Häuser entfernt“. Die Anzeige aktualisiert sich von selbst.

### Weitere Bereiche

- **Nachrichten – Messenger mit dem Kaminfeger:** Ein Chat wie bei WhatsApp. Darin stehen die Rundnachrichten des Kaminfegers an die Straße (markiert mit „An alle in der Straße“) und die persönliche Unterhaltung. Bestätigte Bewohner können jederzeit selbst schreiben, z. B. „Der Schlüssel liegt beim Nachbarn“. Haken zeigen, ob der Kaminfeger die Nachricht gelesen hat (✓ gesendet, ✓✓ gelesen). Mitbewohner sehen denselben Chat.
- **Leistungen:** Erklärt Kehren, Überprüfen und Messen und verweist für die Fristen auf den Feuerstättenbescheid. Ein Hinweis stellt klar: Die Feuerstättenschau macht der Bezirksschornsteinfeger, dafür meldet er sich direkt – nicht über die App. Beim Termin gibt es eine Checkliste zur Vorbereitung: Zugang zu Heizraum und Dachboden freihalten, Ofen ab dem Vorabend nicht heizen, Haustiere wegsperren.
- **Profil:**
  - Haushalt und Mitbewohner einladen
  - Kaminfeger wechseln, falls mehrere Betriebe die Adresse führen
  - Passkey einrichten
  - Benachrichtigungen: Erinnerung am Vorabend (18 Uhr) und/oder eine Stunde vorher
  - **Umzug melden:** Offene Termine werden storniert, der Kaminfeger wird informiert, und danach kann man eine neue Adresse angeben.
  - Abmelden
  - **Konto löschen:** Zur Bestätigung „LÖSCHEN“ eintippen.

## 1.5 Kaminfeger-App (`/kaminfeger`)

### Betrieb anmelden und freischalten lassen

1. **Betrieb:** Vorname, Nachname, optional Name des Betriebs, Betriebsadresse, Telefon und E-Mail-Code. Die Angaben sollen so sein, wie der Betrieb im **Schornsteinfegerregister** steht.
2. **Nachweis:**
   - **Handwerkskarte oder Schornsteinfeger-Ausweis** hochladen (PDF/Foto, max. 10 MB). Ein Dokument genügt.
   - Die Erklärung bestätigen: Der Betrieb steht im Register und nutzt die App nur für freie Arbeiten, nicht für die Feuerstättenschau.
   - Der Nachweis wird nach deiner Entscheidung, **spätestens nach 14 Tagen**, gelöscht.
3. **Warten auf die Prüfung.** Du bekommst eine E-Mail „Neue Prüfung“.
4. **Freischaltung:** Sobald du freigibst, ist der Betrieb **sofort** freigeschaltet. Er bekommt die E-Mail „Ihr Betrieb ist freigeschaltet“. Einen zusätzlichen Freischaltlink gibt es nicht mehr.

Bei einer Ablehnung sieht der Kaminfeger den Grund und kann einen neuen Nachweis hochladen.

### Kundenliste importieren

**Mehr → Kundenliste importieren**, CSV-Datei. Eine Vorlage zum Herunterladen gibt es in der App.

```
strasse; hausnummer; plz; ort; kunde; kundennummer; email; telefon
```

- **Vor jedem Import** setzt der Kaminfeger einen Haken: „Das sind die Kundendaten meines eigenen Betriebs – nicht das Kehrbuch eines Kehrbezirks.“ Ohne Haken geht der Import nicht. Die Bestätigung steht danach im Protokoll.
- Pflicht sind Straße, Hausnummer, PLZ und Kunde (Name). Die alte Spaltenüberschrift `eigentuemer` wird weiter erkannt.
- `kundennummer` erlaubt Bewohnern die Sofort-Bestätigung.
- `email` löst beim Anlegen von Zeitfenstern automatisch eine Einladung aus.
- `telefon` ermöglicht „Anrufen“ bei offenen Haushalten.
- Ein erneuter Import **aktualisiert** vorhandene Häuser, Buchungen bleiben erhalten. Fehlerhafte Zeilen werden übersprungen und angezeigt.
- Jeder Betrieb sieht **nur seine eigene** Kundenliste.

### Start-Seite

- **Heute / Nächster Termin:** Route, Uhrzeit und Anzahl Termine.
- **Bewohner-Anfragen:** „Wohnt X in der Y?“ mit Ja/Nein.
- **Kacheln:** Termine (Tagesroute), Kunden, Straßen (rote Zahl = Straßen ohne Zeitfenster), Nachrichten (rote Zahl = ungelesene Chats).

### Straßen und Zeitfenster

Jede Straße aus der Kundenliste hat einen von drei Zuständen:

| Zustand | Bedeutung | Aktion |
|---|---|---|
| **Entwurf** | noch keine Zeitfenster | „Zeitfenster anlegen“ |
| **läuft** | Runde aktiv, mit Balken: bestätigt / offen / abgesagt | Straße öffnen |
| **alles erledigt** | alle Häuser besucht (oder ausgezogen) | „Straße abschließen“ |

**Zeitfenster anlegen:**

- **Was steht an?** Zur Auswahl stehen „Kehren und Überprüfen“ (Vorgabe), „Kehren“, „Überprüfen“, „Messen“ oder ein eigener Text (max. 40 Zeichen, z. B. „Abgaswegeüberprüfung“). Das lesen die Kunden in der Einladung, in der App, in der Bestätigung und im Kalendereintrag. „Feuerstättenschau“, „Feuerstättenbescheid“ und „Bauabnahme“ werden abgelehnt.
- **1 bis 3 Tage**, jeweils mit Von–Bis-Uhrzeit.
- Slot-Länge **20, 30 oder 45 Minuten**.
- Eine **Antwortfrist**.
- Keine Sonntage und keine Tage in der Vergangenheit. Die Frist liegt automatisch spätestens am Tag vor dem ersten Termin.
- **Beim Senden:**
  - Alle Haushalte der Straße bekommen eine Nachricht in der App und eine E-Mail.
  - Haushalte ohne Konto, aber mit E-Mail in der Kundenliste, bekommen eine Einladung.

**In einer laufenden Straße:**

- **Zeitfenster ändern.** Buchungen, die nicht mehr passen, werden freigegeben, und die Haushalte werden gebeten, neu zu wählen.
- **Einen Tag absagen**, mit Grund. Ist es der einzige Tag, muss ein Ersatztag gewählt werden.
- **Einzelnen Termin verschieben oder absagen.** Der Haushalt wird informiert.
- **Telefonisch vereinbarte Zeit eintragen** („Anrufen“ bei offenen Häusern).
- **Erinnerung an offene Haushalte** senden.

**Straße abschließen:**

- Das geht erst, wenn alle Häuser erledigt sind. Die App fragt automatisch, sobald es so weit ist, und es gibt zusätzlich einen Knopf.
- Danach erscheint die Straße wieder als **Entwurf**, also so, als wäre sie nie geplant gewesen. Die nächste Runde kann neu angelegt werden.
- Die alte Runde bleibt unter **„Abgeschlossen · N“** einsehbar, mit Knopf **„Neue Runde“**.

### Tagesroute (Reiter „Termine“)

- Alle Termine eines Tages in Zeitreihenfolge, mit Hausnummer, Name, Uhrzeit und Schlüssel-Hinweis.
- **„Route starten“** geht nur am Termintag. Ab dann sehen die Kunden live, wie weit der Kaminfeger weg ist.
- Pro Haus gibt es **„Erledigt“** oder **„Niemand da“**. Bei „Niemand da“ bekommt der Haushalt automatisch eine Nachricht und eine E-Mail, um neu zu buchen.
- Andere Tage lassen sich oben auswählen.

### Kunden

Suchbare Liste aller Haushalte mit dem Filter Alle / Geplant / Offen / Erledigt. Ein Tipp auf einen Haushalt zeigt die Details, die Telefonnummer und den Stand. „Zuletzt erledigt am …“ erscheint, wenn eine abgeschlossene Runde existiert.

### Nachrichten (Reiter „Chats“)

**Chats mit Kunden (Messenger):**

- Liste aller Unterhaltungen, neueste oben, ungelesene mit roter Zahl. Die Zahl steht auch am Reiter „Chats“.
- Schreibt ein Bewohner, erscheint er hier. Selbst anschreiben: **Kunden → Haushalt öffnen → „Nachricht schreiben“**.
- Im Chat: Telefon-Knopf oben rechts, Eingabe unten (Enter sendet, Umschalt+Enter = neue Zeile).
- Nur Text, max. 1000 Zeichen pro Nachricht. Schreiben geht nur an Haushalte mit App-Konto, sonst zeigt der Chat „Bitte anrufen“.

**Rundnachricht an eine Straße** (oben in der Chat-Liste):

- Pro Straße an **alle**, nur **offene** Haushalte oder die **Route heute** schreiben.
- **Vorlagen:**
  - „Komme ca. 15 Min. später“
  - „Bitte Zeit wählen“
  - „Heute kurzfristig frei“
  - „Zugang freihalten“
- Jede Nachricht geht in die App und per E-Mail.

### Mehr / Konto

Hier liegen Straßen & Zeitfenster, Nachrichten, Kundenliste importieren, Passkey und Konto (Abmelden, **Konto löschen**).

**Konto löschen** entfernt alles, was dem Betrieb gehört: Kundenliste, Zeitfenster, Termine, Nachrichten und Chats. Die Kunden behalten ihr eigenes Konto, sehen aber keine Termine mehr von diesem Betrieb. Einen „Nachfolger“, der die Daten übernimmt, gibt es nicht – eine Kundenliste gehört dem Betrieb, nicht einem Bezirk.

## 1.6 Betreiber-App (`/betreiber`)

**Anmelden:** Mit deiner Betreiber-E-Mail (`ADMIN_EMAILS`) per **E-Mail-Code** oder, falls eingerichtet, per **Passkey**. Nach 5 Minuten ohne Aktivität sperrt sich der Bereich.

### Prüfungen

Eine Warteschlange mit allen offenen Fällen.

**Kaminfeger-Betriebe:**

- Du siehst Betrieb, Inhaber/in und Betriebsadresse. Meldet sich jemand mit demselben Namen am selben Ort an wie ein bestehender Betrieb, steht dort eine Warnung („Gleicher Name in …“).
- Der **Nachweis** (Handwerkskarte oder Ausweis) lässt sich nur ansehen, mit Wasserzeichen. Herunterladen ist nicht möglich.
- **Schornsteinfegerregister:** Der Knopf **„Im BAFA-Register prüfen“** öffnet die Registerauskunft. Dort stehen alle Betriebe, die Schornsteinfegerarbeiten ausführen dürfen. Daneben stehen die Angaben zum Vergleichen (Betrieb, Inhaber/in, Anschrift).
- **Checkliste**, alle drei Punkte müssen abgehakt sein:
  1. Betrieb steht im Schornsteinfegerregister – Name und Anschrift stimmen
  2. Inhaberin / Betriebsleiter laut Register = Name im Konto
  3. Nachweis ist lesbar und passt zum Betrieb
- **Entscheidungen:**
  - **Betrieb freischalten:** Der Nachweis wird gelöscht, der Betrieb ist sofort freigeschaltet und bekommt eine E-Mail.
  - **Ablehnen** mit einem der vorgegebenen Gründe:
    - Nachweis unleserlich
    - Betrieb nicht im Schornsteinfegerregister gefunden
    - Name oder Anschrift passen nicht zum Register
    - Verdacht auf Fälschung
  - **Rückfrage** (bei Handwerkskammer oder Innung): Der Fall bleibt offen, der Nachweis bleibt höchstens 14 Tage.

**Bewohner** (wenn die Kundennummer 3× falsch war oder Kaminfeger/Eigentümer nicht bestätigen konnten):

- Kaminfeger um Bestätigung bitten
- Eigentümer per E-Mail fragen (bzw. E-Mail erneut senden)
- Ablehnen (der Bewohner wird informiert)
- Anfrage verwerfen (die Kontodaten werden gelöscht)

### Protokoll

Hier steht, wer wann was entschieden hat: du, der Kaminfeger, der Eigentümer oder das System. Dokumente werden nie gespeichert, nur die Entscheidung. Auch jeder **Import einer Kundenliste** steht hier, mit dem Vermerk „Bestätigt: eigene Kundendaten, nicht aus dem Kehrbuch“.

### Vorschau

- **„Kaminfeger-App ansehen“** bzw. **„Bewohner-App ansehen“** öffnet die jeweilige App in einem neuen Tab mit **Beispieldaten**:
  - Betrieb „Kaminfeger Muster“ (Max Muster)
  - drei Straßen
  - eine laufende Runde mit Terminen heute
  - Bewohner „Familie Engel, Lindenweg 5“
- **Abschottung:** Der Beispiel-Betrieb ist für echte Nutzer unsichtbar, und an die Demo-Adressen (`@demo.invalid`) gehen nie E-Mails.
- **Erneuerung:** Die Beispieldaten erneuern sich jeden Tag von selbst. Mit **„Beispieldaten zurücksetzen“** geht es sofort.
- **Hinweis:** Ein eigenes Kaminfeger- oder Bewohner-Konto im selben Browser wird dabei abgemeldet.

### Feedback

Alle Rückmeldungen mit Bildschirmfoto, markierter Stelle, Gerät und ggf. Kontakt-E-Mail. Du kannst sie als erledigt markieren.

- Erledigte Rückmeldungen werden nach 90 Tagen automatisch gelöscht.
- Alle anderen werden nach 180 Tagen gelöscht.

## 1.7 Ein kompletter Ablauf von Anfang bis Ende

1. **Kaminfeger** meldet seinen Betrieb an und lädt Handwerkskarte oder Ausweis hoch.
2. **Du** bekommst die E-Mail „Neue Prüfung“, vergleichst mit dem Schornsteinfegerregister, hakst ab und schaltest frei.
3. **Kaminfeger** importiert seine Kundenliste und legt für die Birkenallee Zeitfenster an (z. B. „Kehren“, Di 8–12, Do 13–16).
4. **Bewohner** bekommen Nachricht/E-Mail bzw. eine Einladung, registrieren sich, bestätigen ihren Wohnsitz und buchen 9:30 Uhr.
5. **Am Vorabend um 18 Uhr** und **eine Stunde vorher** kommt eine Erinnerungs-E-Mail.
6. **Am Termintag** startet der Kaminfeger die Route. Der Bewohner sieht „noch 2 Häuser entfernt“.
7. Der Kaminfeger hakt „Erledigt“ ab. Wer nicht da war, bekommt automatisch die Bitte, neu zu buchen.
8. Sind alle Häuser erledigt, **schließt der Kaminfeger die Straße ab**. Sie steht wieder als Entwurf für die nächste Runde bereit.

## 1.8 Alle E-Mails, die die App verschickt

| Anlass | Empfänger |
|---|---|
| Anmelde-/Registrierungscode | Nutzer |
| Neue Prüfung | Betreiber |
| Ihr Betrieb ist freigeschaltet / Nachweis abgelehnt | Kaminfeger |
| Zeitfenster für die Straße / Bitte neue Zeit wählen | Bewohner mit Konto |
| Einladung: Termin wählen (Link, 30 Tage) | E-Mail aus der Kundenliste |
| Termin bestätigt / eingetragen / verschoben / abgesagt | Bewohner |
| Erinnerung Vorabend 18 Uhr / 1 Stunde vorher | Bewohner (abschaltbar) |
| Sie wurden nicht angetroffen | Bewohner |
| Nachricht von Ihrem Kaminfeger | Bewohner |
| Neue Chat-Nachricht (nur wenn nach 10 Min. noch ungelesen, eine Mail je Chat) | Bewohner bzw. Kaminfeger |
| Bewohner-Anfrage / Umzug gemeldet | Kaminfeger |
| Wohnt X in der Y? (Link, 14 Tage) | Eigentümer |
| Adresse bestätigt / nicht bestätigt | Bewohner |
| Einladung Mitbewohner (Link, 14 Tage) | eingeladene Person |
| Ihr Kaminfeger ist jetzt dabei | Bewohner, die sich vor dem Import der Kundenliste registriert haben |

Absender: `Kaminfeger Verwaltung <no-reply@kaminfeger-verwaltung.com>`, verschickt über Brevo.

## 1.9 Regeln und Fristen

| Regel | Wert |
|---|---|
| Buchen, verschieben, absagen durch Bewohner | bis zum Vortag |
| Zeitfenster pro Straße | 1–3 Tage, kein Sonntag, nicht in der Vergangenheit |
| Slot-Länge | 20, 30 oder 45 Minuten |
| Antwortfrist | frühestens heute, spätestens Tag vor dem ersten Termin |
| Route starten | nur am Termintag |
| Straße abschließen | nur wenn alle Häuser erledigt sind |
| E-Mail-Code | 6-stellig, 10 Min., max. 5 Versuche, max. 6 pro Stunde |
| Kundennummer | ab 3 Fehlversuchen zum Betreiber, ab 5 gesperrt |
| Nachweis des Betriebs | gelöscht nach Entscheidung, spätestens nach 14 Tagen |
| Art der Arbeit je Runde | max. 40 Zeichen, nichts Amtliches (Feuerstättenschau, Feuerstättenbescheid, Bauabnahme) |
| Kundenliste importieren | nur mit Bestätigung „eigene Kundendaten, nicht das Kehrbuch“ |
| Einladung Kundenliste / Mitbewohner / Eigentümer | 30 / 14 / 14 Tage |
| Sitzung Bewohner/Kaminfeger | 60 Tage |
| Betreiber-Sperre bei Inaktivität | 5 Minuten |
| Feedback | gelöscht nach 90 Tagen (erledigt) bzw. 180 Tagen |
| Chat-Nachrichten | gelöscht nach 12 Monaten; E-Mail-Hinweis nur, wenn nach 10 Min. ungelesen |

---

# Teil 2 – Betrieb & Notfälle

## 2.1 Wo was läuft

| Teil | Wo |
|---|---|
| **Server** | AWS EC2, Region Stockholm (eu-north-1), Instanz `i-0ba1ee2f39dff0ff1` |
| **Domain** | `kaminfeger-verwaltung.com`, DNS bei IONOS |
| **HTTPS** | Caddy vor der App, holt Zertifikate automatisch |
| **App** | Dienst `kaminfeger` (systemd), Code in `/opt/kaminfeger/app` |
| **Daten** | `/opt/kaminfeger/data` (Datenbank `kaminfeger.sqlite` + hochgeladene Dokumente) |
| **Einstellungen** | `/etc/kaminfeger.env` |
| **Sicherungen** | lokal `/opt/kaminfeger/backups` (14 Tage) und S3-Bucket `kaminfeger-backups-797129634535` in Frankfurt (90 Tage) |
| **E-Mail** | Brevo (Brevo GmbH, Berlin), SMTP `smtp-relay.brevo.com:587` |
| **Überwachung** | Route-53-Health-Check alle 30 s auf `/api/health`, Alarm per E-Mail an hutzmannleon@gmail.com |
| **Code** | GitHub `hutzmannleon-pixel/Claude-Workspace`, Branch `main` |

**Zugang zum Server:** Er läuft **nur über AWS Systems Manager (SSM)**, z. B. AWS-Konsole → EC2 → Instanz → „Verbinden“ → Session Manager. SSH (Port 22) ist bewusst geschlossen.

**Geheimnisse:** Das SMTP-Passwort liegt im AWS Parameter Store unter `/kaminfeger/smtp-pass` (SecureString, Region eu-north-1). Passwörter und Schlüssel gehören **nie** in Chats, E-Mails oder den Code.

## 2.2 Die Einstellungsdatei `/etc/kaminfeger.env`

| Variable | Bedeutung |
|---|---|
| `NODE_ENV=production` | Echtbetrieb |
| `BASE_URL` | `https://kaminfeger-verwaltung.com`, wird für Links in E-Mails verwendet |
| `APP_SECRET` | langes Zufallsgeheimnis (mind. 24 Zeichen). **Nie ändern**, sonst sind alle Sitzungen und Links ungültig |
| `ADMIN_EMAILS` | wer Betreiber sein darf |
| `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM` | E-Mail über Brevo |
| `OPERATOR_NAME`, `OPERATOR_ADDRESS` | Impressum (Leon Hutzmann, Am Stadelberg 1, 88416 Ochsenhausen) |
| `BACKUP_S3_BUCKET`, `BACKUP_S3_REGION` | externe Sicherung |
| `HOST=127.0.0.1`, `PORT=3000`, `TZ=Europe/Berlin` | technische Grundeinstellungen |
| optional `BAFA_REGISTER_URL` | Ziel des Knopfs „Im BAFA-Register prüfen“ (Standard: Websuche). Wird jetzt bei **jeder** Betriebsprüfung gebraucht – am besten die genaue Adresse der Registerauskunft eintragen |

**Nie im Echtbetrieb setzen:** `TEST_MODE`, `ALLOWED_EMAILS`, `ALLOW_EARLY_ROUTE`.

Nach jeder Änderung: `sudo systemctl restart kaminfeger`.

> Die Datei lässt sich nicht mit `source` laden, weil `MAIL_FROM` spitze Klammern enthält. Einzelne Werte holt man mit `grep`, z. B. `export $(grep -E '^DATA_DIR=' /etc/kaminfeger.env | xargs)`.

## 2.3 Start-Check

Der Start-Check prüft, ob alles für den Betrieb stimmt. Er ändert nichts:

```
sudo /opt/kaminfeger/app/deploy/launch-check.sh
```

Er prüft Einstellungen, E-Mail, Betreiber-Zugang, Testdaten, Anzahl freigeschalteter Betriebe, das Alter der letzten Sicherung und den S3-Bucket. Am Ende steht **„✓ Startklar“** oder eine Liste offener Punkte mit Lösung.

Der **Startschalter** (`deploy/go-live.sh`) wurde am 29.09.2026 ausgeführt:

- Er hat die Test-Einstellungen entfernt.
- Er hat die damaligen Testdaten samt Konten gelöscht.
- Vorher hat er gesichert: `/opt/kaminfeger/data/vor-start-2026-09-29T20-25-24-085Z.sqlite`.

Er muss nicht noch einmal laufen. Falls du später wieder mit Testdaten arbeitest: Als Testdaten gelten alle Haushalte mit **PLZ 99999** und alle Betriebe, die mit PLZ 99999 angemeldet sind. `npm run go-live` zeigt, was entfernt würde.

## 2.4 Sicherung und Wiederherstellung

**Automatisch täglich um 03:15 Uhr** (`kaminfeger-backup.timer` → `deploy/backup.sh`):

- Es entsteht eine konsistente Kopie der Datenbank und ein Archiv der Uploads.
- Lokal wird beides 14 Tage aufbewahrt.
- Zusätzlich geht alles verschlüsselt nach S3 Frankfurt. Der Bucket ist privat, versioniert, und Sicherungen werden nach 90 Tagen automatisch gelöscht. Der Server darf dort nichts löschen.

**Sofort sichern** (z. B. vor größeren Änderungen):

```
sudo systemctl start kaminfeger-backup
```

**Zurückspielen:** Der aktuelle Stand wird vorher automatisch aufgehoben.

```
# aus lokaler Sicherung
sudo /opt/kaminfeger/app/deploy/restore.sh /opt/kaminfeger/backups/kaminfeger-2026-10-01.sqlite
# aus S3
sudo /opt/kaminfeger/app/deploy/restore.sh s3://kaminfeger-backups-797129634535/daily/kaminfeger-2026-10-01.sqlite
```

## 2.5 Überwachung

- **Health-Check:** AWS Route 53 ruft alle 30 Sekunden `https://kaminfeger-verwaltung.com/api/health` auf.
- **Alarm:** Antwortet die Seite mehrmals nicht, kommt die E-Mail „kaminfeger-verwaltung.com nicht erreichbar“ an hutzmannleon@gmail.com. Das Abo ist bestätigt.
- **Selbstheilung:** Stürzt die App ab, startet systemd sie sofort neu.
- **Status ansehen:** `systemctl status kaminfeger caddy`
- **Protokoll ansehen:** `journalctl -u kaminfeger -n 100`

## 2.6 E-Mail (Brevo)

- **Konto:** brevo.com, Domain `kaminfeger-verwaltung.com` authentifiziert (SPF, DKIM, DMARC bei IONOS).
- **Login:** `bbc088001@smtp-brevo.com`, der Schlüssel liegt im Parameter Store.
- **Kostenloser Tarif:** 300 Mails pro Tag. Bei mehr Nutzern auf den Starter-Tarif wechseln, z. B. wenn mehrere Kaminfeger gleichzeitig Zeitfenster an große Straßen schicken.
- **AVV:** Er ist Anhang 3 („Datenschutzvereinbarung“) der Brevo-Nutzungsbedingungen. Das PDF solltest du abgelegt haben.
- **Neuer SMTP-Schlüssel:**
  1. In Brevo erzeugen.
  2. Im Parameter Store `/kaminfeger/smtp-pass` überschreiben.
  3. In `/etc/kaminfeger.env` `SMTP_PASS` ersetzen.
  4. App neu starten.

## 2.7 Updates einspielen

Der Code kommt aus GitHub (`main`). Ein Update auf dem Server, z. B. über eine SSM-Sitzung:

```
sudo systemctl start kaminfeger-backup        # vorher sichern
cd /opt/kaminfeger/app
sudo git fetch origin main && sudo git reset --hard origin/main
sudo npm ci && sudo npm run build && sudo npm prune --omit=dev
sudo chown -R kaminfeger:kaminfeger .
sudo systemctl restart kaminfeger
curl -s http://127.0.0.1:3000/api/health      # muss {"ok":true} liefern
```

- Neue Datenbank-Spalten legt die App beim Start selbst an. Auch der Umbau vom November 2026 („Betrieb statt Kehrbezirk“) läuft beim ersten Start automatisch; im Protokoll (`journalctl -u kaminfeger`) steht dann „Datenbank umgebaut“.
- Wer die App gerade offen hat, bekommt die neue Version automatisch. Notfalls hilft einmal Schließen und neu Öffnen.

## 2.8 Notfälle

| Problem | Was tun |
|---|---|
| **Seite nicht erreichbar** (Alarm-Mail) | 1. `systemctl status kaminfeger caddy` 2. `journalctl -u kaminfeger -n 100` 3. `sudo systemctl restart kaminfeger` 4. In der AWS-Konsole prüfen, ob die Instanz läuft |
| **Betreiber-Passkey verloren** (Handy weg) | Einfach per E-Mail-Code entsperren und den alten Passkey unter „Passkeys“ löschen. Nur nötig, falls `ADMIN_PASSKEY=required` gesetzt ist – auf dem Server: `cd /opt/kaminfeger/app && sudo -u kaminfeger env $(grep -E '^(DATA_DIR\|APP_SECRET)=' /etc/kaminfeger.env \| xargs) npm run reset-passkeys -- hutzmannleon@gmail.com admin`, danach unter `/betreiber` per E-Mail-Code entsperren und neuen Passkey einrichten |
| **E-Mails kommen nicht an** | Brevo-Dashboard → „Transactional“ → Logs ansehen. Tageslimit erreicht? Schlüssel abgelaufen? `journalctl -u kaminfeger \| grep -i mail` |
| **Falsche Daten nach Fehlbedienung** | Sicherung vom Vortag zurückspielen (2.4). Achtung: Alles seit der Sicherung geht verloren |
| **Ein Betrieb darf nicht mehr mitmachen** (z. B. aus dem Register gelöscht) | Der Betrieb löscht sein Konto selbst unter Mehr → Konto. Sonst per Datenbank (Entwickler): Die Funktion `deleteSweepData` entfernt Kundenliste, Termine und Chats |
| **Server komplett verloren** | Neue EC2-Instanz aufsetzen (siehe 3.8), Code klonen, `/etc/kaminfeger.env` neu anlegen, letzte Sicherung aus S3 mit `restore.sh` zurückspielen, DNS bei IONOS auf die neue IP setzen |
| **Spam/Missbrauch** | Es gibt Obergrenzen: 30 Codes und 60 Anmeldungen pro Stunde und IP, 30 Live-Verbindungen pro IP. Bei Bedarf in der env-Datei senken (`IP_CODES_PER_HOUR`, `IP_LOGINS_PER_HOUR`) |
| **Jemand will seine Daten gelöscht haben** | Bewohner und Kaminfeger können ihr Konto in der App selbst löschen. Sonst über die Betreiber-Prüfung „Anfrage verwerfen“ oder per Datenbank (Entwickler) |

## 2.9 Offene Punkte / bekannte Grenzen

- **Push-Mitteilungen** aufs Handy gibt es noch nicht. Erinnerungen kommen per E-Mail und live in der App.
- **Adressvorschläge** nutzen den öffentlichen Dienst Photon (komoot/OpenStreetMap). Bei vielen Nutzern einen eigenen Dienst oder Vertrag einplanen.
- **Bildschirmfotos** von Dokumenten lassen sich im Browser nicht verhindern. Es gibt nur Wasserzeichen und einen Hinweis.
- **Verträge zur Auftragsverarbeitung mit den Kaminfeger-Betrieben** fehlen noch. Die Kundenlisten enthalten personenbezogene Daten; verantwortlich ist der jeweilige Betrieb, du verarbeitest sie in seinem Auftrag. Impressum und Datenschutzerklärung vor großem Start rechtlich prüfen lassen.
- **Rechtliche Einordnung** (Feuerstättenschau nicht über die App, Kundenliste statt Kehrbuch, Zulassung über das Schornsteinfegerregister): beruht auf Recherche. Bitte von Innung oder Anwalt bestätigen lassen.
- **BAFA-Link:** „Im BAFA-Register prüfen“ öffnet derzeit eine Websuche. Das Register wird jetzt bei jeder Betriebsprüfung gebraucht. Die genaue Adresse der Registerauskunft lässt sich über `BAFA_REGISTER_URL` eintragen.

---

# Teil 3 – Technik für Entwickler

## 3.1 Überblick

| Bereich | Technik |
|---|---|
| Server | Node.js ≥ 22.13, Fastify 5, SQLite über das eingebaute `node:sqlite` (WAL-Modus) |
| E-Mail | nodemailer (SMTP), Warteschlange in der Tabelle `outbox` im Testmodus |
| Anmeldung | E-Mail-Codes (gehasht mit `APP_SECRET`), Sitzungs-Cookies je Rolle (`kf_c`, `kf_s`, `kf_a`), Passkeys über @simplewebauthn v13 |
| Live | Server-Sent Events unter `/api/events`. Der Server sendet nur „etwas hat sich geändert“, die Apps laden dann neu |
| Oberfläche | React 19, Vite 8, eine Single-Page-App für alle Rollen. Inline-Styles über die Hilfsfunktion `sx()`, Designsystem in CSS-Variablen |
| Icons / Schrift | Phosphor Icons, Inter |
| Hosting | systemd-Dienst hinter Caddy (HTTPS), alternativ Docker (`Dockerfile`, `docker-compose.yml`, `Caddyfile`) |

## 3.2 Ordnerstruktur

```
server/
  index.js          Start, Sicherheits-Header, Origin-Prüfung, statische Dateien, 404
  config.js         alle Einstellungen aus Umgebungsvariablen
  db.js             Datenbank-Schema + automatische Migrationen, Hilfen get/all/run/tx
  auth.js           Codes, Sitzungen, requireUser
  domain.js         Fachlogik: Betriebe, Art der Arbeit, Runden, Route, Nachrichten, Links
  mail.js           E-Mail-Versand und HTML-Vorlage
  live.js           SSE-Verbindungen (Obergrenzen) und live.bump()
  jobs.js           Erinnerungen (jede Minute), Aufräumen (stündlich)
  demo.js           Beispiel-Betrieb für die Betreiber-Vorschau
  launch.js         Start-Check und Startschalter
  reset-passkeys.js Notfall: Passkeys eines Kontos löschen
  testmode.js       Testseite /test (nur TEST_MODE)
  util.js           Datumsfunktionen, CSV-Parser, Rate-Limit, Fehlerhelfer
  routes/
    public.js       Login, Konfiguration, Live, Eigentümer-Links
    customer.js     Bewohner-API
    sweep.js        Kaminfeger-API
    admin.js        Betreiber-API
    passkey.js      Passkeys registrieren/anmelden/löschen
    feedback.js     Feedback senden und verwalten
  test/flow.test.js Integrationstests (alle Abläufe)
  test/migration.test.js  Umbau einer alten Datenbank (Kehrbezirke → Betriebe), Vorlage altes-schema.sql
web/
  index.html, public/   Manifest, Service Worker (sw.js), Icons, CSV-Vorlagen
  src/main.jsx      Routing nach Pfad, setzt data-app für die App-Farbe, Fehler-Abfang
  src/ui.jsx        gemeinsame Bausteine (Shell, Reiterleiste, Kacheln, Sheets, Passkey …)
  src/brand.jsx     Logo und Landschafts-Illustration
  src/lib/core.js   api(), useData/useLive (SSE mit Auto-Reconnect), Datumshilfen
  src/customer/     Bewohner-App (Onboarding.jsx, App.jsx)
  src/sweep/        Kaminfeger-App (Onboarding.jsx, App.jsx)
  src/admin/        Betreiber-App (Admin.jsx, PdfView.jsx)
  src/ds/           Designsystem: nocturne.css (Struktur), theme.css (Farben), liquid.css (Glas-Effekte)
deploy/             backup.sh, restore.sh, go-live.sh, launch-check.sh, systemd-Timer
testdaten/          erfundene Test-CSV (Kundenliste mit 60 Haushalten)
BETRIEB.md          Kurzanleitung Betrieb
```

## 3.3 Datenmodell (SQLite)

| Tabelle | Inhalt |
|---|---|
| `users` | E-Mail + Rolle (`customer`, `sweep`, `admin`) |
| `sessions` | Sitzungen (gehashte IDs, Ablauf) |
| `codes` | E-Mail-Codes (Hash, Versuche, Ablauf) |
| `tokens` | Einmal-Links: `invite`, `member`, `owner` (Hash, Ablauf, benutzt) |
| `passkeys` | WebAuthn-Zugänge je Nutzer |
| `sweeps` | Kaminfeger-Betrieb: Name, `company`, Betriebsadresse, Status (`draft` → `pending`/`query` → `active`, oder `rejected`), `own_data_at` (letzte Bestätigung „eigene Kundendaten“), `demo`-Kennzeichen |
| `documents` | Nachweis des Betriebs, intern `kind = 'ausweis'` (Datei in `data/uploads`) |
| `households` | Kundenliste eines Betriebs (`sweep_id`): Adresse, Kunde, Kundennummer, E-Mail, Telefon |
| `residents` | Bewohner: Haushalt, Status (`unverified`, `needs_verify`, `review`, `asked`, `owner`, `verified`, `rejected`, `moved`), Methode, Einstellungen |
| `campaigns` | Runde pro Straße eines Betriebs (`sweep_id`): Art der Arbeit (`work`), Slot-Länge, Frist, `closed_at` |
| `windows` | Zeitfenster (Datum, Von, Bis) einer Runde |
| `bookings` | Buchungen: Slot, Schlüssel-Hinweis, Quelle (`app`/`phone`), Status (`booked`, `cancelled`, `replaced`, `dropped`, `missed`), Besuch (`done`/`missed`) |
| `route_days` | an welchem Tag ein Betrieb (`sweep_id`) die Route gestartet hat |
| `messages`, `message_recipients`, `message_reads` | Nachrichten an Haushalte |
| `feedback` | Rückmeldungen inkl. Bild |
| `chat_messages` | Messenger: Haushalt, Richtung (`from_sweep`), Text, gelesen, per Mail gemeldet |
| `admin_log` | Protokoll |
| `outbox` | Test-Postfach (nur Testmodus) |

Migrationen stehen in `server/db.js` und laufen bei jedem Start automatisch. Die größte ist `migrateToBetrieb()`: Sie erkennt eine alte Datenbank (Haushalte hängen noch an `district_id`), hängt Kundenlisten, Runden und Routentage an den Kaminfeger des bisherigen Bezirks, entfernt Bezirke ohne Kaminfeger samt Anhang und löscht die Tabelle `districts`. Der Test `migration.test.js` spielt das mit einer Datenbank im alten Aufbau durch.

**Kein Kehrbezirk mehr:** Früher gab es je Kehrbezirk genau einen Kaminfeger, und alles hing am Bezirk. Jetzt gehört alles dem Betrieb. Dieselbe Adresse darf in den Kundenlisten mehrerer Betriebe stehen (`UNIQUE (sweep_id, street_key, plz, nr)`).

## 3.4 Schnittstellen (API)

Alle Antworten sind JSON. Fehler kommen als `{ error, field? }` mit HTTP 4xx. Schreibende Aufrufe müssen vom eigenen Origin kommen.

| Bereich | Wichtige Endpunkte |
|---|---|
| Öffentlich | `GET /api/health`, `GET /api/config`, `GET /api/events` (SSE), `POST /api/auth/code`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `GET/POST /api/owner/:token`, `GET /aktivieren/:token` (nur noch Weiterleitung für alte Links) |
| Passkey | `POST /api/passkey/register/options|verify`, `POST /api/passkey/login/options|verify`, `GET /api/passkey/list`, `POST /api/passkey/delete` |
| Bewohner | `lookup` (antwortet nur mit Ja/Nein, nie mit Betriebsnamen), `invite/:token`, `register`, `verify-number`, `request-sweep`, `state`, `book`, `cancel`, `read`, `prefs`, `prep`, `members`, `move`, `readdress`, `choose` (Betrieb wechseln), `delete`, `logout`, `calendar.ics`, `chat` (GET/POST) (alle unter `/api/customer/…`) |
| Kaminfeger | `register`, `me`, `documents/ausweis`, `submit`, `delete`, `kunden?eigene=1` (Kundenliste, nur mit Bestätigung), `overview`, `customers`, `campaigns` (+`/:id`, `/:id/close`), `bookings` (+`/:id/move`, `/:id/cancel`), `windows/:id/cancel`, `route`, `route/start`, `visit`, `messages`, `tenant/:id`, `chats`, `chats/:hid` (GET/POST), `chats/:hid/read` (alle unter `/api/sweep/…`) |
| Betreiber | `queue`, `sweeps/:id` (+`approve`, `reject`, `query`), `residents/:id`, `documents/:id`, `log`, `demo`, `feedback` (alle unter `/api/admin/…`) |
| Feedback | `POST /api/feedback` |

## 3.5 Sicherheit

- **Codes und Sitzungen:**
  - Codes und Sitzungen werden nur gehasht gespeichert.
  - Cookies sind `HttpOnly` und `SameSite=Lax`, über HTTPS zusätzlich `Secure`.
  - Jede Rolle hat ihren eigenen Cookie.
- **Origin-Prüfung:** Schreibende Anfragen von fremden Seiten werden abgewiesen (403).
- **Obergrenzen:**
  - pro E-Mail: 6 Codes pro Stunde
  - pro IP: 30 Codes und 60 Anmeldungen pro Stunde
  - Live-Verbindungen: 30 pro IP, 5000 insgesamt
  - Passkey-Challenges: max. 20 000
- **HTTPS:** HSTS ist im Produktivbetrieb aktiv.
- **Dokumente:**
  - nur Ansicht, mit Wasserzeichen
  - gelöscht nach Entscheidung bzw. 14 Tagen
  - nie im Protokoll gespeichert
- **Start-Sperre:** In Produktion startet der Server nicht ohne sicheres `APP_SECRET`.
- **Demo-Daten:** Sie sind über `sweeps.demo = 1` und `@demo.invalid`-Adressen vollständig abgeschottet. An `.invalid`-Adressen wird nie gemailt.
- **Kundenbeziehungen:** Die Adresssuche vor der Anmeldung verrät nur, *ob* ein Betrieb die Adresse führt. Den Betriebsnamen bekommt ein Bewohner erst mit bestätigtem Wohnsitz. Jeder Betrieb sieht nur seine eigene Kundenliste.
- **Amtliche Aufgaben:** `cleanWork()` in `domain.js` lehnt „Feuerstättenschau“, „Feuerstättenbescheid“ und „Bauabnahme“ als Art der Arbeit ab. Der Import der Kundenliste verlangt `?eigene=1` und protokolliert die Bestätigung.

## 3.6 Hintergrund-Aufgaben (`server/jobs.js`)

- **Jede Minute:** Erinnerungen. Am Vorabend ab 18 Uhr und eine Stunde vor dem Termin, je nach Einstellung des Bewohners. Außerdem E-Mail-Hinweise für Chat-Nachrichten, die seit 10 Minuten ungelesen sind (gebündelt, eine Mail je Chat und Richtung).
- **Stündlich:** Aufräumen. Dokumente älter als 14 Tage, alte Codes, abgelaufene Sitzungen, ungenutzte Links, altes Feedback und Chat-Nachrichten älter als 12 Monate werden gelöscht.

## 3.7 Lokal entwickeln und testen

```bash
npm install
npm run build
TEST_MODE=1 ADMIN_EMAILS=ich@example.de npm start
# → http://localhost:3000/test  (alle drei Apps nebeneinander + Test-Postfach)
```

- **Hot-Reload:** `npm run dev` startet das Web unter http://localhost:5173 und die API auf Port 3000.
- **Tests:** `npm test` startet 38 Tests gegen temporäre Datenbanken. Sie decken Betriebsanmeldung, Prüfung, Kundenliste, Art der Arbeit, Buchung, Fristen, Route, Straße abschließen, zwei Betriebe an einer Adresse, Konto löschen, Vorschau, Schutzmechanismen und den Umbau einer alten Datenbank ab.
- **Testdaten:** `testdaten/` enthält eine erfundene Kundenliste mit 60 Haushalten (PLZ 99999). Test-Betriebe meldet man mit PLZ 99999 an.
- **Testmodus:** `TEST_MODE=1` aktiviert `/test`, das Test-Postfach und den frühen Routen-Start. **Nie in Produktion.**

## 3.8 Neuen Server aufsetzen (Kurzfassung)

1. **Server anlegen:** Linux-Server (z. B. EC2 oder Hetzner) mit Node.js ≥ 22.13 und Caddy.
2. **Benutzer und Ordner:** Benutzer `kaminfeger` anlegen, dazu `/opt/kaminfeger/{app,data,backups}`.
3. **Code holen:** Repository nach `/opt/kaminfeger/app` klonen, dann `npm ci && npm run build && npm prune --omit=dev`.
4. **Einstellungen:** `/etc/kaminfeger.env` nach `.env.example` und Abschnitt 2.2 anlegen.
5. **Dienst einrichten:** systemd-Dienst `kaminfeger` mit `EnvironmentFile=/etc/kaminfeger.env`, `User=kaminfeger` und `ExecStart=/opt/node/bin/node --disable-warning=ExperimentalWarning server/index.js`.
6. **Sicherung:** `deploy/kaminfeger-backup.service` und `.timer` nach `/etc/systemd/system`, dann `systemctl enable --now kaminfeger-backup.timer`.
7. **HTTPS:** Caddy als Reverse-Proxy auf `127.0.0.1:3000` (siehe `Caddyfile`). `/api/events` darf nicht gepuffert werden.
8. **Daten zurückspielen:** Letzte Sicherung mit `deploy/restore.sh` zurückspielen.
9. **Prüfen:** DNS umstellen und den Start-Check ausführen.

## 3.9 Design anpassen

- **Farben:** Alles steht in `web/src/ds/theme.css`.
  - `--acc` ist die Akzentfarbe. Sie wird je App über `html[data-app="customer|sweep|admin"]` gesetzt.
  - Die Abstufungen `--color-accent-100…900` werden daraus automatisch berechnet.
  - `--app-bg` ist der Hintergrundverlauf.
- **Glas-Effekte:** `web/src/ds/liquid.css`.
- **Kachelfarben:** `TILE_COLORS` in `web/src/ui.jsx`.
- **Nach Designänderungen:** In `web/public/sw.js` die Cache-Version erhöhen (z. B. `kf-v11` → `kf-v12`), damit installierte Apps die neue Version laden.
