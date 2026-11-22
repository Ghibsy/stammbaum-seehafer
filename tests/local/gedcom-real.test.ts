import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildGedcom } from '../../src/io/gedcomExport';
import { applyGedcom, matchPersons, readGedcom } from '../../src/io/gedcomImport';
import { migrate } from '../../src/model/migrate';
import { emptyDoc } from '../../src/model/types';

/** Lokal mit echten Daten (STAMMBAUM_JSON). Ausgaben nur in private/. */
const file = process.env.STAMMBAUM_JSON;

describe.skipIf(!file || !existsSync(file))('GEDCOM mit echten Daten', () => {
  it('Export → Import ergibt gleiche Struktur; Abgleich erkennt alle als vorhanden', () => {
    const doc = migrate(JSON.parse(readFileSync(file!, 'utf8')));
    const active = doc.persons.filter((p) => !p.deletedAt);
    for (const v of ['5.5.1', '7.0'] as const) {
      const r = buildGedcom(doc, { version: v, anonymizeLiving: false, includePlaceholders: true, withMedia: true });
      mkdirSync('private', { recursive: true });
      writeFileSync(`private/export-${v}.ged`, r.text, 'utf8');
      for (const l of r.text.trimEnd().split('\r\n')) expect(l, l).toMatch(/^\d+ (@[^@]+@ )?[A-Z_0-9]+( .*)?$/);
      const ged = readGedcom(r.text);
      expect(ged.persons).toHaveLength(active.length);
      const t = emptyDoc();
      applyGedcom(t, ged, {}, 'x.ged');
      const pc = doc.parentChild.filter((x) => x.status !== 'widerlegt' && active.some((p) => p.id === x.childId) && active.some((p) => p.id === x.parentId)).length;
      console.log(v, 'Personen', t.persons.length, 'Eltern-Kind', t.parentChild.length, '/', pc, 'Partner', t.partnerships.length, 'Aussagen', t.assertions.length, '/', doc.assertions.length);
      const rows = matchPersons(doc, ged);
      const named = rows.filter((x) => x.candidates.length);
      console.log(v, 'Treffer vorgeschlagen', rows.filter((x) => x.suggestion !== 'neu' && x.suggestion !== 'skip').length, 'mit Kandidaten', named.length, 'von', rows.length);
    }
  });
});
