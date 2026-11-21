# Stammbaum Seehafer

Private Stammbaum-App (PWA) für die Familienforschung Seehafer. Die Daten liegen in deinem OneDrive (`Apps/Stammbaum Seehafer/`) und offline auf dem Gerät. **Das Repository enthält keine Familiendaten.**

- Oberfläche: React, TypeScript, Tailwind. Der Baum ist SVG mit eigener Layout-Logik.
- Daten: IndexedDB (offline) und Microsoft Graph (App-Ordner), Anmeldung über MSAL.
- Datenformat: [docs/DATENFORMAT.md](docs/DATENFORMAT.md)

## Entwickeln

```powershell
npm install
npm run dev      # http://localhost:5173/stammbaum-seehafer/
npm test         # Tests: Import, Datumslogik, Zusammenführung, Export, Sicherungen
npm run build
```

Lokaler Test mit der echten Arbeitsmappe (schreibt nur in den git-ignorierten Ordner `private/`):

```powershell
$env:STAMMBAUM_XLSX="<Pfad zur Arbeitsmappe>.xlsx"
$env:STAMMBAUM_SUPPLEMENT="<Pfad zur Ergänzungsdatei>.json"
npx vitest run tests/local
```

## Einrichten

Siehe [docs/ANLEITUNG.md](docs/ANLEITUNG.md): App-Registrierung in Microsoft Entra, Veröffentlichung über GitHub Pages, Installation am Handy.
