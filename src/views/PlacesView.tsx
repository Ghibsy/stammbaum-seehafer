import { lazy, Suspense, useMemo, useState } from 'react';
import { formatGenDate, shortYear } from '../model/dates';
import { collectPlaces, ensurePlace, mergePlaceInto, searchOsm, type OsmHit, type PlaceGroup } from '../model/places';
import { update, useStore } from '../state/store';
import { Empty, Sheet } from '../ui/common';
import { go } from '../ui/router';

const PlacesMap = lazy(() => import('./PlacesMap'));

/** Ortsverwaltung (Liste) und Karte. Koordinaten werden nur auf Knopfdruck bei OpenStreetMap gesucht. */
export function PlacesView({ tab = 'liste' }: { tab?: string }) {
  const doc = useStore((s) => s.doc);
  const groups = useMemo(() => collectPlaces(doc), [doc]);
  const [open, setOpen] = useState<string>();
  const [q, setQ] = useState('');
  const current = groups.find((g) => g.key === open);
  const withCoords = groups.filter((g) => g.place?.lat !== undefined).length;
  const shown = groups.filter((g) => !q || g.names.some((n) => n.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-2 border-b border-line bg-card p-2">
        <button className={`chip min-h-10 flex-1 justify-center ${tab !== 'karte' ? 'bg-moss text-white' : 'border border-line'}`} onClick={() => go('orte')}>
          Orte ({groups.length})
        </button>
        <button className={`chip min-h-10 flex-1 justify-center ${tab === 'karte' ? 'bg-moss text-white' : 'border border-line'}`} onClick={() => go('orte', 'karte')}>
          Karte ({withCoords})
        </button>
      </div>
      {tab === 'karte' ? (
        <div className="relative min-h-0 flex-1">
          {withCoords === 0 ? (
            <div className="p-4">
              <Empty>Noch kein Ort hat Koordinaten. Öffne in der Ortsliste einen Ort und tippe „Auf Karte suchen“.</Empty>
            </div>
          ) : (
            <Suspense fallback={<p className="p-4 text-muted">Lade Karte …</p>}>
              <PlacesMap groups={groups} onOpen={(k) => setOpen(k)} />
            </Suspense>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-28">
          <input className="field mb-3" type="search" placeholder="Ort suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
          <p className="mb-3 text-xs text-muted">Abgeleitet aus den Orten aller Angaben. Straßenadressen erscheinen hier nicht und werden nie an einen Kartendienst geschickt.</p>
          <ul className="card divide-y divide-line">
            {shown.map((g) => (
              <li key={g.key}>
                <button className="flex min-h-12 w-full items-center gap-2 p-3 text-left" onClick={() => setOpen(g.key)}>
                  <span className="flex-1">
                    <span className="font-semibold">{g.label}</span>
                    {g.names.length > 1 && <span className="text-sm text-muted"> · {g.names.filter((n) => n !== g.label).join(', ')}</span>}
                    <span className="block text-xs text-muted">
                      {g.uses.length} Angaben · {new Set(g.uses.map((u) => u.personId)).size} Personen
                    </span>
                  </span>
                  <span className="text-sm" title={g.place?.lat !== undefined ? 'hat Koordinaten' : 'ohne Koordinaten'}>
                    {g.place?.lat !== undefined ? '📍' : '○'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {current && <PlaceSheet g={current} all={groups} onClose={() => setOpen(undefined)} onMoved={(k) => setOpen(k)} />}
    </div>
  );
}

function PlaceSheet({ g, all, onClose, onMoved }: { g: PlaceGroup; all: PlaceGroup[]; onClose: () => void; onMoved: (key: string) => void }) {
  const [hits, setHits] = useState<OsmHit[]>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [newName, setNewName] = useState('');
  const [lat, setLat] = useState(g.place?.lat?.toString() ?? '');
  const [lon, setLon] = useState(g.place?.lon?.toString() ?? '');
  const [mergeKey, setMergeKey] = useState('');
  const placeId = (d: Parameters<typeof ensurePlace>[0]) => ensurePlace(d, g);
  const edit = (label: string, fn: (p: ReturnType<typeof ensurePlace>, d: Parameters<typeof ensurePlace>[0]) => void) => {
    let key = g.key;
    update(label, (d) => {
      const p = placeId(d);
      fn(p, d);
      p.updatedAt = new Date().toISOString();
      key = `place:${p.id}`;
    });
    if (key !== g.key) onMoved(key);
  };
  const search = async () => {
    setBusy(true);
    setErr(undefined);
    try {
      setHits(await searchOsm(g.place?.name ?? g.label));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const persons = [...new Map(g.uses.map((u) => [u.personId, u.personName])).entries()];

  return (
    <Sheet title={g.label} onClose={onClose}>
      <div className="grid gap-4 text-sm">
        <div>
          <div className="mb-1 font-semibold">Namen</div>
          <ul className="grid gap-1">
            {(g.names.length ? g.names : [g.label]).map((n, i) => (
              <li key={n} className="flex items-center gap-2">
                <span className="flex-1">
                  {n}
                  {i === 0 ? <span className="text-xs text-muted"> (Hauptname)</span> : <span className="text-xs text-muted"> (anderer/historischer Name)</span>}
                </span>
                {i > 0 && (
                  <>
                    <button className="btn-ghost min-h-9 px-2 text-xs" onClick={() => edit('Ort: Hauptname', (p) => ((p.altNames = [p.name, ...p.altNames.filter((x) => x !== n)]), (p.name = n)))}>
                      als Hauptname
                    </button>
                    <button className="btn-ghost min-h-9 px-2 text-xs" onClick={() => edit('Ort: Name entfernt', (p) => (p.altNames = p.altNames.filter((x) => x !== n)))} aria-label={`${n} entfernen`}>
                      ×
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input className="field flex-1" placeholder="weiterer Name, z. B. historisch: Breslau" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button className="btn-ghost" disabled={!newName.trim()} onClick={() => (edit('Ort: Name ergänzt', (p) => p.altNames.push(newName.trim())), setNewName(''))}>
              +
            </button>
          </div>
        </div>

        <div>
          <div className="mb-1 font-semibold">Lage</div>
          {g.place?.lat !== undefined ? (
            <p>
              📍 {g.place.lat.toFixed(4)}, {g.place.lon!.toFixed(4)} <span className="text-xs text-muted">({g.place.coordSource === 'OSM' ? `OpenStreetMap: ${g.place.osmLabel}` : 'von Hand'})</span>
            </p>
          ) : (
            <p className="text-muted">Noch keine Koordinaten.</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn-primary" disabled={busy || !navigator.onLine} onClick={() => void search()}>
              {busy ? 'Suche …' : 'Auf Karte suchen (OpenStreetMap)'}
            </button>
            {g.place?.lat !== undefined && (
              <button className="btn-ghost" onClick={() => go('orte', 'karte')}>
                Auf Karte zeigen
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">Dabei wird nur der Ortsname „{(g.place?.name ?? g.label).replace(/\s+bei\s+/i, ', ')}“ an OpenStreetMap gesendet.</p>
          {err && <p className="text-rust">{err}</p>}
          {hits && (
            <ul className="mt-2 grid gap-1">
              {hits.length === 0 && <li className="text-muted">Kein Treffer. Koordinaten ggf. unten von Hand eintragen.</li>}
              {hits.map((h, i) => (
                <li key={i}>
                  <button
                    className="btn-ghost w-full justify-start text-left text-xs"
                    onClick={() => {
                      edit('Ort: Koordinaten', (p) => Object.assign(p, { lat: h.lat, lon: h.lon, coordSource: 'OSM', osmLabel: h.label }));
                      setHits(undefined);
                    }}
                  >
                    {h.label} <span className="text-muted">({h.type})</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <details className="mt-2">
            <summary className="min-h-10 cursor-pointer text-muted">Koordinaten von Hand</summary>
            <div className="mt-1 flex gap-2">
              <input className="field" inputMode="decimal" placeholder="Breite, z. B. 54.036" value={lat} onChange={(e) => setLat(e.target.value)} />
              <input className="field" inputMode="decimal" placeholder="Länge, z. B. 19.038" value={lon} onChange={(e) => setLon(e.target.value)} />
              <button
                className="btn-ghost"
                disabled={!isFinite(parseFloat(lat.replace(',', '.'))) || !isFinite(parseFloat(lon.replace(',', '.')))}
                onClick={() => edit('Ort: Koordinaten', (p) => Object.assign(p, { lat: parseFloat(lat.replace(',', '.')), lon: parseFloat(lon.replace(',', '.')), coordSource: 'manuell', osmLabel: undefined }))}
              >
                OK
              </button>
            </div>
          </details>
        </div>

        <div>
          <div className="mb-1 font-semibold">Mit anderem Ort zusammenlegen</div>
          <div className="flex gap-2">
            <select className="field flex-1" value={mergeKey} onChange={(e) => setMergeKey(e.target.value)}>
              <option value="">derselbe Ort wie …</option>
              {all
                .filter((x) => x.key !== g.key)
                .map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.label} ({x.uses.length})
                  </option>
                ))}
            </select>
            <button
              className="btn-ghost"
              disabled={!mergeKey}
              onClick={() => {
                const other = all.find((x) => x.key === mergeKey)!;
                edit(`Ort zusammengelegt: ${other.label} → ${g.label}`, (p, d) => mergePlaceInto(d, p, other));
                setMergeKey('');
              }}
            >
              Zusammenlegen
            </button>
          </div>
          <p className="mt-1 text-xs text-muted">Die Angaben selbst bleiben unverändert; nur Liste und Karte führen beide Namen als einen Ort.</p>
        </div>

        <div>
          <div className="mb-1 font-semibold">Angaben ({g.uses.length})</div>
          {persons.length === 0 && <Empty>Keine Angabe nennt diesen Ort mehr.</Empty>}
          <ul className="grid gap-1">
            {g.uses.map((u, i) => (
              <li key={i}>
                <button className="w-full rounded-xl p-2 text-left hover:bg-card" onClick={() => go('person', u.personId)}>
                  <b>{u.personName}</b> · {u.what}
                  {u.date && ` ${shortYear(u.date) ? formatGenDate(u.date) : ''}`}
                  {u.raw !== g.label && <span className="block text-xs text-muted">„{u.raw}“</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Sheet>
  );
}

