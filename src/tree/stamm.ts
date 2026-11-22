import { Index } from '../model/queries';
import type { TreeDoc } from '../model/types';

/**
 * Ansicht „Stammbaum“: streng hierarchisch die Nachfahren eines Stammelternpaares (mit Partnern).
 * Weitere Zweige – etwa die Eltern einer angeheirateten Person – werden per Aufklappen ergänzt.
 * Stößt ein aufgeklappter Zweig auf eine bereits sichtbare Person, wird sie nicht doppelt gezeigt.
 */

export interface Mark {
  /** Anzahl verborgener Personen in dieser Richtung */
  hidden: number;
  /** Zweig ist aufgeklappt (Symbol zum Zuklappen zeigen) */
  open: boolean;
}

export interface Marks {
  up: Map<string, Mark>;
  down: Map<string, Mark>;
}

export interface StammResult {
  rootId?: string;
  visible: Set<string>;
  marks: Marks;
  /** Personen, die in dieser Ansicht nicht erscheinen */
  hidden: string[];
}

export function stammVisible(doc: TreeDoc, rootId: string, up: Set<string>, down: Set<string>, collapsed: Set<string> = new Set()): StammResult {
  const idx = new Index(doc);
  const root = idx.person(rootId) ? rootId : (idx.person('P001') ? 'P001' : [...idx.byId.keys()][0]);
  const vis = new Set<string>();
  if (!root) return { visible: vis, marks: { up: new Map(), down: new Map() }, hidden: [] };

  // Nachfahren des Stammelternteils (über alle seine Kinder) und ihre Partner
  const addDescendants = (start: string) => {
    const q = [start];
    while (q.length) {
      const x = q.shift()!;
      if (!vis.has(x)) vis.add(x);
      if (collapsed.has(x)) continue; // an diesem Knoten zugeklappt
      for (const c of idx.children(x)) if (!vis.has(c)) q.push(c);
    }
  };
  addDescendants(root);
  const addPartners = () => {
    for (const x of [...vis]) for (const p of idx.partners(x)) vis.add(p);
  };
  addPartners();

  // Aufgeklappte Zweige bis zum Stillstand ergänzen
  let changed = true;
  while (changed) {
    changed = false;
    const before = vis.size;
    for (const x of up) if (vis.has(x)) for (const p of idx.parents(x)) vis.add(p);
    // aufgeklappt: alle Nachfahren (so viele, wie die Zahl am ▼ angekündigt hat), außer zugeklappten Knoten
    for (const x of down) if (vis.has(x) && !collapsed.has(x)) for (const c of idx.children(x)) if (!vis.has(c)) addDescendants(c);
    // Partner neu hinzugekommener Personen (z. B. das Elternpaar) mit anzeigen
    for (const x of [...vis]) {
      for (const p of idx.partners(x)) {
        // Partner nur, wenn er zur Familie der sichtbaren Person gehört: gemeinsames Kind sichtbar oder Person ist aufgeklappter Elternteil
        const sharedChildVisible = idx.children(x).some((c) => vis.has(c) && idx.parents(c).includes(p));
        if (sharedChildVisible || !idx.children(x).length) vis.add(p);
      }
    }
    if (vis.size !== before) changed = true;
  }

  // Aufklapp-Markierungen
  const countAncestors = (x: string) => {
    const seen = new Set<string>();
    const q = idx.parents(x).filter((p) => !vis.has(p));
    while (q.length) {
      const y = q.shift()!;
      if (seen.has(y) || vis.has(y)) continue;
      seen.add(y);
      q.push(...idx.parents(y));
    }
    return seen.size;
  };
  const countDescendants = (x: string) => {
    const seen = new Set<string>();
    const q = idx.children(x).filter((c) => !vis.has(c));
    while (q.length) {
      const y = q.shift()!;
      if (seen.has(y) || vis.has(y)) continue;
      seen.add(y);
      q.push(...idx.children(y));
    }
    return seen.size;
  };
  const marks: Marks = { up: new Map(), down: new Map() };
  for (const x of vis) {
    const hu = countAncestors(x);
    if (hu > 0) marks.up.set(x, { hidden: hu, open: false });
    else if (up.has(x) && idx.parents(x).length) marks.up.set(x, { hidden: 0, open: true });
    const hd = countDescendants(x);
    if (hd > 0) marks.down.set(x, { hidden: hd, open: false });
    // an jedem Knoten mit sichtbaren Kindern lässt sich der Zweig zuklappen
    else if (idx.children(x).some((c) => vis.has(c))) marks.down.set(x, { hidden: 0, open: true });
  }
  const hidden = [...idx.byId.keys()].filter((id) => !vis.has(id));
  return { rootId: root, visible: vis, marks, hidden };
}
