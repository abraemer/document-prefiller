/**
 * Window API Type Definitions
 * 
 * Type definitions for the exposed API from the preload script.
 * These types match the actual API structure exposed in src/preload/index.ts.
 */

import type {
  ScanFolderResponse,
  SelectFolderResponse,
  ReplaceDocumentsResponse,
  GetDocumentsResponse,
  SaveSettingsResponse,
  AppSettings,
  DocumentMarker,
} from '../../shared/types';

/**
 * Folder Operations API
 */
interface FolderAPI {
  scanFolder: (folderPath: string) => Promise<ScanFolderResponse>;
  selectFolder: () => Promise<SelectFolderResponse>;
}

/**
 * Document Operations API
 */
interface DocumentAPI {
  replaceDocuments: (folderPath: string, markers: DocumentMarker[]) => Promise<ReplaceDocumentsResponse>;
  getDocuments: (folderPath: string) => Promise<GetDocumentsResponse>;
}

/**
 * Settings Operations API
 */
interface SettingsAPI {
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<SaveSettingsResponse>;
}

/**
 * Window Operations API
 */
interface WindowAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}

/**
 * Event Listener API
 */
interface EventsAPI {
  onSettingsChanged: (callback: (settings: AppSettings) => void) => void;
  removeSettingsChangedListener: () => void;
  onDocumentUpdated: (callback: (document: { path: string; name: string; markers: string[] }) => void) => void;
  removeDocumentUpdatedListener: () => void;
  onError: (callback: (error: string) => void) => void;
  removeErrorListener: () => void;
  removeAllListeners: (channel: string) => void;
}

/**
 * Main API exposed to renderer process
 */
interface ElectronAPI {
  folder: FolderAPI;
  document: DocumentAPI;
  settings: SettingsAPI;
  window: WindowAPI;
  events: EventsAPI;
}

/**
 * Extend the Window interface to include the API
 */
declare global {
  interface Window {
    api: ElectronAPI;
  }
}

export {};