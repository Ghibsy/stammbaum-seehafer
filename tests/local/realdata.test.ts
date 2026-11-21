import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importWorkbook, readWorkbook, reportToMarkdown } from '../../src/io/excelImport';
import { applySupplement, parseSupplement } from '../../src/io/supplement';
import { createPlaceholderParents } from '../../src/model/ops';

/**
 * Prüft den Import gegen die echte Arbeitsmappe – nur lokal, wenn STAMMBAUM_XLSX gesetzt ist.
 * Enthält selbst keine Familiendaten. Ausgaben gehen in den git-ignorierten Ordner private/.
 */
const file = process.env.STAMMBAUM_XLSX;
const supFile = process.env.STAMMBAUM_SUPPLEMENT;

describe.skipIf(!file || !existsSync(file))('Echte Arbeitsmappe', () => {
  it('importiert alle Datensätze und wendet alle Ergänzungen fehlerfrei an', () => {
    const buf = readFileSync(file!);
    const { doc, report } = importWorkbook(readWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer), file!);
    expect(doc.persons).toHaveLength(82);
    expect(doc.parentChild.length + doc.partnerships.length + doc.assertions.length).toBe(105);
    for (const p of report.placeholderProposals) createPlaceholderParents(doc, p.memberIds, p.label);
    let log: string[] = [];
    if (supFile && existsSync(supFile)) {
      const sup = parseSupplement(readFileSync(supFile, 'utf8'));
      log = applySupplement(doc, sup.items);
      expect(log.filter((l) => l.includes('FEHLER'))).toEqual([]);
    }
    mkdirSync('private', { recursive: true });
    writeFileSync('private/doc.json', JSON.stringify(doc), 'utf8');
    writeFileSync('private/report.md', reportToMarkdown(report) + '\n\n## Ergänzungen\n\n' + log.join('\n'), 'utf8');
  });
});
