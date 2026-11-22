import { nextId } from './ids';
import { displayName, Index, isActive } from './queries';
import { normalize } from './search';
import type { GenDate, Place, TreeDoc } from './types';
import { EVENT_TYPE_LABEL, PARTNERSHIP_EVENT_LABEL } from './types';

/**
 * Orte: Die Angaben behalten ihren Originaltext („vermutlich Altdorf“, „Marienburg / Malbork“).
 * Für Ortsliste und Karte wird daraus ein Ortsname abgeleitet; ein gepflegter Ort (Place) bündelt
 * alle Schreibweisen und historischen Namen und trägt die Koordinaten.
 * Straßenadressen werden nie als Ort verwendet und nie an einen Kartendienst geschickt.
 */

/** Ortsnamen aus einem Freitext: Vorsilben wie „vermutlich“ und Straßenangaben fallen weg, „A / B“ wird zu zwei Namen */
export function placeNames(raw: string | undefined): string[] {
  if (!raw) return [];
  // Klammern (auch nicht geschlossene) und alles nach „;“ sind Erläuterungen
  let s = raw.replace(/\(.*?\)/g, ' ').replace(/\(.*$/, ' ').split(';')[0].replace(/\s+/g, ' ').trim();
  const isStreet = (p: string) => /\d/.test(p) || /(straße|strasse|str\.|weg|gasse|allee|platz|ring|damm)(\s|$)/i.test(p) || /^ul\.\s/i.test(p);
  const isQualifier = (p: string) => /^(vermutlich|nach erinnerung|unsicher|offen|ungeklärt|wohl)$/i.test(p);
  // „Straße 6, Ort“ oder „Ort, Straße“ → erster Teil, der wie ein Ort aussieht
  const parts = s
    .split(',')
    .map((x) => x.trim().replace(/^(D-)?\d{2}-?\d{3}\s+/, '')) // Postleitzahl vor dem Ort
    .filter((p) => p && !isQualifier(p));
  const pick = parts.find((p) => !isStreet(p));
  if (!pick) return [];
  s = pick;
  for (let i = 0; i < 3; i++)
    s = s
      .replace(/^(vermutlich|möglicherweise|wahrscheinlich|wohl|evtl\.?|eventuell|vielleicht|ca\.?|bei|nahe|in|im|Ortsbezug|Raum|Region|Herkunft:?|früher|zuerst|zuletzt|später|anfangs|seit|heute)\s+/i, '')
      .replace(/^(.*\b)?Friedhof\s+/i, '')
      .trim();
  s = s.replace(/[?]+$/, '').trim();
  // „vermutlich A / B“ heißt „A oder B“ – dann sind es keine zwei Namen desselben Ortes
  if (/^\s*(vermutlich|möglicherweise|wahrscheinlich|wohl|evtl\.?|eventuell|vielleicht)\b/i.test(raw) || /\boder\b/i.test(s)) {
    const first = s.split(/\s*\/\s*|\s+oder\s+/i)[0].trim();
    return first.length > 1 ? [first] : [];
  }
  return s
    .split(/\s+\/\s+|\s*\/\s*/)
    .map((x) => x.trim())
    .filter((x) => x.length > 1 && /[a-zäöüßąćęłńóśźż]/i.test(x));
}

export interface PlaceUse {
  personId: string;
  personName: string;
  what: string;
  date?: GenDate;
  raw: string;
}

export interface PlaceGroup {
  key: string;
  /** gepflegter Ort, falls vorhanden */
  place?: Place;
  label: string;
  names: string[];
  uses: PlaceUse[];
}

/** Alle in den Angaben vorkommenden Orte, gebündelt nach gepflegten Orten bzw. gleichem Namen */
export function collectPlaces(doc: TreeDoc): PlaceGroup[] {
  const idx = new Index(doc);
  const byName = new Map<string, Place>();
  for (const p of doc.places ?? []) for (const n of [p.name, ...p.altNames]) byName.set(normalize(n), p);
  const groups = new Map<string, PlaceGroup>();
  const nameKey = new Map<string, string>();
  const add = (raw: string | undefined, use: Omit<PlaceUse, 'raw'>) => {
    const names = placeNames(raw);
    if (!names.length) return;
    const place = names.map((n) => byName.get(normalize(n))).find(Boolean);
    const key = place ? `place:${place.id}` : (names.map((n) => nameKey.get(normalize(n))).find(Boolean) ?? `name:${normalize(names[0])}`);
    if (!place) for (const n of names) if (!nameKey.has(normalize(n))) nameKey.set(normalize(n), key);
    let g = groups.get(key);
    if (!g) {
      g = { key, place, label: place?.name ?? names[0], names: place ? [place.name, ...place.altNames] : [], uses: [] };
      groups.set(key, g);
    }
    for (const n of names) if (!g.names.some((x) => normalize(x) === normalize(n))) g.names.push(n);
    g.uses.push({ ...use, raw: raw! });
  };
  for (const p of idx.byId.values()) {
    const pn = displayName(p);
    for (const e of p.events) {
      if (!isActive(e.status) || !e.place) continue;
      add(e.place, { personId: p.id, personName: pn, what: e.label && e.type === 'sonstiges' ? e.label : EVENT_TYPE_LABEL[e.type], date: e.date });
    }
  }
  for (const pa of doc.partnerships) {
    if (!isActive(pa.status)) continue;
    for (const e of pa.events) {
      if (!isActive(e.status) || !e.place) continue;
      for (const id of [pa.p1, pa.p2]) {
        const p = idx.person(id);
        if (p) add(e.place, { personId: id, personName: displayName(p), what: PARTNERSHIP_EVENT_LABEL[e.type], date: e.date });
      }
    }
  }
  // gepflegte Orte ohne Verwendung trotzdem zeigen
  for (const p of doc.places ?? []) {
    const key = `place:${p.id}`;
    if (!groups.has(key)) groups.set(key, { key, place: p, label: p.name, names: [p.name, ...p.altNames], uses: [] });
  }
  return [...groups.values()].sort((a, b) => b.uses.length - a.uses.length || a.label.localeCompare(b.label, 'de'));
}

/** Gepflegten Ort zu einer Gruppe anlegen (oder vorhandenen zurückgeben) */
export function ensurePlace(doc: TreeDoc, g: PlaceGroup): Place {
  if (g.place) return doc.places.find((p) => p.id === g.place!.id)!;
  const t = new Date().toISOString();
  const [name, ...alt] = g.names.length ? g.names : [g.label];
  const p: Place = { id: nextId(doc, 'L'), name, altNames: alt, createdAt: t, updatedAt: t };
  doc.places.push(p);
  return p;
}

/** Zwei Ortsgruppen zusammenlegen (z. B. „Breslau“ und „Wrocław“): die Namen der zweiten werden alternative Namen */
export function mergePlaceInto(doc: TreeDoc, target: Place, other: PlaceGroup) {
  for (const n of other.names) if (normalize(n) !== normalize(target.name) && !target.altNames.some((a) => normalize(a) === normalize(n))) target.altNames.push(n);
  if (other.place && other.place.id !== target.id) {
    const o = doc.places.find((p) => p.id === other.place!.id);
    if (o && target.lat === undefined && o.lat !== undefined) Object.assign(target, { lat: o.lat, lon: o.lon, coordSource: o.coordSource, osmLabel: o.osmLabel });
    doc.places = doc.places.filter((p) => p.id !== other.place!.id);
  }
  target.updatedAt = new Date().toISOString();
}

export interface OsmHit {
  lat: number;
  lon: number;
  label: string;
  type: string;
}

/**
 * Koordinatensuche bei OpenStreetMap (Nominatim) – nur auf ausdrücklichen Knopfdruck.
 * Gesendet wird ausschließlich der Ortsname, nie Personen oder Adressen.
 */
export async function searchOsm(placeName: string): Promise<OsmHit[]> {
  // „Garbsen bei Hannover“ → „Garbsen, Hannover“ (so findet OSM den richtigen Ort)
  const q = (placeNames(placeName)[0] ?? placeName).replace(/\s+bei\s+/i, ', ');
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=de&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, referrerPolicy: 'strict-origin-when-cross-origin' });
  if (!res.ok) throw new Error(`OpenStreetMap antwortet nicht (${res.status}).`);
  const data = (await res.json()) as { lat: string; lon: string; display_name: string; type: string; addresstype?: string }[];
  return data.map((d) => ({ lat: +d.lat, lon: +d.lon, label: d.display_name, type: d.addresstype ?? d.type }));
}
