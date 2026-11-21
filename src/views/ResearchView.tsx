import { useState } from 'react';
import { nextId } from '../model/ids';
import { addPerson } from '../model/ops';
import { displayName } from '../model/queries';
import type { Research } from '../model/types';
import { update, useStore } from '../state/store';
import { Empty, Sheet, TextField } from '../ui/common';
import { go } from '../ui/router';

type Tab = 'recherche' | 'notizen' | 'fragen' | 'belege';

/** Recherche-Funde (noch nicht übernommen), Familiennotizen (Überlieferungen) und offene Fragen */
export function ResearchView({ tab = 'recherche', id }: { tab?: string; id?: string }) {
  const t = (tab === 'note' ? 'notizen' : tab === 'question' ? 'fragen' : tab === 'research' ? 'recherche' : tab) as Tab;
  return (
    <div className="flex h-full flex-col">
      <nav className="flex gap-2 overflow-x-auto border-b border-line bg-card p-3">
        {(
          [
            ['recherche', 'Recherche'],
            ['notizen', 'Familiennotizen'],
            ['fragen', 'Offene Fragen'],
            ['belege', 'Belege'],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} className={`chip min-h-9 border px-3 ${t === k ? 'border-moss bg-moss text-white' : 'border-line bg-card'}`} onClick={() => go('recherche', k)}>
            {l}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto p-3 pb-28">
        {t === 'recherche' && <ResearchList openId={id} />}
        {t === 'notizen' && <NotesList openId={id} />}
        {t === 'fragen' && <Questions openId={id} />}
        {t === 'belege' && <EvidenceList openId={id} />}
      </div>
    </div>
  );
}

function ResearchList({ openId }: { openId?: string }) {
  const doc = useStore((s) => s.doc);
  const [adopt, setAdopt] = useState<Research>();
  const edit = (rid: string, fn: (r: Research) => void) => update(`Recherche ${rid}`, (d) => fn(d.research.find((x) => x.id === rid)!));
  return (
    <>
      <div className="grid gap-3">
        {doc.research.map((r) => (
          <details key={r.id} className="card p-3" open={openId === r.id}>
            <summary className="flex min-h-11 cursor-pointer items-center gap-2">
              <span className="chip bg-amber-light text-amber">{r.id}</span>
              <span className="flex-1 font-medium">{r.name}</span>
              {r.adoptedAs && <span className="chip bg-moss-light text-moss">→ {r.adoptedAs}</span>}
            </summary>
            <div className="mt-3 grid gap-2">
              <TextField label="Name / Ansatz" value={r.name} onCommit={(v) => edit(r.id, (x) => (x.name = v))} />
              <TextField label="Zeitraum" value={r.period} onCommit={(v) => edit(r.id, (x) => (x.period = v || undefined))} />
              <TextField label="Ort" value={r.place} onCommit={(v) => edit(r.id, (x) => (x.place = v || undefined))} />
              <TextField label="Fund / nächster Ansatz" multiline value={r.finding} onCommit={(v) => edit(r.id, (x) => (x.finding = v || undefined))} />
              <TextField label="Abgrenzung" multiline value={r.delimitation} onCommit={(v) => edit(r.id, (x) => (x.delimitation = v || undefined))} />
              <TextField label="Quellen-IDs" value={r.sourceIds.join('; ')} onCommit={(v) => edit(r.id, (x) => (x.sourceIds = v.split(/[;,\s]+/).filter(Boolean)))} />
              {r.adoptedAs ? (
                <button className="btn-ghost" onClick={() => go('person', r.adoptedAs!)}>
                  Übernommene Person {r.adoptedAs} öffnen
                </button>
              ) : (
                <button className="btn-primary" onClick={() => setAdopt(r)}>
                  Als Person übernehmen …
                </button>
              )}
            </div>
          </details>
        ))}
        {!doc.research.length && <Empty>Keine Recherche-Einträge.</Empty>}
      </div>
      <button
        className="btn-primary fixed right-4 bottom-24 z-20 h-14 rounded-full px-5 shadow-lg"
        onClick={() =>
          update('Neuer Recherche-Eintrag', (d) => {
            d.research.push({ id: nextId(d, 'F'), name: 'Neuer Ansatz', sourceIds: [] });
          })
        }
      >
        + Eintrag
      </button>
      {adopt && <AdoptDialog r={adopt} onClose={() => setAdopt(undefined)} />}
    </>
  );
}

function AdoptDialog({ r, onClose }: { r: Research; onClose: () => void }) {
  const [given, setGiven] = useState('');
  const [surname, setSurname] = useState('');
  return (
    <Sheet
      title={`${r.id} als Person übernehmen`}
      onClose={onClose}
      actions={
        <button
          className="btn-primary"
          disabled={!given && !surname}
          onClick={() => {
            let pid = '';
            update(`${r.id} als Person übernommen`, (d) => {
              const p = addPerson(d, { given, surname, status: 'unsicher', tags: ['Offener Anschluss'] });
              p.note = [`Übernommen aus Recherche ${r.id}.`, r.finding, r.delimitation && `Abgrenzung: ${r.delimitation}`].filter(Boolean).join('\n');
              p.citations = r.sourceIds.map((sourceId) => ({ sourceId }));
              pid = p.id;
              d.research.find((x) => x.id === r.id)!.adoptedAs = pid;
            });
            onClose();
            go('person', pid);
          }}
        >
          Person anlegen
        </button>
      }
    >
      <p className="mb-3 text-sm text-muted">Die Person wird mit Status „unsicher/vorläufig“ und ohne Beziehungen angelegt. Verknüpfe sie danach bewusst in „Familie“. Der Recherche-Eintrag bleibt erhalten.</p>
      <div className="grid gap-2">
        <input className="field" placeholder="Vorname(n)" value={given} onChange={(e) => setGiven(e.target.value)} />
        <input className="field" placeholder="Nachname" value={surname} onChange={(e) => setSurname(e.target.value)} />
        <p className="text-xs text-muted">Aus dem Eintrag: „{r.name}“</p>
      </div>
    </Sheet>
  );
}

function NotesList({ openId }: { openId?: string }) {
  const doc = useStore((s) => s.doc);
  const edit = (nid: string, fn: (n: (typeof doc.notes)[number]) => void) => update(`Notiz ${nid}`, (d) => fn(d.notes.find((x) => x.id === nid)!));
  return (
    <>
      <div className="grid gap-3">
        {doc.notes.map((n) => (
          <details key={n.id} className="card p-3" open={openId === n.id}>
            <summary className="flex min-h-11 cursor-pointer items-center gap-2">
              <span className="chip bg-moss-light text-moss">{n.id}</span>
              <span className="flex-1 font-medium">
                {n.area} – {n.topic}
              </span>
            </summary>
            <div className="mt-3 grid gap-2">
              <TextField label="Bereich" value={n.area} onCommit={(v) => edit(n.id, (x) => (x.area = v || undefined))} />
              <TextField label="Thema" value={n.topic} onCommit={(v) => edit(n.id, (x) => (x.topic = v || undefined))} />
              <TextField label="Überlieferung" multiline value={n.text} onCommit={(v) => edit(n.id, (x) => (x.text = v))} />
              <TextField label="Offen / Einordnung" multiline value={n.open} onCommit={(v) => edit(n.id, (x) => (x.open = v || undefined))} />
              <TextField label="Quellen-IDs" value={n.sourceIds.join('; ')} onCommit={(v) => edit(n.id, (x) => (x.sourceIds = v.split(/[;,\s]+/).filter(Boolean)))} />
              {n.history?.length ? <p className="text-xs text-muted">{n.history.length} frühere Fassung(en) in der Historie gespeichert.</p> : null}
            </div>
          </details>
        ))}
        {!doc.notes.length && <Empty>Keine Familiennotizen.</Empty>}
      </div>
      <button className="btn-primary fixed right-4 bottom-24 z-20 h-14 rounded-full px-5 shadow-lg" onClick={() => update('Neue Familiennotiz', (d) => d.notes.push({ id: nextId(d, 'H'), text: '', sourceIds: [] }))}>
        + Notiz
      </button>
    </>
  );
}

function Questions({ openId }: { openId?: string }) {
  const doc = useStore((s) => s.doc);
  const [showDone, setShowDone] = useState(false);
  const list = doc.questions.filter((q) => showDone || !q.done);
  return (
    <>
      <label className="mb-3 flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> erledigte anzeigen
      </label>
      <ul className="grid gap-2">
        {list.map((q) => (
          <li key={q.id} className={`card p-3 ${openId === q.id ? 'border-moss' : ''}`}>
            <div className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={q.done} onChange={(e) => update(`Frage ${q.id}`, (d) => (d.questions.find((x) => x.id === q.id)!.done = e.target.checked))} />
              <div className="flex-1">
                <div className={`text-sm ${q.done ? 'text-muted line-through' : ''}`}>
                  <span className="mr-1 font-semibold">{q.id}</span>
                  {q.text}
                  {q.status && <span className="chip ml-2 bg-neutral text-muted">{q.status}</span>}
                </div>
                {(q.known || q.guess || q.missing || q.next || q.answer) && (
                  <details className="mt-1 text-sm">
                    <summary className="min-h-9 cursor-pointer text-muted">Details</summary>
                    <dl className="mt-1 grid gap-1">
                      {(
                        [
                          ['Bekannt', q.known],
                          ['Vermutung / Möglichkeit', q.guess],
                          ['Was fehlt / Grenze', q.missing],
                          ['Nächster Schritt', q.next],
                          ['Antwort / neuer Fund', q.answer],
                        ] as const
                      )
                        .filter(([, v]) => v)
                        .map(([k, v]) => (
                          <div key={k}>
                            <dt className="label mb-0">{k}</dt>
                            <dd>{v}</dd>
                          </div>
                        ))}
                      {q.sourceIds?.length ? <div className="text-xs text-muted">Quellen: {q.sourceIds.join(', ')}</div> : null}
                    </dl>
                  </details>
                )}
                <div className="mt-1 flex flex-wrap gap-1">
                  {q.personIds.map((pid) => {
                    const p = doc.persons.find((x) => x.id === pid);
                    return (
                      <button key={pid} className="chip min-h-8 border border-line bg-card" onClick={() => go('person', pid)}>
                        {p ? displayName(p) : pid}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </li>
        ))}
        {!list.length && <Empty>Keine offenen Fragen.</Empty>}
      </ul>
      <button
        className="btn-primary fixed right-4 bottom-24 z-20 h-14 rounded-full px-5 shadow-lg"
        onClick={() => {
          const text = prompt('Offene Frage:');
          if (text) update('Neue offene Frage', (d) => d.questions.push({ id: nextId(d, 'O'), text, personIds: [...new Set(text.match(/\b[PU]\d{3}\b/g) ?? [])], done: false }));
        }}
      >
        + Frage
      </button>
    </>
  );
}

/** Belege (B001 …): was eine Quelle konkret für welche Personen belegt */
function EvidenceList({ openId }: { openId?: string }) {
  const doc = useStore((s) => s.doc);
  if (!doc.evidence.length) return <Empty>Keine Belege. (Sie kommen aus dem Blatt „Belege“ der Arbeitsmappe vom 20.11.2026.)</Empty>;
  return (
    <ul className="grid gap-2">
      {doc.evidence.map((b) => (
        <li key={b.id} className={`card p-3 text-sm ${openId === b.id ? 'border-moss' : ''}`}>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="chip bg-moss text-white">{b.id}</span>
            <span className="font-medium">{b.feature}</span>
            {b.kind && <span className="chip bg-moss-light text-moss">{b.kind}</span>}
          </div>
          <p>{b.statement}</p>
          {b.limit && <p className="mt-1 text-xs text-amber">Grenze: {b.limit}</p>}
          <div className="mt-2 flex flex-wrap gap-1">
            {b.personIds.map((pid) => {
              const p = doc.persons.find((x) => x.id === pid);
              return (
                <button key={pid} className="chip min-h-8 border border-line bg-card" onClick={() => go('person', pid)}>
                  {p ? displayName(p) : pid}
                </button>
              );
            })}
            {b.sourceIds.map((sid) => (
              <button key={sid} className="chip min-h-8 border border-line bg-card" onClick={() => go('quellen', sid)}>
                📖 {sid}
              </button>
            ))}
          </div>
          {b.checkedAt && <div className="mt-1 text-xs text-muted">geprüft am {b.checkedAt}</div>}
        </li>
      ))}
    </ul>
  );
}
