import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatGenDate, parseGenDate } from '../model/dates';
import type { Citation, GenDate, Status } from '../model/types';
import { STATUS_LABEL } from '../model/types';
import { useStore } from '../state/store';

export const STATUS_ORDER: Status[] = ['belegt', 'familienangabe', 'abgeleitet', 'unsicher', 'widerlegt'];

const STATUS_STYLE: Record<Status, string> = {
  belegt: 'bg-moss text-white',
  familienangabe: 'bg-moss-light text-moss',
  abgeleitet: 'bg-amber-light text-amber border border-dashed border-amber',
  unsicher: 'bg-amber-light text-amber',
  widerlegt: 'bg-neutral text-muted line-through',
};
const STATUS_SHORT: Record<Status, string> = {
  belegt: 'belegt',
  familienangabe: 'Familie',
  abgeleitet: 'abgeleitet',
  unsicher: 'unsicher',
  widerlegt: 'widerlegt',
};

export function StatusChip({ status, onChange }: { status: Status; onChange?: (s: Status) => void }) {
  const [open, setOpen] = useState(false);
  const chip = (
    <span className={`chip ${STATUS_STYLE[status]}`} title={STATUS_LABEL[status]}>
      {STATUS_SHORT[status]}
    </span>
  );
  if (!onChange) return chip;
  return (
    <span className="relative inline-block">
      <button type="button" className="min-h-8" onClick={() => setOpen(!open)} aria-label={`Belegstatus: ${STATUS_LABEL[status]} – ändern`}>
        {chip}
      </button>
      {open && (
        <span className="absolute right-0 z-30 mt-1 flex w-56 flex-col gap-1 rounded-xl border border-line bg-card p-2 shadow-lg">
          {STATUS_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              className={`flex min-h-10 items-center justify-between rounded-lg px-2 text-left text-sm ${s === status ? 'bg-moss-light' : ''}`}
              onClick={() => {
                setOpen(false);
                if (s !== status) onChange(s);
              }}
            >
              {STATUS_LABEL[s]}
              <span className={`chip ${STATUS_STYLE[s]}`}>{STATUS_SHORT[s]}</span>
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

/** Texteingabe, die erst beim Verlassen speichert (vermeidet Speichern bei jedem Tastendruck) */
export function TextField({ value, onCommit, placeholder, multiline, label, inputMode }: { value?: string; onCommit: (v: string) => void; placeholder?: string; multiline?: boolean; label?: string; inputMode?: 'text' | 'numeric' | 'url' }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  const commit = () => {
    if ((value ?? '') !== v) onCommit(v);
  };
  return (
    <label className="block">
      {label && <span className="label">{label}</span>}
      {multiline ? (
        <textarea className="field min-h-24" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} />
      ) : (
        <input className="field" value={v} placeholder={placeholder} inputMode={inputMode} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      )}
    </label>
  );
}

/** Datumseingabe mit Live-Rückmeldung, wie die App die Angabe versteht */
export function DateField({ value, onCommit, label }: { value?: GenDate; onCommit: (g: GenDate | undefined) => void; label?: string }) {
  const [v, setV] = useState(value?.raw ?? '');
  useEffect(() => setV(value?.raw ?? ''), [value?.raw]);
  const parsed = parseGenDate(v);
  return (
    <label className="block">
      {label && <span className="label">{label}</span>}
      <input
        className="field"
        value={v}
        placeholder="TT.MM.JJJJ, ca. 1930, vor 1945, 03.12."
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if ((value?.raw ?? '') !== v) onCommit(parseGenDate(v));
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {v && (
        <span className={`mt-1 block text-xs ${parsed && parsed.qualifier === 'unbekannt' && parsed.remark ? 'text-rust' : 'text-muted'}`}>
          {parsed && parsed.qualifier === 'unbekannt' && parsed.remark ? 'nicht als Datum erkannt – wird als Text gespeichert' : `verstanden als: ${formatGenDate(parsed)}${parsed?.remark ? ` · Hinweis: ${parsed.remark}` : ''}`}
        </span>
      )}
    </label>
  );
}

export function Sheet({ title, onClose, children, actions }: { title: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={onClose}>
      <div ref={ref} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-paper p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-serif text-xl">{title}</h2>
          <button className="btn-ghost min-w-11 px-0" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>
        {children}
        {actions && <div className="mt-4 flex flex-wrap justify-end gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Quellenzitate anzeigen und ergänzen */
export function Citations({ value, onChange }: { value: Citation[]; onChange: (c: Citation[]) => void }) {
  const sources = useStore((s) => s.doc.sources);
  const [adding, setAdding] = useState(false);
  const [sid, setSid] = useState('');
  const [detail, setDetail] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-1">
      {value.map((c, i) => {
        const s = sources.find((x) => x.id === c.sourceId);
        return (
          <span key={i} className="chip border border-line bg-card text-ink" title={s?.title}>
            📖 {c.sourceId}
            {c.detail ? ` · ${c.detail}` : ''}
            <button className="ml-1 text-muted" aria-label="Quelle entfernen" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              ×
            </button>
          </span>
        );
      })}
      {!adding ? (
        <button className="chip min-h-8 border border-dashed border-line text-muted" onClick={() => setAdding(true)}>
          + Quelle
        </button>
      ) : (
        <span className="mt-1 flex w-full flex-col gap-2 rounded-xl border border-line p-2">
          <select className="field" value={sid} onChange={(e) => setSid(e.target.value)}>
            <option value="">Quelle wählen …</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} – {s.title}
              </option>
            ))}
          </select>
          <input className="field" placeholder="Fundstelle (optional), z. B. Eintrag Nr. 12" value={detail} onChange={(e) => setDetail(e.target.value)} />
          <span className="flex gap-2">
            <button
              className="btn-primary flex-1"
              disabled={!sid}
              onClick={() => {
                onChange([...value, { sourceId: sid, ...(detail ? { detail } : {}) }]);
                setAdding(false);
                setSid('');
                setDetail('');
              }}
            >
              Verknüpfen
            </button>
            <button className="btn-ghost" onClick={() => setAdding(false)}>
              Abbrechen
            </button>
          </span>
        </span>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">{children}</p>;
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-serif text-lg">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function download(name: string, data: BlobPart, mime: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
