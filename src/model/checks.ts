import { sortRange } from './dates';
import { birthDate, deathDate, displayName, Index, isActive, isDeceased, nameOf } from './queries';
import { normalize } from './search';
import type { Person, TreeDoc } from './types';

/**
 * Konsistenzprüfung: logische Widersprüche (Datum, Alter, Reihenfolge) und Belegstand
 * (Beziehungen ohne Quelle, Personen ohne Quelle, mögliche Dubletten).
 * Unsichere/ungefähre Daten werden mit ihrem Spielraum geprüft – gemeldet wird nur,
 * was auch im günstigsten Fall widersprüchlich ist.
 */

export type Severity = 'fehler' | 'warnung' | 'hinweis';

export interface Finding {
  rule: string;
  severity: Severity;
  personIds: string[];
  text: string;
}

export const RULE_LABEL: Record<string, string> = {
  tod_vor_geburt: 'Tod vor Geburt',
  zu_alt: 'Lebende Person sehr alt',
  kind_aelter: 'Kind älter als Elternteil',
  elternalter: 'Unplausibles Alter der Eltern bei Geburt',
  nach_tod_geboren: 'Geburt nach Tod eines Elternteils',
  ereignis_ausserhalb: 'Ereignis außerhalb der Lebenszeit',
  beziehung_ohne_beleg: 'Beziehung ohne Quelle',
  person_ohne_quelle: 'Person ohne Quelle',
  dublette: 'Mögliche Dublette',
};

type Range = [number, number] | undefined;
const year = (n: number) => Math.floor(n / 10000);
/** Jahre zwischen frühestem/spätestem möglichen Zeitpunkt */
function yearsMin(a: Range, b: Range) {
  return a && b ? year(b[0]) - year(a[1]) : undefined; // b frühestens minus a spätestens
}
function yearsMax(a: Range, b: Range) {
  return a && b ? year(b[1]) - year(a[0]) : undefined;
}

export function runChecks(doc: TreeDoc, now = new Date()): Finding[] {
  const idx = new Index(doc);
  const out: Finding[] = [];
  const nowN = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  const nm = (id: string) => (idx.person(id) ? displayName(idx.person(id)!) : id);
  const persons = [...idx.byId.values()];

  for (const p of persons) {
    const b = sortRange(birthDate(p));
    const d = sortRange(deathDate(p));
    if (b && d && d[1] < b[0]) out.push({ rule: 'tod_vor_geburt', severity: 'fehler', personIds: [p.id], text: `${nm(p.id)}: Sterbedatum liegt vor dem Geburtsdatum.` });
    if (b && !isDeceased(p) && p.kind === 'benannt') {
      const age = year(nowN) - year(b[1]);
      if (age > 110) out.push({ rule: 'zu_alt', severity: age > 125 ? 'fehler' : 'warnung', personIds: [p.id], text: `${nm(p.id)}: wäre heute mindestens ${age} Jahre alt, ist aber nicht als verstorben erfasst.` });
    }
    // Ereignisse vor Geburt oder nach Tod (außer Bestattung kurz danach)
    for (const e of p.events) {
      if (!isActive(e.status) || e.type === 'geburt' || e.type === 'tod' || e.type === 'herkunft') continue;
      const r = sortRange(e.date);
      if (!r) continue;
      if (b && r[1] < b[0]) out.push({ rule: 'ereignis_ausserhalb', severity: 'warnung', personIds: [p.id], text: `${nm(p.id)}: Angabe „${e.label ?? e.type}“ liegt vor der Geburt.` });
      if (d && e.type !== 'bestattung' && r[0] > d[1] + 10000) out.push({ rule: 'ereignis_ausserhalb', severity: 'warnung', personIds: [p.id], text: `${nm(p.id)}: Angabe „${e.label ?? e.type}“ liegt nach dem Tod.` });
    }
  }

  // Eltern-Kind-Plausibilität
  for (const pc of doc.parentChild) {
    if (!isActive(pc.status)) continue;
    const par = idx.person(pc.parentId);
    const ch = idx.person(pc.childId);
    if (!par || !ch || par.kind === 'platzhalter') continue;
    const pb = sortRange(birthDate(par));
    const cb = sortRange(birthDate(ch));
    const pd = sortRange(deathDate(par));
    if (pb && cb && cb[1] <= pb[0]) {
      out.push({ rule: 'kind_aelter', severity: 'fehler', personIds: [ch.id, par.id], text: `${nm(ch.id)} ist nicht jünger als Elternteil ${nm(par.id)}.` });
      continue;
    }
    if (pb && cb && pc.type === 'leiblich') {
      const minAge = yearsMax(pb, cb)!; // größtmögliches Alter
      const maxAge = yearsMin(pb, cb)!; // kleinstmögliches Alter
      if (minAge < 13) out.push({ rule: 'elternalter', severity: 'warnung', personIds: [ch.id, par.id], text: `${nm(par.id)} wäre bei der Geburt von ${nm(ch.id)} höchstens ${minAge} Jahre alt gewesen.` });
      const limit = par.sex === 'w' ? 52 : 75;
      if (maxAge > limit) out.push({ rule: 'elternalter', severity: 'warnung', personIds: [ch.id, par.id], text: `${nm(par.id)} wäre bei der Geburt von ${nm(ch.id)} mindestens ${maxAge} Jahre alt gewesen.` });
    }
    if (pd && cb && pc.type === 'leiblich') {
      const grace = par.sex === 'w' ? 0 : 10000; // Vater: bis ca. 1 Jahr nach dem Tod möglich
      if (cb[0] > pd[1] + grace) out.push({ rule: 'nach_tod_geboren', severity: 'fehler', personIds: [ch.id, par.id], text: `${nm(ch.id)} wurde nach dem Tod von ${nm(par.id)} geboren.` });
    }
  }

  // Partnerschaftsereignisse
  for (const pa of doc.partnerships) {
    if (!isActive(pa.status)) continue;
    for (const ev of pa.events) {
      const r = sortRange(ev.date);
      if (!r || ev.didNotHappen) continue;
      for (const pid of [pa.p1, pa.p2]) {
        const p = idx.person(pid);
        if (!p) continue;
        const b = sortRange(birthDate(p));
        const d = sortRange(deathDate(p));
        if (b && r[1] < b[0]) out.push({ rule: 'ereignis_ausserhalb', severity: 'fehler', personIds: [pid], text: `${nm(pid)}: ${ev.type} liegt vor der Geburt.` });
        if (d && r[0] > d[1]) out.push({ rule: 'ereignis_ausserhalb', severity: 'fehler', personIds: [pid], text: `${nm(pid)}: ${ev.type} liegt nach dem Tod.` });
      }
    }
  }

  // Belegstand: Beziehungen ohne Quelle
  for (const pc of doc.parentChild) {
    if (!isActive(pc.status) || pc.citations.length || !idx.person(pc.parentId) || !idx.person(pc.childId)) continue;
    if (idx.person(pc.parentId)!.kind === 'platzhalter') continue; // Platzhalter sind bewusst abgeleitet
    out.push({ rule: 'beziehung_ohne_beleg', severity: 'hinweis', personIds: [pc.childId, pc.parentId], text: `Eltern-Kind ${nm(pc.parentId)} → ${nm(pc.childId)} hat keine Quelle.` });
  }
  for (const pa of doc.partnerships) {
    if (!isActive(pa.status) || pa.citations.length || !idx.person(pa.p1) || !idx.person(pa.p2)) continue;
    out.push({ rule: 'beziehung_ohne_beleg', severity: 'hinweis', personIds: [pa.p1, pa.p2], text: `Partnerschaft ${nm(pa.p1)} – ${nm(pa.p2)} hat keine Quelle.` });
  }
  for (const a of doc.assertions) {
    if (!isActive(a.status) || a.citations.length || !idx.person(a.fromId) || !idx.person(a.toId)) continue;
    out.push({ rule: 'beziehung_ohne_beleg', severity: 'hinweis', personIds: [a.fromId, a.toId], text: `„${a.label}“ ${nm(a.fromId)} → ${nm(a.toId)} hat keine Quelle.` });
  }
  // Personen ohne jede Quelle
  for (const p of persons) {
    if (p.kind === 'platzhalter') continue;
    const any = p.citations.length || p.names.some((n) => n.citations.length) || p.events.some((e) => e.citations.length);
    if (!any) out.push({ rule: 'person_ohne_quelle', severity: 'hinweis', personIds: [p.id], text: `${nm(p.id)} hat keine einzige Quelle.` });
  }

  out.push(...duplicateCandidates(doc, idx));
  const order: Record<Severity, number> = { fehler: 0, warnung: 1, hinweis: 2 };
  return out.sort((x, y) => order[x.severity] - order[y.severity]);
}

/** Mögliche Dubletten: gleicher Name (inkl. Varianten) mit verträglichen Lebensdaten, oder namenlose Personen in gleicher Stellung */
export function duplicateCandidates(doc: TreeDoc, idx = new Index(doc)): Finding[] {
  const out: Finding[] = [];
  const decided = new Set(doc.duplicates.filter((d) => d.verdict !== 'moeglich').map((d) => [d.a, d.b].sort().join('|')));
  const flagged = new Set(doc.duplicates.filter((d) => d.verdict === 'moeglich').map((d) => [d.a, d.b].sort().join('|')));
  const persons = [...idx.byId.values()].filter((p) => p.kind !== 'platzhalter');
  const keys = (p: Person) => {
    const given = nameOf(p, 'vorname');
    const surs = [nameOf(p, 'nachname'), nameOf(p, 'geburtsname')].filter(Boolean) as string[];
    const out = new Set<string>();
    if (given) for (const s of surs) out.add(normalize(`${given.split(/\s+/)[0]} ${s}`));
    for (const n of p.names) if (n.type === 'variante' && isActive(n.status) && n.value.includes(' ')) out.add(normalize(n.value));
    return out;
  };
  const compatible = (a: Person, b: Person) => {
    const ab = sortRange(birthDate(a));
    const bb = sortRange(birthDate(b));
    if (!ab || !bb) return true;
    return !(ab[1] < bb[0] - 20000 || bb[1] < ab[0] - 20000); // ±2 Jahre Spielraum
  };
  const seen = new Set<string>();
  const push = (a: Person, b: Person, why: string) => {
    const key = [a.id, b.id].sort().join('|');
    if (decided.has(key) || seen.has(key)) return;
    seen.add(key);
    out.push({ rule: 'dublette', severity: flagged.has(key) ? 'warnung' : 'hinweis', personIds: [a.id, b.id], text: `${displayName(a)} (${a.id}) und ${displayName(b)} (${b.id}): ${why}` });
  };
  const k = persons.map((p) => ({ p, keys: keys(p) }));
  for (let i = 0; i < k.length; i++)
    for (let j = i + 1; j < k.length; j++) {
      const shared = [...k[i].keys].some((x) => k[j].keys.has(x));
      if (shared && compatible(k[i].p, k[j].p)) push(k[i].p, k[j].p, 'gleicher Name, Lebensdaten widersprechen sich nicht');
    }
  // namenlose Personen mit denselben Eltern und gleichem Geschlecht ohne unterscheidende Angaben
  const unnamed = persons.filter((p) => p.kind === 'unbenannt');
  for (let i = 0; i < unnamed.length; i++)
    for (let j = i + 1; j < unnamed.length; j++) {
      const a = unnamed[i];
      const b = unnamed[j];
      const pa = idx.parents(a.id).sort().join();
      if (!pa || pa !== idx.parents(b.id).sort().join() || a.sex !== b.sex) continue;
      push(a, b, 'beide unbenannt, gleiche Eltern und gleiches Geschlecht – könnten dieselbe Person sein');
    }
  // ausdrücklich als mögliche Dublette markierte Paare immer zeigen
  for (const d of doc.duplicates.filter((x) => x.verdict === 'moeglich')) {
    const a = idx.person(d.a);
    const b = idx.person(d.b);
    if (a && b) push(a, b, d.note ?? 'als mögliche Dublette markiert');
  }
  return out;
}
