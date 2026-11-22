import { addAssertion, addParentChild, addPartnership, addPerson, createPlaceholderParents } from './ops';
import { Index, nameOf } from './queries';
import type { ParentChildType, PartnershipState, Person, Sex, TreeDoc } from './types';

/**
 * „Neue Person mit Beziehung zu X anlegen“ – die App ordnet die Person selbst ein:
 *  Vater/Mutter → Elternteil von X (optional als Paar mit dem vorhandenen Elternteil)
 *  Bruder/Schwester → dieselben Eltern wie X; ohne Eltern wahlweise Platzhalter-Eltern
 *  Sohn/Tochter → Kind von X (und optional des Partners)
 *  Partner/in → Partnerschaft mit X
 */

export type Relation = 'vater' | 'mutter' | 'bruder' | 'schwester' | 'sohn' | 'tochter' | 'partner';

export const RELATION_LABEL: Record<Relation, string> = {
  vater: 'Vater',
  mutter: 'Mutter',
  bruder: 'Bruder',
  schwester: 'Schwester',
  sohn: 'Sohn',
  tochter: 'Tochter',
  partner: 'Partner/in',
};

export function relationSex(rel: Relation, anchor?: Person): Sex {
  if (rel === 'vater' || rel === 'bruder' || rel === 'sohn') return 'm';
  if (rel === 'mutter' || rel === 'schwester' || rel === 'tochter') return 'w';
  return anchor?.sex === 'm' ? 'w' : anchor?.sex === 'w' ? 'm' : 'u';
}

/** Vorbelegter Nachname – als Vorschlag, der im Dialog geändert oder geleert werden kann */
export function suggestedSurname(rel: Relation, anchor: Person, idx: Index): string | undefined {
  const own = nameOf(anchor, 'geburtsname') ?? nameOf(anchor, 'nachname');
  switch (rel) {
    case 'vater':
    case 'bruder':
    case 'schwester':
      return own;
    case 'mutter':
      return own; // Ehename; Geburtsname bleibt leer
    case 'sohn':
    case 'tochter': {
      if (anchor.sex === 'm') return nameOf(anchor, 'nachname');
      const partner = idx.partners(anchor.id).map((p) => idx.person(p)!).find((p) => p.sex === 'm');
      return (partner && nameOf(partner, 'nachname')) ?? nameOf(anchor, 'nachname');
    }
    default:
      return undefined;
  }
}

export interface AddRelativeInput {
  given?: string;
  surname?: string;
  birthName?: string;
  sex: Sex;
  birth?: string;
  tags?: string[];
}

export interface AddRelativeOptions {
  /** Kind: weiterer Elternteil (Partner von X) */
  otherParentId?: string;
  /** Geschwister: welche Eltern von X geteilt werden (Standard: alle) */
  sharedParentIds?: string[];
  /** Geschwister ohne Eltern: Platzhalter-Eltern anlegen (sonst nur gestrichelte Geschwister-Aussage) */
  createPlaceholder?: boolean;
  /** Elternteil: mit dem vorhandenen anderen Elternteil als Paar erfassen */
  pairWithExisting?: boolean;
  pcType?: ParentChildType;
  partnershipState?: PartnershipState;
}

export interface AddRelativeResult {
  person: Person;
  /** Personen, deren Zweig aufgeklappt werden sollte, damit die neue Person sichtbar ist */
  expandUp: string[];
  expandDown: string[];
  log: string[];
}

export function addRelative(doc: TreeDoc, anchorId: string, rel: Relation, input: AddRelativeInput, opt: AddRelativeOptions = {}): AddRelativeResult {
  const idx = new Index(doc);
  const anchor = idx.person(anchorId);
  if (!anchor) throw new Error(`Person ${anchorId} nicht gefunden`);
  const p = addPerson(doc, { given: input.given, surname: input.surname, birthName: input.birthName, sex: input.sex, birth: input.birth, tags: input.tags ?? [...anchor.tags] });
  const type = opt.pcType ?? 'leiblich';
  const log: string[] = [];
  const res: AddRelativeResult = { person: p, expandUp: [], expandDown: [], log };

  switch (rel) {
    case 'vater':
    case 'mutter': {
      const existing = idx.parents(anchorId);
      addParentChild(doc, p.id, anchorId, type);
      log.push(`${p.id} ist Elternteil von ${anchorId}`);
      const other = existing.find((x) => idx.person(x)?.kind !== 'platzhalter');
      if (other && opt.pairWithExisting !== false) {
        addPartnership(doc, p.id, other, 'unbekannt', 'abgeleitet');
        log.push(`Paar ${p.id}–${other} vorgeschlagen (abgeleitet)`);
      }
      res.expandUp.push(anchorId);
      break;
    }
    case 'bruder':
    case 'schwester': {
      const parents = idx.parents(anchorId);
      const shared = opt.sharedParentIds ?? parents;
      if (shared.length) {
        for (const par of shared) addParentChild(doc, par, p.id, type);
        log.push(`${p.id} teilt die Eltern ${shared.join(', ')} mit ${anchorId}`);
        res.expandDown.push(...shared);
      } else if (opt.createPlaceholder !== false) {
        const ph = createPlaceholderParents(doc, [anchorId, p.id]);
        log.push(`Platzhalter-Eltern ${ph.id} für ${anchorId} und ${p.id} angelegt`);
        res.expandUp.push(anchorId);
        res.expandDown.push(ph.id);
      } else {
        addAssertion(doc, { fromId: p.id, toId: anchorId, kind: 'geschwister', label: 'Geschwister von', status: 'familienangabe' });
        log.push(`${p.id} als Geschwister von ${anchorId} vermerkt (ohne Eltern)`);
      }
      break;
    }
    case 'sohn':
    case 'tochter': {
      addParentChild(doc, anchorId, p.id, type);
      if (opt.otherParentId) addParentChild(doc, opt.otherParentId, p.id, type);
      log.push(`${p.id} ist Kind von ${[anchorId, opt.otherParentId].filter(Boolean).join(' und ')}`);
      res.expandDown.push(anchorId);
      break;
    }
    case 'partner': {
      addPartnership(doc, anchorId, p.id, opt.partnershipState ?? 'unbekannt');
      log.push(`Partnerschaft ${anchorId}–${p.id}`);
      break;
    }
  }
  return res;
}
