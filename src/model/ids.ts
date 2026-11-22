import type { TreeDoc } from './types';

/** Fachliche IDs (P001, U001, Q01, F01, H01, M001, O01) bleiben stabil; neue IDs zählen hoch, Lücken werden nie neu vergeben. */
export type IdPrefix = 'P' | 'U' | 'Q' | 'F' | 'H' | 'M' | 'O' | 'L';

const WIDTH: Record<IdPrefix, number> = { P: 3, U: 3, Q: 2, F: 2, H: 2, M: 3, O: 2, L: 3 };

function existing(doc: TreeDoc, prefix: IdPrefix): string[] {
  switch (prefix) {
    case 'P':
    case 'U':
      return doc.persons.map((p) => p.id);
    case 'Q':
      return doc.sources.map((s) => s.id);
    case 'F':
      return doc.research.map((r) => r.id);
    case 'H':
      return doc.notes.map((n) => n.id);
    case 'M':
      return doc.media.map((m) => m.id);
    case 'O':
      return doc.questions.map((q) => q.id);
    case 'L':
      return (doc.places ?? []).map((p) => p.id);
  }
}

export function nextId(doc: TreeDoc, prefix: IdPrefix, reserved: string[] = []): string {
  let max = 0;
  let width = WIDTH[prefix];
  for (const id of [...existing(doc, prefix), ...reserved]) {
    const m = id.match(new RegExp(`^${prefix}(\\d+)$`));
    if (m) {
      max = Math.max(max, +m[1]);
      width = Math.max(width, m[1].length); // vorhandene Schreibweise übernehmen (O001 statt O43)
    }
  }
  return prefix + String(max + 1).padStart(width, '0');
}

/** Interne IDs für Beziehungen, Namen, Ereignisse */
export function uid(prefix = 'x'): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${rnd}`;
}
