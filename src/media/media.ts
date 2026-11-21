import { db } from '../state/db';
import { downloadBlob } from '../sync/graph';

/** Foto auf höchstens `max` Pixel (lange Kante) verkleinern, als JPEG. EXIF-Drehung wird übernommen. */
export async function resizeImage(file: Blob, max = 2000, quality = 0.85): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Bild konnte nicht umgewandelt werden'))), 'image/jpeg', quality));
}

export async function storeBlob(id: string, blob: Blob, file: string) {
  await db.blobs.put({ id, blob, mime: blob.type || 'application/octet-stream', uploaded: false, file });
}

const urlCache = new Map<string, string>();

/** Objekt-URL für ein Medium: aus dem Gerätespeicher oder (falls angemeldet) aus OneDrive nachladen */
export async function mediaUrl(id: string, file?: string): Promise<string | undefined> {
  if (urlCache.has(id)) return urlCache.get(id);
  let row = await db.blobs.get(id);
  if (!row && file && navigator.onLine) {
    try {
      const b = await downloadBlob(file);
      if (b) {
        await db.blobs.put({ id, blob: b, mime: b.type, uploaded: true, file });
        row = await db.blobs.get(id);
      }
    } catch {
      return undefined;
    }
  }
  if (!row) return undefined;
  const u = URL.createObjectURL(row.blob);
  urlCache.set(id, u);
  return u;
}
