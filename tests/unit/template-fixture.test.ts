/**
 * Template-shaped fixture e2e tests (T7)
 *
 * Reconstructs the real-world Abrechnungsbogen template paragraph that
 * produced the original bug (see .omo/drafts/unify-marker-engine.md,
 * Findings): a bold single-run DIAGNOSE3 marker among non-bold siblings,
 * bold " / " separator runs, a non-bold DIAGNOSE1 marker with a leading
 * space + xml:space="preserve", and a "(mind. 1)" tail run.
 *
 * The fixture docx is built AT TEST TIME with JSZip into a temp dir — no
 * binary is committed and no absolute user path is read. Unlike the
 * createTestDocx helper in replacer.test.ts, the generator here emits a
 * COMPLETE minimal OPC package including word/_rels/document.xml.rels, so
 * the python-docx round-trip gate (run externally over the kept outputs)
 * exercises engine output rather than fixture plumbing.
 *
 * Output docx files are copied to tests/temp-template-fixture/keep/ (stable
 * for the duration of the run) so the external round-trip gate can re-open
 * every document this suite produces.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { replaceMarkers } from '../../src/main/services/replacer';
import type { ReplacementRequest } from '../../src/shared/types/data-models';

// Mirror replacer.test.ts: mock copyDocxFiles with an actual-copy
// implementation so replaceMarkers runs against real files in temp dirs.
vi.mock('../../src/main/utils/file', () => ({
  copyDocxFiles: vi.fn(async (sourceDir: string, outputDir: string) => {
    const fs = await import('fs/promises');
    const path = await import('path');

    const files = await fs.readdir(sourceDir);
    const docxFiles = files.filter((f) => f.endsWith('.docx'));

    const copiedFiles: string[] = [];
    for (const file of docxFiles) {
      await fs.copyFile(path.join(sourceDir, file), path.join(outputDir, file));
      copiedFiles.push(file);
    }

    return {
      success: true,
      copied: copiedFiles.length,
      failed: 0,
      copiedFiles,
      failedFiles: []
    };
  })
}));

// --- Verbatim template-paragraph building blocks ----------------------------
// Bold rPr exactly as recorded from the user's template (drafts Findings).
const BOLD_RPR =
  '<w:rPr><w:rFonts w:eastAsia="Times New Roman" w:cs="Calibri" w:cstheme="minorHAnsi"/><w:b/><w:bCs/><w:sz w:val="24"/></w:rPr>';
// Non-bold sibling rPr (Calibri body text, no explicit size).
const PLAIN_RPR =
  '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Times New Roman" w:cs="Calibri" w:cstheme="minorHAnsi"/></w:rPr>';

const SEPARATOR_RUN = `<w:r w:rsidR="00A15A3C">${BOLD_RPR}<w:t xml:space="preserve"> / </w:t></w:r>`;
const TAIL_RUN = `<w:r w:rsidR="00A15A3C">${PLAIN_RPR}<w:t xml:space="preserve">(mind. 1)</w:t></w:r>`;
const DIAGNOSE1_RUN = `<w:r w:rsidR="00A15A3C">${PLAIN_RPR}<w:t xml:space="preserve"> REPLACEME-DIAGNOSE1</w:t></w:r>`;
const DIAGNOSE2_RUN = `<w:r w:rsidR="00A15A3C">${PLAIN_RPR}<w:t>REPLACEME-DIAGNOSE2</w:t></w:r>`;
const DIAGNOSE3_RUN = `<w:r w:rsidRPr="00A15A3C">${BOLD_RPR}<w:t>REPLACEME-DIAGNOSE3</w:t></w:r>`;

// The template paragraph: pPr spacing/ind block, proofErr noise, rsid
// attributes — real-Word noise per the plan (Metis 25).
const TEMPLATE_PARAGRAPH_XML = `<w:p w:rsidR="00A15A3C" w:rsidRDefault="00A15A3C"><w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/><w:ind w:left="284"/>${PLAIN_RPR}</w:pPr><w:proofErr w:type="spellStart" w:pos1="271"/>${DIAGNOSE1_RUN}${SEPARATOR_RUN}${DIAGNOSE2_RUN}${SEPARATOR_RUN}${DIAGNOSE3_RUN}${TAIL_RUN}<w:proofErr w:type="spellEnd"/></w:p>`;
const TEMPLATE_DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${TEMPLATE_PARAGRAPH_XML}
  </w:body>
</w:document>`;

// T1 cross-run regression shape (two runs, different rPr, marker split
// mid-identifier) plus a single-run control marker.
const CROSS_RUN_PARAGRAPH_XML = `<w:p w:rsidR="00A15A3C"><w:r w:rsidR="00A1"><w:rPr><w:sz w:val="24"/></w:rPr><w:t>REPLACEM</w:t></w:r><w:r><w:rPr><w:b/><w:bCs/><w:sz w:val="28"/></w:rPr><w:t>E-DIAGNOSE3</w:t></w:r><w:r><w:t> and REPLACEME-CONTROL</w:t></w:r></w:p>`;

const CROSS_RUN_DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${CROSS_RUN_PARAGRAPH_XML}
  </w:body>
</w:document>`;

describe('Template-shaped fixture e2e (unified marker engine)', () => {
  const testDir = path.join(process.cwd(), 'tests', 'temp-template-fixture');
  const sourceDir = path.join(testDir, 'source');
  const outputDir = path.join(testDir, 'output');
  // Stable path kept for the whole run: the external python-docx round-trip
  // gate re-opens every output docx copied here.
  const keepDir = path.join(testDir, 'keep');

  beforeAll(async () => {
    // One fresh keep dir per file run: outputs copied here survive the
    // per-test cleanup so the external round-trip gate can re-open them.
    await fs.rm(keepDir, { recursive: true, force: true });
    await fs.mkdir(keepDir, { recursive: true });
  });

  beforeEach(async () => {
    await fs.rm(sourceDir, { recursive: true, force: true });
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.rm(outputDir, { recursive: true, force: true });
    await fs.mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    // Mirror replacer.test.ts lifecycle: clean the working dirs, but keep
    // the copied outputs so the round-trip gate can run after the suite.
    await fs.rm(sourceDir, { recursive: true, force: true });
    await fs.rm(outputDir, { recursive: true, force: true });
  });

  describe('full template paragraph through replaceMarkers', () => {
    it('replaces all three markers, keeping bold DIAGNOSE3 formatting, non-bold siblings, separators and tail byte-identical', async () => {
      const docxPath = path.join(sourceDir, 'abrechnungsbogen-fixture.docx');
      await buildTestDocx(docxPath, TEMPLATE_DOCUMENT_XML);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: {
          DIAGNOSE1: 'Diagnose Eins',
          DIAGNOSE2: 'Diagnose Zwei',
          DIAGNOSE3: 'Diagnose Drei'
        },
        prefix: 'REPLACEME-'
      };

      const result = await replaceMarkers(request);

      expect(result.success).toBe(true);
      expect(result.processed).toBe(1);
      expect(result.errors).toBe(0);

      const outputPath = path.join(outputDir, 'abrechnungsbogen-fixture.docx');
      const outputXml = await extractDocumentXml(outputPath);

      // No marker remains anywhere in the output.
      expect(outputXml).not.toContain('REPLACEME-DIAGNOSE1');
      expect(outputXml).not.toContain('REPLACEME-DIAGNOSE2');
      expect(outputXml).not.toContain('REPLACEME-DIAGNOSE3');

      // DIAGNOSE3 was a SINGLE bold run: in-place semantics keep its run
      // formatting untouched, so the value sits in a run whose rPr still
      // carries <w:b/> and <w:sz w:val="24"/>.
      const boldRun = extractRunContaining(outputXml, 'Diagnose Drei');
      expect(boldRun).not.toBeNull();
      expect(boldRun).toContain('<w:b/>');
      expect(boldRun).toContain('<w:bCs/>');
      expect(boldRun).toContain('<w:sz w:val="24"/>');

      // DIAGNOSE1 and DIAGNOSE2 were non-bold runs: their replacements stay
      // non-bold (their runs keep the original rPr).
      const diagnose1Run = extractRunContaining(outputXml, 'Diagnose Eins');
      expect(diagnose1Run).not.toBeNull();
      expect(diagnose1Run).toMatch(/<w:t xml:space="preserve"> Diagnose Eins<\/w:t>/);
      expect(/<w:b\b/.test(diagnose1Run ?? '')).toBe(false);

      const diagnose2Run = extractRunContaining(outputXml, 'Diagnose Zwei');
      expect(diagnose2Run).not.toBeNull();
      expect(/<w:b\b/.test(diagnose2Run ?? '')).toBe(false);

      // Both bold " / " separator runs and the "(mind. 1)" tail survive
      // byte-identical.
      expect(countOccurrences(outputXml, SEPARATOR_RUN)).toBe(2);
      expect(outputXml).toContain(TAIL_RUN);

      // Keep the output for the external python-docx round-trip gate.
      await fs.copyFile(outputPath, path.join(keepDir, 'e2e-output.docx'));
    });

    it('leaves the DIAGNOSE3 marker run byte-identical when its value is missing from the request', async () => {
      const docxPath = path.join(sourceDir, 'abrechnungsbogen-fixture.docx');
      await buildTestDocx(docxPath, TEMPLATE_DOCUMENT_XML);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: {
          DIAGNOSE1: 'Diagnose Eins',
          DIAGNOSE2: 'Diagnose Zwei'
        },
        prefix: 'REPLACEME-'
      };

      const result = await replaceMarkers(request);

      expect(result.success).toBe(true);
      expect(result.processed).toBe(1);
      expect(result.errors).toBe(0);

      const outputPath = path.join(outputDir, 'abrechnungsbogen-fixture.docx');
      const outputXml = await extractDocumentXml(outputPath);

      // In-values markers are consumed...
      expect(outputXml).not.toContain('REPLACEME-DIAGNOSE1');
      expect(outputXml).not.toContain('REPLACEME-DIAGNOSE2');

      // ...while the out-of-values DIAGNOSE3 run is byte-identical to the
      // input — no spurious rewrite of an unmatched marker.
      const untouchedRun = extractRunContaining(outputXml, 'REPLACEME-DIAGNOSE3');
      expect(untouchedRun).toBe(DIAGNOSE3_RUN);

      // Keep the output for the external python-docx round-trip gate.
      await fs.copyFile(outputPath, path.join(keepDir, 'failure-path-output.docx'));
    });
  });

  describe('cross-run regression shape round-trip fixture', () => {
    it('replaces the cross-run marker with merged bold formatting and keeps the control marker replaced', async () => {
      const docxPath = path.join(sourceDir, 'cross-run-fixture.docx');
      await buildTestDocx(docxPath, CROSS_RUN_DOCUMENT_XML);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: {
          DIAGNOSE3: 'Cross Run Value',
          CONTROL: 'Control Value'
        },
        prefix: 'REPLACEME-'
      };

      const result = await replaceMarkers(request);

      expect(result.success).toBe(true);
      expect(result.processed).toBe(1);
      expect(result.errors).toBe(0);

      const outputPath = path.join(outputDir, 'cross-run-fixture.docx');
      const outputXml = await extractDocumentXml(outputPath);

      // The cross-run marker is consumed and the merged replacement run
      // carries the bold + largest-size formatting from the fragments.
      expect(outputXml).toContain('Cross Run Value');
      expect(outputXml).not.toContain('REPLACEM');
      const mergedRun = extractRunContaining(outputXml, 'Cross Run Value');
      expect(mergedRun).not.toBeNull();
      expect(mergedRun).toContain('<w:b/>');
      expect(mergedRun).toContain('<w:sz w:val="28"/>');
      expect(mergedRun).toContain('<w:szCs w:val="28"/>');

      // The single-run control marker is replaced too.
      expect(outputXml).toContain('Control Value');

      // Keep the output for the external python-docx round-trip gate.
      await fs.copyFile(outputPath, path.join(keepDir, 'cross-run-output.docx'));
    });
  });
});

/**
 * Build a test .docx file as a COMPLETE minimal OPC package.
 *
 * Unlike the createTestDocx helper in replacer.test.ts, this emits
 * word/_rels/document.xml.rels as well, so python-docx accepts the package
 * and the external round-trip gate tests engine output, not fixture
 * plumbing (review Momus-5).
 */
async function buildTestDocx(filePath: string, documentXml: string): Promise<void> {
  const zip = new JSZip();

  zip.file('word/document.xml', documentXml);

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(filePath, buffer);
}

/**
 * Extract word/document.xml from a .docx file.
 */
async function extractDocumentXml(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = zip.file('word/document.xml');

  if (!documentXml) {
    throw new Error('word/document.xml not found in .docx file');
  }

  return await documentXml.async('string');
}

/**
 * Return the raw XML of the first <w:r> run containing `needle`, or null.
 */
function extractRunContaining(xml: string, needle: string): string | null {
  const runRegex = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g;
  for (const match of xml.matchAll(runRegex)) {
    if (match[0].includes(needle)) {
      return match[0];
    }
  }
  return null;
}

/**
 * Count non-overlapping occurrences of `needle` in `xml`.
 */
function countOccurrences(xml: string, needle: string): number {
  return xml.split(needle).length - 1;
}
