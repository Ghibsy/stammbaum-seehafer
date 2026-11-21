import { sortKey } from '../model/dates';
import { birthDate, Index, isActive } from '../model/queries';
import type { Assertion, ParentChild, Partnership, Person, TreeDoc } from '../model/types';

/**
 * Layout für den Familiengraphen (kein reiner Baum):
 *  1. Generationsebenen aus Eltern-Kind (+1), Partnerschaft/Geschwister (=0), Großeltern (+2);
 *     Ausrichtung zwischen getrennten Zweigen über die importierte Generation.
 *  2. Partner derselben Ebene bilden eine Einheit.
 *  3. Reihenfolge je Ebene per Schwerpunkt-Verfahren (wenige Kreuzungen).
 *  4. x-Positionen: Eltern über Kindern zentriert, Überlappungen blockweise aufgelöst.
 */

export const TILE_W = 156;
export const TILE_H = 66;
const GAP = 22;
const PARTNER_GAP = 34;
const LAYER_H = 128;
const COMP_GAP = 90;

export interface LNode {
  id: string;
  x: number; // linke Kante
  y: number; // obere Kante
  layer: number;
  person: Person;
  loose: boolean; // ohne jede Beziehung
}

export interface LFamily {
  key: string;
  parents: string[];
  children: { id: string; pc: ParentChild[] }[];
}

export interface Layout {
  nodes: Map<string, LNode>;
  families: LFamily[];
  partnerships: Partnership[];
  assertions: Assertion[];
  width: number;
  height: number;
  minX: number;
  minY: number;
}

export interface LayoutOptions {
  /** nur Personen bis zu `radius` Schritte (Eltern/Kind/Partner/Aussage) von dieser Person */
  nearOf?: string;
  radius?: number;
}

export function computeLayout(doc: TreeDoc, opt: LayoutOptions = {}): Layout {
  const idx = new Index(doc);
  const persons = [...idx.byId.values()];
  const pcs = doc.parentChild.filter((x) => isActive(x.status) && idx.byId.has(x.parentId) && idx.byId.has(x.childId));
  const pas = doc.partnerships.filter((x) => isActive(x.status) && idx.byId.has(x.p1) && idx.byId.has(x.p2));
  const ass = doc.assertions.filter((x) => isActive(x.status) && idx.byId.has(x.fromId) && idx.byId.has(x.toId));

  // ---------- Komponenten & Ebenen ----------
  type C = { to: string; d: number };
  const cons = new Map<string, C[]>();
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string, d: number, layout = true) => {
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
    if (!layout) return;
    (cons.get(a) ?? cons.set(a, []).get(a)!).push({ to: b, d });
    (cons.get(b) ?? cons.set(b, []).get(b)!).push({ to: a, d: -d });
  };
  for (const x of pcs) link(x.parentId, x.childId, 1);
  for (const x of pas) link(x.p1, x.p2, 0);
  for (const a of ass) {
    if (a.kind === 'geschwister') link(a.fromId, a.toId, 0);
    else if (a.kind === 'grosselternteil') link(a.fromId, a.toId, 2);
    else if (a.kind === 'enkel_geschwisterzweig') link(a.toId, a.fromId, 2);
    else link(a.fromId, a.toId, 0, false);
  }

  const legacyLayer = (p: Person) => {
    const g = parseInt(p.legacy?.generation ?? '', 10);
    return isNaN(g) ? undefined : 10 - g; // Generation 4 (Großeltern) oben
  };

  const comp = new Map<string, number>();
  const comps: string[][] = [];
  for (const p of persons) {
    if (comp.has(p.id)) continue;
    const list: string[] = [];
    const q = [p.id];
    comp.set(p.id, comps.length);
    while (q.length) {
      const v = q.shift()!;
      list.push(v);
      for (const w of adj.get(v) ?? []) if (!comp.has(w)) {
        comp.set(w, comps.length);
        q.push(w);
      }
    }
    comps.push(list);
  }

  const layer = new Map<string, number>();
  for (const list of comps) {
    // Startperson: mit importierter Generation, sonst erste
    const seed = list.find((id) => legacyLayer(idx.byId.get(id)!) !== undefined) ?? list[0];
    const rel = new Map<string, number>([[seed, 0]]);
    const q = [seed];
    while (q.length) {
      const v = q.shift()!;
      for (const c of cons.get(v) ?? []) if (!rel.has(c.to)) {
        rel.set(c.to, rel.get(v)! + c.d);
        q.push(c.to);
      }
    }
    // nicht über Ebenen-Bedingungen erreichbare (z. B. nur „angegeben bei“) → Ebene des Nachbarn
    for (const id of list) if (!rel.has(id)) {
      const lg = legacyLayer(idx.byId.get(id)!);
      const nb = [...(adj.get(id) ?? [])].find((n) => rel.has(n));
      rel.set(id, nb !== undefined ? rel.get(nb)! : 0);
      if (lg !== undefined) rel.set(id, NaN); // später über Generation
    }
    // Versatz anhand der importierten Generationen (Median)
    const diffs = list
      .map((id) => {
        const lg = legacyLayer(idx.byId.get(id)!);
        const r = rel.get(id)!;
        return lg !== undefined && !isNaN(r) ? lg - r : undefined;
      })
      .filter((x): x is number => x !== undefined)
      .sort((a, b) => a - b);
    const off = diffs.length ? diffs[Math.floor(diffs.length / 2)] : 8;
    for (const id of list) {
      const r = rel.get(id)!;
      const lg = legacyLayer(idx.byId.get(id)!);
      layer.set(id, isNaN(r) ? (lg ?? off) : r + off);
    }
  }

  // ---------- Auswahl ----------
  let visible = persons.map((p) => p.id);
  if (opt.nearOf && idx.byId.has(opt.nearOf)) {
    const dist = new Map<string, number>([[opt.nearOf, 0]]);
    const q = [opt.nearOf];
    const R = opt.radius ?? 2;
    while (q.length) {
      const v = q.shift()!;
      if (dist.get(v)! >= R) continue;
      for (const w of adj.get(v) ?? []) if (!dist.has(w)) {
        dist.set(w, dist.get(v)! + 1);
        q.push(w);
      }
    }
    // Partner der Gefundenen ergänzen, damit Paare vollständig sind
    for (const id of [...dist.keys()]) for (const pa of pas) {
      if (pa.p1 === id && !dist.has(pa.p2)) dist.set(pa.p2, R + 1);
      if (pa.p2 === id && !dist.has(pa.p1)) dist.set(pa.p1, R + 1);
    }
    visible = visible.filter((id) => dist.has(id));
  }
  const vis = new Set(visible);
  const loose = new Set(visible.filter((id) => !adj.has(id)));

  // ---------- Einheiten (Partner nebeneinander) ----------
  const unitOf = new Map<string, number>();
  const units: { members: string[]; layer: number; comp: number }[] = [];
  const partnerAdj = new Map<string, string[]>();
  for (const pa of pas) {
    if (!vis.has(pa.p1) || !vis.has(pa.p2) || layer.get(pa.p1) !== layer.get(pa.p2)) continue;
    (partnerAdj.get(pa.p1) ?? partnerAdj.set(pa.p1, []).get(pa.p1)!).push(pa.p2);
    (partnerAdj.get(pa.p2) ?? partnerAdj.set(pa.p2, []).get(pa.p2)!).push(pa.p1);
  }
  for (const id of visible) {
    if (unitOf.has(id) || loose.has(id)) continue;
    // Partnerkette sammeln
    const group: string[] = [];
    const q = [id];
    const seen = new Set([id]);
    while (q.length) {
      const v = q.shift()!;
      group.push(v);
      for (const w of partnerAdj.get(v) ?? []) if (!seen.has(w)) {
        seen.add(w);
        q.push(w);
      }
    }
    // Person mit den meisten Partnern in die Mitte; Männer links (nur Konvention)
    let ordered = group;
    if (group.length > 2) {
      const center = [...group].sort((a, b) => (partnerAdj.get(b)?.length ?? 0) - (partnerAdj.get(a)?.length ?? 0))[0];
      const others = group.filter((g) => g !== center);
      ordered = [...others.slice(0, Math.ceil(others.length / 2)), center, ...others.slice(Math.ceil(others.length / 2))];
    } else if (group.length === 2) {
      const [a, b] = group;
      ordered = idx.byId.get(b)!.sex === 'm' && idx.byId.get(a)!.sex !== 'm' ? [b, a] : [a, b];
    }
    const u = units.length;
    units.push({ members: ordered, layer: layer.get(id)!, comp: comp.get(id)! });
    for (const m of ordered) unitOf.set(m, u);
  }

  // ---------- Familien (Eltern-Set → Kinder) ----------
  const famMap = new Map<string, LFamily>();
  const byChild = new Map<string, ParentChild[]>();
  for (const x of pcs) if (vis.has(x.parentId) && vis.has(x.childId)) (byChild.get(x.childId) ?? byChild.set(x.childId, []).get(x.childId)!).push(x);
  for (const [child, list] of byChild) {
    const parents = [...new Set(list.map((x) => x.parentId))].sort();
    const key = parents.join('+');
    const f = famMap.get(key) ?? { key, parents, children: [] };
    f.children.push({ id: child, pc: list });
    famMap.set(key, f);
  }
  const families = [...famMap.values()];
  for (const f of families) f.children.sort((a, b) => sortKey(birthDate(idx.byId.get(a.id)!)) - sortKey(birthDate(idx.byId.get(b.id)!)));

  // Nachbarschaften zwischen Einheiten (oben/unten)
  const upN = new Map<number, number[]>();
  const downN = new Map<number, number[]>();
  const addN = (m: Map<number, number[]>, a: number, b: number) => (m.get(a) ?? m.set(a, []).get(a)!).push(b);
  for (const f of families) for (const c of f.children) for (const p of f.parents) {
    const uc = unitOf.get(c.id);
    const up = unitOf.get(p);
    if (uc === undefined || up === undefined) continue;
    addN(upN, uc, up);
    addN(downN, up, uc);
  }
  for (const a of ass) {
    const ua = unitOf.get(a.fromId);
    const ub = unitOf.get(a.toId);
    if (ua === undefined || ub === undefined) continue;
    if (a.kind === 'grosselternteil') {
      addN(upN, ub, ua);
      addN(downN, ua, ub);
    }
  }

  // ---------- Reihenfolge je Ebene ----------
  const layers = [...new Set(units.map((u) => u.layer))].sort((a, b) => a - b);
  const order = new Map<number, number[]>(); // layer → unit indices
  // Startreihenfolge: Komponente, dann Tiefensuche von oben
  const placed = new Set<number>();
  const seq: number[] = [];
  const visit = (u: number) => {
    if (placed.has(u)) return;
    placed.add(u);
    seq.push(u);
    const kids = [...new Set(downN.get(u) ?? [])];
    for (const k of kids) visit(k);
    for (const p of [...new Set(upN.get(u) ?? [])]) visit(p);
  };
  const roots = units.map((_, i) => i).sort((a, b) => units[a].comp - units[b].comp || units[a].layer - units[b].layer);
  for (const r of roots) visit(r);
  for (const L of layers) order.set(L, seq.filter((u) => units[u].layer === L));

  const pos = new Map<number, number>();
  const refreshPos = () => {
    for (const L of layers) order.get(L)!.forEach((u, i) => pos.set(u, i));
  };
  refreshPos();
  const bary = (u: number, nb: Map<number, number[]>) => {
    const n = nb.get(u);
    if (!n?.length) return undefined;
    return n.reduce((s, x) => s + pos.get(x)!, 0) / n.length;
  };
  for (let it = 0; it < 12; it++) {
    const seqL = it % 2 === 0 ? layers : [...layers].reverse();
    const nb = it % 2 === 0 ? upN : downN;
    for (const L of seqL) {
      const arr = order.get(L)!;
      const keyed = arr.map((u, i) => ({ u, k: bary(u, nb) ?? i, c: units[u].comp }));
      keyed.sort((a, b) => a.c - b.c || a.k - b.k);
      order.set(L, keyed.map((x) => x.u));
      refreshPos();
    }
  }

  // ---------- x-Koordinaten ----------
  const unitW = (u: number) => units[u].members.length * TILE_W + (units[u].members.length - 1) * PARTNER_GAP;
  const cx = new Map<number, number>();
  // Start: dicht gepackt pro Ebene und Komponente
  const compOffset = new Map<number, number>();
  for (const L of layers) {
    let x = 0;
    for (const u of order.get(L)!) {
      cx.set(u, x + unitW(u) / 2);
      x += unitW(u) + GAP;
    }
  }
  const relax = (L: number, nb: Map<number, number[]>) => {
    const arr = order.get(L)!;
    const desired = arr.map((u) => {
      const n = nb.get(u);
      if (!n?.length) return cx.get(u)!;
      return n.reduce((s, x) => s + cx.get(x)!, 0) / n.length;
    });
    // blockweise Überlappungen auflösen (Reihenfolge bleibt)
    type B = { start: number; width: number; items: { u: number; off: number; d: number }[] };
    const blocks: B[] = [];
    arr.forEach((u, i) => {
      const w = unitW(u);
      let b: B = { start: desired[i] - w / 2, width: w, items: [{ u, off: 0, d: desired[i] }] };
      while (blocks.length) {
        const prev = blocks[blocks.length - 1];
        if (prev.start + prev.width + GAP <= b.start) break;
        blocks.pop();
        const shift = prev.width + GAP;
        const items = [...prev.items, ...b.items.map((x) => ({ ...x, off: x.off + shift }))];
        const width = prev.width + GAP + b.width;
        const start = items.reduce((s, x) => s + (x.d - x.off - unitW(x.u) / 2), 0) / items.length;
        b = { start, width, items };
      }
      blocks.push(b);
    });
    for (const b of blocks) for (const it of b.items) cx.set(it.u, b.start + it.off + unitW(it.u) / 2);
  };
  for (let it = 0; it < 6; it++) {
    for (const L of layers) relax(L, upN);
    for (const L of [...layers].reverse()) relax(L, downN);
  }
  for (const L of layers) relax(L, upN);

  // Komponenten nebeneinander
  const compIds = [...new Set(units.map((u) => u.comp))].sort((a, b) => a - b);
  let cursor = 0;
  for (const c of compIds) {
    const us = units.map((_, i) => i).filter((i) => units[i].comp === c);
    const minX = Math.min(...us.map((u) => cx.get(u)! - unitW(u) / 2));
    const maxX = Math.max(...us.map((u) => cx.get(u)! + unitW(u) / 2));
    compOffset.set(c, cursor - minX);
    cursor += maxX - minX + COMP_GAP;
  }

  const nodes = new Map<string, LNode>();
  for (let u = 0; u < units.length; u++) {
    const left = cx.get(u)! - unitW(u) / 2 + compOffset.get(units[u].comp)!;
    units[u].members.forEach((m, i) => {
      nodes.set(m, { id: m, x: left + i * (TILE_W + PARTNER_GAP), y: units[u].layer * LAYER_H, layer: units[u].layer, person: idx.byId.get(m)!, loose: false });
    });
  }
  // lose Personen als Raster rechts („Offener Anschluss“)
  const looseList = [...loose];
  looseList.forEach((id, i) => {
    const p = idx.byId.get(id)!;
    const col = i % 2;
    const row = Math.floor(i / 2);
    const baseY = (layers[0] ?? 8) * LAYER_H;
    nodes.set(id, { id, x: cursor + col * (TILE_W + GAP), y: baseY + row * (TILE_H + GAP), layer: -1, person: p, loose: true });
  });

  const all = [...nodes.values()];
  const minX = Math.min(0, ...all.map((n) => n.x));
  const minY = Math.min(...all.map((n) => n.y), 0);
  const maxX = Math.max(...all.map((n) => n.x + TILE_W), 0);
  const maxY = Math.max(...all.map((n) => n.y + TILE_H), 0);
  return {
    nodes,
    families,
    partnerships: pas.filter((p) => nodes.has(p.p1) && nodes.has(p.p2)),
    assertions: ass.filter((a) => nodes.has(a.fromId) && nodes.has(a.toId)),
    width: maxX - minX,
    height: maxY - minY,
    minX,
    minY,
  };
}
