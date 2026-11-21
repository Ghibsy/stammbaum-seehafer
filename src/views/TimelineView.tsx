import { useMemo, useState } from 'react';
import { formatGenDate, sortKey, sortRange } from '../model/dates';
import { displayName, Index, isActive, isDeceased } from '../model/queries';
import type { GenDate, TreeDoc } from '../model/types';
import { EVENT_TYPE_LABEL, PARTNERSHIP_EVENT_LABEL } from '../model/types';
import { useStore } from '../state/store';
import { Empty } from '../ui/common';
import { go } from '../ui/router';

/** Zeitleiste aller Familienereignisse und kommende Jahrestage */

type Cat = 'alle' | 'geburt' | 'hochzeit' | 'partnerschaft' | 'scheidung' | 'tod' | 'fakt';
const CAT_LABEL: Record<Cat, string> = { alle: 'Alle', geburt: 'Geburten', hochzeit: 'Hochzeiten', partnerschaft: 'Partnerschaft', scheidung: 'Scheidungen', tod: 'Todesfälle', fakt: 'Fakten' };

interface Item {
  key: string;
  cat: Exclude<Cat, 'alle'>;
  date: GenDate;
  title: string;
  sub?: string;
  personIds: string[];
  uncertain: boolean;
}

export function collectEvents(doc: TreeDoc): Item[] {
  const idx = new Index(doc);
  const items: Item[] = [];
  for (const p of idx.byId.values()) {
    if (p.kind === 'platzhalter') continue;
    for (const e of p.events) {
      if (!isActive(e.status) || !e.date || !sortRange(e.date)) continue;
      const cat: Item['cat'] = e.type === 'geburt' ? 'geburt' : e.type === 'tod' ? 'tod' : 'fakt';
      const what = e.type === 'geburt' ? 'Geburt' : e.type === 'tod' ? 'Tod' : e.label ?? EVENT_TYPE_LABEL[e.type];
      items.push({ key: e.id, cat, date: e.date, title: `${what}: ${displayName(p)}`, sub: [e.place, e.announced ? 'angekündigt' : ''].filter(Boolean).join(' · ') || undefined, personIds: [p.id], uncertain: e.status === 'unsicher' || e.status === 'abgeleitet' || !!e.date.uncertain });
    }
  }
  for (const pa of doc.partnerships) {
    if (!isActive(pa.status)) continue;
    const a = idx.person(pa.p1);
    const b = idx.person(pa.p2);
    if (!a || !b) continue;
    for (const ev of pa.events) {
      if (!ev.date || ev.didNotHappen || !sortRange(ev.date)) continue;
      const cat: Item['cat'] = ev.type === 'heirat' ? 'hochzeit' : ev.type === 'scheidung' ? 'scheidung' : 'partnerschaft';
      items.push({ key: ev.id, cat, date: ev.date, title: `${PARTNERSHIP_EVENT_LABEL[ev.type]}: ${displayName(a)} und ${displayName(b)}`, sub: [ev.form, ev.place].filter(Boolean).join(' · ') || undefined, personIds: [a.id, b.id], uncertain: ev.status === 'unsicher' || !!ev.date.uncertain });
    }
  }
  return items.sort((x, y) => sortKey(x.date) - sortKey(y.date));
}

export interface Anniversary {
  personId: string;
  kind: 'geburtstag' | 'todestag';
  days: number;
  date: Date;
  number?: number;
  approx: boolean;
}

/** Kommende Jahrestage (nur Angaben mit Tag und Monat) */
export function anniversaries(doc: TreeDoc, today = new Date()): Anniversary[] {
  const idx = new Index(doc);
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const out: Anniversary[] = [];
  for (const p of idx.byId.values()) {
    if (p.kind === 'platzhalter') continue;
    for (const e of p.events) {
      if (!isActive(e.status) || (e.type !== 'geburt' && e.type !== 'tod') || !e.date || e.date.d === undefined || e.date.m === undefined) continue;
      if (e.date.qualifier === 'vor' || e.date.qualifier === 'nach') continue;
      let next = new Date(t0.getFullYear(), e.date.m - 1, e.date.d);
      if (next < t0) next = new Date(t0.getFullYear() + 1, e.date.m - 1, e.date.d);
      const days = Math.round((next.getTime() - t0.getTime()) / 86400000);
      const y = e.date.y;
      out.push({ personId: p.id, kind: e.type === 'geburt' ? 'geburtstag' : 'todestag', days, date: next, number: y !== undefined ? next.getFullYear() - y : undefined, approx: e.date.qualifier !== 'exakt' || !!e.date.uncertain || e.status === 'unsicher' });
    }
  }
  return out.sort((a, b) => a.days - b.days);
}

export function TimelineView({ tab = 'zeitstrahl' }: { tab?: string }) {
  const doc = useStore((s) => s.doc);
  return (
    <div className="flex h-full flex-col">
      <nav className="flex gap-2 border-b border-line bg-card p-3">
        {(
          [
            ['zeitstrahl', 'Zeitstrahl'],
            ['jahrestage', 'Jahrestage'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} className={`chip min-h-9 border px-3 ${tab === k ? 'border-moss bg-moss text-white' : 'border-line bg-card'}`} onClick={() => location.replace(`#/zeitleiste/${k}`)}>
            {l}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto p-3 pb-28">{tab === 'jahrestage' ? <Anniversaries doc={doc} /> : <Timeline doc={doc} />}</div>
    </div>
  );
}

function Timeline({ doc }: { doc: TreeDoc }) {
  const [cat, setCat] = useState<Cat>('alle');
  const all = useMemo(() => collectEvents(doc), [doc]);
  const items = all.filter((i) => cat === 'alle' || i.cat === cat);
  const groups = new Map<number, Item[]>();
  for (const i of items) {
    const r = sortRange(i.date)!;
    const dec = Math.floor(Math.floor((r[0] + r[1]) / 2 / 10000) / 10) * 10;
    (groups.get(dec) ?? groups.set(dec, []).get(dec)!).push(i);
  }
  return (
    <>
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {(Object.keys(CAT_LABEL) as Cat[]).map((c) => (
          <button key={c} className={`chip min-h-9 shrink-0 border px-3 ${cat === c ? 'border-moss bg-moss text-white' : 'border-line bg-card'}`} onClick={() => setCat(c)}>
            {CAT_LABEL[c]} {c !== 'alle' ? `(${all.filter((i) => i.cat === c).length})` : ''}
          </button>
        ))}
      </div>
      {!items.length && <Empty>Keine datierten Ereignisse in dieser Auswahl.</Empty>}
      {[...groups].map(([dec, list]) => (
        <section key={dec} className="mb-4">
          <h3 className="mb-2 font-serif text-lg">{dec}er Jahre</h3>
          <ol className="relative ml-3 border-l-2 border-line">
            {list.map((i) => (
              <li key={i.key} className="mb-3 ml-4">
                <span className={`absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full ${i.cat === 'tod' ? 'bg-ink' : i.cat === 'geburt' ? 'bg-moss' : 'bg-amber'}`} />
                <div className="text-sm text-muted">
                  {formatGenDate(i.date)}
                  {i.uncertain && ' · unsicher'}
                </div>
                <button className="text-left font-medium underline decoration-line" onClick={() => go('person', i.personIds[0])}>
                  {i.title}
                </button>
                {i.sub && <div className="text-sm">{i.sub}</div>}
              </li>
            ))}
          </ol>
        </section>
      ))}
      <p className="text-xs text-muted">Nur Angaben mit bekanntem Jahr erscheinen im Zeitstrahl. Ungefähre Daten („ca.“, „197x“) sind nach ihrer Mitte einsortiert.</p>
    </>
  );
}

function Anniversaries({ doc }: { doc: TreeDoc }) {
  const list = useMemo(() => anniversaries(doc), [doc]);
  const soon = list.filter((a) => a.days <= 30);
  const later = list.filter((a) => a.days > 30);
  const row = (a: Anniversary) => {
    const p = doc.persons.find((x) => x.id === a.personId)!;
    const dead = isDeceased(p);
    const what =
      a.kind === 'geburtstag'
        ? a.number !== undefined
          ? dead
            ? `${a.number}. Geburtstag (verstorben)`
            : `wird ${a.number}`
          : 'Geburtstag (Jahr unbekannt)'
        : a.number !== undefined
          ? `${a.number}. Todestag`
          : 'Todestag';
    return (
      <li key={`${a.personId}-${a.kind}`}>
        <button className="flex min-h-14 w-full items-center gap-3 px-3 text-left" onClick={() => go('person', p.id)}>
          <span className={`w-14 shrink-0 text-center text-sm font-semibold ${a.days === 0 ? 'text-rust' : 'text-moss'}`}>{a.days === 0 ? 'heute' : a.days === 1 ? 'morgen' : `in ${a.days} T.`}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">
              {a.kind === 'todestag' ? '† ' : ''}
              {displayName(p)}
            </span>
            <span className="block text-xs text-muted">
              {a.date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} · {what}
              {a.approx ? ' · unsichere Angabe' : ''}
            </span>
          </span>
        </button>
      </li>
    );
  };
  return (
    <>
      <h3 className="mb-2 font-serif text-lg">In den nächsten 30 Tagen</h3>
      {soon.length ? <ul className="card mb-5 divide-y divide-line">{soon.map(row)}</ul> : <Empty>Keine Jahrestage in den nächsten 30 Tagen.</Empty>}
      <h3 className="mt-5 mb-2 font-serif text-lg">Später</h3>
      {later.length ? <ul className="card divide-y divide-line">{later.map(row)}</ul> : <Empty>Keine weiteren.</Empty>}
      <p className="mt-3 text-xs text-muted">Berücksichtigt werden Geburts- und Sterbedaten mit Tag und Monat – auch ohne bekanntes Jahr.</p>
    </>
  );
}
