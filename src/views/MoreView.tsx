import { lazy, Suspense, useEffect, useState } from 'react';
import { purgePerson, restorePerson, undoMerge } from '../model/ops';
import { displayName } from '../model/queries';
import { update, useStore } from '../state/store';
import { account, getClientId, login, logoutLocal, redirectUri, setClientId } from '../sync/auth';
import { resolveConflicts, syncNow, useSync } from '../sync/engine';
import type { Resolution } from '../sync/merge';
import { download, Empty, Section } from '../ui/common';
import { go } from '../ui/router';
import { useView } from '../tree/viewSettings';

// Excel-Bibliothek erst bei Bedarf laden (schnellerer Start am Handy)
const ImportView = lazy(() => import('./ImportView').then((m) => ({ default: m.ImportView })));
const GedcomImportView = lazy(() => import('./GedcomImportView').then((m) => ({ default: m.GedcomImportView })));

function stamp(content: string, ext: string, d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_Stammbaum_${content}.${ext}`;
}

export function MoreView({ sub }: { sub?: string }) {
  if (sub === 'import')
    return (
      <Suspense fallback={<p className="p-4 text-muted">Lade Import …</p>}>
        <ImportView />
      </Suspense>
    );
  if (sub === 'gedcom')
    return (
      <Suspense fallback={<p className="p-4 text-muted">Lade Import …</p>}>
        <GedcomImportView />
      </Suspense>
    );
  if (sub === 'konflikte') return <ConflictView />;
  return (
    <div className="h-full overflow-y-auto p-4 pb-28">
      <Section title="Auswertungen">
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-ghost px-2" onClick={() => go('zeitleiste')}>
            📅 Zeitleiste
          </button>
          <button className="btn-ghost px-2" onClick={() => go('zeitleiste', 'jahrestage')}>
            🎂 Jahrestage
          </button>
          <button className="btn-ghost px-2" onClick={() => go('pruefen')}>
            ✔ Konsistenz prüfen
          </button>
          <button className="btn-ghost px-2" onClick={() => go('verwandtschaft')}>
            🔗 Verwandtschaft
          </button>
          <button className="btn-ghost px-2" onClick={() => go('orte')}>
            🗺 Orte & Karte
          </button>
          <button className="btn-ghost px-2" onClick={() => go('statistik')}>
            📊 Statistik
          </button>
          <button className="btn-ghost px-2" onClick={() => go('chronik')}>
            📜 Familienchronik
          </button>
          <button className="btn-ghost px-2" onClick={() => go('druck')}>
            🖨 Baum drucken / PDF
          </button>
        </div>
      </Section>
      <AccountSection />
      <ExportSection />
      <Section title="Import">
        <div className="grid gap-2">
          <button className="btn-ghost w-full" onClick={() => go('mehr', 'import')}>
            Excel-Datei importieren …
          </button>
          <button className="btn-ghost w-full" onClick={() => go('mehr', 'gedcom')}>
            GEDCOM-Datei importieren (.ged, .gdz) …
          </button>
        </div>
      </Section>
      <DuplicatesSection />
      <TrashSection />
      <Section title="Über">
        <p className="text-sm text-muted">
          Stammbaum Seehafer · Datenformat-Version 1 · Daten liegen auf diesem Gerät und in OneDrive/Apps/Stammbaum Seehafer. Keine Tracker. Externe Dienste: Microsoft-Anmeldung und OneDrive; OpenStreetMap nur beim Öffnen der Karte (Kartenbilder) und bei „Auf Karte suchen“ (nur der Ortsname); Online-Archive nur, wenn du einen Suchlink antippst.
        </p>
      </Section>
    </div>
  );
}

function AccountSection() {
  const status = useSync((s) => s.status);
  const message = useSync((s) => s.message);
  const last = useSync((s) => s.lastSyncAt);
  const log = useSync((s) => s.log);
  const [acc, setAcc] = useState<string | null>(null);
  const [cid, setCid] = useState(getClientId());
  useEffect(() => {
    void account().then((a) => setAcc(a?.username ?? null));
  }, [status]);
  return (
    <Section title="OneDrive & Anmeldung">
      <div className="card grid gap-3 p-3 text-sm">
        <div>
          Status: <b>{statusText(status)}</b>
          {message && <span className="text-rust"> – {message}</span>}
        </div>
        {last && <div className="text-muted">Zuletzt gespeichert: {new Date(last).toLocaleString('de-DE')}</div>}
        {acc ? (
          <>
            <div>Angemeldet als {acc}</div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => void syncNow()}>
                Jetzt synchronisieren
              </button>
              <button className="btn-ghost" onClick={() => void logoutLocal().then(() => setAcc(null))}>
                Auf diesem Gerät abmelden
              </button>
            </div>
          </>
        ) : (
          <button className="btn-primary" disabled={!cid} onClick={() => void login()}>
            Mit Microsoft anmelden
          </button>
        )}
        {status === 'konflikt' && (
          <button className="btn-danger" onClick={() => go('mehr', 'konflikte')}>
            Konflikte entscheiden
          </button>
        )}
        <details>
          <summary className="min-h-10 cursor-pointer text-muted">Einrichtung (Client-ID der App-Registrierung)</summary>
          <div className="mt-2 grid gap-2">
            <input className="field" placeholder="Anwendungs-ID (Client) aus Microsoft Entra" value={cid} onChange={(e) => setCid(e.target.value)} />
            <button className="btn-ghost" onClick={() => (setClientId(cid), location.reload())}>
              Speichern und neu laden
            </button>
            <p className="text-xs text-muted">Umleitungs-URI für die Registrierung (Plattform „Single-Page-Anwendung“): {redirectUri()}</p>
          </div>
        </details>
        {log.length > 0 && (
          <details>
            <summary className="min-h-10 cursor-pointer text-muted">Protokoll</summary>
            <ul className="mt-1 text-xs text-muted">
              {log.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Section>
  );
}

export function statusText(s: string) {
  return (
    {
      aus: 'nicht eingerichtet',
      offline: 'offline – Änderungen werden lokal gespeichert',
      anmelden: 'nicht angemeldet – Änderungen nur auf diesem Gerät',
      bereit: 'synchronisiert',
      laeuft: 'speichert …',
      konflikt: 'Konflikt – Entscheidung nötig',
      fehler: 'Fehler',
    } as Record<string, string>
  )[s] ?? s;
}

function ExportSection() {
  const doc = useStore((s) => s.doc);
  const [anon, setAnon] = useState(false);
  return (
    <Section title="Export (Sicherheitsnetz)">
      <div className="card grid gap-2 p-3">
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} /> Lebende Personen anonymisieren
        </label>
        <button
          className="btn-primary"
          disabled={!doc.persons.length}
          onClick={async () => {
            const x = await import('../io/excelExport');
            download(x.exportFileName(anon ? 'Gesamt_anonymisiert' : 'Gesamt', 'xlsx'), x.workbookToBytes(x.buildWorkbook(doc, { anonymizeLiving: anon })), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          }}
        >
          Excel herunterladen (bisherige Spalten)
        </button>
        <button className="btn-ghost" disabled={!doc.persons.length || anon} onClick={() => download(stamp('Daten', 'json'), JSON.stringify(doc, null, 1), 'application/json')}>
          Vollständige Datei (stammbaum.json)
        </button>
        <p className="text-xs text-muted">Zurückgenommene Angaben werden nie exportiert. Die JSON-Datei enthält alles inklusive Historie und ist nicht anonymisierbar.</p>
        <GedcomExport anon={anon} />
      </div>
      <ReadExport />
    </Section>
  );
}

/** Leseansicht für Verwandte: eine HTML-Datei ohne Skripte, die sich offline öffnen lässt */
function ReadExport() {
  const doc = useStore((s) => s.doc);
  const view = useView();
  const [living, setLiving] = useState<'anonym' | 'aus'>('anonym');
  const [opts, setOpts] = useState({ chronicle: true, obituaries: true, sources: false, photos: true });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const run = async () => {
    setBusy(true);
    setMsg('Erstelle …');
    try {
      const [{ buildReadExport }, { sanitizeHtml }, media, q] = await Promise.all([import('../io/readExport'), import('../ui/sanitize'), import('../media/media'), import('../model/queries')]);
      const photos = new Map<string, string>();
      if (opts.photos) {
        const ids = new Set<string>();
        for (const p of doc.persons) if (!p.deletedAt && p.photoMediaId && q.isDeceased(p) && !q.treatAsLiving(p)) ids.add(p.photoMediaId);
        const texts = [...(opts.obituaries ? doc.persons.map((p) => p.obituary ?? '') : []), ...(opts.chronicle ? doc.chronicle.map((c) => c.html) : [])];
        for (const t of texts) for (const m of t.matchAll(/data-media="(M\d+)"/g)) ids.add(m[1]);
        for (const id of ids) {
          const m = doc.media.find((x) => x.id === id);
          const b = m && (await media.mediaBlob(m.id, m.file));
          if (!b || !b.type.startsWith('image/')) continue;
          const small = await media.resizeImage(b, 600, 0.8);
          photos.set(id, await new Promise<string>((res) => {
            const r = new FileReader();
            r.onload = () => res(String(r.result));
            r.readAsDataURL(small);
          }));
        }
      }
      const r = buildReadExport(doc, { living, rootId: view.rootId, chronicle: opts.chronicle, obituaries: opts.obituaries, sources: opts.sources, photos, sanitize: sanitizeHtml });
      download(stamp(living === 'anonym' ? 'Leseansicht_anonymisiert' : 'Leseansicht_ohne_Lebende', 'html'), r.html, 'text/html;charset=utf-8');
      setMsg(`${r.persons} Personen${r.anonymized ? `, ${r.anonymized} anonymisiert` : ''}, ${photos.size} Fotos, ${Math.round(r.html.length / 1024)} KB.`);
    } catch (e) {
      setMsg(`Fehler: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  const cb = (k: keyof typeof opts, label: string) => (
    <label className="flex min-h-10 items-center gap-2 text-sm">
      <input type="checkbox" checked={opts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} /> {label}
    </label>
  );
  return (
    <div className="card mt-3 grid gap-2 p-3">
      <div className="text-sm font-semibold">Leseansicht für Verwandte (HTML-Datei)</div>
      <p className="text-xs text-muted">Eine einzelne Datei zum Verschicken: Baum, Personen mit Belegstatus, auf Wunsch Chronik und Nachrufe. Ohne Anmeldung lesbar, ohne Skripte und ohne Internetzugriff.</p>
      <select className="field" value={living} onChange={(e) => setLiving(e.target.value as 'anonym' | 'aus')}>
        <option value="anonym">Lebende anonymisieren („Lebende Person“, ohne Daten)</option>
        <option value="aus">Lebende ganz weglassen</option>
      </select>
      {cb('chronicle', 'Familienchronik')}
      {cb('obituaries', 'Nachrufe (nur Verstorbene)')}
      {cb('photos', 'Fotos einbetten (Porträts Verstorbener und Bilder in Chronik/Nachrufen)')}
      {cb('sources', 'Quellenverzeichnis (nur Titel)')}
      <button className="btn-primary" disabled={busy || !doc.persons.length} onClick={() => void run()}>
        Leseansicht herunterladen
      </button>
      {msg && <p className="text-xs text-moss">{msg}</p>}
      <p className="text-xs text-muted">Achtung: Selbst geschriebene Texte in Chronik und Nachrufen werden nicht automatisch anonymisiert. Bei „Lebende ganz weglassen“ entfallen Chronik-Kapitel, denen eine lebende Person zugeordnet ist.</p>
    </div>
  );
}

/** GEDCOM für andere Programme (Ancestry, MyHeritage, Gramps …) */
function GedcomExport({ anon }: { anon: boolean }) {
  const doc = useStore((s) => s.doc);
  const [ph, setPh] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const run = async (kind: '5.5.1' | '7.0' | 'zip') => {
    setBusy(true);
    setMsg('');
    try {
      const suffix = anon ? '_anonymisiert' : '';
      if (kind === 'zip') {
        const z = await import('../io/gedzip');
        const r = await z.buildGedzip(doc, { anonymizeLiving: anon, includePlaceholders: ph });
        download(stamp(`GEDCOM7${suffix}`, 'gdz'), r.bytes as BlobPart, 'application/zip');
        setMsg(`${r.counts.persons} Personen, ${r.counts.media} Fotos${r.missing.length ? ` – ${r.missing.length} Fotos nicht verfügbar (offline?)` : ''}.`);
      } else {
        const g = await import('../io/gedcomExport');
        const r = g.buildGedcom(doc, { version: kind, anonymizeLiving: anon, includePlaceholders: ph, withMedia: false });
        download(stamp(`GEDCOM${kind === '7.0' ? '7' : '551'}${suffix}`, 'ged'), r.text, 'text/plain;charset=utf-8');
        setMsg(`${r.counts.persons} Personen, ${r.counts.families} Familien, ${r.counts.sources} Quellen${r.counts.anonymized ? `, ${r.counts.anonymized} anonymisiert` : ''}.`);
      }
    } catch (e) {
      setMsg(`Fehler: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-2 grid gap-2 border-t border-line pt-3">
      <div className="text-sm font-semibold">GEDCOM für andere Stammbaum-Programme</div>
      <label className="flex min-h-10 items-center gap-2 text-sm">
        <input type="checkbox" checked={ph} onChange={(e) => setPh(e.target.checked)} /> Platzhalter-Personen mitnehmen
      </label>
      <div className="grid grid-cols-3 gap-2">
        <button className="btn-ghost px-2" disabled={busy || !doc.persons.length} onClick={() => void run('5.5.1')}>
          GEDCOM 5.5.1
        </button>
        <button className="btn-ghost px-2" disabled={busy || !doc.persons.length} onClick={() => void run('7.0')}>
          GEDCOM 7
        </button>
        <button className="btn-ghost px-2" disabled={busy || !doc.persons.length} onClick={() => void run('zip')}>
          GEDZIP + Fotos
        </button>
      </div>
      {msg && <p className="text-xs text-moss">{msg}</p>}
      <p className="text-xs text-muted">5.5.1 lesen fast alle Programme, 7 ist der neue Standard. Der Belegstatus steht im Feld _STAT und als Qualität (QUAY) an den Quellen; Recherche, Notizen und Historie bleiben draußen.</p>
    </div>
  );
}

function DuplicatesSection() {
  const doc = useStore((s) => s.doc);
  const name = (id: string) => {
    const p = doc.persons.find((x) => x.id === id);
    return p ? `${displayName(p)} (${id})` : id;
  };
  if (!doc.duplicates.length) return null;
  return (
    <Section title="Dubletten">
      <ul className="card divide-y divide-line text-sm">
        {doc.duplicates.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2 p-3">
            <span className="flex-1">
              {name(d.a)} · {name(d.b)}
              <span className="block text-xs text-muted">
                {{ moeglich: 'mögliche Dublette', verschieden: 'ausdrücklich verschieden', zusammengefuehrt: 'zusammengeführt' }[d.verdict]}
                {d.note && ` – ${d.note}`}
              </span>
            </span>
            {d.verdict === 'zusammengefuehrt' && d.snapshot && (
              <button className="btn-ghost min-h-9" onClick={() => confirm('Zusammenführung rückgängig machen?') && update('Zusammenführung rückgängig', (x) => undoMerge(x, d.id))}>
                Rückgängig
              </button>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function TrashSection() {
  const doc = useStore((s) => s.doc);
  const trash = doc.persons.filter((p) => p.deletedAt);
  return (
    <Section title={`Papierkorb (${trash.length})`}>
      {trash.length ? (
        <ul className="card divide-y divide-line text-sm">
          {trash.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 p-3">
              <span className="flex-1">
                {displayName(p)} ({p.id})
              </span>
              <button className="btn-ghost min-h-9" onClick={() => update(`${p.id} wiederhergestellt`, (d) => restorePerson(d, p.id))}>
                Wiederherstellen
              </button>
              <button className="btn-danger min-h-9" onClick={() => confirm(`${displayName(p)} (${p.id}) endgültig löschen? Das entfernt auch alle Beziehungen dieser Person und kann nur über eine Sicherung zurückgeholt werden.`) && update(`${p.id} endgültig gelöscht`, (d) => purgePerson(d, p.id))}>
                Endgültig löschen
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Leer.</Empty>
      )}
    </Section>
  );
}

function ConflictView() {
  const pending = useSync((s) => s.pending);
  const [choice, setChoice] = useState<Record<string, 'local' | 'remote'>>({});
  if (!pending) return <div className="p-4"><Empty>Keine offenen Konflikte.</Empty></div>;
  const show = (v: unknown) => (v === undefined ? '– (gelöscht / nicht vorhanden)' : typeof v === 'string' ? v : JSON.stringify(v, null, 1).slice(0, 400));
  return (
    <div className="h-full overflow-y-auto p-4 pb-28">
      <h2 className="mb-2 font-serif text-xl">Konflikte entscheiden</h2>
      <p className="mb-4 text-sm text-muted">Auf einem anderen Gerät wurden dieselben Angaben anders geändert. Wähle je Angabe, welche Fassung gilt. Alles Übrige wurde bereits zusammengeführt.</p>
      <ul className="grid gap-3">
        {pending.conflicts.map((c) => (
          <li key={c.path} className="card p-3 text-sm">
            <div className="mb-2 font-mono text-xs text-muted">{c.path}</div>
            <div className="mb-2 text-xs">vorher: {show(c.base)}</div>
            <div className="grid gap-2">
              <button className={`btn-ghost h-auto justify-start py-2 text-left ${choice[c.path] === 'local' ? 'border-moss bg-moss-light' : ''}`} onClick={() => setChoice({ ...choice, [c.path]: 'local' })}>
                <span>
                  <b>Dieses Gerät:</b> {show(c.local)}
                </span>
              </button>
              <button className={`btn-ghost h-auto justify-start py-2 text-left ${choice[c.path] === 'remote' ? 'border-moss bg-moss-light' : ''}`} onClick={() => setChoice({ ...choice, [c.path]: 'remote' })}>
                <span>
                  <b>OneDrive:</b> {show(c.remote)}
                </span>
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        className="btn-primary mt-4 w-full"
        disabled={pending.conflicts.some((c) => !choice[c.path])}
        onClick={() => {
          const res: Resolution[] = Object.entries(choice).map(([path, ch]) => ({ path, choice: ch }));
          void resolveConflicts(res).then(() => go('mehr'));
        }}
      >
        Entscheidungen speichern
      </button>
    </div>
  );
}
