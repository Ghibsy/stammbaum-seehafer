import * as XLSX from 'xlsx';
import { formatGenDate } from '../model/dates';
import { displayName, eventOf, Index, isActive, nameOf, namesOf, treatAsLiving } from '../model/queries';
import type { GenDate, Status, TreeDoc } from '../model/types';
import { STATUS_LABEL } from '../model/types';

/**
 * Export im Spaltenschema der bisherigen Arbeitsmappe (Personen, Beziehungen, Quellen, Recherche,
 * Familiennotizen) plus Zusatzblätter für Belegstatus je Angabe und offene Fragen.
 * Widerlegte/zurückgenommene Angaben werden nie exportiert.
 */

export interface ExportOptions {
  anonymizeLiving: boolean;
  now?: Date;
}

const PERSON_HEADER = [
  'Person-ID',
  'Generation',
  'Familienzweig',
  'Name',
  'Vorname',
  'Geburtsname',
  'Rufname / Varianten',
  'Geburtsdatum exakt',
  'Geburt unvollständig / unsicher',
  'Geburtsort / Herkunft',
  'Wohnort / Adresse',
  'Gestorben am exakt',
  'Tod unvollständig / unsicher',
  'Sterbeort',
  'Bestattung',
  'Eltern (IDs und Namen)',
  'Partner (IDs und Namen)',
  'Kinder (IDs und Namen)',
  'Beziehung zu ...',
  'Stand der Angabe',
  'Weitere Informationen',
  'Quellen-IDs',
  'Profil / Link',
];

function serial(g: GenDate): number {
  return Date.UTC(g.y!, g.m! - 1, g.d!) / 86400000 + 25569;
}
const isFullExact = (g?: GenDate) => !!g && g.qualifier === 'exakt' && !g.uncertain && g.y !== undefined && g.m !== undefined && g.d !== undefined;

function title(rows: unknown[][], name: string, stand: string) {
  return [[], ['', name], ['', stand], [], [], ...rows];
}

export function buildWorkbook(doc: TreeDoc, opt: ExportOptions): XLSX.WorkBook {
  const idx = new Index(doc);
  const persons = doc.persons.filter((p) => !p.deletedAt);
  const anon = new Set(opt.anonymizeLiving ? persons.filter((p) => treatAsLiving(p, opt.now)).map((p) => p.id) : []);
  const label = (id: string) => {
    const p = idx.person(id);
    if (!p) return id;
    return `${id} ${anon.has(id) ? 'Lebende Person' : displayName(p)}`;
  };
  const qual = (s: Status) => (s === 'abgeleitet' || s === 'unsicher' ? ' (?)' : '');
  const stand = `Export vom ${(opt.now ?? new Date()).toLocaleDateString('de-DE')} aus der App „Stammbaum Seehafer“.${opt.anonymizeLiving ? ' Lebende Personen anonymisiert.' : ''}`;

  // ---------- Personen ----------
  const prow: unknown[][] = [PERSON_HEADER];
  const exactCells: { r: number; c: number }[] = [];
  for (const p of persons) {
    const birth = eventOf(p, 'geburt');
    const death = eventOf(p, 'tod');
    const origin = eventOf(p, 'herkunft');
    const burial = eventOf(p, 'bestattung');
    const res = p.events.filter((e) => e.type === 'wohnort' && isActive(e.status));
    const parents = doc.parentChild.filter((x) => x.childId === p.id && isActive(x.status) && idx.person(x.parentId));
    const kids = doc.parentChild.filter((x) => x.parentId === p.id && isActive(x.status) && idx.person(x.childId));
    const partners = doc.partnerships.filter((x) => (x.p1 === p.id || x.p2 === p.id) && isActive(x.status));
    const variants = p.names
      .filter((n) => (n.type === 'rufname' || n.type === 'variante') && isActive(n.status))
      .map((n) => (n.note ? `${n.value} (${n.note})` : n.value))
      .join('; ');
    const a = anon.has(p.id);
    const row: unknown[] = [
      p.id,
      p.legacy?.generation ?? '',
      p.tags.join('; '),
      nameOf(p, 'nachname') ?? '',
      a ? 'Lebende Person' : (namesOf(p, 'vorname').join(' ') || nameOf(p, 'platzhalter') || ''),
      a ? '' : nameOf(p, 'geburtsname') ?? '',
      a ? '' : variants,
      '',
      a ? '' : birth?.date && !isFullExact(birth.date) ? birth.date.raw || formatGenDate(birth.date) : '',
      a ? '' : birth?.place ?? origin?.place ?? '',
      a ? '' : res.map((e) => [e.place, e.address].filter(Boolean).join(', ')).join(' / '),
      '',
      a ? '' : death?.date && !isFullExact(death.date) ? death.date.raw || formatGenDate(death.date) : death && !death.date && p.living === 'verstorben' ? 'verstorben; Datum unbekannt' : '',
      a ? '' : death?.place ?? '',
      a ? '' : burial ? [burial.place, burial.address].filter(Boolean).join('; ') : '',
      parents.map((x) => label(x.parentId) + qual(x.status)).join(' / '),
      partners
        .map((x) => {
          const other = x.p1 === p.id ? x.p2 : x.p1;
          return label(other) + (x.state === 'geschieden' ? ' (geschieden)' : '') + qual(x.status);
        })
        .join(' / '),
      kids.map((x) => label(x.childId) + qual(x.status)).join(' / '),
      a ? '' : p.legacy?.beziehungsText ?? '',
      p.legacy?.standDerAngabe ?? '',
      a ? '' : p.note ?? '',
      p.citations.map((c) => c.sourceId).join('; '),
      a ? '' : p.links.join(' '),
    ];
    if (!a && isFullExact(birth?.date)) {
      row[7] = serial(birth!.date!);
      exactCells.push({ r: prow.length, c: 7 });
    }
    if (!a && isFullExact(death?.date)) {
      row[11] = serial(death!.date!);
      exactCells.push({ r: prow.length, c: 11 });
    }
    prow.push(row);
  }
  const wsP = XLSX.utils.aoa_to_sheet(title(prow, 'Personen', stand));
  for (const { r, c } of exactCells) {
    const ref = XLSX.utils.encode_cell({ r: r + 5, c });
    if (wsP[ref]) wsP[ref].z = 'dd.mm.yyyy';
  }

  // ---------- Beziehungen ----------
  const brow: unknown[][] = [['Von-ID', 'Von Person', 'Beziehung', 'Zu-ID', 'Zu Person', 'Beleg / Status', 'Hinweis']];
  const nm = (id: string) => label(id).replace(/^\S+\s/, '');
  for (const x of doc.parentChild) {
    if (!isActive(x.status) || !idx.person(x.parentId) || !idx.person(x.childId)) continue;
    brow.push([x.parentId, nm(x.parentId), x.type === 'leiblich' ? 'Elternteil von' : `Elternteil von (${x.type})`, x.childId, nm(x.childId), STATUS_LABEL[x.status], x.note ?? '']);
  }
  for (const x of doc.partnerships) {
    if (!isActive(x.status) || !idx.person(x.p1) || !idx.person(x.p2)) continue;
    brow.push([x.p1, nm(x.p1), x.state === 'geschieden' ? 'Geschiedene Ehe' : 'Ehe / Partnerschaft', x.p2, nm(x.p2), STATUS_LABEL[x.status], x.note ?? '']);
  }
  for (const x of doc.assertions) {
    if (!isActive(x.status) || !idx.person(x.fromId) || !idx.person(x.toId)) continue;
    brow.push([x.fromId, nm(x.fromId), x.label, x.toId, nm(x.toId), STATUS_LABEL[x.status], x.note ?? '']);
  }

  // ---------- Quellen / Recherche / Notizen ----------
  const qrow: unknown[][] = [['Quellen-ID', 'Quelle', 'Herausgeber / Urheber', 'Abgerufen / mitgeteilt', 'URL', 'Was ist damit belegt?', 'Quellentyp']];
  for (const s of doc.sources) qrow.push([s.id, s.title, s.author ?? s.partner ?? '', s.date ?? '', s.url ?? '', s.proves ?? '', s.type]);
  const rrow: unknown[][] = [['ID', 'Name / Ansatz', 'Zeitraum', 'Ort', 'Fund / nächster Ansatz', 'Quellen-ID', 'Abgrenzung', 'Übernommen als']];
  for (const r of doc.research) rrow.push([r.id, r.name, r.period ?? '', r.place ?? '', r.finding ?? '', r.sourceIds.join('; '), r.delimitation ?? '', r.adoptedAs ?? '']);
  const hrow: unknown[][] = [['ID', 'Bereich', 'Thema', 'Überlieferung', 'Quellen-IDs', 'Offen / Einordnung']];
  for (const n of doc.notes) hrow.push([n.id, n.area ?? '', n.topic ?? '', n.text, n.sourceIds.join('; '), n.open ?? '']);

  // ---------- Zusatz: Angaben mit Belegstatus ----------
  const arow: unknown[][] = [['Person-ID', 'Person', 'Angabe', 'Wert', 'Status', 'Quellen', 'Hinweis']];
  for (const p of persons) {
    if (anon.has(p.id)) continue;
    for (const n of p.names) if (isActive(n.status)) arow.push([p.id, displayName(p), n.type, n.value, STATUS_LABEL[n.status], n.citations.map((c) => c.sourceId).join('; '), n.note ?? '']);
    for (const e of p.events) {
      if (!isActive(e.status)) continue;
      const val = [formatGenDate(e.date), e.place, e.address].filter(Boolean).join(', ');
      arow.push([p.id, displayName(p), e.label ?? e.type, val, STATUS_LABEL[e.status] + (e.placeStatus && e.placeStatus !== e.status ? ` (Ort: ${STATUS_LABEL[e.placeStatus]})` : '') + (e.announced ? ' – nur angekündigt' : ''), e.citations.map((c) => c.sourceId).join('; '), e.note ?? '']);
    }
  }
  const orow: unknown[][] = [['Frage-ID', 'Personen-IDs', 'Thema', 'Stand', 'Bekannt', 'Vermutung / Möglichkeit', 'Was fehlt / Grenze', 'Nächster Schritt', 'Quellen-IDs', 'Antwort / neuer Fund', 'Erledigt']];
  for (const q of doc.questions) orow.push([q.id, q.personIds.join('; '), q.text, q.status ?? '', q.known ?? '', q.guess ?? '', q.missing ?? '', q.next ?? '', (q.sourceIds ?? []).join('; '), q.answer ?? '', q.done ? 'ja' : '']);
  const erow: unknown[][] = [['Beleg-ID', 'Personen-IDs', 'Belegtes Merkmal', 'Aussage', 'Art des Nachweises', 'Quellen-IDs', 'Geprüft am', 'Grenze / offene Frage']];
  for (const b of doc.evidence ?? []) {
    if (b.personIds.some((pid) => anon.has(pid))) continue;
    erow.push([b.id, b.personIds.join('; '), b.feature, b.statement, b.kind ?? '', b.sourceIds.join('; '), b.checkedAt ?? '', b.limit ?? '']);
  }
  const mrow: unknown[][] = [['Medien-ID', 'Titel', 'Datei / Link', 'Zugeordnet', 'Beschreibung']];
  for (const m of doc.media) mrow.push([m.id, m.title, m.file ?? m.url ?? '', m.targets.map((t) => t.id).join(', '), m.description ?? '']);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsP, 'Personen');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(title(brow, 'Beziehungen', stand)), 'Beziehungen');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(title(hrow, 'Familiennotizen', stand)), 'Familiennotizen');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(title(rrow, 'Recherche', stand)), 'Recherche');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(title(qrow, 'Quellen', stand)), 'Quellen');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(title(arow, 'Angaben mit Belegstatus', stand)), 'Angaben');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(title(orow, 'Offene Fragen', stand)), 'Offene Fragen');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(title(erow, 'Belege', stand)), 'Belege');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(title(mrow, 'Medien', stand)), 'Medien');
  return wb;
}

export function workbookToBytes(wb: XLSX.WorkBook): ArrayBuffer {
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

/** Dateiname nach Schema JJJJMMTT_Stammbaum_<Inhalt> */
export function exportFileName(content: string, ext: string, d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_Stammbaum_${content}.${ext}`;
}
