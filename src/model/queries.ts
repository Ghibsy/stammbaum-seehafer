import type { GenDate, NameType, Person, PersonEvent, Status, TreeDoc } from './types';
import { sortRange } from './dates';

export const isActive = (s: Status) => s !== 'widerlegt';

export function nameOf(p: Person, type: NameType): string | undefined {
  return p.names.find((n) => n.type === type && isActive(n.status))?.value;
}

export function namesOf(p: Person, type: NameType): string[] {
  return p.names.filter((n) => n.type === type && isActive(n.status)).map((n) => n.value);
}

/** Anzeigename: Rufname (falls vorhanden) bzw. Vornamen + Nachname; Platzhalter mit Bezeichnung */
export function displayName(p: Person): string {
  const ph = nameOf(p, 'platzhalter');
  const given = nameOf(p, 'vorname');
  const sur = nameOf(p, 'nachname');
  if (!given && !sur) return ph ?? p.id;
  return [given, sur].filter(Boolean).join(' ');
}

export function shortName(p: Person): string {
  const ph = nameOf(p, 'platzhalter');
  const call = nameOf(p, 'rufname');
  const given = nameOf(p, 'vorname');
  const sur = nameOf(p, 'nachname');
  if (!given && !sur) return ph ?? p.id;
  const g = given && call && given.split(/\s+/).includes(call) ? call : given;
  return [g, sur].filter(Boolean).join(' ');
}

export function eventOf(p: Person, type: PersonEvent['type']): PersonEvent | undefined {
  return p.events.find((e) => e.type === type && isActive(e.status));
}

export function birthDate(p: Person): GenDate | undefined {
  return eventOf(p, 'geburt')?.date;
}
export function deathDate(p: Person): GenDate | undefined {
  return eventOf(p, 'tod')?.date;
}

export function isDeceased(p: Person): boolean {
  return p.living === 'verstorben' || !!eventOf(p, 'tod');
}

/**
 * Für Datenschutz: Person gilt als lebend, sofern nicht verstorben und nicht nachweislich
 * vor mehr als 110 Jahren geboren. Unbekannt → wie lebend behandeln.
 */
export function treatAsLiving(p: Person, now = new Date()): boolean {
  if (isDeceased(p)) return false;
  if (p.kind === 'platzhalter') return false;
  const r = sortRange(birthDate(p));
  if (r && Math.floor(r[1] / 10000) < now.getFullYear() - 110) return false;
  return true;
}

export class Index {
  readonly byId = new Map<string, Person>();
  readonly parentsOf = new Map<string, string[]>();
  readonly childrenOf = new Map<string, string[]>();
  readonly partnersOf = new Map<string, string[]>();

  constructor(readonly doc: TreeDoc) {
    for (const p of doc.persons) if (!p.deletedAt) this.byId.set(p.id, p);
    for (const pc of doc.parentChild) {
      if (!isActive(pc.status) || !this.byId.has(pc.parentId) || !this.byId.has(pc.childId)) continue;
      push(this.parentsOf, pc.childId, pc.parentId);
      push(this.childrenOf, pc.parentId, pc.childId);
    }
    for (const pa of doc.partnerships) {
      if (!isActive(pa.status) || !this.byId.has(pa.p1) || !this.byId.has(pa.p2)) continue;
      push(this.partnersOf, pa.p1, pa.p2);
      push(this.partnersOf, pa.p2, pa.p1);
    }
  }

  person(id: string) {
    return this.byId.get(id);
  }
  parents(id: string) {
    return this.parentsOf.get(id) ?? [];
  }
  children(id: string) {
    return this.childrenOf.get(id) ?? [];
  }
  partners(id: string) {
    return this.partnersOf.get(id) ?? [];
  }
  /** Geschwister über gemeinsame Eltern (voll- oder halbbürtig) */
  siblings(id: string): { id: string; half: boolean }[] {
    const mine = new Set(this.parents(id));
    const out = new Map<string, boolean>();
    for (const par of mine) {
      for (const c of this.children(par)) {
        if (c === id) continue;
        const theirs = new Set(this.parents(c));
        const half = mine.size !== theirs.size || [...mine].some((x) => !theirs.has(x));
        out.set(c, half);
      }
    }
    return [...out].map(([sid, half]) => ({ id: sid, half }));
  }
  assertionsOf(id: string) {
    return this.doc.assertions.filter((a) => isActive(a.status) && (a.fromId === id || a.toId === id));
  }
}

function push(m: Map<string, string[]>, k: string, v: string) {
  const arr = m.get(k);
  if (arr) {
    if (!arr.includes(v)) arr.push(v);
  } else m.set(k, [v]);
}
