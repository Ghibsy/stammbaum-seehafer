import { useMemo } from 'react';
import { computeStats } from '../model/stats';
import { STATUS_LABEL, type Status } from '../model/types';
import { useStore } from '../state/store';
import { Empty, Section } from '../ui/common';
import { go } from '../ui/router';

const STATUS_COLOR: Record<Status, string> = { belegt: '#2f4a3a', familienangabe: '#7d9b84', abgeleitet: '#b8a46a', unsicher: '#c98a5a', widerlegt: '#a3432b' };

function Bars({ rows, unit = '' }: { rows: { label: string; value: number }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="grid gap-1.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-2 text-sm">
          <span className="truncate" title={r.label}>
            {r.label}
          </span>
          <span className="h-3 rounded-full bg-line/50">
            <span className="block h-3 rounded-full bg-moss" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums">
            {r.value}
            {unit}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card p-3">
      <div className="text-2xl font-semibold tabular-nums text-moss">{value}</div>
      <div className="text-sm">{label}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function StatsView() {
  const doc = useStore((s) => s.doc);
  const s = useMemo(() => computeStats(doc), [doc]);
  if (!s.persons) return <div className="p-4"><Empty>Noch keine Personen.</Empty></div>;
  const pct = (n: number, base: number) => (base ? Math.round((n / base) * 100) : 0);
  const totalStatus = Object.values(s.status).reduce((a, b) => a + b, 0);
  const c = s.completeness;
  return (
    <div className="h-full overflow-y-auto p-4 pb-28">
      <h2 className="mb-3 font-serif text-xl">Statistik</h2>
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label="Personen" value={s.persons} sub={`${s.unnamed} unbenannt · ${s.placeholders} Platzhalter`} />
        <Kpi label="Generationen" value={s.generations} sub="längste Eltern-Kind-Kette" />
        <Kpi label="Lebend / verstorben" value={`${s.living} / ${s.deceased}`} sub="lebend = unter 110 ohne Todesangabe" />
        <Kpi label="Männer / Frauen" value={`${s.sex.m} / ${s.sex.w}`} sub={s.sex.other ? `${s.sex.other} ohne Angabe` : undefined} />
        <Kpi label="Quellen" value={s.sources} />
        <Kpi label="Fotos / Medien" value={s.media} />
        <Kpi label="Orte" value={s.places} />
        <Kpi label="Beziehungen" value={s.relations.parentChild + s.relations.partnerships} sub={`${s.relations.assertions} weitere Verwandtschaftsaussagen`} />
      </div>

      <Section title="Wie gut belegt?">
        <div className="card p-3">
          <div className="mb-2 flex h-4 overflow-hidden rounded-full">
            {(Object.keys(s.status) as Status[]).map((k) => (s.status[k] ? <span key={k} title={`${STATUS_LABEL[k]}: ${s.status[k]}`} style={{ width: `${(s.status[k] / totalStatus) * 100}%`, background: STATUS_COLOR[k] }} /> : null))}
          </div>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {(Object.keys(s.status) as Status[]).map((k) => (
              <li key={k} className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: STATUS_COLOR[k] }} />
                <span className="flex-1">{STATUS_LABEL[k]}</span>
                <span className="tabular-nums">
                  {s.status[k]} ({pct(s.status[k], totalStatus)} %)
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Gezählt werden alle einzelnen Angaben: Namen, Ereignisse und Beziehungen.</p>
        </div>
      </Section>

      <Section title="Vollständigkeit">
        <div className="card p-3">
          <Bars
            unit=" %"
            rows={[
              { label: 'Geburtsjahr', value: pct(c.birthDate, c.base) },
              { label: 'Geburtsort', value: pct(c.birthPlace, c.base) },
              { label: 'Todesjahr', value: pct(c.deathDateOfDeceased, c.deceasedBase) },
              { label: 'mit Quelle', value: pct(c.anySource, c.base) },
              { label: 'mit Foto', value: pct(c.photo, c.base) },
            ]}
          />
          <p className="mt-2 text-xs text-muted">Bezogen auf {c.base} benannte Personen, beim Todesjahr auf {c.deceasedBase} Verstorbene.</p>
          <button className="btn-ghost mt-2" onClick={() => go('pruefen')}>
            Lücken in „Konsistenz prüfen“ ansehen
          </button>
        </div>
      </Section>

      {s.birthsByDecade.length > 0 && (
        <Section title="Geburten je Jahrzehnt">
          <div className="card p-3">
            <Bars rows={s.birthsByDecade.map((d) => ({ label: `${d.decade}er`, value: d.count }))} />
            <p className="mt-2 text-xs text-muted">Unsichere Geburtsjahre zählen mit; Spannen über mehrere Jahrzehnte bleiben draußen.</p>
          </div>
        </Section>
      )}

      {s.lifespan && (
        <Section title="Lebensalter">
          <div className="card grid gap-1 p-3 text-sm">
            <div>
              Durchschnitt: <b>{s.lifespan.avg.toLocaleString('de-DE')} Jahre</b> ({s.lifespan.count} Personen mit eindeutigem Alter)
            </div>
            <button className="text-left underline-offset-2 hover:underline" onClick={() => go('person', s.lifespan!.max.id)}>
              Ältester: {s.lifespan.max.name}, {s.lifespan.max.age} Jahre
            </button>
          </div>
        </Section>
      )}

      <div className="grid gap-x-4 sm:grid-cols-3">
        <Section title="Häufigste Vornamen">
          <div className="card p-3">
            <Bars rows={s.givenNames.map((x) => ({ label: x.name, value: x.count }))} />
          </div>
        </Section>
        <Section title="Familiennamen">
          <div className="card p-3">
            <Bars rows={s.surnames.map((x) => ({ label: x.name, value: x.count }))} />
            <p className="mt-2 text-xs text-muted">Geburtsname, sonst aktueller Name.</p>
          </div>
        </Section>
        <Section title="Geburtsorte">
          <div className="card p-3">
            {s.birthPlaces.length ? <Bars rows={s.birthPlaces.map((x) => ({ label: x.name, value: x.count }))} /> : <Empty>Keine Geburtsorte.</Empty>}
            <button className="btn-ghost mt-2" onClick={() => go('orte')}>
              Orte & Karte
            </button>
          </div>
        </Section>
      </div>
    </div>
  );
}
