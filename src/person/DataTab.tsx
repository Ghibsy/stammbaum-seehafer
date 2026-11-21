import { useMemo, useState } from 'react';
import { ageAt, formatAge, formatGenDate, sortKey } from '../model/dates';
import { uid } from '../model/ids';
import { retractEvent } from '../model/ops';
import { birthDate, displayName, Index, isActive } from '../model/queries';
import type { EventType, GenDate } from '../model/types';
import { EVENT_TYPE_LABEL, PARTNERSHIP_EVENT_LABEL } from '../model/types';
import { useStore } from '../state/store';
import { Citations, DateField, Empty, StatusChip, TextField } from '../ui/common';
import { go } from '../ui/router';
import { usePerson } from './usePerson';

const ORDER: EventType[] = ['geburt', 'taufe', 'herkunft', 'konfession', 'ausbildung', 'beruf', 'wohnort', 'auszeichnung', 'tod', 'bestattung', 'sonstiges'];

export function DataTab({ id }: { id: string }) {
  const { person: p, edit } = usePerson(id);
  const [newType, setNewType] = useState<EventType>('wohnort');
  if (!p) return null;
  const events = p.events.filter((e) => isActive(e.status)).sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type) || sortKey(a.date) - sortKey(b.date));
  const ev = (eid: string) => (q: typeof p) => q.events.find((x) => x.id === eid)!;

  return (
    <>
      <div className="grid gap-3">
        {events.length === 0 && <Empty>Noch keine Angaben.</Empty>}
        {events.map((e) => (
          <div key={e.id} className="card p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-serif text-base">{e.label ?? EVENT_TYPE_LABEL[e.type]}</span>
              <StatusChip status={e.status} onChange={(s) => edit('Status', (q) => (ev(e.id)(q).status = s))} />
            </div>
            <div className="grid gap-2">
              {e.type !== 'herkunft' && e.type !== 'konfession' && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <DateField label={e.type === 'wohnort' || e.type === 'beruf' || e.type === 'ausbildung' ? 'von' : 'Datum'} value={e.date} onCommit={(g) => edit('Datum', (q) => setDate(q, e.id, g))} />
                  {(e.type === 'wohnort' || e.type === 'beruf' || e.type === 'ausbildung') && <DateField label="bis" value={e.dateTo} onCommit={(g) => edit('Datum bis', (q) => (ev(e.id)(q).dateTo = g))} />}
                </div>
              )}
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <TextField label={e.type === 'konfession' || e.type === 'beruf' || e.type === 'auszeichnung' ? 'Bezeichnung / Ort' : 'Ort'} value={e.place} onCommit={(v) => edit('Ort', (q) => (ev(e.id)(q).place = v || undefined))} />
                </div>
                {e.place && (
                  <span className="pb-2">
                    <StatusChip status={e.placeStatus ?? e.status} onChange={(s) => edit('Ortsstatus', (q) => (ev(e.id)(q).placeStatus = s === ev(e.id)(q).status ? undefined : s))} />
                  </span>
                )}
              </div>
              {(e.type === 'wohnort' || e.type === 'bestattung' || e.address) && <TextField label={e.type === 'bestattung' ? 'Grabstelle' : 'Adresse'} value={e.address} onCommit={(v) => edit('Adresse', (q) => (ev(e.id)(q).address = v || undefined))} />}
              <TextField label="Hinweis" value={e.note} onCommit={(v) => edit('Hinweis', (q) => (ev(e.id)(q).note = v || undefined))} />
              <div className="flex flex-wrap gap-3 text-sm">
                {(e.type === 'bestattung' || e.type === 'sonstiges') && (
                  <label className="flex min-h-10 items-center gap-2">
                    <input type="checkbox" checked={!!e.announced} onChange={(x) => edit('angekündigt', (q) => (ev(e.id)(q).announced = x.target.checked || undefined))} /> nur angekündigt
                  </label>
                )}
                {e.type === 'wohnort' && (
                  <label className="flex min-h-10 items-center gap-2">
                    <input type="checkbox" checked={!!e.current} onChange={(x) => edit('aktuell', (q) => (ev(e.id)(q).current = x.target.checked || undefined))} /> aktueller Wohnort
                  </label>
                )}
              </div>
              <Citations value={e.citations} onChange={(c) => edit('Quellen', (q) => (ev(e.id)(q).citations = c))} />
              <button className="self-start text-xs text-rust underline" onClick={() => edit('Angabe zurückgenommen', (q) => retractEvent(q, e.id))}>
                zurücknehmen
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <select className="field" value={newType} onChange={(e) => setNewType(e.target.value as EventType)}>
          {ORDER.map((t) => (
            <option key={t} value={t}>
              {EVENT_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <button
          className="btn-primary shrink-0"
          onClick={() =>
            edit(`${EVENT_TYPE_LABEL[newType]} hinzugefügt`, (q) => {
              q.events.push({ id: uid('e'), type: newType, status: 'familienangabe', citations: [], mediaIds: [] });
              if (newType === 'tod' || newType === 'bestattung') q.living = 'verstorben';
            })
          }
        >
          + Feld
        </button>
      </div>
    </>
  );
}

function setDate(q: { events: { id: string; date?: GenDate; status: string }[] }, eid: string, g: GenDate | undefined) {
  const e = q.events.find((x) => x.id === eid)!;
  e.date = g;
  if (g?.uncertain && e.status === 'familienangabe') e.status = 'unsicher';
}

/** Lebenslauf: eigene Ereignisse, Partnerschaftsereignisse, Geburten der Kinder, Tod der Eltern – mit Alter */
export function LifeTab({ id }: { id: string }) {
  const doc = useStore((s) => s.doc);
  const idx = useMemo(() => new Index(doc), [doc]);
  const p = idx.person(id);
  if (!p) return null;
  const birth = birthDate(p);
  type Row = { key: string; date?: GenDate; title: string; sub?: string; link?: string; status?: string };
  const rows: Row[] = [];
  for (const e of p.events) if (isActive(e.status) && e.date) rows.push({ key: e.id, date: e.date, title: e.label ?? EVENT_TYPE_LABEL[e.type], sub: [e.place, e.address].filter(Boolean).join(', '), status: e.status });
  for (const pa of doc.partnerships) {
    if (pa.p1 !== id && pa.p2 !== id) continue;
    const other = idx.person(pa.p1 === id ? pa.p2 : pa.p1);
    for (const ev of pa.events) if (ev.date && !ev.didNotHappen) rows.push({ key: ev.id, date: ev.date, title: `${PARTNERSHIP_EVENT_LABEL[ev.type]} mit ${other ? displayName(other) : '?'}`, sub: ev.place, link: other?.id });
  }
  for (const c of idx.children(id)) {
    const k = idx.person(c)!;
    const b = birthDate(k);
    if (b) rows.push({ key: `k${c}`, date: b, title: `Geburt von ${displayName(k)}`, link: c });
  }
  for (const par of idx.parents(id)) {
    const pp = idx.person(par)!;
    const d = pp.events.find((e) => e.type === 'tod' && isActive(e.status))?.date;
    if (d) rows.push({ key: `p${par}`, date: d, title: `Tod von ${displayName(pp)} (Elternteil)`, link: par });
  }
  // Ereignisse der Eltern-Partnerschaft (z. B. Scheidung der Eltern) und Tod von Partnern
  const ps = idx.parents(id);
  for (const pa of doc.partnerships) {
    if (!isActive(pa.status) || !ps.includes(pa.p1) || !ps.includes(pa.p2)) continue;
    for (const ev of pa.events) if (ev.date && !ev.didNotHappen) rows.push({ key: `pe${ev.id}`, date: ev.date, title: `${PARTNERSHIP_EVENT_LABEL[ev.type]} der Eltern`, sub: ev.place });
  }
  for (const pid of idx.partners(id)) {
    const pp = idx.person(pid)!;
    const d = pp.events.find((e) => e.type === 'tod' && isActive(e.status))?.date;
    if (d) rows.push({ key: `pt${pid}`, date: d, title: `Tod von ${displayName(pp)} (Partner/in)`, link: pid });
  }
  for (const s of idx.siblings(id)) {
    const sp = idx.person(s.id)!;
    const b = birthDate(sp);
    if (b) rows.push({ key: `s${s.id}`, date: b, title: `Geburt von ${displayName(sp)} (${s.half ? 'Halbgeschwister' : 'Geschwister'})`, link: s.id });
  }
  rows.sort((a, b) => sortKey(a.date) - sortKey(b.date));
  if (!rows.length) return <Empty>Noch keine datierten Angaben. Ergänze Daten im Reiter „Daten“.</Empty>;
  return (
    <ol className="relative ml-3 border-l-2 border-line">
      {rows.map((r) => {
        const age = r.key && r.date && birth ? formatAge(ageAt(birth, r.date)) : '';
        return (
          <li key={r.key} className="mb-4 ml-4">
            <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-moss" />
            <div className="text-sm text-muted">
              {formatGenDate(r.date)}
              {age && ` · Alter ${age}`}
            </div>
            {r.link ? (
              <button className="text-left font-medium underline decoration-line" onClick={() => go('person', r.link!)}>
                {r.title}
              </button>
            ) : (
              <div className="font-medium">{r.title}</div>
            )}
            {r.sub && <div className="text-sm">{r.sub}</div>}
          </li>
        );
      })}
    </ol>
  );
}
