/**
 * Type definitions for the renderer process
 * Extends the Window interface to include the exposed Electron API
 */

import type { DocumentMarker, DocumentInfo, AppSettings } from '../shared/types'

/**
 * Folder Operations API
 */
interface FolderAPI {
  scanFolder: (folderPath: string) => Promise<{
    documents: DocumentInfo[]
    error?: string
  }>
  selectFolder: () => Promise<{
    folderPath: string | null
    error?: string
  }>
}

/**
 * Document Operations API
 */
interface DocumentAPI {
  replaceDocuments: (
    folderPath: string,
    markers: DocumentMarker[]
  ) => Promise<{
    success: boolean
    processed: number
    error?: string
  }>
  getDocuments: (folderPath: string) => Promise<{
    documents: DocumentInfo[]
    error?: string
  }>
}

/**
 * Settings Operations API
 */
interface SettingsAPI {
  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: AppSettings) => Promise<{
    success: boolean
    error?: string
  }>
}

/**
 * Window Operations API
 */
interface WindowAPI {
  minimize: () => void
  maximize: () => void
  close: () => void
}

/**
 * Event Listener API
 */
interface EventAPI {
  onSettingsChanged: (callback: (settings: AppSettings) => void) => void
  removeSettingsChangedListener: () => void
  onDocumentUpdated: (callback: (document: DocumentInfo) => void) => void
  removeDocumentUpdatedListener: () => void
  onError: (callback: (error: string) => void) => void
  removeErrorListener: () => void
  removeAllListeners: (channel: string) => void
}

/**
 * Complete Electron API exposed to renderer
 */
interface ElectronAPI {
  folder: FolderAPI
  document: DocumentAPI
  settings: SettingsAPI
  window: WindowAPI
  events: EventAPI
}

/**
 * Extend the Window interface
 */
declare global {
  interface Window {
    api: ElectronAPI
  }
}

export {}