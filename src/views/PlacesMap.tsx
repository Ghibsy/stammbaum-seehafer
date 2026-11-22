import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { shortYear } from '../model/dates';
import type { PlaceGroup } from '../model/places';

type Filter = 'alle' | 'Geburt' | 'Tod' | 'Wohnort / Adresse' | 'Heirat';
const FILTERS: Filter[] = ['alle', 'Geburt', 'Tod', 'Wohnort / Adresse', 'Heirat'];
const LABEL: Record<Filter, string> = { alle: 'Alle', Geburt: 'Geburt', Tod: 'Tod', 'Wohnort / Adresse': 'Wohnort', Heirat: 'Heirat' };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Karte mit OpenStreetMap-Kacheln. An OSM gehen nur die Kartenausschnitte (Kachelabrufe),
 * keine Personendaten: Marker und Beschriftungen entstehen lokal im Browser.
 */
export default function PlacesMap({ groups, onOpen }: { groups: PlaceGroup[]; onOpen: (key: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map>(null);
  const layer = useRef<L.LayerGroup>(null);
  const [filter, setFilter] = useState<Filter>('alle');

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende',
      referrerPolicy: 'strict-origin-when-cross-origin',
    } as L.TileLayerOptions).addTo(m);
    map.current = m;
    layer.current = L.layerGroup().addTo(m);
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const lg = layer.current;
    if (!m || !lg) return;
    lg.clearLayers();
    const pts: L.LatLngExpression[] = [];
    for (const g of groups) {
      const p = g.place;
      if (p?.lat === undefined || p.lon === undefined) continue;
      const uses = filter === 'alle' ? g.uses : g.uses.filter((u) => u.what === filter);
      if (!uses.length && filter !== 'alle') continue;
      const persons = new Map<string, string[]>();
      for (const u of uses) {
        const y = u.date ? shortYear(u.date) : '';
        (persons.get(u.personId) ?? persons.set(u.personId, []).get(u.personId)!).push(`${u.what}${y ? ` ${y}` : ''}`);
      }
      const names = new Map(uses.map((u) => [u.personId, u.personName]));
      const list = [...persons.entries()]
        .slice(0, 12)
        .map(([id, what]) => `<li><a href="#/person/${encodeURIComponent(id)}">${esc(names.get(id)!)}</a> <span style="color:#6b6a5f">${esc(what.join(', '))}</span></li>`)
        .join('');
      const more = persons.size > 12 ? `<li>… und ${persons.size - 12} weitere</li>` : '';
      const html = `<div style="font:13px system-ui;min-width:180px"><b>${esc(p.name)}</b>${p.altNames.length ? `<div style="color:#6b6a5f">${esc(p.altNames.join(', '))}</div>` : ''}<ul style="margin:6px 0 4px;padding-left:16px">${list}${more}</ul><a href="#" data-open="${esc(g.key)}">Ort bearbeiten</a></div>`;
      const r = 6 + Math.min(10, Math.sqrt(persons.size) * 3);
      const mk = L.circleMarker([p.lat, p.lon], { radius: r, color: '#2f4a3a', weight: 2, fillColor: '#7d9b84', fillOpacity: 0.8 }).bindPopup(html);
      mk.on('popupopen', (e) => {
        const a = (e.popup.getElement() as HTMLElement | undefined)?.querySelector('[data-open]');
        a?.addEventListener('click', (ev) => {
          ev.preventDefault();
          onOpen(g.key);
        });
      });
      mk.bindTooltip(esc(p.name), { direction: 'top', offset: [0, -r] });
      lg.addLayer(mk);
      pts.push([p.lat, p.lon]);
    }
    if (pts.length === 1) m.setView(pts[0], 9);
    else if (pts.length) m.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 10 });
    else m.setView([52, 15], 4);
  }, [groups, filter, onOpen]);

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex gap-1 overflow-x-auto border-b border-line bg-card p-2">
        {FILTERS.map((f) => (
          <button key={f} className={`chip min-h-9 whitespace-nowrap ${filter === f ? 'bg-moss text-white' : 'border border-line'}`} onClick={() => setFilter(f)}>
            {LABEL[f]}
          </button>
        ))}
      </div>
      <div ref={el} className="min-h-0 flex-1" style={{ background: '#e9e6dc' }} />
    </div>
  );
}
