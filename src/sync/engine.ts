import { useSyncExternalStore } from 'react';
import { migrate } from '../model/migrate';
import { emptyDoc, type TreeDoc } from '../model/types';
import { db, kvGet, kvSet } from '../state/db';
import { getState, markClean, replaceDoc } from '../state/store';
import { account, LoginRequired } from './auth';
import { backupDue, backupName, backupsToDelete } from './backups';
import { deepEqual, merge3, type MergeConflict, type Resolution } from './merge';
import { deleteItem, downloadText, getItem, GraphError, listChildren, upload } from './graph';

/**
 * Synchronisation mit OneDrive/Apps/Stammbaum Seehafer/stammbaum.json.
 * Optimistische Sperre über eTag (If-Match). Bei fremden Änderungen Dreiwege-Zusammenführung;
 * echte Widersprüche gehen zur Entscheidung an dich.
 */

const FILE = 'stammbaum.json';

export type SyncStatus = 'aus' | 'offline' | 'anmelden' | 'bereit' | 'laeuft' | 'konflikt' | 'fehler';

interface SyncMeta {
  eTag?: string;
  lastSyncAt?: string;
  lastBackupAt?: string;
}

export interface PendingConflict {
  remote: TreeDoc;
  remoteETag: string;
  base: TreeDoc;
  conflicts: MergeConflict[];
}

interface SyncState {
  status: SyncStatus;
  message?: string;
  lastSyncAt?: string;
  pending?: PendingConflict;
  log: string[];
}

let s: SyncState = { status: 'aus', log: [] };
const ls = new Set<() => void>();
function set(p: Partial<SyncState>) {
  s = { ...s, ...p };
  for (const l of ls) l();
}
function log(msg: string) {
  set({ log: [`${new Date().toLocaleTimeString('de-DE')} ${msg}`, ...s.log].slice(0, 50) });
}

export function useSync<T>(sel: (x: SyncState) => T): T {
  return useSyncExternalStore(
    (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
    () => sel(s),
  );
}

let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let again = false;

/** Nach Änderungen: verzögert synchronisieren (bündelt schnelle Eingaben) */
export function scheduleSync(delayMs = 4000) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delayMs);
}

async function meta(): Promise<SyncMeta> {
  return (await kvGet<SyncMeta>('syncMeta')) ?? {};
}
async function saveMeta(m: SyncMeta) {
  await kvSet('syncMeta', m);
}

export async function initSync() {
  const m = await meta();
  const acc = await account().catch(() => null);
  set({ status: acc ? (navigator.onLine ? 'bereit' : 'offline') : 'anmelden', lastSyncAt: m.lastSyncAt });
  window.addEventListener('online', () => void syncNow());
  window.addEventListener('offline', () => set({ status: 'offline' }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });
  if (acc && navigator.onLine) void syncNow();
}

async function uploadPendingMedia() {
  const pending = (await db.blobs.toArray()).filter((r) => !r.uploaded);
  for (const r of pending) {
    await upload(r.file, r.blob, { contentType: r.mime });
    await db.blobs.update(r.id, { uploaded: true });
    log(`Medium ${r.id} hochgeladen`);
  }
}

async function writeBackup(base: TreeDoc, m: SyncMeta) {
  if (!backupDue(m.lastBackupAt)) return;
  const name = backupName(new Date());
  await upload(`backup/${name}`, JSON.stringify(base), { contentType: 'application/json' });
  m.lastBackupAt = new Date().toISOString();
  log(`Sicherung backup/${name} angelegt`);
  try {
    const items = await listChildren('backup');
    const del = new Set(backupsToDelete(items.map((i) => i.name)));
    for (const it of items) if (del.has(it.name)) await deleteItem(it.id);
    if (del.size) log(`${del.size} alte Sicherung(en) entfernt`);
  } catch (e) {
    log(`Aufräumen der Sicherungen fehlgeschlagen: ${(e as Error).message}`);
  }
}

async function push(doc: TreeDoc, base: TreeDoc | undefined, m: SyncMeta, ifMatch?: string) {
  if (base) await writeBackup(base, m);
  const item = await upload(FILE, JSON.stringify(doc), ifMatch ? { ifMatch, contentType: 'application/json' } : { createOnly: true, contentType: 'application/json' });
  m.eTag = item.eTag;
  m.lastSyncAt = new Date().toISOString();
  await kvSet('base', doc);
  await saveMeta(m);
  await markClean(doc);
  set({ lastSyncAt: m.lastSyncAt });
  log('In OneDrive gespeichert');
}

export async function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  if (!navigator.onLine) return set({ status: 'offline' });
  if (s.status === 'konflikt') return;
  running = true;
  set({ status: 'laeuft', message: undefined });
  try {
    const acc = await account();
    if (!acc) return set({ status: 'anmelden' });
    await uploadPendingMedia();
    const m = await meta();
    const base = await kvGet<TreeDoc>('base');
    const { doc: local, dirty } = getState();
    const remoteMeta = await getItem(FILE);

    if (!remoteMeta) {
      if (local.persons.length || local.sources.length) {
        await push(local, undefined, m);
      } else log('Noch keine Daten in OneDrive');
      return set({ status: 'bereit' });
    }
    if (remoteMeta.eTag === m.eTag) {
      if (dirty) {
        try {
          await push(local, base, m, m.eTag);
        } catch (e) {
          if (e instanceof GraphError && e.status === 412) {
            again = true; // fremde Änderung dazwischen → nächster Durchlauf führt zusammen
            m.eTag = undefined;
            await saveMeta(m);
          } else throw e;
        }
      }
      return set({ status: 'bereit' });
    }
    // Remote hat sich geändert (anderes Gerät)
    const dl = await downloadText(FILE);
    if (!dl) return set({ status: 'bereit' });
    const remote = migrate(JSON.parse(dl.text));
    if (!dirty && base && deepEqual(local, base)) {
      // lokal unverändert → einfach übernehmen
      await replaceDoc(remote, { dirty: false, label: 'Stand aus OneDrive geladen' });
      await kvSet('base', remote);
      m.eTag = dl.eTag;
      m.lastSyncAt = new Date().toISOString();
      await saveMeta(m);
      log('Neuerer Stand aus OneDrive übernommen');
      return set({ status: 'bereit', lastSyncAt: m.lastSyncAt });
    }
    if (!base && !local.persons.length) {
      await replaceDoc(remote, { dirty: false, label: 'Stand aus OneDrive geladen' });
      await kvSet('base', remote);
      m.eTag = dl.eTag;
      m.lastSyncAt = new Date().toISOString();
      await saveMeta(m);
      log('Stammbaum aus OneDrive geladen');
      return set({ status: 'bereit', lastSyncAt: m.lastSyncAt });
    }
    const b = base ?? emptyDoc();
    const { merged, conflicts } = merge3(b, local, remote);
    if (conflicts.length) {
      log(`${conflicts.length} Konflikt(e) – Entscheidung nötig`);
      return set({ status: 'konflikt', pending: { remote, remoteETag: dl.eTag, base: b, conflicts } });
    }
    await replaceDoc(merged, { dirty: true, label: 'Mit OneDrive zusammengeführt', keepUndo: true });
    await push(merged, remote, m, dl.eTag);
    log('Änderungen beider Geräte zusammengeführt');
    set({ status: 'bereit' });
  } catch (e) {
    if (e instanceof LoginRequired) set({ status: 'anmelden', message: 'Bitte erneut anmelden' });
    else {
      set({ status: 'fehler', message: (e as Error).message });
      log(`Fehler: ${(e as Error).message}`);
    }
  } finally {
    running = false;
    if (again) {
      again = false;
      scheduleSync(500);
    }
  }
}

/** Konflikte entscheiden und speichern */
export async function resolveConflicts(resolutions: Resolution[]) {
  const p = s.pending;
  if (!p) return;
  const { doc: local } = getState();
  const { merged, conflicts } = merge3(p.base, local, p.remote, resolutions);
  if (conflicts.length) {
    set({ pending: { ...p, conflicts } });
    return;
  }
  set({ status: 'laeuft', pending: undefined });
  try {
    const m = await meta();
    await replaceDoc(merged, { dirty: true, label: 'Konflikte entschieden', keepUndo: true });
    await push(merged, p.remote, m, p.remoteETag);
    set({ status: 'bereit' });
  } catch (e) {
    if (e instanceof GraphError && e.status === 412) {
      set({ status: 'bereit' });
      scheduleSync(200);
    } else set({ status: 'fehler', message: (e as Error).message });
  }
}
