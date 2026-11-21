import { useState } from 'react';
import { nextId } from '../model/ids';
import { displayName } from '../model/queries';
import { collator, normalize } from '../model/search';
import type { Source, SourceType, TreeDoc } from '../model/types';
import { SOURCE_TYPES } from '../model/types';
import { Thumb } from '../person/MediaTab';
import { update, useStore } from '../state/store';
import { Empty, Section, TextField } from '../ui/common';
import { back, go } from '../ui/router';

export function SourcesView({ id }: { id?: string }) {
  const doc = useStore((s) => s.doc);
  const [q, setQ] = useState('');
  const [type, setType] = useState<SourceType | ''>('');
  if (id) return <SourceDetail id={id} />;
  const list = doc.sources
    .filter((s) => !type || s.type === type)
    .filter((s) => !q || normalize(`${s.id} ${s.title} ${s.author ?? ''} ${s.proves ?? ''}`).includes(normalize(q)))
    .sort((a, b) => collator.compare(a.id, b.id));
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line bg-card p-3">
        <input className="field" type="search" placeholder="Quellen durchsuchen" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="field mt-2" value={type} onChange={(e) => setType(e.target.value as SourceType | '')}>
          <option value="">Alle Quellentypen</option>
          {SOURCE_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <div className="flex-1 overflow-y-auto p-3 pb-28">
        {list.length ? (
          <ul className="card divide-y divide-line">
            {list.map((s) => (
              <li key={s.id}>
                <button className="flex min-h-14 w-full items-start gap-3 p-3 text-left" onClick={() => go('quellen', s.id)}>
                  <span className="chip shrink-0 bg-moss-light text-moss">{s.id}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{s.title}</span>
                    <span className="block text-xs text-muted">
                      {s.type}
                      {s.date && ` · ${s.date}`}
                      {` · ${usage(doc, s.id)}× verwendet`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Keine Quellen.</Empty>
        )}
      </div>
      <button
        className="btn-primary fixed right-4 bottom-24 z-20 h-14 rounded-full px-5 shadow-lg"
        onClick={() => {
          let qid = '';
          update('Neue Quelle', (d) => {
            qid = nextId(d, 'Q');
            const now = new Date().toISOString();
            d.sources.push({ id: qid, title: 'Neue Quelle', type: 'Sonstiges', createdAt: now, updatedAt: now });
          });
          go('quellen', qid);
        }}
      >
        + Quelle
      </button>
    </div>
  );
}

function usage(doc: TreeDoc, sid: string) {
  return referencesOf(doc, sid).length;
}

function referencesOf(doc: TreeDoc, sid: string) {
  const out: { personId: string; what: string }[] = [];
  for (const p of doc.persons) {
    if (p.deletedAt) continue;
    if (p.citations.some((c) => c.sourceId === sid)) out.push({ personId: p.id, what: 'Person' });
    for (const n of p.names) if (n.citations.some((c) => c.sourceId === sid)) out.push({ personId: p.id, what: `Name ${n.value}` });
    for (const e of p.events) if (e.citations.some((c) => c.sourceId === sid)) out.push({ personId: p.id, what: e.type });
  }
  for (const x of doc.parentChild) if (x.citations.some((c) => c.sourceId === sid)) out.push({ personId: x.childId, what: `Eltern-Kind (${x.parentId})` });
  for (const x of doc.partnerships) if (x.citations.some((c) => c.sourceId === sid)) out.push({ personId: x.p1, what: `Partnerschaft (${x.p2})` });
  for (const x of doc.assertions) if (x.citations.some((c) => c.sourceId === sid)) out.push({ personId: x.fromId, what: x.label });
  return out;
}

function SourceDetail({ id }: { id: string }) {
  const doc = useStore((s) => s.doc);
  const s = doc.sources.find((x) => x.id === id);
  if (!s) return <Empty>Quelle {id} nicht gefunden.</Empty>;
  const edit = (fn: (x: Source) => void) =>
    update(`Quelle ${id}`, (d) => {
      const x = d.sources.find((y) => y.id === id)!;
      fn(x);
      x.updatedAt = new Date().toISOString();
    });
  const refs = referencesOf(doc, id);
  const media = doc.media.filter((m) => m.sourceId === id || m.targets.some((t) => t.type === 'source' && t.id === id));
  return (
    <div className="h-full overflow-y-auto p-4 pb-28">
      <button className="btn-ghost mb-3" onClick={() => back(['quellen'])}>
        ← Quellen
      </button>
      <h2 className="mb-4 font-serif text-xl">
        {s.id} · {s.title}
      </h2>
      <div className="grid gap-3">
        <TextField label="Titel" value={s.title} onCommit={(v) => edit((x) => (x.title = v))} />
        <label>
          <span className="label">Typ</span>
          <select className="field" value={s.type} onChange={(e) => edit((x) => (x.type = e.target.value as SourceType))}>
            {SOURCE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <TextField label="Herausgeber / Urheber / mitgeteilt von" value={s.author} onCommit={(v) => edit((x) => (x.author = v || undefined))} />
        <TextField label="Abgerufen / mitgeteilt am" value={s.date} onCommit={(v) => edit((x) => (x.date = v || undefined))} />
        <TextField label="URL" inputMode="url" value={s.url} onCommit={(v) => edit((x) => (x.url = v || undefined))} />
        {s.url && (
          <a className="text-sm text-moss underline" href={s.url} target="_blank" rel="noopener noreferrer">
            Link öffnen
          </a>
        )}
        {s.previousUrls?.length ? <p className="text-xs text-muted">Frühere URLs: {s.previousUrls.join(', ')}</p> : null}
        <TextField label="Was ist damit belegt?" multiline value={s.proves} onCommit={(v) => edit((x) => (x.proves = v || undefined))} />
      </div>
      {media.length > 0 && (
        <Section title="Medien">
          <div className="grid grid-cols-3 gap-2">
            {media.map((m) => (
              <Thumb key={m.id} m={m} />
            ))}
          </div>
        </Section>
      )}
      <Section title={`Verwendet bei (${refs.length})`}>
        {refs.length ? (
          <ul className="card divide-y divide-line text-sm">
            {refs.map((r, i) => {
              const p = doc.persons.find((x) => x.id === r.personId);
              return (
                <li key={i}>
                  <button className="min-h-11 w-full px-3 text-left" onClick={() => go('person', r.personId)}>
                    {p ? displayName(p) : r.personId} <span className="text-muted">· {r.what}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>Noch mit keiner Angabe verknüpft.</Empty>
        )}
      </Section>
    </div>
  );
}
