import { useEffect, useRef, useState } from 'react';
import { mediaUrl } from '../media/media';
import { useStore } from '../state/store';
import { sanitizeHtml } from './sanitize';

/** Bilder mit data-media aus dem Gerätespeicher/OneDrive nachladen (src wird nie gespeichert) */
function useResolveImages(ref: React.RefObject<HTMLElement | null>, dep: unknown) {
  const media = useStore((s) => s.doc.media);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    for (const img of Array.from(el.querySelectorAll<HTMLImageElement>('img[data-media]'))) {
      const m = media.find((x) => x.id === img.dataset.media);
      img.style.maxWidth = '100%';
      img.style.borderRadius = '12px';
      if (m) void mediaUrl(m.id, m.file).then((u) => u && (img.src = u));
    }
  }, [ref, dep, media]);
}

export function RichTextView({ html, className = '' }: { html?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const clean = html ? sanitizeHtml(html) : '';
  useResolveImages(ref, clean);
  return <div ref={ref} className={`richtext ${className}`} dangerouslySetInnerHTML={{ __html: clean }} />;
}

type Cmd = [label: string, title: string, run: () => void];

/**
 * Einfacher Editor: Überschriften, fett, kursiv, Listen, Zitat, Bilder aus den eigenen Medien.
 * Gespeichert wird beim Verlassen des Feldes, immer bereinigt.
 */
export function RichTextEditor({ value, onCommit, placeholder, mediaIds }: { value?: string; onCommit: (html: string) => void; placeholder?: string; mediaIds?: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const media = useStore((s) => s.doc.media);
  const [pick, setPick] = useState(false);
  const initial = value ? sanitizeHtml(value) : '';
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) ref.current.innerHTML = initial;
  }, [initial]);
  useResolveImages(ref, initial);
  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
  };
  const commit = () => {
    if (!ref.current) return;
    const html = sanitizeHtml(ref.current.innerHTML);
    if (html !== initial) onCommit(html);
  };
  const cmds: Cmd[] = [
    ['Ü1', 'Überschrift', () => exec('formatBlock', '<h2>')],
    ['Ü2', 'Zwischenüberschrift', () => exec('formatBlock', '<h3>')],
    ['¶', 'Absatz', () => exec('formatBlock', '<p>')],
    ['F', 'Fett', () => exec('bold')],
    ['K', 'Kursiv', () => exec('italic')],
    ['•', 'Aufzählung', () => exec('insertUnorderedList')],
    ['1.', 'Nummerierte Liste', () => exec('insertOrderedList')],
    ['❝', 'Zitat', () => exec('formatBlock', '<blockquote>')],
  ];
  const images = media.filter((m) => m.mime.startsWith('image/') && (!mediaIds || mediaIds.includes(m.id)));
  return (
    <div className="rounded-2xl border border-line bg-card">
      <div className="flex flex-wrap gap-1 border-b border-line p-1">
        {cmds.map(([label, title, run]) => (
          <button key={title} type="button" className="min-h-10 min-w-10 rounded-lg px-2 text-sm font-semibold text-moss hover:bg-paper" title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={run}>
            {label}
          </button>
        ))}
        <button type="button" className="min-h-10 rounded-lg px-2 text-sm text-moss hover:bg-paper" onMouseDown={(e) => e.preventDefault()} onClick={() => setPick(!pick)} disabled={!images.length} title={images.length ? 'Bild einfügen' : 'Keine Bilder vorhanden'}>
          🖼 Bild
        </button>
      </div>
      {pick && (
        <div className="flex gap-2 overflow-x-auto border-b border-line p-2">
          {images.map((m) => (
            <Thumb
              key={m.id}
              id={m.id}
              file={m.file}
              title={m.title}
              onPick={() => {
                exec('insertHTML', `<img data-media="${m.id}" alt="${m.title.replace(/[<>"&]/g, '')}"><p><br></p>`);
                setPick(false);
                commit();
              }}
            />
          ))}
        </div>
      )}
      <div
        ref={ref}
        className="richtext min-h-40 p-3 outline-none empty:before:text-muted empty:before:content-[attr(data-placeholder)]"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onBlur={commit}
      />
    </div>
  );
}

function Thumb({ id, file, title, onPick }: { id: string; file?: string; title: string; onPick: () => void }) {
  const [u, setU] = useState<string>();
  useEffect(() => void mediaUrl(id, file).then(setU), [id, file]);
  return (
    <button type="button" className="shrink-0 overflow-hidden rounded-xl border border-line" onMouseDown={(e) => e.preventDefault()} onClick={onPick} title={title}>
      {u ? <img src={u} alt={title} className="h-16 w-16 object-cover" /> : <span className="block h-16 w-16 p-1 text-xs">{id}</span>}
    </button>
  );
}
