import { sortKey } from '../model/dates';
import { birthDate, Index, isActive } from '../model/queries';
import type { ParentChild, Partnership, TreeDoc } from '../model/types';
import { GAP, LAYER_H, PARTNER_GAP, TILE_H, TILE_W, type LFamily, type Layout, type LNode } from './layout';

/**
 * Ansichten ab einer Ausgangsperson: Vorfahren (nach oben), Nachfahren (nach unten) und
 * Sanduhr (beides). Ergebnis im selben Format wie die Standardansicht, damit Kacheln und
 * Linien gleich gezeichnet werden. Jede Person erscheint höchstens einmal (Ahnenschwund).
 */

const slot = () => TILE_W + GAP;

export type PedigreeMode = 'vorfahren' | 'nachfahren' | 'sanduhr';

export interface PedigreeOptions {
  mode: PedigreeMode;
  focusId: string;
  genUp: number;
  genDown: number;
  showPartners: boolean;
}

interface Ctx {
  idx: Index;
  pcs: ParentChild[];
  nodes: Map<string, LNode>;
}

function addNode(c: Ctx, id: string, x: number, layer: number) {
  if (c.nodes.has(id)) return;
  c.nodes.set(id, { id, x, y: layer * LAYER_H, layer, person: c.idx.person(id)!, loose: false });
}

function orderedParents(c: Ctx, id: string): string[] {
  const ps = c.idx.parents(id).filter((p) => c.idx.person(p));
  const rank = (pid: string) => (c.idx.person(pid)!.sex === 'm' ? 0 : c.idx.person(pid)!.sex === 'w' ? 1 : 2);
  return ps.sort((a, b) => rank(a) - rank(b));
}

/** Vorfahren: liefert die belegte Breite [links, rechts] in Pixeln; Person wird mittig über den Eltern platziert */
function placeAncestors(c: Ctx, id: string, depth: number, maxDepth: number, cursor: { x: number }, placed: Set<string>): number {
  placed.add(id);
  const parents = depth < maxDepth ? orderedParents(c, id).filter((p) => !placed.has(p)) : [];
  if (!parents.length) {
    const x = cursor.x;
    cursor.x += slot();
    addNode(c, id, x, -depth);
    return x;
  }
  const xs = parents.map((p) => placeAncestors(c, p, depth + 1, maxDepth, cursor, placed));
  const x = (Math.min(...xs) + Math.max(...xs)) / 2;
  addNode(c, id, x, -depth);
  return x;
}

/** Nachfahren: Einheit = Person (+ Partner); Kinder darunter. Liefert x der Person. */
function placeDescendants(c: Ctx, id: string, depth: number, maxDepth: number, showPartners: boolean, cursor: { x: number }, placed: Set<string>): number {
  placed.add(id);
  const partners = showPartners ? c.idx.partners(id).filter((p) => !placed.has(p) && c.idx.person(p)) : [];
  partners.forEach((p) => placed.add(p));
  const unitW = (1 + partners.length) * TILE_W + partners.length * PARTNER_GAP;
  const kids = depth < maxDepth ? c.idx.children(id).filter((k) => !placed.has(k) && c.idx.person(k)) : [];
  // Kinder nach anderem Elternteil gruppieren, dann nach Geburt
  kids.sort((a, b) => {
    const oa = c.idx.parents(a).find((p) => p !== id) ?? '';
    const ob = c.idx.parents(b).find((p) => p !== id) ?? '';
    return partners.indexOf(oa) - partners.indexOf(ob) || sortKey(birthDate(c.idx.person(a)!)) - sortKey(birthDate(c.idx.person(b)!));
  });
  let left: number;
  if (!kids.length) {
    left = cursor.x;
    cursor.x += unitW + GAP;
  } else {
    const start = cursor.x;
    const kidXs = kids.map((k) => placeDescendants(c, k, depth + 1, maxDepth, showPartners, cursor, placed));
    const center = (Math.min(...kidXs) + Math.max(...kidXs) + TILE_W) / 2;
    left = center - unitW / 2;
    if (left < start) {
      // Einheit breiter als Kinder: Kinder bleiben, Einheit darf nicht in Nachbarn ragen
      left = start;
    }
    cursor.x = Math.max(cursor.x, left + unitW + GAP);
  }
  addNode(c, id, left, depth);
  partners.forEach((p, i) => addNode(c, p, left + (i + 1) * (TILE_W + PARTNER_GAP), depth));
  return left;
}

export function pedigreeLayout(doc: TreeDoc, opt: PedigreeOptions): Layout {
  const idx = new Index(doc);
  const pcs = doc.parentChild.filter((x) => isActive(x.status) && idx.person(x.parentId) && idx.person(x.childId));
  const c: Ctx = { idx, pcs, nodes: new Map() };
  if (!idx.person(opt.focusId)) return emptyLayout();

  if (opt.mode === 'vorfahren' || opt.mode === 'sanduhr') {
    placeAncestors(c, opt.focusId, 0, opt.genUp, { x: 0 }, new Set());
  }
  if (opt.mode === 'nachfahren' || opt.mode === 'sanduhr') {
    const desc: Ctx = { idx, pcs, nodes: new Map() };
    placeDescendants(desc, opt.focusId, 0, opt.genDown, opt.showPartners, { x: 0 }, new Set());
    // an der Ausgangsperson ausrichten
    const anchor = c.nodes.get(opt.focusId);
    const dx = anchor ? anchor.x - desc.nodes.get(opt.focusId)!.x : 0;
    for (const n of desc.nodes.values()) if (!c.nodes.has(n.id)) c.nodes.set(n.id, { ...n, x: n.x + dx });
  }

  // Familien und Partnerschaften nur zwischen sichtbaren Personen
  const vis = c.nodes;
  const byChild = new Map<string, ParentChild[]>();
  for (const x of pcs) if (vis.has(x.parentId) && vis.has(x.childId) && vis.get(x.parentId)!.layer === vis.get(x.childId)!.layer - 1) (byChild.get(x.childId) ?? byChild.set(x.childId, []).get(x.childId)!).push(x);
  const famMap = new Map<string, LFamily>();
  for (const [child, list] of byChild) {
    const parents = [...new Set(list.map((x) => x.parentId))].sort();
    const key = parents.join('+');
    const f = famMap.get(key) ?? { key, parents, children: [] };
    f.children.push({ id: child, pc: list });
    famMap.set(key, f);
  }
  const partnerships: Partnership[] = doc.partnerships.filter((p) => isActive(p.status) && vis.has(p.p1) && vis.has(p.p2) && vis.get(p.p1)!.layer === vis.get(p.p2)!.layer);
  const all = [...vis.values()];
  const minX = Math.min(...all.map((n) => n.x));
  const minY = Math.min(...all.map((n) => n.y));
  const maxX = Math.max(...all.map((n) => n.x + TILE_W));
  const maxY = Math.max(...all.map((n) => n.y + TILE_H));
  return { nodes: vis, families: [...famMap.values()], partnerships, assertions: [], width: maxX - minX, height: maxY - minY, minX, minY };
}

export function emptyLayout(): Layout {
  return { nodes: new Map(), families: [], partnerships: [], assertions: [], width: 0, height: 0, minX: 0, minY: 0 };
}

/** Prüfhilfe: überlappen sich Kacheln derselben Ebene? */
export function overlaps(l: Layout): string[] {
  const out: string[] = [];
  const byLayer = new Map<number, LNode[]>();
  for (const n of l.nodes.values()) (byLayer.get(n.layer) ?? byLayer.set(n.layer, []).get(n.layer)!).push(n);
  for (const list of byLayer.values()) {
    list.sort((a, b) => a.x - b.x);
    for (let i = 1; i < list.length; i++) if (list[i].x < list[i - 1].x + TILE_W) out.push(`${list[i - 1].id}/${list[i].id}`);
  }
  return out;
}
