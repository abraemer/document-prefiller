/**
 * Platform API Contract
 *
 * The full surface exposed on window.api. The native preload
 * (src/preload/index.ts) implements it via contextBridge; the web variant
 * (src/renderer/platform/web) provides a browser-side shim with the same
 * shape. Signatures mirror the preload exactly — every member derives from
 * the actual implementation there, plus the request/response types in
 * ./ipc.ts and ./data-models.ts.
 *
 * Optional members (reopenLast, ingestDroppedItems) are provided by the web
 * adapter only; the native preload literal satisfies this contract without
 * implementing them.
 */

import type { AppSettings, ReplacementValuesFile } from './data-models';
import type {
  CheckOutputFolderResponse,
  DocumentMarker,
  GetDocumentsResponse,
  ReplaceDocumentsResponse,
  SaveSettingsRequest,
  SaveSettingsResponse,
  ScanFolderResponse,
  SelectFolderResponse,
  UpdateStatusEvent,
  UpdaterActionResponse,
  UpdaterStateResponse,
} from './ipc';

/**
 * Variant capabilities reported by the running edition.
 *
 * native:    Electron desktop app — dialog folder access, disk output,
 *            auto-updater, startup scan runs automatically.
 * web-fss:   Chromium with File System Access — live read-only folder
 *            handle; scanning requires a user gesture to regrant
 *            permission, output is a ZIP download, no auto-updater.
 * web-upload: all other browsers — uploaded folder snapshot in IndexedDB,
 *            gesture startup, ZIP download, no auto-updater.
 */
export interface PlatformCapabilities {
  /** Which edition of the app is running */
  variant: 'native' | 'web-fss' | 'web-upload';
  /** Whether the startup scan runs automatically or awaits a user gesture */
  startupScan: 'auto' | 'gesture';
  /** How replaced documents are delivered */
  outputMode: 'disk' | 'download';
  /** Whether the auto-updater UI is available */
  updater: boolean;
}

/**
 * The window.api contract shared by the native preload and the web shim.
 */
export interface PlatformAPI {
  /** Folder operations */
  folder: {
    /** Scan a folder for documents with markers */
    scanFolder: (folderPath: string, prefix?: string) => Promise<ScanFolderResponse>;
    /** Open a folder selection dialog */
    selectFolder: (defaultPath?: string) => Promise<SelectFolderResponse>;
    /** Check output folder for existing documents that would be overwritten */
    checkOutputFolder: (
      sourceFolder: string,
      outputFolder: string
    ) => Promise<CheckOutputFolderResponse>;
    /**
     * Reopen the last workspace (web adapter only; requires a user
     * gesture for permission regrant)
     */
    reopenLast?: () => Promise<SelectFolderResponse>;
    /**
     * Ingest drag-dropped items as a folder workspace (web adapter only)
     */
    ingestDroppedItems?: (items: DataTransferItemList) => Promise<SelectFolderResponse>;
  };

  /** Document operations */
  document: {
    /** Replace markers in documents */
    replaceDocuments: (
      folderPath: string,
      markers: DocumentMarker[],
      outputFolder?: string
    ) => Promise<ReplaceDocumentsResponse>;
    /** Get documents from a folder */
    getDocuments: (folderPath: string) => Promise<GetDocumentsResponse>;
  };

  /** Settings operations */
  settings: {
    /** Get application settings */
    getSettings: () => Promise<AppSettings>;
    /** Save application settings */
    saveSettings: (request: SaveSettingsRequest) => Promise<SaveSettingsResponse>;
  };

  /** Save file operations (.replacement-values.json) */
  saveFile: {
    /** Read save file from a folder */
    readSaveFile: (
      folderPath: string
    ) => Promise<{ success: boolean; data?: ReplacementValuesFile; error?: string }>;
    /** Write save file to a folder */
    writeSaveFile: (
      folderPath: string,
      data: ReplacementValuesFile
    ) => Promise<{ success: boolean; error?: string }>;
    /** Get save file last modified time */
    getSaveFileLastModified: (
      folderPath: string
    ) => Promise<{ success: boolean; lastModified?: string; error?: string }>;
  };

  /** Window operations */
  window: {
    /** Minimize the window */
    minimize: () => void;
    /** Maximize or restore the window */
    maximize: () => void;
    /** Close the window */
    close: () => void;
  };

  /** Event listeners (main process to renderer) */
  events: {
    /** Listen for settings changes */
    onSettingsChanged: (callback: (settings: AppSettings) => void) => void;
    /** Remove settings change listener */
    removeSettingsChangedListener: () => void;
    /** Listen for document updates */
    onDocumentUpdated: (callback: (document: {
      path: string;
      name: string;
      markers: string[];
    }) => void) => void;
    /** Remove document update listener */
    removeDocumentUpdatedListener: () => void;
    /** Listen for errors */
    onError: (callback: (error: string) => void) => void;
    /** Remove error listener */
    removeErrorListener: () => void;
    /** Remove all listeners for a specific channel */
    removeAllListeners: (channel: string) => void;
  };

  /** Auto-updater operations */
  updater: {
    /** Get a pure snapshot of the updater state */
    getUpdateState: () => Promise<UpdaterStateResponse>;
    /** Install a downloaded update */
    installUpdate: () => Promise<UpdaterActionResponse>;
    /** Open the GitHub releases page for manual updates */
    openReleasesPage: () => Promise<UpdaterActionResponse>;
    /** Listen for updater status changes */
    onUpdaterStatus: (callback: (event: UpdateStatusEvent) => void) => void;
    /** Remove updater status listener */
    removeUpdaterStatusListener: () => void;
  };

  /** Capabilities of the running edition */
  capabilities: PlatformCapabilities;
}
