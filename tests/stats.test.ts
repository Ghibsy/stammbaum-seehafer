import { describe, expect, it } from 'vitest';
import { parseGenDate } from '../src/model/dates';
import { addParentChild, blankPerson, name } from '../src/model/ops';
import { computeStats } from '../src/model/stats';
import { emptyDoc, type Sex } from '../src/model/types';

describe('Statistik', () => {
  const doc = emptyDoc();
  const P = (id: string, sex: Sex, given: string, sur: string, birth?: string, death?: string, place?: string) => {
    const p = blankPerson(id);
    p.sex = sex;
    p.names.push(name('vorname', given), name('nachname', sur, 'belegt'));
    if (birth) p.events.push({ id: `b${id}`, type: 'geburt', date: parseGenDate(birth), place, status: 'familienangabe', citations: [], mediaIds: [] });
    if (death) {
      p.living = 'verstorben';
      p.events.push({ id: `d${id}`, type: 'tod', date: parseGenDate(death), status: 'unsicher', citations: [], mediaIds: [] });
    }
    doc.persons.push(p);
  };
  P('P001', 'm', 'Otto Max', 'Muster', '03.05.1901', '10.01.1980', 'Neustadt');
  P('P002', 'w', 'Anna', 'Muster', 'ca. 1905', '1990', 'Neustadt');
  P('P003', 'm', 'Otto', 'Muster', '1930', '1931');
  P('P004', 'w', 'Clara', 'Probe', '197x');
  addParentChild(doc, 'P001', 'P003');
  addParentChild(doc, 'P003', 'P004');

  const s = computeStats(doc, new Date('2026-11-22'));

  it('zählt Personen, Geschlechter und Status', () => {
    expect(s.persons).toBe(4);
    expect(s.sex).toEqual({ m: 2, w: 2, other: 0 });
    expect(s.deceased).toBe(3);
    expect(s.status.belegt).toBe(4);
    expect(s.status.unsicher).toBe(3);
  });
  it('ordnet Geburten Jahrzehnten zu, ohne Spannen zu raten', () => {
    expect(s.birthsByDecade).toEqual([
      { decade: 1900, count: 2 },
      { decade: 1930, count: 1 },
      { decade: 1970, count: 1 },
    ]);
  });
  it('berechnet Lebensalter nur bei eindeutigen Angaben', () => {
    // P002 (ca. 1905 – 1990) hat eine Altersspanne > 1 Jahr und zählt nicht mit
    expect(s.lifespan!.max.id).toBe('P001');
    expect(s.lifespan!.min.age).toBe(0);
  });
  it('häufigste Namen, Orte und Generationen', () => {
    expect(s.givenNames[0]).toEqual({ name: 'Otto', count: 2 });
    expect(s.surnames[0]).toEqual({ name: 'Muster', count: 3 });
    expect(s.birthPlaces[0]).toEqual({ name: 'Neustadt', count: 2 });
    expect(s.generations).toBe(3);
  });
});
