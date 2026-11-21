import { nextId, uid } from './ids';
import type {
  Assertion,
  DuplicatePair,
  NameEntry,
  NameType,
  ParentChild,
  ParentChildType,
  Partnership,
  PartnershipState,
  Person,
  Sex,
  Status,
  TreeDoc,
} from './types';
import { displayName, nameOf } from './queries';
import { parseGenDate } from './dates';

const now = () => new Date().toISOString();

export function name(type: NameType, value: string, status: Status = 'familienangabe', note?: string): NameEntry {
  return { id: uid('n'), type, value, status, citations: [], ...(note ? { note } : {}) };
}

export function blankPerson(id: string, kind: Person['kind'] = 'benannt'): Person {
  const t = now();
  return { id, kind, sex: 'u', living: 'unbekannt', names: [], events: [], tags: [], links: [], citations: [], history: [], createdAt: t, updatedAt: t };
}

export function touch(p: Person) {
  p.updatedAt = now();
}

export interface NewPersonInput {
  given?: string;
  surname?: string;
  birthName?: string;
  sex?: Sex;
  birth?: string;
  placeholder?: string;
  tags?: string[];
  status?: Status;
}

export function addPerson(doc: TreeDoc, input: NewPersonInput): Person {
  const unnamed = !input.given && !input.surname;
  const id = nextId(doc, unnamed ? 'U' : 'P');
  const p = blankPerson(id, input.placeholder && unnamed ? 'unbenannt' : 'benannt');
  const st = input.status ?? 'familienangabe';
  if (input.given) p.names.push(name('vorname', input.given.trim(), st));
  if (input.surname) p.names.push(name('nachname', input.surname.trim(), st));
  if (input.birthName) p.names.push(name('geburtsname', input.birthName.trim(), st));
  if (input.placeholder) p.names.push(name('platzhalter', input.placeholder.trim(), st));
  p.sex = input.sex ?? 'u';
  if (input.birth) {
    const d = parseGenDate(input.birth);
    if (d) p.events.push({ id: uid('e'), type: 'geburt', date: d, status: d.uncertain ? 'unsicher' : st, citations: [], mediaIds: [] });
  }
  p.tags = input.tags ?? [];
  doc.persons.push(p);
  return p;
}

export function addParentChild(doc: TreeDoc, parentId: string, childId: string, type: ParentChildType = 'leiblich', status: Status = 'familienangabe'): ParentChild {
  const ex = doc.parentChild.find((x) => x.parentId === parentId && x.childId === childId);
  if (ex) return ex;
  const pc: ParentChild = { id: uid('pc'), parentId, childId, type, status, citations: [] };
  doc.parentChild.push(pc);
  return pc;
}

export function addPartnership(doc: TreeDoc, a: string, b: string, state: PartnershipState = 'unbekannt', status: Status = 'familienangabe'): Partnership {
  const ex = doc.partnerships.find((x) => (x.p1 === a && x.p2 === b) || (x.p1 === b && x.p2 === a));
  if (ex) return ex;
  const pa: Partnership = { id: uid('pa'), p1: a, p2: b, state, events: [], status, citations: [] };
  doc.partnerships.push(pa);
  return pa;
}

export function addAssertion(doc: TreeDoc, a: Omit<Assertion, 'id' | 'citations'> & { citations?: Assertion['citations'] }): Assertion {
  const as: Assertion = { id: uid('as'), citations: [], ...a };
  doc.assertions.push(as);
  return as;
}

/** Vorbelegung für die Schnellerfassung an einer Person */
export function quickDefaults(doc: TreeDoc, anchorId: string, rel: 'kind' | 'partner' | 'elternteil'): NewPersonInput {
  const a = doc.persons.find((p) => p.id === anchorId);
  if (!a) return {};
  const sur = nameOf(a, 'nachname');
  switch (rel) {
    case 'kind':
      return { surname: sur, tags: [...a.tags] };
    case 'partner':
      return { sex: a.sex === 'm' ? 'w' : a.sex === 'w' ? 'm' : 'u', tags: [...a.tags] };
    case 'elternteil':
      return { surname: a.sex !== 'u' ? sur : undefined, tags: [...a.tags] };
  }
}

/** Papierkorb: weiches Löschen, Beziehungen bleiben gespeichert und erscheinen nach Wiederherstellen wieder */
export function trashPerson(doc: TreeDoc, id: string) {
  const p = doc.persons.find((x) => x.id === id);
  if (p) {
    p.deletedAt = now();
    touch(p);
  }
}

export function restorePerson(doc: TreeDoc, id: string) {
  const p = doc.persons.find((x) => x.id === id);
  if (p) {
    delete p.deletedAt;
    touch(p);
  }
}

/** Endgültig löschen (nur aus dem Papierkorb) */
export function purgePerson(doc: TreeDoc, id: string) {
  doc.persons = doc.persons.filter((p) => p.id !== id);
  doc.parentChild = doc.parentChild.filter((x) => x.parentId !== id && x.childId !== id);
  doc.partnerships = doc.partnerships.filter((x) => x.p1 !== id && x.p2 !== id);
  doc.assertions = doc.assertions.filter((x) => x.fromId !== id && x.toId !== id);
}

/** Angabe zurücknehmen: bleibt in der Historie sichtbar, wird nicht mehr angezeigt oder exportiert */
export function retractName(p: Person, nameId: string, reason?: string) {
  const n = p.names.find((x) => x.id === nameId);
  if (!n) return;
  p.history.push({ at: now(), what: `Name (${n.type})`, oldValue: n.value, newValue: '', reason: reason ?? 'zurückgenommen' });
  n.status = 'widerlegt';
  touch(p);
}

export function retractEvent(p: Person, eventId: string, reason?: string) {
  const e = p.events.find((x) => x.id === eventId);
  if (!e) return;
  p.history.push({ at: now(), what: `Ereignis (${e.type})`, oldValue: [e.date?.raw, e.place].filter(Boolean).join(', '), newValue: '', reason: reason ?? 'zurückgenommen' });
  e.status = 'widerlegt';
  touch(p);
}

/** Feldänderung mit Historie (für Werte, die überschrieben werden) */
export function recordChange(p: Person, what: string, oldValue: string | undefined, newValue: string | undefined, reason?: string) {
  if ((oldValue ?? '') === (newValue ?? '')) return;
  if (oldValue) p.history.push({ at: now(), what, oldValue, newValue: newValue ?? '', reason });
  touch(p);
}

/**
 * Strukturellen Platzhalter für die unbekannten Eltern einer Geschwistergruppe anlegen.
 * Die Geschwister werden als Kinder (Status "abgeleitet") verbunden.
 */
export function createPlaceholderParents(doc: TreeDoc, memberIds: string[], label?: string): Person {
  const id = nextId(doc, 'U');
  const p = blankPerson(id, 'platzhalter');
  const names = memberIds.map((m) => doc.persons.find((x) => x.id === m)).filter(Boolean).map((x) => displayName(x!));
  p.names.push(name('platzhalter', label ?? `Eltern von ${joinDe(names)}`, 'abgeleitet'));
  p.note = 'Struktureller Platzhalter für die unbekannten gemeinsamen Eltern. Name, Anzahl und Lebensdaten unbekannt.';
  doc.persons.push(p);
  for (const m of memberIds) addParentChild(doc, id, m, 'leiblich', 'abgeleitet');
  return p;
}

export function joinDe(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`;
}

/** Zwei Personen als dieselbe zusammenführen (removeId geht in keepId auf). Rückgängig über undoMerge. */
export function mergePersons(doc: TreeDoc, keepId: string, removeId: string, note?: string): DuplicatePair {
  const keep = doc.persons.find((p) => p.id === keepId);
  const rem = doc.persons.find((p) => p.id === removeId);
  if (!keep || !rem || keepId === removeId) throw new Error('Ungültige Zusammenführung');
  const snapshot = {
    removed: structuredClone(rem),
    keptBefore: structuredClone(keep),
    parentChild: structuredClone(doc.parentChild.filter((x) => x.parentId === removeId || x.childId === removeId)),
    partnerships: structuredClone(doc.partnerships.filter((x) => x.p1 === removeId || x.p2 === removeId)),
    assertions: structuredClone(doc.assertions.filter((x) => x.fromId === removeId || x.toId === removeId)),
  };
  // Namen: fehlende übernehmen, abweichende Vor-/Nachnamen als Variante
  for (const n of rem.names) {
    if (keep.names.some((k) => k.value === n.value)) continue;
    const t: NameType = n.type === 'platzhalter' ? 'platzhalter' : keep.names.some((k) => k.type === n.type) && (n.type === 'vorname' || n.type === 'nachname') ? 'variante' : n.type;
    keep.names.push({ ...n, id: uid('n'), type: t, note: [n.note, `aus ${removeId}`].filter(Boolean).join('; ') });
  }
  for (const e of rem.events) keep.events.push({ ...e, id: uid('e'), note: [e.note, `aus ${removeId}`].filter(Boolean).join('; ') });
  for (const c of rem.citations) if (!keep.citations.some((k) => k.sourceId === c.sourceId)) keep.citations.push(c);
  keep.tags = [...new Set([...keep.tags, ...rem.tags])];
  keep.links = [...new Set([...keep.links, ...rem.links])];
  keep.note = [keep.note, rem.note && `[aus ${removeId}] ${rem.note}`].filter(Boolean).join('\n\n') || undefined;
  if (keep.kind === 'unbenannt' && rem.kind === 'benannt') keep.kind = 'benannt';
  keep.history.push({ at: now(), what: 'Zusammenführung', oldValue: removeId, newValue: keepId, reason: note ?? 'als dieselbe Person zusammengeführt' });
  touch(keep);
  // Beziehungen umhängen (ohne Doppelungen und ohne Selbstbezug)
  for (const pc of doc.parentChild) {
    if (pc.parentId === removeId) pc.parentId = keepId;
    if (pc.childId === removeId) pc.childId = keepId;
  }
  // Bei Doppelungen bleibt der bisherige Eintrag der behaltenen Person erhalten (wichtig für Rückgängig)
  const movedPc = new Set(snapshot.parentChild.map((x) => x.id));
  doc.parentChild = dedupe(
    [...doc.parentChild.filter((x) => !movedPc.has(x.id)), ...doc.parentChild.filter((x) => movedPc.has(x.id))].filter((x) => x.parentId !== x.childId),
    (x) => `${x.parentId}>${x.childId}`,
  );
  for (const pa of doc.partnerships) {
    if (pa.p1 === removeId) pa.p1 = keepId;
    if (pa.p2 === removeId) pa.p2 = keepId;
  }
  const movedPa = new Set(snapshot.partnerships.map((x) => x.id));
  doc.partnerships = dedupe(
    [...doc.partnerships.filter((x) => !movedPa.has(x.id)), ...doc.partnerships.filter((x) => movedPa.has(x.id))].filter((x) => x.p1 !== x.p2),
    (x) => [x.p1, x.p2].sort().join('~'),
  );
  for (const a of doc.assertions) {
    if (a.fromId === removeId) a.fromId = keepId;
    if (a.toId === removeId) a.toId = keepId;
  }
  doc.assertions = doc.assertions.filter((x) => x.fromId !== x.toId);
  doc.persons = doc.persons.filter((p) => p.id !== removeId);

  let pair = doc.duplicates.find((d) => (d.a === keepId && d.b === removeId) || (d.a === removeId && d.b === keepId));
  if (!pair) {
    pair = { id: uid('dp'), a: keepId, b: removeId, verdict: 'zusammengefuehrt' };
    doc.duplicates.push(pair);
  }
  pair.verdict = 'zusammengefuehrt';
  pair.snapshot = snapshot;
  pair.note = note ?? pair.note;
  return pair;
}

export function undoMerge(doc: TreeDoc, pairId: string) {
  const pair = doc.duplicates.find((d) => d.id === pairId);
  if (!pair?.snapshot) throw new Error('Keine Zusammenführung zum Rückgängigmachen');
  const s = pair.snapshot;
  const keepId = s.keptBefore.id;
  const remId = s.removed.id;
  doc.persons = doc.persons.map((p) => (p.id === keepId ? structuredClone(s.keptBefore) : p));
  doc.persons.push(structuredClone(s.removed));
  // Beziehungen: umgehängte Kopien entfernen, Originale wiederherstellen
  const pcIds = new Set(s.parentChild.map((x) => x.id));
  const paIds = new Set(s.partnerships.map((x) => x.id));
  const asIds = new Set(s.assertions.map((x) => x.id));
  doc.parentChild = [...doc.parentChild.filter((x) => !pcIds.has(x.id)), ...structuredClone(s.parentChild)];
  doc.partnerships = [...doc.partnerships.filter((x) => !paIds.has(x.id)), ...structuredClone(s.partnerships)];
  doc.assertions = [...doc.assertions.filter((x) => !asIds.has(x.id)), ...structuredClone(s.assertions)];
  pair.verdict = 'moeglich';
  delete pair.snapshot;
  void remId;
}

export function setDuplicateVerdict(doc: TreeDoc, a: string, b: string, verdict: DuplicatePair['verdict'], note?: string) {
  let pair = doc.duplicates.find((d) => (d.a === a && d.b === b) || (d.a === b && d.b === a));
  if (!pair) {
    pair = { id: uid('dp'), a, b, verdict };
    doc.duplicates.push(pair);
  }
  pair.verdict = verdict;
  if (note) pair.note = note;
  return pair;
}

function dedupe<T>(arr: T[], key: (x: T) => string): T[] {
  const seen = new Set<string>();
  return arr.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
