import { PersonDetail } from './person/PersonDetail';
import { undoLast, useStore } from './state/store';
import { useSync } from './sync/engine';
import { TreeView } from './tree/TreeView';
import { go, useRoute } from './ui/router';
import { MoreView, statusText } from './views/MoreView';
import { PersonList } from './views/PersonList';
import { ResearchView } from './views/ResearchView';
import { SourcesView } from './views/SourcesView';
import { ChecksView } from './views/ChecksView';
import { KinshipView } from './views/KinshipView';
import { PrintView } from './views/PrintView';
import { TimelineView } from './views/TimelineView';

const NAV = [
  ['baum', 'Baum', '🌳'],
  ['personen', 'Personen', '👤'],
  ['quellen', 'Quellen', '📖'],
  ['recherche', 'Recherche', '🔎'],
  ['mehr', 'Mehr', '⋯'],
] as const;

export function App() {
  const route = useRoute();
  const loaded = useStore((s) => s.loaded);
  const dirty = useStore((s) => s.dirty);
  const canUndo = useStore((s) => s.undo.length > 0);
  const lastChange = useStore((s) => s.lastChange);
  const status = useSync((s) => s.status);
  const [view, a, b] = route;

  if (!loaded) return <div className="p-6 text-muted">Lade …</div>;
  const isPerson = view === 'person' && a;
  if (view === 'druck') return <PrintView focusId={a} />;

  return (
    <div className="flex h-full flex-col">
      {!isPerson && (
        <header className="flex items-center gap-2 bg-moss px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 text-white">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-8 w-8 rounded-lg" />
          <h1 className="min-w-0 flex-1 truncate font-serif text-base sm:text-lg">Stammbaum Seehafer</h1>
          {canUndo && (
            <button className="min-h-11 min-w-11 rounded-xl bg-white/10 px-2 text-sm" onClick={undoLast} title={lastChange ? `Rückgängig: ${lastChange}` : 'Rückgängig'} aria-label="Rückgängig">
              ↶
            </button>
          )}
          <button className="min-h-11 rounded-xl bg-white/10 px-3 text-xs" onClick={() => go(status === 'konflikt' ? 'mehr' : 'mehr')} title={statusText(status)}>
            {syncBadge(status, dirty)}
          </button>
          <button className="min-h-11 min-w-11 rounded-xl bg-white/10" onClick={() => go('personen')} aria-label="Suchen">
            🔍
          </button>
        </header>
      )}
      <main className="min-h-0 flex-1">
        {view === 'baum' && <TreeView focusId={a} />}
        {view === 'personen' && <PersonList />}
        {isPerson && <PersonDetail id={a} tab={b} />}
        {view === 'quellen' && <SourcesView id={a} />}
        {view === 'recherche' && <ResearchView tab={a} id={b} />}
        {view === 'mehr' && <MoreView sub={a} />}
        {view === 'zeitleiste' && <TimelineView tab={a} />}
        {view === 'pruefen' && <ChecksView />}
        {view === 'verwandtschaft' && <KinshipView a={a} b={b} />}
      </main>
      <nav className="grid grid-cols-5 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]">
        {NAV.map(([k, label, icon]) => (
          <button key={k} className={`flex min-h-14 flex-col items-center justify-center text-xs ${view === k || (k === 'personen' && view === 'person') ? 'text-moss font-semibold' : 'text-muted'}`} onClick={() => go(k)}>
            <span className="text-lg leading-none">{icon}</span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function syncBadge(s: string, dirty: boolean) {
  if (s === 'konflikt') return '⚠ Konflikt';
  if (s === 'laeuft') return '⟳ speichert';
  if (s === 'fehler') return '⚠ Fehler';
  if (s === 'offline') return dirty ? '● offline' : '○ offline';
  if (s === 'anmelden' || s === 'aus') return dirty ? '● nur lokal' : 'nur lokal';
  return dirty ? '● ungespeichert' : '✓ OneDrive';
}
