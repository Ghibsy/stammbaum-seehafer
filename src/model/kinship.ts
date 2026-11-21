import { displayName, isActive } from './queries';
import type { Person, Sex, TreeDoc } from './types';

/**
 * Verwandtschaftsrechner: kürzester Weg über gemeinsame Vorfahren (Blutsverwandtschaft),
 * sonst über eine Ehe/Partnerschaft (Schwägerschaft). Deutsche Bezeichnung aus Sicht von A:
 * „B ist … von A“. Unsichere Glieder (abgeleitet/unsicher/Platzhalter) werden gemeldet.
 */

export interface KinshipResult {
  /** z. B. „Cousine 1. Grades, 1 Generation versetzt“ */
  term: string;
  /** Erläuterung, z. B. „gemeinsame Vorfahren: Heinrich und Erna“ */
  detail: string;
  kind: 'selbst' | 'blut' | 'ehe' | 'keine';
  /** Generationen von A bzw. B bis zum gemeinsamen Vorfahren */
  upA?: number;
  upB?: number;
  half?: boolean;
  /** geschätzter Anteil gemeinsamer DNA (0..1), nur bei Blutsverwandtschaft */
  dna?: number;
  /** Personen auf dem Weg A → … → gemeinsamer Vorfahr → … → B */
  path: string[];
  commonAncestors: string[];
  uncertain: boolean;
  uncertainReasons: string[];
}

interface Graph {
  byId: Map<string, Person>;
  parents: Map<string, { id: string; weak: boolean }[]>;
  partners: Map<string, string[]>;
}

function graph(doc: TreeDoc): Graph {
  const byId = new Map(doc.persons.filter((p) => !p.deletedAt).map((p) => [p.id, p]));
  const parents = new Map<string, { id: string; weak: boolean }[]>();
  for (const pc of doc.parentChild) {
    if (!isActive(pc.status) || !byId.has(pc.parentId) || !byId.has(pc.childId)) continue;
    const weak = pc.status === 'abgeleitet' || pc.status === 'unsicher' || pc.type === 'unbekannt';
    (parents.get(pc.childId) ?? parents.set(pc.childId, []).get(pc.childId)!).push({ id: pc.parentId, weak });
  }
  const partners = new Map<string, string[]>();
  for (const pa of doc.partnerships) {
    if (!isActive(pa.status) || !byId.has(pa.p1) || !byId.has(pa.p2)) continue;
    (partners.get(pa.p1) ?? partners.set(pa.p1, []).get(pa.p1)!).push(pa.p2);
    (partners.get(pa.p2) ?? partners.set(pa.p2, []).get(pa.p2)!).push(pa.p1);
  }
  return { byId, parents, partners };
}

/** Alle Vorfahren mit kleinster Generationsentfernung und Vorgänger für den Rückweg */
function ancestors(g: Graph, start: string): Map<string, { d: number; via?: string; weak: boolean }> {
  const out = new Map<string, { d: number; via?: string; weak: boolean }>([[start, { d: 0, weak: false }]]);
  const q = [start];
  while (q.length) {
    const v = q.shift()!;
    const cur = out.get(v)!;
    for (const p of g.parents.get(v) ?? []) {
      if (out.has(p.id)) continue;
      out.set(p.id, { d: cur.d + 1, via: v, weak: cur.weak || p.weak });
      q.push(p.id);
    }
  }
  return out;
}

function chain(map: Map<string, { via?: string }>, from: string): string[] {
  const out = [from];
  let v = map.get(from)?.via;
  while (v) {
    out.push(v);
    v = map.get(v)?.via;
  }
  return out; // Vorfahr … Startperson
}

function g(sex: Sex, m: string, w: string, n: string) {
  return sex === 'm' ? m : sex === 'w' ? w : n;
}

/** Ur-Vorsilbe: 1 → „ur“, 2 → „urur“, 3 → „ururur“, ab 4 → „4-fach ur“ */
function urPrefix(n: number): string {
  if (n <= 0) return '';
  if (n <= 3) return 'ur'.repeat(n);
  return `${n}-fach ur`;
}

/** Großschreibung am Anfang und nach „/“ (z. B. „Neffe/Nichte“) */
function cap(s: string) {
  return s.replace(/(^|\/)(\p{Ll})/gu, (_, a: string, c: string) => a + c.toUpperCase());
}

/** Bezeichnung „B ist … von A“ bei Blutsverwandtschaft */
export function bloodTerm(upA: number, upB: number, sexB: Sex, half: boolean): string {
  const halb = half ? 'halb' : '';
  if (upA === 0 && upB === 0) return 'dieselbe Person';
  if (upA === 0) {
    // B ist Nachfahre von A
    if (upB === 1) return g(sexB, 'Sohn', 'Tochter', 'Kind');
    return cap(urPrefix(upB - 2) + g(sexB, 'enkel', 'enkelin', 'enkelkind'));
  }
  if (upB === 0) {
    // B ist Vorfahre von A
    if (upA === 1) return g(sexB, 'Vater', 'Mutter', 'Elternteil');
    return cap(urPrefix(upA - 2) + g(sexB, 'großvater', 'großmutter', 'großelternteil'));
  }
  if (upA === 1 && upB === 1) return cap(halb + g(sexB, 'bruder', 'schwester', 'geschwister'));
  if (upA === 1) {
    // B ist Nachfahre eines Geschwisters von A
    const pre = upB === 2 ? '' : urPrefix(upB - 3) + 'groß';
    return cap(halb + pre + g(sexB, 'neffe', 'nichte', 'neffe/nichte'));
  }
  if (upB === 1) {
    // B ist Geschwister eines Vorfahren von A
    const pre = upA === 2 ? '' : urPrefix(upA - 3) + 'groß';
    return cap(halb + pre + g(sexB, 'onkel', 'tante', 'onkel/tante'));
  }
  const degree = Math.min(upA, upB) - 1;
  const removed = Math.abs(upA - upB);
  const base = cap(halb + g(sexB, 'cousin', 'cousine', 'cousin/cousine'));
  return `${base} ${degree}. Grades${removed ? `, ${removed} Generation${removed > 1 ? 'en' : ''} versetzt` : ''}`;
}

function names(g: Graph, ids: string[]) {
  return ids.map((id) => (g.byId.get(id) ? displayName(g.byId.get(id)!) : id));
}

function joinDe(items: string[]) {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`;
}

export function kinship(doc: TreeDoc, a: string, b: string): KinshipResult {
  const gr = graph(doc);
  const empty: KinshipResult = { term: 'keine Verwandtschaft gefunden', detail: '', kind: 'keine', path: [], commonAncestors: [], uncertain: false, uncertainReasons: [] };
  if (!gr.byId.has(a) || !gr.byId.has(b)) return empty;
  if (a === b) return { ...empty, term: 'dieselbe Person', kind: 'selbst', path: [a] };

  const blood = bloodRelation(gr, a, b);
  if (blood) return blood;

  // Schwägerschaft: über Partner von A oder Partner von B
  const sexB = gr.byId.get(b)!.sex;
  if ((gr.partners.get(a) ?? []).includes(b)) {
    return { ...empty, kind: 'ehe', term: g(sexB, 'Ehemann/Partner', 'Ehefrau/Partnerin', 'Ehepartner/in'), detail: 'direkte Partnerschaft', path: [a, b] };
  }
  for (const s of gr.partners.get(a) ?? []) {
    const r = bloodRelation(gr, s, b);
    if (!r) continue;
    const special =
      r.upA === 1 && r.upB === 0
        ? g(sexB, 'Schwiegervater', 'Schwiegermutter', 'Schwiegerelternteil')
        : r.upA === 1 && r.upB === 1
          ? g(sexB, 'Schwager', 'Schwägerin', 'Schwager/Schwägerin')
          : undefined;
    const sName = names(gr, [s])[0];
    return {
      ...r,
      kind: 'ehe',
      term: special ?? `${r.term} von ${sName} (Partner/in)`,
      detail: `über die Partnerschaft mit ${sName}: ${displayName(gr.byId.get(b)!)} ist ${r.term} von ${sName}`,
      dna: undefined,
      path: [a, ...r.path],
    };
  }
  for (const s of gr.partners.get(b) ?? []) {
    const r = bloodRelation(gr, a, s);
    if (!r) continue;
    const sexS = gr.byId.get(s)!.sex;
    const sName = names(gr, [s])[0];
    const special =
      r.upA === 0 && r.upB === 1
        ? g(sexB, 'Schwiegersohn', 'Schwiegertochter', 'Schwiegerkind')
        : r.upA === 1 && r.upB === 1
          ? g(sexB, 'Schwager', 'Schwägerin', 'Schwager/Schwägerin')
          : undefined;
    const rel = bloodTerm(r.upA!, r.upB!, sexS, !!r.half);
    return {
      ...r,
      kind: 'ehe',
      term: special ?? `Partner/in von ${sName} (${rel})`,
      detail: `${displayName(gr.byId.get(b)!)} ist Partner/in von ${sName}; ${sName} ist ${rel} von ${displayName(gr.byId.get(a)!)}`,
      dna: undefined,
      path: [...r.path, b],
    };
  }
  return empty;
}

function bloodRelation(gr: Graph, a: string, b: string): KinshipResult | undefined {
  const A = ancestors(gr, a);
  const B = ancestors(gr, b);
  let best = Infinity;
  for (const [id, x] of A) {
    const y = B.get(id);
    if (y) best = Math.min(best, x.d + y.d);
  }
  if (best === Infinity) return undefined;
  // gemeinsame Vorfahren auf kürzester Entfernung
  const lcas = [...A.keys()].filter((id) => B.has(id) && A.get(id)!.d + B.get(id)!.d === best);
  // nur „unterste“ gemeinsame Vorfahren (deren Kinder nicht ebenfalls gemeinsam sind) – bei gleicher Summe ohnehin
  const pick = lcas.sort((x, y) => A.get(x)!.d - A.get(y)!.d)[0];
  const upA = A.get(pick)!.d;
  const upB = B.get(pick)!.d;
  const sameLevel = lcas.filter((id) => A.get(id)!.d === upA && B.get(id)!.d === upB);
  const isPlaceholder = (id: string) => gr.byId.get(id)?.kind === 'platzhalter';
  // vollbürtig, wenn zwei gemeinsame Vorfahren derselben Ebene (Elternpaar) oder ein Platzhalter für ein Elternpaar
  const pairCount = sameLevel.length >= 2 ? 2 : sameLevel.some(isPlaceholder) ? 2 : 1;
  const half = upA > 0 && upB > 0 && pairCount < 2;
  const reasons: string[] = [];
  if (A.get(pick)!.weak || B.get(pick)!.weak) reasons.push('Der Weg enthält eine abgeleitete oder unsichere Eltern-Kind-Beziehung.');
  if (sameLevel.some(isPlaceholder)) reasons.push('Der gemeinsame Vorfahr ist ein Platzhalter (unbekannte Eltern); vollbürtige Geschwister angenommen.');
  if (half && upA > 0 && upB > 0) reasons.push('Nur ein gemeinsamer Vorfahr bekannt – „halb“ kann auch an fehlenden Angaben zum zweiten Elternteil liegen.');
  const sexB = gr.byId.get(b)!.sex;
  const term = bloodTerm(upA, upB, sexB, half);
  const n = upA + upB;
  const dna = upA === 0 || upB === 0 ? Math.pow(0.5, n) : pairCount * Math.pow(0.5, n);
  const left = chain(A, pick).reverse(); // a … pick
  const right = chain(B, pick); // pick … b
  const path = [...left, ...right.slice(1)];
  const ca = sameLevel.filter((id) => !isPlaceholder(id) || sameLevel.length === 1);
  return {
    term,
    detail: upA === 0 || upB === 0 ? `direkte Linie über ${n} Generation${n > 1 ? 'en' : ''}` : `gemeinsame Vorfahren: ${joinDe(names(gr, ca))}`,
    kind: 'blut',
    upA,
    upB,
    half,
    dna,
    path,
    commonAncestors: ca,
    uncertain: reasons.length > 0,
    uncertainReasons: reasons,
  };
}

export function formatDna(x: number | undefined): string {
  if (x === undefined) return '';
  const p = x * 100;
  return `${p >= 1 ? p.toLocaleString('de-DE', { maximumFractionDigits: 2 }) : p.toLocaleString('de-DE', { maximumSignificantDigits: 2 })} %`;
}
