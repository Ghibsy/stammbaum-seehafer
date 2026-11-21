import { describe, expect, it } from 'vitest';
import { backupDue, backupName, backupsToDelete } from '../src/sync/backups';

describe('Sicherungen', () => {
  it('Dateiname JJJJMMTT_HHMM_stammbaum.json', () => {
    expect(backupName(new Date(2026, 10, 20, 9, 5))).toBe('20261120_0905_stammbaum.json');
  });
  it('höchstens eine Sicherung pro Stunde', () => {
    const now = new Date('2026-11-20T10:00:00Z');
    expect(backupDue(undefined, now)).toBe(true);
    expect(backupDue('2026-11-20T09:30:00Z', now)).toBe(false);
    expect(backupDue('2026-11-20T08:59:00Z', now)).toBe(true);
  });
  it('behält letzte 30 und je Tag die erste der letzten 30 Tage, ignoriert fremde Dateien', () => {
    const names: string[] = ['notiz.txt'];
    for (let day = 1; day <= 40; day++) for (const h of ['0800', '1200', '1800']) names.push(`202610${String(day).padStart(2, '0')}_${h}_stammbaum.json`.replace(/^202610(3[2-9]|4\d)/, (m) => m));
    const valid = names.filter((n) => /^2026\d{4}_/.test(n));
    const del = backupsToDelete(valid.concat(['notiz.txt']));
    expect(del).not.toContain('notiz.txt');
    const kept = valid.filter((n) => !del.includes(n));
    // neueste 30 bleiben
    const newest = [...valid].sort().reverse().slice(0, 30);
    for (const n of newest) expect(kept).toContain(n);
    expect(kept.length).toBeLessThanOrEqual(60);
    expect(kept.length).toBeGreaterThan(30);
  });
});
