import * as XLSX from 'xlsx';

/** Synthetische Arbeitsmappe im Layout der echten Datei – erfundene Personen, keine Familiendaten. */
const P_HEAD = [
  'Person-ID', 'Generation', 'Familienzweig', 'Name', 'Vorname', 'Geburtsname', 'Rufname / Varianten',
  'Geburtsdatum exakt', 'Geburt unvollständig / unsicher', 'Geburtsort / Herkunft', 'Wohnort / Adresse',
  'Gestorben am exakt', 'Tod unvollständig / unsicher', 'Sterbeort', 'Bestattung',
  'Eltern (IDs und Namen)', 'Partner (IDs und Namen)', 'Kinder (IDs und Namen)', 'Beziehung zu ...',
  'Stand der Angabe', 'Weitere Informationen', 'Quellen-IDs', 'Profil / Link',
];

function sheet(title: string, rows: unknown[][]) {
  return XLSX.utils.aoa_to_sheet([[], ['', title], ['', 'Stand Test'], [], [], ...rows]);
}

// 03.05.1921 = 7794, 11.02.1990 = 32915, 02.12.1973 = 27000 (erfundene Testdaten)
export function buildFixture(): XLSX.WorkBook {
  const persons: unknown[][] = [
    P_HEAD,
    ['P001', '2', 'Kern', 'Muster', 'Max Otto', '', '', 27000, '', 'Neustadt', 'Musterstadt', '', '', '', '', '', '', '', 'Sohn von Anna; Ehemann von Berta', 'Familienangabe', 'Notiz', 'Q01', ''],
    ['P002', '2', 'Kern', 'Muster', 'Berta', 'Probe', '', '', '06.06., Jahr unbekannt', 'vermutlich Burgdorf', '', '', '', '', '', '', '', '', 'Ehefrau von Max', 'Familienangabe', '', 'Q01', 'https://example.org/b'],
    ['P003', '3', 'Kern', 'Muster', 'Anna', 'Łącka', 'Ania; Anna Łącka (polnische Suchform)', 7794, '', 'Musterstadt', '', 32915, '', 'Musterstadt', 'Friedhof Musterstadt; A / 1 / 23', '', '', '', 'Mutter von Max', 'Familienangabe; Grabstein bestätigt', '', 'Q01; Q02', ''],
    ['P004', '3', 'Kern', 'Muster', 'Karl', '', '', '', '', 'Ostpreußen (Herkunft, kein bestätigter Geburtsort)', '', '', 'vor 12.03.1971 verstorben', '', '', '', '', '', 'Bruder von Anna', 'Familienangabe', '', 'Q01', ''],
    ['P005', '3', 'Kern', 'Muster', 'Clara', '', '', '', '14.09.198x', '', '', '', 'etwa 05.09.1994; Erinnerung / Zuordnung prüfen', '', '', '', '', '', 'Schwester von Anna', 'Familienangabe', '', 'Q01', ''],
    ['U001', '2', 'Offen', '', 'Unbekannter Sohn von Anna', '', '', '', '', '', '', '', '', '', '', '', '', '', 'Zweiter Sohn', 'Name offen', '', 'Q01', ''],
    ['P006', '', 'Offen', 'Fern', 'Ewa', '', '', '', '', '', '', '', '', '', '', '', '', '', 'Laut Facebook als Cousine genannt', 'Familienangabe', '', 'Q01', ''],
    [],
    ['Weiterarbeiten', 'Hinweistext'],
  ];
  const rel: unknown[][] = [
    ['Von-ID', 'Von Person', 'Beziehung', 'Zu-ID', 'Zu Person', 'Beleg / Status', 'Hinweis'],
    ['P003', 'Anna', 'Elternteil von', 'P001', 'Max', 'Familienangabe', ''],
    ['P003', 'Anna', 'Elternteil von', 'U001', 'Sohn', 'Familienangabe', ''],
    ['P001', 'Max', 'Ehe / Partnerschaft', 'P002', 'Berta', 'Familienangabe', ''],
    ['P003', 'Anna', 'Geschwister von', 'P004', 'Karl', 'Familienangabe', ''],
    ['P003', 'Anna', 'Geschwister von', 'P005', 'Clara', 'Familienangabe', ''],
    ['P004', 'Karl', 'Vater von', 'P006', 'Ewa', 'Abgeleitet / prüfen', 'nur abgeleitet'],
    ['P006', 'Ewa', 'Als Cousine angegeben bei', 'P001', 'Max', 'Facebook-Angabe', ''],
    ['P006', 'Ewa', 'Enkel im Geschwisterzweig von', 'P003', 'Anna', 'Familienangabe', ''],
  ];
  const src: unknown[][] = [
    ['Quellen-ID', 'Quelle', 'Herausgeber / Urheber', 'Abgerufen / mitgeteilt', 'URL', 'Was ist damit belegt?'],
    ['Q01', 'Familiengespräch', 'Max Muster', '15.10.2026', '', 'Mündliche Angaben'],
    ['Q02', 'Grabregister Anna Muster', 'Friedhof', '15.10.2026', 'https://example.org/g', '03.05.1921–11.02.1990; A/1/23'],
    ['Q04', 'Telefonbuch', 'Verlag', '15.10.2026', '', 'Adresse'],
    ['Q13', 'Übermittelte Facebook-Links', 'Max', '15.10.2026', '', 'Profile'],
  ];
  const research: unknown[][] = [
    ['ID', 'Name / Ansatz', 'Zeitraum', 'Ort', 'Fund / nächster Ansatz', 'Quellen-ID', 'Abgrenzung'],
    ['F01', 'Willi Muster', '1901-1980', 'Neustadt', 'Fund', 'Q04', 'Nicht übernommen'],
    ['F03', 'Akte', '1817', 'Ort', 'Fund', 'Q04', ''],
  ];
  const notes: unknown[][] = [
    ['ID', 'Bereich', 'Thema', 'Überlieferung', 'Quellen-IDs', 'Offen / Einordnung'],
    ['H01', 'Familie', 'Herkunft', 'Erzählung', 'Q01', 'offen'],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet('Stammbaum', [['Grafik']]), 'Stammbaum');
  XLSX.utils.book_append_sheet(wb, sheet('Personen', persons), 'Personen');
  XLSX.utils.book_append_sheet(wb, sheet('Beziehungen', rel), 'Beziehungen');
  XLSX.utils.book_append_sheet(wb, sheet('Familiennotizen', notes), 'Familiennotizen');
  XLSX.utils.book_append_sheet(wb, sheet('Recherche', research), 'Recherche');
  XLSX.utils.book_append_sheet(wb, sheet('Quellen', src), 'Quellen');
  return wb;
}
