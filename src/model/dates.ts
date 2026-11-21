import type { GenDate } from './types';

/**
 * Genealogische Datumsangaben in deutscher Schreibweise (TT.MM.JJJJ).
 * Unterstützt: exakt, "ca./etwa/um", "vor", "nach", "zwischen … und …", "1920–1925",
 * Jahrzehnt-Unsicherheit "197x", Tag+Monat ohne Jahr ("03.12., Jahr unbekannt"),
 * Fragezeichen und "vermutlich" als Unsicherheit, Zusatztext nach ";".
 * Es wird nie ein Wert ergänzt, der nicht in der Eingabe steht.
 */

const DMY = /^(\d{1,2})\.(\d{1,2})\.(\d{3}[0-9x]|\d{4})?$/i;
const MY = /^(\d{1,2})\.(\d{4})$/;
const Y = /^(\d{3}[0-9x])$/i;

interface Part {
  y?: number;
  m?: number;
  d?: number;
  yFrom?: number;
  yTo?: number;
}

function parsePart(s: string): Part | null {
  s = s.trim();
  if (!/^\d{1,2}\.\d{1,2}\.$/.test(s)) s = s.replace(/\.$/, '');
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.$/))) {
    return valid({ d: +m[1], m: +m[2] });
  }
  if ((m = s.match(DMY))) {
    const part: Part = { d: +m[1], m: +m[2] };
    if (m[3]) Object.assign(part, year(m[3]));
    return valid(part);
  }
  if ((m = s.match(MY))) return valid({ m: +m[1], y: +m[2] });
  if ((m = s.match(Y))) return year(m[1]);
  return null;
}

function year(s: string): Part {
  if (/x$/i.test(s)) {
    const base = +s.slice(0, 3) * 10;
    return { yFrom: base, yTo: base + 9 };
  }
  return { y: +s };
}

function valid(p: Part): Part | null {
  if (p.m !== undefined && (p.m < 1 || p.m > 12)) return null;
  if (p.d !== undefined && (p.d < 1 || p.d > 31)) return null;
  return p;
}

export function parseGenDate(input: string | undefined | null): GenDate | undefined {
  if (input === undefined || input === null) return undefined;
  const raw = String(input).trim();
  if (!raw) return undefined;

  let rest = raw;
  let remark: string | undefined;
  const semi = rest.indexOf(';');
  if (semi >= 0) {
    remark = rest.slice(semi + 1).trim() || undefined;
    rest = rest.slice(0, semi).trim();
  }

  let uncertain = false;
  // Kommentare wie ", Jahr unbekannt" / ", Zuordnung vorläufig"
  const commaRemark = rest.match(/^(.*?\d\.?)\s*,\s*(.+)$/);
  if (commaRemark && /[a-zäöü]/i.test(commaRemark[2])) {
    const extra = commaRemark[2].trim();
    if (!/^jahr unbekannt$/i.test(extra)) remark = remark ? `${extra}; ${remark}` : extra;
    rest = commaRemark[1].trim();
  }
  rest = rest.replace(/\s*\(.*?\)\s*/g, ' ').trim();

  if (/^vermutlich\s+/i.test(rest)) {
    uncertain = true;
    rest = rest.replace(/^vermutlich\s+/i, '');
  }
  if (/\?\s*$/.test(rest)) {
    uncertain = true;
    rest = rest.replace(/\s*\?+\s*$/, '');
  }
  rest = rest.replace(/\s+verstorben$/i, '').replace(/^verstorben$/i, '').trim();

  const base = { raw, uncertain, remark } as GenDate;
  if (!rest || /^(unbekannt|datum unbekannt)$/i.test(rest)) {
    return { ...base, qualifier: 'unbekannt' };
  }

  let m: RegExpMatchArray | null;
  if ((m = rest.match(/^(?:ca\.?|circa|etwa|um|ungefähr|gegen)\s+(.+)$/i))) {
    const p = parsePart(m[1]);
    if (p) return { ...base, qualifier: 'etwa', ...p };
  }
  if ((m = rest.match(/^vor\s+(.+)$/i))) {
    const p = parsePart(m[1]);
    if (p) return { ...base, qualifier: 'vor', ...p };
  }
  if ((m = rest.match(/^nach\s+(.+)$/i))) {
    const p = parsePart(m[1]);
    if (p) return { ...base, qualifier: 'nach', ...p };
  }
  if ((m = rest.match(/^(?:zwischen\s+)?(.+?)\s*(?:und|–|-|bis)\s*(.+)$/i)) && !/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(rest)) {
    const a = parsePart(m[1]);
    const b = parsePart(m[2]);
    if (a && b) return { ...base, qualifier: 'zwischen', ...a, y2: b.y ?? b.yTo, m2: b.m, d2: b.d };
  }
  const p = parsePart(rest);
  if (p) return { ...base, qualifier: 'exakt', ...p };
  // nicht interpretierbar: Rohtext bleibt erhalten
  return { ...base, qualifier: 'unbekannt', remark: remark ? `${rest}; ${remark}` : rest };
}

export function dateFromParts(y: number, m: number, d: number): GenDate {
  return { raw: `${pad(d)}.${pad(m)}.${y}`, qualifier: 'exakt', y, m, d, uncertain: false };
}

/** Excel-Seriennummer (1900-System) → Datum. Seriennummer 60 (29.02.1900) existiert real nicht. */
export function excelSerialToParts(serial: number): { y: number; m: number; d: number } {
  const ms = Math.round((serial - 25569) * 86400000);
  const dt = new Date(ms);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function partText(y?: number, m?: number, d?: number, yFrom?: number, yTo?: number): string {
  const yt = y !== undefined ? String(y) : yFrom !== undefined && yTo !== undefined && yTo - yFrom === 9 ? `${String(yFrom).slice(0, 3)}x` : yFrom !== undefined ? `${yFrom}–${yTo}` : '';
  if (d !== undefined && m !== undefined) return yt ? `${pad(d)}.${pad(m)}.${yt}` : `${pad(d)}.${pad(m)}.`;
  if (m !== undefined) return yt ? `${pad(m)}.${yt}` : `${pad(m)}.`;
  return yt;
}

/** Anzeigeform, z. B. "ca. 1990", "vor 12.03.1971", "05.09.1994?", "09.11. (Jahr unbekannt)" */
export function formatGenDate(g: GenDate | undefined): string {
  if (!g) return '';
  if (g.qualifier === 'unbekannt') return g.remark && !g.y ? g.raw : 'unbekannt';
  const main = partText(g.y, g.m, g.d, g.yFrom, g.yTo);
  let s: string;
  switch (g.qualifier) {
    case 'etwa':
      s = `ca. ${main}`;
      break;
    case 'vor':
      s = `vor ${main}`;
      break;
    case 'nach':
      s = `nach ${main}`;
      break;
    case 'zwischen':
      s = `zwischen ${main} und ${partText(g.y2, g.m2, g.d2)}`;
      break;
    default:
      s = main;
  }
  if (hasNoYear(g)) s += ' (Jahr unbekannt)';
  if (g.uncertain) s += '?';
  return s;
}

export function hasNoYear(g: GenDate): boolean {
  return g.y === undefined && g.yFrom === undefined && g.qualifier !== 'unbekannt';
}

/** Sortierbereich als [von, bis] in der Form JJJJMMTT; undefined wenn kein Jahr bekannt */
export function sortRange(g: GenDate | undefined): [number, number] | undefined {
  if (!g || g.qualifier === 'unbekannt') return undefined;
  const yFrom = g.y ?? g.yFrom;
  const yTo = g.y ?? g.yTo;
  if (yFrom === undefined || yTo === undefined) return undefined;
  const lo = yFrom * 10000 + (g.m ?? 1) * 100 + (g.d ?? 1);
  const hi = yTo * 10000 + (g.m ?? 12) * 100 + (g.d ?? 31);
  switch (g.qualifier) {
    case 'etwa':
      return [lo - 20000, hi + 20000];
    case 'vor':
      return [lo - 1000000, lo - 1];
    case 'nach':
      return [hi + 1, hi + 1000000];
    case 'zwischen':
      return [lo, (g.y2 ?? yTo) * 10000 + (g.m2 ?? 12) * 100 + (g.d2 ?? 31)];
    default:
      return [lo, hi];
  }
}

/** Ein Sortierschlüssel (Mitte des Bereichs); Angaben ohne Jahr ans Ende */
export function sortKey(g: GenDate | undefined): number {
  const r = sortRange(g);
  if (!r) return Number.MAX_SAFE_INTEGER;
  return g?.qualifier === 'vor' ? r[1] : g?.qualifier === 'nach' ? r[0] : Math.round((r[0] + r[1]) / 2);
}

function ymd(n: number) {
  return { y: Math.floor(n / 10000), m: Math.floor((n % 10000) / 100), d: n % 100 };
}

function yearsBetween(a: number, b: number): number {
  const A = ymd(a);
  const B = ymd(b);
  let years = B.y - A.y;
  if (B.m < A.m || (B.m === A.m && B.d < A.d)) years--;
  return years;
}

/**
 * Alter zum Zeitpunkt `at` (oder heute). Gibt {min,max} zurück; bei exakten Daten min===max.
 * Bei "vor"/"nach" ist eine Seite offen → undefined.
 */
export function ageAt(birth: GenDate | undefined, at?: GenDate | Date): { min: number; max: number } | undefined {
  const b = sortRange(birth);
  if (!b || birth?.qualifier === 'vor' || birth?.qualifier === 'nach') return undefined;
  let t: [number, number] | undefined;
  if (at === undefined || at instanceof Date) {
    const now = at ?? new Date();
    const n = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
    t = [n, n];
  } else {
    if (at.qualifier === 'vor' || at.qualifier === 'nach') return undefined;
    t = sortRange(at);
  }
  if (!t) return undefined;
  const min = Math.max(0, yearsBetween(b[1], t[0]));
  const max = Math.max(0, yearsBetween(b[0], t[1]));
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

export function formatAge(a: { min: number; max: number } | undefined): string {
  if (!a) return '';
  return a.min === a.max ? `${a.min}` : `${a.min}–${a.max}`;
}

/** Jahr für Kachelanzeige, z. B. "1929", "ca. 1990", "197x", "?" */
export function shortYear(g: GenDate | undefined): string {
  if (!g || g.qualifier === 'unbekannt') return '';
  const y = g.y !== undefined ? String(g.y) : g.yFrom !== undefined ? `${String(g.yFrom).slice(0, 3)}x` : '';
  if (!y) return '';
  const pre = g.qualifier === 'etwa' ? 'ca. ' : g.qualifier === 'vor' ? 'vor ' : g.qualifier === 'nach' ? 'nach ' : '';
  return `${pre}${y}${g.uncertain ? '?' : ''}`;
}

/** Ist das Datum heute ± Tage ein Jahrestag? (für spätere Jahrestage-Ansicht) */
export function dayMonth(g: GenDate | undefined): { d: number; m: number } | undefined {
  if (!g || g.d === undefined || g.m === undefined) return undefined;
  return { d: g.d, m: g.m };
}
