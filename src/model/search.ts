import type { Person, TreeDoc } from './types';
import { displayName } from './queries';

/**
 * Normalform für die Suche: Kleinschreibung, Diakritika entfernt (ł→l, ń→n, ą→a, ö→o),
 * ß→ss und Umschreibungen ae/oe/ue → a/o/u. So findet "Kowalski" auch "Kowalská",
 * "Mueller" auch "Müller", "Lodz" auch "Łódź".
 * Gespeichert wird immer die Originalschreibweise (Unicode NFC).
 */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[łŁ]/g, 'l')
    .replace(/[đĐ]/g, 'd')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Deutsche Sortierung mit korrekten Sonderzeichen */
export const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });

export interface SearchHit {
  kind: 'person' | 'source' | 'research' | 'note' | 'question';
  id: string;
  title: string;
  subtitle?: string;
  /** Treffer über eine Variante / frühere Schreibweise */
  via?: string;
}

function personTerms(p: Person): { text: string; via?: string }[] {
  const terms: { text: string; via?: string }[] = [{ text: p.id }];
  for (const n of p.names) {
    const via = n.status === 'widerlegt' ? `frühere Angabe „${n.value}“` : n.type === 'variante' || n.type === 'rufname' ? n.value : undefined;
    terms.push({ text: n.value, via });
  }
  for (const h of p.history) if (h.what.startsWith('Name')) terms.push({ text: h.oldValue, via: `frühere Angabe „${h.oldValue}“` });
  for (const t of p.tags) terms.push({ text: t });
  return terms;
}

/** Alle Suchwörter müssen vorkommen (in Namen, Varianten, IDs, Zweig). */
export function search(doc: TreeDoc, query: string, limit = 50): SearchHit[] {
  const q = normalize(query);
  if (!q) return [];
  const words = q.split(' ');
  const hits: SearchHit[] = [];

  for (const p of doc.persons) {
    if (p.deletedAt) continue;
    const terms = personTerms(p);
    const all = normalize(terms.map((t) => t.text).join(' '));
    if (words.every((w) => all.includes(w))) {
      const viaTerm = terms.find((t) => t.via && words.some((w) => normalize(t.text).includes(w)));
      hits.push({ kind: 'person', id: p.id, title: displayName(p), subtitle: p.id, via: viaTerm?.via });
    }
  }
  const textHit = (s: string) => {
    const n = normalize(s);
    return words.every((w) => n.includes(w));
  };
  for (const s of doc.sources) if (textHit(`${s.id} ${s.title} ${s.author ?? ''}`)) hits.push({ kind: 'source', id: s.id, title: s.title, subtitle: s.id });
  for (const r of doc.research) if (textHit(`${r.id} ${r.name} ${r.place ?? ''}`)) hits.push({ kind: 'research', id: r.id, title: r.name, subtitle: r.id });
  for (const n of doc.notes) if (textHit(`${n.id} ${n.topic ?? ''} ${n.area ?? ''}`)) hits.push({ kind: 'note', id: n.id, title: n.topic ?? n.id, subtitle: n.id });
  for (const o of doc.questions) if (textHit(`${o.id} ${o.text}`)) hits.push({ kind: 'question', id: o.id, title: o.text.slice(0, 80), subtitle: o.id });

  // exakte ID zuerst, dann Personen alphabetisch
  const exact = normalize(query) ;
  hits.sort((a, b) => {
    const ea = normalize(a.id) === exact ? 0 : 1;
    const eb = normalize(b.id) === exact ? 0 : 1;
    if (ea !== eb) return ea - eb;
    if (a.kind !== b.kind) return a.kind === 'person' ? -1 : b.kind === 'person' ? 1 : 0;
    return collator.compare(a.title, b.title);
  });
  return hits.slice(0, limit);
}
