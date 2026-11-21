/**
 * Datenformat `stammbaum.json` – siehe docs/DATENFORMAT.md.
 * Jede Angabe (Name, Ereignis, Beziehung) trägt einen Belegstatus, Quellenzitate und eine Historie.
 */

export const SCHEMA_VERSION = 1;

export type Status = 'belegt' | 'familienangabe' | 'abgeleitet' | 'unsicher' | 'widerlegt';

export const STATUS_LABEL: Record<Status, string> = {
  belegt: 'dokumentarisch belegt',
  familienangabe: 'Familienangabe',
  abgeleitet: 'abgeleitet',
  unsicher: 'unsicher/vorläufig',
  widerlegt: 'widerlegt/zurückgenommen',
};

export interface Citation {
  sourceId: string;
  /** Fundstelle, z. B. Eintragsnummer, Grabstelle, PDF-Seite */
  detail?: string;
}

export interface HistoryEntry {
  at: string; // ISO-Zeitpunkt
  what: string; // z. B. "Vorname", "Geburt.Datum"
  oldValue: string;
  newValue: string;
  reason?: string;
}

export type DateQualifier = 'exakt' | 'etwa' | 'vor' | 'nach' | 'zwischen' | 'unbekannt';

export interface GenDate {
  /** Originaleingabe, unverändert */
  raw: string;
  qualifier: DateQualifier;
  y?: number;
  m?: number;
  d?: number;
  /** Jahresspanne, z. B. 197x → 1970–1979, "zwischen 1920 und 1925" */
  yFrom?: number;
  yTo?: number;
  /** zweites Datum bei "zwischen" */
  y2?: number;
  m2?: number;
  d2?: number;
  /** Fragezeichen, "vermutlich" */
  uncertain: boolean;
  /** Text nach Semikolon u. ä., der nicht zum Datum gehört */
  remark?: string;
}

export type NameType = 'vorname' | 'nachname' | 'geburtsname' | 'rufname' | 'variante' | 'platzhalter';

export const NAME_TYPE_LABEL: Record<NameType, string> = {
  vorname: 'Vorname(n)',
  nachname: 'Nachname',
  geburtsname: 'Geburtsname',
  rufname: 'Rufname',
  variante: 'Namensvariante / Suchform',
  platzhalter: 'Platzhalter-Bezeichnung',
};

export interface NameEntry {
  id: string;
  type: NameType;
  value: string;
  status: Status;
  citations: Citation[];
  note?: string;
}

export type EventType =
  | 'geburt'
  | 'tod'
  | 'bestattung'
  | 'wohnort'
  | 'herkunft'
  | 'taufe'
  | 'konfession'
  | 'beruf'
  | 'ausbildung'
  | 'auszeichnung'
  | 'sonstiges';

export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  geburt: 'Geburt',
  tod: 'Tod',
  bestattung: 'Bestattung',
  wohnort: 'Wohnort / Adresse',
  herkunft: 'Herkunft',
  taufe: 'Taufe',
  konfession: 'Konfession',
  beruf: 'Beruf',
  ausbildung: 'Ausbildung',
  auszeichnung: 'Auszeichnung',
  sonstiges: 'Sonstiges',
};

export interface PersonEvent {
  id: string;
  type: EventType;
  label?: string;
  date?: GenDate;
  dateTo?: GenDate;
  place?: string;
  /** eigener Status für den Ort, wenn er unsicherer ist als das Datum (z. B. „vermutlich Burgdorf“) */
  placeStatus?: Status;
  address?: string;
  status: Status;
  citations: Citation[];
  mediaIds: string[];
  note?: string;
  /** nur angekündigt (z. B. Beerdigung laut Traueranzeige), nicht als vollzogen belegt */
  announced?: boolean;
  current?: boolean;
}

export type Sex = 'm' | 'w' | 'd' | 'u';
export type Living = 'lebt' | 'verstorben' | 'unbekannt';
export type PersonKind = 'benannt' | 'unbenannt' | 'platzhalter';

export interface Person {
  id: string;
  kind: PersonKind;
  sex: Sex;
  living: Living;
  names: NameEntry[];
  events: PersonEvent[];
  tags: string[];
  links: string[];
  citations: Citation[];
  note?: string;
  obituary?: string;
  photoMediaId?: string;
  /** Werte aus der Excel-Datei, nur zur Anzeige/Kontrolle */
  legacy?: { generation?: string; standDerAngabe?: string; beziehungsText?: string };
  /** zurückgenommene und überschriebene Angaben – sichtbar, nie exportiert */
  history: HistoryEntry[];
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export type ParentChildType = 'leiblich' | 'adoption' | 'pflege' | 'stief' | 'unbekannt';
export const PC_TYPE_LABEL: Record<ParentChildType, string> = {
  leiblich: 'leiblich',
  adoption: 'Adoption',
  pflege: 'Pflegekind',
  stief: 'Stiefkind',
  unbekannt: 'Art unbekannt',
};

export interface ParentChild {
  id: string;
  parentId: string;
  childId: string;
  type: ParentChildType;
  status: Status;
  citations: Citation[];
  note?: string;
}

export type PartnershipState = 'verheiratet' | 'paar' | 'getrennt' | 'geschieden' | 'unbekannt';
export const PARTNERSHIP_LABEL: Record<PartnershipState, string> = {
  verheiratet: 'verheiratet',
  paar: 'Paar',
  getrennt: 'getrennt',
  geschieden: 'geschieden',
  unbekannt: 'Art unbekannt',
};

export type PartnershipEventType = 'heirat' | 'verlobung' | 'scheidung' | 'trennung' | 'sonstiges';
export const PARTNERSHIP_EVENT_LABEL: Record<PartnershipEventType, string> = {
  heirat: 'Heirat',
  verlobung: 'Verlobung',
  scheidung: 'Scheidung',
  trennung: 'Trennung',
  sonstiges: 'Sonstiges',
};

export interface PartnershipEvent {
  id: string;
  type: PartnershipEventType;
  form?: string; // standesamtlich, kirchlich …
  date?: GenDate;
  place?: string;
  status: Status;
  citations: Citation[];
  note?: string;
  didNotHappen?: boolean;
}

export interface Partnership {
  id: string;
  p1: string;
  p2: string;
  state: PartnershipState;
  events: PartnershipEvent[];
  status: Status;
  citations: Citation[];
  note?: string;
}

/** Verwandtschaftsaussage ohne vollständigen Pfad (Geschwister ohne Eltern, Großeltern ohne Zwischengeneration …) */
export type AssertionKind =
  | 'geschwister'
  | 'grosselternteil'
  | 'enkel_geschwisterzweig'
  | 'angegeben'
  | 'verwandt_grad_offen';

export interface Assertion {
  id: string;
  fromId: string;
  toId: string;
  kind: AssertionKind;
  /** Originalbezeichnung, z. B. "Als Cousin/Cousine angegeben bei" */
  label: string;
  status: Status;
  citations: Citation[];
  note?: string;
}

export type SourceType =
  | 'Familiengespräch'
  | 'Urkunde'
  | 'Kirchenbuch'
  | 'Grabregister'
  | 'Anzeige'
  | 'Register'
  | 'Bericht'
  | 'Foto'
  | 'Social Media'
  | 'Website'
  | 'Archiv'
  | 'Sonstiges';

export const SOURCE_TYPES: SourceType[] = [
  'Familiengespräch',
  'Urkunde',
  'Kirchenbuch',
  'Grabregister',
  'Anzeige',
  'Register',
  'Archiv',
  'Bericht',
  'Foto',
  'Social Media',
  'Website',
  'Sonstiges',
];

export interface Source {
  id: string;
  title: string;
  type: SourceType;
  author?: string;
  /** "Abgerufen / mitgeteilt" */
  date?: string;
  url?: string;
  /** "Was ist damit belegt?" */
  proves?: string;
  /** bei Familiengesprächen */
  partner?: string;
  previousUrls?: string[];
  /** weitere Fundstellen (Suchabfragen, Ortsseiten …) */
  extraLinks?: { kind: string; title?: string; url: string; note?: string }[];
  /** „Zugriff / Belegstatus“, z. B. „Register und Bilder direkt geprüft“ */
  access?: string;
  /** zuletzt neu geprüft am (TT.MM.JJJJ) */
  checkedAt?: string;
  personIds?: string[];
  mediaIds?: string[];
  createdAt: string;
  updatedAt: string;
}

/** Einzelne Belegaussage („Beleg B001“): was eine Quelle für welche Personen konkret belegt */
export interface Evidence {
  id: string;
  personIds: string[];
  feature: string;
  statement: string;
  kind?: string;
  sourceIds: string[];
  checkedAt?: string;
  limit?: string;
}

export interface MediaTarget {
  type: 'person' | 'event' | 'source';
  id: string; // Person-ID oder Quellen-ID
  eventId?: string;
}

export interface Media {
  id: string;
  /** Pfad im App-Ordner, z. B. medien/M011.jpg */
  file?: string;
  /** externer Fundort (nur Link) */
  url?: string;
  mime: string;
  title: string;
  description?: string;
  targets: MediaTarget[];
  sourceId?: string;
  createdAt: string;
}

export interface Research {
  id: string;
  name: string;
  period?: string;
  place?: string;
  finding?: string;
  sourceIds: string[];
  delimitation?: string;
  adoptedAs?: string;
  /** „Einordnung“, z. B. „Übernommen“, „Neu“ */
  status?: string;
  checkedAt?: string;
}

export interface FamilyNote {
  id: string;
  area?: string;
  topic?: string;
  text: string;
  sourceIds: string[];
  open?: string;
  history?: HistoryEntry[];
}

export interface OpenQuestion {
  id: string;
  text: string;
  personIds: string[];
  done: boolean;
  status?: string;
  known?: string;
  guess?: string;
  missing?: string;
  next?: string;
  answer?: string;
  sourceIds?: string[];
}

export interface DuplicatePair {
  id: string;
  a: string;
  b: string;
  verdict: 'moeglich' | 'verschieden' | 'zusammengefuehrt';
  note?: string;
  /** Zustand vor dem Zusammenführen – für "Rückgängig" */
  snapshot?: MergeSnapshot;
}

export interface MergeSnapshot {
  removed: Person;
  keptBefore: Person;
  parentChild: ParentChild[];
  partnerships: Partnership[];
  assertions: Assertion[];
}

export interface TreeDoc {
  schemaVersion: number;
  meta: {
    name: string;
    createdAt: string;
    updatedAt: string;
    importNotes?: string[];
    importedFrom?: string;
  };
  persons: Person[];
  parentChild: ParentChild[];
  partnerships: Partnership[];
  assertions: Assertion[];
  sources: Source[];
  media: Media[];
  research: Research[];
  notes: FamilyNote[];
  questions: OpenQuestion[];
  duplicates: DuplicatePair[];
  evidence: Evidence[];
}

export function emptyDoc(name = 'Stammbaum Seehafer'): TreeDoc {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { name, createdAt: now, updatedAt: now },
    persons: [],
    parentChild: [],
    partnerships: [],
    assertions: [],
    sources: [],
    media: [],
    research: [],
    notes: [],
    questions: [],
    duplicates: [],
    evidence: [],
  };
}
