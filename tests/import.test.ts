import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { importWorkbook } from '../src/io/excelImport';
import { buildWorkbook, exportFileName, workbookToBytes } from '../src/io/excelExport';
import { applySupplement, type SupplementItem } from '../src/io/supplement';
import { createPlaceholderParents, mergePersons, undoMerge } from '../src/model/ops';
import { Index, nameOf } from '../src/model/queries';
import { search } from '../src/model/search';
import { buildFixture } from './fixture';

const imp = () => importWorkbook(buildFixture(), 'fixture.xlsx');
const P = (doc: ReturnType<typeof imp>['doc'], id: string) => doc.persons.find((p) => p.id === id)!;

describe('Excel-Import', () => {
  it('übernimmt Personen mit stabilen IDs und ignoriert Hinweisblock und Grafikblätter', () => {
    const { doc, report } = imp();
    expect(doc.persons.map((p) => p.id)).toEqual(['P001', 'P002', 'P003', 'P004', 'P005', 'U001', 'P006']);
    expect(report.counts.Personen).toBe(7);
    expect(doc.meta.importNotes).toContain('Weiterarbeiten: Hinweistext');
  });

  it('Namen, Geburtsname, Varianten, Sonderzeichen', () => {
    const { doc } = imp();
    const anna = P(doc, 'P003');
    expect(nameOf(anna, 'geburtsname')).toBe('Łącka');
    expect(anna.names.find((n) => n.type === 'rufname')?.value).toBe('Ania');
    expect(anna.names.find((n) => n.type === 'variante')).toMatchObject({ value: 'Anna Łącka', note: 'polnische Suchform' });
    // leerer Geburtsname bleibt unbekannt
    expect(nameOf(P(doc, 'P001'), 'geburtsname')).toBeUndefined();
  });

  it('U-IDs werden unbenannte Personen mit Platzhalter-Bezeichnung', () => {
    const { doc } = imp();
    const u = P(doc, 'U001');
    expect(u.kind).toBe('unbenannt');
    expect(nameOf(u, 'platzhalter')).toBe('Unbekannter Sohn von Anna');
    expect(nameOf(u, 'vorname')).toBeUndefined();
  });

  it('exakte Daten mit passender Grabregister-Quelle werden „belegt“', () => {
    const { doc } = imp();
    const anna = P(doc, 'P003');
    const birth = anna.events.find((e) => e.type === 'geburt')!;
    expect(birth.date).toMatchObject({ y: 1921, m: 5, d: 3 });
    expect(birth.status).toBe('belegt');
    expect(birth.citations).toEqual([{ sourceId: 'Q02' }]);
    const death = anna.events.find((e) => e.type === 'tod')!;
    expect(death.status).toBe('belegt');
    const burial = anna.events.find((e) => e.type === 'bestattung')!;
    expect(burial).toMatchObject({ place: 'Friedhof Musterstadt', address: 'A / 1 / 23' });
    expect(anna.living).toBe('verstorben');
    // Familiengespräch belegt nichts dokumentarisch
    expect(P(doc, 'P001').events.find((e) => e.type === 'geburt')!.status).toBe('familienangabe');
  });

  it('unsichere und unvollständige Angaben', () => {
    const { doc } = imp();
    const berta = P(doc, 'P002');
    const b = berta.events.find((e) => e.type === 'geburt')!;
    expect(b.date).toMatchObject({ d: 6, m: 6 });
    expect(b.date!.y).toBeUndefined();
    expect(b.placeStatus).toBe('unsicher');
    const karl = P(doc, 'P004');
    expect(karl.events.find((e) => e.type === 'herkunft')!.place).toContain('Ostpreußen');
    expect(karl.events.find((e) => e.type === 'geburt')).toBeUndefined();
    expect(karl.events.find((e) => e.type === 'tod')!.date).toMatchObject({ qualifier: 'vor', y: 1971 });
    const clara = P(doc, 'P005');
    expect(clara.events.find((e) => e.type === 'tod')!.status).toBe('unsicher');
  });

  it('Beziehungen: Eltern-Kind leiblich, Partnerschaft, Aussagen mit Status', () => {
    const { doc } = imp();
    expect(doc.parentChild).toHaveLength(3);
    expect(doc.parentChild.every((x) => x.type === 'leiblich')).toBe(true);
    const derived = doc.parentChild.find((x) => x.childId === 'P006')!;
    expect(derived.status).toBe('abgeleitet');
    expect(doc.partnerships[0]).toMatchObject({ p1: 'P001', p2: 'P002', state: 'verheiratet' });
    const fb = doc.assertions.find((a) => a.kind === 'angegeben')!;
    expect(fb.status).toBe('unsicher');
    expect(fb.citations).toEqual([{ sourceId: 'Q13' }]);
    expect(doc.assertions.filter((a) => a.kind === 'geschwister')).toHaveLength(2);
    expect(doc.assertions.filter((a) => a.kind === 'enkel_geschwisterzweig')).toHaveLength(1);
  });

  it('Geschlecht aus Beziehungstext (in Prüfliste)', () => {
    const { doc, report } = imp();
    expect(P(doc, 'P001').sex).toBe('m');
    expect(P(doc, 'P002').sex).toBe('w');
    expect(P(doc, 'P006').sex).toBe('w');
    expect(report.review.some((r) => r.personId === 'P001' && r.topic === 'Geschlecht')).toBe(true);
  });

  it('Bericht: Lücken, Quellentypen, Platzhalter-Vorschlag', () => {
    const { doc, report } = imp();
    expect(report.warnings).toContain('Recherche: ID F02 fehlt in der Datei (Lücke, wird nicht neu vergeben).');
    expect(doc.sources.find((s) => s.id === 'Q02')!.type).toBe('Grabregister');
    expect(doc.sources.find((s) => s.id === 'Q01')!.type).toBe('Familiengespräch');
    // Anna hat keine Eltern, Geschwister Karl und Clara → ein Vorschlag
    expect(report.placeholderProposals).toHaveLength(1);
    expect(report.placeholderProposals[0].memberIds).toEqual(['P003', 'P004', 'P005']);
  });

  it('Platzhalter-Eltern verbinden die Geschwister', () => {
    const { doc } = imp();
    const ph = createPlaceholderParents(doc, ['P003', 'P004', 'P005']);
    expect(ph.id).toBe('U002');
    expect(ph.kind).toBe('platzhalter');
    const idx = new Index(doc);
    expect(idx.siblings('P003').map((s) => s.id).sort()).toEqual(['P004', 'P005']);
    expect(doc.parentChild.filter((x) => x.parentId === ph.id).every((x) => x.status === 'abgeleitet')).toBe(true);
  });
});

describe('Suche', () => {
  it('findet Varianten, ohne Diakritika und über IDs', () => {
    const { doc } = imp();
    expect(search(doc, 'lacka').map((h) => h.id)).toContain('P003');
    expect(search(doc, 'Łącka').map((h) => h.id)).toContain('P003');
    expect(search(doc, 'ania')[0].id).toBe('P003');
    expect(search(doc, 'P004')[0].id).toBe('P004');
    expect(search(doc, 'Q02').some((h) => h.kind === 'source')).toBe(true);
    expect(search(doc, 'F01').some((h) => h.kind === 'research')).toBe(true);
  });
});

describe('Zusammenführen mit Rückgängig', () => {
  it('führt zusammen und stellt exakt wieder her', () => {
    const { doc } = imp();
    const before = structuredClone(doc);
    const pair = mergePersons(doc, 'P004', 'U001');
    expect(doc.persons.find((p) => p.id === 'U001')).toBeUndefined();
    expect(doc.parentChild.some((x) => x.childId === 'P004' && x.parentId === 'P003')).toBe(true);
    undoMerge(doc, pair.id);
    const sortById = <T extends { id: string }>(a: T[]) => [...a].sort((x, y) => x.id.localeCompare(y.id));
    expect(sortById(doc.persons)).toEqual(sortById(before.persons));
    expect(sortById(doc.parentChild)).toEqual(sortById(before.parentChild));
  });
});

describe('Ergänzungen', () => {
  it('wendet nur gewählte Einträge an und protokolliert', () => {
    const { doc } = imp();
    const items: SupplementItem[] = [
      {
        id: 'K1',
        title: 'Test',
        excel: 'alt',
        supplement: 'neu',
        recommendation: 'uebernehmen',
        ops: [
          { op: 'addSource', source: { id: 'Q33', title: 'Anzeige', type: 'Anzeige' } },
          { op: 'setEventStatus', personId: 'P001', eventType: 'geburt', status: 'belegt', addCitation: { sourceId: 'Q33' } },
          { op: 'addRetractedName', personId: 'P001', nameType: 'vorname', value: 'Gustav', reason: 'falscher Vorname' },
          { op: 'replaceNote', id: 'H01', set: { text: 'korrigiert' }, reason: 'Fehler' },
          { op: 'addEvent', personId: 'P999', event: { type: 'tod', status: 'unsicher' } },
        ],
      },
    ];
    const log = applySupplement(doc, items);
    expect(log.some((l) => l.includes('FEHLER') && l.includes('P999'))).toBe(true);
    const max = P(doc, 'P001');
    expect(max.events.find((e) => e.type === 'geburt')!.status).toBe('belegt');
    expect(max.names.find((n) => n.value === 'Gustav')!.status).toBe('widerlegt');
    expect(nameOf(max, 'vorname')).toBe('Max Otto'); // widerlegter Name wird nicht angezeigt
    expect(doc.notes[0].text).toBe('korrigiert');
    expect(doc.notes[0].history).toHaveLength(1);
    // Suche findet frühere Angabe, markiert sie
    expect(search(doc, 'Gustav')[0].via).toContain('frühere Angabe');
  });
});

describe('Excel-Export', () => {
  it('Rundreise: Export → Import ergibt dieselben Kernangaben', () => {
    const { doc } = imp();
    const wb = buildWorkbook(doc, { anonymizeLiving: false });
    const again = importWorkbook(XLSX.read(workbookToBytes(wb), { type: 'array' }), 'export.xlsx').doc;
    expect(again.persons.map((p) => p.id)).toEqual(doc.persons.map((p) => p.id));
    const a1 = P(again, 'P003');
    expect(nameOf(a1, 'geburtsname')).toBe('Łącka');
    expect(a1.events.find((e) => e.type === 'geburt')!.date).toMatchObject({ y: 1921, m: 5, d: 3 });
    expect(P(again, 'P005').events.find((e) => e.type === 'geburt')!.date).toMatchObject({ yFrom: 1980, yTo: 1989 });
    expect(again.parentChild).toHaveLength(doc.parentChild.length);
    expect(again.partnerships).toHaveLength(doc.partnerships.length);
    expect(again.assertions).toHaveLength(doc.assertions.length);
  });

  it('exportiert keine widerlegten Angaben', () => {
    const { doc } = imp();
    applySupplement(doc, [{ id: 'X', title: '', excel: '', supplement: '', recommendation: 'uebernehmen', ops: [{ op: 'addRetractedName', personId: 'P001', nameType: 'rufname', value: 'Gustav', reason: 'falsch' }] }]);
    const wb = buildWorkbook(doc, { anonymizeLiving: false });
    const json = JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets['Personen'], { header: 1 }));
    expect(json).not.toContain('Gustav');
  });

  it('anonymisiert lebende Personen', () => {
    const { doc } = imp();
    const wb = buildWorkbook(doc, { anonymizeLiving: true, now: new Date(2026, 10, 20) });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Personen'], { header: 1 });
    const max = rows.find((r) => r[0] === 'P001')!;
    expect(max[4]).toBe('Lebende Person');
    expect(max[7] ?? '').toBe('');
    expect(JSON.stringify(rows)).not.toContain('https://example.org/b');
    // Verstorbene bleiben vollständig
    const anna = rows.find((r) => r[0] === 'P003')!;
    expect(anna[4]).toBe('Anna');
  });

  it('Dateiname nach Schema', () => {
    expect(exportFileName('Gesamt', 'xlsx', new Date(2026, 10, 20))).toBe('20261120_Stammbaum_Gesamt.xlsx');
  });
});
