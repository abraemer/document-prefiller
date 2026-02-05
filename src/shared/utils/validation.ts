/**
 * Type Validation Utilities
 * Runtime type checking and validation functions for data models
 */

import type {
  ReplacementValuesFile,
  AppSettings,
  Marker,
  ScanResult,
  DocumentInfo,
  ReplacementRequest,
  ReplacementResult,
  MarkerStatus,
} from '../types/data-models.js';
import {
  DEFAULT_PREFIX,
  MIN_PREFIX_LENGTH,
  MAX_PREFIX_LENGTH,
  MARKER_PATTERN,
  MAX_MARKER_NAME_LENGTH,
  MAX_REPLACEMENT_VALUE_LENGTH,
  MAX_FOLDER_PATH_LENGTH,
  MAX_FILE_NAME_LENGTH,
  APP_VERSION,
} from '../constants/index.js';

// ============================================================================
// VALIDATION RESULT TYPES
// ============================================================================

/**
 * Validation result with optional error message
 */
export interface ValidationResult {
  /** Whether the validation passed */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
  /** Path to the invalid field (for nested objects) */
  path?: string;
}

/**
 * Detailed validation result with multiple errors
 */
export interface DetailedValidationResult {
  /** Whether the validation passed */
  valid: boolean;
  /** List of validation errors */
  errors: Array<{
    /** Path to the invalid field */
    path: string;
    /** Error message */
    message: string;
  }>;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if a value is a non-null object
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if a value is a string
 */
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Check if a value is a number
 */
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * Check if a value is a boolean
 */
function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Check if a value is an array
 */
function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Check if a string is a valid ISO 8601 timestamp
 */
function isValidISODate(value: string): boolean {
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
  return isoDateRegex.test(value) && !isNaN(Date.parse(value));
}

/**
 * Check if a string is a valid folder path
 */
function isValidFolderPath(value: string): boolean {
  return (
    isString(value) &&
    value.length > 0 &&
    value.length <= MAX_FOLDER_PATH_LENGTH
  );
}

/**
 * Check if a string is a valid file name
 */
function isValidFileName(value: string): boolean {
  return (
    isString(value) &&
    value.length > 0 &&
    value.length <= MAX_FILE_NAME_LENGTH &&
    !/[<>:"|?*]/.test(value)
  );
}

/**
 * Check if a string is a valid marker identifier
 */
function isValidMarkerIdentifier(value: string): boolean {
  return (
    isString(value) &&
    value.length > 0 &&
    value.length <= MAX_MARKER_NAME_LENGTH &&
    MARKER_PATTERN.test(value)
  );
}

/**
 * Check if a string is a valid marker prefix
 */
function isValidMarkerPrefix(value: string): boolean {
  return (
    isString(value) &&
    value.length >= MIN_PREFIX_LENGTH &&
    value.length <= MAX_PREFIX_LENGTH
  );
}

/**
 * Check if a value is a valid marker status
 */
function isValidMarkerStatus(value: unknown): value is MarkerStatus {
  return (
    isString(value) && (value === 'active' || value === 'new' || value === 'removed')
  );
}

// ============================================================================
// REPLACEMENT VALUES FILE VALIDATION
// ============================================================================

/**
 * Validate a ReplacementValuesFile object
 */
export function isValidReplacementValuesFile(
  value: unknown
): value is ReplacementValuesFile {
  if (!isObject(value)) {
    return false;
  }

  // Check prefix
  if (!('prefix' in value) || !isString(value.prefix) || !isValidMarkerPrefix(value.prefix)) {
    return false;
  }

  // Check values
  if (!('values' in value) || !isObject(value.values)) {
    return false;
  }

  // Validate each value in the values object
  for (const [key, val] of Object.entries(value.values)) {
    if (!isValidMarkerIdentifier(key)) {
      return false;
    }
    if (!isString(val) || val.length > MAX_REPLACEMENT_VALUE_LENGTH) {
      return false;
    }
  }

  // Check version
  if (!('version' in value) || !isString(value.version)) {
    return false;
  }

  // Check lastModified (optional)
  if ('lastModified' in value) {
    if (!isString(value.lastModified) || !isValidISODate(value.lastModified)) {
      return false;
    }
  }

  return true;
}

/**
 * Validate a ReplacementValuesFile object with detailed error messages
 */
export function validateReplacementValuesFile(
  value: unknown
): DetailedValidationResult {
  const errors: Array<{ path: string; message: string }> = [];

  if (!isObject(value)) {
    return {
      valid: false,
      errors: [{ path: '', message: 'Value must be an object' }],
    };
  }

  // Validate prefix
  if (!('prefix' in value)) {
    errors.push({ path: 'prefix', message: 'Prefix is required' });
  } else if (!isString(value.prefix)) {
    errors.push({ path: 'prefix', message: 'Prefix must be a string' });
  } else if (!isValidMarkerPrefix(value.prefix)) {
    errors.push({
      path: 'prefix',
      message: `Prefix must be between ${MIN_PREFIX_LENGTH} and ${MAX_PREFIX_LENGTH} characters`,
    });
  }

  // Validate values
  if (!('values' in value)) {
    errors.push({ path: 'values', message: 'Values are required' });
  } else if (!isObject(value.values)) {
    errors.push({ path: 'values', message: 'Values must be an object' });
  } else {
    for (const [key, val] of Object.entries(value.values)) {
      if (!isValidMarkerIdentifier(key)) {
        errors.push({
          path: `values.${key}`,
          message: `Invalid marker identifier: ${key}`,
        });
      }
      if (!isString(val)) {
        errors.push({
          path: `values.${key}`,
          message: `Value for ${key} must be a string`,
        });
      } else if (val.length > MAX_REPLACEMENT_VALUE_LENGTH) {
        errors.push({
          path: `values.${key}`,
          message: `Value for ${key} exceeds maximum length of ${MAX_REPLACEMENT_VALUE_LENGTH}`,
        });
      }
    }
  }

  // Validate version
  if (!('version' in value)) {
    errors.push({ path: 'version', message: 'Version is required' });
  } else if (!isString(value.version)) {
    errors.push({ path: 'version', message: 'Version must be a string' });
  }

  // Validate lastModified (optional)
  if ('lastModified' in value) {
    if (!isString(value.lastModified)) {
      errors.push({ path: 'lastModified', message: 'LastModified must be a string' });
    } else if (!isValidISODate(value.lastModified)) {
      errors.push({
        path: 'lastModified',
        message: 'LastModified must be a valid ISO 8601 timestamp',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// APP SETTINGS VALIDATION
// ============================================================================

/**
 * Validate an AppSettings object
 */
export function isValidAppSettings(value: unknown): value is AppSettings {
  if (!isObject(value)) {
    return false;
  }

  // Check windowState
  if (!('windowState' in value) || !isObject(value.windowState)) {
    return false;
  }

  const windowState = value.windowState;

  // Check required windowState fields
  if (!('width' in windowState) || !isNumber(windowState.width)) {
    return false;
  }
  if (!('height' in windowState) || !isNumber(windowState.height)) {
    return false;
  }

  // Check optional windowState fields
  if ('x' in windowState && windowState.x !== undefined && !isNumber(windowState.x)) {
    return false;
  }
  if ('y' in windowState && windowState.y !== undefined && !isNumber(windowState.y)) {
    return false;
  }
  if ('maximized' in windowState && !isBoolean(windowState.maximized)) {
    return false;
  }

  // Check preferences
  if (!('preferences' in value) || !isObject(value.preferences)) {
    return false;
  }

  const preferences = value.preferences;

  // Check optional defaultPrefix
  if ('defaultPrefix' in preferences && preferences.defaultPrefix !== undefined) {
    if (!isString(preferences.defaultPrefix)) {
      return false;
    }
  }

  // Check optional lastFolder
  if ('lastFolder' in value && value.lastFolder !== undefined) {
    if (!isString(value.lastFolder)) {
      return false;
    }
  }

  return true;
}

/**
 * Validate an AppSettings object with detailed error messages
 */
export function validateAppSettings(value: unknown): DetailedValidationResult {
  const errors: Array<{ path: string; message: string }> = [];

  if (!isObject(value)) {
    return {
      valid: false,
      errors: [{ path: '', message: 'Value must be an object' }],
    };
  }

  // Validate windowState
  if (!('windowState' in value)) {
    errors.push({ path: 'windowState', message: 'WindowState is required' });
  } else if (!isObject(value.windowState)) {
    errors.push({ path: 'windowState', message: 'WindowState must be an object' });
  } else {
    const windowState = value.windowState;

    if (!('width' in windowState)) {
      errors.push({ path: 'windowState.width', message: 'Width is required' });
    } else if (!isNumber(windowState.width)) {
      errors.push({ path: 'windowState.width', message: 'Width must be a number' });
    }

    if (!('height' in windowState)) {
      errors.push({ path: 'windowState.height', message: 'Height is required' });
    } else if (!isNumber(windowState.height)) {
      errors.push({ path: 'windowState.height', message: 'Height must be a number' });
    }

    if ('x' in windowState && windowState.x !== undefined && !isNumber(windowState.x)) {
      errors.push({ path: 'windowState.x', message: 'X must be a number' });
    }

    if ('y' in windowState && windowState.y !== undefined && !isNumber(windowState.y)) {
      errors.push({ path: 'windowState.y', message: 'Y must be a number' });
    }

    if ('maximized' in windowState && !isBoolean(windowState.maximized)) {
      errors.push({ path: 'windowState.maximized', message: 'Maximized must be a boolean' });
    }
  }

  // Validate preferences
  if (!('preferences' in value)) {
    errors.push({ path: 'preferences', message: 'Preferences are required' });
  } else if (!isObject(value.preferences)) {
    errors.push({ path: 'preferences', message: 'Preferences must be an object' });
  } else {
    const preferences = value.preferences;

    if ('defaultPrefix' in preferences && preferences.defaultPrefix !== undefined) {
      if (!isString(preferences.defaultPrefix)) {
        errors.push({
          path: 'preferences.defaultPrefix',
          message: 'DefaultPrefix must be a string',
        });
      } else if (!isValidMarkerPrefix(preferences.defaultPrefix)) {
        errors.push({
          path: 'preferences.defaultPrefix',
          message: `DefaultPrefix must be between ${MIN_PREFIX_LENGTH} and ${MAX_PREFIX_LENGTH} characters`,
        });
      }
    }
  }

  // Validate lastFolder (optional)
  if ('lastFolder' in value && value.lastFolder !== undefined) {
    if (!isString(value.lastFolder)) {
      errors.push({ path: 'lastFolder', message: 'LastFolder must be a string' });
    } else if (!isValidFolderPath(value.lastFolder)) {
      errors.push({
        path: 'lastFolder',
        message: 'LastFolder must be a valid folder path',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// MARKER VALIDATION
// ============================================================================

/**
 * Validate a Marker object
 */
export function isValidMarker(value: unknown): value is Marker {
  if (!isObject(value)) {
    return false;
  }

  // Check identifier
  if (!('identifier' in value) || !isString(value.identifier) || !isValidMarkerIdentifier(value.identifier)) {
    return false;
  }

  // Check fullMarker
  if (!('fullMarker' in value) || !isString(value.fullMarker)) {
    return false;
  }

  // Check value
  if (!('value' in value) || !isString(value.value)) {
    return false;
  }

  // Check status
  if (!('status' in value) || !isValidMarkerStatus(value.status)) {
    return false;
  }

  // Check documents
  if (!('documents' in value) || !isArray(value.documents)) {
    return false;
  }

  // Validate each document in the documents array
  for (const doc of value.documents) {
    if (!isString(doc) || !isValidFileName(doc)) {
      return false;
    }
  }

  return true;
}

/**
 * Validate a Marker object with detailed error messages
 */
export function validateMarker(value: unknown): DetailedValidationResult {
  const errors: Array<{ path: string; message: string }> = [];

  if (!isObject(value)) {
    return {
      valid: false,
      errors: [{ path: '', message: 'Value must be an object' }],
    };
  }

  // Validate identifier
  if (!('identifier' in value)) {
    errors.push({ path: 'identifier', message: 'Identifier is required' });
  } else if (!isString(value.identifier)) {
    errors.push({ path: 'identifier', message: 'Identifier must be a string' });
  } else if (!isValidMarkerIdentifier(value.identifier)) {
    errors.push({
      path: 'identifier',
      message: `Identifier must be a valid marker name (alphanumeric and underscores, max ${MAX_MARKER_NAME_LENGTH} characters)`,
    });
  }

  // Validate fullMarker
  if (!('fullMarker' in value)) {
    errors.push({ path: 'fullMarker', message: 'FullMarker is required' });
  } else if (!isString(value.fullMarker)) {
    errors.push({ path: 'fullMarker', message: 'FullMarker must be a string' });
  }

  // Validate value
  if (!('value' in value)) {
    errors.push({ path: 'value', message: 'Value is required' });
  } else if (!isString(value.value)) {
    errors.push({ path: 'value', message: 'Value must be a string' });
  } else if (value.value.length > MAX_REPLACEMENT_VALUE_LENGTH) {
    errors.push({
      path: 'value',
      message: `Value exceeds maximum length of ${MAX_REPLACEMENT_VALUE_LENGTH}`,
    });
  }

  // Validate status
  if (!('status' in value)) {
    errors.push({ path: 'status', message: 'Status is required' });
  } else if (!isValidMarkerStatus(value.status)) {
    errors.push({
      path: 'status',
      message: 'Status must be one of: active, new, removed',
    });
  }

  // Validate documents
  if (!('documents' in value)) {
    errors.push({ path: 'documents', message: 'Documents are required' });
  } else if (!isArray(value.documents)) {
    errors.push({ path: 'documents', message: 'Documents must be an array' });
  } else {
    value.documents.forEach((doc, index) => {
      if (!isString(doc)) {
        errors.push({
          path: `documents[${index}]`,
          message: 'Document must be a string',
        });
      } else if (!isValidFileName(doc)) {
        errors.push({
          path: `documents[${index}]`,
          message: `Invalid file name: ${doc}`,
        });
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// SCAN RESULT VALIDATION
// ============================================================================

/**
 * Validate a ScanResult object
 */
export function isValidScanResult(value: unknown): value is ScanResult {
  if (!isObject(value)) {
    return false;
  }

  // Check folder
  if (!('folder' in value) || !isString(value.folder) || !isValidFolderPath(value.folder)) {
    return false;
  }

  // Check documents
  if (!('documents' in value) || !isArray(value.documents)) {
    return false;
  }

  // Validate each document in the documents array
  for (const doc of value.documents) {
    if (!isString(doc) || !isValidFileName(doc)) {
      return false;
    }
  }

  // Check markers
  if (!('markers' in value) || !isArray(value.markers)) {
    return false;
  }

  // Validate each marker in the markers array
  for (const marker of value.markers) {
    if (!isValidMarker(marker)) {
      return false;
    }
  }

  // Check prefix
  if (!('prefix' in value) || !isString(value.prefix) || !isValidMarkerPrefix(value.prefix)) {
    return false;
  }

  // Check timestamp
  if (!('timestamp' in value) || !isString(value.timestamp) || !isValidISODate(value.timestamp)) {
    return false;
  }

  return true;
}

/**
 * Validate a ScanResult object with detailed error messages
 */
export function validateScanResult(value: unknown): DetailedValidationResult {
  const errors: Array<{ path: string; message: string }> = [];

  if (!isObject(value)) {
    return {
      valid: false,
      errors: [{ path: '', message: 'Value must be an object' }],
    };
  }

  // Validate folder
  if (!('folder' in value)) {
    errors.push({ path: 'folder', message: 'Folder is required' });
  } else if (!isString(value.folder)) {
    errors.push({ path: 'folder', message: 'Folder must be a string' });
  } else if (!isValidFolderPath(value.folder)) {
    errors.push({
      path: 'folder',
      message: 'Folder must be a valid folder path',
    });
  }

  // Validate documents
  if (!('documents' in value)) {
    errors.push({ path: 'documents', message: 'Documents are required' });
  } else if (!isArray(value.documents)) {
    errors.push({ path: 'documents', message: 'Documents must be an array' });
  } else {
    value.documents.forEach((doc, index) => {
      if (!isString(doc)) {
        errors.push({
          path: `documents[${index}]`,
          message: 'Document must be a string',
        });
      } else if (!isValidFileName(doc)) {
        errors.push({
          path: `documents[${index}]`,
          message: `Invalid file name: ${doc}`,
        });
      }
    });
  }

  // Validate markers
  if (!('markers' in value)) {
    errors.push({ path: 'markers', message: 'Markers are required' });
  } else if (!isArray(value.markers)) {
    errors.push({ path: 'markers', message: 'Markers must be an array' });
  } else {
    value.markers.forEach((marker, index) => {
      const markerValidation = validateMarker(marker);
      if (!markerValidation.valid) {
        markerValidation.errors.forEach((error) => {
          errors.push({
            path: `markers[${index}].${error.path}`,
            message: error.message,
          });
        });
      }
    });
  }

  // Validate prefix
  if (!('prefix' in value)) {
    errors.push({ path: 'prefix', message: 'Prefix is required' });
  } else if (!isString(value.prefix)) {
    errors.push({ path: 'prefix', message: 'Prefix must be a string' });
  } else if (!isValidMarkerPrefix(value.prefix)) {
    errors.push({
      path: 'prefix',
      message: `Prefix must be between ${MIN_PREFIX_LENGTH} and ${MAX_PREFIX_LENGTH} characters`,
    });
  }

  // Validate timestamp
  if (!('timestamp' in value)) {
    errors.push({ path: 'timestamp', message: 'Timestamp is required' });
  } else if (!isString(value.timestamp)) {
    errors.push({ path: 'timestamp', message: 'Timestamp must be a string' });
  } else if (!isValidISODate(value.timestamp)) {
    errors.push({
      path: 'timestamp',
      message: 'Timestamp must be a valid ISO 8601 timestamp',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// DOCUMENT INFO VALIDATION
// ============================================================================

/**
 * Validate a DocumentInfo object
 */
export function isValidDocumentInfo(value: unknown): value is DocumentInfo {
  if (!isObject(value)) {
    return false;
  }

  // Check path
  if (!('path' in value) || !isString(value.path)) {
    return false;
  }

  // Check name
  if (!('name' in value) || !isString(value.name) || !isValidFileName(value.name)) {
    return false;
  }

  // Check markers
  if (!('markers' in value) || !isArray(value.markers)) {
    return false;
  }

  // Validate each marker in the markers array
  for (const marker of value.markers) {
    if (!isString(marker)) {
      return false;
    }
  }

  return true;
}

/**
 * Validate a DocumentInfo object with detailed error messages
 */
export function validateDocumentInfo(value: unknown): DetailedValidationResult {
  const errors: Array<{ path: string; message: string }> = [];

  if (!isObject(value)) {
    return {
      valid: false,
      errors: [{ path: '', message: 'Value must be an object' }],
    };
  }

  // Validate path
  if (!('path' in value)) {
    errors.push({ path: 'path', message: 'Path is required' });
  } else if (!isString(value.path)) {
    errors.push({ path: 'path', message: 'Path must be a string' });
  }

  // Validate name
  if (!('name' in value)) {
    errors.push({ path: 'name', message: 'Name is required' });
  } else if (!isString(value.name)) {
    errors.push({ path: 'name', message: 'Name must be a string' });
  } else if (!isValidFileName(value.name)) {
    errors.push({
      path: 'name',
      message: 'Name must be a valid file name',
    });
  }

  // Validate markers
  if (!('markers' in value)) {
    errors.push({ path: 'markers', message: 'Markers are required' });
  } else if (!isArray(value.markers)) {
    errors.push({ path: 'markers', message: 'Markers must be an array' });
  } else {
    value.markers.forEach((marker, index) => {
      if (!isString(marker)) {
        errors.push({
          path: `markers[${index}]`,
          message: 'Marker must be a string',
        });
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// REPLACEMENT REQUEST VALIDATION
// ============================================================================

/**
 * Validate a ReplacementRequest object
 */
export function isValidReplacementRequest(value: unknown): value is ReplacementRequest {
  if (!isObject(value)) {
    return false;
  }

  // Check sourceFolder
  if (!('sourceFolder' in value) || !isString(value.sourceFolder) || !isValidFolderPath(value.sourceFolder)) {
    return false;
  }

  // Check outputFolder
  if (!('outputFolder' in value) || !isString(value.outputFolder) || !isValidFolderPath(value.outputFolder)) {
    return false;
  }

  // Check values
  if (!('values' in value) || !isObject(value.values)) {
    return false;
  }

  // Validate each value in the values object
  for (const [key, val] of Object.entries(value.values)) {
    if (!isValidMarkerIdentifier(key)) {
      return false;
    }
    if (!isString(val) || val.length > MAX_REPLACEMENT_VALUE_LENGTH) {
      return false;
    }
  }

  // Check prefix
  if (!('prefix' in value) || !isString(value.prefix) || !isValidMarkerPrefix(value.prefix)) {
    return false;
  }

  return true;
}

/**
 * Validate a ReplacementRequest object with detailed error messages
 */
export function validateReplacementRequest(value: unknown): DetailedValidationResult {
  const errors: Array<{ path: string; message: string }> = [];

  if (!isObject(value)) {
    return {
      valid: false,
      errors: [{ path: '', message: 'Value must be an object' }],
    };
  }

  // Validate sourceFolder
  if (!('sourceFolder' in value)) {
    errors.push({ path: 'sourceFolder', message: 'SourceFolder is required' });
  } else if (!isString(value.sourceFolder)) {
    errors.push({ path: 'sourceFolder', message: 'SourceFolder must be a string' });
  } else if (!isValidFolderPath(value.sourceFolder)) {
    errors.push({
      path: 'sourceFolder',
      message: 'SourceFolder must be a valid folder path',
    });
  }

  // Validate outputFolder
  if (!('outputFolder' in value)) {
    errors.push({ path: 'outputFolder', message: 'OutputFolder is required' });
  } else if (!isString(value.outputFolder)) {
    errors.push({ path: 'outputFolder', message: 'OutputFolder must be a string' });
  } else if (!isValidFolderPath(value.outputFolder)) {
    errors.push({
      path: 'outputFolder',
      message: 'OutputFolder must be a valid folder path',
    });
  }

  // Validate values
  if (!('values' in value)) {
    errors.push({ path: 'values', message: 'Values are required' });
  } else if (!isObject(value.values)) {
    errors.push({ path: 'values', message: 'Values must be an object' });
  } else {
    for (const [key, val] of Object.entries(value.values)) {
      if (!isValidMarkerIdentifier(key)) {
        errors.push({
          path: `values.${key}`,
          message: `Invalid marker identifier: ${key}`,
        });
      }
      if (!isString(val)) {
        errors.push({
          path: `values.${key}`,
          message: `Value for ${key} must be a string`,
        });
      } else if (val.length > MAX_REPLACEMENT_VALUE_LENGTH) {
        errors.push({
          path: `values.${key}`,
          message: `Value for ${key} exceeds maximum length of ${MAX_REPLACEMENT_VALUE_LENGTH}`,
        });
      }
    }
  }

  // Validate prefix
  if (!('prefix' in value)) {
    errors.push({ path: 'prefix', message: 'Prefix is required' });
  } else if (!isString(value.prefix)) {
    errors.push({ path: 'prefix', message: 'Prefix must be a string' });
  } else if (!isValidMarkerPrefix(value.prefix)) {
    errors.push({
      path: 'prefix',
      message: `Prefix must be between ${MIN_PREFIX_LENGTH} and ${MAX_PREFIX_LENGTH} characters`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// REPLACEMENT RESULT VALIDATION
// ============================================================================

/**
 * Validate a ReplacementResult object
 */
export function isValidReplacementResult(value: unknown): value is ReplacementResult {
  if (!isObject(value)) {
    return false;
  }

  // Check success
  if (!('success' in value) || !isBoolean(value.success)) {
    return false;
  }

  // Check processed
  if (!('processed' in value) || !isNumber(value.processed)) {
    return false;
  }

  // Check errors
  if (!('errors' in value) || !isNumber(value.errors)) {
    return false;
  }

  // Check processedDocuments
  if (!('processedDocuments' in value) || !isArray(value.processedDocuments)) {
    return false;
  }

  // Validate each document in the processedDocuments array
  for (const doc of value.processedDocuments) {
    if (!isString(doc)) {
      return false;
    }
  }

  // Check failedDocuments
  if (!('failedDocuments' in value) || !isArray(value.failedDocuments)) {
    return false;
  }

  // Validate each failed document in the failedDocuments array
  for (const failedDoc of value.failedDocuments) {
    if (!isObject(failedDoc)) {
      return false;
    }
    if (!('path' in failedDoc) || !isString(failedDoc.path)) {
      return false;
    }
    if (!('error' in failedDoc) || !isString(failedDoc.error)) {
      return false;
    }
  }

  // Check errorMessage (optional)
  if ('errorMessage' in value && value.errorMessage !== undefined) {
    if (!isString(value.errorMessage)) {
      return false;
    }
  }

  return true;
}

/**
 * Validate a ReplacementResult object with detailed error messages
 */
export function validateReplacementResult(value: unknown): DetailedValidationResult {
  const errors: Array<{ path: string; message: string }> = [];

  if (!isObject(value)) {
    return {
      valid: false,
      errors: [{ path: '', message: 'Value must be an object' }],
    };
  }

  // Validate success
  if (!('success' in value)) {
    errors.push({ path: 'success', message: 'Success is required' });
  } else if (!isBoolean(value.success)) {
    errors.push({ path: 'success', message: 'Success must be a boolean' });
  }

  // Validate processed
  if (!('processed' in value)) {
    errors.push({ path: 'processed', message: 'Processed is required' });
  } else if (!isNumber(value.processed)) {
    errors.push({ path: 'processed', message: 'Processed must be a number' });
  }

  // Validate errors
  if (!('errors' in value)) {
    errors.push({ path: 'errors', message: 'Errors is required' });
  } else if (!isNumber(value.errors)) {
    errors.push({ path: 'errors', message: 'Errors must be a number' });
  }

  // Validate processedDocuments
  if (!('processedDocuments' in value)) {
    errors.push({ path: 'processedDocuments', message: 'ProcessedDocuments are required' });
  } else if (!isArray(value.processedDocuments)) {
    errors.push({ path: 'processedDocuments', message: 'ProcessedDocuments must be an array' });
  } else {
    value.processedDocuments.forEach((doc, index) => {
      if (!isString(doc)) {
        errors.push({
          path: `processedDocuments[${index}]`,
          message: 'Document must be a string',
        });
      }
    });
  }

  // Validate failedDocuments
  if (!('failedDocuments' in value)) {
    errors.push({ path: 'failedDocuments', message: 'FailedDocuments are required' });
  } else if (!isArray(value.failedDocuments)) {
    errors.push({ path: 'failedDocuments', message: 'FailedDocuments must be an array' });
  } else {
    value.failedDocuments.forEach((failedDoc, index) => {
      if (!isObject(failedDoc)) {
        errors.push({
          path: `failedDocuments[${index}]`,
          message: 'Failed document must be an object',
        });
      } else {
        if (!('path' in failedDoc)) {
          errors.push({
            path: `failedDocuments[${index}].path`,
            message: 'Path is required',
          });
        } else if (!isString(failedDoc.path)) {
          errors.push({
            path: `failedDocuments[${index}].path`,
            message: 'Path must be a string',
          });
        }

        if (!('error' in failedDoc)) {
          errors.push({
            path: `failedDocuments[${index}].error`,
            message: 'Error is required',
          });
        } else if (!isString(failedDoc.error)) {
          errors.push({
            path: `failedDocuments[${index}].error`,
            message: 'Error must be a string',
          });
        }
      }
    });
  }

  // Validate errorMessage (optional)
  if ('errorMessage' in value && value.errorMessage !== undefined) {
    if (!isString(value.errorMessage)) {
      errors.push({ path: 'errorMessage', message: 'ErrorMessage must be a string' });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create a default ReplacementValuesFile
 */
export function createDefaultReplacementValuesFile(
  prefix: string = DEFAULT_PREFIX
): ReplacementValuesFile {
  return {
    prefix,
    values: {},
    version: APP_VERSION,
    lastModified: new Date().toISOString(),
  };
}

/**
 * Create a default AppSettings
 */
export function createDefaultAppSettings(): AppSettings {
  return {
    windowState: {
      width: 1200,
      height: 800,
      maximized: false,
    },
    preferences: {
      defaultPrefix: DEFAULT_PREFIX,
    },
  };
}

/**
 * Create a default ScanResult
 */
export function createDefaultScanResult(): ScanResult {
  return {
    folder: '',
    documents: [],
    markers: [],
    prefix: DEFAULT_PREFIX,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Sanitize a marker identifier
 */
export function sanitizeMarkerIdentifier(identifier: string): string {
  return identifier.replace(/[^A-Za-z0-9_]/g, '').substring(0, MAX_MARKER_NAME_LENGTH);
}

/**
 * Sanitize a marker prefix
 */
export function sanitizeMarkerPrefix(prefix: string): string {
  return prefix.substring(0, MAX_PREFIX_LENGTH);
}

/**
 * Validate and sanitize a marker identifier
 */
export function validateAndSanitizeMarkerIdentifier(
  identifier: string
): { valid: boolean; sanitized: string; error?: string } {
  const sanitized = sanitizeMarkerIdentifier(identifier);

  if (sanitized.length === 0) {
    return {
      valid: false,
      sanitized: '',
      error: 'Marker identifier cannot be empty after sanitization',
    };
  }

  if (!isValidMarkerIdentifier(sanitized)) {
    return {
      valid: false,
      sanitized,
      error: 'Marker identifier contains invalid characters',
    };
  }

  return {
    valid: true,
    sanitized,
  };
}