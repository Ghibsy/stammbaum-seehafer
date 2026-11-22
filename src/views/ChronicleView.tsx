import { useState } from 'react';
import { uid } from '../model/ids';
import { displayName } from '../model/queries';
import { search } from '../model/search';
import { update, useStore } from '../state/store';
import { Empty, TextField } from '../ui/common';
import { RichTextEditor, RichTextView } from '../ui/RichText';
import { go } from '../ui/router';

/** Familienchronik: erzählende Kapitel mit Zeitraum, beteiligten Personen, Text und Fotos */
export function ChronicleView({ id }: { id?: string }) {
  const doc = useStore((s) => s.doc);
  const chapters = [...doc.chronicle].sort((a, b) => a.order - b.order);
  const current = chapters.find((c) => c.id === id);
  if (current) return <ChapterEdit id={current.id} />;

  const add = () => {
    const nid = uid('k');
    const t = new Date().toISOString();
    update('Chronik: neues Kapitel', (d) => d.chronicle.push({ id: nid, title: 'Neues Kapitel', html: '', personIds: [], order: (Math.max(0, ...d.chronicle.map((c) => c.order)) || 0) + 1, createdAt: t, updatedAt: t }));
    go('chronik', nid);
  };
  return (
    <div className="h-full overflow-y-auto p-4 pb-28">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex-1 font-serif text-xl">Familienchronik</h2>
        <button className="btn-primary" onClick={add}>
          + Kapitel
        </button>
      </div>
      {chapters.length === 0 ? (
        <Empty>Noch keine Kapitel. Eine Chronik erzählt die Familiengeschichte in eigenen Worten – etwa „Die Auswanderung“ oder „Der Neuanfang nach dem Krieg“.</Empty>
      ) : (
        <ol className="grid gap-3">
          {chapters.map((c, i) => (
            <li key={c.id} className="card p-3">
              <div className="flex items-start gap-2">
                <button className="flex-1 text-left" onClick={() => go('chronik', c.id)}>
                  <span className="block font-serif text-lg">{c.title}</span>
                  {c.period && <span className="block text-sm text-muted">{c.period}</span>}
                </button>
                <button className="btn-ghost min-h-9 min-w-9 px-0" disabled={i === 0} aria-label="nach oben" onClick={() => move(c.id, -1)}>
                  ↑
                </button>
                <button className="btn-ghost min-h-9 min-w-9 px-0" disabled={i === chapters.length - 1} aria-label="nach unten" onClick={() => move(c.id, 1)}>
                  ↓
                </button>
              </div>
              <RichTextView html={c.html} className="mt-2 line-clamp-4 text-sm" />
              {c.personIds.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {c.personIds.map((pid) => {
                    const p = doc.persons.find((x) => x.id === pid);
                    return (
                      <button key={pid} className="chip border border-line bg-card text-xs" onClick={() => go('person', pid)}>
                        {p ? displayName(p) : pid}
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function move(id: string, dir: -1 | 1) {
  update('Chronik: Reihenfolge', (d) => {
    const list = [...d.chronicle].sort((a, b) => a.order - b.order);
    const i = list.findIndex((c) => c.id === id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((c, k) => (c.order = k + 1));
  });
}

function ChapterEdit({ id }: { id: string }) {
  const doc = useStore((s) => s.doc);
  const c = doc.chronicle.find((x) => x.id === id)!;
  const [q, setQ] = useState('');
  const hits = q.length > 1 ? search(doc, q, 6).filter((h) => h.kind === 'person' && !c.personIds.includes(h.id)) : [];
  const edit = (label: string, fn: (x: typeof c) => void) =>
    update(label, (d) => {
      const x = d.chronicle.find((y) => y.id === id);
      if (!x) return;
      fn(x);
      x.updatedAt = new Date().toISOString();
    });
  return (
    <div className="h-full overflow-y-auto p-4 pb-28">
      <button className="btn-ghost mb-3" onClick={() => go('chronik')}>
        ← Alle Kapitel
      </button>
      <div className="grid gap-3">
        <TextField label="Titel" value={c.title} onCommit={(v) => edit('Chronik: Titel', (x) => (x.title = v.trim() || 'Ohne Titel'))} />
        <TextField label="Zeitraum" placeholder="z. B. 1945–1950 oder „um 1900“" value={c.period} onCommit={(v) => edit('Chronik: Zeitraum', (x) => (x.period = v.trim() || undefined))} />
        <div>
          <span className="label">Beteiligte Personen</span>
          <div className="mb-1 flex flex-wrap gap-1">
            {c.personIds.map((pid) => {
              const p = doc.persons.find((x) => x.id === pid);
              return (
                <span key={pid} className="chip border border-line bg-card">
                  {p ? displayName(p) : pid}
                  <button className="ml-1 text-muted" aria-label="entfernen" onClick={() => edit('Chronik: Person entfernt', (x) => (x.personIds = x.personIds.filter((y) => y !== pid)))}>
                    ×
                  </button>
                </span>
              );
            })}
          </div>
          <input className="field" placeholder="Person hinzufügen …" value={q} onChange={(e) => setQ(e.target.value)} />
          {hits.map((h) => (
            <button key={h.id} className="btn-ghost mt-1 w-full justify-between" onClick={() => (edit('Chronik: Person', (x) => x.personIds.push(h.id)), setQ(''))}>
              {h.title} <span className="text-xs text-muted">{h.id}</span>
            </button>
          ))}
        </div>
        <RichTextEditor value={c.html} onCommit={(html) => edit('Chronik: Text', (x) => (x.html = html))} placeholder="Erzähle, was in dieser Zeit geschah …" />
        <p className="text-xs text-muted">Bilder kommen aus den vorhandenen Medien. Neue Fotos zuerst bei einer Person hochladen.</p>
        <button
          className="btn-danger justify-self-start"
          onClick={() => {
            if (!confirm(`Kapitel „${c.title}“ löschen? (Rückgängig über ↶ möglich)`)) return;
            update('Chronik: Kapitel gelöscht', (d) => (d.chronicle = d.chronicle.filter((x) => x.id !== id)));
            go('chronik');
          }}
        >
          Kapitel löschen
        </button>
      </div>
    </div>
  );
}
