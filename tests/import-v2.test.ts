import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { importWorkbook, sheetImages } from '../src/io/excelImport';
import { nameOf } from '../src/model/queries';

/** Synthetische Mappe im Aufbau vom 20.11.2026 („Familienchronik“) – erfundene Personen */
function sheet(title: string, rows: unknown[][]) {
  return XLSX.utils.aoa_to_sheet([[title], ['Arbeitsstand Test'], ['Hinweiszeile'], ...rows]);
}

function buildV2(): XLSX.WorkBook {
  const P = ['Person-ID', 'Name', 'Nachname', 'Vornamen', 'Geburtsname', 'Generation', 'Familienzweig', 'Rufname / Suchvarianten', 'Geburtsdatum', 'Geburt unvollständig', 'Geburtsort / Herkunft', 'Wohnort / Ortsbezug', 'Gestorben am', 'Tod unvollständig', 'Sterbeort', 'Bestattung / Grab', 'Eltern', 'Partner / frühere Ehe', 'Kinder', 'Beziehung zur Familie', 'Angabenstatus', 'Weitere Informationen', 'Quellen-IDs', 'Übermitteltes Profil', 'Bild-IDs', 'Was öffentlich belegt ist'];
  const persons = [
    P,
    ['P001', 'Max Otto Muster', 'Muster', 'Max Otto', '', 2, 'Kern', '', 27000, '', 'Neustadt', '', '', '', '', '', '', '', '', 'Sohn von Anna', 'Familienangabe', 'Notiz', 'Q01', '', '', ''],
    ['P003', 'Anna Muster', 'Muster', 'Anna', 'Łącka', 3, 'Kern', 'Ania', 7794, '', 'Musterstadt', '', 32915, '', 'Musterstadt', 'Friedhof Musterstadt; 7-A-1/23', '', '', '', 'Mutter von Max', 'Familienangabe; Grabsteinfoto bestätigt', '', 'Q01; Q02', 'https://example.org/anna', 'M001', 'Lebensdaten durch Grabregister'],
    ['U001', 'Unbekannter Sohn von Anna', '', 'Unbekannter Sohn von Anna', '', 2, 'Offen', '', '', '', '', '', '', '', '', '', '', '', '', 'Zweiter Sohn', 'Name offen', '', 'Q01', '', '', ''],
  ];
  const rel = [
    ['Beziehungs-ID', 'Von Person-ID', 'Von Name', 'Beziehung', 'Zu Person-ID', 'Zu Name', 'Status', 'Quellen-IDs', 'Erläuterung'],
    ['R001', 'P003', 'Anna', 'Elternteil von', 'P001', 'Max', 'Familienangabe', 'Q01; Q02', ''],
    ['R002', 'P003', 'Anna', 'Elternteil von', 'U001', 'Sohn', 'Abgeleitet / prüfen', 'Q01', 'nur abgeleitet'],
  ];
  const src = [
    ['Quellen-ID', 'Titel / Gegenstand', 'Urheber / Veröffentlichung', 'Früherer Stand', 'Neu geprüft am', 'Zugriff / Belegstatus', 'Personen-IDs', 'Original-URL', 'Aussage und Grenzen', 'Quelle öffnen'],
    ['Q01', 'Familiengespräch', 'Max Muster', 46310, '', 'Übernommen', 'P001; P003', '', 'Mündliche Angaben', ''],
    ['Q02', 'Grabregister Anna Muster', 'Friedhof', 46310, 46346, 'Register direkt geprüft', 'P003', 'https://example.org/alt', 'Grab', 'Öffnen'],
  ];
  const beleg = [
    ['Beleg-ID', 'Personen-IDs', 'Belegtes Merkmal', 'Aussage', 'Art des Nachweises', 'Quellen-IDs', 'Geprüft am', 'Grenze / offene Frage'],
    ['B001', 'P003', 'Lebensdaten', 'Anna Muster, 03.05.1921–11.02.1990.', 'Öffentlich direkt geprüft', 'Q02', 46346, 'Geburtsname nicht auf dem Stein'],
  ];
  const fragen = [
    ['Frage-ID', 'Personen-IDs', 'Thema', 'Stand', 'Bekannt', 'Vermutung / Möglichkeit', 'Was fehlt / Grenze', 'Nächster Schritt', 'Quellen-IDs', 'Antwort / neuer Fund'],
    ['O001', 'P001; P999', 'Herkunft Max', 'Offen', 'bekannt', 'vielleicht', 'Urkunde', 'Standesamt fragen', 'Q01', ''],
    ['O002', 'P003', 'Grab Anna', 'Erledigt', '', '', '', '', '', 'gefunden'],
  ];
  const recherche = [
    ['Recherche-ID', 'Stand der Prüfung', 'Einordnung', 'Person / Suchansatz', 'Zeitraum', 'Ort / Bestand', 'Ergebnis', 'Quellen-IDs', 'Einschränkung / Weiterarbeit'],
    ['F01', 46310, 'Übernommen', 'Willi Muster', '1901-1980', 'Neustadt', 'Fund', 'Q01', 'Nicht übernommen'],
    ['N01', 46346, 'Neu', 'Kirchenbuch', '', 'Burgdorf', 'Bestand', '', ''],
  ];
  const notizen = [
    ['Notiz-ID', 'Familie / Person', 'Thema', 'Familienangabe / Zusammenhang', 'Quellen-IDs', 'Einordnung'],
    ['H01', 'Familie', 'Herkunft', 'Erzählung', 'Q01', 'offen'],
  ];
  const links = [
    ['Link-ID', 'Personen-IDs', 'Quellen-ID', 'Art', 'Titel / Bezug', 'Vollständiger Link', 'Einordnung', 'Link öffnen'],
    ['L001', 'P003', 'Q02', 'Aktueller Registerlink', 'Grab', 'https://example.org/neu', 'neue Adresse', 'Öffnen'],
    ['L002', 'P001', '', 'Facebook-Profil', 'Max', 'https://example.org/max', '', 'Öffnen'],
    ['L003', 'P003', 'Q02', 'Aktuelle Suchabfrage', 'Suche', 'https://example.org/suche', '', 'Öffnen'],
    ['L004', 'P003', 'Q02', 'Bild / M001', 'Grabfoto', 'https://example.org/bild.jpg', '', 'Öffnen'],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet('Übersicht', [['Bestand', 1]]), 'Übersicht');
  XLSX.utils.book_append_sheet(wb, sheet('Personen', persons), 'Personen');
  XLSX.utils.book_append_sheet(wb, sheet('Beziehungen', rel), 'Beziehungen');
  XLSX.utils.book_append_sheet(wb, sheet('Offene Fragen', fragen), 'Offene Fragen');
  XLSX.utils.book_append_sheet(wb, sheet('Belege', beleg), 'Belege');
  XLSX.utils.book_append_sheet(wb, sheet('Recherche', recherche), 'Recherche');
  XLSX.utils.book_append_sheet(wb, sheet('Familiennotizen', notizen), 'Familiennotizen');
  XLSX.utils.book_append_sheet(wb, sheet('Quellen', src), 'Quellen');
  XLSX.utils.book_append_sheet(wb, sheet('Links', links), 'Links');
  return wb;
}

describe('Import der Mappe im Aufbau vom 20.11.2026', () => {
  const { doc, report } = importWorkbook(buildV2(), 'familienchronik.xlsx');
  const P = (id: string) => doc.persons.find((p) => p.id === id)!;

  it('erkennt den Aufbau', () => {
    expect(report.format).toContain('20.11.2026');
  });

  it('liest Nachname und Vornamen getrennt (nicht den ganzen Namen als Nachname)', () => {
    expect(nameOf(P('P001'), 'nachname')).toBe('Muster');
    expect(nameOf(P('P001'), 'vorname')).toBe('Max Otto');
    expect(nameOf(P('P003'), 'geburtsname')).toBe('Łącka');
    expect(P('U001').kind).toBe('unbenannt');
    expect(nameOf(P('U001'), 'platzhalter')).toBe('Unbekannter Sohn von Anna');
  });

  it('übernimmt Beziehungen mit eigenen Quellen und Beziehungs-ID', () => {
    expect(doc.parentChild).toHaveLength(2);
    const r1 = doc.parentChild.find((x) => x.childId === 'P001')!;
    expect(r1.citations.map((c) => c.sourceId)).toEqual(['Q01', 'Q02']);
    expect(r1.note).toContain('R001');
    expect(doc.parentChild.find((x) => x.childId === 'U001')!.status).toBe('abgeleitet');
  });

  it('Daten, Grab und „öffentlich belegt“', () => {
    const anna = P('P003');
    const birth = anna.events.find((e) => e.type === 'geburt')!;
    expect(birth.date).toMatchObject({ y: 1921, m: 5, d: 3 });
    expect(birth.status).toBe('belegt');
    expect(anna.events.find((e) => e.type === 'bestattung')).toMatchObject({ address: '7-A-1/23' });
    expect(anna.note).toContain('Öffentlich belegt: Lebensdaten durch Grabregister');
  });

  it('Belege, offene Fragen, Recherche, Notizen', () => {
    expect(doc.evidence).toHaveLength(1);
    expect(doc.evidence[0]).toMatchObject({ id: 'B001', personIds: ['P003'], sourceIds: ['Q02'], checkedAt: '20.11.2026' });
    expect(doc.questions.map((q) => q.id)).toEqual(['O001', 'O002']);
    expect(doc.questions[0]).toMatchObject({ text: 'Herkunft Max', personIds: ['P001'], next: 'Standesamt fragen', done: false });
    expect(doc.questions[1].done).toBe(true);
    expect(doc.research.map((r) => r.id)).toEqual(['F01', 'N01']);
    expect(doc.research[0]).toMatchObject({ name: 'Willi Muster', status: 'Übernommen', checkedAt: '15.10.2026' });
    expect(doc.notes[0]).toMatchObject({ id: 'H01', area: 'Familie', text: 'Erzählung', open: 'offen' });
  });

  it('Quellen mit Prüfdatum und Links', () => {
    const q2 = doc.sources.find((s) => s.id === 'Q02')!;
    expect(q2).toMatchObject({ checkedAt: '20.11.2026', access: 'Register direkt geprüft', url: 'https://example.org/neu', previousUrls: ['https://example.org/alt'] });
    expect(q2.extraLinks?.[0]).toMatchObject({ kind: 'Aktuelle Suchabfrage', url: 'https://example.org/suche' });
    expect(doc.sources.find((s) => s.id === 'Q01')!.date).toBe('15.10.2026');
    expect(P('P001').links).toContain('https://example.org/max');
    // Bild ohne eingebettete Datei wird als Link-Medium angelegt und der Person zugeordnet
    const m1 = doc.media.find((m) => m.id === 'M001')!;
    expect(m1.url).toBe('https://example.org/bild.jpg');
    expect(m1.targets.some((t) => t.id === 'P003')).toBe(true);
  });
});

describe('Bilder aus Zeichnungen', () => {
  it('ordnet verankerte Bilder Zeile/Spalte zu', () => {
    const enc = (s: string) => ({ content: new TextEncoder().encode(s) });
    const files = {
      'xl/worksheets/_rels/sheet2.xml.rels': enc('<Relationships><Relationship Id="rId1" Target="../drawings/drawing1.xml"/></Relationships>'),
      'xl/drawings/drawing1.xml': enc(
        '<xdr:wsDr><xdr:oneCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:row>9</xdr:row></xdr:from><xdr:pic><xdr:blipFill><a:blip r:embed="R1"/></xdr:blipFill></xdr:pic></xdr:oneCellAnchor></xdr:wsDr>',
      ),
      'xl/drawings/_rels/drawing1.xml.rels': enc('<Relationships><Relationship Id="R1" Target="/xl/media/image.png"/></Relationships>'),
    };
    // mit Namensraum-Präfix wie in der echten Mappe
    const wbXml = '<x:workbook><x:sheets><x:sheet name="Personen" r:id="rId1"/><x:sheet name="Bilder" r:id="rId2"/></x:sheets></x:workbook>';
    const wbRels = '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>';
    expect(sheetImages(files, wbXml, wbRels, 'Bilder')).toEqual([{ row: 9, col: 1, path: 'xl/media/image.png' }]);
    expect(sheetImages(files, wbXml, wbRels, 'Personen')).toEqual([]);
  });
});
