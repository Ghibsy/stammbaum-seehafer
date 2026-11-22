import { sortKey } from '../model/dates';
import { birthDate, Index, isActive } from '../model/queries';
import type { ParentChild, TreeDoc } from '../model/types';
import { GAP, LAYER_H, PARTNER_GAP, TILE_H, TILE_W, type LFamily, type Layout, type LNode } from './layout';

/**
 * Baum-Layout für die Ansicht „Stammbaum“ (ohne sich überlagernde Zweige).
 *
 * Jede Einheit (Person + Partner) bekommt ihre Kinder als zusammenhängenden Block darunter.
 * Geschwister-Teilbäume werden über ihre Umrisse (je Zeile linke/rechte Kante) so nebeneinander
 * gesetzt, dass sie sich in keiner Zeile berühren. Aufgeklappte Eltern einer angeheirateten Person
 * („Seitenzweig“) hängen seitlich neben dieser Person; Nachbarzweige rücken dafür weiter weg.
 */

const BRANCH_GAP = () => GAP * 2; // Abstand zwischen getrennten Familien

type Contour = Map<number, [number, number]>;

interface Shape {
  /** x = linke Kante, row relativ zur Zeile der Einheit */
  nodes: Map<string, { x: number; row: number }>;
  contour: Contour;
  /** Personen der obersten Einheit (Person + Partner) */
  unit?: string[];
}

function emptyShape(): Shape {
  return { nodes: new Map(), contour: new Map() };
}

function addNode(s: Shape, id: string, x: number, row: number) {
  s.nodes.set(id, { x, row });
  const c = s.contour.get(row);
  s.contour.set(row, c ? [Math.min(c[0], x), Math.max(c[1], x + TILE_W)] : [x, x + TILE_W]);
}

function merge(target: Shape, s: Shape, dx: number, drow: number) {
  for (const [id, n] of s.nodes) target.nodes.set(id, { x: n.x + dx, row: n.row + drow });
  for (const [r, [a, b]] of s.contour) {
    const row = r + drow;
    const c = target.contour.get(row);
    target.contour.set(row, c ? [Math.min(c[0], a + dx), Math.max(c[1], b + dx)] : [a + dx, b + dx]);
  }
}

/** kleinster Versatz nach rechts, damit s rechts neben acc liegt (in allen gemeinsamen Zeilen) */
function rightOf(acc: Contour, s: Contour, drow: number, gap: number): number {
  let dx = -Infinity;
  for (const [r, [a]] of s) {
    const c = acc.get(r + drow);
    if (c) dx = Math.max(dx, c[1] + gap - a);
  }
  return dx === -Infinity ? 0 : dx;
}

/** linke Kante für einen Block der Breite w in Zeile row, möglichst nahe an want, ohne Kacheln zu berühren */
function freeSlot(s: Shape, row: number, want: number, w: number): number {
  const g = BRANCH_GAP();
  const busy = [...s.nodes.values()].filter((n) => n.row === row).map((n) => [n.x - g, n.x + TILE_W + g] as const);
  const fits = (x: number) => busy.every(([a, b]) => x + w <= a || x >= b);
  if (fits(want)) return want;
  const cands = busy.flatMap(([a, b]) => [a - w, b]).filter(fits);
  cands.sort((x, y) => Math.abs(x - want) - Math.abs(y - want));
  return cands[0] ?? want;
}

export function stammLayout(doc: TreeDoc, rootId: string, visible: Set<string>): Layout {
  const idx = new Index(doc);
  const vis = (id: string) => visible.has(id) && !!idx.person(id);
  const placed = new Set<string>();
  const unitW = (n: number) => n * TILE_W + (n - 1) * PARTNER_GAP;
  const byBirth = (a: string, b: string) => sortKey(birthDate(idx.person(a)!)) - sortKey(birthDate(idx.person(b)!));

  /**
   * Seitenzweig über einer angeheirateten Person q: deren Eltern (Zeile −1), Geschwister mit
   * Nachfahren (Zeile 0 und tiefer) und weiter aufgeklappte Vorfahren. q selbst liegt außerhalb
   * an x = 0 … TILE_W (Zeile 0); der Zweig wächst nach rechts (bei side = -1 gespiegelt).
   */
  function branch(q: string): Shape | undefined {
    const parents = idx.parents(q).filter((p) => vis(p) && !placed.has(p));
    if (!parents.length) return undefined;
    const ordered = [...parents].sort((a, b) => (idx.person(a)!.sex === 'm' ? -1 : idx.person(b)!.sex === 'm' ? 1 : 0));
    ordered.forEach((p) => placed.add(p));
    const s = emptyShape();
    // Geschwister von q (aufgeklappt) rechts neben q
    const sibs = [...new Set(ordered.flatMap((p) => idx.children(p)))].filter((c) => c !== q && vis(c) && !placed.has(c)).sort(byBirth);
    const slot: Contour = new Map([[0, [0, TILE_W]]]);
    const acc: Shape = { nodes: new Map(), contour: new Map(slot) };
    const centers: number[] = [TILE_W / 2];
    for (const c of sibs) {
      if (placed.has(c)) continue;
      const sh = line(c, unitW(ordered.length));
      const dx = rightOf(acc.contour, sh.contour, 0, BRANCH_GAP());
      merge(acc, sh, dx, 0);
      merge(s, sh, dx, 0);
      centers.push(sh.nodes.get(c)!.x + dx + TILE_W / 2);
    }
    // Elternpaar mittig über q und den Geschwistern, aber nicht in die Zeile darunter ragend
    const w = unitW(ordered.length);
    let left = (Math.min(...centers) + Math.max(...centers)) / 2 - w / 2;
    left = Math.max(left, rightEdge(s.contour, -1) + BRANCH_GAP());
    ordered.forEach((p, i) => addNode(s, p, left + i * (TILE_W + PARTNER_GAP), -1));
    // weitere Vorfahren der Eltern: Vater nach links, Mutter nach rechts
    ordered.forEach((p, i) => attachBranch(s, p, -1, i === 0 && ordered.length > 1 ? -1 : 1));
    return s;
  }

  function rightEdge(c: Contour, row: number) {
    return c.get(row)?.[1] ?? -Infinity;
  }

  /** Seitenzweig von Person p (in Shape s, Zeile row) an der passenden Seite anhängen */
  function attachBranch(s: Shape, p: string, row: number, side: 1 | -1, reserve?: [number, number]) {
    const b = branch(p);
    if (!b) return;
    const px = s.nodes.get(p)!.x;
    const work: Contour = new Map(s.contour);
    if (reserve) {
      const c = work.get(row - 1);
      work.set(row - 1, c ? [Math.min(c[0], reserve[0]), Math.max(c[1], reserve[1])] : reserve);
    }
    if (side === 1) {
      // Zweig liegt rechts: q-Slot (x 0…TILE_W) entspricht p; alles andere muss rechts frei sein
      const own = new Map(b.contour);
      let dx = px;
      for (const [r, [a]] of own) {
        const c = work.get(r + row);
        if (!c) continue;
        // in der Zeile von p darf der Zweig erst rechts von allem bisherigen beginnen
        dx = Math.max(dx, c[1] + BRANCH_GAP() - a);
      }
      merge(s, b, dx, row);
    } else {
      // gespiegelt: Zweig links von p
      const mirrored = mirror(b);
      let dx = px;
      for (const [r, [, bb]] of mirrored.contour) {
        const c = work.get(r + row);
        if (!c) continue;
        dx = Math.min(dx, c[0] - BRANCH_GAP() - bb);
      }
      merge(s, mirrored, dx, row);
    }
  }

  function mirror(b: Shape): Shape {
    const m = emptyShape();
    for (const [id, n] of b.nodes) addNode(m, id, TILE_W - n.x - TILE_W, n.row);
    return m;
  }

  /** Teilbaum ab Person id (Zeile 0): Einheit mit Partnern, Kinder darunter, Seitenzweige der Partner */
  function line(id: string, parentUnitW: number): Shape {
    placed.add(id);
    const partners = idx.partners(id).filter((p) => vis(p) && !placed.has(p));
    partners.forEach((p) => placed.add(p));
    const members = [id, ...partners];
    const s = emptyShape();

    // Kinder aller Mitglieder (nach anderem Elternteil gruppiert, dann nach Geburt)
    const kids = [...new Set(members.flatMap((m) => idx.children(m)))].filter((c) => vis(c) && !placed.has(c));
    kids.sort((a, b) => {
      const oa = idx.parents(a).find((p) => p !== id) ?? '';
      const ob = idx.parents(b).find((p) => p !== id) ?? '';
      return members.indexOf(oa) - members.indexOf(ob) || byBirth(a, b);
    });
    const w = unitW(members.length);
    const centers: number[] = [];
    const shapes: { k: string; sh: Shape; side: number }[] = [];
    for (const k of kids) {
      if (placed.has(k)) continue;
      const sh = line(k, w);
      // Liegen in der Zeile des Kindes fremde Personen (Eltern eines angeheirateten Enkel-Partners)?
      // Solche Kinder kommen an den Rand, damit die Linie zu den Geschwistern nicht über sie läuft.
      const unit = new Set(sh.unit ?? [k]);
      const kx = sh.nodes.get(k)!.x;
      const extra = [...sh.nodes].filter(([id, n]) => n.row === 0 && !unit.has(id));
      const side = extra.some(([, n]) => n.x > kx) ? 1 : extra.some(([, n]) => n.x < kx) ? -1 : 0;
      shapes.push({ k, sh, side });
    }
    shapes.sort((a, b) => a.side - b.side); // stabil: sonst Geburtsreihenfolge
    for (const { k, sh } of shapes) {
      const dx = s.nodes.size ? rightOf(s.contour, sh.contour, 1, BRANCH_GAP()) : 0;
      merge(s, sh, dx, 1);
      centers.push(sh.nodes.get(k)!.x + dx + TILE_W / 2);
    }
    const want = centers.length ? (Math.min(...centers) + Math.max(...centers)) / 2 - w / 2 : 0;
    // Seitenzweige der Kinder können in dieser Zeile liegen (Eltern angeheirateter Partner):
    // nächstgelegene freie Lücke für das Paar suchen
    const left = freeSlot(s, 0, want, w);
    members.forEach((m, i) => addNode(s, m, left + i * (TILE_W + PARTNER_GAP), 0));

    // Seitenzweige: Eltern angeheirateter Partner rechts außen, nicht über den eigenen Eltern
    const lineCenter = left + TILE_W / 2;
    const reserve: [number, number] | undefined = parentUnitW ? [lineCenter - parentUnitW / 2, lineCenter + parentUnitW / 2] : undefined;
    partners.forEach((p) => attachBranch(s, p, 0, 1, reserve));
    s.unit = members;
    return s;
  }

  const idxRoot = vis(rootId) ? rootId : [...visible].find((v) => idx.person(v));
  const all = emptyShape();
  if (idxRoot) {
    const main = line(idxRoot, 0);
    merge(all, main, 0, 0);
    // Vorfahren der Stammeltern selbst (falls aufgeklappt): links des Stammelternteils
    attachBranch(all, idxRoot, 0, -1);
  }
  // Übrige sichtbare Personen (ohne Verbindung über Eltern/Kinder/Partner) rechts anfügen
  for (const id of visible) {
    if (placed.has(id) || !idx.person(id)) continue;
    const sh = line(id, 0);
    const dx = rightOf(all.contour, sh.contour, 0, BRANCH_GAP() * 2);
    merge(all, sh, Number.isFinite(dx) ? dx : 0, 0);
  }

  // in Layout-Format umrechnen
  const nodes = new Map<string, LNode>();
  for (const [id, n] of all.nodes) nodes.set(id, { id, x: n.x, y: n.row * LAYER_H, layer: n.row, person: idx.person(id)!, loose: false });
  const pcs = doc.parentChild.filter((x) => isActive(x.status) && nodes.has(x.parentId) && nodes.has(x.childId));
  const byChild = new Map<string, ParentChild[]>();
  for (const x of pcs) (byChild.get(x.childId) ?? byChild.set(x.childId, []).get(x.childId)!).push(x);
  const fam = new Map<string, LFamily>();
  for (const [child, list] of byChild) {
    const parents = [...new Set(list.map((x) => x.parentId))].sort();
    const key = parents.join('+');
    const f = fam.get(key) ?? { key, parents, children: [] };
    f.children.push({ id: child, pc: list });
    fam.set(key, f);
  }
  const ns = [...nodes.values()];
  const minX = ns.length ? Math.min(...ns.map((n) => n.x)) : 0;
  const minY = ns.length ? Math.min(...ns.map((n) => n.y)) : 0;
  const maxX = ns.length ? Math.max(...ns.map((n) => n.x + TILE_W)) : 0;
  const maxY = ns.length ? Math.max(...ns.map((n) => n.y + TILE_H)) : 0;
  return {
    nodes,
    families: [...fam.values()],
    partnerships: doc.partnerships.filter((p) => isActive(p.status) && nodes.has(p.p1) && nodes.has(p.p2)),
    assertions: doc.assertions.filter((a) => isActive(a.status) && nodes.has(a.fromId) && nodes.has(a.toId)),
    width: maxX - minX,
    height: maxY - minY,
    minX,
    minY,
  };
}

/** Prüfhilfe für Tests: überlappende Kacheln je Zeile */
export function tileOverlaps(l: Layout): string[] {
  const out: string[] = [];
  const rows = new Map<number, LNode[]>();
  for (const n of l.nodes.values()) (rows.get(n.layer) ?? rows.set(n.layer, []).get(n.layer)!).push(n);
  for (const list of rows.values()) {
    list.sort((a, b) => a.x - b.x);
    for (let i = 1; i < list.length; i++) if (list[i].x < list[i - 1].x + TILE_W - 0.5) out.push(`${list[i - 1].id}/${list[i].id}`);
  }
  return out;
}

/** Prüfhilfe: Personen, über die eine Eltern-Kind-Linie hinwegläuft (weder Kind noch Partner eines Kindes) */
export function barCrossings(l: Layout, partnersOf: (id: string) => string[]): string[] {
  const out: string[] = [];
  for (const f of l.families) {
    const kids = f.children.map((c) => l.nodes.get(c.id)!).filter(Boolean);
    if (!kids.length) continue;
    const layer = kids[0].layer;
    const xs = kids.map((k) => k.x + TILE_W / 2);
    const parentXs = f.parents.map((p) => l.nodes.get(p)).filter(Boolean).map((p) => p!.x + TILE_W / 2);
    const lo = Math.min(...xs, ...parentXs);
    const hi = Math.max(...xs, ...parentXs);
    const ok = new Set(kids.flatMap((k) => [k.id, ...partnersOf(k.id)]));
    for (const n of l.nodes.values()) {
      if (n.layer !== layer || ok.has(n.id)) continue;
      if (n.x + TILE_W > lo && n.x < hi) out.push(`${f.key}>${n.id}`);
    }
  }
  return out;
}
