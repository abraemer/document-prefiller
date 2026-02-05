/**
 * Renderer Types
 * TypeScript type definitions for renderer process
 */

import type { AppSettings } from '../../shared/types';

/**
 * Folder Operations API
 */
export interface FolderAPI {
  scanFolder: (folderPath: string) => Promise<{
    documents: Array<{
      path: string;
      name: string;
      markers: string[];
    }>;
    error?: string;
  }>;
  selectFolder: () => Promise<{
    folderPath: string | null;
    error?: string;
  }>;
}

/**
 * Document Operations API
 */
export interface DocumentAPI {
  replaceDocuments: (
    folderPath: string,
    markers: Array<{
      id: string;
      name: string;
      prefix: string;
      enabled: boolean;
    }>
  ) => Promise<{
    success: boolean;
    processed: number;
    error?: string;
  }>;
  getDocuments: (folderPath: string) => Promise<{
    documents: Array<{
      path: string;
      name: string;
      markers: string[];
    }>;
    error?: string;
  }>;
}

/**
 * Settings Operations API
 */
export interface SettingsAPI {
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: {
    settings: {
      lastFolder?: string;
      windowState?: {
        width: number;
        height: number;
        x?: number;
        y?: number;
        maximized?: boolean;
      };
      preferences?: {
        defaultPrefix?: string;
      };
    };
  }) => Promise<{
    success: boolean;
    error?: string;
  }>;
}

/**
 * Window Operations API
 */
export interface WindowAPI {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}

/**
 * Event Listener API
 */
export interface EventAPI {
  onSettingsChanged: (callback: (settings: AppSettings) => void) => void;
  removeSettingsChangedListener: () => void;
  onDocumentUpdated: (callback: (document: { path: string; name: string; markers: string[] }) => void) => void;
  removeDocumentUpdatedListener: () => void;
  onError: (callback: (error: string) => void) => void;
  removeErrorListener: () => void;
  removeAllListeners: (channel: string) => void;
}

/**
 * Electron API exposed to renderer
 */
export interface ElectronAPI {
  folder: FolderAPI;
  document: DocumentAPI;
  settings: SettingsAPI;
  window: WindowAPI;
  events: EventAPI;
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