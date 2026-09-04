import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/types'
import type {
  DocumentMarker,
  AppSettings,
  ScanFolderRequest,
  ScanFolderResponse,
  SelectFolderResponse,
  CheckOutputFolderRequest,
  CheckOutputFolderResponse,
  ReplaceDocumentsRequest,
  ReplaceDocumentsResponse,
  GetDocumentsRequest,
  GetDocumentsResponse,
  SaveSettingsRequest,
  SaveSettingsResponse,
  ReplacementValuesFile,
  UpdaterStateResponse,
  UpdateStatusEvent,
  UpdaterActionResponse,
  PlatformAPI,
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
  scanFolder: async (folderPath: string, prefix?: string): Promise<ScanFolderResponse> => {
    return await ipcRenderer.invoke('folder:scan', { folderPath, prefix } as ScanFolderRequest)
  },

  /**
   * Open a folder selection dialog
   */
  selectFolder: async (defaultPath?: string): Promise<SelectFolderResponse> => {
    return await ipcRenderer.invoke('folder:select', defaultPath)
  },

  /**
   * Check output folder for existing documents that would be overwritten
   */
  checkOutputFolder: async (sourceFolder: string, outputFolder: string): Promise<CheckOutputFolderResponse> => {
    return await ipcRenderer.invoke('folder:checkOutput', { sourceFolder, outputFolder } as CheckOutputFolderRequest)
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
    markers: DocumentMarker[],
    outputFolder?: string
  ): Promise<ReplaceDocumentsResponse> => {
    return await ipcRenderer.invoke('document:replace', {
      folderPath,
      markers,
      outputFolder,
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
  saveSettings: async (request: SaveSettingsRequest): Promise<SaveSettingsResponse> => {
    return await ipcRenderer.invoke('settings:save', request)
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
 * Updater Operations API
 */
const updaterAPI = {
  /**
   * Get a pure snapshot of the updater state
   */
  getUpdateState: (): Promise<UpdaterStateResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.UPDATER_GET_STATE)
  },

  /**
   * Install a downloaded update
   */
  installUpdate: (): Promise<UpdaterActionResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.UPDATER_INSTALL)
  },

  /**
   * Open the GitHub releases page for manual updates
   */
  openReleasesPage: (): Promise<UpdaterActionResponse> => {
    return ipcRenderer.invoke(IPC_CHANNELS.UPDATER_OPEN_RELEASES)
  },

  /**
   * Listen for updater status changes
   */
  onUpdaterStatus: (callback: (event: UpdateStatusEvent) => void): void => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatusEvent) => {
      callback(status)
    }
    ipcRenderer.on(IPC_CHANNELS.UPDATER_STATUS, listener)
  },

  /**
   * Remove updater status listener
   */
  removeUpdaterStatusListener: (): void => {
    ipcRenderer.removeAllListeners(IPC_CHANNELS.UPDATER_STATUS)
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
 *
 * The `satisfies PlatformAPI` binding checks conformance against the shared
 * contract (src/shared/types/platform.ts) — the same contract the web
 * variant's shim implements — while preserving the literal's inferred types.
 */
const api = {
  folder: folderAPI,
  document: documentAPI,
  settings: settingsAPI,
  saveFile: saveFileAPI,
  window: windowAPI,
  events: eventAPI,
  updater: updaterAPI,
  capabilities: {
    variant: 'native',
    startupScan: 'auto',
    outputMode: 'disk',
    updater: true,
  },
} satisfies PlatformAPI

contextBridge.exposeInMainWorld('api', api)

/**
 * The Window interface augmentation for window.api lives in
 * src/shared/types/window-api.d.ts (declaring `api: PlatformAPI`) — the
 * single repo-wide Window declaration; a second augmentation anywhere
 * else conflicts with it (TS2717).
 */