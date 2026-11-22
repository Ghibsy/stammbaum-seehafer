import { describe, expect, it } from 'vitest';
import { addParentChild, addPartnership, blankPerson, name } from '../src/model/ops';
import type { Sex, TreeDoc } from '../src/model/types';
import { emptyDoc } from '../src/model/types';
import { computeLayout } from '../src/tree/layout';
import { stammVisible } from '../src/tree/stamm';

/**
 * Erfundene Familie: Stammeltern A+B → Sohn C (∞ D, eingeheiratet) → Enkel E.
 * D hat eigene Eltern F+G und einen Bruder H. Außerdem eine unverbundene Person Z.
 */
function family(): TreeDoc {
  const doc = emptyDoc();
  const P = (id: string, sex: Sex) => {
    const p = blankPerson(id);
    p.sex = sex;
    p.names.push(name('vorname', id), name('nachname', 'Test'));
    doc.persons.push(p);
  };
  for (const [id, s] of [['A', 'm'], ['B', 'w'], ['C', 'm'], ['D', 'w'], ['E', 'w'], ['F', 'm'], ['G', 'w'], ['H', 'm'], ['Z', 'w']] as [string, Sex][]) P(id, s);
  const couple = (a: string, b: string, kids: string[]) => {
    addPartnership(doc, a, b, 'verheiratet');
    for (const k of kids) {
      addParentChild(doc, a, k);
      addParentChild(doc, b, k);
    }
  };
  couple('A', 'B', ['C']);
  couple('C', 'D', ['E']);
  couple('F', 'G', ['D', 'H']);
  return doc;
}

describe('Ansicht „Stammbaum“ mit aufklappbaren Zweigen', () => {
  const doc = family();

  it('zeigt anfangs nur die Nachfahren der Stammeltern mit Partnern', () => {
    const s = stammVisible(doc, 'A', new Set(), new Set());
    expect([...s.visible].sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(s.hidden.sort()).toEqual(['F', 'G', 'H', 'Z']);
  });

  it('markiert aufklappbare Zweige mit der Zahl verborgener Personen', () => {
    const s = stammVisible(doc, 'A', new Set(), new Set());
    expect(s.marks.up.get('D')).toEqual({ hidden: 2, open: false }); // Eltern F und G
    expect(s.marks.up.has('C')).toBe(false); // Eltern sichtbar
    expect(s.marks.down.size).toBe(0);
  });

  it('Aufklappen von D zeigt deren Eltern; dort lässt sich der Bruder aufklappen', () => {
    const s = stammVisible(doc, 'A', new Set(['D']), new Set());
    expect(s.visible.has('F') && s.visible.has('G')).toBe(true);
    expect(s.visible.has('H')).toBe(false);
    expect(s.marks.up.get('D')).toEqual({ hidden: 0, open: true });
    expect(s.marks.down.get('F')).toEqual({ hidden: 1, open: false });
    const s2 = stammVisible(doc, 'A', new Set(['D']), new Set(['F']));
    expect(s2.visible.has('H')).toBe(true);
    expect(s2.marks.down.get('F')).toEqual({ hidden: 0, open: true });
  });

  it('Layout zeigt nur die sichtbaren Personen, Eltern über dem Kind', () => {
    const s = stammVisible(doc, 'A', new Set(['D']), new Set());
    const l = computeLayout(doc, { onlyIds: s.visible });
    expect([...l.nodes.keys()].sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(l.nodes.get('F')!.layer).toBe(l.nodes.get('D')!.layer - 1);
  });

  it('unbekanntes Stammelternteil fällt auf eine vorhandene Person zurück', () => {
    const s = stammVisible(doc, 'P999', new Set(), new Set());
    expect(s.rootId).toBeDefined();
    expect(s.visible.size).toBeGreaterThan(0);
  });
});
