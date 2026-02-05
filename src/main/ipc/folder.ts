/**
 * Folder Operations IPC Handlers
 * Handles folder scanning and selection operations
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import type { ScanFolderRequest, ScanFolderResponse, SelectFolderResponse } from '../../shared/types';
import { scanFolder } from '../services/scanner';
import { DEFAULT_PREFIX } from '../../shared/constants';

/**
 * Register folder operation handlers
 */
export function registerFolderHandlers() {
  /**
   * Handle folder scanning
   * Scans a folder for documents with markers
   */
  ipcMain.handle('folder:scan', async (event, request: ScanFolderRequest): Promise<ScanFolderResponse> => {
    try {
      const { folderPath, prefix = DEFAULT_PREFIX } = request;

      // Validate folder path
      if (!folderPath || typeof folderPath !== 'string') {
        return {
          documents: [],
          error: 'Invalid folder path provided',
        };
      }

      // Scan the folder
      const scanResult = await scanFolder(folderPath, prefix);

      // Convert scan result to response format
      const documents = scanResult.documents.map((docName) => {
        const docPath = `${folderPath}/${docName}`;
        const markers = scanResult.markers
          .filter((marker) => marker.documents.includes(docName))
          .map((marker) => marker.fullMarker);

        return {
          path: docPath,
          name: docName,
          markers,
        };
      });

      return {
        documents,
      };
    } catch (error) {
      console.error('Error scanning folder:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Send error event to renderer
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send('progress:event', {
          operation: 'scan',
          progress: 0,
          isComplete: true,
        });
      });

      return {
        documents: [],
        error: errorMessage,
      };
    }
  });

  /**
   * Handle folder selection
   * Opens a folder selection dialog
   */
  ipcMain.handle('folder:select', async (): Promise<SelectFolderResponse> => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Folder',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return {
          folderPath: null,
        };
      }

      return {
        folderPath: result.filePaths[0],
      };
    } catch (error) {
      console.error('Error selecting folder:', error);
      return {
        folderPath: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });
}