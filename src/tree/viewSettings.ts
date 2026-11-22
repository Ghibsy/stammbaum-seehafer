import { useSyncExternalStore } from 'react';
import { treatAsLiving } from '../model/queries';
import type { TreeDoc } from '../model/types';
import { computeFan, type Fan } from './fan';
import { computeLayout, setTileMetrics, type Layout } from './layout';
import { stammLayout } from './stammLayout';
import { pedigreeLayout } from './pedigree';
import { stammVisible, type Marks } from './stamm';

/** Ansichtseinstellungen – pro Gerät gespeichert (nicht in OneDrive, damit sie nicht synchronisiert werden müssen) */
export type ViewMode = 'stamm' | 'standard' | 'vorfahren' | 'nachfahren' | 'sanduhr' | 'faecher';
export type LivingMode = 'zeigen' | 'anonym' | 'aus';
export type TileSize = 'kompakt' | 'standard' | 'gross';
export type Spacing = 'eng' | 'standard' | 'weit';
export type ColorScheme = 'geschlecht' | 'dezent' | 'neutral';

export interface TileContent {
  photo: boolean;
  /** Rufname statt aller Vornamen */
  callName: boolean;
  birthName: boolean;
  dates: boolean;
  age: boolean;
  birthPlace: boolean;
  deathPlace: boolean;
  residence: boolean;
  occupation: boolean;
  id: boolean;
  status: boolean;
  /** vollständige Lebensdaten (Geburtstag, Todestag) statt nur der Jahre */
  fullDates: boolean;
}

export interface ViewSettings {
  version: number;
  mode: ViewMode;
  /** Stammelternteil für die Ansicht „Stammbaum“ (Partner wird automatisch einbezogen) */
  rootId: string;
  genUp: number;
  genDown: number;
  showPartners: boolean;
  living: LivingMode;
  tile: TileContent;
  size: TileSize;
  spacing: Spacing;
  colors: ColorScheme;
  print: { paper: 'A4' | 'A3'; orientation: 'auto' | 'hoch' | 'quer'; split: 'eine' | 'mehr'; title: boolean; focus: boolean; date: boolean };
}

export const MODE_LABEL: Record<ViewMode, string> = {
  stamm: 'Stammbaum',
  standard: 'Alle Personen',
  vorfahren: 'Vorfahren',
  nachfahren: 'Nachfahren',
  sanduhr: 'Sanduhr',
  faecher: 'Fächer',
};

export const TILE_SIZES: Record<TileSize, { w: number; h: number; label: string }> = {
  kompakt: { w: 150, h: 64, label: 'Kompakt' },
  standard: { w: 180, h: 100, label: 'Standard' },
  gross: { w: 214, h: 136, label: 'Groß' },
};

const KEY = 'stammbaum.view';
const VERSION = 2;
const DEFAULTS: ViewSettings = {
  version: VERSION,
  mode: 'stamm',
  rootId: 'P006',
  genUp: 4,
  genDown: 3,
  showPartners: true,
  living: 'zeigen',
  tile: { photo: true, callName: true, birthName: true, dates: true, age: true, birthPlace: true, deathPlace: false, residence: true, occupation: false, id: true, status: true, fullDates: false },
  size: 'standard',
  spacing: 'standard',
  colors: 'geschlecht',
  print: { paper: 'A4', orientation: 'auto', split: 'eine', title: true, focus: true, date: true },
};

function load(): ViewSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<ViewSettings>;
      const merged: ViewSettings = { ...DEFAULTS, ...v, tile: { ...DEFAULTS.tile, ...(v.tile ?? {}) }, print: { ...DEFAULTS.print, ...(v.print ?? {}) } };
      // Phase 2b: neue Standardansicht „Stammbaum“ statt der Gesamtansicht
      if ((v.version ?? 1) < 2 && merged.mode === 'standard') merged.mode = 'stamm';
      merged.version = VERSION;
      return merged;
    }
  } catch {
    /* ignorieren */
  }
  return DEFAULTS;
}

let state = load();
const ls = new Set<() => void>();
const emit = () => {
  for (const l of ls) l();
};

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignorieren */
  }
}

export function setView(p: Partial<ViewSettings>) {
  state = { ...state, ...p };
  save(KEY, state);
  emit();
}

export function setTile(p: Partial<TileContent>) {
  setView({ tile: { ...state.tile, ...p } });
}

export function useView(): ViewSettings {
  return useSyncExternalStore(
    (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
    () => state,
  );
}

// ---------- aufgeklappte Zweige (pro Gerät) ----------
export interface ExpandState {
  up: string[];
  down: string[];
  /** an diesen Knoten bewusst zugeklappt */
  collapsed?: string[];
}
const EKEY = 'stammbaum.expand';
let expand: ExpandState = (() => {
  try {
    const raw = localStorage.getItem(EKEY);
    if (raw) return JSON.parse(raw) as ExpandState;
  } catch {
    /* ignorieren */
  }
  return { up: [], down: [] };
})();

function setExpand(e: ExpandState) {
  expand = e;
  save(EKEY, e);
  emit();
}
export function toggleUp(id: string) {
  setExpand({ ...expand, up: expand.up.includes(id) ? expand.up.filter((x) => x !== id) : [...expand.up, id] });
}
/** ▼ an einem Knoten: offen → zuklappen (auch Teile des Grundbaums), zu → aufklappen */
export function toggleDown(id: string, open: boolean, partners: string[] = []) {
  // gilt für das ganze Paar, sonst hielte der Partner den Zweig offen bzw. zu
  const pair = [id, ...partners];
  const collapsed = expand.collapsed ?? [];
  if (open) setExpand({ ...expand, down: expand.down.filter((x) => !pair.includes(x)), collapsed: [...new Set([...collapsed, ...pair])] });
  else setExpand({ ...expand, down: [...new Set([...expand.down, id])], collapsed: collapsed.filter((x) => !pair.includes(x)) });
}
export function openBranches(up: string[], down: string[]) {
  setExpand({
    up: [...new Set([...expand.up, ...up])],
    down: [...new Set([...expand.down, ...down])],
    collapsed: (expand.collapsed ?? []).filter((x) => !down.includes(x)),
  });
}
export function collapseAll() {
  setExpand({ up: [], down: [], collapsed: [] });
}
export function useExpand(): ExpandState {
  return useSyncExternalStore(
    (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
    () => expand,
  );
}

export type Built =
  | { kind: 'layout'; layout: Layout; anon: Set<string>; marks?: Marks; hidden?: string[]; rootId?: string }
  | { kind: 'fan'; fan: Fan; anon: Set<string> };

/** Gemeinsame Berechnung für Bildschirm und Druck */
export function buildView(doc: TreeDoc, v: ViewSettings, focusId: string | undefined, onlyNear: boolean, ex: ExpandState = expand): Built {
  const size = TILE_SIZES[v.size] ?? TILE_SIZES.standard;
  setTileMetrics(size.w, size.h, v.spacing);
  const living = new Set(doc.persons.filter((p) => !p.deletedAt && treatAsLiving(p)).map((p) => p.id));
  let d = doc;
  if (v.living === 'aus') {
    d = {
      ...doc,
      persons: doc.persons.filter((p) => !living.has(p.id) || p.id === focusId),
    };
  }
  const anon = v.living === 'anonym' ? living : new Set<string>();
  const focus = focusId && d.persons.some((p) => p.id === focusId && !p.deletedAt) ? focusId : d.persons.find((p) => p.id === 'P001' && !p.deletedAt)?.id ?? d.persons.find((p) => !p.deletedAt)?.id;
  if (v.mode === 'faecher' && focus) return { kind: 'fan', fan: computeFan(d, focus, Math.min(v.genUp, 6)), anon };
  if ((v.mode === 'vorfahren' || v.mode === 'nachfahren' || v.mode === 'sanduhr') && focus) {
    return { kind: 'layout', layout: pedigreeLayout(d, { mode: v.mode, focusId: focus, genUp: v.genUp, genDown: v.genDown, showPartners: v.showPartners }), anon };
  }
  if (v.mode === 'stamm') {
    const s = stammVisible(d, v.rootId, new Set(ex.up), new Set(ex.down), new Set(ex.collapsed ?? []));
    return { kind: 'layout', layout: stammLayout(d, s.rootId ?? v.rootId, s.visible), anon, marks: s.marks, hidden: s.hidden, rootId: s.rootId };
  }
  return { kind: 'layout', layout: computeLayout(d, { nearOf: onlyNear ? focusId : undefined, radius: 2 }), anon };
}
