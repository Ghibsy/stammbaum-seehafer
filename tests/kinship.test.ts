import { describe, expect, it } from 'vitest';
import { bloodTerm, kinship } from '../src/model/kinship';
import { addParentChild, addPartnership, blankPerson, createPlaceholderParents, name } from '../src/model/ops';
import type { Sex, TreeDoc } from '../src/model/types';
import { emptyDoc } from '../src/model/types';

/** Erfundene Familie (Beispiel aus der Spezifikation) */
function family(): TreeDoc {
  const doc = emptyDoc();
  const P = (id: string, given: string, sex: Sex) => {
    const p = blankPerson(id);
    p.sex = sex;
    p.names.push(name('vorname', given), name('nachname', 'Test'));
    doc.persons.push(p);
  };
  P('P01', 'Heinrich', 'm');
  P('P02', 'Erna', 'w');
  P('P03', 'Klaus', 'm');
  P('P04', 'Ingrid', 'w');
  P('P05', 'Monika', 'w');
  P('P06', 'Rolf', 'm');
  P('P07', 'Peter', 'm');
  P('P08', 'Sabine', 'w');
  P('P09', 'Thomas', 'm');
  P('P10', 'Anna', 'w');
  P('P11', 'Lena', 'w');
  P('P12', 'Gisela', 'w');
  P('P13', 'Karl', 'm');
  P('P14', 'Xaver', 'm');
  P('P15', 'Yvonne', 'w');
  addPartnership(doc, 'P01', 'P02', 'verheiratet');
  for (const k of ['P03', 'P04']) {
    addParentChild(doc, 'P01', k);
    addParentChild(doc, 'P02', k);
  }
  addPartnership(doc, 'P03', 'P05', 'geschieden');
  addParentChild(doc, 'P03', 'P07');
  addParentChild(doc, 'P05', 'P07');
  addPartnership(doc, 'P04', 'P06', 'verheiratet');
  for (const k of ['P08', 'P09']) {
    addParentChild(doc, 'P04', k);
    addParentChild(doc, 'P06', k);
  }
  addPartnership(doc, 'P07', 'P10', 'verheiratet');
  addParentChild(doc, 'P07', 'P11');
  addParentChild(doc, 'P10', 'P11');
  // Halbbruder: Klaus mit Gisela
  addParentChild(doc, 'P03', 'P13');
  addParentChild(doc, 'P12', 'P13');
  // Geschwister nur über Platzhalter-Eltern
  createPlaceholderParents(doc, ['P14', 'P15']);
  return doc;
}

describe('Verwandtschaftsrechner', () => {
  const doc = family();
  const k = (a: string, b: string) => kinship(doc, a, b);

  it('Beispiel aus der Spezifikation: Cousine 1. Grades, 1 Generation versetzt, 6,25 %', () => {
    const r = k('P11', 'P08'); // Sabine aus Sicht von Lena
    expect(r.term).toBe('Cousine 1. Grades, 1 Generation versetzt');
    expect(r.dna).toBeCloseTo(0.0625);
    expect(r.commonAncestors.sort()).toEqual(['P01', 'P02']);
    expect(r.path[0]).toBe('P11');
    expect(r.path[r.path.length - 1]).toBe('P08');
  });

  it('direkte Linie', () => {
    expect(k('P07', 'P03').term).toBe('Vater');
    expect(k('P07', 'P05').term).toBe('Mutter');
    expect(k('P03', 'P11').term).toBe('Enkelin');
    expect(k('P11', 'P01').term).toBe('Urgroßvater');
    expect(k('P01', 'P11').term).toBe('Urenkelin');
    expect(k('P07', 'P03').dna).toBeCloseTo(0.5);
  });

  it('Geschwister, Onkel/Tante, Neffe/Nichte', () => {
    expect(k('P08', 'P09').term).toBe('Bruder');
    expect(k('P08', 'P09').dna).toBeCloseTo(0.5);
    expect(k('P07', 'P04').term).toBe('Tante');
    expect(k('P04', 'P07').term).toBe('Neffe');
    expect(k('P11', 'P04').term).toBe('Großtante');
    expect(k('P04', 'P11').term).toBe('Großnichte');
    expect(k('P07', 'P08').term).toBe('Cousine 1. Grades');
    expect(k('P07', 'P08').dna).toBeCloseTo(0.125);
  });

  it('Halbgeschwister', () => {
    const r = k('P07', 'P13');
    expect(r.term).toBe('Halbbruder');
    expect(r.half).toBe(true);
    expect(r.dna).toBeCloseTo(0.25);
  });

  it('Platzhalter-Eltern: Geschwister, aber als unsicher markiert', () => {
    const r = k('P14', 'P15');
    expect(r.term).toBe('Schwester');
    expect(r.uncertain).toBe(true);
    expect(r.uncertainReasons.join(' ')).toContain('Platzhalter');
  });

  it('Schwägerschaft', () => {
    expect(k('P07', 'P10').term).toBe('Ehefrau/Partnerin');
    expect(k('P10', 'P03').term).toBe('Schwiegervater');
    expect(k('P03', 'P10').term).toBe('Schwiegertochter');
    expect(k('P06', 'P03').term).toBe('Schwager');
    expect(k('P06', 'P03').kind).toBe('ehe');
    expect(k('P06', 'P03').dna).toBeUndefined();
  });

  it('keine Verbindung und dieselbe Person', () => {
    expect(k('P14', 'P01').kind).toBe('keine');
    expect(k('P01', 'P01').term).toBe('dieselbe Person');
  });

  it('abgeleitete Beziehung macht das Ergebnis unsicher', () => {
    const d = family();
    d.parentChild.find((x) => x.parentId === 'P03' && x.childId === 'P07')!.status = 'abgeleitet';
    const r = kinship(d, 'P07', 'P08');
    expect(r.uncertain).toBe(true);
  });
});

describe('Bezeichnungen', () => {
  it('Ur-Vorsilben und Grade', () => {
    expect(bloodTerm(5, 0, 'm', false)).toBe('Ururgroßvater'.replace('Urur', 'Ururur'));
    expect(bloodTerm(0, 4, 'w', false)).toBe('Ururenkelin');
    expect(bloodTerm(4, 1, 'm', false)).toBe('Urgroßonkel');
    expect(bloodTerm(1, 4, 'w', false)).toBe('Urgroßnichte');
    expect(bloodTerm(3, 3, 'w', false)).toBe('Cousine 2. Grades');
    expect(bloodTerm(3, 5, 'm', true)).toBe('Halbcousin 2. Grades, 2 Generationen versetzt');
    expect(bloodTerm(2, 2, 'u', false)).toBe('Cousin/Cousine 1. Grades');
    expect(bloodTerm(1, 2, 'u', true)).toBe('Halbneffe/Nichte'.replace('/Nichte', '/Nichte'));
  });
});
