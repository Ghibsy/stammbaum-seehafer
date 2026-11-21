import { useMemo, useState } from 'react';
import { RULE_LABEL, runChecks, type Severity } from '../model/checks';
import { setDuplicateVerdict } from '../model/ops';
import { displayName } from '../model/queries';
import { update, useStore } from '../state/store';
import { Empty } from '../ui/common';
import { go } from '../ui/router';

const SEV_STYLE: Record<Severity, string> = { fehler: 'bg-rust text-white', warnung: 'bg-amber-light text-amber', hinweis: 'bg-neutral text-muted' };
const SEV_LABEL: Record<Severity, string> = { fehler: 'Fehler', warnung: 'Warnung', hinweis: 'Hinweis' };

/** Konsistenzprüfung: Widersprüche und Belegstand, jeder Eintrag springt zur Person */
export function ChecksView() {
  const doc = useStore((s) => s.doc);
  const findings = useMemo(() => runChecks(doc), [doc]);
  const [rule, setRule] = useState<string>('alle');
  const rules = [...new Set(findings.map((f) => f.rule))];
  const list = findings.filter((f) => rule === 'alle' || f.rule === rule);
  const count = (s: Severity) => findings.filter((f) => f.severity === s).length;
  const nm = (id: string) => {
    const p = doc.persons.find((x) => x.id === id);
    return p ? displayName(p) : id;
  };
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line bg-card p-3">
        <p className="mb-2 text-sm">
          <b className="text-rust">{count('fehler')}</b> Fehler · <b className="text-amber">{count('warnung')}</b> Warnungen · <b>{count('hinweis')}</b> Hinweise
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button className={`chip min-h-9 shrink-0 border px-3 ${rule === 'alle' ? 'border-moss bg-moss text-white' : 'border-line bg-card'}`} onClick={() => setRule('alle')}>
            Alle ({findings.length})
          </button>
          {rules.map((r) => (
            <button key={r} className={`chip min-h-9 shrink-0 border px-3 ${rule === r ? 'border-moss bg-moss text-white' : 'border-line bg-card'}`} onClick={() => setRule(r)}>
              {RULE_LABEL[r] ?? r} ({findings.filter((f) => f.rule === r).length})
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 pb-28">
        {!list.length && <Empty>Keine Auffälligkeiten.</Empty>}
        <ul className="grid gap-2">
          {list.map((f, i) => (
            <li key={i} className="card p-3 text-sm">
              <div className="mb-1 flex items-center gap-2">
                <span className={`chip ${SEV_STYLE[f.severity]}`}>{SEV_LABEL[f.severity]}</span>
                <span className="text-xs text-muted">{RULE_LABEL[f.rule] ?? f.rule}</span>
              </div>
              <p>{f.text}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {f.personIds.map((pid) => (
                  <button key={pid} className="chip min-h-8 border border-line bg-card" onClick={() => go('person', pid)}>
                    {nm(pid)} ({pid})
                  </button>
                ))}
                {f.rule === 'dublette' && f.personIds.length === 2 && (
                  <>
                    <button className="chip min-h-8 border border-moss text-moss" onClick={() => go('person', f.personIds[0])} title="Im Reiter „Person“ → „Dublette / zusammenführen“">
                      Zusammenführen …
                    </button>
                    <button className="chip min-h-8 border border-line" onClick={() => update('Als verschieden markiert', (d) => setDuplicateVerdict(d, f.personIds[0], f.personIds[1], 'verschieden'))}>
                      Verschiedene Personen
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">Ungefähre Daten werden mit ihrem Spielraum geprüft; gemeldet wird nur, was auch im günstigsten Fall nicht passt. Platzhalter-Eltern gelten bewusst als abgeleitet und erscheinen nicht unter „ohne Quelle“.</p>
      </div>
    </div>
  );
}
