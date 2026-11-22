# Anleitung Phase 1

## 1. App-Registrierung in Microsoft Entra (einmalig, kostenlos)

1. Öffne https://entra.microsoft.com und melde dich mit deinem **privaten Microsoft-Konto** an (dasselbe Konto wie für OneDrive).
   Bietet Microsoft dort kein Verzeichnis an, öffne stattdessen https://portal.azure.com. Dabei kann Microsoft ein kostenloses Azure-Konto mit Kreditkartenprüfung verlangen. Für die App-Registrierung entstehen keine Kosten.
2. **Anwendungen → App-Registrierungen → Neue Registrierung**
   - Name: `Stammbaum Seehafer`
   - Unterstützte Kontotypen: **Nur persönliche Microsoft-Konten**
   - Umleitungs-URI: Plattform **Single-Page-Anwendung (SPA)**, Adresse `http://localhost:5173/stammbaum-seehafer/`
3. Nach dem Anlegen: **Authentifizierung → URI hinzufügen** und die spätere Adresse eintragen: `https://<dein-github-name>.github.io/stammbaum-seehafer/`
4. **API-Berechtigungen → Berechtigung hinzufügen → Microsoft Graph → Delegierte Berechtigungen**: `Files.ReadWrite.AppFolder` und `User.Read`. Weitere Berechtigungen brauchst du nicht. Insbesondere **nicht** `Files.ReadWrite`.
5. Lege **kein** Geheimnis und kein Zertifikat an.
6. Kopiere die **Anwendungs-ID (Client)** von der Übersichtsseite. Sie ist nicht geheim.

Beim ersten Anmelden fragt Microsoft, ob die App auf ihren eigenen Ordner zugreifen darf. Danach entsteht in OneDrive der Ordner `Apps/Stammbaum Seehafer/` mit `stammbaum.json`, `medien/` und `backup/`.

## 2. Veröffentlichen über GitHub Pages (kostenlos)

1. Lege auf github.com ein **öffentliches** Repository mit dem Namen `stammbaum-seehafer` an. Öffentlich ist hier unproblematisch: Es enthält nur den Code, keine Daten.
2. Lade den Code hoch. Im Projektordner:
   ```powershell
   git remote add origin https://github.com/<dein-github-name>/stammbaum-seehafer.git
   ```
   ```powershell
   git push -u origin main
   ```
3. Im Repository unter **Settings → Pages → Source** „GitHub Actions“ wählen.
4. Unter **Settings → Secrets and variables → Actions → Variables** die Variable `MSAL_CLIENT_ID` mit der Anwendungs-ID anlegen.
5. Bei jedem `git push` baut GitHub die App neu und veröffentlicht sie unter `https://<dein-github-name>.github.io/stammbaum-seehafer/`.

Suchmaschinen sind ausgesperrt (`robots.txt` und `noindex`). Ohne Anmeldung zeigt die Seite nur eine leere App.

## 3. Installation am Android-Handy

1. Öffne die Adresse in **Chrome**.
2. Wähle im Menü ⋮ **„Zum Startbildschirm hinzufügen“** bzw. **„App installieren“**.
3. Öffne die App, tippe auf **Mehr → Mit Microsoft anmelden** und melde dich an.
4. Die App lädt den Stand aus OneDrive. Danach funktioniert sie auch ohne Netz.

Am Windows-PC gehst du genauso vor: Adresse in Edge oder Chrome öffnen und über das Symbol in der Adressleiste installieren.

## 4. Erster Import (einmalig, am PC)

1. **Mehr → Excel-Datei importieren …**
2. Wähle deine bisherige Excel-Arbeitsmappe.
3. Optional: Wähle die Ergänzungsdatei (JSON) mit späteren Korrekturen. Sie liegt neben deinen Unterlagen, nicht im Repository.
4. Prüfe den Bericht:
   - **Platzhalter-Eltern**: Hake jede Geschwistergruppe einzeln an, für die ein Platzhalter angelegt werden soll.
   - **Ergänzungen K1–K14**: Entscheide jede einzeln („übernehmen“ oder „Excel behalten“).
   - **Prüfliste**: Hier stehen alle Zuordnungen, die die App selbst abgeleitet hat, zum Beispiel Geschlecht aus dem Beziehungstext oder die Zerlegung der Namensvarianten.
5. **Import abschließen**. Der Bericht wird als `JJJJMMTT_Stammbaum_Importbericht.md` heruntergeladen. Bei bestehender Verbindung wird der Stand sofort in OneDrive gespeichert.

## 5. Typischer Ablauf: Person beim Besuch ergänzen

1. App öffnen. Ohne Netz siehst du oben „offline“, Änderungen werden trotzdem gespeichert.
2. Person über 🔍 suchen (Namen auch ohne Sonderzeichen, Namensvarianten oder eine ID wie „P041“) oder im Baum antippen.
3. **Daten**: Datum eintippen, zum Beispiel `ca. 1930`, `vor 1945`, `03.12.` oder `05.09.1994?`. Unter dem Feld steht, wie die App die Angabe versteht. Den Status setzt du über das farbige Feld rechts.
4. **Familie**: Über „+ Kind“, „+ Partner“ und „+ Elternteil“ legst du neue Personen an. Nachname, Geschlecht des Partners und der zweite Elternteil sind vorbelegt.
5. **Quellen/Medien → 🗣 Gesprächsnotiz**: Datum, „mitgeteilt von …“, Text und optional eine Sprachaufnahme. Daraus entsteht eine Quelle vom Typ Familiengespräch, die mit der Person verknüpft wird.
6. **📷 Foto aufnehmen**: zum Beispiel ein altes Foto, einen Grabstein oder eine Urkunde. Die App verkleinert das Bild auf höchstens 2000 px.
7. Vertippt? Oben **↶** macht die letzten 30 Schritte rückgängig.
8. Wieder mit Netz: Die App speichert automatisch in OneDrive. Hast du in der Zwischenzeit am PC dieselbe Angabe anders geändert, zeigt sie dir beide Fassungen zur Auswahl.

## 6. Bekannte Grenzen von Phase 1

- Die Microsoft-Anmeldung muss gelegentlich erneuert werden. Microsoft begrenzt Browser-Apps auf 24 Stunden je Anmeldung. Offline bearbeiten geht trotzdem immer.
- Der Baum zeigt die Standardansicht und „Nur nahe Verwandte“ (zwei Schritte um die Fokusperson). Die Ansichten Vorfahren, Nachfahren, Sanduhr und Fächer kommen in Phase 2.
- Bei vielen verschwägerten Zweigen kann eine Person nicht direkt unter beiden Elternpaaren stehen. Dann laufen Linien schräg über den Baum. Die Fokus-Ansicht ist am Handy deshalb übersichtlicher.
- Fotos, die als Link gespeichert sind (Grabregister, Anzeigen, ChatGPT-Bibliothek), öffnen sich im Browser. Ins OneDrive geladen werden nur Fotos, die du in der App aufnimmst oder auswählst.

# Phase 2: Ansichten und Auswertungen

## Baumansichten
Im Baum oben links auf **☰ Ansicht** tippen:
- **Standard**: alle Personen. Mit Fokus und „Nur nahe Verwandte“ siehst du nur die nähere Familie einer Person.
- **Vorfahren**: Ahnen der Ausgangsperson nach oben, mit wählbarer Zahl an Generationen.
- **Nachfahren**: Kinder, Enkel usw. nach unten, wahlweise mit Partnern.
- **Sanduhr**: Vor- und Nachfahren zusammen, ausgehend von einer Person.
- **Fächer**: Vorfahren im Halbkreis, Vater links, Mutter rechts. Leere Felder zeigen, wo Ahnen fehlen.
- **Lebende Personen**: anzeigen, anonymisieren („Lebende Person“, ohne Daten) oder ausblenden.

Die Ausgangsperson wählst du in der Ansicht oder über „Im Baum zeigen“ bei einer Person. Die Einstellungen gelten nur auf dem jeweiligen Gerät.

## Drucken und PDF
**☰ Ansicht → Drucken / PDF** oder **Mehr → Baum drucken / PDF**. Gedruckt wird genau die eingestellte Ansicht.
- Papier A4/A3, Ausrichtung automatisch, hoch oder quer
- **Eine Seite**: wird verkleinert, die Zeile darüber zeigt den Maßstab. **Mehrseitig**: Originalgröße, Blätter zum Aneinanderlegen, mit Blattnummer.
- Kopfzeile mit Titel, Ausgangsperson und Datum. Bei anonymisierten Lebenden steht auch in der Kopfzeile kein Name.
- Eine PDF-Datei entsteht im Druckdialog über „Als PDF speichern“ (am Handy: Teilen → Drucken → Als PDF speichern).

## Auswertungen (Mehr → Auswertungen)
- **Zeitleiste**: alle datierten Ereignisse nach Jahrzehnten, filterbar (Geburten, Hochzeiten, Scheidungen, Todesfälle, Fakten).
- **Jahrestage**: Geburts- und Todestage der nächsten 30 Tage und danach, auch wenn nur Tag und Monat bekannt sind.
- **Konsistenz prüfen**: Widersprüche wie Tod vor Geburt, Kind älter als Elternteil, unplausibles Alter der Eltern oder Geburt nach dem Tod eines Elternteils. Dazu Beziehungen und Personen ohne Quelle sowie mögliche Dubletten. Ungefähre Daten werden mit ihrem Spielraum geprüft. Ein Paar, das du als „verschiedene Personen“ markierst, wird nicht mehr gemeldet.
- **Verwandtschaft**: zwei Personen wählen. Die App zeigt die deutsche Bezeichnung (zum Beispiel „Cousine 2. Grades, 1 Generation versetzt“), den geschätzten Anteil gemeinsamer DNA und den Weg über die gemeinsamen Vorfahren. Führt der Weg über Platzhalter-Eltern oder abgeleitete Beziehungen, steht das ausdrücklich dabei. Ohne Blutsverwandtschaft ermittelt sie die Schwägerschaft (Schwiegervater, Schwager …). Erreichbar auch über **Person → Familie → Verwandtschaft ermitteln**.
- **Lebenslauf** (Reiter der Person) enthält jetzt auch Hochzeit/Scheidung der Eltern, Tod von Partnern und die Geburt von Geschwistern, jeweils mit Alter.

# Phase 2b: Stammbaum zum Aufklappen, Plus an jeder Person, Kacheln einstellen

## Ansicht „Stammbaum“ (neue Startansicht)
- Gezeigt werden die Nachfahren der **Stammeltern** (voreinstellbar unter ☰ Ansicht) mit ihren Partnern, streng nach Generationen.
- **▲ Zahl** oben an einer Kachel: Hier gibt es verborgene Vorfahren, zum Beispiel die Eltern einer angeheirateten Person. Antippen klappt die Eltern auf, **− ▲** klappt wieder zu.
- **▼ Zahl** unten: verborgene Kinder bzw. Nachfahren, etwa Geschwister einer angeheirateten Person.
- **− ▼** an jeder Person mit sichtbaren Kindern klappt den Zweig darunter zu (auch im Grundbaum), **▼ Zahl** öffnet ihn wieder samt allen Nachfahren. Das gilt jeweils für das ganze Paar.
- Aufgeklappte Seitenzweige werden **neben** die angeheiratete Person gesetzt; benachbarte Zweige rücken dafür zur Seite, sodass sich weder Kacheln noch Linien überlagern. Ein Zweig mit eingeblendeten Schwiegereltern rückt dabei an den Rand seiner Geschwister.
- Trifft ein aufgeklappter Zweig auf jemanden, der schon im Bild ist, wird die Person nicht doppelt gezeigt. Die Linie führt zur vorhandenen Kachel.
- **Gepunktete Linien** stehen für unsichere oder abgeleitete Verbindungen (Platzhalter-Eltern, „abgeleitet“, „als Cousin angegeben“).
- Unten zeigt „… weitere“ alle Personen, die gerade nicht im Bild sind, mit Sprung zur Person oder in die Sanduhr. „alles zuklappen“ führt zurück zur Ausgangsansicht.
- Andere Stammeltern wählst du unter **☰ Ansicht → Stammeltern**. Die frühere Gesamtansicht heißt jetzt „Alle Personen“.

## Plus an jeder Person
Das kleine **+** unten rechts neben der ID jeder Kachel öffnet „Neue Person zu …“. Zuerst wählst du die Beziehung:
- **Vater/Mutter:** wird Elternteil. Ist schon ein Elternteil da, wird ein Paar vorgeschlagen (als „abgeleitet“ markiert).
- **Bruder/Schwester:** bekommt dieselben Eltern; für Halbgeschwister nur einen Haken setzen. Sind keine Eltern erfasst, legt die App wahlweise Platzhalter-Eltern an.
- **Sohn/Tochter:** Kind der Person und, falls gewählt, ihres Partners.
- **Partner/in:** mit Status der Partnerschaft.

Nachname und Geschlecht sind vorbelegt, zum Beispiel beim Bruder einer verheirateten Frau deren Geburtsname. Nach dem Speichern klappt die App den passenden Zweig auf, damit die neue Person sofort zu sehen ist.

## Kacheln einstellen
**☰ Ansicht → Kacheln:** Foto, Rufname oder alle Vornamen, Geburtsname, Lebensdaten (nur Jahre oder vollständig mit Geburtstag/Todestag), Alter, Geburts- und Sterbeort, aktueller Wohnort, Beruf, ID und ein Häkchen bei dokumentarisch belegten Daten. Dazu Größe (kompakt, standard, groß), Abstände und Farben (nach Geschlecht, dezent, neutral). Die Einstellungen gelten pro Gerät und auch für den Druck.

# Phase 3: Orte & Karte, Statistik, Chronik, GEDCOM, Leseansicht

Alles Neue findest du unter **Mehr → Auswertungen** bzw. **Mehr → Export/Import**.

## Orte & Karte
- Die **Ortsliste** entsteht automatisch aus den Orten aller Angaben. Zusätze wie „vermutlich“, „Raum“, „Friedhof“ und Straßenadressen fallen dabei weg; die Angabe selbst bleibt unverändert.
- „Marienburg / Malbork“ wird als ein Ort mit zwei Namen erkannt. Steht „vermutlich“ davor, heißt der Schrägstrich „oder“ – dann zählt nur der erste Ort.
- Im Ortsblatt kannst du **historische Namen** ergänzen, den Hauptnamen wechseln und zwei Einträge **zusammenlegen** (z. B. „Breslau“ und „Wrocław“).
- **Auf Karte suchen** fragt OpenStreetMap nach Koordinaten. Gesendet wird nur der Ortsname, nie Personen oder Adressen, und nur wenn du tippst. Du wählst den passenden Treffer selbst aus; alternativ Koordinaten von Hand eintragen.
- Die **Karte** zeigt alle Orte mit Koordinaten, filterbar nach Geburt, Tod, Wohnort und Heirat. Das Antippen eines Markers listet die Personen. Kartenbilder kommen von OpenStreetMap (dabei wird nur der Kartenausschnitt abgerufen).

## Statistik
Personen, Generationen, Belegstatus aller Angaben, Vollständigkeit (Geburtsjahr, Geburtsort, Todesjahr, Quelle, Foto), Geburten je Jahrzehnt, Lebensalter, häufigste Vor- und Familiennamen sowie Geburtsorte. Lebensalter zählt nur, wenn es aus den Daten eindeutig hervorgeht.

## Nachruf und Familienchronik
- Der **Nachruf** (Reiter „Nachruf“ bei Verstorbenen) und die **Familienchronik** (eigene Kapitel mit Zeitraum und beteiligten Personen) haben jetzt Formatierung: Überschriften, fett, kursiv, Listen, Zitat und Fotos aus den vorhandenen Medien.
- Unter dem Nachruf stehen **Suchlinks** zu FamilySearch, MyHeritage, Ancestry, WikiTree und Find a Grave – mit Geburts- und ggf. Ehenamen. Sie erscheinen nur bei Verstorbenen und öffnen die Suche erst beim Antippen.

## GEDCOM
- **Export** (Mehr → Export): GEDCOM 5.5.1 (lesen fast alle Programme), GEDCOM 7 oder GEDZIP mit Fotos. Lebende lassen sich anonymisieren. Der Belegstatus geht im Feld `_STAT` mit; Recherche, Notizen und Historie bleiben draußen.
- **Import** (Mehr → Import → GEDCOM): Jede Person der Datei wird mit deinem Baum abgeglichen. Zusammenführen schlägt die App nur bei gleichem Namen und passendem Geburtsdatum vor (oder gleicher ID bei einer eigenen Datei). Du entscheidest je Person: neu, zusammenführen, weglassen.
- Beim Zusammenführen wird **nichts überschrieben**: Fehlendes kommt dazu, Abweichendes wird als zusätzliche Angabe „unsicher/vorläufig“ mit Hinweis gespeichert. Jede übernommene Angabe verweist auf eine neue Quelle „GEDCOM-Datei …“. Rückgängig geht mit ↶.

## Leseansicht für Verwandte
Mehr → Export → **Leseansicht herunterladen** erzeugt eine einzelne HTML-Datei (Baum, Personen mit Belegstatus, auf Wunsch Chronik, Nachrufe, Fotos, Quellentitel). Sie lässt sich per Mail oder Messenger verschicken und ohne Internet öffnen. Lebende werden anonymisiert oder ganz weggelassen. **Selbst geschriebene Texte** in Chronik und Nachrufen werden nicht automatisch anonymisiert – vor dem Verschicken kurz prüfen.

Ein echter gemeinsamer Zugang für Verwandte ist bewusst nicht eingebaut: Mit dem OneDrive-App-Ordner ginge das nur mit Zugriff auf deinen gesamten OneDrive.
