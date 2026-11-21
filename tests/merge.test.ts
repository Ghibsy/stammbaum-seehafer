import { describe, expect, it } from 'vitest';
import { merge3 } from '../src/sync/merge';

const base = {
  persons: [
    { id: 'P001', note: 'a', names: [{ id: 'n1', value: 'Max' }] },
    { id: 'P002', note: 'b', names: [] },
  ],
  meta: { name: 'Baum' },
};

describe('merge3', () => {
  it('übernimmt Änderungen nur einer Seite', () => {
    const local = structuredClone(base);
    local.persons[0].note = 'lokal';
    const remote = structuredClone(base);
    remote.persons[1].note = 'remote';
    const { merged, conflicts } = merge3(base, local, remote);
    expect(conflicts).toEqual([]);
    expect(merged.persons[0].note).toBe('lokal');
    expect(merged.persons[1].note).toBe('remote');
  });

  it('führt neue Personen beider Seiten zusammen', () => {
    const local = structuredClone(base);
    local.persons.push({ id: 'P003', note: 'neu lokal', names: [] });
    const remote = structuredClone(base);
    remote.persons.push({ id: 'P004', note: 'neu remote', names: [] });
    const { merged, conflicts } = merge3(base, local, remote);
    expect(conflicts).toEqual([]);
    expect(merged.persons.map((p) => p.id)).toEqual(['P001', 'P002', 'P003', 'P004']);
  });

  it('meldet Konflikt bei gleichem Feld, nie still überschreiben', () => {
    const local = structuredClone(base);
    local.persons[0].names[0].value = 'Maximilian';
    const remote = structuredClone(base);
    remote.persons[0].names[0].value = 'Max Otto';
    const { conflicts, merged } = merge3(base, local, remote);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ path: 'persons[P001].names[n1].value', base: 'Max', local: 'Maximilian', remote: 'Max Otto' });
    expect(merged.persons[0].names[0].value).toBe('Maximilian');
  });

  it('löst Konflikt mit Entscheidung auf', () => {
    const local = structuredClone(base);
    local.persons[0].note = 'L';
    const remote = structuredClone(base);
    remote.persons[0].note = 'R';
    const { conflicts, merged } = merge3(base, local, remote, [{ path: 'persons[P001].note', choice: 'remote' }]);
    expect(conflicts).toEqual([]);
    expect(merged.persons[0].note).toBe('R');
  });

  it('gleiche Änderung auf beiden Seiten ist kein Konflikt', () => {
    const local = structuredClone(base);
    local.meta.name = 'Neu';
    const remote = structuredClone(base);
    remote.meta.name = 'Neu';
    expect(merge3(base, local, remote).conflicts).toEqual([]);
  });

  it('Löschen auf einer Seite, Ändern auf der anderen → Konflikt', () => {
    const local = structuredClone(base);
    local.persons = local.persons.filter((p) => p.id !== 'P002');
    const remote = structuredClone(base);
    remote.persons[1].note = 'geändert';
    const { conflicts } = merge3(base, local, remote);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].path).toBe('persons[P002]');
  });

  it('Löschen ohne Gegenänderung wird übernommen', () => {
    const local = structuredClone(base);
    const remote = structuredClone(base);
    remote.persons = remote.persons.filter((p) => p.id !== 'P002');
    const { merged, conflicts } = merge3(base, local, remote);
    expect(conflicts).toEqual([]);
    expect(merged.persons.map((p) => p.id)).toEqual(['P001']);
  });

  it('neue Felder beider Seiten am selben Objekt', () => {
    const local = structuredClone(base) as typeof base & { meta: { name: string; a?: string; b?: string } };
    local.meta.a = '1';
    const remote = structuredClone(base) as typeof local;
    remote.meta.b = '2';
    const { merged, conflicts } = merge3(base as typeof local, local, remote);
    expect(conflicts).toEqual([]);
    expect(merged.meta).toEqual({ name: 'Baum', a: '1', b: '2' });
  });
});
