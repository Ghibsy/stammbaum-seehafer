import { useSyncExternalStore } from 'react';
import { emptyDoc, type TreeDoc } from '../model/types';
import { kvGet, kvSet } from './db';
import { migrate } from '../model/migrate';

/**
 * Zentraler Zustand. Jede Änderung wird sofort lokal gespeichert (Auto-Save)
 * und markiert den Stand als „nicht synchronisiert“. Rückgängig für die letzten 30 Schritte.
 */

type Listener = () => void;

interface State {
  doc: TreeDoc;
  loaded: boolean;
  dirty: boolean;
  undo: { label: string; doc: TreeDoc }[];
  lastChange?: string;
}

let state: State = { doc: emptyDoc(), loaded: false, dirty: false, undo: [] };
const listeners = new Set<Listener>();
let onChange: (() => void) | undefined;

function emit() {
  for (const l of listeners) l();
}

export function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getState() {
  return state;
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state));
}

export function setSyncHook(fn: () => void) {
  onChange = fn;
}

export async function loadLocal() {
  const raw = await kvGet<TreeDoc>('doc');
  const dirty = (await kvGet<boolean>('dirty')) ?? false;
  state = { ...state, doc: raw ? migrate(raw) : emptyDoc(), loaded: true, dirty };
  emit();
}

async function persist() {
  await kvSet('doc', state.doc);
  await kvSet('dirty', state.dirty);
}

/** Änderung am Stammbaum. `fn` arbeitet auf einer Kopie. */
export function update(label: string, fn: (d: TreeDoc) => void) {
  const before = state.doc;
  const next = structuredClone(before);
  fn(next);
  next.meta.updatedAt = new Date().toISOString();
  state = { ...state, doc: next, dirty: true, undo: [...state.undo.slice(-29), { label, doc: before }], lastChange: label };
  emit();
  void persist();
  onChange?.();
}

export function undoLast() {
  const last = state.undo[state.undo.length - 1];
  if (!last) return;
  state = { ...state, doc: last.doc, dirty: true, undo: state.undo.slice(0, -1), lastChange: `Rückgängig: ${last.label}` };
  emit();
  void persist();
  onChange?.();
}

/** Vollständiger Austausch (Import, Synchronisation) */
export async function replaceDoc(doc: TreeDoc, opts: { dirty: boolean; label?: string; keepUndo?: boolean }) {
  state = { ...state, doc, dirty: opts.dirty, undo: opts.keepUndo ? [...state.undo.slice(-29), { label: opts.label ?? 'Ersetzen', doc: state.doc }] : [], lastChange: opts.label };
  emit();
  await persist();
}

export async function markClean(doc: TreeDoc) {
  // nur sauber, wenn seit dem Hochladen nichts mehr geändert wurde
  if (state.doc === doc) {
    state = { ...state, dirty: false };
    emit();
    await kvSet('dirty', false);
  }
}
