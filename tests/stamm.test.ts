import { describe, expect, it } from 'vitest';
import { addParentChild, addPartnership, blankPerson, name } from '../src/model/ops';
import type { Sex, TreeDoc } from '../src/model/types';
import { emptyDoc } from '../src/model/types';
import { barCrossings, stammLayout, tileOverlaps } from '../src/tree/stammLayout';
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
    // an jedem Knoten mit sichtbaren Kindern: zuklappbar
    expect(s.marks.down.get('A')).toEqual({ hidden: 0, open: true });
    expect(s.marks.down.get('C')).toEqual({ hidden: 0, open: true });
    expect(s.marks.down.has('E')).toBe(false);
  });

  it('Zuklappen an einem Knoten blendet dessen Nachfahren aus', () => {
    const s = stammVisible(doc, 'A', new Set(), new Set(), new Set(['C']));
    expect(s.visible.has('E')).toBe(false);
    expect(s.visible.has('D')).toBe(true); // Partnerin bleibt
    expect(s.marks.down.get('C')).toEqual({ hidden: 1, open: false });
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
    const l = stammLayout(doc, 'A', s.visible);
    expect([...l.nodes.keys()].sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(l.nodes.get('F')!.layer).toBe(l.nodes.get('D')!.layer - 1);
  });

  it('Seitenzweige überlappen nicht, Kinder bleiben bei ihren Eltern', () => {
    const d = family();
    // zweite Tochter der Stammeltern mit eigener Familie als Nachbarzweig
    for (const [id, sx] of [['C2', 'w'], ['E2', 'm'], ['X', 'm']] as [string, Sex][]) {
      const p = blankPerson(id);
      p.sex = sx;
      p.names.push(name('vorname', id));
      d.persons.push(p);
    }
    addParentChild(d, 'A', 'C2');
    addParentChild(d, 'B', 'C2');
    addPartnership(d, 'C2', 'X', 'verheiratet');
    addParentChild(d, 'C2', 'E2');
    addParentChild(d, 'X', 'E2');
    const s = stammVisible(d, 'A', new Set(['D']), new Set(['F']));
    const l = stammLayout(d, 'A', s.visible);
    expect(tileOverlaps(l)).toEqual([]);
    expect(barCrossings(l, (x) => d.partnerships.flatMap((p) => (p.p1 === x ? [p.p2] : p.p2 === x ? [p.p1] : [])))).toEqual([]);
    expect([...l.nodes.keys()].sort()).toEqual([...s.visible].sort());
    const n = (id: string) => l.nodes.get(id)!;
    expect(n('F').layer).toBe(n('D').layer - 1);
    expect(n('H').layer).toBe(n('D').layer);
    expect(n('A').layer).toBe(n('C').layer - 1);
    const mid = (n('C').x + n('D').x) / 2;
    expect(Math.abs(n('E').x - mid)).toBeLessThan(Math.abs(n('E2').x - mid));
  });

  it('unbekanntes Stammelternteil fällt auf eine vorhandene Person zurück', () => {
    const s = stammVisible(doc, 'P999', new Set(), new Set());
    expect(s.rootId).toBeDefined();
    expect(s.visible.size).toBeGreaterThan(0);
  });
});
