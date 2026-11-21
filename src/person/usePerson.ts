import { touch } from '../model/ops';
import type { Person, TreeDoc } from '../model/types';
import { update, useStore } from '../state/store';

/** Person lesen und mit Auto-Save ändern */
export function usePerson(id: string) {
  const person = useStore((s) => s.doc.persons.find((p) => p.id === id));
  const doc = useStore((s) => s.doc);
  const edit = (label: string, fn: (p: Person, d: TreeDoc) => void) =>
    update(`${id}: ${label}`, (d) => {
      const p = d.persons.find((x) => x.id === id);
      if (!p) return;
      fn(p, d);
      touch(p);
    });
  return { person, doc, edit };
}
