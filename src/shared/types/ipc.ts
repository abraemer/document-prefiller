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
 * IPC Error Response
 * Standard error response for IPC calls
 */
export interface IpcErrorResponse {
  /** Whether the operation failed */
  success: false;
  /** Error code */
  code?: string;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: unknown;
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