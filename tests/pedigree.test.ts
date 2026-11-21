import { describe, expect, it } from 'vitest';
import { computeFan } from '../src/tree/fan';
import { overlaps, pedigreeLayout } from '../src/tree/pedigree';
import { addParentChild, addPartnership, blankPerson, name } from '../src/model/ops';
import type { Sex, TreeDoc } from '../src/model/types';
import { emptyDoc } from '../src/model/types';

/** Erfundene Familie über vier Generationen */
function family(): TreeDoc {
  const doc = emptyDoc();
  const P = (id: string, sex: Sex) => {
    const p = blankPerson(id);
    p.sex = sex;
    p.names.push(name('vorname', id), name('nachname', 'Test'));
    doc.persons.push(p);
  };
  // Urgroßeltern, Großeltern, Eltern, Kind
  for (const id of ['A1', 'A3', 'A5', 'A7', 'G1', 'G3', 'V1', 'K1', 'K2', 'E1']) P(id, 'm');
  for (const id of ['A2', 'A4', 'A6', 'A8', 'G2', 'G4', 'M1', 'S1', 'PK']) P(id, 'w');
  const couple = (a: string, b: string, kids: string[]) => {
    addPartnership(doc, a, b, 'verheiratet');
    for (const k of kids) {
      addParentChild(doc, a, k);
      addParentChild(doc, b, k);
    }
  };
  couple('A1', 'A2', ['G1']);
  couple('A3', 'A4', ['G2']);
  couple('A5', 'A6', ['G3']);
  couple('A7', 'A8', ['G4']);
  couple('G1', 'G2', ['V1']);
  couple('G3', 'G4', ['M1']);
  couple('V1', 'M1', ['K1', 'S1', 'K2']);
  couple('K1', 'PK', ['E1']);
  return doc;
}

describe('Ansichten ab einer Ausgangsperson', () => {
  const doc = family();

  it('Vorfahren: alle Ahnen bis zur gewählten Generation, ohne Überlappung', () => {
    const l = pedigreeLayout(doc, { mode: 'vorfahren', focusId: 'K1', genUp: 3, genDown: 0, showPartners: false });
    expect(l.nodes.size).toBe(1 + 2 + 4 + 8);
    expect(overlaps(l)).toEqual([]);
    // Eltern stehen eine Ebene über dem Kind
    expect(l.nodes.get('V1')!.layer).toBe(l.nodes.get('K1')!.layer - 1);
    // Generationsgrenze
    expect(pedigreeLayout(doc, { mode: 'vorfahren', focusId: 'K1', genUp: 1, genDown: 0, showPartners: false }).nodes.size).toBe(3);
  });

  it('Nachfahren mit und ohne Partner', () => {
    const withP = pedigreeLayout(doc, { mode: 'nachfahren', focusId: 'G1', genUp: 0, genDown: 3, showPartners: true });
    expect([...withP.nodes.keys()].sort()).toEqual(['E1', 'G1', 'G2', 'K1', 'K2', 'M1', 'PK', 'S1', 'V1'].sort());
    expect(overlaps(withP)).toEqual([]);
    const without = pedigreeLayout(doc, { mode: 'nachfahren', focusId: 'G1', genUp: 0, genDown: 3, showPartners: false });
    expect(without.nodes.has('G2')).toBe(false);
    expect(without.nodes.has('E1')).toBe(true);
  });

  it('Sanduhr verbindet beides an der Ausgangsperson', () => {
    const l = pedigreeLayout(doc, { mode: 'sanduhr', focusId: 'V1', genUp: 2, genDown: 2, showPartners: true });
    expect(l.nodes.has('A1')).toBe(true);
    expect(l.nodes.has('E1')).toBe(true);
    expect(l.nodes.get('A1')!.layer).toBeLessThan(l.nodes.get('V1')!.layer);
    expect(l.nodes.get('E1')!.layer).toBeGreaterThan(l.nodes.get('V1')!.layer);
    expect(overlaps(l)).toEqual([]);
  });

  it('Fächer: Vater links, Mutter rechts, leere Felder für fehlende Ahnen', () => {
    const f = computeFan(doc, 'K1', 4);
    const gen1 = f.slots.filter((s) => s.gen === 1);
    expect(gen1.map((s) => s.person?.id)).toEqual(['V1', 'M1']);
    expect(f.slots.filter((s) => s.gen === 3).every((s) => s.person)).toBe(true);
    expect(f.slots.filter((s) => s.gen === 4).every((s) => !s.person)).toBe(true); // keine Ururgroßeltern erfasst
    expect(f.persons).toBe(15);
  });
});
