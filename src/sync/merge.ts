/**
 * Dreiwege-Zusammenführung von stammbaum.json:
 *   base   = letzter gemeinsamer Stand (zuletzt erfolgreich synchronisiert)
 *   local  = Stand auf diesem Gerät
 *   remote = aktueller Stand in OneDrive
 * Arrays aus Objekten mit `id` werden als Mengen nach ID zusammengeführt, Objekte feldweise.
 * Ändert nur eine Seite ein Feld, gewinnt diese Seite. Ändern beide Seiten dasselbe Feld
 * unterschiedlich, entsteht ein Konflikt – nie wird stillschweigend überschrieben.
 */

export interface MergeConflict {
  /** lesbarer Pfad, z. B. persons[P017].names[n_ab12].value */
  path: string;
  base: unknown;
  local: unknown;
  remote: unknown;
}

export interface MergeResult<T> {
  merged: T;
  conflicts: MergeConflict[];
}

const ABSENT = Symbol('absent');
type Val = unknown | typeof ABSENT;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isIdArray(v: unknown): v is { id: string }[] {
  return Array.isArray(v) && v.every((x) => isObj(x) && typeof x.id === 'string');
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => deepEqual(x, bb[i]));
  }
  const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Auflösung je Konflikt: 'local' | 'remote' | eigener Wert */
export type Resolution = { path: string; choice: 'local' | 'remote' } ;

export function merge3<T>(base: T, local: T, remote: T, resolutions: Resolution[] = []): MergeResult<T> {
  const conflicts: MergeConflict[] = [];
  const res = new Map(resolutions.map((r) => [r.path, r.choice]));
  const out = mergeVal(base, local, remote, '', conflicts, res);
  return { merged: (out === ABSENT ? undefined : out) as T, conflicts };
}

function norm(v: Val): Val {
  return v === undefined ? ABSENT : v;
}

function mergeVal(b: Val, l: Val, r: Val, path: string, conflicts: MergeConflict[], res: Map<string, 'local' | 'remote'>): Val {
  b = norm(b);
  l = norm(l);
  r = norm(r);
  const eq = (x: Val, y: Val) => (x === ABSENT || y === ABSENT ? x === y : deepEqual(x, y));
  if (eq(l, r)) return l;
  if (eq(b, l)) return r; // nur remote geändert
  if (eq(b, r)) return l; // nur lokal geändert

  // beide geändert
  if (isObj(l) && isObj(r)) {
    const bo = isObj(b) ? b : {};
    const keys = new Set([...Object.keys(bo), ...Object.keys(l), ...Object.keys(r)]);
    const o: Record<string, unknown> = {};
    for (const k of keys) {
      const v = mergeVal(bo[k], l[k], r[k], path ? `${path}.${k}` : k, conflicts, res);
      if (v !== ABSENT) o[k] = v;
    }
    return o;
  }
  if (isIdArray(l) && isIdArray(r) && (b === ABSENT || isIdArray(b))) {
    const bm = new Map((b === ABSENT ? [] : (b as { id: string }[])).map((x) => [x.id, x]));
    const lm = new Map(l.map((x) => [x.id, x]));
    const rm = new Map(r.map((x) => [x.id, x]));
    // Reihenfolge: lokale Reihenfolge, danach neue remote-Einträge
    const order: string[] = [];
    for (const x of l) order.push(x.id);
    for (const x of r) if (!lm.has(x.id)) order.push(x.id);
    for (const x of bm.keys()) if (!order.includes(x)) order.push(x);
    const arr: unknown[] = [];
    for (const id of order) {
      const v = mergeVal(bm.get(id), lm.get(id), rm.get(id), `${path}[${id}]`, conflicts, res);
      if (v !== ABSENT) arr.push(v);
    }
    return arr;
  }
  // echter Konflikt
  const choice = res.get(path);
  if (choice === 'local') return l;
  if (choice === 'remote') return r;
  conflicts.push({ path, base: b === ABSENT ? undefined : b, local: l === ABSENT ? undefined : l, remote: r === ABSENT ? undefined : r });
  return l; // vorläufig lokal, bis der Konflikt entschieden ist
}
