import { useEffect, useState } from 'react';
import { nextId } from '../model/ids';
import { mergePersons, name, retractName, setDuplicateVerdict, trashPerson } from '../model/ops';
import { displayName, isDeceased } from '../model/queries';
import { search } from '../model/search';
import type { Living, NameType, Sex } from '../model/types';
import { NAME_TYPE_LABEL } from '../model/types';
import { mediaUrl, resizeImage, storeBlob } from '../media/media';
import { update } from '../state/store';
import { Citations, Section, Sheet, StatusChip, TextField } from '../ui/common';
import { back, go } from '../ui/router';
import { DataTab, LifeTab } from './DataTab';
import { FamilyTab } from './FamilyTab';
import { MediaTab } from './MediaTab';
import { usePerson } from './usePerson';
import { RichTextEditor } from '../ui/RichText';
import { searchLinks } from '../model/searchLinks';

const TABS = [
  ['person', 'Person'],
  ['familie', 'Familie'],
  ['daten', 'Daten'],
  ['lebenslauf', 'Lebenslauf'],
  ['quellen', 'Quellen/Medien'],
  ['nachruf', 'Nachruf'],
] as const;

export function PersonDetail({ id, tab = 'person' }: { id: string; tab?: string }) {
  const { person } = usePerson(id);
  if (!person)
    return (
      <div className="p-6">
        <p>Person {id} nicht gefunden.</p>
        <button className="btn-ghost mt-4" onClick={() => go('personen')}>
          Zur Liste
        </button>
      </div>
    );
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-line bg-card px-2 py-2">
        <button className="btn-ghost min-w-11 px-0" onClick={() => back(['personen'])} aria-label="Zurück">
          ←
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-serif text-lg leading-tight">{displayName(person)}</div>
          <div className="text-xs text-muted">
            {person.id}
            {person.kind !== 'benannt' && ` · ${person.kind === 'platzhalter' ? 'Platzhalter' : 'unbenannt'}`}
            {person.deletedAt && ' · im Papierkorb'}
          </div>
        </div>
        <button className="btn-ghost min-w-11 px-0" onClick={() => go('baum', id)} aria-label="Im Baum zeigen" title="Im Baum zeigen">
          ⌖
        </button>
      </header>
      <nav className="flex gap-1 overflow-x-auto border-b border-line bg-card px-2 pb-2">
        {TABS.map(([k, label]) => (
          <button key={k} className={`min-h-10 shrink-0 rounded-full px-3 text-sm ${tab === k ? 'bg-moss text-white' : 'text-muted'}`} onClick={() => location.replace(`#/person/${encodeURIComponent(id)}/${k}`)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto p-4 pb-28">
        {tab === 'person' && <PersonTab id={id} />}
        {tab === 'familie' && <FamilyTab id={id} />}
        {tab === 'daten' && <DataTab id={id} />}
        {tab === 'lebenslauf' && <LifeTab id={id} />}
        {tab === 'quellen' && <MediaTab id={id} />}
        {tab === 'nachruf' && <ObituaryTab id={id} />}
      </div>
    </div>
  );
}

function PersonTab({ id }: { id: string }) {
  const { person: p, doc, edit } = usePerson(id);
  const [photo, setPhoto] = useState<string>();
  const [newType, setNewType] = useState<NameType>('variante');
  const [mergeOpen, setMergeOpen] = useState(false);
  const [showHist, setShowHist] = useState(false);
  const photoMedia = doc.media.find((m) => m.id === p?.photoMediaId);
  useEffect(() => {
    let alive = true;
    if (photoMedia) void mediaUrl(photoMedia.id, photoMedia.file).then((u) => alive && setPhoto(u));
    else setPhoto(undefined);
    return () => {
      alive = false;
    };
  }, [photoMedia]);
  if (!p) return null;
  const active = p.names.filter((n) => n.status !== 'widerlegt');
  const retracted = p.names.filter((n) => n.status === 'widerlegt');

  const onPhoto = async (file: File | undefined) => {
    if (!file) return;
    const blob = await resizeImage(file);
    let mid = '';
    update(`${id}: Profilfoto`, (d) => {
      mid = nextId(d, 'M');
      const fileName = `medien/${mid}.jpg`;
      d.media.push({ id: mid, file: fileName, mime: 'image/jpeg', title: `Foto ${displayName(p)}`, targets: [{ type: 'person', id }], createdAt: new Date().toISOString() });
      const q = d.persons.find((x) => x.id === id)!;
      q.photoMediaId = mid;
    });
    await storeBlob(mid, blob, `medien/${mid}.jpg`);
    setPhoto(URL.createObjectURL(blob));
  };

  return (
    <>
      <div className="mb-5 flex items-center gap-4">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-line bg-neutral">{photo && <img src={photo} alt="" className="h-full w-full object-cover" />}</div>
        <label className="btn-ghost cursor-pointer">
          📷 Foto aufnehmen
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onPhoto(e.target.files?.[0])} />
        </label>
      </div>

      <Section title="Namen">
        <div className="grid gap-3">
          {active.map((n) => (
            <div key={n.id} className="card p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="label mb-0">{NAME_TYPE_LABEL[n.type]}</span>
                <StatusChip status={n.status} onChange={(s) => edit('Namensstatus', (q) => (q.names.find((x) => x.id === n.id)!.status = s))} />
              </div>
              <TextField
                value={n.value}
                onCommit={(v) =>
                  edit('Name', (q) => {
                    const x = q.names.find((y) => y.id === n.id)!;
                    if (x.value && x.value !== v) q.history.push({ at: new Date().toISOString(), what: `Name (${x.type})`, oldValue: x.value, newValue: v, reason: 'geändert' });
                    x.value = v;
                  })
                }
              />
              {n.note && <p className="mt-1 text-xs text-muted">{n.note}</p>}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <Citations value={n.citations} onChange={(c) => edit('Namensquelle', (q) => (q.names.find((x) => x.id === n.id)!.citations = c))} />
                <button className="text-xs text-rust underline" onClick={() => edit('Name zurückgenommen', (q) => retractName(q, n.id))}>
                  zurücknehmen
                </button>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <select className="field" value={newType} onChange={(e) => setNewType(e.target.value as NameType)}>
              {(Object.keys(NAME_TYPE_LABEL) as NameType[]).map((t) => (
                <option key={t} value={t}>
                  {NAME_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            <button className="btn-ghost shrink-0" onClick={() => edit('Name hinzugefügt', (q) => q.names.push(name(newType, '')))}>
              + Name
            </button>
          </div>
        </div>
      </Section>

      <Section title="Allgemein">
        <div className="grid gap-3">
          <label>
            <span className="label">Geschlecht</span>
            <select className="field" value={p.sex} onChange={(e) => edit('Geschlecht', (q) => (q.sex = e.target.value as Sex))}>
              <option value="w">weiblich</option>
              <option value="m">männlich</option>
              <option value="d">divers</option>
              <option value="u">unbekannt</option>
            </select>
          </label>
          <label>
            <span className="label">Lebensstatus</span>
            <select className="field" value={isDeceased(p) && p.living !== 'verstorben' ? 'verstorben' : p.living} onChange={(e) => edit('Lebensstatus', (q) => (q.living = e.target.value as Living))}>
              <option value="unbekannt">unbekannt (wird beim Export wie lebend geschützt)</option>
              <option value="lebt">lebt</option>
              <option value="verstorben">verstorben</option>
            </select>
          </label>
          <TextField label="Familienzweig (Komma-getrennt)" value={p.tags.join(', ')} onCommit={(v) => edit('Familienzweig', (q) => (q.tags = v.split(',').map((s) => s.trim()).filter(Boolean)))} />
          <TextField label="Profil-Links (Leerzeichen-getrennt)" inputMode="url" value={p.links.join(' ')} onCommit={(v) => edit('Links', (q) => (q.links = v.split(/\s+/).filter(Boolean)))} />
          <TextField label="Weitere Informationen" multiline value={p.note} onCommit={(v) => edit('Notiz', (q) => (q.note = v || undefined))} />
        </div>
      </Section>

      <Section title="Quellen zur Person">
        <Citations value={p.citations} onChange={(c) => edit('Quellen', (q) => (q.citations = c))} />
      </Section>

      {p.legacy && (p.legacy.generation || p.legacy.standDerAngabe || p.legacy.beziehungsText) && (
        <Section title="Aus der Excel-Datei">
          <dl className="card grid gap-1 p-3 text-sm">
            {p.legacy.generation && (
              <div>
                <dt className="inline text-muted">Generation: </dt>
                <dd className="inline">{p.legacy.generation}</dd>
              </div>
            )}
            {p.legacy.standDerAngabe && (
              <div>
                <dt className="inline text-muted">Stand der Angabe: </dt>
                <dd className="inline">{p.legacy.standDerAngabe}</dd>
              </div>
            )}
            {p.legacy.beziehungsText && (
              <div>
                <dt className="inline text-muted">Beziehung: </dt>
                <dd className="inline">{p.legacy.beziehungsText}</dd>
              </div>
            )}
          </dl>
        </Section>
      )}

      {(retracted.length > 0 || p.history.length > 0) && (
        <Section title="Historie" action={<button className="text-sm text-muted underline" onClick={() => setShowHist(!showHist)}>{showHist ? 'ausblenden' : `anzeigen (${p.history.length})`}</button>}>
          {showHist && (
            <ul className="card divide-y divide-line text-sm">
              {p.history.map((h, i) => (
                <li key={i} className="p-3">
                  <div className="text-xs text-muted">
                    {new Date(h.at).toLocaleDateString('de-DE')} · {h.what} · {h.reason}
                  </div>
                  <div>
                    <span className="line-through">{h.oldValue}</span>
                    {h.newValue && <> → {h.newValue}</>}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted">Zurückgenommene Angaben bleiben hier sichtbar, erscheinen aber nicht im Baum und nicht im Export.</p>
        </Section>
      )}

      <Section title="Verwalten">
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => setMergeOpen(true)}>
            Dublette / zusammenführen …
          </button>
          <button
            className="btn-danger"
            onClick={() => {
              if (!confirm(`${displayName(p)} in den Papierkorb legen? Beziehungen bleiben gespeichert und kommen beim Wiederherstellen zurück.`)) return;
              update(`${id}: in Papierkorb`, (d) => trashPerson(d, id));
              go('personen');
            }}
          >
            In den Papierkorb
          </button>
        </div>
      </Section>
      {mergeOpen && <MergeDialog id={id} onClose={() => setMergeOpen(false)} />}
    </>
  );
}

function MergeDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { doc, person } = usePerson(id);
  const [q, setQ] = useState('');
  const [other, setOther] = useState<string>();
  const [note, setNote] = useState('');
  const hits = q.length > 0 ? search(doc, q, 12).filter((h) => h.kind === 'person' && h.id !== id) : [];
  const o = doc.persons.find((x) => x.id === other);
  return (
    <Sheet title="Dublette prüfen" onClose={onClose}>
      <p className="mb-3 text-sm text-muted">Mit welcher Person soll {person ? displayName(person) : id} verglichen werden?</p>
      <input className="field mb-2" placeholder="Name oder ID" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="mb-3 grid gap-2">
        {hits.map((h) => (
          <button key={h.id} className={`btn-ghost justify-between ${other === h.id ? 'border-moss bg-moss-light' : ''}`} onClick={() => setOther(h.id)}>
            {h.title} <span className="text-xs text-muted">{h.id}</span>
          </button>
        ))}
      </div>
      {o && (
        <div className="grid gap-2">
          <input className="field" placeholder="Begründung / Hinweis" value={note} onChange={(e) => setNote(e.target.value)} />
          <button
            className="btn-primary"
            onClick={() => {
              if (!confirm(`${displayName(o)} (${o.id}) in ${id} zusammenführen? Namen, Angaben und Beziehungen werden übernommen. Rückgängig ist unter „Mehr → Dubletten“ möglich.`)) return;
              update(`Zusammenführen ${o.id} → ${id}`, (d) => mergePersons(d, id, o.id, note || undefined));
              onClose();
            }}
          >
            Als dieselbe Person zusammenführen ({o.id} geht in {id} auf)
          </button>
          <button className="btn-ghost" onClick={() => (update(`Dublette ${id}/${o.id}`, (d) => setDuplicateVerdict(d, id, o.id, 'moeglich', note || undefined)), onClose())}>
            Als mögliche Dublette markieren
          </button>
          <button className="btn-ghost" onClick={() => (update(`Verschieden ${id}/${o.id}`, (d) => setDuplicateVerdict(d, id, o.id, 'verschieden', note || undefined)), onClose())}>
            Ausdrücklich verschiedene Personen
          </button>
        </div>
      )}
    </Sheet>
  );
}

function ObituaryTab({ id }: { id: string }) {
  const { person: p, doc, edit } = usePerson(id);
  if (!p) return null;
  if (!isDeceased(p)) return <p className="text-sm text-muted">Der Nachruf steht bei verstorbenen Personen zur Verfügung. (Lebensstatus im Reiter „Person“ oder Sterbeangabe im Reiter „Daten“.)</p>;
  const own = doc.media.filter((m) => m.targets.some((t) => t.id === id)).map((m) => m.id);
  return (
    <>
      <p className="mb-2 text-sm text-muted">Mit Überschriften, Listen, Zitaten und Fotos dieser Person. Gespeichert wird beim Verlassen des Feldes.</p>
      <RichTextEditor value={p.obituary} mediaIds={own} onCommit={(v) => edit('Nachruf', (q) => (q.obituary = v || undefined))} placeholder="Was hat diesen Menschen ausgemacht?" />
      <SearchLinks id={id} />
    </>
  );
}

/** Externe Suche in Online-Archiven (nur Verstorbene, nur auf Klick) */
function SearchLinks({ id }: { id: string }) {
  const { person: p } = usePerson(id);
  if (!p) return null;
  const links = searchLinks(p);
  if (!links.length) return null;
  const surnames = [...new Set(links.map((l) => l.surname))];
  return (
    <Section title="In Online-Archiven suchen">
      <div className="card grid gap-2 p-3">
        {surnames.map((s) => (
          <div key={s}>
            {surnames.length > 1 && <div className="mb-1 text-xs text-muted">als „{s}“</div>}
            <div className="flex flex-wrap gap-2">
              {links
                .filter((l) => l.surname === s)
                .map((l) => (
                  <a key={l.site} className="btn-ghost min-h-10 px-3 text-sm" href={l.url} target="_blank" rel="noopener noreferrer">
                    {l.site} ↗
                  </a>
                ))}
            </div>
          </div>
        ))}
        <p className="text-xs text-muted">Öffnet die Suche der jeweiligen Seite in einem neuen Tab. Übergeben werden nur Vorname, Nachname und Lebensjahre.</p>
      </div>
    </Section>
  );
}
