/**
 * Shared Types
 * TypeScript type definitions shared between main and renderer processes
 */

/**
 * Document marker for replacement
 */
export interface DocumentMarker {
  id: string
  name: string
  prefix: string
  enabled: boolean
}

/**
 * Document information
 */
export interface DocumentInfo {
  path: string
  name: string
  markers: DocumentMarker[]
  modified: boolean
}

/**
 * Application settings
 */
export interface AppSettings {
  selectedFolder: string | null
  markers: DocumentMarker[]
  windowState: {
    width: number
    height: number
    x: number | null
    y: number | null
  }
}

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