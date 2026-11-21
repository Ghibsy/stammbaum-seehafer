import { shortYear } from '../model/dates';
import { birthDate, deathDate, Index, isDeceased, shortName } from '../model/queries';
import type { Person, TreeDoc } from '../model/types';

/**
 * Fächer: Vorfahren im Halbkreis (Ahnentafel-Nummerierung: Vater links, Mutter rechts).
 * Leere Felder zeigen auf einen Blick, wo Vorfahren fehlen.
 */

export interface FanSlot {
  gen: number;
  index: number; // 0 … 2^gen-1
  a0: number;
  a1: number;
  r0: number;
  r1: number;
  person?: Person;
}

export interface Fan {
  slots: FanSlot[];
  focus?: Person;
  width: number;
  height: number;
  minX: number;
  minY: number;
  persons: number;
}

const R0 = 90;
const RING = 92;

export function computeFan(doc: TreeDoc, focusId: string, gens: number): Fan {
  const idx = new Index(doc);
  const focus = idx.person(focusId);
  const slots: FanSlot[] = [];
  let level: (string | undefined)[] = [focusId];
  let persons = focus ? 1 : 0;
  for (let gen = 1; gen <= gens; gen++) {
    const next: (string | undefined)[] = [];
    for (const id of level) {
      if (!id) {
        next.push(undefined, undefined);
        continue;
      }
      const ps = idx.parents(id).map((p) => idx.person(p)!).filter(Boolean);
      const father = ps.find((p) => p.sex === 'm') ?? ps.find((p) => p.sex !== 'w' && p.kind !== 'platzhalter');
      const mother = ps.find((p) => p.sex === 'w' && p !== father) ?? ps.find((p) => p !== father);
      next.push(father?.id, mother?.id);
    }
    const n = next.length;
    next.forEach((id, i) => {
      const a0 = Math.PI + (Math.PI * i) / n;
      const a1 = Math.PI + (Math.PI * (i + 1)) / n;
      const person = id ? idx.person(id) : undefined;
      if (person) persons++;
      slots.push({ gen, index: i, a0, a1, r0: R0 + (gen - 1) * RING, r1: R0 + gen * RING, person });
    });
    level = next;
  }
  const R = R0 + gens * RING;
  return { slots, focus, width: 2 * R, height: R + 40, minX: -R, minY: -R, persons };
}

function arc(s: FanSlot): string {
  const p = (r: number, a: number) => `${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`;
  const large = s.a1 - s.a0 > Math.PI ? 1 : 0;
  return `M${p(s.r0, s.a0)} L${p(s.r1, s.a0)} A${s.r1},${s.r1} 0 ${large} 1 ${p(s.r1, s.a1)} L${p(s.r0, s.a1)} A${s.r0},${s.r0} 0 ${large} 0 ${p(s.r0, s.a0)} Z`;
}

function years(p: Person) {
  const b = shortYear(birthDate(p));
  const d = shortYear(deathDate(p));
  return [b && `*${b}`, isDeceased(p) ? `†${d || '?'}` : ''].filter(Boolean).join(' ');
}

export function FanG({ fan, onOpen, anon }: { fan: Fan; onOpen: (id: string) => void; anon: Set<string> }) {
  return (
    <g>
      {fan.slots.map((s) => {
        const p = s.person;
        const mid = (s.a0 + s.a1) / 2;
        const rm = (s.r0 + s.r1) / 2;
        const fill = !p ? 'none' : p.kind !== 'benannt' ? '#f6f3ec' : p.sex === 'm' ? 'var(--color-male)' : p.sex === 'w' ? 'var(--color-female)' : 'var(--color-neutral)';
        const span = (s.a1 - s.a0) * rm; // verfügbare Bogenlänge
        const tangential = span > 150; // innere Ringe: Text entlang des Bogens, äußere: radial
        const deg = (mid * 180) / Math.PI; // 180° (links) … 360° (rechts), oben = 270°
        // innen entlang des Bogens, außen radial – jeweils lesbar (nicht kopfüber)
        const rot = tangential ? deg + 90 : deg < 270 ? deg - 180 : deg;
        const label = p ? (anon.has(p.id) ? 'Lebende Person' : shortName(p)) : '';
        const fs = Math.max(8, Math.min(13, (tangential ? span : RING) / Math.max(8, label.length * 0.62)));
        return (
          <g key={`${s.gen}-${s.index}`} onClick={() => p && onOpen(p.id)} style={{ cursor: p ? 'pointer' : 'default' }}>
            <path d={arc(s)} fill={fill} stroke={p ? '#b8b3a6' : '#d9d3c4'} strokeWidth={1} strokeDasharray={p ? (p.kind !== 'benannt' ? '4 3' : undefined) : '3 4'} />
            {p && (
              <text transform={`translate(${rm * Math.cos(mid)},${rm * Math.sin(mid)}) rotate(${rot})`} textAnchor="middle" fontSize={fs} fill="#23271f" fontStyle={p.kind !== 'benannt' ? 'italic' : undefined}>
                <tspan x={0} dy={tangential ? -2 : 3}>
                  {label.length > 26 ? label.slice(0, 25) + '…' : label}
                </tspan>
                {tangential && !anon.has(p.id) && (
                  <tspan x={0} dy={fs + 2} fontSize={fs - 2} fill="#4b5a4f">
                    {years(p)}
                  </tspan>
                )}
              </text>
            )}
          </g>
        );
      })}
      {fan.focus && (
        <g onClick={() => onOpen(fan.focus!.id)} style={{ cursor: 'pointer' }}>
          <path d={`M${-R0},0 A${R0},${R0} 0 0 1 ${R0},0 Z`} fill="#2f4a3a" />
          <text x={0} y={-30} textAnchor="middle" fontSize={14} fill="#fff" fontWeight={600}>
            {anon.has(fan.focus.id) ? 'Lebende Person' : shortName(fan.focus)}
          </text>
          {!anon.has(fan.focus.id) && (
            <text x={0} y={-12} textAnchor="middle" fontSize={11} fill="#e3ebe2">
              {years(fan.focus)}
            </text>
          )}
        </g>
      )}
    </g>
  );
}
