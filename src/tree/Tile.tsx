import { useEffect, useState, type MouseEvent } from 'react';
import { ageAt, formatAge, formatGenDate, shortYear } from '../model/dates';
import { birthDate, deathDate, displayName, eventOf, isActive, isDeceased, nameOf, shortName } from '../model/queries';
import type { Person } from '../model/types';
import { mediaUrl } from '../media/media';
import { useStore } from '../state/store';
import { TILE_H, TILE_W, type LNode } from './layout';
import type { Mark } from './stamm';
import type { ColorScheme, TileContent } from './viewSettings';

export const DEFAULT_TILE: TileContent = { photo: false, callName: true, birthName: false, dates: true, age: false, birthPlace: false, deathPlace: false, residence: false, occupation: false, id: true, status: false, fullDates: false };

function palette(p: Person, colors: ColorScheme) {
  if (p.kind !== 'benannt') return { fill: '#f6f3ec', line: '#b8b3a6', stripe: undefined as string | undefined };
  const male = p.sex === 'm';
  const female = p.sex === 'w';
  if (colors === 'neutral') return { fill: '#fffdf8', line: '#c9c3b4', stripe: undefined };
  if (colors === 'dezent') return { fill: '#fffdf8', line: '#c9c3b4', stripe: male ? 'var(--color-male-line)' : female ? 'var(--color-female-line)' : '#b8b3a6' };
  return { fill: male ? 'var(--color-male)' : female ? 'var(--color-female)' : 'var(--color-neutral)', line: male ? 'var(--color-male-line)' : female ? 'var(--color-female-line)' : '#b8b3a6', stripe: undefined };
}

function useMedia(id: string | undefined, file: string | undefined, enabled: boolean) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let alive = true;
    if (enabled && id) void mediaUrl(id, file).then((u) => alive && setUrl(u));
    else setUrl(undefined);
    return () => {
      alive = false;
    };
  }, [id, file, enabled]);
  return url;
}

/** Textzeilen einer Kachel nach den gewählten Inhalten */
export function tileLines(p: Person, cfg: TileContent, anon: boolean): { name: string; lines: string[] } {
  if (anon) return { name: 'Lebende Person', lines: [] };
  const ph = nameOf(p, 'platzhalter');
  if (p.kind === 'platzhalter' || (!nameOf(p, 'vorname') && !nameOf(p, 'nachname'))) return { name: ph ?? p.id, lines: [] };
  const name = cfg.callName ? shortName(p) : displayName(p);
  const lines: string[] = [];
  const bn = nameOf(p, 'geburtsname');
  if (cfg.birthName && bn && bn !== nameOf(p, 'nachname')) lines.push(`geb. ${bn}`);
  if (cfg.dates) {
    const b = birthDate(p);
    const d = deathDate(p);
    const dead = isDeceased(p);
    const unsureB = eventOf(p, 'geburt')?.status === 'unsicher';
    const unsureD = eventOf(p, 'tod')?.status === 'unsicher';
    const q = (s: string, u: boolean) => (u && s && !s.endsWith('?') ? `${s}?` : s);
    const by = q(shortYear(b), unsureB);
    const dy = q(shortYear(d), unsureD);
    const a = cfg.age && b ? formatAge(dead ? (d ? ageAt(b, d) : undefined) : ageAt(b)) : '';
    if (cfg.fullDates) {
      // Geburtstag und Todestag ausgeschrieben, je eine Zeile
      const bf = q(formatGenDate(b), unsureB);
      const df = q(formatGenDate(d), unsureD);
      if (bf) lines.push(`* ${bf}${a && !dead ? `  (${a})` : ''}`);
      if (dead) lines.push(`† ${df || '?'}${a ? `  (${a})` : ''}`);
    } else {
      let s = [by && `*${by}`, dead ? `†${dy || '?'}` : ''].filter(Boolean).join('  ');
      if (a) s += `  (${a})`;
      if (s) lines.push(s);
    }
  }
  const place = (t: 'geburt' | 'tod') => eventOf(p, t)?.place;
  if (cfg.birthPlace && place('geburt')) lines.push(`* ${place('geburt')}`);
  if (cfg.deathPlace && place('tod')) lines.push(`† ${place('tod')}`);
  if (cfg.residence) {
    const res = p.events.filter((e) => e.type === 'wohnort' && isActive(e.status) && e.place);
    const cur = res.find((e) => e.current) ?? res[res.length - 1];
    if (cur?.place) lines.push(`⌂ ${cur.place}`);
  }
  if (cfg.occupation) {
    const job = p.events.filter((e) => e.type === 'beruf' && isActive(e.status)).pop();
    const t = job?.label && job.label !== 'Beruf' ? job.label : job?.place;
    if (t) lines.push(t);
  }
  return { name, lines };
}

function fit(s: string, maxChars: number) {
  return s.length > maxChars ? s.slice(0, maxChars - 1) + '…' : s;
}

export interface TileProps {
  n: LNode;
  focus: boolean;
  onOpen: () => void;
  anon?: boolean;
  cfg?: TileContent;
  colors?: ColorScheme;
  up?: Mark;
  down?: Mark;
  onToggleUp?: () => void;
  onToggleDown?: () => void;
  onAdd?: () => void;
}

export function Tile({ n, focus, onOpen, anon = false, cfg = DEFAULT_TILE, colors = 'geschlecht', up, down, onToggleUp, onToggleDown, onAdd }: TileProps) {
  const p = n.person;
  const media = useStore((s) => s.doc.media.find((m) => m.id === p.photoMediaId));
  const photoOn = cfg.photo && !anon && !!media;
  const photo = useMedia(media?.id, media?.file, photoOn);
  const w = TILE_W;
  const h = TILE_H;
  const pal = palette(p, colors);
  const { name, lines } = tileLines(p, cfg, anon);
  const placeholder = p.kind !== 'benannt';
  const photoSize = h >= 90 ? 40 : 30;
  const showPhoto = photoOn && !!photo;
  const left = 10 + (pal.stripe ? 4 : 0) + (showPhoto ? photoSize + 8 : 0);
  const charW = 6.6;
  const maxChars = Math.floor((w - left - 8) / charW);
  const lineH = 13.5;
  const nameLines = wrapName(name, Math.floor((w - left - 8) / 7.4));
  const room = Math.max(0, Math.floor((h - 14 - nameLines.length * 15 - (cfg.id ? 10 : 0)) / lineH));
  const shown = lines.slice(0, room);
  const belegt = cfg.status && !anon && p.events.some((e) => (e.type === 'geburt' || e.type === 'tod') && e.status === 'belegt');
  const stop = (fn?: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn?.();
  };
  const clipId = `ph-${p.id}`;
  return (
    <g transform={`translate(${n.x},${n.y})`} style={{ cursor: 'pointer' }}>
      <g onClick={onOpen} role="button" aria-label={name}>
        <rect width={w} height={h} rx={12} fill={pal.fill} stroke={focus ? '#2f4a3a' : pal.line} strokeWidth={focus ? 3 : 1.3} strokeDasharray={placeholder ? '5 4' : undefined} />
        {pal.stripe && <rect x={0} y={0} width={5} height={h} rx={2} fill={pal.stripe} />}
        {showPhoto && (
          <>
            <clipPath id={clipId}>
              <circle cx={10 + (pal.stripe ? 4 : 0) + photoSize / 2} cy={10 + photoSize / 2} r={photoSize / 2} />
            </clipPath>
            <image href={photo} x={10 + (pal.stripe ? 4 : 0)} y={10} width={photoSize} height={photoSize} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} />
          </>
        )}
        {p.kind === 'platzhalter' ? (
          <text x={w / 2} y={h / 2 + 4} textAnchor="middle" fontSize={11} fill="#6b6a5f" fontStyle="italic">
            {wrapName(name, Math.floor(w / 6.4))
              .slice(0, 3)
              .map((l, i, arr) => (
                <tspan key={i} x={w / 2} dy={i === 0 ? -(arr.length - 1) * 6.5 : 13}>
                  {l}
                </tspan>
              ))}
          </text>
        ) : (
          <>
            <text x={left} y={20} fontSize={13} fontWeight={600} fill="#23271f" fontStyle={placeholder ? 'italic' : undefined}>
              {nameLines.map((l, i) => (
                <tspan key={i} x={left} dy={i === 0 ? 0 : 15}>
                  {l}
                </tspan>
              ))}
            </text>
            <text x={left} y={20 + nameLines.length * 15 + 2} fontSize={11} fill="#4b5a4f">
              {shown.map((l, i) => (
                <tspan key={i} x={left} dy={i === 0 ? 0 : lineH}>
                  {fit(l, maxChars)}
                </tspan>
              ))}
            </text>
          </>
        )}
        {cfg.id && (
          <text x={w - 8} y={h - 7} fontSize={9} fill="#8a8778" textAnchor="end">
            {p.id}
          </text>
        )}
        {belegt && (
          <text x={w - 9} y={15} fontSize={11} fill="#2f4a3a" textAnchor="end" aria-label="dokumentarisch belegt">
            ✓
          </text>
        )}
        {n.loose && (
          <text x={w - 8} y={14} fontSize={9} fill="#a3432b" textAnchor="end">
            ohne Anschluss
          </text>
        )}
      </g>
      {up && onToggleUp && <Pill x={w / 2} y={-11} label={up.open ? '− ▲' : `▲ ${up.hidden}`} title={up.open ? 'Vorfahren zuklappen' : `${up.hidden} Vorfahren aufklappen`} onClick={stop(onToggleUp)} open={up.open} />}
      {down && onToggleDown && <Pill x={w / 2} y={h + 11} label={down.open ? '− ▼' : `▼ ${down.hidden}`} title={down.open ? 'Nachfahren zuklappen' : `${down.hidden} Nachfahren aufklappen`} onClick={stop(onToggleDown)} open={down.open} />}
      {onAdd && (
        // dezentes Plus unten rechts neben der ID; die unsichtbare Fläche erleichtert das Tippen
        <g onClick={stop(onAdd)} role="button" aria-label={`Person zu ${name} hinzufügen`} transform={`translate(${w - (cfg.id ? 14 + p.id.length * 5.4 : 4) - 8},${h - 10})`}>
          <rect x={-14} y={-14} width={28} height={28} fill="transparent" />
          <circle r={7} fill="#eef2ec" stroke="#8aa08f" strokeWidth={0.8} />
          <text y={3.6} textAnchor="middle" fontSize={11} fontWeight={600} fill="#2f4a3a">
            +
          </text>
          <title>Neue Person mit Beziehung zu {name}</title>
        </g>
      )}
    </g>
  );
}

function Pill({ x, y, label, title, onClick, open }: { x: number; y: number; label: string; title: string; onClick: (e: MouseEvent) => void; open: boolean }) {
  const pw = Math.max(40, label.length * 8 + 14);
  return (
    <g onClick={onClick} role="button" aria-label={title}>
      <rect x={x - pw / 2} y={y - 12} width={pw} height={24} rx={12} fill={open ? '#fffdf8' : '#e3ebe2'} stroke="#2f4a3a" strokeWidth={1.2} />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill="#2f4a3a">
        {label}
      </text>
      <title>{title}</title>
    </g>
  );
}

function wrapName(s: string, max: number): string[] {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > 2) lines[1] = fit(lines.slice(1).join(' '), max);
  return lines.slice(0, 2);
}
