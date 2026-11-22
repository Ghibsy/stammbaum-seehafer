import { describe, expect, it } from 'vitest';
import { parseGenDate } from '../src/model/dates';
import { blankPerson, name } from '../src/model/ops';
import { collectPlaces, ensurePlace, mergePlaceInto, placeNames } from '../src/model/places';
import { emptyDoc, type EventType } from '../src/model/types';

describe('Ortsnamen aus Freitext', () => {
  it('entfernt Vorsilben, trennt historische Namen und verwirft Straßen', () => {
    expect(placeNames('Marienburg / Malbork')).toEqual(['Marienburg', 'Malbork']);
    expect(placeNames('vermutlich Altdorf')).toEqual(['Altdorf']);
    expect(placeNames('vermutlich Altdorf / Neustadt')).toEqual(['Altdorf']); // „oder“, kein zweiter Name
    expect(placeNames('Musterweg 6, 31234 Neustadt')).toEqual(['Neustadt']);
    expect(placeNames('Musterweg 6')).toEqual([]);
    expect(placeNames('Ortsbezug Neustadt')).toEqual(['Neustadt']);
    expect(placeNames('Wrocław (Breslau)')).toEqual(['Wrocław']);
    expect(placeNames('')).toEqual([]);
  });
});

describe('Ortsliste', () => {
  const doc = emptyDoc();
  const P = (id: string, events: [EventType, string, string?][]) => {
    const p = blankPerson(id);
    p.names.push(name('vorname', id), name('nachname', 'Test'));
    for (const [type, place, date] of events) p.events.push({ id: `${id}${type}`, type, place, date: parseGenDate(date), status: 'familienangabe', citations: [], mediaIds: [] });
    doc.persons.push(p);
  };
  P('P001', [['geburt', 'Marienburg / Malbork', '1920'], ['wohnort', 'Musterweg 1, Neustadt']]);
  P('P002', [['geburt', 'Malbork / Marienburg'], ['tod', 'Breslau']]);
  P('P003', [['geburt', 'Wrocław']]);

  it('bündelt gleiche Orte unabhängig von der Reihenfolge der Namen', () => {
    const g = collectPlaces(doc);
    const marienburg = g.find((x) => x.label === 'Marienburg')!;
    expect(marienburg.uses).toHaveLength(2);
    const pl = ensurePlace(doc, marienburg);
    expect(pl.altNames).toEqual(['Malbork']);
    const g2 = collectPlaces(doc);
    expect(g2.find((x) => x.place?.id === pl.id)!.uses.map((u) => u.personId).sort()).toEqual(['P001', 'P002']);
    expect(g2.some((x) => x.label === 'Neustadt')).toBe(true);
    expect(g2.some((x) => /Musterweg/.test(x.label))).toBe(false);
  });

  it('legt historische und heutige Namen zusammen', () => {
    const groups = collectPlaces(doc);
    const breslau = groups.find((x) => x.label === 'Breslau')!;
    const wroclaw = groups.find((x) => x.label === 'Wrocław')!;
    const pl = ensurePlace(doc, wroclaw);
    mergePlaceInto(doc, pl, breslau);
    const after = collectPlaces(doc).find((x) => x.place?.id === pl.id)!;
    expect(after.uses).toHaveLength(2);
    expect(after.names).toEqual(['Wrocław', 'Breslau']);
  });
});
