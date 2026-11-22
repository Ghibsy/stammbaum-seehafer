import { ageAt, sortRange } from './dates';
import { birthDate, deathDate, displayName, Index, isActive, isDeceased, nameOf, treatAsLiving } from './queries';
import type { Status, TreeDoc } from './types';
import { placeNames } from './places';

/** Kennzahlen für die Statistik-Seite. Unsichere Daten zählen mit, werden aber getrennt ausgewiesen. */
export interface Stats {
  persons: number;
  named: number;
  unnamed: number;
  placeholders: number;
  living: number;
  deceased: number;
  sex: { m: number; w: number; other: number };
  sources: number;
  media: number;
  places: number;
  relations: { parentChild: number; partnerships: number; assertions: number };
  status: Record<Status, number>;
  birthsByDecade: { decade: number; count: number }[];
  lifespan?: { count: number; avg: number; min: { age: number; id: string; name: string }; max: { age: number; id: string; name: string } };
  givenNames: { name: string; count: number }[];
  surnames: { name: string; count: number }[];
  birthPlaces: { name: string; count: number }[];
  generations: number;
  completeness: { birthDate: number; birthPlace: number; deathDateOfDeceased: number; photo: number; anySource: number; base: number; deceasedBase: number };
}

const top = (m: Map<string, number>, n = 10) =>
  [...m.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'))
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
const inc = (m: Map<string, number>, k: string | undefined) => k && m.set(k, (m.get(k) ?? 0) + 1);

export function computeStats(doc: TreeDoc, now = new Date()): Stats {
  const idx = new Index(doc);
  const all = [...idx.byId.values()];
  const real = all.filter((p) => p.kind !== 'platzhalter');
  const status: Record<Status, number> = { belegt: 0, familienangabe: 0, abgeleitet: 0, unsicher: 0, widerlegt: 0 };
  for (const p of real) {
    for (const n of p.names) status[n.status]++;
    for (const e of p.events) status[e.status]++;
  }
  for (const x of [...doc.parentChild, ...doc.partnerships, ...doc.assertions]) status[x.status]++;

  const decades = new Map<number, number>();
  for (const p of real) {
    const r = sortRange(birthDate(p));
    if (!r) continue;
    const y = Math.floor(((r[0] + r[1]) / 2) / 10000);
    if (Math.floor(r[0] / 100000) !== Math.floor(r[1] / 100000)) continue; // Spanne über mehrere Jahrzehnte: nicht zuordenbar
    const d = Math.floor(y / 10) * 10;
    decades.set(d, (decades.get(d) ?? 0) + 1);
  }
  const birthsByDecade = [...decades.entries()].sort((a, b) => a[0] - b[0]).map(([decade, count]) => ({ decade, count }));

  // Lebensalter nur, wenn Geburt und Tod mindestens aufs Jahr bekannt sind und das Alter eindeutig ist (±1)
  const ages: { age: number; id: string; name: string }[] = [];
  for (const p of real) {
    const b = birthDate(p);
    const d = deathDate(p);
    if (!b || !d) continue;
    const a = ageAt(b, d);
    if (!a || a.max - a.min > 1) continue;
    ages.push({ age: a.min, id: p.id, name: displayName(p) });
  }
  ages.sort((a, b) => a.age - b.age);
  const lifespan = ages.length ? { count: ages.length, avg: Math.round((ages.reduce((s, x) => s + x.age, 0) / ages.length) * 10) / 10, min: ages[0], max: ages[ages.length - 1] } : undefined;

  const given = new Map<string, number>();
  const sur = new Map<string, number>();
  const bp = new Map<string, number>();
  for (const p of real) {
    inc(given, nameOf(p, 'vorname')?.split(/\s+/)[0]);
    inc(sur, nameOf(p, 'geburtsname') ?? nameOf(p, 'nachname'));
    const b = p.events.find((e) => e.type === 'geburt' && isActive(e.status));
    inc(bp, placeNames(b?.place)[0]);
  }

  // längste Generationenkette (Eltern → Kind)
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const down = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const d = 1 + Math.max(0, ...idx.children(id).map(down));
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  const generations = Math.max(0, ...all.map((p) => down(p.id)));

  const deceased = real.filter((p) => isDeceased(p));
  const anySource = (p: (typeof real)[number]) => p.citations.length > 0 || p.names.some((n) => n.citations.length) || p.events.some((e) => e.citations.length);
  const named = real.filter((p) => p.kind === 'benannt');
  return {
    persons: all.length,
    named: named.length,
    unnamed: real.length - named.length,
    placeholders: all.length - real.length,
    living: real.filter((p) => treatAsLiving(p, now)).length,
    deceased: deceased.length,
    sex: { m: real.filter((p) => p.sex === 'm').length, w: real.filter((p) => p.sex === 'w').length, other: real.filter((p) => p.sex !== 'm' && p.sex !== 'w').length },
    sources: doc.sources.length,
    media: doc.media.length,
    places: new Set(real.flatMap((p) => p.events.filter((e) => isActive(e.status)).map((e) => placeNames(e.place)[0]).filter(Boolean))).size,
    relations: { parentChild: doc.parentChild.filter((x) => isActive(x.status)).length, partnerships: doc.partnerships.filter((x) => isActive(x.status)).length, assertions: doc.assertions.filter((x) => isActive(x.status)).length },
    status,
    birthsByDecade,
    lifespan,
    givenNames: top(given),
    surnames: top(sur),
    birthPlaces: top(bp),
    generations,
    completeness: {
      base: named.length,
      deceasedBase: deceased.filter((p) => p.kind === 'benannt').length,
      birthDate: named.filter((p) => birthDate(p)?.y !== undefined).length,
      birthPlace: named.filter((p) => p.events.some((e) => e.type === 'geburt' && isActive(e.status) && e.place)).length,
      deathDateOfDeceased: named.filter((p) => isDeceased(p) && deathDate(p)?.y !== undefined).length,
      photo: named.filter((p) => !!p.photoMediaId).length,
      anySource: named.filter(anySource).length,
    },
  };
}
