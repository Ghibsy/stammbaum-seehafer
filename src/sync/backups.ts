/**
 * Sicherungen im App-Ordner unter backup/JJJJMMTT_HHMM_stammbaum.json.
 * Auto-Save speichert sehr oft; deshalb höchstens eine Sicherung pro Stunde.
 * Aufbewahrt werden die letzten 30 Sicherungen plus je die erste Sicherung der letzten 30 Tage.
 */

const NAME = /^(\d{8})_(\d{4})_stammbaum\.json$/;

export function backupName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}_stammbaum.json`;
}

export function parseBackupName(name: string): { day: string; stamp: string } | undefined {
  const m = name.match(NAME);
  return m ? { day: m[1], stamp: m[1] + m[2] } : undefined;
}

export function backupDue(lastBackupAt: string | undefined, now = new Date(), minMinutes = 60): boolean {
  if (!lastBackupAt) return true;
  return now.getTime() - new Date(lastBackupAt).getTime() >= minMinutes * 60000;
}

/** Liefert die Dateinamen, die gelöscht werden dürfen. Fremde Dateien werden nie angerührt. */
export function backupsToDelete(names: string[], keepLast = 30, keepDays = 30): string[] {
  const valid = names
    .map((n) => ({ n, info: parseBackupName(n) }))
    .filter((x): x is { n: string; info: { day: string; stamp: string } } => !!x.info)
    .sort((a, b) => b.info.stamp.localeCompare(a.info.stamp)); // neueste zuerst
  const keep = new Set(valid.slice(0, keepLast).map((x) => x.n));
  const firstOfDay = new Map<string, string>();
  for (const x of [...valid].reverse()) if (!firstOfDay.has(x.info.day)) firstOfDay.set(x.info.day, x.n);
  const days = [...firstOfDay.keys()].sort().reverse().slice(0, keepDays);
  for (const d of days) keep.add(firstOfDay.get(d)!);
  return valid.filter((x) => !keep.has(x.n)).map((x) => x.n);
}
