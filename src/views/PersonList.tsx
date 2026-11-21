import { useMemo, useState } from 'react';
import { formatGenDate } from '../model/dates';
import { addPerson } from '../model/ops';
import { birthDate, deathDate, displayName, Index } from '../model/queries';
import { collator, search } from '../model/search';
import type { Person } from '../model/types';
import { update, useStore } from '../state/store';
import { Empty, Sheet } from '../ui/common';
import { go } from '../ui/router';

type Filter = 'alle' | 'offen' | 'unbenannt' | 'dubletten' | 'ohneQuelle';
const FILTERS: [Filter, string][] = [
  ['alle', 'Alle'],
  ['offen', 'Offener Anschluss'],
  ['unbenannt', 'Unbenannt/Platzhalter'],
  ['dubletten', 'Mögliche Dubletten'],
  ['ohneQuelle', 'Ohne Quelle'],
];

export function PersonList() {
  const doc = useStore((s) => s.doc);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('alle');
  const [adding, setAdding] = useState(false);
  const idx = useMemo(() => new Index(doc), [doc]);

  const hits = q.trim() ? search(doc, q, 100) : [];
  const persons = useMemo(() => {
    let list = doc.persons.filter((p) => !p.deletedAt);
    const linked = new Set<string>();
    for (const x of doc.parentChild) linked.add(x.parentId).add(x.childId);
    for (const x of doc.partnerships) linked.add(x.p1).add(x.p2);
    const strongAssert = new Set<string>();
    for (const a of doc.assertions) if (a.kind === 'geschwister' || a.kind === 'grosselternteil') strongAssert.add(a.fromId).add(a.toId);
    const dup = new Set(doc.duplicates.filter((d) => d.verdict === 'moeglich').flatMap((d) => [d.a, d.b]));
    if (filter === 'offen') list = list.filter((p) => !linked.has(p.id) && !strongAssert.has(p.id));
    if (filter === 'unbenannt') list = list.filter((p) => p.kind !== 'benannt');
    if (filter === 'dubletten') list = list.filter((p) => dup.has(p.id));
    if (filter === 'ohneQuelle') list = list.filter((p) => !p.citations.length && !p.events.some((e) => e.citations.length));
    return list.sort((a, b) => collator.compare(sortName(a), sortName(b)));
  }, [doc, filter]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line bg-card p-3">
        <input className="field" type="search" placeholder="Name, Variante, Ort-Zweig oder ID (P017, Q02, F11 …)" value={q} onChange={(e) => setQ(e.target.value)} />
        {!q && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {FILTERS.map(([k, l]) => (
              <button key={k} className={`chip min-h-9 shrink-0 border px-3 ${filter === k ? 'border-moss bg-moss text-white' : 'border-line bg-card'}`} onClick={() => setFilter(k)}>
                {l}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3 pb-28">
        {q ? (
          hits.length ? (
            <ul className="card divide-y divide-line">
              {hits.map((h) => (
                <li key={h.kind + h.id}>
                  <button
                    className="flex min-h-14 w-full items-center gap-3 px-3 text-left"
                    onClick={() => (h.kind === 'person' ? go('person', h.id) : h.kind === 'source' ? go('quellen', h.id) : go('recherche', h.kind, h.id))}
                  >
                    <span className="chip bg-neutral text-muted">{{ person: 'Person', source: 'Quelle', research: 'Recherche', note: 'Notiz', question: 'Frage' }[h.kind]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{h.title}</span>
                      <span className="block text-xs text-muted">
                        {h.subtitle}
                        {h.via && ` · über ${h.via}`}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Keine Treffer.</Empty>
          )
        ) : persons.length ? (
          <ul className="card divide-y divide-line">
            {persons.map((p) => (
              <li key={p.id}>
                <button className="flex min-h-14 w-full items-center gap-3 px-3 text-left" onClick={() => go('person', p.id)}>
                  <span className={`h-3 w-3 shrink-0 rounded-full ${p.sex === 'm' ? 'bg-male-line' : p.sex === 'w' ? 'bg-female-line' : 'bg-line'}`} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-medium ${p.kind !== 'benannt' ? 'italic text-muted' : ''}`}>{displayName(p)}</span>
                    <span className="block text-xs text-muted">
                      {p.id}
                      {birthDate(p) && ` · *${formatGenDate(birthDate(p))}`}
                      {deathDate(p) && ` · †${formatGenDate(deathDate(p))}`}
                      {p.tags[0] && ` · ${p.tags[0]}`}
                    </span>
                  </span>
                  <span className="text-xs text-muted">{idx.parents(p.id).length === 0 && idx.partners(p.id).length === 0 && idx.children(p.id).length === 0 ? '○' : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>{doc.persons.length ? 'Keine Personen in diesem Filter.' : 'Noch keine Personen. Importiere deine Excel-Datei unter „Mehr“ oder lege eine Person an.'}</Empty>
        )}
      </div>
      <button className="btn-primary fixed right-4 bottom-24 z-20 h-14 rounded-full px-5 shadow-lg" onClick={() => setAdding(true)}>
        + Person
      </button>
      {adding && <NewPerson onClose={() => setAdding(false)} />}
    </div>
  );
}

function sortName(p: Person) {
  const sur = p.names.find((n) => n.type === 'nachname' && n.status !== 'widerlegt')?.value ?? '~';
  return `${sur} ${displayName(p)}`;
}

function NewPerson({ onClose }: { onClose: () => void }) {
  const [given, setGiven] = useState('');
  const [surname, setSurname] = useState('');
  const [placeholder, setPlaceholder] = useState('');
  return (
    <Sheet
      title="Neue Person"
      onClose={onClose}
      actions={
        <button
          className="btn-primary"
          disabled={!given && !surname && !placeholder}
          onClick={() => {
            let id = '';
            update('Neue Person', (d) => {
              id = addPerson(d, { given, surname, placeholder: !given && !surname ? placeholder : undefined }).id;
            });
            onClose();
            go('person', id);
          }}
        >
          Anlegen
        </button>
      }
    >
      <div className="grid gap-3">
        <input className="field" placeholder="Vorname(n)" value={given} onChange={(e) => setGiven(e.target.value)} autoFocus />
        <input className="field" placeholder="Nachname" value={surname} onChange={(e) => setSurname(e.target.value)} />
        {!given && !surname && <input className="field" placeholder="oder: Bezeichnung für unbenannte Person (erhält U-ID)" value={placeholder} onChange={(e) => setPlaceholder(e.target.value)} />}
        <p className="text-xs text-muted">Weitere Angaben, Eltern, Partner und Kinder ergänzt du danach in den Reitern der Person.</p>
      </div>
    </Sheet>
  );
}
