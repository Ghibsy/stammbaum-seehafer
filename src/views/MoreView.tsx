import { lazy, Suspense, useEffect, useState } from 'react';
import { purgePerson, restorePerson, undoMerge } from '../model/ops';
import { displayName } from '../model/queries';
import { update, useStore } from '../state/store';
import { account, getClientId, login, logoutLocal, redirectUri, setClientId } from '../sync/auth';
import { resolveConflicts, syncNow, useSync } from '../sync/engine';
import type { Resolution } from '../sync/merge';
import { download, Empty, Section } from '../ui/common';
import { go } from '../ui/router';

// Excel-Bibliothek erst bei Bedarf laden (schnellerer Start am Handy)
const ImportView = lazy(() => import('./ImportView').then((m) => ({ default: m.ImportView })));

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
          <button className="btn-ghost col-span-2" onClick={() => go('druck')}>
            🖨 Baum drucken / PDF
          </button>
        </div>
      </Section>
      <AccountSection />
      <ExportSection />
      <Section title="Import">
        <button className="btn-ghost w-full" onClick={() => go('mehr', 'import')}>
          Excel-Datei importieren …
        </button>
      </Section>
      <DuplicatesSection />
      <TrashSection />
      <Section title="Über">
        <p className="text-sm text-muted">
          Stammbaum Seehafer · Datenformat-Version 1 · Daten liegen auf diesem Gerät und in OneDrive/Apps/Stammbaum Seehafer. Keine Tracker, keine externen Dienste außer Microsoft-Anmeldung und OneDrive.
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
      </div>
    </Section>
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
