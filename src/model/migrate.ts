import { SCHEMA_VERSION, type TreeDoc } from './types';

/**
 * Migrationen für stammbaum.json. Jede Funktion hebt das Format um genau eine Version an.
 * Neue Versionen: Funktion ergänzen, SCHEMA_VERSION erhöhen, docs/DATENFORMAT.md aktualisieren.
 */
const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {
  // 1: (d) => ({ ...d, schemaVersion: 2, neuesFeld: [] }),
};

export function migrate(raw: unknown): TreeDoc {
  if (!raw || typeof raw !== 'object') throw new Error('Keine gültige Stammbaum-Datei');
  let d = raw as Record<string, unknown>;
  let v = typeof d.schemaVersion === 'number' ? d.schemaVersion : 0;
  if (v > SCHEMA_VERSION) throw new Error(`Die Datei hat Format-Version ${v}; diese App kennt nur bis ${SCHEMA_VERSION}. Bitte App aktualisieren.`);
  if (v === 0) throw new Error('Datei ohne schemaVersion – kein Stammbaum-Seehafer-Format');
  while (v < SCHEMA_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`Keine Migration von Version ${v}`);
    d = m(d);
    v = d.schemaVersion as number;
  }
  // fehlende Sammlungen ergänzen (robust gegen ältere Teilstände)
  for (const k of ['persons', 'parentChild', 'partnerships', 'assertions', 'sources', 'media', 'research', 'notes', 'questions', 'duplicates', 'evidence']) {
    if (!Array.isArray(d[k])) d[k] = [];
  }
  return d as unknown as TreeDoc;
}
