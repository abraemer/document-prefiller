/**
 * Unit Tests for .docx Parser Utility
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import {
  parseDocxFile,
  extractTextFromDocx,
  isValidDocxFile,
  getDocxMetadata,
  DocxParseError,
} from '../../src/main/utils/docx-parser.js';

describe('.docx Parser Utility', () => {
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
  // PARSE DOCX FILE
  // ============================================================================

  describe('parseDocxFile', () => {
    it('should throw error for non-existent file', async () => {
      const nonExistentPath = '/path/to/nonexistent/file.docx';
      
      await expect(parseDocxFile(nonExistentPath)).rejects.toThrow(DocxParseError);
      await expect(parseDocxFile(nonExistentPath)).rejects.toThrow('not found or not accessible');
    });

    it('should throw error for invalid .docx file', async () => {
      // Create a temporary invalid file
      const tempDir = path.join(process.cwd(), 'tests', 'temp');
      const tempFile = path.join(tempDir, 'invalid.docx');
      
      // Ensure temp directory exists
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      try {
        fs.writeFileSync(tempFile, 'This is not a .docx file');
        
        await expect(parseDocxFile(tempFile)).rejects.toThrow(DocxParseError);
        await expect(parseDocxFile(tempFile)).rejects.toThrow('not a valid ZIP archive');
      } finally {
        // Clean up
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });

    it('should parse valid .docx file if available', async () => {
      const testFilePath = path.join(process.cwd(), 'tests', 'data', 'test.docx');
      
      const text = await parseDocxFile(testFilePath);
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);
      expect(text).toContain('REPLACEME-TITLE');
      expect(text).toContain('REPLACEME-DATA');
    });
  });

  // ============================================================================
  // IS VALID DOCX FILE
  // ============================================================================

  describe('isValidDocxFile', () => {
    it('should return false for non-existent file', async () => {
      const result = await isValidDocxFile('/path/to/nonexistent/file.docx');
      expect(result).toBe(false);
    });

    it('should return false for invalid file', async () => {
      const tempDir = path.join(process.cwd(), 'tests', 'temp');
      const tempFile = path.join(tempDir, 'invalid.docx');
      
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      try {
        fs.writeFileSync(tempFile, 'Not a .docx file');
        
        const result = await isValidDocxFile(tempFile);
        expect(result).toBe(false);
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });

    it('should return true for valid .docx file', async () => {
      const testFilePath = path.join(process.cwd(), 'tests', 'data', 'test.docx');
      
      const result = await isValidDocxFile(testFilePath);
      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // GET DOCX METADATA
  // ============================================================================

  describe('getDocxMetadata', () => {
    it('should throw error for non-existent file', async () => {
      await expect(getDocxMetadata('/path/to/nonexistent/file.docx')).rejects.toThrow(DocxParseError);
    });

    it('should throw error for invalid file', async () => {
      const tempDir = path.join(process.cwd(), 'tests', 'temp');
      const tempFile = path.join(tempDir, 'invalid.docx');
      
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      try {
        fs.writeFileSync(tempFile, 'Not a .docx file');
        
        await expect(getDocxMetadata(tempFile)).rejects.toThrow(DocxParseError);
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    });

    it('should return valid metadata for valid .docx file', async () => {
      const testFilePath = path.join(process.cwd(), 'tests', 'data', 'test.docx');
      
      const metadata = await getDocxMetadata(testFilePath);
      
      expect(metadata.hasDocument).toBe(true);
      expect(typeof metadata.hasStyles).toBe('boolean');
      expect(typeof metadata.hasNumbering).toBe('boolean');
      expect(typeof metadata.entryCount).toBe('number');
      expect(metadata.entryCount).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // DOCX PARSE ERROR
  // ============================================================================

  describe('DocxParseError', () => {
    it('should create error with message', () => {
      const error = new DocxParseError('Test error message');
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DocxParseError);
      expect(error.message).toBe('Test error message');
      expect(error.name).toBe('DocxParseError');
      expect(error.cause).toBeUndefined();
    });

    it('should create error with message and cause', () => {
      const cause = new Error('Original error');
      const error = new DocxParseError('Test error message', cause);
      
      expect(error.message).toBe('Test error message');
      expect(error.cause).toBe(cause);
      expect(error.cause?.message).toBe('Original error');
    });

    it('should create error with filePath', () => {
      const error = new DocxParseError('Test error message', undefined, '/path/to/file.docx');
      
      expect(error.message).toBe('Test error message');
      expect(error.filePath).toBe('/path/to/file.docx');
    });

    it('should create error with errorType', () => {
      const error = new DocxParseError('Test error message', undefined, undefined, 'corrupted_file');
      
      expect(error.message).toBe('Test error message');
      expect(error.errorType).toBe('corrupted_file');
    });

    it('should create error with all properties', () => {
      const cause = new Error('Original error');
      const error = new DocxParseError('Test error message', cause, '/path/to/file.docx', 'invalid_xml');
      
      expect(error.message).toBe('Test error message');
      expect(error.cause).toBe(cause);
      expect(error.filePath).toBe('/path/to/file.docx');
      expect(error.errorType).toBe('invalid_xml');
    });

    it('should be throwable and catchable', () => {
      expect(() => {
        throw new DocxParseError('Test error');
      }).toThrow(DocxParseError);
      expect(() => {
        throw new DocxParseError('Test error');
      }).toThrow('Test error');
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
  });
});