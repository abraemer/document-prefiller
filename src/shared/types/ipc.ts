/**
 * IPC Message Types
 * TypeScript types for inter-process communication between main and renderer processes
 */

/**
 * IPC Channel names
 * All IPC channels used in the application
 */
export const IPC_CHANNELS = {
  // Folder operations
  SCAN_FOLDER: 'folder:scan',
  SELECT_FOLDER: 'folder:select',

  // Document operations
  REPLACE_DOCUMENTS: 'document:replace',
  GET_DOCUMENTS: 'document:get',

  // Settings operations
  GET_SETTINGS: 'settings:get',
  SAVE_SETTINGS: 'settings:save',

  // Window operations
  MINIMIZE_WINDOW: 'window:minimize',
  MAXIMIZE_WINDOW: 'window:maximize',
  CLOSE_WINDOW: 'window:close',

  // Event channels (main -> renderer)
  PROGRESS_EVENT: 'progress:event',
  SETTINGS_CHANGED: 'settings:changed',
} as const;

/**
 * IPC Channel type
 * Union type of all IPC channel names
 */
export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];

// ============================================================================
// FOLDER OPERATIONS
// ============================================================================

/**
 * Scan Folder Request
 * Request to scan a folder for .docx files and detect markers
 */
export interface ScanFolderRequest {
  /** Path to the folder to scan */
  folderPath: string;
  /** Optional prefix to use for marker detection */
  prefix?: string;
}

/**
 * Scan Folder Response
 * Response containing scan results
 */
export interface ScanFolderResponse {
  /** List of documents found */
  documents: Array<{
    /** Document file path */
    path: string;
    /** Document file name */
    name: string;
    /** Markers found in this document */
    markers: string[];
  }>;
  /** Error message if scan failed */
  error?: string;
}

/**
 * Select Folder Response
 * Response containing selected folder path
 */
export interface SelectFolderResponse {
  /** Selected folder path, or null if cancelled */
  folderPath: string | null;
  /** Error message if selection failed */
  error?: string;
}

// ============================================================================
// DOCUMENT OPERATIONS
// ============================================================================

/**
 * Document marker for replacement
 */
export interface DocumentMarker {
  /** Marker identifier */
  id: string;
  /** Marker name */
  name: string;
  /** Marker prefix */
  prefix: string;
  /** Whether marker is enabled */
  enabled: boolean;
}

/**
 * Replace Documents Request
 * Request to replace markers in documents
 */
export interface ReplaceDocumentsRequest {
  /** Source folder path */
  folderPath: string;
  /** Markers to replace */
  markers: DocumentMarker[];
}

/**
 * Replace Documents Response
 * Response containing replacement results
 */
export interface ReplaceDocumentsResponse {
  /** Whether the replacement was successful */
  success: boolean;
  /** Number of documents processed */
  processed: number;
  /** Error message if replacement failed */
  error?: string;
}

/**
 * Get Documents Request
 * Request to get list of documents in a folder
 */
export interface GetDocumentsRequest {
  /** Path to the folder */
  folderPath: string;
}

/**
 * Get Documents Response
 * Response containing document list
 */
export interface GetDocumentsResponse {
  /** List of documents */
  documents: Array<{
    /** Document file path */
    path: string;
    /** Document file name */
    name: string;
    /** Markers found in this document */
    markers: string[];
  }>;
  /** Error message if request failed */
  error?: string;
}

// ============================================================================
// SETTINGS OPERATIONS
// ============================================================================

/**
 * Get Settings Response
 * Response containing application settings
 */
export type GetSettingsResponse = {
  /** Last selected folder path */
  lastFolder?: string;
  /** Window state for persistence */
  windowState: {
    /** Window width in pixels */
    width: number;
    /** Window height in pixels */
    height: number;
    /** Window X position */
    x?: number;
    /** Window Y position */
    y?: number;
    /** Whether window is maximized */
    maximized?: boolean;
  };
  /** User preferences */
  preferences: {
    /** Default prefix for new folders */
    defaultPrefix?: string;
  };
};

/**
 * Save Settings Request
 * Request to save application settings
 */
export interface SaveSettingsRequest {
  /** Settings to save */
  settings: {
    /** Last selected folder path */
    lastFolder?: string;
    /** Window state for persistence */
    windowState?: {
      /** Window width in pixels */
      width: number;
      /** Window height in pixels */
      height: number;
      /** Window X position */
      x?: number;
      /** Window Y position */
      y?: number;
      /** Whether window is maximized */
      maximized?: boolean;
    };
    /** User preferences */
    preferences?: {
      /** Default prefix for new folders */
      defaultPrefix?: string;
    };
  };
}

/**
 * Save Settings Response
 * Response indicating save result
 */
export interface SaveSettingsResponse {
  /** Whether the save was successful */
  success: boolean;
  /** Error message if save failed */
  error?: string;
}

// ============================================================================
// WINDOW OPERATIONS
// ============================================================================

/**
 * Minimize Window Request
 * Request to minimize the application window
 */
export interface MinimizeWindowRequest {
  /** Window ID (optional, defaults to main window) */
  windowId?: number;
}

/**
 * Maximize Window Request
 * Request to maximize/unmaximize the application window
 */
export interface MaximizeWindowRequest {
  /** Window ID (optional, defaults to main window) */
  windowId?: number;
  /** Whether to maximize (true) or unmaximize (false) */
  maximize?: boolean;
}

/**
 * Close Window Request
 * Request to close the application window
 */
export interface CloseWindowRequest {
  /** Window ID (optional, defaults to main window) */
  windowId?: number;
}

// ============================================================================
// PROGRESS EVENTS
// ============================================================================

/**
 * Progress Event Data
 * Emitted during long-running operations
 */
export interface ProgressEventData {
  /** Type of operation */
  operation: 'scan' | 'replace';
  /** Current progress (0-100) */
  progress: number;
  /** Current item being processed */
  currentItem?: string;
  /** Total number of items */
  total?: number;
  /** Number of items completed */
  completed?: number;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * IPC Error Codes
 * Standard error codes for IPC operations
 */
export enum IpcErrorCode {
  // General errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  TIMEOUT = 'TIMEOUT',

  // Folder operation errors
  FOLDER_NOT_FOUND = 'FOLDER_NOT_FOUND',
  FOLDER_ACCESS_DENIED = 'FOLDER_ACCESS_DENIED',
  FOLDER_NOT_DIRECTORY = 'FOLDER_NOT_DIRECTORY',
  NO_DOCUMENTS_FOUND = 'NO_DOCUMENTS_FOUND',

  // Document operation errors
  DOCUMENT_NOT_FOUND = 'DOCUMENT_NOT_FOUND',
  DOCUMENT_READ_ERROR = 'DOCUMENT_READ_ERROR',
  DOCUMENT_WRITE_ERROR = 'DOCUMENT_WRITE_ERROR',
  DOCUMENT_PARSE_ERROR = 'DOCUMENT_PARSE_ERROR',
  INVALID_DOCUMENT_FORMAT = 'INVALID_DOCUMENT_FORMAT',

  // Settings operation errors
  SETTINGS_LOAD_ERROR = 'SETTINGS_LOAD_ERROR',
  SETTINGS_SAVE_ERROR = 'SETTINGS_SAVE_ERROR',
  INVALID_SETTINGS = 'INVALID_SETTINGS',

  // Replacement operation errors
  REPLACEMENT_FAILED = 'REPLACEMENT_FAILED',
  OUTPUT_FOLDER_ERROR = 'OUTPUT_FOLDER_ERROR',
  COPY_FAILED = 'COPY_FAILED',
}

/**
 * IPC Error Response
 * Standard error response for IPC calls
 */
export interface IpcErrorResponse {
  /** Whether the operation failed */
  success: false;
  /** Error code */
  code?: IpcErrorCode | string;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: unknown;
  /** Stack trace for debugging (development only) */
  stack?: string;
}

/**
 * IPC Success Response
 * Standard success response wrapper for IPC calls
 */
export interface IpcSuccessResponse<T = unknown> {
  /** Whether the operation succeeded */
  success: true;
  /** Response data */
  data: T;
}

/**
 * IPC Response
 * Union type for all IPC responses
 */
export type IpcResponse<T = unknown> = IpcSuccessResponse<T> | IpcErrorResponse;

// ============================================================================
// EVENT TYPES (Main -> Renderer)
// ============================================================================

/**
 * Settings Changed Event
 * Emitted when application settings are updated
 */
export interface SettingsChangedEvent {
  /** Updated settings */
  settings: {
    /** Last selected folder path */
    lastFolder?: string;
    /** Window state for persistence */
    windowState?: {
      /** Window width in pixels */
      width: number;
      /** Window height in pixels */
      height: number;
      /** Window X position */
      x?: number;
      /** Window Y position */
      y?: number;
      /** Whether window is maximized */
      maximized?: boolean;
    };
    /** User preferences */
    preferences?: {
      /** Default prefix for new folders */
      defaultPrefix?: string;
    };
  };
}

/**
 * Progress Event
 * Emitted during long-running operations
 */
export interface ProgressEvent {
  /** Type of operation */
  operation: 'scan' | 'replace';
  /** Current progress (0-100) */
  progress: number;
  /** Current item being processed */
  currentItem?: string;
  /** Total number of items */
  total?: number;
  /** Number of items completed */
  completed?: number;
  /** Current phase of operation (for replace operations) */
  phase?: 'copying' | 'processing' | 'complete';
  /** Number of errors encountered */
  errors?: number;
  /** Whether the operation is complete */
  isComplete?: boolean;
}

/**
 * Error Event
 * Emitted when an error occurs during an operation
 */
export interface ErrorEvent {
  /** Type of operation that failed */
  operation: 'scan' | 'replace' | 'save' | 'load';
  /** Error message */
  message: string;
  /** Error code */
  code?: string;
  /** Additional error details */
  details?: unknown;
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

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

/**
 * Type guard to check if a value is a ProgressEvent
 */
export function isProgressEvent(value: unknown): value is ProgressEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'operation' in value &&
    'progress' in value &&
    typeof (value as ProgressEvent).progress === 'number' &&
    ['scan', 'replace'].includes((value as ProgressEvent).operation)
  );
}

/**
 * Type guard to check if a value is a SettingsChangedEvent
 */
export function isSettingsChangedEvent(value: unknown): value is SettingsChangedEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'settings' in value &&
    typeof (value as SettingsChangedEvent).settings === 'object'
  );
}

/**
 * Type guard to check if a value is an ErrorEvent
 */
export function isErrorEvent(value: unknown): value is ErrorEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'operation' in value &&
    'message' in value &&
    typeof (value as ErrorEvent).message === 'string' &&
    ['scan', 'replace', 'save', 'load'].includes((value as ErrorEvent).operation)
  );
}