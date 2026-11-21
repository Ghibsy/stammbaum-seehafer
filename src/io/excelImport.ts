import type { WorkBook } from 'xlsx';
import * as XLSX from 'xlsx';
import { dateFromParts, excelSerialToParts, formatGenDate, parseGenDate } from '../model/dates';
import { uid } from '../model/ids';
import { blankPerson, name } from '../model/ops';
import type {
  AssertionKind,
  Citation,
  GenDate,
  NameEntry,
  PartnershipState,
  Person,
  PersonEvent,
  Sex,
  Source,
  SourceType,
  Status,
  TreeDoc,
} from '../model/types';
import { emptyDoc } from '../model/types';

/**
 * Einmaliger Import der bisherigen Excel-Arbeitsmappe (Blätter Personen, Beziehungen, Quellen,
 * Recherche, Familiennotizen). Grafische Blätter werden ignoriert.
 * Nichts wird erfunden: leere Felder bleiben leer, Unsicheres wird als unsicher markiert,
 * und alles, was heuristisch zugeordnet wurde, steht in der Prüfliste des Berichts.
 */

export interface ReviewItem {
  personId?: string;
  topic: string;
  text: string;
}

export interface PlaceholderProposal {
  key: string;
  memberIds: string[];
  label: string;
  reason: string;
}

export interface ImportReport {
  format?: string;
  file: string;
  createdAt: string;
  counts: Record<string, number>;
  unassignable: { id: string; reason: string }[];
  review: ReviewItem[];
  warnings: string[];
  placeholderProposals: PlaceholderProposal[];
}

export interface ImportResult {
  doc: TreeDoc;
  report: ImportReport;
  images: ImportedImage[];
}

type Row = Record<string, unknown>;

function cellText(v: unknown): string {
  if (v === undefined || v === null) return '';
  return String(v).replace(/\r\n?/g, '\n').trim();
}

/** Sucht die Kopfzeile (erste Zelle == headerFirst) und liefert die Datenzeilen als Objekte nach Spaltennamen */
function readTable(wb: WorkBook, sheetName: string, headerFirst: string | string[]): { rows: Row[]; after: unknown[][] } | undefined {
  const ws = wb.Sheets[sheetName];
  if (!ws) return undefined;
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' });
  const heads = Array.isArray(headerFirst) ? headerFirst : [headerFirst];
  const hi = aoa.findIndex((r) => heads.includes(cellText(r[0])));
  if (hi < 0) return undefined;
  const header = aoa[hi].map(cellText);
  const rows: Row[] = [];
  let end = hi + 1;
  for (; end < aoa.length; end++) {
    const r = aoa[end];
    const first = cellText(r[0]);
    if (!first) {
      if (r.every((c) => !cellText(c))) continue;
      break;
    }
    if (!/^[A-Z]\d+$/.test(first)) break;
    const o: Row = {};
    header.forEach((h, i) => {
      if (h) o[h] = r[i];
    });
    rows.push(o);
  }
  return { rows, after: aoa.slice(end) };
}

function col(row: Row, ...names: string[]): unknown {
  for (const n of names) {
    const key = Object.keys(row).find((k) => k.replace(/\s+/g, ' ').toLowerCase() === n.toLowerCase());
    if (key !== undefined && cellText(row[key]) !== '') return row[key];
  }
  return '';
}

const t = (row: Row, ...names: string[]) => cellText(col(row, ...names));

function splitIds(s: string): string[] {
  return [...s.matchAll(/\b([QPUFHM]\d{2,3})\b/g)].map((m) => m[1]);
}

const UNCERTAIN = /(vermutlich|möglicherweise|vorläufig|prüfen|\?|zu bestätigen|nach erinnerung|unsicher)/i;

function inferSourceType(title: string, author: string, proves = ''): SourceType {
  const s = `${title} ${author}`.toLowerCase();
  if (/foto/.test(title.toLowerCase())) return 'Foto';
  // Mündliche Mitteilungen vor Anzeigen – auch wenn sie eine Anzeige nur erwähnen
  if (/familiengespräch|im gespräch|familienergänzung|mitgeteilt/.test(`${s} ${proves.slice(0, 60).toLowerCase()}`)) return 'Familiengespräch';
  if (/grabregister|grabdatensatz|grabstein|friedhof/.test(s)) return /foto/.test(s) ? 'Foto' : 'Grabregister';
  if (/anzeige|gedenkseite|traueranzeige/.test(s)) return 'Anzeige';
  if (/kirchenb/.test(s)) return 'Kirchenbuch';
  if (/facebook/.test(s)) return 'Social Media';
  if (/bericht|\.docx/.test(s)) return 'Bericht';
  if (/archiv|akten|melderegister|bestände/.test(s)) return 'Archiv';
  if (/register|verzeichnis|ewidencja|telefonbuch|örtliche|aqua terapia|wykaz/.test(s)) return 'Register';
  return 'Website';
}

const WEAK_SOURCE: SourceType[] = ['Familiengespräch', 'Bericht', 'Social Media'];

function sexFromText(text: string): Sex {
  const m = text.match(/\b(Sohn|Ehemann|Vater|Bruder|Großvater|Enkel|Cousin|Onkel|Neffe|Tochter|Ehefrau|Frau|Mutter|Schwester|Großmutter|Enkelin|Cousine|Tante|Nichte)\b/);
  if (!m) return 'u';
  return /^(Sohn|Ehemann|Vater|Bruder|Großvater|Enkel|Cousin|Onkel|Neffe)$/.test(m[1]) ? 'm' : 'w';
}

/** "Rufname / Varianten" zerlegen. Ein einzelnes Wort ohne Zusatz gilt als Rufname, alles andere als Variante. */
function parseVariants(cell: string): NameEntry[] {
  if (!cell) return [];
  const out: NameEntry[] = [];
  for (const partRaw of cell.split(/\s*;\s*/)) {
    const part = partRaw.trim();
    if (!part) continue;
    const paren = part.match(/^(.*?)\s*\((.*)\)\s*$/);
    const value = (paren ? paren[1] : part).trim();
    const note = paren ? paren[2].trim() : undefined;
    if (!value) continue;
    const isCall = (!note && !/\s/.test(value)) || /^rufname$/i.test(note ?? '');
    out.push(name(isCall ? 'rufname' : 'variante', value, 'familienangabe', isCall && note ? undefined : note));
  }
  return out;
}

function exactDate(v: unknown): GenDate | undefined {
  if (typeof v === 'number' && v > 0) {
    const p = excelSerialToParts(v);
    return dateFromParts(p.y, p.m, p.d);
  }
  if (v instanceof Date) return dateFromParts(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  const s = cellText(v);
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(s)) return parseGenDate(s);
  return undefined;
}

function fmtDMY(g: GenDate) {
  return formatGenDate({ ...g, uncertain: false });
}

/** Datumszelle (Seriennummer oder Text) als TT.MM.JJJJ-Text; leer bleibt leer */
function cellDate(v: unknown): string | undefined {
  const g = exactDate(v);
  if (g) return fmtDMY(g);
  return cellText(v) || undefined;
}

function mapRelStatus(s: string): { status: Status; sourceId?: string } {
  const l = s.toLowerCase();
  if (/abgeleitet/.test(l)) return { status: 'abgeleitet' };
  if (/vermutung/.test(l)) return { status: 'unsicher' };
  if (/facebook/.test(l)) return { status: 'unsicher', sourceId: 'Q13' };
  if (/zum bericht/.test(l)) return { status: 'familienangabe', sourceId: 'Q21' };
  if (/familienangabe|bestätigt/.test(l)) return { status: 'familienangabe', sourceId: 'Q01' };
  return { status: 'unsicher' };
}

export function importWorkbook(wb: WorkBook, fileName = 'Excel'): ImportResult {
  const doc = emptyDoc();
  doc.meta.importedFrom = fileName;
  const report: ImportReport = {
    file: fileName,
    createdAt: new Date().toISOString(),
    counts: {},
    unassignable: [],
    review: [],
    warnings: [],
    placeholderProposals: [],
  };
  const now = new Date().toISOString();
  const srcIds = new Set<string>();

  // Aufbau erkennen: 15.10.2026 („Name“ = Nachname) oder 20.11.2026 („Nachname“ + „Vornamen“, Beziehungs-IDs)
  const v2 = !!readTable(wb, 'Beziehungen', 'Beziehungs-ID') || !!readTable(wb, 'Offene Fragen', 'Frage-ID');
  report.format = v2 ? 'Arbeitsmappe 20.11.2026 (Familienchronik)' : 'Arbeitsmappe 15.10.2026';

  // ---------- Quellen ----------
  const qt = readTable(wb, 'Quellen', 'Quellen-ID');
  if (!qt) report.warnings.push('Blatt „Quellen“ nicht gefunden.');
  for (const r of qt?.rows ?? []) {
    const id = t(r, 'Quellen-ID');
    const title = t(r, 'Quelle', 'Titel / Gegenstand');
    const author = t(r, 'Herausgeber / Urheber', 'Urheber / Veröffentlichung');
    const proves = t(r, 'Was ist damit belegt?', 'Aussage und Grenzen');
    const src: Source = {
      id,
      title,
      type: inferSourceType(title, author, proves),
      author: author || undefined,
      date: t(r, 'Abgerufen / mitgeteilt') || cellDate(col(r, 'Früherer Stand')),
      url: t(r, 'URL', 'Original-URL') || undefined,
      proves: proves || undefined,
      access: t(r, 'Zugriff / Belegstatus') || undefined,
      checkedAt: cellDate(col(r, 'Neu geprüft am')),
      personIds: splitIds(t(r, 'Personen-IDs')).filter((x) => /^[PU]/.test(x)),
      createdAt: now,
      updatedAt: now,
    };
    if (!src.personIds?.length) delete src.personIds;
    doc.sources.push(src);
    srcIds.add(id);
  }
  const srcById = new Map(doc.sources.map((s) => [s.id, s]));

  // ---------- Belege (nur neue Mappe) ----------
  const et = readTable(wb, 'Belege', 'Beleg-ID');
  for (const r of et?.rows ?? []) {
    doc.evidence.push({
      id: t(r, 'Beleg-ID'),
      personIds: splitIds(t(r, 'Personen-IDs')).filter((x) => /^[PU]/.test(x)),
      feature: t(r, 'Belegtes Merkmal'),
      statement: t(r, 'Aussage'),
      kind: t(r, 'Art des Nachweises') || undefined,
      sourceIds: splitIds(t(r, 'Quellen-IDs')).filter((x) => x.startsWith('Q')),
      checkedAt: cellDate(col(r, 'Geprüft am')),
      limit: t(r, 'Grenze / offene Frage') || undefined,
    });
  }

  // ---------- Personen ----------
  const pt = readTable(wb, 'Personen', 'Person-ID');
  if (!pt) throw new Error('Blatt „Personen“ mit Kopfzeile „Person-ID“ nicht gefunden.');
  for (const r of pt.rows) {
    const id = t(r, 'Person-ID');
    if (!/^[PU]\d+$/.test(id)) continue;
    // In der neuen Mappe ist „Name“ der ganze Name; Nachname und Vornamen stehen getrennt
    const surname = v2 ? t(r, 'Nachname') : t(r, 'Name', 'Nachname');
    const given = t(r, 'Vornamen', 'Vorname');
    const isU = id.startsWith('U');
    const unnamed = isU && !surname;
    const p: Person = blankPerson(id, unnamed ? 'unbenannt' : 'benannt');
    const relText = t(r, 'Beziehung zu ...', 'Beziehung zu …', 'Beziehung zu', 'Beziehung zur Familie');
    const stand = t(r, 'Stand der Angabe', 'Angabenstatus');
    p.legacy = { generation: t(r, 'Generation') || undefined, standDerAngabe: stand || undefined, beziehungsText: relText || undefined };
    p.tags = t(r, 'Familienzweig') ? [t(r, 'Familienzweig')] : [];
    const publicNote = t(r, 'Was öffentlich belegt ist');
    p.note = [t(r, 'Weitere Informationen'), publicNote && `Öffentlich belegt: ${publicNote}`].filter(Boolean).join('\n\n') || undefined;
    p.links = t(r, 'Profil / Link', 'Übermitteltes Profil').split(/\s+/).filter((x) => /^https?:\/\//.test(x));
    const cites: Citation[] = splitIds(t(r, 'Quellen-IDs')).map((sourceId) => ({ sourceId }));
    p.citations = cites;
    for (const c of cites) if (!srcIds.has(c.sourceId)) report.warnings.push(`${id}: Quelle ${c.sourceId} existiert nicht im Blatt Quellen.`);

    if (unnamed) p.names.push(name('platzhalter', given || id, 'familienangabe'));
    else {
      if (given) p.names.push(name('vorname', given));
      if (surname) p.names.push(name('nachname', surname));
    }
    const birthName = t(r, 'Geburtsname');
    if (birthName) p.names.push(name('geburtsname', birthName));
    const variants = parseVariants(t(r, 'Rufname / Varianten', 'Rufname / Suchvarianten'));
    p.names.push(...variants);
    if (variants.length)
      report.review.push({
        personId: id,
        topic: 'Namensvarianten',
        text: variants.map((v) => `${v.type === 'rufname' ? 'Rufname' : 'Variante'}: ${v.value}${v.note ? ` (${v.note})` : ''}`).join('; '),
      });

    p.sex = sexFromText(relText);
    if (p.sex !== 'u') report.review.push({ personId: id, topic: 'Geschlecht', text: `${p.sex === 'm' ? 'männlich' : 'weiblich'} – abgeleitet aus „${relText.split(';')[0]}“` });

    // Ereignisse
    const evt = (type: PersonEvent['type'], date: GenDate | undefined, place: string, status: Status): PersonEvent => ({
      id: uid('e'),
      type,
      date,
      place: place || undefined,
      status,
      citations: [],
      mediaIds: [],
    });
    const verifyExact = (g: GenDate, e: PersonEvent) => {
      const text = fmtDMY(g);
      const add = (sid: string) => {
        if (!e.citations.some((c) => c.sourceId === sid)) e.citations.push({ sourceId: sid });
      };
      for (const c of cites) {
        const s = srcById.get(c.sourceId);
        if (s && !WEAK_SOURCE.includes(s.type) && s.proves?.includes(text)) {
          e.status = 'belegt';
          add(s.id);
        }
      }
      // Belege der neuen Mappe: öffentlich geprüfte Aussage nennt genau dieses Datum
      for (const b of doc.evidence) {
        if (!b.personIds.includes(id) || !b.statement.includes(text) || !/öffentlich|direkt geprüft|register|anzeige/i.test(b.kind ?? '')) continue;
        const strong = b.sourceIds.filter((sid) => {
          const s = srcById.get(sid);
          return s && !WEAK_SOURCE.includes(s.type);
        });
        if (!strong.length) continue;
        e.status = 'belegt';
        strong.forEach(add);
      }
    };
    const placeStatusOf = (place: string): Status | undefined => (UNCERTAIN.test(place) ? 'unsicher' : undefined);

    // Geburt / Herkunft
    const bExact = exactDate(col(r, 'Geburtsdatum exakt', 'Geburtsdatum'));
    const bText = t(r, 'Geburt unvollständig / unsicher', 'Geburt unvollständig');
    const bPlace = t(r, 'Geburtsort / Herkunft');
    const isOrigin = /herkunft|ortsbezug/i.test(bPlace);
    if (bExact || bText || (bPlace && !isOrigin)) {
      const date = bExact ?? parseGenDate(bText);
      const e = evt('geburt', date, isOrigin ? '' : bPlace, bText && UNCERTAIN.test(bText) ? 'unsicher' : 'familienangabe');
      if (date?.remark) e.note = date.remark;
      if (bExact) verifyExact(bExact, e);
      if (!isOrigin && bPlace) e.placeStatus = placeStatusOf(bPlace);
      p.events.push(e);
      if (bText) report.review.push({ personId: id, topic: 'Geburtsdatum', text: `„${bText}“ → ${formatGenDate(date)}${date?.remark ? ` (Hinweis: ${date.remark})` : ''}` });
    }
    if (bPlace && isOrigin) {
      p.events.push({ ...evt('herkunft', undefined, bPlace, 'familienangabe'), placeStatus: placeStatusOf(bPlace) });
      report.review.push({ personId: id, topic: 'Ort', text: `„${bPlace}“ als Herkunft/Ortsbezug übernommen, nicht als Geburtsort` });
    }

    // Wohnort
    const res = t(r, 'Wohnort / Adresse', 'Wohnort / Ortsbezug');
    if (res) {
      const e = evt('wohnort', undefined, res, 'familienangabe');
      e.placeStatus = placeStatusOf(res);
      if (/geschäfts|register/i.test(res)) e.label = 'Geschäfts-/Registeradresse';
      p.events.push(e);
    }

    // Tod
    const dExact = exactDate(col(r, 'Gestorben am exakt', 'Gestorben am'));
    const dText = t(r, 'Tod unvollständig / unsicher', 'Tod unvollständig');
    const dPlace = t(r, 'Sterbeort');
    if (dExact || dText || dPlace) {
      const date = dExact ?? parseGenDate(dText);
      const e = evt('tod', date && date.qualifier === 'unbekannt' && !date.y ? undefined : date, dPlace, dText && UNCERTAIN.test(dText) ? 'unsicher' : 'familienangabe');
      const remark = date?.remark;
      if (remark) e.note = remark;
      if (dExact) verifyExact(dExact, e);
      if (dPlace) e.placeStatus = placeStatusOf(dPlace);
      p.events.push(e);
      p.living = 'verstorben';
      if (dText) report.review.push({ personId: id, topic: 'Sterbedatum', text: `„${dText}“ → ${date ? formatGenDate(date) : 'verstorben, Datum unbekannt'}${remark ? ` (Hinweis: ${remark})` : ''}` });
    }
    const burial = t(r, 'Bestattung', 'Bestattung / Grab');
    if (burial) {
      const m = burial.match(/^(.*?);\s*(.+)$/);
      const e = evt('bestattung', undefined, m ? m[1] : burial, UNCERTAIN.test(burial) ? 'unsicher' : 'familienangabe');
      if (m) e.address = m[2];
      p.events.push(e);
      p.living = 'verstorben';
    }

    if (stand && !/^(familienangabe|name offen)$/i.test(stand))
      report.review.push({ personId: id, topic: 'Belegstatus', text: `Stand „${stand}“ – bitte Status der einzelnen Angaben prüfen` });

    p.createdAt = now;
    p.updatedAt = now;
    doc.persons.push(p);
  }
  // Hinweisblock unter der Tabelle
  doc.meta.importNotes = (pt.after ?? [])
    .map((r) => [cellText(r[0]), cellText(r[1])].filter(Boolean).join(': '))
    .filter((s) => s.length > 2);

  const ids = new Set(doc.persons.map((p) => p.id));

  // ---------- Beziehungen ----------
  const bt = readTable(wb, 'Beziehungen', ['Von-ID', 'Beziehungs-ID']);
  if (!bt) report.warnings.push('Blatt „Beziehungen“ nicht gefunden.');
  const touched = new Set<string>();
  let nPc = 0;
  let nPa = 0;
  let nAs = 0;
  for (const r of bt?.rows ?? []) {
    const from = t(r, 'Von-ID', 'Von Person-ID');
    const to = t(r, 'Zu-ID', 'Zu Person-ID');
    const rel = t(r, 'Beziehung');
    const statusText = t(r, 'Beleg / Status', 'Status');
    const hint = t(r, 'Hinweis', 'Erläuterung');
    const relId = t(r, 'Beziehungs-ID');
    if (!ids.has(from) || !ids.has(to)) {
      report.unassignable.push({ id: `${relId || ''} ${from}→${to}`.trim(), reason: `Beziehung „${rel}“ verweist auf unbekannte ID` });
      continue;
    }
    touched.add(from);
    touched.add(to);
    const { status, sourceId } = mapRelStatus(statusText);
    // Neue Mappe: Quellen je Beziehung stehen in einer eigenen Spalte
    const ownSources = splitIds(t(r, 'Quellen-IDs')).filter((x) => x.startsWith('Q') && srcIds.has(x));
    const citations: Citation[] = ownSources.length ? ownSources.map((s) => ({ sourceId: s })) : sourceId && srcIds.has(sourceId) ? [{ sourceId }] : [];
    const note = [relId && `Excel ${relId}`, statusText && `Beleg/Status (Excel): ${statusText}`, hint].filter(Boolean).join(' – ') || undefined;
    const l = rel.toLowerCase();
    if (/^(elternteil von|mutter von|vater von)$/.test(l)) {
      doc.parentChild.push({ id: uid('pc'), parentId: from, childId: to, type: 'leiblich', status, citations, note });
      const par = doc.persons.find((p) => p.id === from)!;
      if (l === 'mutter von' && par.sex === 'u') par.sex = 'w';
      if (l === 'vater von' && par.sex === 'u') par.sex = 'm';
      nPc++;
    } else if (/ehe|partnerschaft|ehemann|ehefrau/.test(l)) {
      let state: PartnershipState = 'unbekannt';
      if (/geschieden/.test(l)) state = 'geschieden';
      else if (/ehemann|ehefrau/.test(l)) state = 'verheiratet';
      else {
        const a = doc.persons.find((p) => p.id === from)!;
        const b = doc.persons.find((p) => p.id === to)!;
        const txt = `${a.legacy?.beziehungsText ?? ''} ${b.legacy?.beziehungsText ?? ''}`;
        if (/ehe(frau|mann)/i.test(txt)) state = 'verheiratet';
        report.review.push({ personId: from, topic: 'Partnerschaft', text: `${from}–${to}: „${rel}“ → ${state === 'verheiratet' ? 'verheiratet (laut Beziehungstext Ehefrau/Ehemann)' : 'Art unbekannt'}` });
      }
      doc.partnerships.push({ id: uid('pa'), p1: from, p2: to, state, events: [], status, citations, note });
      nPa++;
    } else {
      let kind: AssertionKind = 'verwandt_grad_offen';
      if (/enkel im geschwisterzweig/.test(l)) kind = 'enkel_geschwisterzweig';
      else if (/großelternteil/.test(l)) kind = 'grosselternteil';
      else if (/angegeben bei/.test(l)) kind = 'angegeben';
      else if (/^(jüngeres |älteres )?geschwister von$|^schwester von$|^bruder von$/.test(l)) kind = 'geschwister';
      if (kind === 'verwandt_grad_offen' && !/verwandtschaft/.test(l)) report.warnings.push(`Unbekannte Beziehungsart „${rel}“ (${from}→${to}) als „Verwandtschaft, Grad offen“ übernommen.`);
      doc.assertions.push({ id: uid('as'), fromId: from, toId: to, kind, label: rel, status, citations, note });
      nAs++;
    }
  }
  for (const p of doc.persons) if (!touched.has(p.id)) report.unassignable.push({ id: p.id, reason: 'keine Beziehung erfasst – erscheint unter „Offener Anschluss“' });

  // ---------- Recherche ----------
  const rt = readTable(wb, 'Recherche', ['ID', 'Recherche-ID']);
  for (const r of rt?.rows ?? []) {
    doc.research.push({
      id: t(r, 'ID', 'Recherche-ID'),
      name: t(r, 'Name / Ansatz', 'Person / Suchansatz'),
      period: t(r, 'Zeitraum') || undefined,
      place: t(r, 'Ort', 'Ort / Bestand') || undefined,
      finding: t(r, 'Fund / nächster Ansatz', 'Ergebnis') || undefined,
      sourceIds: splitIds(t(r, 'Quellen-ID', 'Quellen-IDs')),
      delimitation: t(r, 'Abgrenzung', 'Einschränkung / Weiterarbeit') || undefined,
      status: t(r, 'Einordnung') || undefined,
      checkedAt: cellDate(col(r, 'Stand der Prüfung')),
    });
  }
  // ---------- Familiennotizen ----------
  const nt = readTable(wb, 'Familiennotizen', ['ID', 'Notiz-ID']);
  for (const r of nt?.rows ?? []) {
    doc.notes.push({
      id: t(r, 'ID', 'Notiz-ID'),
      area: t(r, 'Bereich', 'Familie / Person') || undefined,
      topic: t(r, 'Thema') || undefined,
      text: t(r, 'Überlieferung', 'Familienangabe / Zusammenhang'),
      sourceIds: splitIds(t(r, 'Quellen-IDs', 'Quellen-ID')),
      open: t(r, 'Offen / Einordnung', 'Einordnung') || undefined,
    });
  }
  // ---------- Offene Fragen (nur neue Mappe) ----------
  const ot = readTable(wb, 'Offene Fragen', 'Frage-ID');
  for (const r of ot?.rows ?? []) {
    const stand = t(r, 'Stand');
    doc.questions.push({
      id: t(r, 'Frage-ID'),
      text: t(r, 'Thema'),
      personIds: splitIds(t(r, 'Personen-IDs')).filter((x) => /^[PU]/.test(x) && ids.has(x)),
      done: /erledigt|geklärt|beantwortet/i.test(stand),
      status: stand || undefined,
      known: t(r, 'Bekannt') || undefined,
      guess: t(r, 'Vermutung / Möglichkeit') || undefined,
      missing: t(r, 'Was fehlt / Grenze') || undefined,
      next: t(r, 'Nächster Schritt') || undefined,
      answer: t(r, 'Antwort / neuer Fund') || undefined,
      sourceIds: splitIds(t(r, 'Quellen-IDs')).filter((x) => x.startsWith('Q')),
    });
  }
  // ---------- Bilder und Links (nur neue Mappe) ----------
  const images = extractImages(wb, report);
  for (const img of images) {
    doc.media.push({
      id: img.id,
      file: `medien/${img.id}.${img.ext}`,
      mime: img.mime,
      title: img.title,
      description: img.description,
      sourceId: img.sourceId,
      targets: [...(img.sourceId ? [{ type: 'source' as const, id: img.sourceId }] : []), ...img.personIds.filter((x) => ids.has(x)).map((x) => ({ type: 'person' as const, id: x }))],
      createdAt: now,
    });
  }
  const lt = readTable(wb, 'Links', 'Link-ID');
  for (const r of lt?.rows ?? []) {
    const url = t(r, 'Vollständiger Link');
    if (!/^https?:\/\//.test(url)) continue;
    const kind = t(r, 'Art');
    const title = t(r, 'Titel / Bezug');
    const note = t(r, 'Einordnung') || undefined;
    const pids = splitIds(t(r, 'Personen-IDs')).filter((x) => ids.has(x));
    const src = srcById.get(t(r, 'Quellen-ID'));
    const mediaId = kind.match(/Bild \/ (M\d{3})/)?.[1];
    if (/facebook|profil/i.test(kind) && !/kein personenprofil/i.test(kind)) {
      for (const pid of pids) {
        const p = doc.persons.find((x) => x.id === pid)!;
        if (!p.links.includes(url)) p.links.push(url);
      }
    } else if (mediaId) {
      const m = doc.media.find((x) => x.id === mediaId);
      if (m) m.url = url;
      else doc.media.push({ id: mediaId, url, mime: /\.pdf/i.test(url) ? 'application/pdf' : 'image/jpeg', title, description: note, sourceId: src?.id, targets: pids.map((x) => ({ type: 'person' as const, id: x })), createdAt: now });
    } else if (src) {
      if (/aktuell/i.test(kind) && /register/i.test(kind) && src.url !== url) {
        if (src.url) src.previousUrls = [...(src.previousUrls ?? []), src.url];
        src.url = url;
      } else if (src.url !== url && !src.previousUrls?.includes(url)) {
        src.extraLinks = [...(src.extraLinks ?? []), { kind, title: title || undefined, url, note }];
      }
    }
  }
  // Bild-IDs aus dem Personenblatt den Medien zuordnen
  for (const r of pt.rows) {
    const pid = t(r, 'Person-ID');
    for (const mid of splitIds(t(r, 'Bild-IDs')).filter((x) => x.startsWith('M'))) {
      const m = doc.media.find((x) => x.id === mid);
      if (m && !m.targets.some((x) => x.type === 'person' && x.id === pid)) m.targets.push({ type: 'person', id: pid });
    }
  }
  // Lücken in ID-Folgen melden (werden nicht neu vergeben)
  for (const [label, list, prefix] of [
    ['Recherche', doc.research.map((x) => x.id), 'F'],
    ['Quellen', doc.sources.map((x) => x.id), 'Q'],
    ['Familiennotizen', doc.notes.map((x) => x.id), 'H'],
  ] as const) {
    const nums = list.map((x) => +x.slice(1)).filter((n) => !isNaN(n)).sort((a, b) => a - b);
    for (let i = 1; i < nums.length; i++) for (let n = nums[i - 1] + 1; n < nums[i]; n++) report.warnings.push(`${label}: ID ${prefix}${String(n).padStart(2, '0')} fehlt in der Datei (Lücke, wird nicht neu vergeben).`);
  }

  report.placeholderProposals = proposePlaceholders(doc);
  report.counts = {
    Personen: doc.persons.length,
    'davon unbenannt (U)': doc.persons.filter((p) => p.kind === 'unbenannt').length,
    'Eltern-Kind': nPc,
    Partnerschaften: nPa,
    Verwandtschaftsaussagen: nAs,
    Quellen: doc.sources.length,
    Recherche: doc.research.length,
    Familiennotizen: doc.notes.length,
    ...(v2 ? { 'Offene Fragen': doc.questions.length, Belege: doc.evidence.length, 'Bilder (eingebettet)': images.length, 'Medien gesamt': doc.media.length } : {}),
    'Angaben dokumentarisch belegt': doc.persons.reduce((n, p) => n + p.events.filter((e) => e.status === 'belegt').length, 0),
  };
  return { doc, report, images };
}

export interface ImportedImage {
  id: string;
  ext: string;
  mime: string;
  bytes: Uint8Array;
  title: string;
  description?: string;
  sourceId?: string;
  personIds: string[];
}

type ZipFiles = Record<string, { content?: Uint8Array | string } | undefined>;

function fileText(files: ZipFiles, path: string): string | undefined {
  const f = files[path.replace(/^\//, '')];
  if (!f?.content) return undefined;
  return typeof f.content === 'string' ? f.content : new TextDecoder().decode(f.content);
}

function relTargets(xml: string | undefined): Map<string, string> {
  const m = new Map<string, string>();
  // Tags können ein Namensraum-Präfix tragen (z. B. <x:sheet>, <pr:Relationship>)
  for (const r of xml?.matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g) ?? []) {
    const id = r[0].match(/\bId="([^"]+)"/)?.[1];
    const target = r[0].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) m.set(id, target);
  }
  return m;
}

function resolvePath(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

/** Bilder, die in einem Blatt verankert sind: { row, col (0-basiert), path } */
export function sheetImages(files: ZipFiles, wbXml: string, wbRels: string, sheetName: string): { row: number; col: number; path: string }[] {
  const esc = sheetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sheetTag = wbXml.match(new RegExp(`<(?:\\w+:)?sheet\\b[^>]*name="${esc}"[^>]*>`))?.[0];
  const rid = sheetTag?.match(/\br:id="([^"]+)"/)?.[1];
  if (!rid) return [];
  const sheetPath = resolvePath('xl/workbook.xml', relTargets(wbRels).get(rid) ?? '');
  const sheetRelsPath = sheetPath.replace(/([^/]+)$/, '_rels/$1.rels');
  const drawingTarget = [...relTargets(fileText(files, sheetRelsPath)).values()].find((x) => /drawing/.test(x));
  if (!drawingTarget) return [];
  const drawingPath = resolvePath(sheetPath, drawingTarget);
  const drawing = fileText(files, drawingPath) ?? '';
  const dRels = relTargets(fileText(files, drawingPath.replace(/([^/]+)$/, '_rels/$1.rels')));
  const out: { row: number; col: number; path: string }[] = [];
  for (const a of drawing.matchAll(/<(?:\w+:)?(?:one|two)CellAnchor\b[\s\S]*?<\/(?:\w+:)?(?:one|two)CellAnchor>/g)) {
    const from = a[0].match(/<(?:\w+:)?from>([\s\S]*?)<\/(?:\w+:)?from>/)?.[1] ?? '';
    const col = +(from.match(/<(?:\w+:)?col>(\d+)<\/(?:\w+:)?col>/)?.[1] ?? NaN);
    const row = +(from.match(/<(?:\w+:)?row>(\d+)<\/(?:\w+:)?row>/)?.[1] ?? NaN);
    const embed = a[0].match(/r:embed="([^"]+)"/)?.[1];
    const target = embed && dRels.get(embed);
    if (target && !isNaN(col) && !isNaN(row)) out.push({ row, col, path: resolvePath(drawingPath, target) });
  }
  return out;
}

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

/**
 * Eingebettete Bilder der neuen Mappe: Blatt „Bilder“ (Beschriftung „M001  Titel“ über dem Bild,
 * darunter „Q15   P017; P018“ und eine Beschreibung) sowie das Poster im Blatt „Baumgrafik“ (M010).
 */
function extractImages(wb: WorkBook, report: ImportReport): ImportedImage[] {
  const files = (wb as unknown as { files?: ZipFiles }).files;
  if (!files) return [];
  const wbXml = fileText(files, 'xl/workbook.xml') ?? '';
  const wbRels = fileText(files, 'xl/_rels/workbook.xml.rels') ?? '';
  const out: ImportedImage[] = [];
  const bytesOf = (path: string) => {
    const c = files[path]?.content;
    return c instanceof Uint8Array ? c : undefined;
  };
  const ws = wb.Sheets['Bilder'];
  if (ws) {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' });
    const labels: { row: number; col: number; id: string; title: string }[] = [];
    aoa.forEach((r, ri) =>
      r.forEach((c, ci) => {
        const m = cellText(c).match(/^(M\d{3})\s+(.+)$/);
        if (m) labels.push({ row: ri, col: ci, id: m[1], title: m[2].trim() });
      }),
    );
    for (const img of sheetImages(files, wbXml, wbRels, 'Bilder')) {
      const label = labels.filter((l) => l.col === img.col && l.row < img.row).sort((a, b) => b.row - a.row)[0];
      const bytes = bytesOf(img.path);
      if (!label || !bytes) continue;
      const meta = cellText(aoa[label.row + 1]?.[label.col]);
      const desc = cellText(aoa[label.row + 2]?.[label.col]);
      const ext = (img.path.split('.').pop() ?? 'png').toLowerCase();
      out.push({
        id: label.id,
        ext,
        mime: MIME[ext] ?? 'application/octet-stream',
        bytes,
        title: label.title,
        description: desc || undefined,
        sourceId: meta.match(/\b(Q\d{2})\b/)?.[1],
        personIds: splitIds(meta).filter((x) => /^[PU]/.test(x)),
      });
    }
  }
  const poster = sheetImages(files, wbXml, wbRels, 'Baumgrafik')[0];
  if (poster && !out.some((x) => x.id === 'M010')) {
    const bytes = bytesOf(poster.path);
    const ext = (poster.path.split('.').pop() ?? 'png').toLowerCase();
    if (bytes) out.push({ id: 'M010', ext, mime: MIME[ext] ?? 'image/png', bytes, title: 'Historisches Namensposter 16.10.2026', sourceId: 'Q43', personIds: [] });
  }
  if (out.length) report.review.push({ topic: 'Bilder', text: out.map((x) => `${x.id} ${x.title}${x.sourceId ? ` (${x.sourceId})` : ''}`).join('; ') });
  return out;
}

/** Geschwistergruppen ohne bekannte Eltern → Vorschlag für Platzhalter-Eltern (einzeln freizugeben) */
export function proposePlaceholders(doc: TreeDoc): PlaceholderProposal[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    while (parent.get(x) !== x) {
      const p = parent.get(x)!;
      parent.set(x, parent.get(p)!);
      x = p;
    }
    return x;
  };
  const sib = doc.assertions.filter((a) => a.kind === 'geschwister' && a.status !== 'widerlegt' && a.status !== 'unsicher');
  for (const a of sib) {
    for (const x of [a.fromId, a.toId]) if (!parent.has(x)) parent.set(x, x);
    parent.set(find(a.fromId), find(a.toId));
  }
  const groups = new Map<string, string[]>();
  for (const x of parent.keys()) {
    const r = find(x);
    groups.set(r, [...(groups.get(r) ?? []), x]);
  }
  const hasParents = new Set(doc.parentChild.filter((x) => x.status !== 'widerlegt').map((x) => x.childId));
  const nameOfId = (id: string) => {
    const p = doc.persons.find((q) => q.id === id);
    const v = p?.names.find((n) => n.type === 'vorname')?.value ?? p?.names.find((n) => n.type === 'platzhalter')?.value ?? id;
    return `${v} (${id})`;
  };
  const out: PlaceholderProposal[] = [];
  for (const members of groups.values()) {
    members.sort();
    if (members.some((m) => hasParents.has(m))) continue;
    const names = members.map(nameOfId);
    out.push({
      key: members.join('+'),
      memberIds: members,
      label: `Eltern von ${names.map((n) => n.replace(/ \(.*\)$/, '')).slice(0, -1).join(', ')} und ${names[names.length - 1].replace(/ \(.*\)$/, '')}`,
      reason: `Geschwister ohne erfasste Eltern: ${names.join(', ')}`,
    });
  }
  return out;
}

export function readWorkbook(data: ArrayBuffer): WorkBook {
  return XLSX.read(data, { type: 'array', cellDates: false, bookFiles: true });
}

export function reportToMarkdown(r: ImportReport, decisions?: { placeholders: string[]; supplement: { id: string; choice: string; title: string }[] }): string {
  const lines: string[] = [];
  lines.push(`# Import-Bericht`, '', `Datei: ${r.file}  `, `Aufbau: ${r.format ?? 'unbekannt'}  `, `Erstellt: ${new Date(r.createdAt).toLocaleString('de-DE')}`, '');
  lines.push('## Übernommen', '', ...Object.entries(r.counts).map(([k, v]) => `- ${k}: ${v}`), '');
  if (decisions) {
    lines.push('## Entscheidungen', '');
    lines.push(`- Platzhalter-Eltern angelegt für: ${decisions.placeholders.length ? decisions.placeholders.join('; ') : 'keine'}`);
    for (const s of decisions.supplement) lines.push(`- ${s.id} ${s.title}: ${s.choice}`);
    lines.push('');
  }
  lines.push('## Nicht zuordenbar / ohne Anschluss', '', ...(r.unassignable.length ? r.unassignable.map((u) => `- ${u.id}: ${u.reason}`) : ['- keine']), '');
  lines.push('## Hinweise', '', ...(r.warnings.length ? r.warnings.map((w) => `- ${w}`) : ['- keine']), '');
  lines.push('## Prüfliste (heuristische Zuordnungen)', '');
  for (const i of r.review) lines.push(`- ${i.personId ? `${i.personId} · ` : ''}${i.topic}: ${i.text}`);
  return lines.join('\n');
}
