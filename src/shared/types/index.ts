/**
 * Shared Types Package
 * 
 * This is the main entry point for all shared TypeScript types.
 * Types defined here can be imported in both main and renderer processes.
 * 
 * @example
 * ```typescript
 * // Import all types
 * import * as SharedTypes from '@shared/types';
 * 
 * // Import specific types
 * import { Marker, ScanResult, AppSettings } from '@shared/types';
 * 
 * // Import IPC types
 * import { IPC_CHANNELS, ScanFolderRequest, ScanFolderResponse } from '@shared/types';
 * ```
 */

// ============================================================================
// DATA MODELS
// ============================================================================

export * from './data-models';

// Re-export commonly used data model types for convenience
export type {
  ReplacementValuesFile,
  AppSettings,
  Marker,
  ScanResult,
  MarkerStatus,
  DocumentInfo,
  ReplacementRequest,
  ReplacementResult,
} from './data-models';

// ============================================================================
// IPC MESSAGE TYPES
// ============================================================================

export * from './ipc';

// Re-export commonly used IPC types for convenience
export type {
  IpcChannel,
  ScanFolderRequest,
  ScanFolderResponse,
  SelectFolderResponse,
  ReplaceDocumentsRequest,
  ReplaceDocumentsResponse,
  GetDocumentsRequest,
  GetDocumentsResponse,
  GetSettingsResponse,
  SaveSettingsRequest,
  SaveSettingsResponse,
  MinimizeWindowRequest,
  MaximizeWindowRequest,
  CloseWindowRequest,
  ProgressEventData,
  IpcErrorResponse,
  IpcSuccessResponse,
  IpcResponse,
} from './ipc';

// Re-export IPC channels constant
export { IPC_CHANNELS } from './ipc';

// ============================================================================
// TYPE GUARDS
// ============================================================================

import type {
  Marker,
  ScanResult,
  ReplacementValuesFile,
  AppSettings,
} from './data-models';
import type {
  IpcResponse,
  IpcSuccessResponse,
  IpcErrorResponse,
  IpcChannel,
} from './ipc';
import { IPC_CHANNELS } from './ipc';
import type {
  ScanFolderRequest,
  ReplaceDocumentsRequest,
  GetDocumentsRequest,
  SaveSettingsRequest,
  MinimizeWindowRequest,
  MaximizeWindowRequest,
  CloseWindowRequest,
  ScanFolderResponse,
  SelectFolderResponse,
  ReplaceDocumentsResponse,
  GetDocumentsResponse,
  GetSettingsResponse,
  SaveSettingsResponse,
} from './ipc';

/**
 * Type guard to check if a value is a Marker
 */
export function isMarker(value: unknown): value is Marker {
  return (
    typeof value === 'object' &&
    value !== null &&
    'identifier' in value &&
    'fullMarker' in value &&
    'value' in value &&
    'status' in value &&
    'documents' in value &&
    Array.isArray((value as Marker).documents)
  );
}

/**
 * Type guard to check if a value is a ScanResult
 */
export function isScanResult(value: unknown): value is ScanResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'folder' in value &&
    'documents' in value &&
    'markers' in value &&
    'prefix' in value &&
    'timestamp' in value &&
    Array.isArray((value as ScanResult).documents) &&
    Array.isArray((value as ScanResult).markers)
  );
}

/**
 * Type guard to check if a value is a ReplacementValuesFile
 */
export function isReplacementValuesFile(value: unknown): value is ReplacementValuesFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    'prefix' in value &&
    'values' in value &&
    'version' in value &&
    typeof (value as ReplacementValuesFile).prefix === 'string' &&
    typeof (value as ReplacementValuesFile).values === 'object' &&
    typeof (value as ReplacementValuesFile).version === 'string'
  );
}

/**
 * Type guard to check if a value is an AppSettings
 */
export function isAppSettings(value: unknown): value is AppSettings {
  return (
    typeof value === 'object' &&
    value !== null &&
    'windowState' in value &&
    'preferences' in value &&
    typeof (value as AppSettings).windowState === 'object' &&
    typeof (value as AppSettings).preferences === 'object'
  );
}

/**
 * Type guard to check if an IPC response is successful
 */
export function isIpcSuccessResponse<T = unknown>(
  response: IpcResponse<T>
): response is IpcSuccessResponse<T> {
  return response.success === true;
}

/**
 * Type guard to check if an IPC response is an error
 */
export function isIpcErrorResponse(
  response: IpcResponse<unknown>
): response is IpcErrorResponse {
  return response.success === false;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Extract the request type for a given IPC channel
 */
export type IpcRequestForChannel<T extends IpcChannel> = T extends typeof IPC_CHANNELS.SCAN_FOLDER
  ? ScanFolderRequest
  : T extends typeof IPC_CHANNELS.REPLACE_DOCUMENTS
  ? ReplaceDocumentsRequest
  : T extends typeof IPC_CHANNELS.GET_DOCUMENTS
  ? GetDocumentsRequest
  : T extends typeof IPC_CHANNELS.SAVE_SETTINGS
  ? SaveSettingsRequest
  : T extends typeof IPC_CHANNELS.MINIMIZE_WINDOW
  ? MinimizeWindowRequest
  : T extends typeof IPC_CHANNELS.MAXIMIZE_WINDOW
  ? MaximizeWindowRequest
  : T extends typeof IPC_CHANNELS.CLOSE_WINDOW
  ? CloseWindowRequest
  : never;

/**
 * Extract the response type for a given IPC channel
 */
export type IpcResponseForChannel<T extends IpcChannel> = T extends typeof IPC_CHANNELS.SCAN_FOLDER
  ? ScanFolderResponse
  : T extends typeof IPC_CHANNELS.SELECT_FOLDER
  ? SelectFolderResponse
  : T extends typeof IPC_CHANNELS.REPLACE_DOCUMENTS
  ? ReplaceDocumentsResponse
  : T extends typeof IPC_CHANNELS.GET_DOCUMENTS
  ? GetDocumentsResponse
  : T extends typeof IPC_CHANNELS.GET_SETTINGS
  ? GetSettingsResponse
  : T extends typeof IPC_CHANNELS.SAVE_SETTINGS
  ? SaveSettingsResponse
  : never;

/**
 * Make all properties in T optional recursively
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Make all properties in T required recursively
 */
export type DeepRequired<T> = {
  [P in keyof T]-?: T[P] extends object ? DeepRequired<T[P]> : T[P];
};

/**
 * Extract keys of T where the value type is U
 */
export type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

/**
 * Create a type with only the specified keys from T
 */
export type PickByType<T, U> = Pick<T, KeysOfType<T, U>>;