import { parseGenDate } from '../model/dates';
import { uid } from '../model/ids';
import { name } from '../model/ops';
import type { Citation, EventType, FamilyNote, Media, NameType, OpenQuestion, PartnershipEventType, Research, Source, Status, TreeDoc } from '../model/types';

/**
 * Ergänzungsdatei (JSON, liegt NICHT im Repository): Korrekturen und neue Belege aus späteren
 * Recherche-Ständen. Jeder Eintrag ist ein Konflikt/Vorschlag, den du im Import-Bericht
 * einzeln übernimmst oder ablehnst. Nichts wird automatisch angewendet.
 */

export type SupplementOp =
  | { op: 'addSource'; source: Omit<Source, 'createdAt' | 'updatedAt'> }
  | { op: 'patchSource'; id: string; set?: Partial<Source>; appendProves?: string; newUrl?: string }
  | { op: 'setEventStatus'; personId: string; eventType: EventType; status: Status; addCitation?: Citation }
  | {
      op: 'addEvent';
      personId: string;
      event: { type: EventType; label?: string; date?: string; place?: string; address?: string; status: Status; announced?: boolean; note?: string; citations?: Citation[] };
    }
  | { op: 'patchEvent'; personId: string; eventType: EventType; address?: string; previousAddressNote?: boolean; appendNote?: string; addCitation?: Citation }
  | { op: 'addRetractedName'; personId: string; nameType: NameType; value: string; reason: string }
  | { op: 'replaceNote'; id: string; set: Partial<FamilyNote>; reason: string }
  | { op: 'addResearch'; research: Research }
  | { op: 'patchResearch'; id: string; appendFinding?: string; appendDelimitation?: string }
  | { op: 'addMedia'; media: Omit<Media, 'createdAt'> }
  | { op: 'addQuestion'; question: OpenQuestion }
  | { op: 'appendPersonNote'; personId: string; text: string }
  | {
      op: 'addPartnershipEvent';
      a: string;
      b: string;
      event: { type: PartnershipEventType; date?: string; form?: string; place?: string; status: Status; note?: string; citations?: Citation[] };
    };

export interface SupplementItem {
  id: string;
  title: string;
  personIds?: string[];
  excel: string;
  supplement: string;
  recommendation: 'uebernehmen' | 'behalten';
  ops: SupplementOp[];
}

export interface Supplement {
  title: string;
  date: string;
  items: SupplementItem[];
}

export function parseSupplement(json: string): Supplement {
  const s = JSON.parse(json) as Supplement;
  if (!s || !Array.isArray(s.items)) throw new Error('Keine gültige Ergänzungsdatei (Feld „items“ fehlt).');
  return s;
}

/** Wendet die gewählten Einträge an. Liefert ein Protokoll; Fehler brechen nicht ab, sondern werden gemeldet. */
export function applySupplement(doc: TreeDoc, items: SupplementItem[]): string[] {
  const log: string[] = [];
  const now = new Date().toISOString();
  for (const item of items) {
    for (const o of item.ops) {
      try {
        log.push(`${item.id}: ${applyOp(doc, o, now)}`);
      } catch (e) {
        log.push(`${item.id}: FEHLER – ${(e as Error).message}`);
      }
    }
  }
  return log;
}

function person(doc: TreeDoc, id: string) {
  const p = doc.persons.find((x) => x.id === id);
  if (!p) throw new Error(`Person ${id} nicht gefunden`);
  return p;
}

function applyOp(doc: TreeDoc, o: SupplementOp, now: string): string {
  switch (o.op) {
    case 'addSource': {
      if (doc.sources.some((s) => s.id === o.source.id)) return `Quelle ${o.source.id} existiert bereits – übersprungen`;
      doc.sources.push({ ...o.source, createdAt: now, updatedAt: now });
      return `Quelle ${o.source.id} angelegt`;
    }
    case 'patchSource': {
      const s = doc.sources.find((x) => x.id === o.id);
      if (!s) throw new Error(`Quelle ${o.id} nicht gefunden`);
      if (o.set) Object.assign(s, o.set);
      if (o.appendProves) s.proves = [s.proves, o.appendProves].filter(Boolean).join(' ');
      if (o.newUrl && o.newUrl !== s.url) {
        if (s.url) s.previousUrls = [...(s.previousUrls ?? []), s.url];
        s.url = o.newUrl;
      }
      s.updatedAt = now;
      return `Quelle ${o.id} ergänzt`;
    }
    case 'setEventStatus': {
      const p = person(doc, o.personId);
      const e = p.events.find((x) => x.type === o.eventType && x.status !== 'widerlegt');
      if (!e) throw new Error(`${o.personId}: Ereignis ${o.eventType} nicht gefunden`);
      if (e.status !== o.status) p.history.push({ at: now, what: `${o.eventType}.Status`, oldValue: e.status, newValue: o.status, reason: 'Ergänzung' });
      e.status = o.status;
      if (o.addCitation && !e.citations.some((c) => c.sourceId === o.addCitation!.sourceId)) e.citations.push(o.addCitation);
      p.updatedAt = now;
      return `${o.personId} ${o.eventType}: Status ${o.status}`;
    }
    case 'addEvent': {
      const p = person(doc, o.personId);
      p.events.push({
        id: uid('e'),
        type: o.event.type,
        label: o.event.label,
        date: parseGenDate(o.event.date),
        place: o.event.place,
        address: o.event.address,
        status: o.event.status,
        announced: o.event.announced,
        note: o.event.note,
        citations: o.event.citations ?? [],
        mediaIds: [],
      });
      p.updatedAt = now;
      return `${o.personId}: Ereignis ${o.event.type} ergänzt`;
    }
    case 'patchEvent': {
      const p = person(doc, o.personId);
      const e = p.events.find((x) => x.type === o.eventType && x.status !== 'widerlegt');
      if (!e) throw new Error(`${o.personId}: Ereignis ${o.eventType} nicht gefunden`);
      if (o.address !== undefined && o.address !== e.address) {
        if (e.address) {
          p.history.push({ at: now, what: `${o.eventType}.Adresse`, oldValue: e.address, newValue: o.address, reason: 'neuere Schreibweise' });
          if (o.previousAddressNote) e.note = [e.note, `frühere Schreibweise: ${e.address}`].filter(Boolean).join('; ');
        }
        e.address = o.address;
      }
      if (o.appendNote) e.note = [e.note, o.appendNote].filter(Boolean).join('; ');
      if (o.addCitation && !e.citations.some((c) => c.sourceId === o.addCitation!.sourceId)) e.citations.push(o.addCitation);
      p.updatedAt = now;
      return `${o.personId} ${o.eventType}: ergänzt`;
    }
    case 'addRetractedName': {
      const p = person(doc, o.personId);
      if (p.names.some((n) => n.value === o.value && n.status === 'widerlegt')) return `${o.personId}: zurückgenommener Name bereits vorhanden`;
      p.names.push(name(o.nameType, o.value, 'widerlegt', o.reason));
      p.history.push({ at: now, what: `Name (${o.nameType})`, oldValue: o.value, newValue: '', reason: o.reason });
      p.updatedAt = now;
      return `${o.personId}: „${o.value}“ als zurückgenommen vermerkt`;
    }
    case 'replaceNote': {
      const n = doc.notes.find((x) => x.id === o.id);
      if (!n) throw new Error(`Notiz ${o.id} nicht gefunden`);
      n.history = [...(n.history ?? []), { at: now, what: 'Notiz', oldValue: JSON.stringify({ topic: n.topic, text: n.text, open: n.open }), newValue: JSON.stringify(o.set), reason: o.reason }];
      Object.assign(n, o.set);
      return `Notiz ${o.id} ersetzt (alter Text in Historie)`;
    }
    case 'addResearch': {
      if (doc.research.some((r) => r.id === o.research.id)) return `Recherche ${o.research.id} existiert bereits – übersprungen`;
      doc.research.push(o.research);
      return `Recherche ${o.research.id} angelegt`;
    }
    case 'patchResearch': {
      const r = doc.research.find((x) => x.id === o.id);
      if (!r) throw new Error(`Recherche ${o.id} nicht gefunden`);
      if (o.appendFinding) r.finding = [r.finding, o.appendFinding].filter(Boolean).join(' ');
      if (o.appendDelimitation) r.delimitation = [r.delimitation, o.appendDelimitation].filter(Boolean).join(' ');
      return `Recherche ${o.id} ergänzt`;
    }
    case 'addMedia': {
      if (doc.media.some((m) => m.id === o.media.id)) return `Medium ${o.media.id} existiert bereits – übersprungen`;
      doc.media.push({ ...o.media, createdAt: now });
      return `Medium ${o.media.id} angelegt`;
    }
    case 'addQuestion': {
      if (doc.questions.some((q) => q.id === o.question.id)) return `Offene Frage ${o.question.id} existiert bereits – übersprungen`;
      doc.questions.push(o.question);
      return `Offene Frage ${o.question.id} angelegt`;
    }
    case 'addPartnershipEvent': {
      const pa = doc.partnerships.find((x) => (x.p1 === o.a && x.p2 === o.b) || (x.p1 === o.b && x.p2 === o.a));
      if (!pa) throw new Error(`Partnerschaft ${o.a}–${o.b} nicht gefunden`);
      pa.events.push({ id: uid('pe'), type: o.event.type, date: parseGenDate(o.event.date), form: o.event.form, place: o.event.place, status: o.event.status, note: o.event.note, citations: o.event.citations ?? [] });
      return `Partnerschaft ${o.a}–${o.b}: ${o.event.type} ergänzt`;
    }
    case 'appendPersonNote': {
      const p = person(doc, o.personId);
      p.note = [p.note, o.text].filter(Boolean).join('\n\n');
      p.updatedAt = now;
      return `${o.personId}: Notiz ergänzt`;
    }
  }
}
