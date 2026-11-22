import { describe, expect, it } from 'vitest';
import { addParentChild, addPartnership, blankPerson, name } from '../src/model/ops';
import { Index, nameOf } from '../src/model/queries';
import { addRelative, relationSex, suggestedSurname } from '../src/model/relatives';
import type { Sex, TreeDoc } from '../src/model/types';
import { emptyDoc } from '../src/model/types';

function base(): TreeDoc {
  const d = emptyDoc();
  const P = (id: string, given: string, sur: string, sex: Sex, birthName?: string) => {
    const p = blankPerson(id);
    p.sex = sex;
    p.names.push(name('vorname', given), name('nachname', sur));
    if (birthName) p.names.push(name('geburtsname', birthName));
    d.persons.push(p);
  };
  P('P001', 'Max', 'Muster', 'm');
  P('P002', 'Erika', 'Muster', 'w', 'Probe');
  P('P003', 'Otto', 'Muster', 'm');
  P('P004', 'Lisa', 'Einzel', 'w');
  addPartnership(d, 'P001', 'P002', 'verheiratet');
  addParentChild(d, 'P003', 'P001');
  return d;
}

describe('Person mit Beziehung anlegen', () => {
  it('Vorbelegungen: Geschlecht und Nachname', () => {
    const d = base();
    const idx = new Index(d);
    expect(relationSex('schwester')).toBe('w');
    expect(relationSex('partner', idx.person('P001'))).toBe('w');
    expect(suggestedSurname('bruder', idx.person('P002')!, idx)).toBe('Probe'); // Geburtsname der Schwester
    expect(suggestedSurname('tochter', idx.person('P002')!, idx)).toBe('Muster'); // Nachname des Vaters
  });

  it('Kind wird beiden Eltern zugeordnet', () => {
    const d = base();
    const r = addRelative(d, 'P001', 'tochter', { given: 'Mia', surname: 'Muster', sex: 'w' }, { otherParentId: 'P002' });
    const idx = new Index(d);
    expect(idx.parents(r.person.id).sort()).toEqual(['P001', 'P002']);
    expect(r.expandDown).toEqual(['P001']);
  });

  it('Mutter ergänzen schlägt Paar mit vorhandenem Vater vor (abgeleitet)', () => {
    const d = base();
    const r = addRelative(d, 'P001', 'mutter', { given: 'Anna', sex: 'w' });
    const pa = d.partnerships.find((x) => [x.p1, x.p2].includes(r.person.id))!;
    expect([pa.p1, pa.p2]).toContain('P003');
    expect(pa.status).toBe('abgeleitet');
    expect(new Index(d).parents('P001').sort()).toEqual(['P003', r.person.id].sort());
  });

  it('Bruder teilt die vorhandenen Eltern', () => {
    const d = base();
    const r = addRelative(d, 'P001', 'bruder', { given: 'Paul', surname: 'Muster', sex: 'm' });
    const idx = new Index(d);
    expect(idx.parents(r.person.id)).toEqual(['P003']);
    expect(idx.siblings('P001').map((s) => s.id)).toEqual([r.person.id]);
  });

  it('Schwester ohne erfasste Eltern: Platzhalter-Eltern oder nur Geschwister-Aussage', () => {
    const d = base();
    const r = addRelative(d, 'P004', 'schwester', { given: 'Lena', surname: 'Einzel', sex: 'w' });
    const idx = new Index(d);
    const ph = idx.parents(r.person.id)[0];
    expect(idx.person(ph)!.kind).toBe('platzhalter');
    expect(idx.parents('P004')).toEqual([ph]);

    const d2 = base();
    const r2 = addRelative(d2, 'P004', 'schwester', { given: 'Lena', sex: 'w' }, { createPlaceholder: false });
    expect(d2.assertions.some((a) => a.kind === 'geschwister' && a.fromId === r2.person.id && a.toId === 'P004')).toBe(true);
    expect(new Index(d2).parents(r2.person.id)).toEqual([]);
  });

  it('Partner/in', () => {
    const d = base();
    const r = addRelative(d, 'P004', 'partner', { given: 'Tom', sex: 'm' }, { partnershipState: 'paar' });
    expect(d.partnerships.find((x) => x.p2 === r.person.id)!.state).toBe('paar');
    expect(nameOf(r.person, 'vorname')).toBe('Tom');
  });
});
