import { useEffect, useMemo } from 'react';
import { displayName } from '../model/queries';
import { useStore } from '../state/store';
import { FanG } from '../tree/fan';
import { Edges, Tile } from '../tree/TreeView';
import { buildView, MODE_LABEL, setView, useView, type LivingMode, type ViewSettings } from '../tree/viewSettings';
import { back } from '../ui/router';

/**
 * Drucken / PDF: druckt genau die eingestellte Ansicht. „Eine Seite“ verkleinert auf das Papier,
 * „Mehrseitig“ verteilt in Originalgröße auf mehrere Blätter zum Aneinanderlegen.
 * PDF entsteht über den Druckdialog des Browsers („Als PDF speichern“) – ohne fremden Dienst.
 */

const MM = 96 / 25.4; // Pixel je Millimeter bei 96 dpi
const MARGIN = 10; // mm
const HEADER = 14; // mm

interface Plan {
  paperW: number; // mm
  paperH: number;
  landscape: boolean;
  scale: number;
  cols: number;
  rows: number;
  tileW: number; // Inhaltsbreite je Seite in Inhalts-Pixeln
  tileH: number;
}

function plan(contentW: number, contentH: number, p: ViewSettings['print'], header: boolean): Plan {
  const base = p.paper === 'A3' ? [297, 420] : [210, 297];
  const make = (landscape: boolean): Plan => {
    const paperW = landscape ? base[1] : base[0];
    const paperH = landscape ? base[0] : base[1];
    const availW = (paperW - 2 * MARGIN) * MM;
    const availH = (paperH - 2 * MARGIN - (header ? HEADER : 0)) * MM;
    if (p.split === 'eine') {
      const scale = Math.min(1, availW / contentW, availH / contentH);
      return { paperW, paperH, landscape, scale, cols: 1, rows: 1, tileW: contentW, tileH: contentH };
    }
    return { paperW, paperH, landscape, scale: 1, cols: Math.max(1, Math.ceil(contentW / availW)), rows: Math.max(1, Math.ceil(contentH / availH)), tileW: availW, tileH: availH };
  };
  if (p.orientation === 'hoch') return make(false);
  if (p.orientation === 'quer') return make(true);
  const a = make(false);
  const b = make(true);
  if (p.split === 'eine') return b.scale > a.scale ? b : a;
  return b.cols * b.rows < a.cols * a.rows ? b : a;
}

export function PrintView({ focusId }: { focusId?: string }) {
  const doc = useStore((s) => s.doc);
  const v = useView();
  const built = useMemo(() => buildView(doc, v, focusId, false), [doc, v, focusId]);
  const pad = 20;
  const box =
    built.kind === 'fan'
      ? { w: built.fan.width + 2 * pad, h: built.fan.height + 2 * pad, x: built.fan.minX - pad, y: built.fan.minY - pad }
      : { w: built.layout.width + 2 * pad, h: built.layout.height + 2 * pad, x: built.layout.minX - pad, y: built.layout.minY - pad };
  const header = v.print.title || v.print.focus || v.print.date;
  const pl = plan(Math.max(box.w, 1), Math.max(box.h, 1), v.print, header);
  const persons = built.kind === 'fan' ? built.fan.persons : built.layout.nodes.size;
  const pages = pl.cols * pl.rows;
  const focus = doc.persons.find((p) => p.id === (focusId ?? 'P001'));

  // Papierformat für den Druckdialog
  useEffect(() => {
    const st = document.createElement('style');
    st.textContent = `@page { size: ${v.print.paper} ${pl.landscape ? 'landscape' : 'portrait'}; margin: 0; }`;
    document.head.appendChild(st);
    return () => st.remove();
  }, [v.print.paper, pl.landscape]);

  const setPrint = (p: Partial<ViewSettings['print']>) => setView({ print: { ...v.print, ...p } });
  const content =
    built.kind === 'fan' ? (
      <FanG fan={built.fan} anon={built.anon} onOpen={() => {}} />
    ) : (
      <>
        <Edges layout={built.layout} />
        {[...built.layout.nodes.values()].map((n) => (
          <Tile key={n.id} n={n} focus={false} anon={built.anon.has(n.id)} onOpen={() => {}} />
        ))}
      </>
    );
  const headerText = [v.print.title && (doc.meta.name || 'Stammbaum Seehafer'), MODE_LABEL[v.mode] !== 'Standard' && MODE_LABEL[v.mode], v.print.focus && focus && v.mode !== 'standard' && `Ausgangsperson: ${built.anon.has(focus.id) || (v.living === 'aus' && built.kind === 'layout' && !built.layout.nodes.has(focus.id)) ? 'lebende Person' : displayName(focus)}`, v.print.date && `Stand ${new Date().toLocaleDateString('de-DE')}`, v.living === 'anonym' && 'lebende Personen anonymisiert', v.living === 'aus' && 'lebende Personen ausgeblendet']
    .filter(Boolean)
    .join(' · ');

  // Vorschau verkleinert auf Bildschirmbreite
  const previewScale = Math.min(1, (window.innerWidth - 32) / (pl.paperW * MM));

  return (
    <div className="print-root min-h-full bg-neutral">
      <div className="no-print sticky top-0 z-10 border-b border-line bg-card p-3">
        <div className="mb-2 flex items-center gap-2">
          <button className="btn-ghost min-w-11 px-0" onClick={() => back(['baum'])} aria-label="Zurück">
            ←
          </button>
          <h2 className="flex-1 font-serif text-lg">Drucken / PDF – {MODE_LABEL[v.mode]}</h2>
          <button className="btn-primary" onClick={() => window.print()}>
            🖨 Drucken
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <select className="field" value={v.print.paper} onChange={(e) => setPrint({ paper: e.target.value as 'A4' | 'A3' })}>
            <option value="A4">A4</option>
            <option value="A3">A3</option>
          </select>
          <select className="field" value={v.print.orientation} onChange={(e) => setPrint({ orientation: e.target.value as ViewSettings['print']['orientation'] })}>
            <option value="auto">Ausrichtung automatisch</option>
            <option value="hoch">Hochformat</option>
            <option value="quer">Querformat</option>
          </select>
          <select className="field" value={v.print.split} onChange={(e) => setPrint({ split: e.target.value as 'eine' | 'mehr' })}>
            <option value="eine">Eine Seite (verkleinert)</option>
            <option value="mehr">Mehrseitig (100 %)</option>
          </select>
          <select className="field" value={v.living} onChange={(e) => setView({ living: e.target.value as LivingMode })}>
            <option value="zeigen">Lebende anzeigen</option>
            <option value="anonym">Lebende anonymisieren</option>
            <option value="aus">Lebende ausblenden</option>
          </select>
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          {(
            [
              ['title', 'Titel'],
              ['focus', 'Ausgangsperson'],
              ['date', 'Datum'],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="flex min-h-10 items-center gap-2">
              <input type="checkbox" checked={v.print[k]} onChange={(e) => setPrint({ [k]: e.target.checked })} /> {l}
            </label>
          ))}
        </div>
        <p className="mt-1 text-sm text-muted">
          {persons} Personen · {pages} Seite{pages > 1 ? 'n' : ''} · {pl.landscape ? 'Querformat' : 'Hochformat'} · {Math.round(pl.scale * 100)} %
        </p>
        <p className="text-xs text-muted">Für eine PDF-Datei im Druckdialog „Als PDF speichern“ wählen. Bilder und Linien bleiben dabei scharf (Vektorgrafik).</p>
      </div>
      <div className="print-pages p-4" style={{ ['--preview' as string]: previewScale }}>
        {Array.from({ length: pl.rows }).flatMap((_, r) =>
          Array.from({ length: pl.cols }).map((__, c) => {
            const vbW = v.print.split === 'eine' ? box.w : pl.tileW;
            const vbH = v.print.split === 'eine' ? box.h : pl.tileH;
            const vx = box.x + c * (v.print.split === 'eine' ? 0 : pl.tileW);
            const vy = box.y + r * (v.print.split === 'eine' ? 0 : pl.tileH);
            return (
              <div key={`${r}-${c}`} className="print-page mx-auto mb-4 bg-white shadow" style={{ width: `${pl.paperW}mm`, height: `${pl.paperH}mm`, padding: `${MARGIN}mm` }}>
                {header && (
                  <div className="flex items-baseline justify-between text-[11px] text-[#23271f]" style={{ height: `${HEADER}mm` }}>
                    <span className="font-serif text-[14px]">{headerText}</span>
                    {pages > 1 && (
                      <span>
                        Blatt {r * pl.cols + c + 1}/{pages} (Zeile {r + 1}, Spalte {c + 1})
                      </span>
                    )}
                  </div>
                )}
                <svg
                  width="100%"
                  height={`calc(100% - ${header ? HEADER : 0}mm)`}
                  viewBox={`${vx} ${vy} ${vbW} ${vbH}`}
                  preserveAspectRatio={v.print.split === 'eine' ? 'xMidYMin meet' : 'xMinYMin meet'}
                  style={{ display: 'block' }}
                >
                  {content}
                </svg>
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
