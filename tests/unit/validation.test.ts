/**
 * Unit Tests for Validation Utilities
 */

import { describe, it, expect } from 'vitest';
import {
  isValidReplacementValuesFile,
  validateReplacementValuesFile,
  isValidAppSettings,
  validateAppSettings,
  isValidMarker,
  validateMarker,
  isValidScanResult,
  validateScanResult,
  isValidDocumentInfo,
  validateDocumentInfo,
  isValidReplacementRequest,
  validateReplacementRequest,
  isValidReplacementResult,
  validateReplacementResult,
  createDefaultReplacementValuesFile,
  createDefaultAppSettings,
  createDefaultScanResult,
  sanitizeMarkerIdentifier,
  sanitizeMarkerPrefix,
  validateAndSanitizeMarkerIdentifier,
} from '../../src/shared/utils/validation.js';
import { DEFAULT_PREFIX, APP_VERSION } from '../../src/shared/constants/index.js';

describe('Validation Utilities', () => {
  // ============================================================================
  // REPLACEMENT VALUES FILE VALIDATION
  // ============================================================================

  describe('isValidReplacementValuesFile', () => {
    it('should validate a valid ReplacementValuesFile', () => {
      const validFile = {
        prefix: 'REPLACEME-',
        values: {
          WORD: 'example',
          NAME: 'Jane Smith',
        },
        version: '1.0',
        lastModified: '2024-02-05T10:00:00.000Z',
      };

      expect(isValidReplacementValuesFile(validFile)).toBe(true);
    });

    it('should validate a ReplacementValuesFile without lastModified', () => {
      const validFile = {
        prefix: 'REPLACEME-',
        values: {
          WORD: 'example',
        },
        version: '1.0',
      };

      expect(isValidReplacementValuesFile(validFile)).toBe(true);
    });

    it('should reject non-object values', () => {
      expect(isValidReplacementValuesFile(null)).toBe(false);
      expect(isValidReplacementValuesFile(undefined)).toBe(false);
      expect(isValidReplacementValuesFile('string')).toBe(false);
      expect(isValidReplacementValuesFile(123)).toBe(false);
      expect(isValidReplacementValuesFile([])).toBe(false);
    });

    it('should reject missing prefix', () => {
      const invalidFile = {
        values: {},
        version: '1.0',
      };

      expect(isValidReplacementValuesFile(invalidFile)).toBe(false);
    });

    it('should reject invalid prefix', () => {
      const invalidFile = {
        prefix: '',
        values: {},
        version: '1.0',
      };

      expect(isValidReplacementValuesFile(invalidFile)).toBe(false);
    });

    it('should reject missing values', () => {
      const invalidFile = {
        prefix: 'REPLACEME-',
        version: '1.0',
      };

      expect(isValidReplacementValuesFile(invalidFile)).toBe(false);
    });

    it('should reject non-object values', () => {
      const invalidFile = {
        prefix: 'REPLACEME-',
        values: [],
        version: '1.0',
      };

      expect(isValidReplacementValuesFile(invalidFile)).toBe(false);
    });

    it('should reject invalid marker identifier in values', () => {
      const invalidFile = {
        prefix: 'REPLACEME-',
        values: {
          'INVALID-NAME': 'value',
        },
        version: '1.0',
      };

      expect(isValidReplacementValuesFile(invalidFile)).toBe(false);
    });

    it('should reject non-string value in values', () => {
      const invalidFile = {
        prefix: 'REPLACEME-',
        values: {
          WORD: 123,
        },
        version: '1.0',
      };

      expect(isValidReplacementValuesFile(invalidFile)).toBe(false);
    });

    it('should reject missing version', () => {
      const invalidFile = {
        prefix: 'REPLACEME-',
        values: {},
      };

      expect(isValidReplacementValuesFile(invalidFile)).toBe(false);
    });

    it('should reject invalid lastModified', () => {
      const invalidFile = {
        prefix: 'REPLACEME-',
        values: {},
        version: '1.0',
        lastModified: 'invalid-date',
      };

      expect(isValidReplacementValuesFile(invalidFile)).toBe(false);
    });
  });

  describe('validateReplacementValuesFile', () => {
    it('should return valid result for valid ReplacementValuesFile', () => {
      const validFile = {
        prefix: 'REPLACEME-',
        values: {
          WORD: 'example',
        },
        version: '1.0',
      };

      const result = validateReplacementValuesFile(validFile);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for invalid ReplacementValuesFile', () => {
      const invalidFile = {
        prefix: '',
        values: {
          'INVALID-NAME': 123,
        },
        version: 1,
        lastModified: 'invalid-date',
      };

      const result = validateReplacementValuesFile(invalidFile);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return error for non-object', () => {
      const result = validateReplacementValuesFile(null);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].path).toBe('');
    });
  });

  // ============================================================================
  // APP SETTINGS VALIDATION
  // ============================================================================

  describe('isValidAppSettings', () => {
    it('should validate a valid AppSettings', () => {
      const validSettings = {
        lastFolder: '/path/to/folder',
        windowState: {
          width: 1200,
          height: 800,
          x: 100,
          y: 100,
          maximized: false,
        },
        preferences: {
          defaultPrefix: 'REPLACEME-',
        },
      };

      expect(isValidAppSettings(validSettings)).toBe(true);
    });

    it('should validate AppSettings without optional fields', () => {
      const validSettings = {
        windowState: {
          width: 1200,
          height: 800,
        },
        preferences: {},
      };

      expect(isValidAppSettings(validSettings)).toBe(true);
    });

    it('should reject non-object values', () => {
      expect(isValidAppSettings(null)).toBe(false);
      expect(isValidAppSettings('string')).toBe(false);
    });

    it('should reject missing windowState', () => {
      const invalidSettings = {
        preferences: {},
      };

      expect(isValidAppSettings(invalidSettings)).toBe(false);
    });

    it('should reject missing width in windowState', () => {
      const invalidSettings = {
        windowState: {
          height: 800,
        },
        preferences: {},
      };

      expect(isValidAppSettings(invalidSettings)).toBe(false);
    });

    it('should reject missing height in windowState', () => {
      const invalidSettings = {
        windowState: {
          width: 1200,
        },
        preferences: {},
      };

      expect(isValidAppSettings(invalidSettings)).toBe(false);
    });

    it('should reject invalid width type', () => {
      const invalidSettings = {
        windowState: {
          width: '1200',
          height: 800,
        },
        preferences: {},
      };

      expect(isValidAppSettings(invalidSettings)).toBe(false);
    });

    it('should reject missing preferences', () => {
      const invalidSettings = {
        windowState: {
          width: 1200,
          height: 800,
        },
      };

      expect(isValidAppSettings(invalidSettings)).toBe(false);
    });
  });

  describe('validateAppSettings', () => {
    it('should return valid result for valid AppSettings', () => {
      const validSettings = {
        windowState: {
          width: 1200,
          height: 800,
        },
        preferences: {},
      };

      const result = validateAppSettings(validSettings);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for invalid AppSettings', () => {
      const invalidSettings = {
        windowState: {
          width: 'invalid',
        },
        preferences: 'invalid',
      };

      const result = validateAppSettings(invalidSettings);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // MARKER VALIDATION
  // ============================================================================

  describe('isValidMarker', () => {
    it('should validate a valid Marker', () => {
      const validMarker = {
        identifier: 'WORD',
        fullMarker: 'REPLACEME-WORD',
        value: 'example',
        status: 'active' as const,
        documents: ['document1.docx', 'document2.docx'],
      };

      expect(isValidMarker(validMarker)).toBe(true);
    });

    it('should validate Marker with new status', () => {
      const validMarker = {
        identifier: 'WORD',
        fullMarker: 'REPLACEME-WORD',
        value: '',
        status: 'new' as const,
        documents: [],
      };

      expect(isValidMarker(validMarker)).toBe(true);
    });

    it('should validate Marker with removed status', () => {
      const validMarker = {
        identifier: 'WORD',
        fullMarker: 'REPLACEME-WORD',
        value: 'example',
        status: 'removed' as const,
        documents: [],
      };

      expect(isValidMarker(validMarker)).toBe(true);
    });

    it('should reject non-object values', () => {
      expect(isValidMarker(null)).toBe(false);
      expect(isValidMarker('string')).toBe(false);
    });

    it('should reject missing identifier', () => {
      const invalidMarker = {
        fullMarker: 'REPLACEME-WORD',
        value: 'example',
        status: 'active' as const,
        documents: [],
      };

      expect(isValidMarker(invalidMarker)).toBe(false);
    });

    it('should reject invalid identifier', () => {
      const invalidMarker = {
        identifier: 'INVALID-NAME',
        fullMarker: 'REPLACEME-INVALID-NAME',
        value: 'example',
        status: 'active' as const,
        documents: [],
      };

      expect(isValidMarker(invalidMarker)).toBe(false);
    });

    it('should reject missing fullMarker', () => {
      const invalidMarker = {
        identifier: 'WORD',
        value: 'example',
        status: 'active' as const,
        documents: [],
      };

      expect(isValidMarker(invalidMarker)).toBe(false);
    });

    it('should reject missing value', () => {
      const invalidMarker = {
        identifier: 'WORD',
        fullMarker: 'REPLACEME-WORD',
        status: 'active' as const,
        documents: [],
      };

      expect(isValidMarker(invalidMarker)).toBe(false);
    });

    it('should reject invalid status', () => {
      const invalidMarker = {
        identifier: 'WORD',
        fullMarker: 'REPLACEME-WORD',
        value: 'example',
        status: 'invalid' as const,
        documents: [],
      };

      expect(isValidMarker(invalidMarker)).toBe(false);
    });

    it('should reject missing documents', () => {
      const invalidMarker = {
        identifier: 'WORD',
        fullMarker: 'REPLACEME-WORD',
        value: 'example',
        status: 'active' as const,
      };

      expect(isValidMarker(invalidMarker)).toBe(false);
    });

    it('should reject non-array documents', () => {
      const invalidMarker = {
        identifier: 'WORD',
        fullMarker: 'REPLACEME-WORD',
        value: 'example',
        status: 'active' as const,
        documents: 'not-an-array',
      };

      expect(isValidMarker(invalidMarker)).toBe(false);
    });

    it('should reject invalid document name', () => {
      const invalidMarker = {
        identifier: 'WORD',
        fullMarker: 'REPLACEME-WORD',
        value: 'example',
        status: 'active' as const,
        documents: ['invalid<name>.docx'],
      };

      expect(isValidMarker(invalidMarker)).toBe(false);
    });
  });

  describe('validateMarker', () => {
    it('should return valid result for valid Marker', () => {
      const validMarker = {
        identifier: 'WORD',
        fullMarker: 'REPLACEME-WORD',
        value: 'example',
        status: 'active' as const,
        documents: ['document1.docx'],
      };

      const result = validateMarker(validMarker);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for invalid Marker', () => {
      const invalidMarker = {
        identifier: 'INVALID-NAME',
        fullMarker: 'REPLACEME-INVALID-NAME',
        value: 123,
        status: 'invalid' as const,
        documents: ['invalid<name>.docx'],
      };

      const result = validateMarker(invalidMarker);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // SCAN RESULT VALIDATION
  // ============================================================================

  describe('isValidScanResult', () => {
    it('should validate a valid ScanResult', () => {
      const validScanResult = {
        folder: '/path/to/folder',
        documents: ['document1.docx', 'document2.docx'],
        markers: [
          {
            identifier: 'WORD',
            fullMarker: 'REPLACEME-WORD',
            value: 'example',
            status: 'active' as const,
            documents: ['document1.docx'],
          },
        ],
        prefix: 'REPLACEME-',
        timestamp: '2024-02-05T10:00:00.000Z',
      };

      expect(isValidScanResult(validScanResult)).toBe(true);
    });

    it('should validate ScanResult with empty arrays', () => {
      const validScanResult = {
        folder: '/path/to/folder',
        documents: [],
        markers: [],
        prefix: 'REPLACEME-',
        timestamp: '2024-02-05T10:00:00.000Z',
      };

      expect(isValidScanResult(validScanResult)).toBe(true);
    });

    it('should reject non-object values', () => {
      expect(isValidScanResult(null)).toBe(false);
      expect(isValidScanResult('string')).toBe(false);
    });

    it('should reject missing folder', () => {
      const invalidScanResult = {
        documents: [],
        markers: [],
        prefix: 'REPLACEME-',
        timestamp: '2024-02-05T10:00:00.000Z',
      };

      expect(isValidScanResult(invalidScanResult)).toBe(false);
    });

    it('should reject missing documents', () => {
      const invalidScanResult = {
        folder: '/path/to/folder',
        markers: [],
        prefix: 'REPLACEME-',
        timestamp: '2024-02-05T10:00:00.000Z',
      };

      expect(isValidScanResult(invalidScanResult)).toBe(false);
    });

    it('should reject missing markers', () => {
      const invalidScanResult = {
        folder: '/path/to/folder',
        documents: [],
        prefix: 'REPLACEME-',
        timestamp: '2024-02-05T10:00:00.000Z',
      };

      expect(isValidScanResult(invalidScanResult)).toBe(false);
    });

    it('should reject missing prefix', () => {
      const invalidScanResult = {
        folder: '/path/to/folder',
        documents: [],
        markers: [],
        timestamp: '2024-02-05T10:00:00.000Z',
      };

      expect(isValidScanResult(invalidScanResult)).toBe(false);
    });

    it('should reject missing timestamp', () => {
      const invalidScanResult = {
        folder: '/path/to/folder',
        documents: [],
        markers: [],
        prefix: 'REPLACEME-',
      };

      expect(isValidScanResult(invalidScanResult)).toBe(false);
    });

    it('should reject invalid timestamp', () => {
      const invalidScanResult = {
        folder: '/path/to/folder',
        documents: [],
        markers: [],
        prefix: 'REPLACEME-',
        timestamp: 'invalid-date',
      };

      expect(isValidScanResult(invalidScanResult)).toBe(false);
    });

    it('should reject invalid marker in markers array', () => {
      const invalidScanResult = {
        folder: '/path/to/folder',
        documents: [],
        markers: [
          {
            identifier: 'INVALID-NAME',
            fullMarker: 'REPLACEME-INVALID-NAME',
            value: 'example',
            status: 'active' as const,
            documents: [],
          },
        ],
        prefix: 'REPLACEME-',
        timestamp: '2024-02-05T10:00:00.000Z',
      };

      expect(isValidScanResult(invalidScanResult)).toBe(false);
    });
  });

  describe('validateScanResult', () => {
    it('should return valid result for valid ScanResult', () => {
      const validScanResult = {
        folder: '/path/to/folder',
        documents: [],
        markers: [],
        prefix: 'REPLACEME-',
        timestamp: '2024-02-05T10:00:00.000Z',
      };

      const result = validateScanResult(validScanResult);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for invalid ScanResult', () => {
      const invalidScanResult = {
        folder: '',
        documents: ['invalid<name>.docx'],
        markers: [
          {
            identifier: 'INVALID-NAME',
            fullMarker: 'REPLACEME-INVALID-NAME',
            value: 'example',
            status: 'invalid' as const,
            documents: [],
          },
        ],
        prefix: '',
        timestamp: 'invalid-date',
      };

      const result = validateScanResult(invalidScanResult);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // DOCUMENT INFO VALIDATION
  // ============================================================================

  describe('isValidDocumentInfo', () => {
    it('should validate a valid DocumentInfo', () => {
      const validDocumentInfo = {
        path: '/path/to/document.docx',
        name: 'document.docx',
        markers: ['WORD', 'NAME'],
      };

      expect(isValidDocumentInfo(validDocumentInfo)).toBe(true);
    });

    it('should validate DocumentInfo with empty markers', () => {
      const validDocumentInfo = {
        path: '/path/to/document.docx',
        name: 'document.docx',
        markers: [],
      };

      expect(isValidDocumentInfo(validDocumentInfo)).toBe(true);
    });

    it('should reject non-object values', () => {
      expect(isValidDocumentInfo(null)).toBe(false);
      expect(isValidDocumentInfo('string')).toBe(false);
    });

    it('should reject missing path', () => {
      const invalidDocumentInfo = {
        name: 'document.docx',
        markers: [],
      };

      expect(isValidDocumentInfo(invalidDocumentInfo)).toBe(false);
    });

    it('should reject missing name', () => {
      const invalidDocumentInfo = {
        path: '/path/to/document.docx',
        markers: [],
      };

      expect(isValidDocumentInfo(invalidDocumentInfo)).toBe(false);
    });

    it('should reject missing markers', () => {
      const invalidDocumentInfo = {
        path: '/path/to/document.docx',
        name: 'document.docx',
      };

      expect(isValidDocumentInfo(invalidDocumentInfo)).toBe(false);
    });

    it('should reject invalid file name', () => {
      const invalidDocumentInfo = {
        path: '/path/to/document.docx',
        name: 'invalid<name>.docx',
        markers: [],
      };

      expect(isValidDocumentInfo(invalidDocumentInfo)).toBe(false);
    });
  });

  describe('validateDocumentInfo', () => {
    it('should return valid result for valid DocumentInfo', () => {
      const validDocumentInfo = {
        path: '/path/to/document.docx',
        name: 'document.docx',
        markers: [],
      };

      const result = validateDocumentInfo(validDocumentInfo);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for invalid DocumentInfo', () => {
      const invalidDocumentInfo = {
        path: 123,
        name: 'invalid<name>.docx',
        markers: 'not-an-array',
      };

      const result = validateDocumentInfo(invalidDocumentInfo);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // REPLACEMENT REQUEST VALIDATION
  // ============================================================================

  describe('isValidReplacementRequest', () => {
    it('should validate a valid ReplacementRequest', () => {
      const validRequest = {
        sourceFolder: '/path/to/source',
        outputFolder: '/path/to/output',
        values: {
          WORD: 'example',
          NAME: 'Jane Smith',
        },
        prefix: 'REPLACEME-',
      };

      expect(isValidReplacementRequest(validRequest)).toBe(true);
    });

    it('should validate ReplacementRequest with empty values', () => {
      const validRequest = {
        sourceFolder: '/path/to/source',
        outputFolder: '/path/to/output',
        values: {},
        prefix: 'REPLACEME-',
      };

      expect(isValidReplacementRequest(validRequest)).toBe(true);
    });

    it('should reject non-object values', () => {
      expect(isValidReplacementRequest(null)).toBe(false);
      expect(isValidReplacementRequest('string')).toBe(false);
    });

    it('should reject missing sourceFolder', () => {
      const invalidRequest = {
        outputFolder: '/path/to/output',
        values: {},
        prefix: 'REPLACEME-',
      };

      expect(isValidReplacementRequest(invalidRequest)).toBe(false);
    });

    it('should reject missing outputFolder', () => {
      const invalidRequest = {
        sourceFolder: '/path/to/source',
        values: {},
        prefix: 'REPLACEME-',
      };

      expect(isValidReplacementRequest(invalidRequest)).toBe(false);
    });

    it('should reject missing values', () => {
      const invalidRequest = {
        sourceFolder: '/path/to/source',
        outputFolder: '/path/to/output',
        prefix: 'REPLACEME-',
      };

      expect(isValidReplacementRequest(invalidRequest)).toBe(false);
    });

    it('should reject missing prefix', () => {
      const invalidRequest = {
        sourceFolder: '/path/to/source',
        outputFolder: '/path/to/output',
        values: {},
      };

      expect(isValidReplacementRequest(invalidRequest)).toBe(false);
    });

    it('should reject invalid marker identifier in values', () => {
      const invalidRequest = {
        sourceFolder: '/path/to/source',
        outputFolder: '/path/to/output',
        values: {
          'INVALID-NAME': 'value',
        },
        prefix: 'REPLACEME-',
      };

      expect(isValidReplacementRequest(invalidRequest)).toBe(false);
    });
  });

  describe('validateReplacementRequest', () => {
    it('should return valid result for valid ReplacementRequest', () => {
      const validRequest = {
        sourceFolder: '/path/to/source',
        outputFolder: '/path/to/output',
        values: {},
        prefix: 'REPLACEME-',
      };

      const result = validateReplacementRequest(validRequest);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for invalid ReplacementRequest', () => {
      const invalidRequest = {
        sourceFolder: '',
        outputFolder: '',
        values: {
          'INVALID-NAME': 123,
        },
        prefix: '',
      };

      const result = validateReplacementRequest(invalidRequest);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // REPLACEMENT RESULT VALIDATION
  // ============================================================================

  describe('isValidReplacementResult', () => {
    it('should validate a valid ReplacementResult', () => {
      const validResult = {
        success: true,
        processed: 5,
        errors: 0,
        processedDocuments: ['doc1.docx', 'doc2.docx'],
        failedDocuments: [],
      };

      expect(isValidReplacementResult(validResult)).toBe(true);
    });

    it('should validate ReplacementResult with errorMessage', () => {
      const validResult = {
        success: false,
        processed: 0,
        errors: 1,
        processedDocuments: [],
        failedDocuments: [
          {
            path: '/path/to/doc.docx',
            error: 'Failed to process',
          },
        ],
        errorMessage: 'Operation failed',
      };

      expect(isValidReplacementResult(validResult)).toBe(true);
    });

    it('should reject non-object values', () => {
      expect(isValidReplacementResult(null)).toBe(false);
      expect(isValidReplacementResult('string')).toBe(false);
    });

    it('should reject missing success', () => {
      const invalidResult = {
        processed: 5,
        errors: 0,
        processedDocuments: [],
        failedDocuments: [],
      };

      expect(isValidReplacementResult(invalidResult)).toBe(false);
    });

    it('should reject missing processed', () => {
      const invalidResult = {
        success: true,
        errors: 0,
        processedDocuments: [],
        failedDocuments: [],
      };

      expect(isValidReplacementResult(invalidResult)).toBe(false);
    });

    it('should reject missing errors', () => {
      const invalidResult = {
        success: true,
        processed: 5,
        processedDocuments: [],
        failedDocuments: [],
      };

      expect(isValidReplacementResult(invalidResult)).toBe(false);
    });

    it('should reject missing processedDocuments', () => {
      const invalidResult = {
        success: true,
        processed: 5,
        errors: 0,
        failedDocuments: [],
      };

      expect(isValidReplacementResult(invalidResult)).toBe(false);
    });

    it('should reject missing failedDocuments', () => {
      const invalidResult = {
        success: true,
        processed: 5,
        errors: 0,
        processedDocuments: [],
      };

      expect(isValidReplacementResult(invalidResult)).toBe(false);
    });

    it('should reject invalid failed document', () => {
      const invalidResult = {
        success: true,
        processed: 5,
        errors: 0,
        processedDocuments: [],
        failedDocuments: [
          {
            path: '/path/to/doc.docx',
          },
        ],
      };

      expect(isValidReplacementResult(invalidResult)).toBe(false);
    });
  });

  describe('validateReplacementResult', () => {
    it('should return valid result for valid ReplacementResult', () => {
      const validResult = {
        success: true,
        processed: 5,
        errors: 0,
        processedDocuments: [],
        failedDocuments: [],
      };

      const result = validateReplacementResult(validResult);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for invalid ReplacementResult', () => {
      const invalidResult = {
        success: 'invalid',
        processed: 'invalid',
        errors: 'invalid',
        processedDocuments: 'not-an-array',
        failedDocuments: 'not-an-array',
      };

      const result = validateReplacementResult(invalidResult);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  describe('createDefaultReplacementValuesFile', () => {
    it('should create a default ReplacementValuesFile', () => {
      const defaultFile = createDefaultReplacementValuesFile();

      expect(defaultFile.prefix).toBe(DEFAULT_PREFIX);
      expect(defaultFile.values).toEqual({});
      expect(defaultFile.version).toBe(APP_VERSION);
      expect(defaultFile.lastModified).toBeDefined();
    });

    it('should create a ReplacementValuesFile with custom prefix', () => {
      const customPrefix = 'CUSTOM-';
      const defaultFile = createDefaultReplacementValuesFile(customPrefix);

      expect(defaultFile.prefix).toBe(customPrefix);
      expect(defaultFile.values).toEqual({});
      expect(defaultFile.version).toBe(APP_VERSION);
      expect(defaultFile.lastModified).toBeDefined();
    });
  });

  describe('createDefaultAppSettings', () => {
    it('should create default AppSettings', () => {
      const defaultSettings = createDefaultAppSettings();

      expect(defaultSettings.windowState.width).toBe(1200);
      expect(defaultSettings.windowState.height).toBe(800);
      expect(defaultSettings.windowState.maximized).toBe(false);
      expect(defaultSettings.preferences.defaultPrefix).toBe(DEFAULT_PREFIX);
    });
  });

  describe('createDefaultScanResult', () => {
    it('should create default ScanResult', () => {
      const defaultScanResult = createDefaultScanResult();

      expect(defaultScanResult.folder).toBe('');
      expect(defaultScanResult.documents).toEqual([]);
      expect(defaultScanResult.markers).toEqual([]);
      expect(defaultScanResult.prefix).toBe(DEFAULT_PREFIX);
      expect(defaultScanResult.timestamp).toBeDefined();
    });
  });

  describe('sanitizeMarkerIdentifier', () => {
    it('should sanitize valid identifier', () => {
      const identifier = 'WORD123';
      const sanitized = sanitizeMarkerIdentifier(identifier);

      expect(sanitized).toBe('WORD123');
    });

    it('should remove invalid characters', () => {
      const identifier = 'WORD-123!@#';
      const sanitized = sanitizeMarkerIdentifier(identifier);

      expect(sanitized).toBe('WORD123');
    });

    it('should truncate to max length', () => {
      const identifier = 'A'.repeat(150);
      const sanitized = sanitizeMarkerIdentifier(identifier);

      expect(sanitized.length).toBe(100);
    });

    it('should handle empty string', () => {
      const identifier = '';
      const sanitized = sanitizeMarkerIdentifier(identifier);

      expect(sanitized).toBe('');
    });
  });

  describe('sanitizeMarkerPrefix', () => {
    it('should sanitize valid prefix', () => {
      const prefix = 'REPLACEME-';
      const sanitized = sanitizeMarkerPrefix(prefix);

      expect(sanitized).toBe('REPLACEME-');
    });

    it('should truncate to max length', () => {
      const prefix = 'A'.repeat(100);
      const sanitized = sanitizeMarkerPrefix(prefix);

      expect(sanitized.length).toBe(50);
    });

    it('should handle empty string', () => {
      const prefix = '';
      const sanitized = sanitizeMarkerPrefix(prefix);

      expect(sanitized).toBe('');
    });
  });

  describe('validateAndSanitizeMarkerIdentifier', () => {
    it('should validate and sanitize valid identifier', () => {
      const identifier = 'WORD123';
      const result = validateAndSanitizeMarkerIdentifier(identifier);

      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('WORD123');
      expect(result.error).toBeUndefined();
    });

    it('should sanitize and validate identifier with invalid characters', () => {
      const identifier = 'WORD-123';
      const result = validateAndSanitizeMarkerIdentifier(identifier);

      expect(result.valid).toBe(true);
      expect(result.sanitized).toBe('WORD123');
      expect(result.error).toBeUndefined();
    });

    it('should reject empty identifier after sanitization', () => {
      const identifier = '!@#$%';
      const result = validateAndSanitizeMarkerIdentifier(identifier);

      expect(result.valid).toBe(false);
      expect(result.sanitized).toBe('');
      expect(result.error).toBeDefined();
    });

    it('should reject identifier that becomes invalid after sanitization', () => {
      const identifier = '-';
      const result = validateAndSanitizeMarkerIdentifier(identifier);

      expect(result.valid).toBe(false);
      expect(result.sanitized).toBe('');
      expect(result.error).toBeDefined();
    });
  });
});