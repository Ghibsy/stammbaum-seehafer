import { select } from 'd3-selection';
import { zoom, zoomIdentity, type ZoomBehavior } from 'd3-zoom';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { displayName, shortName } from '../model/queries';
import { search } from '../model/search';
import type { Status } from '../model/types';
import { AddRelativeSheet } from '../person/AddRelativeSheet';
import { useStore } from '../state/store';
import { Sheet } from '../ui/common';
import { go } from '../ui/router';
import { FanG } from './fan';
import { TILE_H, TILE_W, type Layout, type LNode } from './layout';
import { Tile } from './Tile';
import {
  buildView,
  collapseAll,
  MODE_LABEL,
  setTile,
  setView,
  TILE_SIZES,
  toggleDown,
  toggleUp,
  useExpand,
  useView,
  type ColorScheme,
  type LivingMode,
  type Spacing,
  type TileContent,
  type TileSize,
  type ViewMode,
} from './viewSettings';

export { Tile };

const dashed = (s: Status) => s === 'abgeleitet' || s === 'unsicher';

export function TreeView({ focusId }: { focusId?: string }) {
  const doc = useStore((s) => s.doc);
  const v = useView();
  const ex = useExpand();
  const [onlyBranch, setOnlyBranch] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addFor, setAddFor] = useState<string>();
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const built = useMemo(() => buildView(doc, v, focusId, onlyBranch, ex), [doc, v, focusId, onlyBranch, ex]);
  const marks = built.kind === 'layout' ? built.marks : undefined;
  const hidden = built.kind === 'layout' ? built.hidden ?? [] : [];
  const layout: Layout =
    built.kind === 'layout'
      ? built.layout
      : { nodes: new Map(), families: [], partnerships: [], assertions: [], width: built.fan.width, height: built.fan.height, minX: built.fan.minX, minY: built.fan.minY };
  const startId = focusId ?? (doc.persons.some((p) => p.id === 'P001') ? 'P001' : undefined);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  useEffect(() => {
    const svg = select(svgRef.current!);
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.08, 3])
      .on('zoom', (e) => gRef.current?.setAttribute('transform', e.transform.toString()));
    zRef.current = z;
    svg.call(z).on('dblclick.zoom', null);
    return () => {
      svg.on('.zoom', null);
    };
  }, []);

  const fit = () => {
    const svg = svgRef.current;
    if (!svg || !zRef.current) return;
    const { width, height } = svg.getBoundingClientRect();
    const pad = 30;
    const k = Math.min((width - pad * 2) / Math.max(layout.width, 1), (height - pad * 2) / Math.max(layout.height, 1), 1.2);
    const tx = (width - layout.width * k) / 2 - layout.minX * k;
    const ty = (height - layout.height * k) / 2 - layout.minY * k;
    select(svg).call(zRef.current.transform as never, zoomIdentity.translate(tx, ty).scale(k));
  };
  const center = (id: string, k = 1) => {
    const svg = svgRef.current;
    const n = layout.nodes.get(id);
    if (!svg || !n || !zRef.current) return;
    const { width, height } = svg.getBoundingClientRect();
    select(svg)
      .call(zRef.current.transform as never, zoomIdentity.translate(width / 2 - (n.x + TILE_W / 2) * k, height / 2 - (n.y + TILE_H / 2) * k).scale(k));
  };

  // Ansicht nur neu ausrichten, wenn Fokus/Filter wechseln oder der Baum erstmals Personen hat –
  // nicht bei jeder Bearbeitung (sonst springt das Bild beim Erfassen).
  const viewKey = useRef('');
  useEffect(() => {
    if (!layout.nodes.size && built.kind === 'layout') return;
    const key = `${focusId ?? ''}|${onlyBranch}|${v.mode}|${v.genUp}|${v.genDown}|${v.showPartners}|${v.living}|${v.size}|${v.spacing}|${v.rootId}`;
    if (viewKey.current === key) return;
    viewKey.current = key;
    if (v.mode === 'stamm') {
      if (focusId && layout.nodes.has(focusId)) center(focusId, 0.8);
      else if (layout.nodes.has('P001')) center('P001', 0.7);
      else fit();
    } else if (built.kind === 'fan' || v.mode !== 'standard') fit();
    else if (focusId && layout.nodes.has(focusId)) center(focusId, onlyBranch ? 0.9 : 0.75);
    else if (layout.nodes.has('P001')) center('P001', 0.75);
    else fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, layout, onlyBranch, v]);

  const zoomBy = (f: number) => svgRef.current && zRef.current && select(svgRef.current).call(zRef.current.scaleBy as never, f);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <svg ref={svgRef} className="h-full w-full touch-none select-none" role="img" aria-label="Stammbaum">
        <g ref={gRef}>
          {built.kind === 'fan' ? (
            <FanG fan={built.fan} anon={built.anon} onOpen={(id) => go('person', id)} />
          ) : (
            <>
              <Edges layout={layout} />
              {[...layout.nodes.values()].map((n) => (
                <Tile
                  key={n.id}
                  n={n}
                  focus={n.id === (focusId ?? (v.mode !== 'standard' && v.mode !== 'stamm' ? startId : undefined))}
                  anon={built.anon.has(n.id)}
                  cfg={v.tile}
                  colors={v.colors}
                  up={marks?.up.get(n.id)}
                  down={marks?.down.get(n.id)}
                  onToggleUp={() => toggleUp(n.id)}
                  onToggleDown={() =>
                    toggleDown(
                      n.id,
                      !!marks?.down.get(n.id)?.open,
                      layout.partnerships.flatMap((p) => (p.p1 === n.id ? [p.p2] : p.p2 === n.id ? [p.p1] : [])),
                    )
                  }
                  onAdd={n.person.kind === 'platzhalter' || built.anon.has(n.id) ? undefined : () => setAddFor(n.id)}
                  onOpen={() => go('person', n.id)}
                />
              ))}
            </>
          )}
        </g>
      </svg>
      <div className="absolute top-2 left-2 flex max-w-[calc(100%-1rem)] flex-wrap gap-2">
        <button className="chip min-h-9 border border-moss bg-card px-3 text-moss shadow-sm" onClick={() => setSettingsOpen(true)}>
          ☰ {MODE_LABEL[v.mode]}
          {v.living !== 'zeigen' ? ` · Lebende ${v.living === 'anonym' ? 'anonym' : 'aus'}` : ''}
        </button>
        {focusId && (
          <span className="chip min-h-9 bg-moss px-3 text-white">
            {v.mode === 'standard' ? 'Fokus' : 'Ausgang'}: {built.anon.has(focusId) ? 'Lebende Person' : doc.persons.find((p) => p.id === focusId) ? shortName(doc.persons.find((p) => p.id === focusId)!) : focusId}
            <button className="ml-2" aria-label="Fokus entfernen" onClick={() => go('baum')}>
              ×
            </button>
          </span>
        )}
        {focusId && v.mode === 'standard' && (
          <button className={`chip min-h-9 border px-3 ${onlyBranch ? 'border-moss bg-moss-light text-moss' : 'border-line bg-card'}`} onClick={() => setOnlyBranch(!onlyBranch)}>
            {onlyBranch ? 'Nur nahe Verwandte ✓' : 'Nur nahe Verwandte'}
          </button>
        )}
      </div>
      {v.mode !== 'standard' && (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-card/90 px-3 py-1 text-xs text-muted shadow">
          {built.kind === 'fan' ? `${built.fan.persons} Personen · ${built.fan.slots.filter((s) => !s.person).length} leere Felder` : `${layout.nodes.size} Personen sichtbar`}
          {v.mode === 'stamm' && hidden.length > 0 && (
            <button className="underline" onClick={() => setHiddenOpen(true)}>
              {hidden.length} weitere
            </button>
          )}
          {v.mode === 'stamm' && (ex.up.length > 0 || ex.down.length > 0) && (
            <button className="underline" onClick={collapseAll}>
              alles zuklappen
            </button>
          )}
        </div>
      )}
      {v.mode === 'stamm' && focusId && built.kind === 'layout' && !layout.nodes.has(focusId) && (
        <div className="absolute top-14 left-2 right-2 rounded-xl bg-amber-light p-3 text-sm text-amber shadow">
          Diese Person ist im Stammbaum gerade zugeklappt.{' '}
          <button className="underline" onClick={() => setView({ mode: 'sanduhr' })}>
            In der Sanduhr zeigen
          </button>
        </div>
      )}
      {settingsOpen && <ViewSheet focusId={focusId ?? startId} onClose={() => setSettingsOpen(false)} />}
      {addFor && <AddRelativeSheet anchorId={addFor} onClose={() => setAddFor(undefined)} />}
      {hiddenOpen && <HiddenSheet ids={hidden} onClose={() => setHiddenOpen(false)} />}
      <div className="absolute right-3 bottom-3 flex flex-col gap-2">
        <button className="btn-ghost h-12 w-12 px-0 text-xl shadow" onClick={() => zoomBy(1.3)} aria-label="Vergrößern">
          +
        </button>
        <button className="btn-ghost h-12 w-12 px-0 text-xl shadow" onClick={() => zoomBy(1 / 1.3)} aria-label="Verkleinern">
          −
        </button>
        <button className="btn-ghost h-12 w-12 px-0 shadow" onClick={fit} aria-label="Alles anzeigen" title="Alles anzeigen">
          ⤢
        </button>
      </div>
      <Legend />
    </div>
  );
}

/** Seitenleiste „Ansicht“: Darstellung, Ausgangsperson, Generationen, Partner, lebende Personen, Druck */
function ViewSheet({ focusId, onClose }: { focusId?: string; onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const v = useView();
  const [q, setQ] = useState('');
  const hits = q.length > 1 ? search(doc, q, 8).filter((h) => h.kind === 'person') : [];
  const focus = doc.persons.find((p) => p.id === focusId);
  const modes: ViewMode[] = ['stamm', 'vorfahren', 'nachfahren', 'sanduhr', 'faecher', 'standard'];
  const [rq, setRq] = useState('');
  const rootHits = rq.length > 1 ? search(doc, rq, 8).filter((h) => h.kind === 'person') : [];
  const root = doc.persons.find((p) => p.id === v.rootId);
  const rootPartners = root ? doc.partnerships.filter((pa) => pa.p1 === root.id || pa.p2 === root.id).map((pa) => doc.persons.find((p) => p.id === (pa.p1 === root.id ? pa.p2 : pa.p1))).filter(Boolean) : [];
  const gens = [1, 2, 3, 4, 5, 6, 8, 10];
  return (
    <Sheet
      title="Ansicht"
      onClose={onClose}
      actions={
        <>
          <button className="btn-ghost" onClick={() => (onClose(), go('druck', ...(focusId ? [focusId] : [])))}>
            🖨 Drucken / PDF
          </button>
          <button className="btn-primary" onClick={onClose}>
            Fertig
          </button>
        </>
      }
    >
      <span className="label">Darstellung</span>
      <div className="mb-4 grid grid-cols-3 gap-2">
        {modes.map((m) => (
          <button key={m} className={v.mode === m ? 'btn-primary px-2' : 'btn-ghost px-2'} onClick={() => setView({ mode: m })}>
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>
      {v.mode === 'stamm' && (
        <div className="mb-4">
          <span className="label">Stammeltern</span>
          <p className="mb-2 text-sm">
            {root ? `${displayName(root)} (${root.id})` : 'keine gewählt'}
            {rootPartners.length ? ` und ${rootPartners.map((p) => displayName(p!)).join(', ')}` : ''}
          </p>
          <input className="field" placeholder="andere Stammeltern suchen" value={rq} onChange={(e) => setRq(e.target.value)} />
          {rootHits.map((h) => (
            <button key={h.id} className="btn-ghost mt-1 w-full justify-between" onClick={() => (setRq(''), setView({ rootId: h.id }), collapseAll())}>
              {h.title} <span className="text-xs text-muted">{h.id}</span>
            </button>
          ))}
          <p className="mt-2 text-xs text-muted">Gezeigt werden die Nachfahren mit ihren Partnern. Weitere Zweige klappst du mit ▲/▼ an den Kacheln auf; mit „+“ legst du eine neue Person mit Beziehung an.</p>
          <button className="btn-ghost mt-2 w-full" onClick={collapseAll}>
            Alle Zweige zuklappen
          </button>
        </div>
      )}
      {v.mode !== 'standard' && v.mode !== 'stamm' && (
        <div className="mb-4">
          <span className="label">Ausgangsperson</span>
          <p className="mb-2 text-sm">{focus ? `${displayName(focus)} (${focus.id})` : 'keine gewählt'}</p>
          <input className="field" placeholder="andere Person suchen" value={q} onChange={(e) => setQ(e.target.value)} />
          {hits.map((h) => (
            <button key={h.id} className="btn-ghost mt-1 w-full justify-between" onClick={() => (setQ(''), go('baum', h.id))}>
              {h.title} <span className="text-xs text-muted">{h.id}</span>
            </button>
          ))}
        </div>
      )}
      {(v.mode === 'vorfahren' || v.mode === 'sanduhr' || v.mode === 'faecher') && (
        <label className="mb-3 block">
          <span className="label">Generationen Vorfahren</span>
          <select className="field" value={v.genUp} onChange={(e) => setView({ genUp: +e.target.value })}>
            {gens.filter((n) => v.mode !== 'faecher' || n <= 6).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      )}
      {(v.mode === 'nachfahren' || v.mode === 'sanduhr') && (
        <>
          <label className="mb-3 block">
            <span className="label">Generationen Nachfahren</span>
            <select className="field" value={v.genDown} onChange={(e) => setView({ genDown: +e.target.value })}>
              {gens.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="mb-3 flex min-h-11 items-center gap-2">
            <input type="checkbox" className="h-5 w-5" checked={v.showPartners} onChange={(e) => setView({ showPartners: e.target.checked })} /> Partner anzeigen
          </label>
        </>
      )}
      <span className="label">Lebende Personen</span>
      <div className="grid grid-cols-3 gap-2">
        {(['zeigen', 'anonym', 'aus'] as LivingMode[]).map((m) => (
          <button key={m} className={v.living === m ? 'btn-primary px-2' : 'btn-ghost px-2'} onClick={() => setView({ living: m })}>
            {{ zeigen: 'Anzeigen', anonym: 'Anonymisieren', aus: 'Ausblenden' }[m]}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">Als lebend gilt, wer nicht als verstorben erfasst und nicht nachweislich vor über 110 Jahren geboren ist. Die Einstellungen gelten nur auf diesem Gerät.</p>
      {v.mode !== 'faecher' && <TileSettings />}
    </Sheet>
  );
}

const TILE_FIELDS: [keyof TileContent, string][] = [
  ['photo', 'Foto'],
  ['callName', 'Rufname statt aller Vornamen'],
  ['birthName', 'Geburtsname (geb. …)'],
  ['dates', 'Lebensdaten'],
  ['fullDates', 'Geburtstag/Todestag vollständig (statt nur Jahr)'],
  ['age', 'Alter'],
  ['birthPlace', 'Geburtsort'],
  ['deathPlace', 'Sterbeort'],
  ['residence', 'Aktueller Wohnort'],
  ['occupation', 'Beruf'],
  ['id', 'ID (P001 …)'],
  ['status', 'Häkchen bei belegten Daten'],
];

/** Kachelinhalte, Größe, Abstände und Farben – wie beim Vorbild frei wählbar */
function TileSettings() {
  const v = useView();
  return (
    <details className="mt-5 rounded-xl border border-line p-3" open>
      <summary className="label mb-0 min-h-9 cursor-pointer">Kacheln</summary>
      <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
        {TILE_FIELDS.map(([k, label]) => (
          <label key={k} className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={v.tile[k]} onChange={(e) => setTile({ [k]: e.target.checked })} /> {label}
          </label>
        ))}
      </div>
      <span className="label mt-3">Größe</span>
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(TILE_SIZES) as TileSize[]).map((s) => (
          <button key={s} className={v.size === s ? 'btn-primary px-2' : 'btn-ghost px-2'} onClick={() => setView({ size: s })}>
            {TILE_SIZES[s].label}
          </button>
        ))}
      </div>
      <span className="label mt-3">Abstände</span>
      <div className="grid grid-cols-3 gap-2">
        {(['eng', 'standard', 'weit'] as Spacing[]).map((s) => (
          <button key={s} className={v.spacing === s ? 'btn-primary px-2' : 'btn-ghost px-2'} onClick={() => setView({ spacing: s })}>
            {{ eng: 'Eng', standard: 'Standard', weit: 'Weit' }[s]}
          </button>
        ))}
      </div>
      <span className="label mt-3">Farben</span>
      <div className="grid grid-cols-3 gap-2">
        {(['geschlecht', 'dezent', 'neutral'] as ColorScheme[]).map((c) => (
          <button key={c} className={v.colors === c ? 'btn-primary px-2' : 'btn-ghost px-2'} onClick={() => setView({ colors: c })}>
            {{ geschlecht: 'Geschlecht', dezent: 'Dezent', neutral: 'Neutral' }[c]}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">Passt nicht alles in die Kachel, werden die unteren Zeilen weggelassen – „Groß“ zeigt am meisten.</p>
    </details>
  );
}

/** Personen, die im Stammbaum gerade nicht sichtbar sind */
function HiddenSheet({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const list = ids.map((id) => doc.persons.find((p) => p.id === id)).filter((p) => p && p.kind !== 'platzhalter');
  return (
    <Sheet title={`${list.length} Personen außerhalb dieser Ansicht`} onClose={onClose}>
      <p className="mb-3 text-sm text-muted">Sie gehören zu zugeklappten Zweigen oder haben (noch) keine Verbindung zu den Stammeltern. Über eine sichtbare Person mit ▲/▼ aufklappen, oder hier eine Person in der Sanduhr ansehen.</p>
      <ul className="card divide-y divide-line">
        {list.map((p) => (
          <li key={p!.id} className="flex items-center gap-2 px-3">
            <button className="min-h-12 flex-1 text-left" onClick={() => (onClose(), go('person', p!.id))}>
              {displayName(p!)} <span className="text-xs text-muted">{p!.id}</span>
            </button>
            <button className="chip min-h-9 border border-line" onClick={() => (onClose(), setView({ mode: 'sanduhr' }), go('baum', p!.id))}>
              Sanduhr
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function Legend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute bottom-3 left-3">
      <button className="chip min-h-9 border border-line bg-card px-3" onClick={() => setOpen(!open)}>
        Legende
      </button>
      {open && (
        <div className="card mt-2 w-64 p-3 text-xs leading-6">
          <svg width="40" height="10" className="mr-2 inline">
            <line x1="0" y1="5" x2="40" y2="5" stroke="#4b5a4f" strokeWidth="2" />
          </svg>
          Familienangabe / belegt
          <br />
          <svg width="40" height="10" className="mr-2 inline">
            <line x1="0" y1="5" x2="40" y2="5" stroke="#b0731e" strokeWidth="2" strokeDasharray="2 4" />
          </svg>
          abgeleitet oder unsicher
          <br />
          <svg width="40" height="10" className="mr-2 inline">
            <line x1="0" y1="5" x2="40" y2="5" stroke="#a3432b" strokeWidth="2" strokeDasharray="3 3" />
          </svg>
          geschieden
          <br />
          <svg width="40" height="10" className="mr-2 inline">
            <path d="M0 8 Q20 -4 40 8" fill="none" stroke="#8a8778" strokeWidth="1.5" strokeDasharray="2 3" />
          </svg>
          Verwandtschaftsaussage (Pfad offen)
          <br />
          ⧉ gestrichelte Kachel = Platzhalter/unbenannt · „?“ / „ca.“ = unsichere Daten
        </div>
      )}
    </div>
  );
}

export function Edges({ layout }: { layout: Layout }) {
  const N = layout.nodes;
  const out: ReactElement[] = [];
  const midY = (n: LNode) => n.y + TILE_H / 2;
  const partnerSet = new Map<string, (typeof layout.partnerships)[number]>();
  for (const pa of layout.partnerships) partnerSet.set([pa.p1, pa.p2].sort().join('+'), pa);

  for (const pa of layout.partnerships) {
    const a = N.get(pa.p1)!;
    const b = N.get(pa.p2)!;
    const [l, r] = a.x < b.x ? [a, b] : [b, a];
    const sameRow = l.layer === r.layer;
    const x1 = l.x + TILE_W;
    const x2 = r.x;
    const y = midY(l);
    const div = pa.state === 'geschieden' || pa.state === 'getrennt';
    const stroke = div ? '#a3432b' : dashed(pa.status) ? '#b0731e' : '#4b5a4f';
    const dash = div ? '3 3' : dashed(pa.status) ? '2 4' : undefined;
    if (sameRow && x2 - x1 < 200) {
      out.push(<line key={`pa${pa.id}`} x1={x1} y1={y} x2={x2} y2={y} stroke={stroke} strokeWidth={2} strokeDasharray={dash} />);
      if (pa.state === 'verheiratet') {
        const cx = (x1 + x2) / 2;
        out.push(
          <g key={`ring${pa.id}`} stroke={stroke} fill="none" strokeWidth={1.5}>
            <circle cx={cx - 3} cy={y} r={4.5} fill="#fffdf8" />
            <circle cx={cx + 3} cy={y} r={4.5} fill="none" />
          </g>,
        );
      }
    } else {
      out.push(<path key={`pa${pa.id}`} d={`M${l.x + TILE_W / 2},${l.y} C${l.x + TILE_W / 2},${l.y - 50} ${r.x + TILE_W / 2},${r.y - 50} ${r.x + TILE_W / 2},${r.y}`} fill="none" stroke={stroke} strokeWidth={1.5} strokeDasharray={dash ?? '4 3'} />);
    }
  }

  // Familienlinien: jede Familie bekommt eine eigene waagerechte Spur, damit sich Linien nicht überdecken
  type Fam = { f: (typeof layout.families)[number]; ox: number; oy: number; kids: { c: (typeof layout.families)[number]['children'][number]; n: LNode }[]; lo: number; hi: number; top: number; lane: number };
  const fams: Fam[] = [];
  for (const f of layout.families) {
    const parents = f.parents.map((p) => N.get(p)).filter(Boolean) as LNode[];
    if (!parents.length) continue;
    let ox: number;
    let oy: number;
    const pa = parents.length === 2 ? partnerSet.get([...f.parents].sort().join('+')) : undefined;
    if (pa && parents[0].layer === parents[1].layer && Math.abs(parents[0].x - parents[1].x) < TILE_W + 200) {
      ox = (Math.min(parents[0].x, parents[1].x) + TILE_W + Math.max(parents[0].x, parents[1].x)) / 2;
      oy = midY(parents[0]);
    } else {
      ox = parents.reduce((s, p) => s + p.x + TILE_W / 2, 0) / parents.length;
      oy = Math.max(...parents.map((p) => p.y + TILE_H));
      if (parents.length === 2) {
        // zwei Eltern ohne Partnerschaft: beide mit Linie zum Sammelpunkt
        for (const p of parents) out.push(<line key={`pp${f.key}${p.id}`} x1={p.x + TILE_W / 2} y1={p.y + TILE_H} x2={ox} y2={oy + 10} stroke="#8a8778" strokeWidth={1.5} />);
        oy += 10;
      }
    }
    const kids = f.children.map((c) => ({ c, n: N.get(c.id) })).filter((x) => x.n) as { c: (typeof f.children)[number]; n: LNode }[];
    if (!kids.length) continue;
    const xs0 = kids.map((k) => k.n.x + TILE_W / 2);
    fams.push({ f, ox, oy, kids, lo: Math.min(ox, ...xs0), hi: Math.max(ox, ...xs0), top: Math.min(...kids.map((k) => k.n.y)), lane: 0 });
  }
  const byTop = new Map<number, Fam[]>();
  for (const fm of fams) (byTop.get(fm.top) ?? byTop.set(fm.top, []).get(fm.top)!).push(fm);
  for (const list of byTop.values()) {
    list.sort((a, b) => a.lo - b.lo);
    const laneEnd: number[] = [];
    for (const fm of list) {
      let l = laneEnd.findIndex((end) => end + 12 < fm.lo);
      if (l < 0) l = laneEnd.length;
      laneEnd[l] = fm.hi;
      fm.lane = l;
    }
  }
  for (const { f, ox, oy, kids, top: topKid, lane } of fams) {
    const busY = Math.max(oy + 10, topKid - 16 - (lane % 5) * 9);
    const xs = kids.map((k) => k.n.x + TILE_W / 2);
    const allDashed = kids.every((k) => k.c.pc.every((x) => dashed(x.status)));
    out.push(<line key={`v${f.key}`} x1={ox} y1={oy} x2={ox} y2={busY} stroke={allDashed ? '#b0731e' : '#4b5a4f'} strokeWidth={1.5} strokeDasharray={allDashed ? '2 4' : undefined} />);
    out.push(<line key={`h${f.key}`} x1={Math.min(ox, ...xs)} y1={busY} x2={Math.max(ox, ...xs)} y2={busY} stroke={allDashed ? '#b0731e' : '#4b5a4f'} strokeWidth={1.5} strokeDasharray={allDashed ? '2 4' : undefined} />);
    for (const k of kids) {
      const d = k.c.pc.some((x) => dashed(x.status));
      out.push(<line key={`c${f.key}${k.c.id}`} x1={k.n.x + TILE_W / 2} y1={busY} x2={k.n.x + TILE_W / 2} y2={k.n.y} stroke={d ? '#b0731e' : '#4b5a4f'} strokeWidth={1.5} strokeDasharray={d ? '2 4' : undefined} />);
    }
  }

  for (const a of layout.assertions) {
    const x = N.get(a.fromId)!;
    const y = N.get(a.toId)!;
    const x1 = x.x + TILE_W / 2;
    const y1 = x.y;
    const x2 = y.x + TILE_W / 2;
    const y2 = y.y;
    const lift = 40 + Math.min(120, Math.abs(x2 - x1) / 6);
    const mx = (x1 + x2) / 2;
    const my = Math.min(y1, y2) - lift;
    out.push(
      <g key={`as${a.id}`}>
        <path d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`} fill="none" stroke="#8a8778" strokeWidth={1.4} strokeDasharray="2 3" />
        <text x={mx} y={(Math.min(y1, y2) + my) / 2 + 4} fontSize={10} textAnchor="middle" fill="#6b6a5f" paintOrder="stroke" stroke="#f6f3ec" strokeWidth={3}>
          {shortLabel(a.label)}
        </text>
      </g>,
    );
  }
  return <g>{out}</g>;
}

function shortLabel(l: string) {
  const s = l.replace(/ von$| bei$/i, '');
  return s.length > 28 ? s.slice(0, 26) + '…' : s;
}

