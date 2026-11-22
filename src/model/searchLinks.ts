import { birthDate, deathDate, isDeceased, nameOf } from './queries';
import type { Person } from './types';

/**
 * Suchlinks zu Online-Archiven – nur für Verstorbene, nur auf Klick (öffnet die Seite im neuen Tab).
 * Übergeben werden Vorname, Nachname und ggf. Geburts-/Sterbejahr; sonst nichts.
 */
export interface SearchLink {
  site: string;
  url: string;
  surname: string;
}

export function searchLinks(p: Person): SearchLink[] {
  if (!isDeceased(p) || p.kind !== 'benannt') return [];
  const given = nameOf(p, 'vorname')?.split(/\s+/)[0];
  if (!given) return [];
  const surnames = [...new Set([nameOf(p, 'geburtsname'), nameOf(p, 'nachname')].filter((x): x is string => !!x))];
  const by = birthDate(p)?.y;
  const dy = deathDate(p)?.y;
  const e = encodeURIComponent;
  const out: SearchLink[] = [];
  for (const sur of surnames) {
    const fs = new URLSearchParams({ 'q.givenName': given, 'q.surname': sur });
    if (by) (fs.set('q.birthLikeDate.from', String(by - 2)), fs.set('q.birthLikeDate.to', String(by + 2)));
    if (dy) (fs.set('q.deathLikeDate.from', String(dy - 2)), fs.set('q.deathLikeDate.to', String(dy + 2)));
    out.push({ site: 'FamilySearch', surname: sur, url: `https://www.familysearch.org/search/record/results?${fs}` });
    out.push({ site: 'MyHeritage', surname: sur, url: `https://www.myheritage.de/research?formId=master&formMode=1&action=query&qname=${e(`Name fn.${given} ln.${sur}`).replace(/%20/g, '+')}${by ? `&qevents-event1=${e(`Event et.birth ey.${by}`).replace(/%20/g, '+')}` : ''}` });
    out.push({ site: 'Ancestry', surname: sur, url: `https://www.ancestry.de/search/?name=${e(given)}_${e(sur)}${by ? `&birth=${by}` : ''}${dy ? `&death=${dy}` : ''}` });
    out.push({ site: 'WikiTree', surname: sur, url: `https://www.wikitree.com/index.php?title=Special:SearchPerson&wpFirst=${e(given)}&wpLast=${e(sur)}` });
    out.push({ site: 'Find a Grave', surname: sur, url: `https://www.findagrave.com/memorial/search?firstname=${e(given)}&lastname=${e(sur)}${by ? `&birthyear=${by}&birthyearfilter=2` : ''}${dy ? `&deathyear=${dy}&deathyearfilter=2` : ''}` });
  }
  return out;
}
