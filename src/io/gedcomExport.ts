import { formatGenDate } from '../model/dates';
import { Index, isActive, nameOf, namesOf, treatAsLiving } from '../model/queries';
import type { Citation, GenDate, ParentChild, Person, PersonEvent, Status, TreeDoc } from '../model/types';
import { STATUS_LABEL } from '../model/types';

/**
 * GEDCOM-Export (5.5.1 oder 7.0). Verlustbehaftet: Belegstatus wird als eigenes Feld `_STAT`
 * und als QUAY an Quellenzitaten mitgegeben, Historie, Recherche und Notizen bleiben draußen.
 * Die vollständige Sicherung bleibt stammbaum.json. Widerlegte Angaben werden nie exportiert.
 */

export type GedVersion = '5.5.1' | '7.0';

export interface GedExportOptions {
  version: GedVersion;
  anonymizeLiving: boolean;
  /** Platzhalter-Personen (unbekannte Eltern o. Ä.) mit ausgeben */
  includePlaceholders: boolean;
  /** Medienpfade für GEDZIP (nur Medien mit Datei) */
  withMedia: boolean;
  now?: Date;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function part(y?: number, m?: number, d?: number): string | undefined {
  if (y === undefined) return undefined;
  return [d, m ? MONTHS[m - 1] : undefined, y].filter((x) => x !== undefined).join(' ');
}

/** GenDate → GEDCOM-Datum; nicht Darstellbares wird als Datumsphrase übergeben, nie geglättet */
export function gedDate(g: GenDate | undefined, v: GedVersion): { date?: string; phrase?: string } {
  if (!g || g.qualifier === 'unbekannt') return g?.raw && g.raw !== 'unbekannt' ? { phrase: g.raw } : {};
  let main: string | undefined;
  if (g.y !== undefined) main = part(g.y, g.m, g.d);
  else if (g.yFrom !== undefined && g.yTo !== undefined) main = `BET ${g.yFrom} AND ${g.yTo}`;
  if (!main) return { phrase: g.raw }; // z. B. Tag und Monat ohne Jahr
  let s: string;
  switch (g.qualifier) {
    case 'etwa':
      s = main.startsWith('BET') ? main : `ABT ${main}`;
      break;
    case 'vor':
      s = `BEF ${main}`;
      break;
    case 'nach':
      s = `AFT ${main}`;
      break;
    case 'zwischen': {
      const b = part(g.y2, g.m2, g.d2);
      s = b ? `BET ${main} AND ${b}` : main;
      break;
    }
    default:
      s = main;
  }
  // Unsicherheit und Bemerkungen gehen als Phrase mit (5.5.1: "INT datum (text)")
  void v;
  const needsPhrase = g.uncertain || !!g.remark;
  return needsPhrase ? { date: s, phrase: formatGenDate(g) + (g.remark ? `; ${g.remark}` : '') } : { date: s };
}

const QUAY: Record<Status, string> = { belegt: '3', familienangabe: '1', abgeleitet: '1', unsicher: '0', widerlegt: '0' };

class Writer {
  lines: string[] = [];
  constructor(private v: GedVersion) {}
  line(level: number, tag: string, value?: string, xref?: string) {
    const head = `${level}${xref ? ` ${xref}` : ''} ${tag}`;
    if (value === undefined || value === '') return void this.lines.push(head);
    const parts = String(value).replace(/\r\n?/g, '\n').split('\n');
    parts.forEach((p, i) => {
      const chunks = this.v === '5.5.1' ? chunk(p, 200) : [p];
      chunks.forEach((c, j) => {
        if (i === 0 && j === 0) this.lines.push(`${head} ${c}`.trimEnd());
        else this.lines.push(`${level + 1} ${j === 0 ? 'CONT' : 'CONC'}${c ? ` ${c}` : ''}`);
      });
    });
  }
  text() {
    return this.lines.join('\r\n') + '\r\n';
  }
}

function chunk(s: string, n: number): string[] {
  if (s.length <= n) return [s];
  const out: string[] = [];
  let rest = s;
  while (rest.length > n) {
    // nicht vor einem Leerzeichen trennen (CONC würde es verschlucken)
    let cut = n;
    while (cut > 1 && rest[cut] === ' ') cut--;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  out.push(rest);
  return out;
}

const xr = (id: string) => `@${id.replace(/[^A-Za-z0-9_]/g, '_')}@`;

export interface GedExportResult {
  text: string;
  /** Medien, die in einem GEDZIP mitgepackt werden sollen */
  media: { id: string; file: string }[];
  counts: { persons: number; families: number; sources: number; media: number; anonymized: number };
}

export function buildGedcom(doc: TreeDoc, opt: GedExportOptions): GedExportResult {
  const v = opt.version;
  const idx = new Index(doc);
  const w = new Writer(v);
  const persons = [...idx.byId.values()].filter((p) => opt.includePlaceholders || p.kind !== 'platzhalter');
  const included = new Set(persons.map((p) => p.id));
  const anon = new Set(opt.anonymizeLiving ? persons.filter((p) => treatAsLiving(p, opt.now)).map((p) => p.id) : []);
  const now = opt.now ?? new Date();

  // ---------- Familien bilden ----------
  interface Fam {
    id: string;
    parents: string[];
    kids: { id: string; pc: ParentChild[] }[];
    partnership?: (typeof doc.partnerships)[number];
  }
  const fams: Fam[] = [];
  const famByKey = new Map<string, Fam>();
  let fn = 0;
  const famFor = (parents: string[]) => {
    const key = [...parents].sort().join('+');
    let f = famByKey.get(key);
    if (!f) {
      f = { id: `F${String(++fn).padStart(4, '0')}`, parents: [...parents].sort(), kids: [] };
      famByKey.set(key, f);
      fams.push(f);
    }
    return f;
  };
  for (const pa of doc.partnerships) {
    if (!isActive(pa.status) || !included.has(pa.p1) || !included.has(pa.p2)) continue;
    const f = famFor([pa.p1, pa.p2]);
    f.partnership ??= pa;
  }
  const pcs = doc.parentChild.filter((x) => isActive(x.status) && included.has(x.parentId) && included.has(x.childId));
  const byChild = new Map<string, ParentChild[]>();
  for (const x of pcs) (byChild.get(x.childId) ?? byChild.set(x.childId, []).get(x.childId)!).push(x);
  for (const [child, list] of byChild) {
    // leibliche Eltern in eine Familie, Adoptiv-/Pflege-/Stiefeltern je Art in eine weitere
    const byType = new Map<string, ParentChild[]>();
    for (const x of list) (byType.get(x.type) ?? byType.set(x.type, []).get(x.type)!).push(x);
    for (const group of byType.values()) {
      const parents = [...new Set(group.map((x) => x.parentId))];
      for (let i = 0; i < parents.length; i += 2) {
        const ps = parents.slice(i, i + 2);
        famFor(ps).kids.push({ id: child, pc: group.filter((x) => ps.includes(x.parentId)) });
      }
    }
  }
  const famc = new Map<string, { fam: Fam; pc: ParentChild[] }[]>();
  const fams_ = new Map<string, Fam[]>();
  for (const f of fams) {
    for (const p of f.parents) (fams_.get(p) ?? fams_.set(p, []).get(p)!).push(f);
    for (const k of f.kids) (famc.get(k.id) ?? famc.set(k.id, []).get(k.id)!).push({ fam: f, pc: k.pc });
  }

  // ---------- Kopf ----------
  w.line(0, 'HEAD');
  if (v === '7.0') {
    w.line(1, 'GEDC');
    w.line(2, 'VERS', '7.0');
    w.line(1, 'SOUR', 'STAMMBAUM_SEEHAFER');
    w.line(2, 'NAME', 'Stammbaum Seehafer');
    w.line(1, 'DATE', part(now.getFullYear(), now.getMonth() + 1, now.getDate()));
    w.line(1, 'SCHMA');
    w.line(2, 'TAG', '_STAT https://github.com/Ghibsy/stammbaum-seehafer/blob/main/docs/DATENFORMAT.md#belegstatus');
  } else {
    w.line(1, 'SOUR', 'STAMMBAUM_SEEHAFER');
    w.line(2, 'NAME', 'Stammbaum Seehafer');
    w.line(1, 'DATE', part(now.getFullYear(), now.getMonth() + 1, now.getDate()));
    w.line(1, 'GEDC');
    w.line(2, 'VERS', '5.5.1');
    w.line(2, 'FORM', 'LINEAGE-LINKED');
    w.line(1, 'CHAR', 'UTF-8');
  }
  w.line(1, 'NOTE', `Belegstatus je Angabe im Feld _STAT (${Object.values(STATUS_LABEL).slice(0, 4).join(', ')}).${anon.size ? ' Lebende Personen sind anonymisiert.' : ''}`);

  const cite = (level: number, cs: Citation[], st: Status) => {
    for (const c of cs) {
      if (!doc.sources.some((s) => s.id === c.sourceId)) continue;
      w.line(level, 'SOUR', xr(c.sourceId));
      if (c.detail) w.line(level + 1, 'PAGE', c.detail);
      w.line(level + 1, 'QUAY', QUAY[st]);
    }
  };
  const stat = (level: number, st: Status) => w.line(level, '_STAT', st);
  const dateLines = (level: number, g: GenDate | undefined) => {
    const d = gedDate(g, v);
    if (d.date) {
      w.line(level, 'DATE', d.date);
      if (d.phrase && v === '7.0') w.line(level + 1, 'PHRASE', d.phrase);
      if (d.phrase && v === '5.5.1') w.line(level, 'NOTE', `Datum laut Angabe: ${d.phrase}`);
    } else if (d.phrase) {
      if (v === '7.0') {
        w.line(level, 'DATE');
        w.line(level + 1, 'PHRASE', d.phrase);
      } else w.line(level, 'DATE', `(${d.phrase})`);
    }
  };

  // ---------- Personen ----------
  const EV: Partial<Record<PersonEvent['type'], string>> = { geburt: 'BIRT', tod: 'DEAT', bestattung: 'BURI', wohnort: 'RESI', taufe: 'BAPM', konfession: 'RELI', beruf: 'OCCU', ausbildung: 'EDUC' };
  const mediaOut: { id: string; file: string }[] = [];
  const usedMedia = new Set<string>();
  for (const p of persons) {
    w.line(0, 'INDI', undefined, xr(p.id));
    if (anon.has(p.id)) {
      w.line(1, 'NAME', 'Lebende Person //');
      w.line(1, 'SEX', sexOf(p, v));
      writeFamLinks(p.id);
      continue;
    }
    writeNames(p);
    w.line(1, 'SEX', sexOf(p, v));
    for (const e of p.events) {
      if (!isActive(e.status)) continue;
      const tag = EV[e.type] ?? 'EVEN';
      const val = e.type === 'beruf' || e.type === 'konfession' || e.type === 'ausbildung' ? e.label && e.label !== 'Beruf' ? e.label : e.place : e.type === 'tod' && !e.date && !e.place ? 'Y' : undefined;
      w.line(1, tag, val);
      if (tag === 'EVEN') w.line(2, 'TYPE', e.label || e.type);
      dateLines(2, e.date);
      const place = e.type === 'beruf' && val === e.place ? undefined : e.place;
      if (place) w.line(2, 'PLAC', place);
      if (e.address) w.line(2, 'ADDR', e.address);
      const notes = [e.note, e.placeStatus && e.placeStatus !== e.status ? `Ort: ${STATUS_LABEL[e.placeStatus]}` : '', e.announced ? 'nur angekündigt' : ''].filter(Boolean).join('\n');
      if (notes) w.line(2, 'NOTE', notes);
      cite(2, e.citations, e.status);
      stat(2, e.status);
    }
    for (const a of doc.assertions) {
      if (!isActive(a.status) || a.fromId !== p.id || !included.has(a.toId)) continue;
      w.line(1, 'ASSO', xr(a.toId));
      if (v === '7.0') {
        w.line(2, 'ROLE', 'OTHER');
        w.line(3, 'PHRASE', a.label);
      } else w.line(2, 'RELA', a.label);
      cite(2, a.citations, a.status);
      stat(2, a.status);
    }
    writeFamLinks(p.id);
    const notes = [p.kind === 'platzhalter' ? 'Platzhalter für eine unbekannte Person' : '', p.note ?? ''].filter(Boolean).join('\n\n');
    if (notes) w.line(1, 'NOTE', notes);
    if (p.obituary) w.line(1, 'NOTE', `Nachruf:\n${stripHtml(p.obituary)}`);
    for (const l of p.links) w.line(1, v === '7.0' ? 'EXID' : 'NOTE', v === '7.0' ? l : `Link: ${l}`);
    cite(1, p.citations, 'familienangabe');
    if (opt.withMedia) {
      for (const m of doc.media) {
        if (!m.file || !m.targets.some((t) => t.type === 'person' && t.id === p.id)) continue;
        w.line(1, 'OBJE', xr(m.id));
        usedMedia.add(m.id);
      }
    }
  }

  function writeNames(p: Person) {
    const given = nameOf(p, 'vorname') ?? '';
    const sur = nameOf(p, 'nachname');
    const birth = nameOf(p, 'geburtsname');
    const main = p.names.find((n) => n.type === 'vorname' && isActive(n.status)) ?? p.names.find((n) => isActive(n.status));
    const mainSur = sur ?? birth ?? '';
    const label = !given && !mainSur ? nameOf(p, 'platzhalter') ?? '' : given;
    w.line(1, 'NAME', `${label} /${mainSur}/`.trim());
    if (given) w.line(2, 'GIVN', given);
    if (mainSur) w.line(2, 'SURN', mainSur);
    const call = nameOf(p, 'rufname');
    if (call) w.line(2, 'NICK', call);
    if (sur && birth && sur !== birth) w.line(2, 'TYPE', v === '7.0' ? 'MARRIED' : 'married');
    if (main) {
      cite(2, main.citations, main.status);
      stat(2, main.status);
    }
    if (birth && sur && birth !== sur) {
      w.line(1, 'NAME', `${given} /${birth}/`.trim());
      w.line(2, 'TYPE', v === '7.0' ? 'BIRTH' : 'birth');
      const bn = p.names.find((n) => n.type === 'geburtsname' && isActive(n.status))!;
      cite(2, bn.citations, bn.status);
      stat(2, bn.status);
    }
    for (const alt of namesOf(p, 'variante')) {
      const sp = alt.trim().split(/\s+/);
      const last = sp.length > 1 ? sp.pop()! : '';
      w.line(1, 'NAME', `${sp.join(' ')} /${last}/`.trim());
      w.line(2, 'TYPE', v === '7.0' ? 'AKA' : 'aka');
    }
  }

  function writeFamLinks(id: string) {
    for (const { fam, pc } of famc.get(id) ?? []) {
      w.line(1, 'FAMC', xr(fam.id));
      const t = pc[0]?.type;
      const pedi = t === 'leiblich' ? 'BIRTH' : t === 'adoption' ? 'ADOPTED' : t === 'pflege' ? 'FOSTER' : t === 'stief' ? 'OTHER' : undefined;
      if (pedi && v === '7.0') {
        w.line(2, 'PEDI', pedi);
        if (pedi === 'OTHER') w.line(3, 'PHRASE', 'Stiefkind');
      } else if (pedi && pedi !== 'OTHER') w.line(2, 'PEDI', pedi.toLowerCase());
      else if (pedi) w.line(2, 'NOTE', 'Stiefkind');
      if (pc[0]) stat(2, pc[0].status);
    }
    for (const f of fams_.get(id) ?? []) w.line(1, 'FAMS', xr(f.id));
  }

  // ---------- Familien ----------
  for (const f of fams) {
    w.line(0, 'FAM', undefined, xr(f.id));
    const [a, b] = f.parents;
    const pa = a ? idx.person(a) : undefined;
    const pb = b ? idx.person(b) : undefined;
    let husb = pa;
    let wife = pb;
    if (pa && pb && (pa.sex === 'w' || pb.sex === 'm') && !(pa.sex === 'w' && pb.sex === 'w') && !(pa.sex === 'm' && pb.sex === 'm')) [husb, wife] = [pb, pa];
    if (pa && !pb && pa.sex === 'w') [husb, wife] = [undefined, pa];
    if (husb) w.line(1, 'HUSB', xr(husb.id));
    if (wife) w.line(1, 'WIFE', xr(wife.id));
    for (const k of f.kids) w.line(1, 'CHIL', xr(k.id));
    const ps = f.partnership;
    if (ps) {
      for (const e of ps.events) {
        if (!isActive(e.status) || e.didNotHappen) continue;
        const tag = e.type === 'heirat' ? 'MARR' : e.type === 'verlobung' ? 'ENGA' : e.type === 'scheidung' ? 'DIV' : 'EVEN';
        w.line(1, tag, !e.date && !e.place ? 'Y' : undefined);
        if (tag === 'EVEN') w.line(2, 'TYPE', e.type);
        if (e.form) w.line(2, 'TYPE', e.form);
        if (!anon.has(ps.p1) && !anon.has(ps.p2)) {
          dateLines(2, e.date);
          if (e.place) w.line(2, 'PLAC', e.place);
        }
        cite(2, e.citations, e.status);
        stat(2, e.status);
      }
      if (ps.state === 'verheiratet' && !ps.events.some((e) => e.type === 'heirat' && isActive(e.status))) w.line(1, 'MARR', 'Y');
      if ((ps.state === 'geschieden') && !ps.events.some((e) => e.type === 'scheidung' && isActive(e.status))) w.line(1, 'DIV', 'Y');
      if (ps.state === 'paar' || ps.state === 'getrennt') w.line(1, 'NOTE', ps.state === 'paar' ? 'Paar (nicht verheiratet)' : 'getrennt');
      if (ps.note && !anon.has(ps.p1) && !anon.has(ps.p2)) w.line(1, 'NOTE', ps.note);
      cite(1, ps.citations, ps.status);
      stat(1, ps.status);
    }
  }

  // ---------- Quellen ----------
  let nSources = 0;
  for (const s of doc.sources) {
    nSources++;
    w.line(0, 'SOUR', undefined, xr(s.id));
    w.line(1, 'TITL', s.title);
    if (s.author) w.line(1, 'AUTH', s.author);
    if (s.date) w.line(1, 'PUBL', s.date);
    const note = [s.type ? `Art: ${s.type}` : '', s.proves ? `Belegt: ${s.proves}` : '', s.access ?? '', v === '5.5.1' && s.url ? s.url : ''].filter(Boolean).join('\n');
    if (note) w.line(1, 'NOTE', note);
    if (v === '7.0' && s.url) w.line(1, 'NOTE', s.url);
  }

  // ---------- Medien ----------
  for (const m of doc.media) {
    if (!usedMedia.has(m.id) || !m.file) continue;
    mediaOut.push({ id: m.id, file: m.file });
    w.line(0, 'OBJE', undefined, xr(m.id));
    w.line(1, 'FILE', m.file);
    const ext = (m.file.split('.').pop() ?? 'jpg').toLowerCase();
    w.line(2, 'FORM', v === '7.0' ? m.mime || `image/${ext === 'jpg' ? 'jpeg' : ext}` : ext === 'jpeg' ? 'jpg' : ext);
    if (m.title) w.line(2, 'TITL', m.title);
  }
  w.line(0, 'TRLR');
  return { text: w.text(), media: mediaOut, counts: { persons: persons.length, families: fams.length, sources: nSources, media: mediaOut.length, anonymized: anon.size } };
}

function sexOf(p: Person, v: GedVersion) {
  return p.sex === 'm' ? 'M' : p.sex === 'w' ? 'F' : p.sex === 'd' && v === '7.0' ? 'X' : 'U';
}

function stripHtml(s: string) {
  return s
    .replace(/<\/(p|div|h\d|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
