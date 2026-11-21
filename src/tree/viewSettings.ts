import { useSyncExternalStore } from 'react';
import { treatAsLiving } from '../model/queries';
import type { TreeDoc } from '../model/types';
import { computeFan, type Fan } from './fan';
import { computeLayout, type Layout } from './layout';
import { pedigreeLayout } from './pedigree';

/** Ansichtseinstellungen – pro Gerät gespeichert (nicht in OneDrive, damit sie nicht synchronisiert werden müssen) */
export type ViewMode = 'standard' | 'vorfahren' | 'nachfahren' | 'sanduhr' | 'faecher';
export type LivingMode = 'zeigen' | 'anonym' | 'aus';

export interface ViewSettings {
  mode: ViewMode;
  genUp: number;
  genDown: number;
  showPartners: boolean;
  living: LivingMode;
  print: { paper: 'A4' | 'A3'; orientation: 'auto' | 'hoch' | 'quer'; split: 'eine' | 'mehr'; title: boolean; focus: boolean; date: boolean };
}

export const MODE_LABEL: Record<ViewMode, string> = {
  standard: 'Standard',
  vorfahren: 'Vorfahren',
  nachfahren: 'Nachfahren',
  sanduhr: 'Sanduhr',
  faecher: 'Fächer',
};

const KEY = 'stammbaum.view';
const DEFAULTS: ViewSettings = {
  mode: 'standard',
  genUp: 4,
  genDown: 3,
  showPartners: true,
  living: 'zeigen',
  print: { paper: 'A4', orientation: 'auto', split: 'eine', title: true, focus: true, date: true },
};

function load(): ViewSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<ViewSettings>;
      return { ...DEFAULTS, ...v, print: { ...DEFAULTS.print, ...(v.print ?? {}) } };
    }
  } catch {
    /* ignorieren */
  }
  return DEFAULTS;
}

let state = load();
const ls = new Set<() => void>();

export function setView(p: Partial<ViewSettings>) {
  state = { ...state, ...p };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignorieren */
  }
  for (const l of ls) l();
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

export type Built = { kind: 'layout'; layout: Layout; anon: Set<string> } | { kind: 'fan'; fan: Fan; anon: Set<string> };

/** Gemeinsame Berechnung für Bildschirm und Druck */
export function buildView(doc: TreeDoc, v: ViewSettings, focusId: string | undefined, onlyNear: boolean): Built {
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
  if (v.mode !== 'standard' && v.mode !== 'faecher' && focus) {
    return { kind: 'layout', layout: pedigreeLayout(d, { mode: v.mode, focusId: focus, genUp: v.genUp, genDown: v.genDown, showPartners: v.showPartners }), anon };
  }
  return { kind: 'layout', layout: computeLayout(d, { nearOf: onlyNear ? focusId : undefined, radius: 2 }), anon };
}
