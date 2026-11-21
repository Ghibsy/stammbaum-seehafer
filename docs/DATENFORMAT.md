# Datenformat `stammbaum.json` (schemaVersion 1)

Die Datei liegt in OneDrive unter `Apps/Stammbaum Seehafer/stammbaum.json`. Fotos und Audio liegen unter `medien/`, Sicherungen unter `backup/JJJJMMTT_HHMM_stammbaum.json`. Die maßgebliche Definition steht in `src/model/types.ts`.

## Grundsätze

- **Stabile IDs**: Personen `P001…`, unbenannte und Platzhalter `U001…`, Quellen `Q01…`, Recherche `F01…`, Familiennotizen `H01…`, Medien `M001…`, offene Fragen `O01…`. Neue IDs zählen ab dem höchsten Wert weiter. Lücken (zum Beispiel F09) werden nie neu vergeben.
- **Belegstatus je Angabe** (`status`): `belegt` (dokumentarisch belegt) · `familienangabe` · `abgeleitet` · `unsicher` · `widerlegt`. Widerlegte Angaben bleiben gespeichert, werden aber weder angezeigt noch exportiert.
- **Quellenzitate** (`citations`): `{ sourceId, detail? }` an Namen, Ereignissen, Beziehungen und Personen.
- **Historie** (`history`): überschriebene und zurückgenommene Werte mit Zeitpunkt und Grund.
- **Text** wird als Unicode NFC gespeichert (ł, ń, ą, ż, ś bleiben exakt erhalten). Die Suche nutzt zusätzlich eine Normalform ohne Diakritika.

## Sammlungen

| Feld | Inhalt |
|---|---|
| `persons` | Person: `kind` (benannt / unbenannt / platzhalter), `sex`, `living`, `names[]`, `events[]`, `tags[]` (Familienzweig), `links[]`, `citations[]`, `note`, `obituary`, `photoMediaId`, `legacy` (Werte aus Excel), `history[]`, `deletedAt` (Papierkorb) |
| `parentChild` | `parentId`, `childId`, `type` (leiblich / adoption / pflege / stief / unbekannt), `status`, `citations` |
| `partnerships` | `p1`, `p2`, `state` (verheiratet / paar / getrennt / geschieden / unbekannt), `events[]` (Heirat, Scheidung … mit `didNotHappen`) |
| `assertions` | Verwandtschaftsaussage ohne vollständigen Pfad: `geschwister`, `grosselternteil`, `enkel_geschwisterzweig`, `angegeben`, `verwandt_grad_offen` |
| `sources` | `id`, `title`, `type`, `author`, `date`, `url`, `previousUrls`, `proves`, `partner` (Gesprächspartner) |
| `media` | `file` (im App-Ordner) oder `url` (nur Link), `mime`, `title`, `description`, `targets[]` |
| `research` | Recherche-Fund, `adoptedAs` sobald als Person übernommen |
| `notes` | Familiennotiz (Überlieferung) mit `open` und `history` |
| `questions` | offene Prüfpunkte mit verknüpften Personen |
| `duplicates` | `moeglich` / `verschieden` / `zusammengefuehrt` (mit `snapshot` für Rückgängig) |

## Datumsangaben (`GenDate`)

`raw` enthält immer die Originaleingabe. Ausgewertet werden `qualifier` (`exakt`, `etwa`, `vor`, `nach`, `zwischen`, `unbekannt`), `y/m/d`, Jahresspannen `yFrom/yTo` (zum Beispiel 197x), `uncertain` (bei „?“ oder „vermutlich“) und `remark` (Text nach „;“). Tag und Monat ohne Jahr bleiben ohne Jahr. Die App ergänzt nie ein Jahr.

## Migration

`src/model/migrate.ts` hebt ältere Dateien schrittweise an. Bei einer Formatänderung erhöht man `SCHEMA_VERSION`, ergänzt eine Migrationsfunktion und aktualisiert diese Datei. Dateien aus einer neueren App-Version werden nicht überschrieben, sondern abgelehnt.

## Synchronisation

Die App lädt nur hoch, wenn die Datei in OneDrive noch denselben eTag hat (`If-Match`). Hat ein anderes Gerät inzwischen gespeichert, führt die App beide Stände mit dem letzten gemeinsamen Stand zusammen (`src/sync/merge.ts`). Änderungen an verschiedenen Feldern werden übernommen. Widersprüche im selben Feld gehen zur Entscheidung an dich. Vor einem Überschreiben entsteht höchstens einmal pro Stunde eine Sicherung. Aufbewahrt werden die letzten 30 Sicherungen sowie je die erste Sicherung der letzten 30 Tage.
