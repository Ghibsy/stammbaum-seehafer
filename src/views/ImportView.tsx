import { useState } from 'react';
import { exportFileName } from '../io/excelExport';
import { importWorkbook, readWorkbook, reportToMarkdown, type ImportResult } from '../io/excelImport';
import { applySupplement, parseSupplement, type Supplement } from '../io/supplement';
import { createPlaceholderParents } from '../model/ops';
import { storeBlob } from '../media/media';
import { replaceDoc, useStore } from '../state/store';
import { download, Section } from '../ui/common';
import { go } from '../ui/router';

/** Einmaliger Import der Excel-Arbeitsmappe mit Bericht; Platzhalter und Ergänzungen werden einzeln entschieden. */
export function ImportView() {
  const current = useStore((s) => s.doc);
  const [res, setRes] = useState<ImportResult>();
  const [sup, setSup] = useState<Supplement>();
  const [err, setErr] = useState<string>();
  const [ph, setPh] = useState<Record<string, boolean>>({});
  const [choice, setChoice] = useState<Record<string, 'uebernehmen' | 'behalten'>>({});
  const [done, setDone] = useState<string[]>();

  const onXlsx = async (f?: File) => {
    if (!f) return;
    setErr(undefined);
    try {
      const r = importWorkbook(readWorkbook(await f.arrayBuffer()), f.name);
      setRes(r);
      setPh({});
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const onJson = async (f?: File) => {
    if (!f) return;
    try {
      setSup(parseSupplement(await f.text()));
      setChoice({});
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const allDecided = !sup || sup.items.every((i) => choice[i.id]);

  const apply = async () => {
    if (!res) return;
    if (current.persons.length && !confirm(`Der aktuelle Stammbaum (${current.persons.length} Personen) wird durch den Import ersetzt. Vorher wird eine Sicherung als JSON heruntergeladen. Fortfahren?`)) return;
    if (current.persons.length) download(exportFileName('Sicherung_vor_Import', 'json'), JSON.stringify(current, null, 1), 'application/json');
    const doc = structuredClone(res.doc);
    const placeholders: string[] = [];
    for (const p of res.report.placeholderProposals) {
      if (!ph[p.key]) continue;
      const u = createPlaceholderParents(doc, p.memberIds, p.label);
      placeholders.push(`${u.id} ${p.label}`);
    }
    const chosen = sup?.items.filter((i) => choice[i.id] === 'uebernehmen') ?? [];
    const log = applySupplement(doc, chosen);
    const md =
      reportToMarkdown(res.report, {
        placeholders,
        supplement: (sup?.items ?? []).map((i) => ({ id: i.id, title: i.title, choice: choice[i.id] === 'uebernehmen' ? 'Ergänzung übernommen' : 'Excel-Stand behalten' })),
      }) + (log.length ? `\n\n## Protokoll der Ergänzungen\n\n${log.map((l) => `- ${l}`).join('\n')}\n` : '');
    doc.meta.importNotes = [...(doc.meta.importNotes ?? []), `Import ${new Date().toLocaleString('de-DE')} aus ${res.report.file}`];
    // Eingebettete Bilder zuerst lokal speichern; sie werden bei der nächsten Synchronisation nach medien/ hochgeladen
    for (const img of res.images) {
      if (doc.media.some((m) => m.id === img.id)) await storeBlob(img.id, new Blob([img.bytes as BlobPart], { type: img.mime }), `medien/${img.id}.${img.ext}`);
    }
    await replaceDoc(doc, { dirty: true, label: 'Excel-Import', keepUndo: true });
    download(exportFileName('Importbericht', 'md'), md, 'text/markdown');
    setDone(log);
  };

  if (done)
    return (
      <div className="p-4">
        <h2 className="mb-2 font-serif text-xl">Import abgeschlossen</h2>
        <p className="mb-4 text-sm">Der Bericht wurde heruntergeladen. Der Stand wird bei der nächsten Verbindung in OneDrive gespeichert.</p>
        {done.some((l) => l.includes('FEHLER')) && <p className="mb-4 rounded-xl bg-amber-light p-3 text-sm text-amber">Einige Ergänzungen konnten nicht angewendet werden – siehe Protokoll im Bericht.</p>}
        <button className="btn-primary" onClick={() => go('baum')}>
          Zum Baum
        </button>
      </div>
    );

  return (
    <div className="h-full overflow-y-auto p-4 pb-28">
      <h2 className="mb-1 font-serif text-xl">Excel-Import</h2>
      <p className="mb-4 text-sm text-muted">Einmalige Übernahme deiner Arbeitsmappe. Vor dem Speichern siehst du den Bericht und entscheidest Platzhalter und Ergänzungen einzeln.</p>
      <div className="mb-5 grid gap-2">
        <label className="btn-primary cursor-pointer">
          1. Excel-Datei wählen (.xlsx)
          <input type="file" accept=".xlsx" className="hidden" onChange={(e) => void onXlsx(e.target.files?.[0])} />
        </label>
        <label className="btn-ghost cursor-pointer">
          2. optional: Ergänzungsdatei (.json)
          <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => void onJson(e.target.files?.[0])} />
        </label>
        {err && <p className="rounded-xl bg-amber-light p-3 text-sm text-rust">{err}</p>}
      </div>

      {res && (
        <>
          <Section title="Übernommen">
            <ul className="card grid grid-cols-2 gap-2 p-3 text-sm">
              {Object.entries(res.report.counts).map(([k, v]) => (
                <li key={k}>
                  <b>{v}</b> {k}
                </li>
              ))}
            </ul>
          </Section>
          <Section title={`Nicht zuordenbar / ohne Anschluss (${res.report.unassignable.length})`}>
            <ul className="card divide-y divide-line text-sm">
              {res.report.unassignable.map((u) => (
                <li key={u.id} className="p-2">
                  <b>{u.id}</b> – {u.reason}
                </li>
              ))}
            </ul>
          </Section>
          {res.report.warnings.length > 0 && (
            <Section title="Hinweise">
              <ul className="card list-disc p-3 pl-6 text-sm">
                {res.report.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Section>
          )}
          <Section title="Platzhalter-Eltern (einzeln freigeben)">
            <p className="mb-2 text-xs text-muted">Für Geschwister ohne erfasste Eltern. Der Platzhalter bekommt eine neue U-ID, Status „abgeleitet“, keinen Namen und keine Daten. Ohne Freigabe bleiben die Geschwister nur gestrichelt verbunden.</p>
            <ul className="grid gap-2">
              {res.report.placeholderProposals.map((p) => (
                <li key={p.key} className="card p-3">
                  <label className="flex min-h-11 items-start gap-3">
                    <input type="checkbox" className="mt-1 h-5 w-5" checked={!!ph[p.key]} onChange={(e) => setPh({ ...ph, [p.key]: e.target.checked })} />
                    <span>
                      <span className="block font-medium">{p.label}</span>
                      <span className="block text-xs text-muted">{p.reason}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </Section>
          {res.report.format && <p className="mb-4 rounded-xl bg-moss-light p-3 text-sm text-moss">Erkannter Aufbau: {res.report.format}</p>}
          {sup && res.report.format?.includes('20.11.2026') && (
            <p className="mb-4 rounded-xl bg-amber-light p-3 text-sm text-amber">
              Achtung: Diese Ergänzungsdatei wurde für die Mappe vom 15.10.2026 erstellt. Die gewählte Mappe vom 20.11.2026 enthält diese Korrekturen bereits. Wähle bei allen Punkten „Excel behalten“, sonst entstehen Doppelungen (zum Beispiel O01 neben O001).
            </p>
          )}
          {sup && (
            <Section title={`Konflikte / Ergänzungen: ${sup.title}`}>
              <ul className="grid gap-3">
                {sup.items.map((i) => (
                  <li key={i.id} className="card p-3 text-sm">
                    <div className="mb-1 font-medium">
                      {i.id} · {i.title}
                    </div>
                    {i.personIds?.length ? <div className="mb-2 text-xs text-muted">betrifft {i.personIds.join(', ')}</div> : null}
                    <div className="mb-1">
                      <span className="label mb-0 inline">Excel: </span>
                      {i.excel}
                    </div>
                    <div className="mb-2">
                      <span className="label mb-0 inline">Ergänzung: </span>
                      {i.supplement}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button className={choice[i.id] === 'uebernehmen' ? 'btn-primary px-2' : 'btn-ghost px-2'} onClick={() => setChoice({ ...choice, [i.id]: 'uebernehmen' })}>
                        Ergänzung übernehmen
                      </button>
                      <button className={choice[i.id] === 'behalten' ? 'btn-primary px-2' : 'btn-ghost px-2'} onClick={() => setChoice({ ...choice, [i.id]: 'behalten' })}>
                        Excel behalten
                      </button>
                    </div>
                    <div className="mt-1 text-xs text-muted">Vorschlag: {i.recommendation === 'uebernehmen' ? 'übernehmen' : 'Excel behalten'}</div>
                  </li>
                ))}
              </ul>
              <button className="btn-ghost mt-2" onClick={() => setChoice(Object.fromEntries(sup.items.map((i) => [i.id, i.recommendation])))}>
                Alle Vorschläge auswählen (danach einzeln prüfen)
              </button>
            </Section>
          )}
          <Section title={`Prüfliste (${res.report.review.length})`}>
            <details className="card p-3 text-sm">
              <summary className="min-h-10 cursor-pointer">Heuristische Zuordnungen anzeigen</summary>
              <ul className="mt-2 grid gap-1">
                {res.report.review.map((r, i) => (
                  <li key={i}>
                    <b>{r.personId}</b> · {r.topic}: {r.text}
                  </li>
                ))}
              </ul>
            </details>
          </Section>
          <button className="btn-primary w-full" disabled={!allDecided} onClick={() => void apply()}>
            {allDecided ? 'Import abschließen' : 'Bitte alle Ergänzungen entscheiden'}
          </button>
        </>
      )}
    </div>
  );
}
