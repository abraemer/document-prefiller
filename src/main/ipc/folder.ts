/**
 * Folder Operations IPC Handlers
 * Handles folder scanning and selection operations
 */

import { ipcMain, dialog } from 'electron'
import type { ScanFolderRequest, ScanFolderResponse, SelectFolderResponse } from '../../shared/types'

/**
 * Register folder operation handlers
 */
export function registerFolderHandlers() {
  /**
   * Handle folder scanning
   * Scans a folder for documents with markers
   */
  ipcMain.handle('folder:scan', async (_event, request: ScanFolderRequest): Promise<ScanFolderResponse> => {
    try {
      const { folderPath } = request
      
      // TODO: Implement actual folder scanning logic
      // This will use the scanner service to find documents with markers
      
      console.log('Scanning folder:', folderPath)
      
      // Placeholder response
      return {
        documents: [],
      }
    } catch (error) {
      console.error('Error scanning folder:', error)
      return {
        documents: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })

  /**
   * Handle folder selection
   * Opens a folder selection dialog
   */
  ipcMain.handle('folder:select', async (): Promise<SelectFolderResponse> => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Folder',
      })

      if (result.canceled || result.filePaths.length === 0) {
        return {
          folderPath: null,
        }
      }

      return {
        folderPath: result.filePaths[0],
      }
    } catch (error) {
      console.error('Error selecting folder:', error)
      return {
        folderPath: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })
}