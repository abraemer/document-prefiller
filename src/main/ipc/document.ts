/**
 * Document Operations IPC Handlers
 * Handles document replacement operations
 */

import { ipcMain, BrowserWindow, shell } from 'electron';
import type {
  ReplaceDocumentsRequest,
  ReplaceDocumentsResponse,
  GetDocumentsRequest,
  GetDocumentsResponse,
} from '../../shared/types';
import { processDocumentsBatch, type BatchProgress } from '../services/replacer';
import { scanFolder } from '../services/scanner';
import { DEFAULT_PREFIX } from '../../shared/constants';
import * as path from 'path';

/**
 * Register document operation handlers
 */
export function registerDocumentHandlers() {
  /**
   * Handle document replacement
   * Replaces markers in documents with their corresponding values
   */
  ipcMain.handle('document:replace', async (_event, request: ReplaceDocumentsRequest): Promise<ReplaceDocumentsResponse> => {
    try {
      const { folderPath, markers, outputFolder: requestedOutputFolder } = request;

      // Validate folder path
      if (!folderPath || typeof folderPath !== 'string') {
        return {
          success: false,
          processed: 0,
          error: 'Invalid folder path provided',
        };
      }

      // Validate markers
      if (!Array.isArray(markers) || markers.length === 0) {
        return {
          success: false,
          processed: 0,
          error: 'No markers provided for replacement',
        };
      }

      // Convert markers to replacement values
      const values: Record<string, string> = {};
      let prefix = DEFAULT_PREFIX;

      for (const marker of markers) {
        if (!marker.enabled) {
          continue; // Skip disabled markers
        }

        // Use the first marker's prefix
        if (prefix === DEFAULT_PREFIX && marker.prefix) {
          prefix = marker.prefix;
        }

        values[marker.id] = marker.value;
      }

      // Use provided output folder or default to 'output' subdirectory
      const outputFolder = requestedOutputFolder || path.join(folderPath, 'output');

      // Create replacement request
      const replacementRequest = {
        sourceFolder: folderPath,
        outputFolder,
        values,
        prefix,
      };

      // Perform replacement with enhanced progress tracking
      const result = await processDocumentsBatch(replacementRequest, (progress: BatchProgress) => {
        // Send progress event to renderer with detailed phase information
        BrowserWindow.getAllWindows().forEach((window) => {
          window.webContents.send('progress:event', {
            operation: 'replace',
            progress: progress.progress,
            currentItem: progress.currentItem,
            total: progress.total,
            completed: progress.completed,
            phase: progress.phase,
            errors: progress.errors,
            isComplete: progress.phase === 'complete',
          });
        });
      });

      // Open output folder after successful replacement
      if (result.success) {
        await shell.openPath(outputFolder);
      }

      return {
        success: result.success,
        processed: result.processed,
        error: result.errorMessage,
      };
    } catch (error) {
      console.error('Error replacing documents:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Send error event to renderer
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send('progress:event', {
          operation: 'replace',
          progress: 0,
          isComplete: true,
        });
      });

      return {
        success: false,
        processed: 0,
        error: errorMessage,
      };
    }
  });

  /**
   * Handle getting documents
   * Retrieves documents from a folder
   */
  ipcMain.handle('document:get', async (_event, request: GetDocumentsRequest): Promise<GetDocumentsResponse> => {
    try {
      const { folderPath } = request;

      // Validate folder path
      if (!folderPath || typeof folderPath !== 'string') {
        return {
          documents: [],
          error: 'Invalid folder path provided',
        };
      }

      // Scan the folder to get documents
      const scanResult = await scanFolder(folderPath, DEFAULT_PREFIX);

      // Convert scan result to response format
      const documents = scanResult.documents.map((docName) => {
        const docPath = path.join(folderPath, docName);
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
      console.error('Error getting documents:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      return {
        documents: [],
        error: errorMessage,
      };
    }
  });
}