import { describe, expect, it } from 'vitest';
import { buildGedcom, gedDate } from '../src/io/gedcomExport';
import { applyGedcom, fromGedDate, matchPersons, parseGedcom, readGedcom } from '../src/io/gedcomImport';
import { formatGenDate, parseGenDate } from '../src/model/dates';
import { addParentChild, addPartnership, blankPerson, name } from '../src/model/ops';
import { birthDate, displayName, nameOf } from '../src/model/queries';
import { emptyDoc, type Sex, type TreeDoc } from '../src/model/types';

/** Erfundene Testfamilie – keine echten Daten */
function doc(): TreeDoc {
  const d = emptyDoc();
  const P = (id: string, sex: Sex, given: string, sur: string, birth?: string, birthName?: string) => {
    const p = blankPerson(id);
    p.sex = sex;
    p.names.push(name('vorname', given), name('nachname', sur));
    if (birthName) p.names.push(name('geburtsname', birthName, 'belegt'));
    if (birth) p.events.push({ id: `e${id}`, type: 'geburt', date: parseGenDate(birth), place: 'Neustadt', status: 'belegt', citations: [{ sourceId: 'Q01', detail: 'Nr. 12' }], mediaIds: [] });
    d.persons.push(p);
    return p;
  };
  d.sources.push({ id: 'Q01', title: 'Geburtsregister Neustadt', type: 'Register', createdAt: '', updatedAt: '' });
  P('P001', 'm', 'Max Otto', 'Muster', '03.05.1921').living = 'verstorben';
  P('P002', 'w', 'Berta', 'Muster', 'ca. 1925', 'Łącka').living = 'verstorben';
  P('P003', 'm', 'Karl', 'Muster', '197x').living = 'verstorben';
  const living = P('P004', 'w', 'Clara', 'Muster', '14.09.2001');
  living.living = 'lebt';
  const pa = addPartnership(d, 'P001', 'P002', 'verheiratet');
  pa.events.push({ id: 'h1', type: 'heirat', date: parseGenDate('vor 1950'), place: 'Neustadt', status: 'familienangabe', citations: [] });
  for (const k of ['P003', 'P004']) {
    addParentChild(d, 'P001', k);
    addParentChild(d, 'P002', k, 'leiblich', 'abgeleitet');
  }
  return d;
}

describe('GEDCOM-Datum', () => {
  it('übersetzt deutsche Datumsangaben ohne zu glätten', () => {
    expect(gedDate(parseGenDate('03.05.1921'), '7.0')).toEqual({ date: '3 MAY 1921' });
    expect(gedDate(parseGenDate('ca. 1925'), '7.0')).toEqual({ date: 'ABT 1925' });
    expect(gedDate(parseGenDate('vor 12.03.1971'), '7.0')).toEqual({ date: 'BEF 12 MAR 1971' });
    expect(gedDate(parseGenDate('197x'), '7.0')).toEqual({ date: 'BET 1970 AND 1979' });
    expect(gedDate(parseGenDate('06.06., Jahr unbekannt'), '7.0').date).toBeUndefined();
    expect(gedDate(parseGenDate('05.09.1994?'), '7.0').phrase).toContain('?');
  });
  it('liest GEDCOM-Daten zurück', () => {
    expect(formatGenDate(fromGedDate('ABT 1925'))).toBe('ca. 1925');
    expect(formatGenDate(fromGedDate('BEF 12 MAR 1971'))).toBe('vor 12.03.1971');
    expect(formatGenDate(fromGedDate('BET 1920 AND 1925'))).toBe('zwischen 1920 und 1925');
    expect(formatGenDate(fromGedDate('MAR 1930'))).toBe('03.1930');
    expect(fromGedDate('(Sommer nach dem Krieg)')?.qualifier).toBe('unbekannt');
  });
});

describe('GEDCOM-Export', () => {
  for (const version of ['5.5.1', '7.0'] as const) {
    it(`schreibt gültige Grundstruktur (${version})`, () => {
      const r = buildGedcom(doc(), { version, anonymizeLiving: true, includePlaceholders: true, withMedia: false });
      const t = r.text;
      expect(t.startsWith('0 HEAD')).toBe(true);
      expect(t.trimEnd().endsWith('0 TRLR')).toBe(true);
      expect(t).toContain(`VERS ${version}`);
      expect(t).toContain('1 NAME Max Otto /Muster/');
      expect(t).toContain('2 _STAT belegt');
      expect(t).toContain('3 QUAY 3');
      expect(t).toContain('2 DATE BEF 1950');
      // Lebende anonymisiert, Verknüpfung bleibt
      expect(t).not.toContain('Clara');
      expect(t).not.toContain('2001');
      expect(r.counts.anonymized).toBe(1);
      // Struktur: jede Zeile beginnt mit Ebene
      for (const l of t.trimEnd().split('\r\n')) expect(l).toMatch(/^\d+ (@[^@]+@ )?[A-Z_0-9]+/);
      const tree = parseGedcom(t);
      const fam = tree.filter((n) => n.tag === 'FAM');
      expect(fam).toHaveLength(1);
      expect(fam[0].children.filter((c) => c.tag === 'CHIL')).toHaveLength(2);
    });
  }
});

describe('GEDCOM-Import', () => {
  it('Rundreise: Export und Import in leere Datei ergibt dieselben Personen und Beziehungen', () => {
    const src = doc();
    const t = buildGedcom(src, { version: '7.0', anonymizeLiving: false, includePlaceholders: true, withMedia: false }).text;
    const ged = readGedcom(t);
    expect(ged.persons).toHaveLength(4);
    const target = emptyDoc();
    const res = applyGedcom(target, ged, {}, 'test.ged');
    expect(res.created).toHaveLength(4);
    const byName = (n: string) => target.persons.find((p) => displayName(p) === n)!;
    const berta = byName('Berta Muster');
    expect(nameOf(berta, 'geburtsname')).toBe('Łącka');
    expect(formatGenDate(birthDate(berta))).toBe('ca. 1925');
    // Belegstatus aus _STAT übernommen
    expect(byName('Max Otto Muster').events[0].status).toBe('belegt');
    expect(target.partnerships).toHaveLength(1);
    expect(target.partnerships[0].state).toBe('verheiratet');
    expect(target.parentChild).toHaveLength(4);
    expect(target.parentChild.filter((x) => x.status === 'abgeleitet')).toHaveLength(0); // Status je Elternteil geht in GEDCOM verloren
    // jede Angabe zitiert die Datei
    expect(berta.names.every((n) => n.citations.some((c) => c.sourceId === res.sourceId))).toBe(true);
  });

  it('erkennt vorhandene Personen und führt nur ergänzend zusammen', () => {
    const existing = doc();
    const ext = `0 HEAD
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Max /Muster/
1 SEX M
1 BIRT
2 DATE 3 MAY 1921
2 PLAC Neustadt
1 DEAT
2 DATE 1990
1 OCCU Schmied
0 @I2@ INDI
1 NAME Berta /Muster/
1 SEX F
1 BIRT
2 DATE 1926
0 @I3@ INDI
1 NAME Erich /Muster/
1 SEX M
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 TRLR`;
    const ged = readGedcom(ext);
    const rows = matchPersons(existing, ged);
    expect(rows.find((r) => r.xref === '@I1@')!.suggestion).toBe('P001'); // Name + Geburtsdatum
    expect(rows.find((r) => r.xref === '@I2@')!.suggestion).toBe('P002'); // ca. 1925 verträgt 1926
    expect(rows.find((r) => r.xref === '@I3@')!.suggestion).toBe('neu');
    const before = JSON.stringify(existing.persons.find((p) => p.id === 'P002')!.events);
    const decisions = Object.fromEntries(rows.map((r) => [r.xref, r.suggestion]));
    const res = applyGedcom(existing, ged, decisions, 'fremd.ged');
    const max = existing.persons.find((p) => p.id === 'P001')!;
    expect(max.events.filter((e) => e.type === 'geburt')).toHaveLength(1); // gleich → nur Quelle ergänzt
    expect(max.events.find((e) => e.type === 'geburt')!.citations.some((c) => c.sourceId === res.sourceId)).toBe(true);
    expect(max.events.find((e) => e.type === 'tod')?.status).toBe('unsicher');
    expect(max.events.find((e) => e.type === 'beruf')?.label).toBe('Schmied');
    // abweichende Geburt bei Berta: zusätzlich, alte bleibt unverändert
    const berta = existing.persons.find((p) => p.id === 'P002')!;
    expect(JSON.stringify(berta.events.slice(0, 1))).toBe(JSON.stringify(JSON.parse(before)));
    expect(berta.events.filter((e) => e.type === 'geburt')).toHaveLength(2);
    expect(res.merged.find((m) => m.id === 'P002')!.conflicts).toBe(1);
    // neues Kind an beide vorhandenen Eltern gehängt, Partnerschaft nicht doppelt
    const erich = existing.persons.find((p) => res.created.includes(p.id))!;
    expect(existing.parentChild.filter((x) => x.childId === erich.id).map((x) => x.parentId).sort()).toEqual(['P001', 'P002']);
    expect(existing.partnerships).toHaveLength(1);
  });

  it('übernimmt anonymisierte Lebende nicht automatisch', () => {
    const t = buildGedcom(doc(), { version: '5.5.1', anonymizeLiving: true, includePlaceholders: true, withMedia: false }).text;
    const ged = readGedcom(t);
    const rows = matchPersons(emptyDoc(), ged);
    expect(rows.filter((r) => r.suggestion === 'skip')).toHaveLength(1);
  });
});
