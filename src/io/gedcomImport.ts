import { formatGenDate, parseGenDate, sortRange } from '../model/dates';
import { nextId, uid } from '../model/ids';
import { addAssertion, addParentChild, addPartnership, blankPerson, name } from '../model/ops';
import { birthDate, displayName, eventOf, Index, nameOf } from '../model/queries';
import { normalize } from '../model/search';
import type { Citation, EventType, GenDate, ParentChildType, PartnershipEventType, Sex, Source, Status, TreeDoc } from '../model/types';

/**
 * GEDCOM-Import (5.5.1 und 7.0) mit Dublettenabgleich.
 * Grundsätze: Es wird nichts überschrieben. Bei einer Zusammenführung kommen nur fehlende Angaben
 * hinzu; abweichende Werte werden als zusätzliche Angabe (Status „unsicher“) mit Hinweis gespeichert.
 * Jede übernommene Angabe zitiert die importierte Datei als Quelle.
 */

export interface GNode {
  level: number;
  xref?: string;
  tag: string;
  value: string;
  children: GNode[];
}

/** Bytes → Text: UTF-8 (mit/ohne BOM), UTF-16, sonst Windows-1252 */
export function decodeGedcom(bytes: Uint8Array): { text: string; warning?: string } {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(bytes) };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(bytes) };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '') };
  } catch {
    const text = new TextDecoder('windows-1252').decode(bytes);
    const ansel = /1 CHAR ANSEL/i.test(text);
    return { text, warning: ansel ? 'Die Datei ist ANSEL-kodiert; Sonderzeichen (z. B. ł, ń) können falsch erscheinen. Bitte im Ursprungsprogramm als UTF-8 exportieren.' : 'Die Datei ist nicht UTF-8; sie wurde als Windows-1252 gelesen.' };
  }
}

export function parseGedcom(text: string): GNode[] {
  const roots: GNode[] = [];
  const stack: GNode[] = [];
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/^\s+/, '');
    if (!line) continue;
    const m = line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_]+)(?: (.*))?$/);
    if (!m) continue;
    const level = +m[1];
    const node: GNode = { level, xref: m[2], tag: m[3].toUpperCase(), value: m[4] ?? '', children: [] };
    if (node.tag === 'CONT' || node.tag === 'CONC') {
      const parent = stack[level - 1];
      if (parent) parent.value += (node.tag === 'CONT' ? '\n' : '') + node.value;
      continue;
    }
    stack.length = level;
    if (level === 0) roots.push(node);
    else stack[level - 1]?.children.push(node);
    stack[level] = node;
  }
  return roots;
}

const kid = (n: GNode, tag: string) => n.children.find((c) => c.tag === tag);
const kids = (n: GNode, tag: string) => n.children.filter((c) => c.tag === tag);
const val = (n: GNode | undefined) => n?.value.trim() || undefined;

const MONTH: Record<string, number> = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const pad = (n: number) => String(n).padStart(2, '0');

function dmy(s: string): string | undefined {
  const t = s.trim().replace(/^@#D[A-Z ]+@\s*/, '').split(/\s+/);
  if (t.length === 3 && MONTH[t[1].toUpperCase()]) return `${pad(+t[0])}.${pad(MONTH[t[1].toUpperCase()])}.${t[2]}`;
  if (t.length === 2 && MONTH[t[0].toUpperCase()]) return `${pad(MONTH[t[0].toUpperCase()])}.${t[1]}`;
  if (t.length === 1 && /^\d{3,4}$/.test(t[0])) return t[0];
  return undefined;
}

/** GEDCOM-Datum → GenDate (über die deutsche Schreibweise, damit dieselben Regeln gelten) */
export function fromGedDate(value: string | undefined, phrase?: string): GenDate | undefined {
  const s = value?.trim();
  if (!s) return phrase ? parseGenDate(phrase) : undefined;
  const ph = s.match(/^\((.*)\)$/);
  if (ph) return parseGenDate(ph[1]);
  let m: RegExpMatchArray | null;
  let de: string | undefined;
  if ((m = s.match(/^(?:ABT|CAL|EST)\s+(.+)$/i))) de = (x => x && `etwa ${x}`)(dmy(m[1]));
  else if ((m = s.match(/^BEF\s+(.+)$/i))) de = (x => x && `vor ${x}`)(dmy(m[1]));
  else if ((m = s.match(/^AFT\s+(.+)$/i))) de = (x => x && `nach ${x}`)(dmy(m[1]));
  else if ((m = s.match(/^(?:BET|FROM)\s+(.+?)\s+(?:AND|TO)\s+(.+)$/i))) {
    const a = dmy(m[1]);
    const b = dmy(m[2]);
    de = a && b ? `zwischen ${a} und ${b}` : undefined;
  } else if ((m = s.match(/^FROM\s+(.+)$/i))) de = (x => x && `nach ${x}`)(dmy(m[1]));
  else if ((m = s.match(/^TO\s+(.+)$/i))) de = (x => x && `vor ${x}`)(dmy(m[1]));
  else if ((m = s.match(/^INT\s+(.+?)\s*\((.*)\)$/i))) de = dmy(m[1]) ?? m[2];
  else de = dmy(s);
  const g = parseGenDate(de ?? s);
  if (g && !de) g.remark = g.remark ?? `GEDCOM: ${s}`;
  if (g && phrase) g.remark = g.remark ? `${g.remark}; ${phrase}` : phrase;
  return g;
}

const STATI: Status[] = ['belegt', 'familienangabe', 'abgeleitet', 'unsicher', 'widerlegt'];
const statOf = (n: GNode, dflt: Status): Status => {
  const s = val(kid(n, '_STAT')) as Status | undefined;
  return s && STATI.includes(s) ? s : dflt;
};

export interface GedEvent {
  type: EventType;
  label?: string;
  date?: GenDate;
  place?: string;
  note?: string;
  status: Status;
  sources: { xref: string; page?: string }[];
}
export interface GedPerson {
  xref: string;
  given?: string;
  surname?: string;
  birthName?: string;
  nick?: string;
  variants: string[];
  placeholderLabel?: string;
  sex: Sex;
  events: GedEvent[];
  note?: string;
  nameStatus: Status;
  assoc: { to: string; label: string; status: Status }[];
  anonymized: boolean;
}
export interface GedFamily {
  xref: string;
  parents: string[];
  kids: { xref: string; pedi?: string; status: Status }[];
  state: 'verheiratet' | 'geschieden' | 'paar' | 'unbekannt';
  events: { type: PartnershipEventType; date?: GenDate; place?: string; status: Status }[];
  status: Status;
}
export interface GedSource {
  xref: string;
  title: string;
  author?: string;
  publ?: string;
  note?: string;
}
export interface GedData {
  version: string;
  sourceProgram?: string;
  persons: GedPerson[];
  families: GedFamily[];
  sources: GedSource[];
  warnings: string[];
}

const EVT: Record<string, EventType> = { BIRT: 'geburt', DEAT: 'tod', BURI: 'bestattung', CREM: 'bestattung', RESI: 'wohnort', BAPM: 'taufe', CHR: 'taufe', RELI: 'konfession', OCCU: 'beruf', EDUC: 'ausbildung', EMIG: 'sonstiges', IMMI: 'sonstiges', EVEN: 'sonstiges', FACT: 'sonstiges', CONF: 'sonstiges', GRAD: 'ausbildung' };
const EVT_LABEL: Record<string, string> = { EMIG: 'Auswanderung', IMMI: 'Einwanderung', CREM: 'Einäscherung', CONF: 'Konfirmation', CHR: 'Taufe' };

export function readGedcom(text: string, defaultStatus: Status = 'unsicher'): GedData {
  const roots = parseGedcom(text);
  const warnings: string[] = [];
  const head = roots.find((r) => r.tag === 'HEAD');
  const version = val(head && kid(kid(head, 'GEDC') ?? head, 'VERS')) ?? 'unbekannt';
  const sourceProgram = val(head && kid(head, 'SOUR'));
  if (!head) warnings.push('Kein GEDCOM-Kopf (HEAD) gefunden – ist das eine GEDCOM-Datei?');
  const persons: GedPerson[] = [];
  const families: GedFamily[] = [];
  const sources: GedSource[] = [];
  const cites = (n: GNode) => kids(n, 'SOUR').filter((s) => s.value.startsWith('@')).map((s) => ({ xref: s.value.trim(), page: val(kid(s, 'PAGE')) }));
  const dateOf = (n: GNode) => {
    const d = kid(n, 'DATE');
    return d ? fromGedDate(d.value, val(kid(d, 'PHRASE'))) : undefined;
  };

  for (const r of roots) {
    if (r.tag === 'INDI' && r.xref) {
      const names = kids(r, 'NAME');
      const p: GedPerson = { xref: r.xref, variants: [], sex: 'u', events: [], nameStatus: defaultStatus, assoc: [], anonymized: false };
      for (const n of names) {
        const type = val(kid(n, 'TYPE'))?.toLowerCase();
        const sm = n.value.match(/^(.*?)\/(.*?)\/(.*)$/);
        const given = (val(kid(n, 'GIVN')) ?? (sm ? `${sm[1]} ${sm[3]}` : n.value)).replace(/\s+/g, ' ').trim() || undefined;
        const sur = (val(kid(n, 'SURN')) ?? sm?.[2] ?? '').trim() || undefined;
        if (type === 'birth' || type === 'maiden') {
          p.birthName ??= sur;
          continue;
        }
        if (type === 'aka' || p.given !== undefined || p.surname !== undefined) {
          const full = [given, sur].filter(Boolean).join(' ');
          if (full) p.variants.push(full);
          continue;
        }
        p.given = given;
        p.surname = sur;
        p.nick = val(kid(n, 'NICK'));
        p.nameStatus = statOf(n, defaultStatus);
        if (type === 'married' && !p.birthName) {
          /* Geburtsname folgt ggf. in einem weiteren NAME */
        }
      }
      // _MARNM (manche Programme) als aktueller Nachname, wenn der Hauptname der Geburtsname ist
      const marnm = names.map((n) => val(kid(n, '_MARNM'))).find(Boolean);
      if (marnm && p.surname && marnm !== p.surname) {
        p.birthName ??= p.surname;
        p.surname = marnm;
      }
      if (p.given === 'Lebende Person' && !p.surname) p.anonymized = true;
      const sx = val(kid(r, 'SEX'))?.toUpperCase();
      p.sex = sx === 'M' ? 'm' : sx === 'F' ? 'w' : sx === 'X' ? 'd' : 'u';
      for (const c of r.children) {
        const type = EVT[c.tag];
        if (!type) continue;
        const v = c.value.trim();
        const ev: GedEvent = { type, date: dateOf(c), place: val(kid(c, 'PLAC')), status: statOf(c, defaultStatus), sources: cites(c) };
        const t = val(kid(c, 'TYPE'));
        if (EVT_LABEL[c.tag]) ev.label = EVT_LABEL[c.tag];
        if (c.tag === 'EVEN' || c.tag === 'FACT') ev.label = t ?? 'Ereignis';
        if ((type === 'beruf' || type === 'konfession' || type === 'ausbildung') && v && v !== 'Y') ev.label = v;
        const addr = val(kid(c, 'ADDR'));
        const notes = [kids(c, 'NOTE').map((x) => x.value).join('\n'), addr ? `Adresse: ${addr}` : '', c.tag === 'EVEN' || c.tag === 'FACT' ? (v && v !== 'Y' ? v : '') : ''].filter(Boolean).join('\n');
        if (notes) ev.note = notes;
        if (!ev.date && !ev.place && !ev.note && !ev.label && v !== 'Y' && type !== 'tod') continue;
        p.events.push(ev);
      }
      for (const a of kids(r, 'ASSO')) {
        const label = val(kid(a, 'RELA')) ?? val(kid(kid(a, 'ROLE') ?? a, 'PHRASE')) ?? val(kid(a, 'ROLE')) ?? 'verbunden';
        p.assoc.push({ to: a.value.trim(), label, status: statOf(a, defaultStatus) });
      }
      const notes = kids(r, 'NOTE').map((n) => n.value).filter((x) => !x.startsWith('@'));
      const ph = notes.find((n) => n.startsWith('Platzhalter'));
      if (ph && !p.surname) {
        p.placeholderLabel = p.given;
        p.given = undefined;
      }
      const rest = notes.filter((n) => n !== ph);
      if (rest.length) p.note = rest.join('\n\n');
      persons.push(p);
    } else if (r.tag === 'FAM' && r.xref) {
      const parents = [...kids(r, 'HUSB'), ...kids(r, 'WIFE')].map((x) => x.value.trim()).filter(Boolean);
      const f: GedFamily = { xref: r.xref, parents, kids: kids(r, 'CHIL').map((c) => ({ xref: c.value.trim(), status: defaultStatus })), state: 'unbekannt', events: [], status: statOf(r, defaultStatus) };
      for (const c of r.children) {
        const type: PartnershipEventType | undefined = c.tag === 'MARR' ? 'heirat' : c.tag === 'ENGA' ? 'verlobung' : c.tag === 'DIV' ? 'scheidung' : undefined;
        if (!type) continue;
        if (type === 'heirat' && f.state === 'unbekannt') f.state = 'verheiratet';
        if (type === 'scheidung') f.state = 'geschieden';
        const d = dateOf(c);
        const place = val(kid(c, 'PLAC'));
        if (d || place) f.events.push({ type, date: d, place, status: statOf(c, defaultStatus) });
      }
      if (kids(r, 'NOTE').some((n) => /^Paar \(nicht verheiratet\)/.test(n.value))) f.state = 'paar';
      families.push(f);
    } else if (r.tag === 'SOUR' && r.xref) {
      sources.push({ xref: r.xref, title: val(kid(r, 'TITL')) ?? val(kid(r, 'ABBR')) ?? r.xref, author: val(kid(r, 'AUTH')), publ: val(kid(r, 'PUBL')), note: kids(r, 'NOTE').map((n) => n.value).join('\n') || undefined });
    }
  }
  // PEDI und Status der Kind-Verknüpfung stehen an der Person (FAMC)
  for (const r of roots) {
    if (r.tag !== 'INDI' || !r.xref) continue;
    for (const fc of kids(r, 'FAMC')) {
      const f = families.find((x) => x.xref === fc.value.trim());
      const k = f?.kids.find((x) => x.xref === r.xref);
      if (!k) continue;
      k.pedi = val(kid(fc, 'PEDI'))?.toUpperCase();
      k.status = statOf(fc, k.status);
    }
  }
  const anon = persons.filter((p) => p.anonymized).length;
  if (anon) warnings.push(`${anon} anonymisierte Personen („Lebende Person“) – standardmäßig nicht übernommen.`);
  return { version, sourceProgram, persons, families, sources, warnings };
}

// ---------- Dublettenabgleich ----------

export interface Candidate {
  id: string;
  label: string;
  score: number;
  why: string;
}
export interface MatchRow {
  xref: string;
  label: string;
  candidates: Candidate[];
  /** Vorschlag: 'neu', 'skip' oder eine vorhandene Person-ID */
  suggestion: string;
}

const gedLabel = (p: GedPerson) => {
  const n = [p.given, p.surname].filter(Boolean).join(' ') || p.placeholderLabel || p.xref;
  const b = p.events.find((e) => e.type === 'geburt')?.date;
  return b ? `${n} (*${formatGenDate(b)})` : n;
};

export function matchPersons(doc: TreeDoc, ged: GedData): MatchRow[] {
  const idx = new Index(doc);
  const existing = [...idx.byId.values()].filter((p) => p.kind !== 'platzhalter');
  const keysOf = (given?: string, surs: (string | undefined)[] = [], variants: string[] = []) => {
    const out = new Set<string>();
    const g = given?.split(/\s+/)[0];
    if (g) for (const s of surs) if (s) out.add(normalize(`${g} ${s}`));
    for (const v of variants) if (v.includes(' ')) out.add(normalize(v));
    return out;
  };
  const ex = existing.map((p) => ({
    p,
    keys: keysOf(nameOf(p, 'vorname'), [nameOf(p, 'nachname'), nameOf(p, 'geburtsname')], p.names.filter((n) => n.type === 'variante').map((n) => n.value)),
    birth: sortRange(birthDate(p)),
    place: normalize(eventOf(p, 'geburt')?.place ?? ''),
  }));
  return ged.persons.map((g) => {
    const label = gedLabel(g);
    if (g.anonymized) return { xref: g.xref, label, candidates: [], suggestion: 'skip' };
    const keys = keysOf(g.given, [g.surname, g.birthName], g.variants);
    const gb = sortRange(g.events.find((e) => e.type === 'geburt')?.date);
    const gp = normalize(g.events.find((e) => e.type === 'geburt')?.place ?? '');
    const candidates: Candidate[] = [];
    for (const e of ex) {
      if (![...keys].some((k) => e.keys.has(k))) continue;
      let score = 2;
      const why = ['gleicher Name'];
      if (gb && e.birth) {
        if (gb[1] < e.birth[0] - 20000 || e.birth[1] < gb[0] - 20000) continue; // Geburtsjahre widersprechen sich
        score += 2;
        why.push('Geburtsdatum passt');
      }
      if (gp && e.place && (gp.includes(e.place) || e.place.includes(gp))) {
        score += 1;
        why.push('gleicher Geburtsort');
      }
      if (`@${e.p.id}@` === g.xref) {
        score += 1;
        why.push('gleiche ID');
      }
      if (g.sex !== 'u' && e.p.sex !== 'u' && g.sex !== e.p.sex) continue;
      candidates.push({ id: e.p.id, label: `${displayName(e.p)} (${e.p.id})`, score, why: why.join(', ') });
    }
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    // nur bei eindeutigem, starkem Treffer automatisch zusammenführen vorschlagen
    const strong = best && (best.score >= 4 || best.why.includes('gleiche ID'));
    const suggestion = strong && (candidates.length === 1 || candidates[1].score < best.score) ? best.id : 'neu';
    return { xref: g.xref, label, candidates, suggestion };
  });
}

// ---------- Übernahme ----------

export interface ApplyResult {
  created: string[];
  merged: { xref: string; id: string; added: number; conflicts: number }[];
  skipped: number;
  relations: number;
  sourceId: string;
  log: string[];
}

const PEDI: Record<string, ParentChildType> = { BIRTH: 'leiblich', ADOPTED: 'adoption', FOSTER: 'pflege', OTHER: 'stief' };

export function applyGedcom(doc: TreeDoc, ged: GedData, decisions: Record<string, string>, fileName: string, now = new Date()): ApplyResult {
  const t = now.toISOString();
  const log: string[] = [];
  // Quelle für die importierte Datei
  const fileSrc: Source = {
    id: nextId(doc, 'Q'),
    title: `GEDCOM-Datei ${fileName}`,
    type: 'Sonstiges',
    date: `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`,
    proves: `Importiert aus ${ged.sourceProgram ?? 'unbekanntem Programm'} (GEDCOM ${ged.version}). Angaben ungeprüft übernommen.`,
    createdAt: t,
    updatedAt: t,
  };
  doc.sources.push(fileSrc);
  const fileCite = (): Citation => ({ sourceId: fileSrc.id });
  // Quellen der Datei als eigene Quellen anlegen
  const srcMap = new Map<string, string>();
  for (const s of ged.sources) {
    const id = nextId(doc, 'Q');
    doc.sources.push({ id, title: s.title, type: 'Sonstiges', author: s.author, date: s.publ, proves: [s.note, `aus ${fileSrc.title}`].filter(Boolean).join('\n'), createdAt: t, updatedAt: t });
    srcMap.set(s.xref, id);
  }
  const citesOf = (e: GedEvent): Citation[] => [fileCite(), ...e.sources.filter((s) => srcMap.has(s.xref)).map((s) => ({ sourceId: srcMap.get(s.xref)!, ...(s.page ? { detail: s.page } : {}) }))];

  const idMap = new Map<string, string>();
  const created: string[] = [];
  const merged: ApplyResult['merged'] = [];
  let skipped = 0;
  for (const g of ged.persons) {
    const dec = decisions[g.xref] ?? 'neu';
    if (dec === 'skip') {
      skipped++;
      continue;
    }
    if (dec === 'neu') {
      const unnamed = !g.given && !g.surname;
      const p = blankPerson(nextId(doc, unnamed ? 'U' : 'P'), g.placeholderLabel && unnamed ? 'platzhalter' : unnamed ? 'unbenannt' : 'benannt');
      p.sex = g.sex;
      const nm = (type: Parameters<typeof name>[0], v: string | undefined, st = g.nameStatus) => v && p.names.push({ ...name(type, v, st), citations: [fileCite()] });
      nm('vorname', g.given);
      nm('nachname', g.surname);
      if (g.birthName && g.birthName !== g.surname) nm('geburtsname', g.birthName);
      nm('rufname', g.nick);
      nm('platzhalter', g.placeholderLabel);
      for (const v of g.variants) nm('variante', v);
      for (const e of g.events) p.events.push({ id: uid('e'), type: e.type, label: e.label, date: e.date, place: e.place, note: e.note, status: e.status, citations: citesOf(e), mediaIds: [] });
      if (g.note) p.note = g.note;
      if (g.events.some((e) => e.type === 'tod')) p.living = 'verstorben';
      p.tags = ['GEDCOM-Import'];
      p.citations = [fileCite()];
      doc.persons.push(p);
      idMap.set(g.xref, p.id);
      created.push(p.id);
      continue;
    }
    // Zusammenführen mit vorhandener Person: nur ergänzen, nie überschreiben
    const p = doc.persons.find((x) => x.id === dec && !x.deletedAt);
    if (!p) {
      log.push(`${g.xref}: Zielperson ${dec} nicht gefunden – übersprungen.`);
      skipped++;
      continue;
    }
    idMap.set(g.xref, p.id);
    let added = 0;
    let conflicts = 0;
    const addName = (type: Parameters<typeof name>[0], v: string | undefined) => {
      if (!v) return;
      const have = p.names.filter((n) => n.type === type && n.status !== 'widerlegt');
      if (have.some((n) => normalize(n.value) === normalize(v))) return;
      if (have.length) {
        // abweichend: als Namensvariante festhalten
        if (p.names.some((n) => normalize(n.value) === normalize(v))) return;
        p.names.push({ ...name('variante', v, 'unsicher', `abweichende Angabe (${type}) aus ${fileSrc.title}`), citations: [fileCite()] });
        conflicts++;
      } else p.names.push({ ...name(type, v, g.nameStatus), citations: [fileCite()] });
      added++;
    };
    addName('vorname', g.given);
    addName('nachname', g.surname);
    if (g.birthName && g.birthName !== g.surname) addName('geburtsname', g.birthName);
    addName('rufname', g.nick);
    for (const v of g.variants) if (!p.names.some((n) => normalize(n.value) === normalize(v))) {
      p.names.push({ ...name('variante', v, 'unsicher'), citations: [fileCite()] });
      added++;
    }
    if (p.sex === 'u' && g.sex !== 'u') {
      p.history.push({ at: t, what: 'Geschlecht', oldValue: 'unbekannt', newValue: g.sex, reason: `aus ${fileSrc.title}` });
      p.sex = g.sex;
      added++;
    }
    for (const e of g.events) {
      const same = p.events.filter((x) => x.type === e.type && x.status !== 'widerlegt');
      const eq = same.find((x) => formatGenDate(x.date) === formatGenDate(e.date) && normalize(x.place ?? '') === normalize(e.place ?? '') && (x.label ?? '') === (e.label ?? x.label ?? ''));
      if (eq) {
        if (!eq.citations.some((c) => c.sourceId === fileSrc.id)) eq.citations.push(fileCite());
        continue;
      }
      const single = e.type === 'geburt' || e.type === 'tod' || e.type === 'bestattung' || e.type === 'taufe';
      const differs = single && same.length > 0;
      p.events.push({
        id: uid('e'),
        type: e.type,
        label: e.label,
        date: e.date,
        place: e.place,
        note: [e.note, differs ? `abweichende Angabe aus ${fileSrc.title} – vorhandene Angabe bleibt bestehen` : ''].filter(Boolean).join('\n') || undefined,
        status: differs ? 'unsicher' : e.status,
        citations: citesOf(e),
        mediaIds: [],
      });
      added++;
      if (differs) conflicts++;
    }
    if (g.note) {
      p.note = p.note ? `${p.note}\n\n[${fileSrc.title}]\n${g.note}` : g.note;
      added++;
    }
    p.updatedAt = t;
    merged.push({ xref: g.xref, id: p.id, added, conflicts });
  }

  // Beziehungen
  let relations = 0;
  const idx0 = new Index(doc);
  for (const f of ged.families) {
    const ps = f.parents.map((x) => idMap.get(x)).filter((x): x is string => !!x);
    if (ps.length === 2) {
      const exists = idx0.partners(ps[0]).includes(ps[1]);
      const pa = addPartnership(doc, ps[0], ps[1], f.state, f.status);
      if (!exists) {
        pa.citations.push(fileCite());
        relations++;
      }
      for (const e of f.events) {
        if (pa.events.some((x) => x.type === e.type)) continue;
        pa.events.push({ id: uid('pe'), type: e.type, date: e.date, place: e.place, status: e.status, citations: [fileCite()] });
      }
    }
    for (const k of f.kids) {
      const c = idMap.get(k.xref);
      if (!c) continue;
      for (const par of ps) {
        if (doc.parentChild.some((x) => x.parentId === par && x.childId === c)) continue;
        const pc = addParentChild(doc, par, c, PEDI[k.pedi ?? ''] ?? 'leiblich', k.status);
        pc.citations.push(fileCite());
        relations++;
      }
    }
  }
  for (const g of ged.persons) {
    const from = idMap.get(g.xref);
    if (!from) continue;
    for (const a of g.assoc) {
      const to = idMap.get(a.to);
      if (!to || doc.assertions.some((x) => x.fromId === from && x.toId === to && x.label === a.label)) continue;
      addAssertion(doc, { fromId: from, toId: to, kind: 'angegeben', label: a.label, status: a.status, citations: [fileCite()] });
      relations++;
    }
  }
  if (!created.length && !merged.length) log.push('Es wurde keine Person übernommen.');
  return { created, merged, skipped, relations, sourceId: fileSrc.id, log };
}
