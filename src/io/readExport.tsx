import { renderToStaticMarkup } from 'react-dom/server';
import { formatGenDate, shortYear } from '../model/dates';
import { birthDate, deathDate, displayName, Index, isActive, isDeceased, nameOf, namesOf, treatAsLiving } from '../model/queries';
import type { Person, TreeDoc } from '../model/types';
import { EVENT_TYPE_LABEL, PARTNERSHIP_LABEL, STATUS_LABEL } from '../model/types';
import { setTileMetrics, TILE_H, TILE_W } from '../tree/layout';
import { stammVisible } from '../tree/stamm';
import { stammLayout } from '../tree/stammLayout';
import { Edges } from '../tree/TreeView';

/**
 * Leseansicht als einzelne HTML-Datei für Verwandte: ohne Skripte, ohne externe Inhalte,
 * nicht indexierbar. Lebende werden anonymisiert oder weggelassen.
 */
export interface ReadExportOptions {
  living: 'anonym' | 'aus';
  rootId: string;
  chronicle: boolean;
  obituaries: boolean;
  sources: boolean;
  /** eingebettete Fotos (nur Verstorbene), Medien-ID → data:-URL */
  photos?: Map<string, string>;
  /** bereinigt formatierten Text (im Browser: sanitizeHtml) */
  sanitize: (html: string) => string;
  now?: Date;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function buildReadExport(doc: TreeDoc, opt: ReadExportOptions): { html: string; persons: number; anonymized: number } {
  const now = opt.now ?? new Date();
  const livingIds = new Set(doc.persons.filter((p) => !p.deletedAt && treatAsLiving(p, now)).map((p) => p.id));
  const d: TreeDoc = opt.living === 'aus' ? { ...doc, persons: doc.persons.filter((p) => !livingIds.has(p.id)) } : doc;
  const anon = opt.living === 'anonym' ? livingIds : new Set<string>();
  const idx = new Index(d);
  const label = (p: Person) => (anon.has(p.id) ? 'Lebende Person' : displayName(p));
  const years = (p: Person) => {
    if (anon.has(p.id)) return '';
    const b = shortYear(birthDate(p));
    const t = isDeceased(p) ? shortYear(deathDate(p)) || '?' : '';
    return [b && `*${b}`, t && `†${t}`].filter(Boolean).join(' ');
  };
  const link = (id: string) => {
    const p = idx.person(id);
    return p ? `<a href="#${esc(id)}">${esc(label(p))}</a>` : '';
  };

  // ---------- Baum ----------
  setTileMetrics(170, 58, 'standard');
  const all = [...idx.byId.keys()];
  const s = stammVisible(d, opt.rootId, new Set(all), new Set(all));
  const layout = stammLayout(d, s.rootId ?? opt.rootId, s.visible);
  const pad = 20;
  const tiles = [...layout.nodes.values()].map((n) => {
    const p = n.person;
    const fill = anon.has(p.id) ? '#f3f1ea' : p.sex === 'm' ? '#e4ecf4' : p.sex === 'w' ? '#f6e6e6' : '#f1efe8';
    const nm = label(p);
    return (
      <a key={p.id} href={`#${p.id}`}>
        <rect x={n.x} y={n.y} width={TILE_W} height={TILE_H} rx={10} fill={fill} stroke="#b8b3a6" strokeDasharray={p.kind === 'platzhalter' ? '5 4' : undefined} />
        <text x={n.x + 10} y={n.y + 22} fontSize={13} fontWeight={600} fill="#23271f">
          {nm.length > 24 ? `${nm.slice(0, 23)}…` : nm}
        </text>
        <text x={n.x + 10} y={n.y + 40} fontSize={11} fill="#4b5a4f">
          {years(p)}
        </text>
      </a>
    );
  });
  const svg = renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`${layout.minX - pad} ${layout.minY - pad} ${layout.width + 2 * pad} ${layout.height + 2 * pad}`} width={layout.width + 2 * pad} height={layout.height + 2 * pad} fontFamily="system-ui, sans-serif">
      <Edges layout={layout} />
      {tiles}
    </svg>,
  );

  // ---------- Personen ----------
  const persons = [...idx.byId.values()].sort((a, b) => label(a).localeCompare(label(b), 'de') || a.id.localeCompare(b.id));
  const personHtml = persons
    .map((p) => {
      const parts: string[] = [];
      parts.push(`<h3 id="${esc(p.id)}">${esc(label(p))} <small>${esc(years(p))}</small></h3>`);
      if (!anon.has(p.id)) {
        const photo = p.photoMediaId && isDeceased(p) ? opt.photos?.get(p.photoMediaId) : undefined;
        if (photo) parts.push(`<img class="portrait" src="${photo}" alt="">`);
        const bn = nameOf(p, 'geburtsname');
        const vars = namesOf(p, 'variante');
        if (bn && bn !== nameOf(p, 'nachname')) parts.push(`<p>geb. ${esc(bn)}</p>`);
        if (vars.length) parts.push(`<p class="muted">auch: ${esc(vars.join(', '))}</p>`);
        const ev = p.events.filter((e) => isActive(e.status) && e.type !== 'wohnort' && (e.date || e.place || e.label));
        if (ev.length)
          parts.push(
            `<ul>${ev
              .map((e) => {
                const what = e.type === 'sonstiges' || e.type === 'beruf' ? e.label ?? EVENT_TYPE_LABEL[e.type] : EVENT_TYPE_LABEL[e.type];
                const txt = [formatGenDate(e.date), e.place].filter(Boolean).join(', ');
                return `<li><b>${esc(what)}</b>${txt ? ` ${esc(txt)}` : ''} <span class="st">${esc(STATUS_LABEL[e.status])}</span></li>`;
              })
              .join('')}</ul>`,
          );
      }
      const rel: string[] = [];
      const par = idx.parents(p.id).map(link).filter(Boolean);
      if (par.length) rel.push(`Eltern: ${par.join(', ')}`);
      const pas = d.partnerships.filter((x) => isActive(x.status) && (x.p1 === p.id || x.p2 === p.id));
      for (const x of pas) {
        const other = x.p1 === p.id ? x.p2 : x.p1;
        if (idx.person(other)) rel.push(`${esc(PARTNERSHIP_LABEL[x.state] === 'Art unbekannt' ? 'Partner/in' : PARTNERSHIP_LABEL[x.state])}: ${link(other)}`);
      }
      const kids = idx.children(p.id).map(link).filter(Boolean);
      if (kids.length) rel.push(`Kinder: ${kids.join(', ')}`);
      if (rel.length) parts.push(`<p>${rel.join('<br>')}</p>`);
      if (opt.obituaries && p.obituary && isDeceased(p) && !anon.has(p.id)) parts.push(`<div class="text">${embed(opt.sanitize(p.obituary), opt.photos)}</div>`);
      return `<section class="person">${parts.join('')}</section>`;
    })
    .join('\n');

  // ---------- Chronik ----------
  const chapters = opt.chronicle ? [...d.chronicle].sort((a, b) => a.order - b.order) : [];
  const chronicleHtml = chapters.length
    ? `<h2 id="chronik">Familienchronik</h2>${chapters
        .map((c) => {
          // Kapitel, die lebende Personen betreffen, bleiben bei „weglassen“ draußen
          if (opt.living === 'aus' && c.personIds.some((x) => livingIds.has(x))) return '';
          return `<section class="chapter"><h3>${esc(c.title)}${c.period ? ` <small>${esc(c.period)}</small>` : ''}</h3><div class="text">${embed(opt.sanitize(c.html), opt.photos)}</div></section>`;
        })
        .join('')}`
    : '';

  const sourcesHtml = opt.sources && d.sources.length ? `<h2 id="quellen">Quellen</h2><ul>${d.sources.map((q) => `<li>${esc(q.id)} – ${esc(q.title)}${q.date ? ` (${esc(q.date)})` : ''}</li>`).join('')}</ul>` : '';

  const date = now.toLocaleDateString('de-DE');
  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<title>${esc(doc.meta.name)} – Leseansicht ${esc(date)}</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;color:#23271f;background:#fbf9f3;margin:0;padding:16px;max-width:980px;margin:auto}
h1,h2{font-family:Georgia,serif;color:#2f4a3a}h3{margin:.2em 0}h3 small,.muted,.st{color:#6b6a5f;font-weight:400}.st{font-size:12px}
.note{background:#f4ead6;border-radius:12px;padding:10px 14px}
.tree{overflow:auto;border:1px solid #d9d4c7;border-radius:12px;background:#fff;max-height:80vh}
.person,.chapter{border-top:1px solid #e4e0d4;padding:12px 0}.portrait{float:right;width:96px;height:96px;object-fit:cover;border-radius:50%;margin-left:12px}
.text img{max-width:100%;border-radius:12px}blockquote{border-left:3px solid #b8c7b8;margin-left:0;padding-left:12px;font-style:italic}
a{color:#2f4a3a}nav a{margin-right:12px}
@media print{.tree{max-height:none;overflow:visible}body{background:#fff}}
</style>
</head>
<body>
<h1>${esc(doc.meta.name)}</h1>
<p class="note">Private Familienansicht, erstellt am ${esc(date)}. Bitte nicht veröffentlichen oder ins Internet stellen. ${opt.living === 'anonym' ? 'Lebende Personen sind anonymisiert.' : 'Lebende Personen sind nicht enthalten.'} Angaben tragen ihren Belegstatus (z. B. „Familienangabe“, „unsicher/vorläufig“).</p>
<nav><a href="#baum">Baum</a><a href="#personen">Personen (${persons.length})</a>${chronicleHtml ? '<a href="#chronik">Chronik</a>' : ''}${sourcesHtml ? '<a href="#quellen">Quellen</a>' : ''}</nav>
<h2 id="baum">Stammbaum</h2>
<div class="tree">${svg}</div>
${chronicleHtml}
<h2 id="personen">Personen</h2>
${personHtml}
${sourcesHtml}
</body>
</html>`;
  return { html, persons: persons.length, anonymized: [...anon].filter((x) => idx.person(x)).length };
}

/** <img data-media> → eingebettetes Bild (oder entfernen, wenn nicht verfügbar) */
function embed(html: string, photos?: Map<string, string>): string {
  return html.replace(/<img data-media="(M\d+)"([^>]*)>/g, (_m, id: string, rest: string) => {
    const src = photos?.get(id);
    return src ? `<img src="${src}"${rest}>` : '';
  });
}
