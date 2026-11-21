import { describe, expect, it } from 'vitest';
import { runChecks } from '../src/model/checks';
import { parseGenDate } from '../src/model/dates';
import { uid } from '../src/model/ids';
import { addParentChild, addPartnership, blankPerson, createPlaceholderParents, name, setDuplicateVerdict } from '../src/model/ops';
import type { Sex, TreeDoc } from '../src/model/types';
import { emptyDoc } from '../src/model/types';

function person(doc: TreeDoc, id: string, given: string, sur: string, sex: Sex, birth?: string, death?: string, kind: 'benannt' | 'unbenannt' = 'benannt') {
  const p = blankPerson(id, kind);
  p.sex = sex;
  if (kind === 'unbenannt') p.names.push(name('platzhalter', given));
  else p.names.push(name('vorname', given), name('nachname', sur));
  if (birth) p.events.push({ id: uid('e'), type: 'geburt', date: parseGenDate(birth), status: 'familienangabe', citations: [], mediaIds: [] });
  if (death) {
    p.events.push({ id: uid('e'), type: 'tod', date: parseGenDate(death), status: 'familienangabe', citations: [], mediaIds: [] });
    p.living = 'verstorben';
  }
  p.citations = [{ sourceId: 'Q01' }];
  doc.persons.push(p);
  return p;
}

const now = new Date(2026, 10, 21);

describe('Konsistenzprüfung', () => {
  it('Kind älter als Elternteil (Tippfehler 1891 statt 1981)', () => {
    const d = emptyDoc();
    person(d, 'P01', 'Rolf', 'Weber', 'm', '1950');
    person(d, 'P02', 'Thomas', 'Weber', 'm', '1891');
    addParentChild(d, 'P01', 'P02');
    const f = runChecks(d, now);
    expect(f.some((x) => x.rule === 'kind_aelter' && x.severity === 'fehler')).toBe(true);
  });

  it('Tod vor Geburt, zu alt, Geburt nach Tod der Mutter', () => {
    const d = emptyDoc();
    person(d, 'P01', 'A', 'X', 'm', '1950', '1940');
    person(d, 'P02', 'B', 'X', 'w', '1880');
    person(d, 'P03', 'C', 'X', 'w', '1900', '1930');
    person(d, 'P04', 'D', 'X', 'm', '1935');
    addParentChild(d, 'P03', 'P04');
    const rules = runChecks(d, now).map((x) => x.rule);
    expect(rules).toContain('tod_vor_geburt');
    expect(rules).toContain('zu_alt');
    expect(rules).toContain('nach_tod_geboren');
  });

  it('ungefähre Daten werden mit Spielraum geprüft – kein Fehlalarm', () => {
    const d = emptyDoc();
    person(d, 'P01', 'Vater', 'X', 'm', 'ca. 1950');
    person(d, 'P02', 'Kind', 'X', 'm', 'ca. 1952');
    addParentChild(d, 'P01', 'P02');
    expect(runChecks(d, now).filter((x) => x.rule === 'kind_aelter')).toHaveLength(0);
  });

  it('unplausibles Elternalter', () => {
    const d = emptyDoc();
    person(d, 'P01', 'Mutter', 'X', 'w', '1950');
    person(d, 'P02', 'Kind', 'X', 'm', '1960');
    addParentChild(d, 'P01', 'P02');
    expect(runChecks(d, now).some((x) => x.rule === 'elternalter')).toBe(true);
  });

  it('Belegstand: Beziehungen und Personen ohne Quelle, Platzhalter ausgenommen', () => {
    const d = emptyDoc();
    person(d, 'P01', 'A', 'X', 'm');
    const b = person(d, 'P02', 'B', 'X', 'w');
    b.citations = [];
    addPartnership(d, 'P01', 'P02');
    createPlaceholderParents(d, ['P01', 'P02']);
    const f = runChecks(d, now);
    expect(f.filter((x) => x.rule === 'beziehung_ohne_beleg')).toHaveLength(1); // nur die Partnerschaft
    expect(f.filter((x) => x.rule === 'person_ohne_quelle').map((x) => x.personIds[0])).toEqual(['P02']);
  });

  it('Dubletten: gleicher Name; namenlose Geschwister; „verschieden“ unterdrückt die Meldung', () => {
    const d = emptyDoc();
    person(d, 'P01', 'Erika', 'Beispiel', 'w');
    person(d, 'P02', 'Erika', 'Beispiel', 'w', '1990');
    person(d, 'P03', 'Rosa', 'X', 'w');
    person(d, 'U01', 'Großmutter von A', '', 'w', undefined, undefined, 'unbenannt');
    person(d, 'U02', 'Großmutter von B', '', 'w', undefined, undefined, 'unbenannt');
    createPlaceholderParents(d, ['P03', 'U01', 'U02']);
    let dup = runChecks(d, now).filter((x) => x.rule === 'dublette');
    expect(dup.map((x) => x.personIds.sort().join('+')).sort()).toEqual(['P01+P02', 'U01+U02']);
    setDuplicateVerdict(d, 'P01', 'P02', 'verschieden');
    dup = runChecks(d, now).filter((x) => x.rule === 'dublette');
    expect(dup.map((x) => x.personIds.sort().join('+'))).toEqual(['U01+U02']);
  });

  it('Fehler zuerst sortiert', () => {
    const d = emptyDoc();
    person(d, 'P01', 'A', 'X', 'm', '1950', '1940');
    const b = person(d, 'P02', 'B', 'X', 'w');
    b.citations = [];
    const f = runChecks(d, now);
    expect(f[0].severity).toBe('fehler');
  });
});
