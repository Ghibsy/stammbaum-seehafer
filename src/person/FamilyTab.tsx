import { useMemo, useState } from 'react';
import { formatGenDate } from '../model/dates';
import { uid } from '../model/ids';
import { addAssertion } from '../model/ops';
import { birthDate, displayName, Index, shortName } from '../model/queries';
import { search } from '../model/search';
import type { AssertionKind, ParentChildType, PartnershipEventType, PartnershipState } from '../model/types';
import { PARTNERSHIP_EVENT_LABEL, PARTNERSHIP_LABEL, PC_TYPE_LABEL } from '../model/types';
import { update, useStore } from '../state/store';
import { Citations, DateField, Empty, Section, Sheet, StatusChip, TextField } from '../ui/common';
import { go } from '../ui/router';
import { QuickAdd, type QuickRel } from './QuickAdd';

export function FamilyTab({ id }: { id: string }) {
  const doc = useStore((s) => s.doc);
  const idx = useMemo(() => new Index(doc), [doc]);
  const [quick, setQuick] = useState<QuickRel>();
  const [assertOpen, setAssertOpen] = useState(false);

  const parents = doc.parentChild.filter((x) => x.childId === id && idx.person(x.parentId));
  const kids = doc.parentChild.filter((x) => x.parentId === id && idx.person(x.childId));
  const partnerships = doc.partnerships.filter((x) => (x.p1 === id || x.p2 === id) && idx.person(x.p1 === id ? x.p2 : x.p1));
  const siblings = idx.siblings(id);
  const assertions = doc.assertions.filter((a) => (a.fromId === id || a.toId === id) && idx.person(a.fromId === id ? a.toId : a.fromId));

  const PersonLink = ({ pid }: { pid: string }) => {
    const p = idx.person(pid)!;
    const b = birthDate(p);
    return (
      <button className="min-h-11 flex-1 text-left" onClick={() => go('person', pid)}>
        <span className={`font-medium ${p.kind !== 'benannt' ? 'italic text-muted' : ''}`}>{shortName(p)}</span>
        <span className="ml-2 text-xs text-muted">
          {pid}
          {b ? ` · *${formatGenDate(b)}` : ''}
        </span>
      </button>
    );
  };

  const pcEdit = (pcId: string, fn: (pc: (typeof doc.parentChild)[number]) => void) =>
    update('Eltern-Kind-Beziehung', (d) => {
      const x = d.parentChild.find((y) => y.id === pcId);
      if (x) fn(x);
    });
  const paEdit = (paId: string, fn: (pa: (typeof doc.partnerships)[number]) => void) =>
    update('Partnerschaft', (d) => {
      const x = d.partnerships.find((y) => y.id === paId);
      if (x) fn(x);
    });

  const pcRow = (x: (typeof doc.parentChild)[number], other: string) => (
    <li key={x.id} className="card p-3">
      <div className="flex items-center gap-2">
        <PersonLink pid={other} />
        <StatusChip status={x.status} onChange={(s) => pcEdit(x.id, (pc) => (pc.status = s))} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select className="field w-auto" value={x.type} onChange={(e) => pcEdit(x.id, (pc) => (pc.type = e.target.value as ParentChildType))}>
          {Object.entries(PC_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <Citations value={x.citations} onChange={(c) => pcEdit(x.id, (pc) => (pc.citations = c))} />
      </div>
      {x.note && <p className="mt-1 text-xs text-muted">{x.note}</p>}
      <button className="mt-1 text-xs text-rust underline" onClick={() => confirm('Diese Beziehung entfernen? (Rückgängig über ↶ möglich)') && update('Beziehung entfernt', (d) => (d.parentChild = d.parentChild.filter((y) => y.id !== x.id)))}>
        Beziehung entfernen
      </button>
    </li>
  );

  return (
    <>
      <div className="mb-5 grid grid-cols-3 gap-2">
        <button className="btn-primary px-2" onClick={() => setQuick('elternteil')}>
          + Elternteil
        </button>
        <button className="btn-primary px-2" onClick={() => setQuick('partner')}>
          + Partner
        </button>
        <button className="btn-primary px-2" onClick={() => setQuick('kind')}>
          + Kind
        </button>
      </div>

      <Section title="Eltern">{parents.length ? <ul className="grid gap-2">{parents.map((x) => pcRow(x, x.parentId))}</ul> : <Empty>Keine Eltern erfasst.</Empty>}</Section>

      <Section title="Partnerschaften">
        {partnerships.length ? (
          <ul className="grid gap-2">
            {partnerships.map((pa) => {
              const other = pa.p1 === id ? pa.p2 : pa.p1;
              return (
                <li key={pa.id} className="card p-3">
                  <div className="flex items-center gap-2">
                    <PersonLink pid={other} />
                    <StatusChip status={pa.status} onChange={(s) => paEdit(pa.id, (x) => (x.status = s))} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select className="field w-auto" value={pa.state} onChange={(e) => paEdit(pa.id, (x) => (x.state = e.target.value as PartnershipState))}>
                      {Object.entries(PARTNERSHIP_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <Citations value={pa.citations} onChange={(c) => paEdit(pa.id, (x) => (x.citations = c))} />
                  </div>
                  {pa.note && <p className="mt-1 text-xs text-muted">{pa.note}</p>}
                  <div className="mt-3 grid gap-2">
                    {pa.events.map((ev) => (
                      <div key={ev.id} className="rounded-xl border border-line p-2">
                        <div className="flex items-center justify-between gap-2">
                          <select
                            className="field w-auto"
                            value={ev.type}
                            onChange={(e) =>
                              paEdit(pa.id, (x) => {
                                const t = e.target.value as PartnershipEventType;
                                x.events.find((y) => y.id === ev.id)!.type = t;
                                if (t === 'scheidung' && x.state !== 'geschieden' && confirm('Status der Partnerschaft auf „geschieden“ setzen?')) x.state = 'geschieden';
                              })
                            }
                          >
                            {Object.entries(PARTNERSHIP_EVENT_LABEL).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                          <StatusChip status={ev.status} onChange={(s) => paEdit(pa.id, (x) => (x.events.find((y) => y.id === ev.id)!.status = s))} />
                        </div>
                        <div className="mt-2 grid gap-2">
                          <DateField label="Datum" value={ev.date} onCommit={(g) => paEdit(pa.id, (x) => (x.events.find((y) => y.id === ev.id)!.date = g))} />
                          <TextField label="Ort" value={ev.place} onCommit={(v) => paEdit(pa.id, (x) => (x.events.find((y) => y.id === ev.id)!.place = v || undefined))} />
                          <TextField label="Form (z. B. standesamtlich)" value={ev.form} onCommit={(v) => paEdit(pa.id, (x) => (x.events.find((y) => y.id === ev.id)!.form = v || undefined))} />
                          <Citations value={ev.citations} onChange={(c) => paEdit(pa.id, (x) => (x.events.find((y) => y.id === ev.id)!.citations = c))} />
                          <label className="flex min-h-10 items-center gap-2 text-sm">
                            <input type="checkbox" checked={!!ev.didNotHappen} onChange={(e) => paEdit(pa.id, (x) => (x.events.find((y) => y.id === ev.id)!.didNotHappen = e.target.checked || undefined))} /> Ereignis fand nicht statt
                          </label>
                        </div>
                      </div>
                    ))}
                    <button className="btn-ghost" onClick={() => paEdit(pa.id, (x) => x.events.push({ id: uid('pe'), type: 'heirat', status: 'familienangabe', citations: [] }))}>
                      + Ereignis (Heirat, Scheidung …)
                    </button>
                    <button className="text-xs text-rust underline" onClick={() => confirm('Partnerschaft entfernen?') && update('Partnerschaft entfernt', (d) => (d.partnerships = d.partnerships.filter((y) => y.id !== pa.id)))}>
                      Partnerschaft entfernen
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>Keine Partnerschaft erfasst.</Empty>
        )}
        {parents.length === 2 && !doc.partnerships.some((x) => [x.p1, x.p2].sort().join() === [parents[0].parentId, parents[1].parentId].sort().join()) && (
          <p className="mt-2 rounded-xl bg-amber-light p-3 text-sm text-amber">
            Die beiden Eltern sind noch nicht als Paar erfasst.{' '}
            <button className="underline" onClick={() => update('Elternpaar erfasst', (d) => d.partnerships.push({ id: uid('pa'), p1: parents[0].parentId, p2: parents[1].parentId, state: 'unbekannt', events: [], status: 'abgeleitet', citations: [] }))}>
              Als Paar erfassen (abgeleitet)
            </button>
          </p>
        )}
      </Section>

      <Section title="Kinder">{kids.length ? <ul className="grid gap-2">{kids.map((x) => pcRow(x, x.childId))}</ul> : <Empty>Keine Kinder erfasst.</Empty>}</Section>

      <Section title="Auswertungen">
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-ghost px-2" onClick={() => go('verwandtschaft', id)}>
            Verwandtschaft ermitteln
          </button>
          <button className="btn-ghost px-2" onClick={() => go('baum', id)}>
            Im Baum zeigen
          </button>
        </div>
      </Section>

      <Section title="Geschwister (über gemeinsame Eltern)">
        {siblings.length ? (
          <ul className="card divide-y divide-line">
            {siblings.map((s) => (
              <li key={s.id} className="flex items-center px-3">
                <PersonLink pid={s.id} />
                {s.half && <span className="chip bg-neutral text-muted">halbbürtig</span>}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Keine – oder Eltern nicht erfasst.</Empty>
        )}
      </Section>

      <Section title="Verwandtschaftsaussagen (Pfad offen)" action={<button className="btn-ghost min-h-9 text-sm" onClick={() => setAssertOpen(true)}>+ Aussage</button>}>
        {assertions.length ? (
          <ul className="grid gap-2">
            {assertions.map((a) => {
              const other = a.fromId === id ? a.toId : a.fromId;
              return (
                <li key={a.id} className="card p-3">
                  <div className="text-xs text-muted">{a.fromId === id ? `${a.label} →` : `← ${a.label} (von ${shortName(idx.person(a.fromId)!)})`}</div>
                  <div className="flex items-center gap-2">
                    <PersonLink pid={other} />
                    <StatusChip status={a.status} onChange={(s) => update('Aussage', (d) => (d.assertions.find((y) => y.id === a.id)!.status = s))} />
                  </div>
                  {a.note && <p className="text-xs text-muted">{a.note}</p>}
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>Keine.</Empty>
        )}
      </Section>

      {quick && <QuickAdd anchorId={id} rel={quick} onClose={() => setQuick(undefined)} />}
      {assertOpen && <AssertionDialog id={id} onClose={() => setAssertOpen(false)} />}
    </>
  );
}

const KIND_LABEL: Record<AssertionKind, string> = {
  geschwister: 'Geschwister von',
  grosselternteil: 'Großelternteil von',
  enkel_geschwisterzweig: 'Enkel im Geschwisterzweig von',
  angegeben: 'Als Cousin/Cousine angegeben bei',
  verwandt_grad_offen: 'Verwandtschaft (Grad offen)',
};

function AssertionDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const [kind, setKind] = useState<AssertionKind>('geschwister');
  const [q, setQ] = useState('');
  const [other, setOther] = useState<string>();
  const hits = q.length > 0 ? search(doc, q, 10).filter((h) => h.kind === 'person' && h.id !== id) : [];
  const me = doc.persons.find((p) => p.id === id);
  return (
    <Sheet
      title="Verwandtschaftsaussage"
      onClose={onClose}
      actions={
        <button
          className="btn-primary"
          disabled={!other}
          onClick={() => {
            update('Aussage ergänzt', (d) => addAssertion(d, { fromId: id, toId: other!, kind, label: KIND_LABEL[kind], status: 'familienangabe' }));
            onClose();
          }}
        >
          Speichern
        </button>
      }
    >
      <p className="mb-2 text-sm text-muted">Für Verwandtschaft, deren genauer Pfad noch offen ist. {me && displayName(me)} ist …</p>
      <select className="field mb-2" value={kind} onChange={(e) => setKind(e.target.value as AssertionKind)}>
        {Object.entries(KIND_LABEL).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <input className="field mb-2" placeholder="Person suchen" value={q} onChange={(e) => setQ(e.target.value)} />
      {hits.map((h) => (
        <button key={h.id} className={`btn-ghost mb-1 w-full justify-between ${other === h.id ? 'border-moss bg-moss-light' : ''}`} onClick={() => setOther(h.id)}>
          {h.title} <span className="text-xs text-muted">{h.id}</span>
        </button>
      ))}
    </Sheet>
  );
}
