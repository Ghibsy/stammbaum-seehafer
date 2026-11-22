/**
 * Formatierter Text (Nachruf, Chronik) als stark eingeschränktes HTML.
 * Erlaubt: Absätze, Überschriften (h2, h3), fett, kursiv, Listen, Zitat, Zeilenumbruch und Bilder
 * aus den eigenen Medien (<img data-media="M001">). Alles andere – Skripte, Links, Stile,
 * Ereignis-Attribute, fremde Bildquellen – wird beim Speichern und beim Anzeigen entfernt.
 */

const ALLOWED = new Set(['P', 'H2', 'H3', 'B', 'STRONG', 'I', 'EM', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'BR', 'IMG']);
const RENAME: Record<string, string> = { DIV: 'P', H1: 'H2', H4: 'H3', H5: 'H3', H6: 'H3' };
const DROP_WITH_CONTENT = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'MATH', 'HEAD', 'TITLE', 'META', 'LINK']);

export function isHtml(s: string | undefined): boolean {
  return !!s && /^\s*<(p|h[1-6]|ul|ol|blockquote|img|b|i|strong|em|br|div|span)[\s>/]/i.test(s);
}

const escapeText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Alter Freitext → Absätze */
export function textToHtml(s: string): string {
  return s
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeText(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function sanitizeHtml(input: string, parser: DOMParser = new DOMParser()): string {
  const src = isHtml(input) ? input : textToHtml(input);
  const doc = parser.parseFromString(`<body>${src}</body>`, 'text/html');
  const out = doc.createElement('div');
  const walk = (from: Node, to: Element) => {
    for (const n of Array.from(from.childNodes)) {
      if (n.nodeType === 3) {
        to.appendChild(doc.createTextNode(n.textContent ?? ''));
        continue;
      }
      if (n.nodeType !== 1) continue;
      const el = n as Element;
      let tag = el.tagName.toUpperCase();
      if (DROP_WITH_CONTENT.has(tag)) continue;
      tag = RENAME[tag] ?? tag;
      if (!ALLOWED.has(tag)) {
        walk(el, to); // unbekannte Hülle (span, a, font …): Inhalt behalten
        continue;
      }
      if (tag === 'IMG') {
        const id = el.getAttribute('data-media') ?? '';
        if (!/^M\d{1,6}$/.test(id)) continue;
        const img = doc.createElement('img');
        img.setAttribute('data-media', id);
        const alt = el.getAttribute('alt');
        if (alt) img.setAttribute('alt', alt.slice(0, 200));
        to.appendChild(img);
        continue;
      }
      const clean = doc.createElement(tag.toLowerCase());
      to.appendChild(clean);
      walk(el, clean);
    }
  };
  walk(doc.body, out);
  // leere Absätze am Ende entfernen
  return out.innerHTML.replace(/(<p>(<br>)?<\/p>)+$/, '').trim();
}

/** Reiner Text (für Export, Suche) */
export function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|h2|h3|li|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<img[^>]*>/gi, '[Bild]')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
