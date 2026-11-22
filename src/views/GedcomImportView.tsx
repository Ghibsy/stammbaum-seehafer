import { useMemo, useState } from 'react';
import { applyGedcom, decodeGedcom, matchPersons, readGedcom, type ApplyResult, type GedData, type MatchRow } from '../io/gedcomImport';
import { gedcomBytes } from '../io/gedzip';
import { STATUS_LABEL, type Status } from '../model/types';
import { update, useStore } from '../state/store';
import { Section } from '../ui/common';
import { go } from '../ui/router';

/**
 * GEDCOM-Import aus anderen Programmen: Personen werden mit dem vorhandenen Baum abgeglichen.
 * Für jede Person entscheidest du: neu anlegen, mit vorhandener Person zusammenführen oder weglassen.
 */
export function GedcomImportView() {
  const doc = useStore((s) => s.doc);
  const [file, setFile] = useState<string>();
  const [ged, setGed] = useState<GedData>();
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [dec, setDec] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Status>('unsicher');
  const [warn, setWarn] = useState<string[]>([]);
  const [err, setErr] = useState<string>();
  const [result, setResult] = useState<ApplyResult>();
  const [filter, setFilter] = useState<'alle' | 'treffer'>('alle');

  const load = async (f: File | undefined, st = status) => {
    if (!f) return;
    setErr(undefined);
    try {
      const { ged: bytes, mediaCount } = gedcomBytes(f.name, new Uint8Array(await f.arrayBuffer()));
      const { text, warning } = decodeGedcom(bytes);
      const g = readGedcom(text, st);
      if (!g.persons.length) throw new Error('Die Datei enthält keine Personen.');
      const r = matchPersons(doc, g);
      setFile(f.name);
      setGed(g);
      setRows(r);
      setDec(Object.fromEntries(r.map((x) => [x.xref, x.suggestion])));
      setWarn([...(warning ? [warning] : []), ...g.warnings, ...(mediaCount ? [`${mediaCount} Mediendateien im Archiv werden nicht übernommen (Fotos bitte gezielt an der Person hinzufügen).`] : [])]);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const [lastFile, setLastFile] = useState<File>();

  const counts = useMemo(() => {
    const v = Object.values(dec);
    return { neu: v.filter((x) => x === 'neu').length, skip: v.filter((x) => x === 'skip').length, merge: v.filter((x) => x !== 'neu' && x !== 'skip').length };
  }, [dec]);

  const apply = () => {
    if (!ged || !file) return;
    if (!confirm(`${counts.neu} Personen neu anlegen, ${counts.merge} mit vorhandenen zusammenführen, ${counts.skip} weglassen. Fortfahren? (Rückgängig ist danach möglich.)`)) return;
    let r: ApplyResult | undefined;
    update(`GEDCOM-Import ${file}`, (d) => {
      r = applyGedcom(d, ged, dec, file);
    });
    setResult(r);
  };

  if (result)
    return (
      <div className="h-full overflow-y-auto p-4 pb-28">
        <h2 className="mb-2 font-serif text-xl">GEDCOM-Import abgeschlossen</h2>
        <ul className="card mb-4 grid gap-1 p-3 text-sm">
          <li>{result.created.length} Personen neu angelegt (Merkmal „GEDCOM-Import“)</li>
          <li>{result.merged.length} Personen ergänzt, davon {result.merged.filter((m) => m.conflicts).length} mit abweichenden Angaben (als „unsicher“ zusätzlich gespeichert)</li>
          <li>{result.relations} Beziehungen hinzugefügt</li>
          <li>{result.skipped} Personen weggelassen</li>
          <li>Quelle {result.sourceId} verweist auf die Datei.</li>
          {result.log.map((l, i) => (
            <li key={i} className="text-rust">
              {l}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => go('pruefen')}>
            Konsistenz prüfen
          </button>
          <button className="btn-ghost" onClick={() => go('baum')}>
            Zum Baum
          </button>
        </div>
      </div>
    );

  const shown = rows.filter((r) => filter === 'alle' || r.candidates.length);
  return (
    <div className="h-full overflow-y-auto p-4 pb-28">
      <button className="btn-ghost mb-3" onClick={() => go('mehr')}>
        ← Zurück
      </button>
      <h2 className="mb-2 font-serif text-xl">GEDCOM importieren</h2>
      <p className="mb-3 text-sm text-muted">Für Dateien aus Ancestry, MyHeritage, FamilySearch, Gramps, Ahnenblatt u. a. Es wird nichts überschrieben: Vorhandene Personen bekommen nur fehlende Angaben, Abweichendes kommt als zusätzliche, unsichere Angabe dazu.</p>
      <Section title="1. Datei wählen">
        <div className="card grid gap-3 p-3">
          <label className="grid gap-1 text-sm">
            Belegstatus für übernommene Angaben (falls die Datei keinen eigenen hat)
            <select
              className="field"
              value={status}
              onChange={(e) => {
                const st = e.target.value as Status;
                setStatus(st);
                void load(lastFile, st);
              }}
            >
              {(['unsicher', 'familienangabe', 'abgeleitet'] as Status[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <input
            type="file"
            accept=".ged,.gdz,.zip,text/plain,application/zip"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setLastFile(f);
              void load(f);
            }}
          />
          {err && <p className="text-sm text-rust">{err}</p>}
          {ged && (
            <p className="text-sm">
              {file}: GEDCOM {ged.version}
              {ged.sourceProgram && ` aus ${ged.sourceProgram}`} · {ged.persons.length} Personen · {ged.families.length} Familien · {ged.sources.length} Quellen
            </p>
          )}
          {warn.map((w, i) => (
            <p key={i} className="rounded-xl bg-amber-light p-2 text-sm text-amber">
              {w}
            </p>
          ))}
        </div>
      </Section>
      {ged && (
        <Section
          title="2. Abgleich mit deinem Baum"
          action={
            <select className="field min-h-9 py-1 text-sm" value={filter} onChange={(e) => setFilter(e.target.value as 'alle' | 'treffer')}>
              <option value="alle">alle ({rows.length})</option>
              <option value="treffer">nur mögliche Treffer ({rows.filter((r) => r.candidates.length).length})</option>
            </select>
          }
        >
          <ul className="card divide-y divide-line">
            {shown.map((r) => (
              <li key={r.xref} className="grid gap-1 p-3 text-sm">
                <div className="font-semibold">{r.label}</div>
                {r.candidates.length > 0 && <div className="text-xs text-muted">Möglich: {r.candidates.map((c) => `${c.label} – ${c.why}`).join(' · ')}</div>}
                <select className="field" value={dec[r.xref]} onChange={(e) => setDec({ ...dec, [r.xref]: e.target.value })}>
                  <option value="neu">neu anlegen</option>
                  {r.candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      zusammenführen mit {c.label}
                    </option>
                  ))}
                  <option value="skip">weglassen</option>
                </select>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="btn-primary" onClick={apply}>
              Übernehmen ({counts.neu} neu · {counts.merge} zusammenführen · {counts.skip} weglassen)
            </button>
            <button className="btn-ghost" onClick={() => setDec(Object.fromEntries(rows.map((x) => [x.xref, 'skip'])))}>
              alle weglassen
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">Zusammenführung wird nur bei gleichem Namen und passendem Geburtsdatum vorgeschlagen. Bitte prüfen – im Zweifel lieber „neu anlegen“ und später unter „Konsistenz prüfen“ zusammenführen.</p>
        </Section>
      )}
    </div>
  );
}
