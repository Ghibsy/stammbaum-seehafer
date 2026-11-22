import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { mediaBlob } from '../media/media';
import type { TreeDoc } from '../model/types';
import { buildGedcom, type GedExportOptions } from './gedcomExport';

/** GEDZIP (GEDCOM 7): ZIP mit gedcom.ged und den referenzierten Mediendateien */
export async function buildGedzip(doc: TreeDoc, opt: Omit<GedExportOptions, 'withMedia' | 'version'>): Promise<{ bytes: Uint8Array; missing: string[]; counts: ReturnType<typeof buildGedcom>['counts'] }> {
  const r = buildGedcom(doc, { ...opt, version: '7.0', withMedia: true });
  const files: Zippable = { 'gedcom.ged': strToU8(r.text) };
  const missing: string[] = [];
  for (const m of r.media) {
    const b = await mediaBlob(m.id, m.file);
    if (!b) {
      missing.push(m.file);
      continue;
    }
    files[m.file] = [new Uint8Array(await b.arrayBuffer()), { level: 0 }]; // Bilder sind bereits komprimiert
  }
  return { bytes: zipSync(files), missing, counts: r.counts };
}

/** Aus .ged/.gdz/.zip die GEDCOM-Bytes holen */
export function gedcomBytes(name: string, bytes: Uint8Array): { ged: Uint8Array; mediaCount: number } {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!isZip) return { ged: bytes, mediaCount: 0 };
  const files = unzipSync(bytes);
  const gedName = Object.keys(files).find((f) => f.toLowerCase() === 'gedcom.ged') ?? Object.keys(files).find((f) => f.toLowerCase().endsWith('.ged'));
  if (!gedName) throw new Error(`In ${name} wurde keine .ged-Datei gefunden.`);
  return { ged: files[gedName], mediaCount: Object.keys(files).length - 1 };
}
