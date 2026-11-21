import { getToken } from './auth';

/**
 * Microsoft Graph – nur App-Ordner (special/approot). Pfade relativ zum App-Ordner, z. B. "stammbaum.json",
 * "medien/M011.jpg", "backup/20261120_0905_stammbaum.json".
 */
const G = 'https://graph.microsoft.com/v1.0';

export interface DriveItem {
  id: string;
  name: string;
  eTag: string;
  size?: number;
  lastModifiedDateTime?: string;
  createdDateTime?: string;
}

export class GraphError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function itemUrl(path: string, suffix = '') {
  const enc = path.split('/').map(encodeURIComponent).join('/');
  return `${G}/me/drive/special/approot:/${enc}:${suffix}`;
}

async function req(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
  if (!res.ok && res.status !== 404) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      msg = j?.error?.message ?? msg;
    } catch {
      /* ignorieren */
    }
    throw new GraphError(res.status, msg);
  }
  return res;
}

export async function getItem(path: string): Promise<DriveItem | null> {
  const r = await req(itemUrl(path));
  if (r.status === 404) return null;
  return r.json();
}

export async function downloadText(path: string): Promise<{ text: string; eTag: string } | null> {
  const meta = await getItem(path);
  if (!meta) return null;
  const r = await req(itemUrl(path, '/content'));
  if (r.status === 404) return null;
  return { text: await r.text(), eTag: meta.eTag };
}

export async function downloadBlob(path: string): Promise<Blob | null> {
  const r = await req(itemUrl(path, '/content'));
  if (r.status === 404) return null;
  return r.blob();
}

/**
 * Hochladen. ifMatch: nur überschreiben, wenn die Datei noch diesen eTag hat (sonst 412 → Konflikt).
 * createOnly: nur anlegen, wenn sie noch nicht existiert.
 */
export async function upload(path: string, body: Blob | string, opt: { ifMatch?: string; createOnly?: boolean; contentType?: string } = {}): Promise<DriveItem> {
  const headers: Record<string, string> = { 'Content-Type': opt.contentType ?? 'application/octet-stream' };
  if (opt.ifMatch) headers['If-Match'] = opt.ifMatch;
  if (opt.createOnly) headers['If-None-Match'] = '*';
  const r = await req(itemUrl(path, '/content'), { method: 'PUT', headers, body });
  if (r.status === 404) throw new GraphError(404, 'Pfad nicht gefunden');
  return r.json();
}

export async function listChildren(folder: string): Promise<DriveItem[]> {
  const out: DriveItem[] = [];
  const q = '?$select=id,name,eTag,size,createdDateTime&$top=200';
  let url: string | undefined = folder ? itemUrl(folder, `/children${q}`) : `${G}/me/drive/special/approot/children${q}`;
  while (url) {
    const r = await req(url);
    if (r.status === 404) return out;
    const j = (await r.json()) as { value: DriveItem[]; '@odata.nextLink'?: string };
    out.push(...j.value);
    url = j['@odata.nextLink'];
  }
  return out;
}

export async function deleteItem(id: string) {
  await req(`${G}/me/drive/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
