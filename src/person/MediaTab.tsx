import { useEffect, useRef, useState } from 'react';
import { nextId } from '../model/ids';
import { displayName } from '../model/queries';
import type { Media } from '../model/types';
import { mediaUrl, resizeImage, storeBlob } from '../media/media';
import { update, useStore } from '../state/store';
import { Citations, Empty, Section, Sheet } from '../ui/common';
import { go } from '../ui/router';
import { usePerson } from './usePerson';

export function MediaTab({ id }: { id: string }) {
  const { person: p, doc, edit } = usePerson(id);
  const [talk, setTalk] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!p) return null;
  const media = doc.media.filter((m) => m.targets.some((t) => t.id === id));
  const allSourceIds = new Set<string>([...p.citations.map((c) => c.sourceId), ...p.names.flatMap((n) => n.citations.map((c) => c.sourceId)), ...p.events.flatMap((e) => e.citations.map((c) => c.sourceId))]);

  const addPhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const isImg = file.type.startsWith('image/');
      const blob = isImg ? await resizeImage(file) : file;
      const ext = isImg ? 'jpg' : (file.name.split('.').pop() ?? 'bin').toLowerCase();
      let mid = '';
      update(`${id}: Medium hinzugefügt`, (d) => {
        mid = nextId(d, 'M');
        d.media.push({ id: mid, file: `medien/${mid}.${ext}`, mime: blob.type || file.type, title: isImg ? `Foto zu ${displayName(p)}` : file.name, targets: [{ type: 'person', id }], createdAt: new Date().toISOString() });
      });
      await storeBlob(mid, blob, `medien/${mid}.${ext}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-2">
        <label className="btn-primary cursor-pointer px-2">
          📷 Foto aufnehmen
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void addPhoto(e.target.files?.[0])} />
        </label>
        <button className="btn-primary px-2" onClick={() => setTalk(true)}>
          🗣 Gesprächsnotiz
        </button>
        <label className="btn-ghost col-span-2 cursor-pointer">
          Datei / Dokument wählen
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => void addPhoto(e.target.files?.[0])} />
        </label>
      </div>
      {busy && <p className="mb-3 text-sm text-muted">Bild wird verkleinert …</p>}

      <Section title="Quellen zur Person">
        <Citations value={p.citations} onChange={(c) => edit('Quellen', (q) => (q.citations = c))} />
        {allSourceIds.size > 0 && (
          <ul className="mt-3 grid gap-1 text-sm">
            {[...allSourceIds].map((sid) => {
              const s = doc.sources.find((x) => x.id === sid);
              return (
                <li key={sid}>
                  <button className="text-left underline decoration-line" onClick={() => go('quellen', sid)}>
                    {sid} – {s?.title ?? 'unbekannte Quelle'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Medien">{media.length ? <div className="grid grid-cols-3 gap-2">{media.map((m) => <Thumb key={m.id} m={m} />)}</div> : <Empty>Noch keine Fotos oder Dokumente.</Empty>}</Section>

      {doc.evidence.some((b) => b.personIds.includes(id)) && (
        <Section title="Belege zu dieser Person">
          <ul className="grid gap-2 text-sm">
            {doc.evidence
              .filter((b) => b.personIds.includes(id))
              .map((b) => (
                <li key={b.id} className="card p-3">
                  <div className="mb-1 font-medium">
                    {b.id} · {b.feature}
                  </div>
                  <p>{b.statement}</p>
                  {b.limit && <p className="mt-1 text-xs text-amber">Grenze: {b.limit}</p>}
                  <div className="mt-1 text-xs text-muted">
                    {b.kind}
                    {b.sourceIds.length ? ` · ${b.sourceIds.join(', ')}` : ''}
                  </div>
                </li>
              ))}
          </ul>
        </Section>
      )}
      {talk && <TalkNote personId={id} onClose={() => setTalk(false)} />}
    </>
  );
}

export function Thumb({ m }: { m: Media }) {
  const [url, setUrl] = useState<string>();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    if (m.file) void mediaUrl(m.id, m.file).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [m.id, m.file]);
  const isImg = m.mime.startsWith('image/');
  const isAudio = m.mime.startsWith('audio/');
  return (
    <>
      <button className="card aspect-square overflow-hidden text-xs" onClick={() => (m.url && !m.file ? window.open(m.url, '_blank', 'noopener') : setOpen(true))}>
        {isImg && url ? <img src={url} alt={m.title} className="h-full w-full object-cover" /> : <span className="flex h-full flex-col items-center justify-center p-1 text-center">{isAudio ? '🎙' : m.url ? '🔗' : '📄'}<span className="mt-1 line-clamp-2">{m.id} {m.title}</span></span>}
      </button>
      {open && (
        <Sheet title={`${m.id} – ${m.title}`} onClose={() => setOpen(false)}>
          {isImg && url && <img src={url} alt={m.title} className="mb-3 w-full rounded-xl" />}
          {isAudio && url && <audio controls src={url} className="mb-3 w-full" />}
          {!url && m.file && <p className="mb-3 text-sm text-muted">Datei ist auf diesem Gerät noch nicht vorhanden (wird nach der Anmeldung aus OneDrive geladen).</p>}
          <label className="label">Titel</label>
          <input className="field mb-2" defaultValue={m.title} onBlur={(e) => update('Medientitel', (d) => (d.media.find((x) => x.id === m.id)!.title = e.target.value))} />
          <label className="label">Beschreibung</label>
          <textarea className="field" defaultValue={m.description} onBlur={(e) => update('Medienbeschreibung', (d) => (d.media.find((x) => x.id === m.id)!.description = e.target.value || undefined))} />
        </Sheet>
      )}
    </>
  );
}

function today() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

/** Gesprächsnotiz: legt eine Quelle vom Typ „Familiengespräch“ an und verknüpft sie mit der Person */
export function TalkNote({ personId, onClose }: { personId: string; onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const [date, setDate] = useState(today());
  const [partner, setPartner] = useState('');
  const [text, setText] = useState('');
  const [audio, setAudio] = useState<Blob>();
  const p = doc.persons.find((x) => x.id === personId);

  const save = async () => {
    let qid = '';
    let mid = '';
    update(`${personId}: Gesprächsnotiz`, (d) => {
      qid = nextId(d, 'Q');
      const now = new Date().toISOString();
      if (audio) {
        mid = nextId(d, 'M');
        d.media.push({ id: mid, file: `medien/${mid}.webm`, mime: audio.type || 'audio/webm', title: `Sprachnotiz ${date}${partner ? ` – ${partner}` : ''}`, targets: [{ type: 'source', id: qid }, { type: 'person', id: personId }], sourceId: qid, createdAt: now });
      }
      d.sources.push({ id: qid, title: `Gespräch${partner ? ` mit ${partner}` : ''} am ${date}`, type: 'Familiengespräch', author: partner || undefined, partner: partner || undefined, date, proves: text || undefined, mediaIds: mid ? [mid] : undefined, createdAt: now, updatedAt: now });
      const q = d.persons.find((x) => x.id === personId);
      if (q) q.citations.push({ sourceId: qid });
    });
    if (audio && mid) await storeBlob(mid, audio, `medien/${mid}.webm`);
    onClose();
  };

  return (
    <Sheet
      title="Gesprächsnotiz"
      onClose={onClose}
      actions={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn-primary" disabled={!text && !audio} onClick={() => void save()}>
            Als Quelle speichern
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-muted">Wird als Quelle „Familiengespräch“ angelegt und mit {p ? displayName(p) : personId} verknüpft. Einzelne Angaben kannst du danach mit dieser Quelle belegen.</p>
      <div className="grid gap-3">
        <label>
          <span className="label">Datum</span>
          <input className="field" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          <span className="label">Mitgeteilt von</span>
          <input className="field" list="talk-persons" value={partner} onChange={(e) => setPartner(e.target.value)} placeholder="Name auswählen oder eintippen" />
          <datalist id="talk-persons">
            {doc.persons
              .filter((x) => !x.deletedAt && x.kind === 'benannt')
              .map((x) => (
                <option key={x.id} value={displayName(x)} />
              ))}
          </datalist>
        </label>
        <label>
          <span className="label">Notiz</span>
          <textarea className="field min-h-32" value={text} onChange={(e) => setText(e.target.value)} placeholder="Was wurde erzählt?" />
        </label>
        <Recorder value={audio} onChange={setAudio} />
        <p className="text-xs text-muted">Die Sprachaufnahme bleibt auf dem Gerät und in deinem OneDrive. Es gibt bewusst keine automatische Umwandlung in Text (die würde die Aufnahme an einen fremden Dienst senden).</p>
      </div>
    </Sheet>
  );
}

function Recorder({ value, onChange }: { value?: Blob; onChange: (b?: Blob) => void }) {
  const [rec, setRec] = useState<MediaRecorder>();
  const [secs, setSecs] = useState(0);
  const chunks = useRef<Blob[]>([]);
  const url = value ? URL.createObjectURL(value) : undefined;
  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [rec]);
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      const r = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 24000 } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        onChange(new Blob(chunks.current, { type: r.mimeType || 'audio/webm' }));
        setRec(undefined);
      };
      r.start();
      setSecs(0);
      setRec(r);
    } catch {
      alert('Mikrofon nicht verfügbar oder nicht erlaubt.');
    }
  };
  return (
    <div className="rounded-xl border border-line p-3">
      <span className="label">Sprachnotiz (optional)</span>
      {rec ? (
        <button className="btn-danger w-full" onClick={() => rec.stop()}>
          ■ Aufnahme beenden ({Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')})
        </button>
      ) : value ? (
        <div className="flex items-center gap-2">
          <audio controls src={url} className="flex-1" />
          <button className="btn-ghost" onClick={() => onChange(undefined)}>
            Löschen
          </button>
        </div>
      ) : (
        <button className="btn-ghost w-full" onClick={() => void start()}>
          ● Aufnahme starten
        </button>
      )}
    </div>
  );
}
