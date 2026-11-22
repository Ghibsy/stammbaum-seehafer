import { describe, expect, it } from 'vitest';
import { buildReadExport } from '../src/io/readExport';
import { parseGenDate } from '../src/model/dates';
import { addParentChild, addPartnership, blankPerson, name } from '../src/model/ops';
import { emptyDoc, type Sex } from '../src/model/types';

/** Erfundene Testfamilie */
function doc() {
  const d = emptyDoc('Familie Test');
  const P = (id: string, sex: Sex, given: string, birth: string, dead = true) => {
    const p = blankPerson(id);
    p.sex = sex;
    p.living = dead ? 'verstorben' : 'lebt';
    p.names.push(name('vorname', given), name('nachname', 'Muster'));
    p.events.push({ id: `b${id}`, type: 'geburt', date: parseGenDate(birth), place: 'Neustadt', status: 'familienangabe', citations: [], mediaIds: [] });
    d.persons.push(p);
    return p;
  };
  P('P001', 'm', 'Otto', '1900').obituary = '<p>Er war <b>Schmied</b>.</p><script>alert(1)</script>';
  P('P002', 'w', 'Anna', '1905');
  P('P003', 'w', 'Clara', '1990', false);
  addPartnership(d, 'P001', 'P002', 'verheiratet');
  addParentChild(d, 'P001', 'P003');
  addParentChild(d, 'P002', 'P003');
  d.chronicle.push({ id: 'k1', title: 'Neuanfang', period: '1950', html: '<p>Umzug</p>', personIds: ['P003'], order: 1, createdAt: '', updatedAt: '' });
  return d;
}
const strip = (h: string) => h.replace(/<script[\s\S]*?<\/script>/gi, '');

describe('Leseansicht (HTML)', () => {
  it('anonymisiert Lebende und enthält keine Skripte oder externen Quellen', () => {
    const r = buildReadExport(doc(), { living: 'anonym', rootId: 'P001', chronicle: true, obituaries: true, sources: false, sanitize: strip });
    expect(r.anonymized).toBe(1);
    expect(r.html).not.toContain('Clara');
    expect(r.html).not.toContain('1990');
    expect(r.html).toContain('Lebende Person');
    expect(r.html).toContain('Er war <b>Schmied</b>.');
    expect(r.html).not.toMatch(/<script/i);
    expect(r.html).not.toMatch(/(src|href)="https?:/i);
    expect(r.html).toContain('noindex');
    expect(r.html).toContain('<svg');
    expect(r.html).toContain('href="#P001"');
  });
  it('lässt Lebende samt sie betreffender Chronik-Kapitel weg', () => {
    const r = buildReadExport(doc(), { living: 'aus', rootId: 'P001', chronicle: true, obituaries: false, sources: false, sanitize: strip });
    expect(r.persons).toBe(2);
    expect(r.html).not.toContain('>Lebende Person<');
    expect(r.html).not.toContain('Clara');
    expect(r.html).not.toContain('Neuanfang');
    expect(r.html).not.toContain('Schmied');
  });
});
