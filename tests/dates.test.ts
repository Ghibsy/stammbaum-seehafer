import { describe, expect, it } from 'vitest';
import { ageAt, excelSerialToParts, formatGenDate, parseGenDate, shortYear, sortKey, sortRange } from '../src/model/dates';

describe('parseGenDate', () => {
  it('exaktes Datum', () => {
    const g = parseGenDate('14.08.1912')!;
    expect(g).toMatchObject({ qualifier: 'exakt', y: 1912, m: 8, d: 14, uncertain: false });
    expect(formatGenDate(g)).toBe('14.08.1912');
  });
  it('„ca. 1930“', () => {
    const g = parseGenDate('ca. 1930')!;
    expect(g).toMatchObject({ qualifier: 'etwa', y: 1930 });
    expect(formatGenDate(g)).toBe('ca. 1930');
    expect(shortYear(g)).toBe('ca. 1930');
  });
  it('„etwa 1990“ und „um 1930“', () => {
    expect(parseGenDate('etwa 1990')).toMatchObject({ qualifier: 'etwa', y: 1990 });
    expect(parseGenDate('um 1930')).toMatchObject({ qualifier: 'etwa', y: 1930 });
  });
  it('„vor 1945“', () => {
    const g = parseGenDate('vor 1945')!;
    expect(g).toMatchObject({ qualifier: 'vor', y: 1945 });
    expect(formatGenDate(g)).toBe('vor 1945');
    const r = sortRange(g)!;
    expect(r[1]).toBeLessThan(19450101);
  });
  it('„vor 12.03.1971 verstorben“', () => {
    expect(parseGenDate('vor 12.03.1971 verstorben')).toMatchObject({ qualifier: 'vor', y: 1971, m: 3, d: 12 });
  });
  it('„05.09.1994?“ ist unsicher', () => {
    const g = parseGenDate('05.09.1994?')!;
    expect(g).toMatchObject({ qualifier: 'exakt', y: 1994, m: 9, d: 5, uncertain: true });
    expect(formatGenDate(g)).toBe('05.09.1994?');
  });
  it('„etwa 05.09.1994; Erinnerung / Zuordnung prüfen“ behält den Hinweis', () => {
    const g = parseGenDate('etwa 05.09.1994; Erinnerung / Zuordnung prüfen')!;
    expect(g).toMatchObject({ qualifier: 'etwa', y: 1994, m: 9, d: 5, remark: 'Erinnerung / Zuordnung prüfen' });
  });
  it('Tag und Monat ohne Jahr', () => {
    const g = parseGenDate('09.11., Jahr unbekannt')!;
    expect(g).toMatchObject({ qualifier: 'exakt', d: 9, m: 11 });
    expect(g.y).toBeUndefined();
    expect(formatGenDate(g)).toBe('09.11. (Jahr unbekannt)');
    expect(sortKey(g)).toBe(Number.MAX_SAFE_INTEGER);
  });
  it('„vermutlich 21.03., Jahr unbekannt“', () => {
    expect(parseGenDate('vermutlich 21.03., Jahr unbekannt')).toMatchObject({ d: 21, m: 3, uncertain: true });
  });
  it('„02.02., Jahr unbekannt; Zuordnung vorläufig“', () => {
    expect(parseGenDate('02.02., Jahr unbekannt; Zuordnung vorläufig')).toMatchObject({ d: 2, m: 2, remark: 'Zuordnung vorläufig' });
  });
  it('Jahrzehnt unsicher „14.09.198x“', () => {
    const g = parseGenDate('14.09.198x')!;
    expect(g).toMatchObject({ d: 14, m: 9, yFrom: 1980, yTo: 1989 });
    expect(formatGenDate(g)).toBe('14.09.198x');
  });
  it('zwischen … und …', () => {
    expect(parseGenDate('zwischen 1920 und 1925')).toMatchObject({ qualifier: 'zwischen', y: 1920, y2: 1925 });
    expect(parseGenDate('1901-1980')).toMatchObject({ qualifier: 'zwischen', y: 1901, y2: 1980 });
  });
  it('„verstorben; Datum unbekannt“', () => {
    expect(parseGenDate('verstorben; Datum unbekannt')).toMatchObject({ qualifier: 'unbekannt', remark: 'Datum unbekannt' });
  });
  it('erfindet nichts bei Unsinn', () => {
    const g = parseGenDate('irgendwann im Sommer')!;
    expect(g.qualifier).toBe('unbekannt');
    expect(g.y).toBeUndefined();
    expect(g.raw).toBe('irgendwann im Sommer');
  });
  it('ungültiger Monat wird nicht als Datum gelesen', () => {
    expect(parseGenDate('31.13.1990')!.qualifier).toBe('unbekannt');
  });
});

describe('Excel-Seriennummern', () => {
  it('rechnet korrekt um', () => {
    expect(excelSerialToParts(7794)).toEqual({ y: 1921, m: 5, d: 3 });
    expect(excelSerialToParts(37710)).toEqual({ y: 2003, m: 3, d: 30 });
    expect(excelSerialToParts(2865)).toEqual({ y: 1907, m: 11, d: 4 });
  });
});

describe('Alter', () => {
  it('exakt', () => {
    expect(ageAt(parseGenDate('14.08.1912'), parseGenDate('14.08.2002'))).toEqual({ min: 90, max: 90 });
    expect(ageAt(parseGenDate('14.08.1912'), parseGenDate('13.08.2002'))).toEqual({ min: 89, max: 89 });
  });
  it('ungefähr ergibt Spanne', () => {
    const a = ageAt(parseGenDate('ca. 1930'), parseGenDate('01.01.2000'))!;
    expect(a.min).toBeLessThan(a.max);
  });
  it('Jahrzehnt unsicher ergibt Spanne', () => {
    expect(ageAt(parseGenDate('14.09.198x'), new Date(2026, 10, 20))).toEqual({ min: 37, max: 46 });
  });
  it('„vor“ ergibt kein Alter', () => {
    expect(ageAt(parseGenDate('vor 1945'), parseGenDate('2000'))).toBeUndefined();
  });
});
