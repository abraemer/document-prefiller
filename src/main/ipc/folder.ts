/**
 * Folder Operations IPC Handlers
 * Handles folder scanning and selection operations
 */

import { ipcMain, dialog, BrowserWindow } from 'electron';
import type {
  ScanFolderRequest,
  ScanFolderResponse,
  SelectFolderResponse,
  CheckOutputFolderRequest,
  CheckOutputFolderResponse
} from '../../shared/types';
import { scanFolder } from '../services/scanner';
import { DEFAULT_PREFIX } from '../../shared/constants';
import * as fs from 'fs/promises';

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
  ipcMain.handle('folder:select', async (event, defaultPath?: string): Promise<SelectFolderResponse> => {
    try {
      const fs = await import('fs/promises');
      let dialogDefaultPath = defaultPath;

      // If default path is provided but doesn't exist, use Documents folder
      if (defaultPath) {
        try {
          await fs.access(defaultPath);
        } catch {
          // Default path doesn't exist, use Documents folder
          const { app } = await import('electron');
          dialogDefaultPath = app.getPath('documents');
        }
      } else {
        // No default path provided, use Documents folder
        const { app } = await import('electron');
        dialogDefaultPath = app.getPath('documents');
      }

      // Get the focused window or the sender window
      const focusedWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.fromWebContents(event.sender);
      
      // Ensure we have a window to show the dialog
      if (!focusedWindow) {
        return {
          folderPath: null,
          error: 'No window available to show dialog',
        };
      }
      
      // Ensure the window is focused before showing the dialog
      if (!focusedWindow.isFocused()) {
        focusedWindow.focus();
      }

      const result = await dialog.showOpenDialog(focusedWindow, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Folder',
        defaultPath: dialogDefaultPath,
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

  /**
   * Handle checking output folder for existing documents
   * Checks if the output folder contains documents that would be overwritten
   */
  ipcMain.handle('folder:checkOutput', async (_event, request: CheckOutputFolderRequest): Promise<CheckOutputFolderResponse> => {
    try {
      const { sourceFolder, outputFolder } = request;

      // Validate folder paths
      if (!sourceFolder || typeof sourceFolder !== 'string') {
        return {
          success: false,
          existingDocuments: [],
          error: 'Invalid source folder path provided',
        };
      }

      if (!outputFolder || typeof outputFolder !== 'string') {
        return {
          success: false,
          existingDocuments: [],
          error: 'Invalid output folder path provided',
        };
      }

      // Check if output folder exists
      try {
        await fs.access(outputFolder);
      } catch {
        // Output folder doesn't exist, no files to overwrite
        return {
          success: true,
          existingDocuments: [],
        };
      }

      // Get list of documents in source folder
      const sourceEntries = await fs.readdir(sourceFolder, { withFileTypes: true });
      const sourceDocNames = sourceEntries
        .filter(entry => entry.isFile() && entry.name.endsWith('.docx'))
        .map(entry => entry.name);

      // Get list of documents in output folder
      const outputEntries = await fs.readdir(outputFolder, { withFileTypes: true });
      const outputDocNames = outputEntries
        .filter(entry => entry.isFile() && entry.name.endsWith('.docx'))
        .map(entry => entry.name);

      // Find documents that exist in both folders (would be overwritten)
      const existingDocuments = sourceDocNames.filter(docName =>
        outputDocNames.includes(docName)
      );

      return {
        success: true,
        existingDocuments,
      };
    } catch (error) {
      console.error('Error checking output folder:', error);
      return {
        success: false,
        existingDocuments: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });
}