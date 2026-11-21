import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importWorkbook, readWorkbook, reportToMarkdown } from '../../src/io/excelImport';

/** Lokale Prüfung der neuen Mappe (STAMMBAUM_XLSX_V2). Ausgaben nur in den git-ignorierten Ordner private/. */
const file = process.env.STAMMBAUM_XLSX_V2;

describe.skipIf(!file || !existsSync(file))('Echte Mappe 20.11.2026', () => {
  it('importiert vollständig', () => {
    const buf = readFileSync(file!);
    const { doc, report, images } = importWorkbook(readWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer), file!);
    expect(report.format).toContain('20.11.2026');
    expect(doc.persons).toHaveLength(82);
    expect(doc.parentChild.length + doc.partnerships.length + doc.assertions.length).toBe(105);
    mkdirSync('private', { recursive: true });
    const summary = {
      counts: report.counts,
      images: images.map((i) => ({ id: i.id, ext: i.ext, kb: Math.round(i.bytes.length / 1024), title: i.title, sourceId: i.sourceId, persons: i.personIds.length })),
      warnings: report.warnings,
      unassignable: report.unassignable,
      placeholders: report.placeholderProposals.map((p) => p.label),
      belegt: doc.persons.flatMap((p) => p.events.filter((e) => e.status === 'belegt').map((e) => `${p.id} ${e.type} ${e.citations.map((c) => c.sourceId).join(',')}`)),
      nameCheck: doc.persons.slice(0, 5).map((p) => p.names.map((n) => `${n.type}=${n.value}`).join(' | ')),
      mediaIds: doc.media.map((m) => `${m.id}:${m.file ?? m.url}`),
    };
    writeFileSync('private/summary-v2.json', JSON.stringify(summary, null, 1), 'utf8');
    writeFileSync('private/report-v2.md', reportToMarkdown(report), 'utf8');
  });
});
