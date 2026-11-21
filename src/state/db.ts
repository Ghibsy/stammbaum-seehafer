import Dexie, { type Table } from 'dexie';

/** Lokale Kopie auf dem Gerät (IndexedDB) – funktioniert ohne Netz. */
export interface KV {
  key: string;
  value: unknown;
}
export interface BlobRow {
  id: string; // Medien-ID
  blob: Blob;
  mime: string;
  uploaded: boolean;
  file: string; // Zielpfad im App-Ordner
}

class LocalDB extends Dexie {
  kv!: Table<KV, string>;
  blobs!: Table<BlobRow, string>;
  constructor() {
    super('stammbaum-seehafer');
    this.version(1).stores({ kv: 'key', blobs: 'id' });
  }
}

export const db = new LocalDB();

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await db.kv.get(key))?.value as T | undefined;
}
export async function kvSet(key: string, value: unknown) {
  await db.kv.put({ key, value });
}

/** Android soll den Speicher nicht automatisch räumen */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ignorieren */
  }
  return false;
}
