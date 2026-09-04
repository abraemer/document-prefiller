/**
 * Unit Tests for .docx Parser Utility
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  parseDocxFile,
  isValidDocxFile,
  getDocxMetadata,
  DocxParseError,
} from '../../src/main/utils/docx-parser.js';

describe('.docx Parser Utility', () => {
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
});