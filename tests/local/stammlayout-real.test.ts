import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { migrate } from '../../src/model/migrate';
import { Index } from '../../src/model/queries';
import { stammVisible } from '../../src/tree/stamm';
import { barCrossings, stammLayout, tileOverlaps } from '../../src/tree/stammLayout';

/** Lokal mit den echten App-Daten (STAMMBAUM_JSON). Gibt nur Zahlen/IDs aus. */
const file = process.env.STAMMBAUM_JSON;

describe.skipIf(!file || !existsSync(file))('Stammbaum-Layout mit echten Daten', () => {
  it('keine überlappenden Kacheln bei beliebig aufgeklappten Zweigen', () => {
    const doc = migrate(JSON.parse(readFileSync(file!, 'utf8')));
    const idx = new Index(doc);
    const all = [...idx.byId.keys()];
    const cases: [string, Set<string>, Set<string>][] = [
      ['grund', new Set(), new Set()],
      ['alle hoch', new Set(all), new Set()],
      ['alles', new Set(all), new Set(all)],
    ];
    // jede einzelne Person aufgeklappt
    for (const id of all) cases.push([`hoch ${id}`, new Set([id]), new Set()]);
    for (const [label, up, down] of cases) {
      const s = stammVisible(doc, 'P006', up, down);
      const l = stammLayout(doc, s.rootId!, s.visible);
      expect(tileOverlaps(l), label).toEqual([]);
      expect(l.nodes.size, label).toBe(s.visible.size);
    }
    const s = stammVisible(doc, 'P006', new Set(all), new Set(all));
    const l = stammLayout(doc, s.rootId!, s.visible);
    console.log('Linien über fremden Kacheln (hoch je Person):', cases.slice(3).filter(([, up, down]) => { const s2 = stammVisible(doc, 'P006', up, down); return barCrossings(stammLayout(doc, s2.rootId!, s2.visible), (x) => idx.partners(x)).length > 0; }).map(([lb]) => lb).join(', '));
    console.log('alles sichtbar:', s.visible.size, 'Breite', Math.round(l.width), 'Höhe', Math.round(l.height));
  });
});
