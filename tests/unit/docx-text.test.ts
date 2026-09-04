/**
 * Unit Tests for platform-neutral .docx text extraction (src/core/docx-text)
 *
 * Pure-extraction coverage moved verbatim from tests/unit/docx-parser.test.ts
 * when the extraction logic moved to the core module (plan todo 2). The
 * fs-bound wrapper tests stayed behind against src/main/utils/docx-parser.
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
  extractTextFromDocx,
  isZipSignature,
  DocxParseError,
} from '../../src/core/docx-text.js';

describe('Core .docx Text Extraction', () => {
  // ============================================================================
  // EXTRACT TEXT FROM DOCX BUFFER
  // ============================================================================

  describe('extractTextFromDocx', () => {
    it('should throw error for buffer that is too small', async () => {
      const tinyBuffer = Buffer.from([0x50, 0x4b]);

      await expect(extractTextFromDocx(tinyBuffer)).rejects.toThrow(DocxParseError);
      await expect(extractTextFromDocx(tinyBuffer)).rejects.toThrow('file too small');
    });

    it('should throw error for invalid ZIP signature', async () => {
      const invalidBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);

      await expect(extractTextFromDocx(invalidBuffer)).rejects.toThrow(DocxParseError);
      await expect(extractTextFromDocx(invalidBuffer)).rejects.toThrow('not a valid ZIP archive');
    });

    it('should throw error for invalid ZIP structure', async () => {
      // Create a minimal invalid ZIP file
      const zipHeader = Buffer.from([
        0x50, 0x4b, 0x03, 0x04, // Local file header signature
        0x14, 0x00, 0x00, 0x00, // Version needed
        0x00, 0x00, 0x00, 0x00, // General purpose bit flag
        0x00, 0x00, 0x00, 0x00, // Compression method
        0x00, 0x00, 0x00, 0x00, // Last mod file time
        0x00, 0x00, 0x00, 0x00, // Last mod file date
        0x00, 0x00, 0x00, 0x00, // CRC-32
        0x00, 0x00, 0x00, 0x00, // Compressed size
        0x00, 0x00, 0x00, 0x00, // Uncompressed size
        0x00, 0x00, // File name length
        0x00, 0x00, // Extra field length
      ]);

      await expect(extractTextFromDocx(zipHeader)).rejects.toThrow(DocxParseError);
    });
  });

  // ============================================================================
  // IS ZIP SIGNATURE
  // ============================================================================

  describe('isZipSignature', () => {
    it('should return true for bytes starting with PK', () => {
      expect(isZipSignature(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    });

    it('should return false for bytes without the PK signature', () => {
      expect(isZipSignature(new Uint8Array([0x00, 0x4b, 0x03, 0x04]))).toBe(false);
      expect(isZipSignature(new Uint8Array([0x50, 0x00, 0x03, 0x04]))).toBe(false);
    });
  });

  // ============================================================================
  // GOLDEN TEST — extraction on the shared segmentation (deliberate fixes)
  // ============================================================================

  describe('extractTextFromXml golden (shared segmentation)', () => {
    it('extracts the exact hand-computed text from a gnarly fixture (pPr block, self-closed <w:p/>, table cell marker, textbox-nested run, entity, unicode, rsid attrs, tab, blank paragraph)', async () => {
      // Semantics the expected string below is computed from (by hand):
      // - per paragraph: concatenate all <w:t> texts of all runs in order
      // - drop paragraphs whose text is empty after trim
      // - join remaining paragraphs with a single space
      // - tabs become spaces, whitespace runs collapse to one space, trim
      // - entity text stays escaped (R&amp;D), exactly as the old extractor did
      // - the textbox-bearing paragraph is ONE depth-matched paragraph: its
      //   text is `Box note ` + `After box REPLACEME-DIAGNOSE3` (the old
      //   non-depth-aware regex LOST the text after the nested `</w:p>`)
      const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr>
        <w:spacing w:after="120"/>
        <w:rPr><w:b/></w:rPr>
      </w:pPr>
      <w:r w:rsidR="00A12345" w:rsidRPr="00A6789B">
        <w:rPr><w:b/></w:rPr>
        <w:t xml:space="preserve">R&amp;D Größe Änderung: </w:t>
      </w:r>
      <w:r w:rsidR="00A12345">
        <w:t>REPLACEME-DIAGNOSE1</w:t>
      </w:r>
    </w:p>
    <w:p/>
    <w:tbl>
      <w:tr>
        <w:tc>
          <w:tcPr><w:tcW w:w="4000" w:type="dxa"/></w:tcPr>
          <w:p>
            <w:r w:rsidR="00B6789A">
              <w:t>Cell REPLACEME-DIAGNOSE2</w:t>
            </w:r>
          </w:p>
        </w:tc>
      </w:tr>
    </w:tbl>
    <w:p>
      <w:r>
        <w:drawing>
          <w:txbxContent>
            <w:p><w:r><w:t xml:space="preserve">Box note </w:t></w:r></w:p>
          </w:txbxContent>
        </w:drawing>
      </w:r>
      <w:r w:rsidR="00C2468B">
        <w:t>After box REPLACEME-DIAGNOSE3</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr><w:jc w:val="left"/></w:pPr>
      <w:r>
        <w:t xml:space="preserve">Tab\there</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r><w:t xml:space="preserve">   </w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>Größe Änderung</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`.replace('Tab\\there', 'Tab\there');

      const zip = new JSZip();
      zip.file('word/document.xml', documentXml);
      const buffer = await zip.generateAsync({ type: 'nodebuffer' });

      const text = await extractTextFromDocx(buffer);

      expect(text).toBe(
        'R&amp;D Größe Änderung: REPLACEME-DIAGNOSE1 ' +
          'Cell REPLACEME-DIAGNOSE2 ' +
          'Box note After box REPLACEME-DIAGNOSE3 ' +
          'Tab here ' +
          'Größe Änderung'
      );
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle buffer with exactly 4 bytes', async () => {
      const buffer = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

      // Should not throw "file too small" error
      // But will throw other errors because it's not a complete ZIP
      await expect(extractTextFromDocx(buffer)).rejects.toThrow();
    });

    it('should handle buffer with valid PK signature but invalid ZIP', async () => {
      const buffer = Buffer.from([0x50, 0x4b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

      await expect(extractTextFromDocx(buffer)).rejects.toThrow(DocxParseError);
    });

    it('should throw DocxParseError with the identical message for a truncated non-PK Uint8Array', async () => {
      // Truncated file content: 8 zero bytes — no PK signature in sight.
      const truncated = new Uint8Array(8);

      const error: unknown = await extractTextFromDocx(truncated).then(
        () => undefined,
        (caught: unknown) => caught
      );

      expect(error).toBeInstanceOf(DocxParseError);
      if (!(error instanceof DocxParseError)) {
        throw new Error('expected extractTextFromDocx to reject with DocxParseError');
      }
      expect(error.message).toBe(
        'Invalid .docx file: not a valid ZIP archive (missing PK signature)'
      );
      expect(error.errorType).toBe('corrupted_file');
    });
  });
});
