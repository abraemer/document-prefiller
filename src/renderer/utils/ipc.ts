/**
 * IPC Communication Layer
 * 
 * A unified, type-safe wrapper for IPC communication between renderer and main processes.
 * Provides error handling, retry logic, timeout handling, and event listener management.
 * 
 * @example
 * ```typescript
 * import { ipc } from '@/utils/ipc';
 * 
 * // Scan a folder
 * const result = await ipc.folder.scanFolder('/path/to/folder');
 * if (result.success) {
 *   console.log(result.data.documents);
 * } else {
 *   console.error(result.message);
 * }
 * 
 * // Listen for progress events
 * const unsubscribe = ipc.events.onProgress((event) => {
 *   console.log(`Progress: ${event.progress}%`);
 * });
 * 
 * // Clean up
 * unsubscribe();
 * ```
 */

import type {
  ScanFolderResponse,
  SelectFolderResponse,
  ReplaceDocumentsResponse,
  GetDocumentsResponse,
  SaveSettingsResponse,
  AppSettings,
  ProgressEvent,
  SettingsChangedEvent,
  ErrorEvent,
  IpcResponse,
  IpcSuccessResponse,
  IpcErrorResponse,
  IpcErrorCode,
  DocumentMarker,
} from '../../shared/types';
import {
  IPC_TIMEOUT,
  IPC_RETRY_COUNT,
  IPC_RETRY_DELAY,
  DEFAULT_ERROR_MESSAGE,
} from '../../shared/constants';

// ============================================================================
// TYPES
// ============================================================================

/**
 * IPC call options
 */
export interface IpcCallOptions {
  /** Timeout in milliseconds (default: IPC_TIMEOUT) */
  timeout?: number;
  /** Number of retry attempts (default: IPC_RETRY_COUNT) */
  retryCount?: number;
  /** Delay between retries in milliseconds (default: IPC_RETRY_DELAY) */
  retryDelay?: number;
  /** Whether to log IPC calls (default: true) */
  logCalls?: boolean;
}

/**
 * Event listener callback type
 */
export type EventListenerCallback<T> = (event: T) => void;

/**
 * Unsubscribe function for event listeners
 */
export type UnsubscribeFunction = () => void;

/**
 * IPC error with additional context
 */
export interface IpcCallError extends Error {
  /** Error code */
  code?: IpcErrorCode | string;
  /** Original error */
  originalError?: unknown;
  /** Number of retry attempts */
  retryAttempts?: number;
  /** Whether the error was a timeout */
  isTimeout?: boolean;
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

/**
 * Create an IPC error with additional context
 */
function createIpcError(
  message: string,
  code?: IpcErrorCode | string,
  originalError?: unknown,
  retryAttempts?: number,
  isTimeout?: boolean
): IpcCallError {
  const error = new Error(message) as IpcCallError;
  error.name = 'IpcCallError';
  error.code = code;
  error.originalError = originalError;
  error.retryAttempts = retryAttempts;
  error.isTimeout = isTimeout;
  return error;
}

/**
 * Wrap an error in an IPC error response
 */
function wrapError(error: unknown, defaultMessage: string = DEFAULT_ERROR_MESSAGE): IpcErrorResponse {
  if (error && typeof error === 'object' && 'success' in error && error.success === false) {
    return error as IpcErrorResponse;
  }

  const message = error instanceof Error ? error.message : defaultMessage;
  return {
    success: false,
    message,
    code: 'UNKNOWN_ERROR',
    details: error,
  };
}

/**
 * Wrap a successful response in an IPC success response
 */
function wrapSuccess<T>(data: T): IpcSuccessResponse<T> {
  return {
    success: true,
    data,
  };
}

// ============================================================================
// TIMEOUT HANDLING
// ============================================================================

/**
 * Create a promise that rejects after a timeout
 */
function createTimeoutPromise(timeout: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(createIpcError(`IPC call timed out after ${timeout}ms`, 'TIMEOUT', undefined, 0, true));
    }, timeout);
  });
}

/**
 * Execute a promise with timeout
 */
async function withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
  return Promise.race([promise, createTimeoutPromise(timeout)]);
}

// ============================================================================
// RETRY LOGIC
// ============================================================================

/**
 * Execute a function with retry logic
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: IpcCallOptions
): Promise<T> {
  const { retryCount = IPC_RETRY_COUNT, retryDelay = IPC_RETRY_DELAY } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on certain errors
      if (error instanceof Error && error.name === 'IpcCallError') {
        const ipcError = error as IpcCallError;
        if (ipcError.code === 'INVALID_REQUEST') {
          throw error;
        }
      }

      // Wait before retrying (except on last attempt)
      if (attempt < retryCount) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }

  throw createIpcError(
    `IPC call failed after ${retryCount + 1} attempts`,
    'UNKNOWN_ERROR',
    lastError,
    retryCount
  );
}

// ============================================================================
// LOGGING
// ============================================================================

/**
 * Log an IPC call
 */
function logIpcCall(channel: string, data?: unknown, options?: IpcCallOptions): void {
  if (options?.logCalls !== false) {
    console.log(`[IPC] ${channel}`, data);
  }
}

/**
 * Log an IPC response
 */
function logIpcResponse(channel: string, response: unknown, options?: IpcCallOptions): void {
  if (options?.logCalls !== false) {
    console.log(`[IPC] ${channel} response`, response);
  }
}

/**
 * Log an IPC error
 */
function logIpcError(channel: string, error: unknown, options?: IpcCallOptions): void {
  if (options?.logCalls !== false) {
    console.error(`[IPC] ${channel} error`, error);
  }
}

// ============================================================================
// IPC CALL WRAPPER
// ============================================================================

/**
 * Execute an IPC call with error handling, retry logic, and timeout
 */
async function executeIpcCall<T>(
  channel: string,
  fn: () => Promise<T>,
  options: IpcCallOptions = {}
): Promise<IpcResponse<T>> {
  const { logCalls = true } = options;

  logIpcCall(channel, undefined, { logCalls });

  try {
    const result = await withRetry(
      () => withTimeout(fn(), options.timeout || IPC_TIMEOUT),
      options
    );

    logIpcResponse(channel, result, { logCalls });

    // Check if result already has success field
    if (result && typeof result === 'object' && 'success' in result) {
      return result as IpcResponse<T>;
    }

    // Wrap in success response
    return wrapSuccess(result as T);
  } catch (error) {
    logIpcError(channel, error, { logCalls });
    return wrapError(error);
  }
}

// ============================================================================
// FOLDER OPERATIONS
// ============================================================================

/**
 * Folder operations API
 */
export const folder = {
  /**
   * Scan a folder for documents with markers
   * 
   * @param folderPath - Path to the folder to scan
   * @param options - IPC call options
   * @returns Promise resolving to scan result
   */
  async scanFolder(
    folderPath: string,
    options?: IpcCallOptions
  ): Promise<IpcResponse<ScanFolderResponse>> {
    return executeIpcCall<ScanFolderResponse>(
      'folder:scan',
      () => window.api.folder.scanFolder(folderPath),
      options
    );
  },

  /**
   * Open a folder selection dialog
   * 
   * @param options - IPC call options
   * @returns Promise resolving to selected folder path
   */
  async selectFolder(options?: IpcCallOptions): Promise<IpcResponse<SelectFolderResponse>> {
    return executeIpcCall<SelectFolderResponse>(
      'folder:select',
      () => window.api.folder.selectFolder(),
      options
    );
  },
};

// ============================================================================
// DOCUMENT OPERATIONS
// ============================================================================

/**
 * Document operations API
 */
export const document = {
  /**
   * Replace markers in documents
   * 
   * @param folderPath - Source folder path
   * @param markers - Markers to replace
   * @param options - IPC call options
   * @returns Promise resolving to replacement result
   */
  async replaceDocuments(
    folderPath: string,
    markers: DocumentMarker[],
    options?: IpcCallOptions
  ): Promise<IpcResponse<ReplaceDocumentsResponse>> {
    return executeIpcCall<ReplaceDocumentsResponse>(
      'document:replace',
      () => window.api.document.replaceDocuments(folderPath, markers),
      options
    );
  },

  /**
   * Get documents from a folder
   * 
   * @param folderPath - Path to the folder
   * @param options - IPC call options
   * @returns Promise resolving to document list
   */
  async getDocuments(
    folderPath: string,
    options?: IpcCallOptions
  ): Promise<IpcResponse<GetDocumentsResponse>> {
    return executeIpcCall<GetDocumentsResponse>(
      'document:get',
      () => window.api.document.getDocuments(folderPath),
      options
    );
  },
};

// ============================================================================
// SETTINGS OPERATIONS
// ============================================================================

/**
 * Settings operations API
 */
export const settings = {
  /**
   * Get application settings
   * 
   * @param options - IPC call options
   * @returns Promise resolving to settings
   */
  async getSettings(options?: IpcCallOptions): Promise<IpcResponse<AppSettings>> {
    return executeIpcCall<AppSettings>(
      'settings:get',
      () => window.api.settings.getSettings(),
      options
    );
  },

  /**
   * Save application settings
   * 
   * @param settings - Settings to save
   * @param options - IPC call options
   * @returns Promise resolving to save result
   */
  async saveSettings(
    settings: AppSettings,
    options?: IpcCallOptions
  ): Promise<IpcResponse<SaveSettingsResponse>> {
    return executeIpcCall<SaveSettingsResponse>(
      'settings:save',
      () => window.api.settings.saveSettings(settings),
      options
    );
  },
};

// ============================================================================
// WINDOW OPERATIONS
// ============================================================================

/**
 * Window operations API
 */
export const window = {
  /**
   * Minimize the window
   */
  minimize(): void {
    window.api.window.minimize();
  },

  /**
   * Maximize or restore the window
   */
  maximize(): void {
    window.api.window.maximize();
  },

  /**
   * Close the window
   */
  close(): void {
    window.api.window.close();
  },
};

// ============================================================================
// EVENT LISTENERS
// ============================================================================

/**
 * Event listeners API
 */
export const events = {
  /**
   * Listen for progress events
   * Note: This is a placeholder for future implementation
   * The main process needs to emit progress events
   * 
   * @param _callback - Callback function to handle progress events
   * @returns Unsubscribe function
   */
  onProgress(_callback: EventListenerCallback<ProgressEvent>): UnsubscribeFunction {
    // Progress events are not currently implemented in the preload script
    // This is a placeholder for future implementation
    console.warn('Progress events are not currently implemented');
    return () => {};
  },

  /**
   * Listen for settings change events
   * 
   * @param callback - Callback function to handle settings change events
   * @returns Unsubscribe function
   */
  onSettingsChanged(callback: EventListenerCallback<SettingsChangedEvent>): UnsubscribeFunction {
    const listener = (settings: AppSettings) => {
      callback({ settings });
    };
    window.api.events.onSettingsChanged(listener);
    return () => window.api.events.removeSettingsChangedListener();
  },

  /**
   * Listen for error events
   * 
   * @param callback - Callback function to handle error events
   * @returns Unsubscribe function
   */
  onError(callback: EventListenerCallback<ErrorEvent>): UnsubscribeFunction {
    const listener = (errorMessage: string) => {
      callback({
        operation: 'scan',
        message: errorMessage,
      });
    };
    window.api.events.onError(listener);
    return () => window.api.events.removeErrorListener();
  },

  /**
   * Listen for document update events
   * 
   * @param callback - Callback function to handle document update events
   * @returns Unsubscribe function
   */
  onDocumentUpdated(
    callback: EventListenerCallback<{ path: string; name: string; markers: string[] }>
  ): UnsubscribeFunction {
    const listener = (document: { path: string; name: string; markers: string[] }) => {
      callback(document);
    };
    window.api.events.onDocumentUpdated(listener);
    return () => window.api.events.removeDocumentUpdatedListener();
  },

  /**
   * Remove all listeners for a specific channel
   * 
   * @param channel - Channel name
   */
  removeAllListeners(channel: string): void {
    window.api.events.removeAllListeners(channel);
  },
};

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Check if an IPC response is successful
 */
export function isSuccess<T>(response: IpcResponse<T>): response is IpcSuccessResponse<T> {
  return response.success === true;
}

/**
 * Check if an IPC response is an error
 */
export function isError(response: IpcResponse<unknown>): response is IpcErrorResponse {
  return response.success === false;
}

/**
 * Extract data from a successful response or throw error
 */
export function getDataOrThrow<T>(response: IpcResponse<T>): T {
  if (isSuccess(response)) {
    return response.data;
  }
  throw createIpcError(response.message, response.code, response.details);
}

/**
 * Extract data from a successful response or return default
 */
export function getDataOrDefault<T>(response: IpcResponse<T>, defaultValue: T): T {
  if (isSuccess(response)) {
    return response.data;
  }
  return defaultValue;
}

// ============================================================================
// MAIN IPC EXPORT
// ============================================================================

/**
 * Main IPC API
 * Provides a unified interface for all IPC operations
 */
export const ipc = {
  folder,
  document,
  settings,
  window,
  events,
  isSuccess,
  isError,
  getDataOrThrow,
  getDataOrDefault,
};

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default ipc;