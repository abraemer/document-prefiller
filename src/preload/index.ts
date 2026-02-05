import { contextBridge, ipcRenderer } from 'electron'
import type {
  DocumentMarker,
  AppSettings,
  ScanFolderRequest,
  ScanFolderResponse,
  SelectFolderResponse,
  ReplaceDocumentsRequest,
  ReplaceDocumentsResponse,
  GetDocumentsRequest,
  GetDocumentsResponse,
  SaveSettingsRequest,
  SaveSettingsResponse,
  ReplacementValuesFile,
} from '../shared/types'

/**
 * Preload Script
 * 
 * This script runs in the renderer process before the web page loads.
 * It provides a secure bridge between the main and renderer processes
 * using Electron's contextBridge API.
 * 
 * Security principles:
 * - Only expose specific, necessary APIs to the renderer
 * - Never expose the entire ipcRenderer or Node.js APIs
 * - Use contextIsolation: true in webPreferences
 * - Use invoke/send for one-way communication
 * - Use listeners for event-based communication
 */

/**
 * Folder Operations API
 */
const folderAPI = {
  /**
   * Scan a folder for documents with markers
   */
  scanFolder: async (folderPath: string): Promise<ScanFolderResponse> => {
    return await ipcRenderer.invoke('folder:scan', { folderPath } as ScanFolderRequest)
  },

  /**
   * Open a folder selection dialog
   */
  selectFolder: async (): Promise<SelectFolderResponse> => {
    return await ipcRenderer.invoke('folder:select')
  },
}

/**
 * Document Operations API
 */
const documentAPI = {
  /**
   * Replace markers in documents
   */
  replaceDocuments: async (
    folderPath: string,
    markers: DocumentMarker[]
  ): Promise<ReplaceDocumentsResponse> => {
    return await ipcRenderer.invoke('document:replace', {
      folderPath,
      markers,
    } as ReplaceDocumentsRequest)
  },

  /**
   * Get documents from a folder
   */
  getDocuments: async (folderPath: string): Promise<GetDocumentsResponse> => {
    return await ipcRenderer.invoke('document:get', { folderPath } as GetDocumentsRequest)
  },
}

/**
 * Settings Operations API
 */
const settingsAPI = {
  /**
   * Get application settings
   */
  getSettings: async (): Promise<AppSettings> => {
    return await ipcRenderer.invoke('settings:get')
  },

  /**
   * Save application settings
   */
  saveSettings: async (settings: AppSettings): Promise<SaveSettingsResponse> => {
    return await ipcRenderer.invoke('settings:save', { settings } as SaveSettingsRequest)
  },
}

/**
 * Save File Operations API
 */
const saveFileAPI = {
  /**
   * Read save file from a folder
   */
  readSaveFile: async (folderPath: string): Promise<{ success: boolean; data?: ReplacementValuesFile; error?: string }> => {
    return await ipcRenderer.invoke('savefile:read', folderPath)
  },

  /**
   * Write save file to a folder
   */
  writeSaveFile: async (folderPath: string, data: ReplacementValuesFile): Promise<{ success: boolean; error?: string }> => {
    return await ipcRenderer.invoke('savefile:write', folderPath, data)
  },

  /**
   * Get save file last modified time
   */
  getSaveFileLastModified: async (folderPath: string): Promise<{ success: boolean; lastModified?: string; error?: string }> => {
    return await ipcRenderer.invoke('savefile:lastModified', folderPath)
  },
}

/**
 * Window Operations API
 */
const windowAPI = {
  /**
   * Minimize the window
   */
  minimize: (): void => {
    ipcRenderer.send('window:minimize')
  },

  /**
   * Maximize or restore the window
   */
  maximize: (): void => {
    ipcRenderer.send('window:maximize')
  },

  /**
   * Close the window
   */
  close: (): void => {
    ipcRenderer.send('window:close')
  },
}

/**
 * Event Listener API
 * Allows the renderer to listen for events from the main process
 */
const eventAPI = {
  /**
   * Listen for settings changes
   */
  onSettingsChanged: (callback: (settings: AppSettings) => void): void => {
    const listener = (_event: Electron.IpcRendererEvent, settings: AppSettings) => {
      callback(settings)
    }
    ipcRenderer.on('settings:changed', listener)
  },

  /**
   * Remove settings change listener
   */
  removeSettingsChangedListener: (): void => {
    ipcRenderer.removeAllListeners('settings:changed')
  },

  /**
   * Listen for document updates
   */
  onDocumentUpdated: (callback: (document: { path: string; name: string; markers: string[] }) => void): void => {
    const listener = (_event: Electron.IpcRendererEvent, document: { path: string; name: string; markers: string[] }) => {
      callback(document)
    }
    ipcRenderer.on('document:updated', listener)
  },

  /**
   * Remove document update listener
   */
  removeDocumentUpdatedListener: (): void => {
    ipcRenderer.removeAllListeners('document:updated')
  },

  /**
   * Listen for errors
   */
  onError: (callback: (error: string) => void): void => {
    const listener = (_event: Electron.IpcRendererEvent, error: string) => {
      callback(error)
    }
    ipcRenderer.on('error', listener)
  },

  /**
   * Remove error listener
   */
  removeErrorListener: (): void => {
    ipcRenderer.removeAllListeners('error')
  },

  /**
   * Remove all listeners for a specific channel
   */
  removeAllListeners: (channel: string): void => {
    ipcRenderer.removeAllListeners(channel)
  },
}

/**
 * Expose the API to the renderer process via contextBridge
 * 
 * The renderer can access these APIs via window.api
 * Example: await window.api.folder.scanFolder('/path/to/folder')
 */
contextBridge.exposeInMainWorld('api', {
  folder: folderAPI,
  document: documentAPI,
  settings: settingsAPI,
  saveFile: saveFileAPI,
  window: windowAPI,
  events: eventAPI,
})

/**
 * Type definitions for the exposed API
 * These will be available in the renderer process
 */
export type ElectronAPI = {
  folder: typeof folderAPI
  document: typeof documentAPI
  settings: typeof settingsAPI
  saveFile: typeof saveFileAPI
  window: typeof windowAPI
  events: typeof eventAPI
}

/**
 * Extend the Window interface to include the API
 * This provides TypeScript autocomplete in the renderer process
 */
declare global {
  interface Window {
    api: ElectronAPI
  }
}