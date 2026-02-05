/**
 * Shared Types
 * TypeScript type definitions shared between main and renderer processes
 * 
 * This file contains all data model interfaces as specified in PLAN.md section 5
 * plus IPC message types for inter-process communication
 */

// ============================================================================
// DATA MODELS (from PLAN.md section 5)
// ============================================================================

/**
 * Replacement Values File
 * 
 * Represents the .replacement-values.json file structure
 * 
 * @example
 * ```json
 * {
 *   "prefix": "REPLACEME-",
 *   "values": {
 *     "WORD": "example",
 *     "NAME": "Jane Smith",
 *     "DATE": "2024-02-05",
 *     "COMPANY": "Acme Corp"
 *   },
 *   "version": "1.0",
 *   "lastModified": "2024-02-05T06:58:33.420Z"
 * }
 * ```
 */
export interface ReplacementValuesFile {
  /** Marker prefix (e.g., "REPLACEME-") */
  prefix: string;
  /** Key: identifier, Value: replacement text */
  values: Record<string, string>;
  /** File format version */
  version: string;
  /** ISO timestamp of last modification */
  lastModified?: string;
}

/**
 * Application Settings
 * 
 * Represents the application-wide settings stored in Electron store
 * 
 * @example
 * ```typescript
 * {
 *   lastFolder: "/path/to/documents",
 *   windowState: {
 *     width: 1200,
 *     height: 800,
 *     x: 100,
 *     y: 100,
 *     maximized: false
 *   },
 *   preferences: {
 *     defaultPrefix: "REPLACEME-"
 *   }
 * }
 * ```
 */
export interface AppSettings {
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
}

/**
 * Marker Data Model
 * 
 * Represents a replacement marker detected in documents
 * 
 * @example
 * ```typescript
 * {
 *   identifier: "WORD",
 *   fullMarker: "REPLACEME-WORD",
 *   value: "example",
 *   status: "active",
 *   documents: ["template.docx", "contract.docx"]
 * }
 * ```
 */
export interface Marker {
  /** The identifier part (e.g., "WORD") */
  identifier: string;
  /** Full marker including prefix (e.g., "REPLACEME-WORD") */
  fullMarker: string;
  /** Current replacement value */
  value: string;
  /** Marker status: active (detected), new (detected but not saved), removed (saved but not detected) */
  status: 'active' | 'new' | 'removed';
  /** List of documents containing this marker */
  documents: string[];
}

/**
 * Document Scan Result
 * 
 * Represents the result of scanning a folder for documents and markers
 * 
 * @example
 * ```typescript
 * {
 *   folder: "/path/to/documents",
 *   documents: ["template.docx", "contract.docx", "letter.docx"],
 *   markers: [
 *     {
 *       identifier: "WORD",
 *       fullMarker: "REPLACEME-WORD",
 *       value: "example",
 *       status: "active",
 *       documents: ["template.docx", "contract.docx"]
 *     }
 *   ],
 *   prefix: "REPLACEME-",
 *   timestamp: "2024-02-05T09:19:31.958Z"
 * }
 * ```
 */
export interface ScanResult {
  /** Scanned folder path */
  folder: string;
  /** List of .docx files found */
  documents: string[];
  /** Detected markers */
  markers: Marker[];
  /** Prefix used for scanning */
  prefix: string;
  /** Scan timestamp in ISO format */
  timestamp: string;
}

// ============================================================================
// ADDITIONAL HELPER TYPES
// ============================================================================

/**
 * Marker Status Type
 * 
 * Union type for marker status
 */
export type MarkerStatus = 'active' | 'new' | 'removed';

/**
 * Document File Info
 * 
 * Represents a document file with basic metadata
 */
export interface DocumentInfo {
  /** Document file path */
  path: string;
  /** Document file name */
  name: string;
  /** Markers found in this document */
  markers: string[];
}

/**
 * Replacement Request
 * 
 * Request payload for document replacement operation
 */
export interface ReplacementRequest {
  /** Source folder path */
  sourceFolder: string;
  /** Output folder path */
  outputFolder: string;
  /** Replacement values to apply */
  values: Record<string, string>;
  /** Marker prefix used */
  prefix: string;
}

/**
 * Replacement Result
 * 
 * Result of document replacement operation
 */
export interface ReplacementResult {
  /** Whether operation was successful */
  success: boolean;
  /** Number of documents processed */
  processed: number;
  /** Number of documents with errors */
  errors: number;
  /** Error message if operation failed */
  errorMessage?: string;
  /** List of processed document paths */
  processedDocuments: string[];
  /** List of failed document paths with errors */
  failedDocuments: Array<{
    path: string;
    error: string;
  }>;
}

// ============================================================================
// IPC MESSAGE TYPES (for inter-process communication)
// ============================================================================

/**
 * IPC Channel names
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
} as const

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS]

/**
 * IPC Request/Response types
 */
export interface ScanFolderRequest {
  folderPath: string
}

export interface ScanFolderResponse {
  documents: DocumentInfo[]
  error?: string
}

export interface SelectFolderResponse {
  folderPath: string | null
  error?: string
}

export interface ReplaceDocumentsRequest {
  folderPath: string
  markers: DocumentMarker[]
}

export interface ReplaceDocumentsResponse {
  success: boolean
  processed: number
  error?: string
}

export interface GetDocumentsRequest {
  folderPath: string
}

export interface GetDocumentsResponse {
  documents: DocumentInfo[]
  error?: string
}

export interface SaveSettingsRequest {
  settings: AppSettings
}

export interface SaveSettingsResponse {
  success: boolean
  error?: string
}

/**
 * Document marker for replacement (legacy type for IPC compatibility)
 */
export interface DocumentMarker {
  id: string
  name: string
  prefix: string
  enabled: boolean
}