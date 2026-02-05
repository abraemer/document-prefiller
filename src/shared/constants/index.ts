/**
 * Shared Constants
 * Application constants shared between main and renderer processes
 */

// ============================================================================
// APPLICATION METADATA
// ============================================================================

/**
 * Application version
 */
export const APP_VERSION = '1.0.0';

/**
 * Application name
 */
export const APP_NAME = 'Document Prefiller';

/**
 * Application description
 */
export const APP_DESCRIPTION = 'A tool to replace markers in Word documents';

// ============================================================================
// MARKER CONSTANTS
// ============================================================================

/**
 * Default marker prefix for detecting markers in documents
 */
export const DEFAULT_PREFIX = 'REPLACEME-';

/**
 * Minimum prefix length
 */
export const MIN_PREFIX_LENGTH = 1;

/**
 * Maximum prefix length
 */
export const MAX_PREFIX_LENGTH = 50;

/**
 * Regex pattern for marker detection (prefix followed by alphanumeric characters and underscores)
 */
export const MARKER_PATTERN = /^[A-Za-z0-9_]+$/;

// ============================================================================
// FILE CONSTANTS
// ============================================================================

/**
 * Name of the save file that stores replacement values
 */
export const SAVE_FILE_NAME = '.replacement-values.json';

/**
 * Supported document file extensions
 */
export const DOCUMENT_EXTENSIONS = ['.docx'] as const;

/**
 * Document file extension for filtering
 */
export const DOCUMENT_EXTENSION = '.docx';

/**
 * MIME type for Word documents
 */
export const DOCUMENT_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// ============================================================================
// WINDOW CONSTANTS
// ============================================================================

/**
 * Default window width in pixels
 */
export const DEFAULT_WINDOW_WIDTH = 1200;

/**
 * Default window height in pixels
 */
export const DEFAULT_WINDOW_HEIGHT = 800;

/**
 * Minimum window width in pixels
 */
export const MIN_WINDOW_WIDTH = 800;

/**
 * Minimum window height in pixels
 */
export const MIN_WINDOW_HEIGHT = 600;

/**
 * Window state storage key
 */
export const WINDOW_STATE_KEY = 'windowState';

// ============================================================================
// SETTINGS CONSTANTS
// ============================================================================

/**
 * Settings storage key
 */
export const SETTINGS_KEY = 'appSettings';

/**
 * Default settings for the application
 */
export const DEFAULT_SETTINGS = {
  lastFolder: undefined as string | undefined,
  windowState: {
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    x: undefined as number | undefined,
    y: undefined as number | undefined,
    maximized: false,
  },
  preferences: {
    defaultPrefix: DEFAULT_PREFIX,
  },
} as const;

// ============================================================================
// IPC CONSTANTS
// ============================================================================

/**
 * IPC timeout in milliseconds
 */
export const IPC_TIMEOUT = 30000;

/**
 * IPC retry count for failed requests
 */
export const IPC_RETRY_COUNT = 3;

/**
 * IPC retry delay in milliseconds
 */
export const IPC_RETRY_DELAY = 1000;

// ============================================================================
// SCAN CONSTANTS
// ============================================================================

/**
 * Maximum number of documents to scan in a single operation
 */
export const MAX_SCAN_DOCUMENTS = 1000;

/**
 * Maximum file size for documents (in bytes) - 100MB
 */
export const MAX_DOCUMENT_SIZE = 100 * 1024 * 1024;

/**
 * Maximum number of markers to detect per document
 */
export const MAX_MARKERS_PER_DOCUMENT = 1000;

/**
 * Maximum number of unique markers across all documents
 */
export const MAX_UNIQUE_MARKERS = 500;

// ============================================================================
// REPLACEMENT CONSTANTS
// ============================================================================

/**
 * Maximum length for replacement values
 */
export const MAX_REPLACEMENT_VALUE_LENGTH = 10000;

/**
 * Maximum number of documents to process in a batch
 */
export const MAX_BATCH_SIZE = 100;

/**
 * Progress update interval in milliseconds during replacement
 */
export const PROGRESS_UPDATE_INTERVAL = 100;

// ============================================================================
// STORAGE CONSTANTS
// ============================================================================

/**
 * Auto-save debounce delay in milliseconds
 */
export const AUTO_SAVE_DEBOUNCE_DELAY = 500;

/**
 * Maximum number of save file backups to keep
 */
export const MAX_SAVE_FILE_BACKUPS = 5;

/**
 * Save file backup extension
 */
export const SAVE_FILE_BACKUP_EXTENSION = '.bak';

// ============================================================================
// UI CONSTANTS
// ============================================================================

/**
 * Toast notification duration in milliseconds
 */
export const TOAST_DURATION = 3000;

/**
 * Success toast duration in milliseconds
 */
export const SUCCESS_TOAST_DURATION = 2000;

/**
 * Error toast duration in milliseconds
 */
export const ERROR_TOAST_DURATION = 5000;

/**
 * Loading spinner delay in milliseconds (before showing)
 */
export const LOADING_SPINNER_DELAY = 200;

/**
 * Debounce delay for input fields in milliseconds
 */
export const INPUT_DEBOUNCE_DELAY = 300;

// ============================================================================
// VALIDATION CONSTANTS
// ============================================================================

/**
 * Maximum folder path length
 */
export const MAX_FOLDER_PATH_LENGTH = 260;

/**
 * Maximum file name length
 */
export const MAX_FILE_NAME_LENGTH = 255;

/**
 * Maximum marker name length
 */
export const MAX_MARKER_NAME_LENGTH = 100;

// ============================================================================
// ERROR CONSTANTS
// ============================================================================

/**
 * Default error message for unknown errors
 */
export const DEFAULT_ERROR_MESSAGE = 'An unexpected error occurred';

/**
 * Error message for folder not found
 */
export const FOLDER_NOT_FOUND_ERROR = 'The specified folder could not be found';

/**
 * Error message for no documents found
 */
export const NO_DOCUMENTS_FOUND_ERROR = 'No .docx files found in the selected folder';

/**
 * Error message for invalid document format
 */
export const INVALID_DOCUMENT_FORMAT_ERROR = 'The document is not a valid .docx file';

/**
 * Error message for document read error
 */
export const DOCUMENT_READ_ERROR = 'Failed to read the document';

/**
 * Error message for document write error
 */
export const DOCUMENT_WRITE_ERROR = 'Failed to write the document';

/**
 * Error message for replacement failed
 */
export const REPLACEMENT_FAILED_ERROR = 'Failed to replace markers in the document';

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

/**
 * Keyboard shortcut for opening folder dialog
 */
export const SHORTCUT_OPEN_FOLDER = 'CmdOrCtrl+O';

/**
 * Keyboard shortcut for triggering replacement
 */
export const SHORTCUT_REPLACE = 'CmdOrCtrl+R';

/**
 * Keyboard shortcut for changing folder
 */
export const SHORTCUT_CHANGE_FOLDER = 'CmdOrCtrl+N';

/**
 * Keyboard shortcut for saving values
 */
export const SHORTCUT_SAVE = 'CmdOrCtrl+S';

/**
 * Keyboard shortcut for opening help
 */
export const SHORTCUT_HELP = 'F1';

/**
 * Keyboard shortcut for closing dialogs
 */
export const SHORTCUT_CLOSE_DIALOG = 'Escape';

/**
 * Keyboard shortcut for moving to next input
 */
export const SHORTCUT_NEXT_INPUT = 'Tab';

/**
 * Keyboard shortcut for moving to previous input
 */
export const SHORTCUT_PREVIOUS_INPUT = 'Shift+Tab';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Document file extension type
 */
export type DocumentExtension = typeof DOCUMENT_EXTENSIONS[number];

/**
 * Keyboard shortcut type
 */
export type KeyboardShortcut =
  | typeof SHORTCUT_OPEN_FOLDER
  | typeof SHORTCUT_REPLACE
  | typeof SHORTCUT_CHANGE_FOLDER
  | typeof SHORTCUT_SAVE
  | typeof SHORTCUT_HELP
  | typeof SHORTCUT_CLOSE_DIALOG
  | typeof SHORTCUT_NEXT_INPUT
  | typeof SHORTCUT_PREVIOUS_INPUT;