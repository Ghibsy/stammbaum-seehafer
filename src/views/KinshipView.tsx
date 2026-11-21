import { useMemo, useState } from 'react';
import { formatDna, kinship } from '../model/kinship';
import { displayName } from '../model/queries';
import { search } from '../model/search';
import { useStore } from '../state/store';
import { go } from '../ui/router';

function PersonPicker({ label, value, onChange }: { label: string; value?: string; onChange: (id: string) => void }) {
  const doc = useStore((s) => s.doc);
  const [q, setQ] = useState('');
  const hits = q.length > 1 ? search(doc, q, 8).filter((h) => h.kind === 'person') : [];
  const p = doc.persons.find((x) => x.id === value);
  return (
    <div className="mb-3">
      <span className="label">{label}</span>
      {p && (
        <p className="mb-1 text-sm font-medium">
          {displayName(p)} ({p.id})
        </p>
      )}
      <input className="field" placeholder={p ? 'andere Person suchen' : 'Name oder ID suchen'} value={q} onChange={(e) => setQ(e.target.value)} />
      {hits.map((h) => (
        <button key={h.id} className="btn-ghost mt-1 w-full justify-between" onClick={() => (onChange(h.id), setQ(''))}>
          {h.title} <span className="text-xs text-muted">{h.id}</span>
        </button>
      ))}
    </div>
  );
}

/** Verwandtschaftsrechner: „B ist … von A“, geschätzter DNA-Anteil und Weg über die gemeinsamen Vorfahren */
export function KinshipPanel({ initialA, initialB }: { initialA?: string; initialB?: string }) {
  const doc = useStore((s) => s.doc);
  const [a, setA] = useState(initialA);
  const [b, setB] = useState(initialB);
  const r = useMemo(() => (a && b ? kinship(doc, a, b) : undefined), [doc, a, b]);
  const nm = (id: string) => {
    const p = doc.persons.find((x) => x.id === id);
    return p ? displayName(p) : id;
  };
  const top = r && r.kind === 'blut' && r.upA !== undefined ? r.path[r.upA] : undefined;
  return (
    <div>
      <PersonPicker label="Person A" value={a} onChange={setA} />
      <PersonPicker label="Person B" value={b} onChange={setB} />
      {r && a && b && (
        <div className="card p-4">
          <p className="text-sm text-muted">
            {nm(b)} ist für {nm(a)}:
          </p>
          <p className="my-1 font-serif text-2xl">{r.term}</p>
          {r.detail && <p className="text-sm">{r.detail}</p>}
          {r.dna !== undefined && <p className="mt-1 text-sm">Geschätzt gemeinsames Erbgut: {formatDna(r.dna)}</p>}
          {r.uncertain && (
            <ul className="mt-2 list-disc rounded-xl bg-amber-light p-3 pl-6 text-sm text-amber">
              {r.uncertainReasons.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          )}
          {r.path.length > 1 && (
            <div className="mt-4">
              <span className="label">Weg</span>
              <ol className="grid gap-1">
                {r.path.map((id, i) => (
                  <li key={id + i} className="flex items-center gap-2">
                    <span className="w-5 text-center text-muted">{i === 0 ? '' : r.kind === 'blut' && r.upA !== undefined ? (i <= r.upA ? '↑' : '↓') : '–'}</span>
                    <button className={`chip min-h-9 border px-3 ${id === top ? 'border-moss bg-moss-light text-moss' : 'border-line bg-card'}`} onClick={() => go('person', id)}>
                      {nm(id)}
                      {id === top ? ' · gemeinsamer Vorfahr' : ''}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <p className="mt-3 text-xs text-muted">Der DNA-Anteil ist ein Durchschnittswert aus der Verwandtschaftsformel (½ je Generationsschritt), keine genetische Messung.</p>
        </div>
      )}
    </div>
  );
}

export function KinshipView({ a, b }: { a?: string; b?: string }) {
  return (
    <div className="h-full overflow-y-auto p-4 pb-28">
      <h2 className="mb-3 font-serif text-xl">Verwandtschaft ermitteln</h2>
      <KinshipPanel initialA={a ?? 'P001'} initialB={b} />
    </div>
  );
}
