/**
 * Document Scanner Service
 * Handles scanning folders for .docx files and detecting markers
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ScanResult, Marker } from '../../shared/types/data-models.js';
import {
  DOCUMENT_EXTENSION,
  DEFAULT_PREFIX,
  NO_DOCUMENTS_FOUND_ERROR,
  FOLDER_NOT_FOUND_ERROR,
  MAX_SCAN_DOCUMENTS,
  MAX_DOCUMENT_SIZE,
  MAX_UNIQUE_MARKERS,
} from '../../shared/constants/index.js';
import { parseDocxFile, DocxParseError } from '../utils/docx-parser.js';
import {
  detectMarkers,
  MarkerDetectionError,
} from '../utils/marker-detection.js';

/**
 * Scan a folder for .docx files and detect markers
 *
 * @param folderPath - Path to the folder to scan
 * @param prefix - Marker prefix to use for detection (defaults to DEFAULT_PREFIX)
 * @returns ScanResult with detected markers and documents
 * @throws Error if folder doesn't exist or is inaccessible
 */
export async function scanFolder(
  folderPath: string,
  prefix: string = DEFAULT_PREFIX
): Promise<ScanResult> {
  // Validate folder exists
  if (!fs.existsSync(folderPath)) {
    throw new Error(FOLDER_NOT_FOUND_ERROR);
  }

  // Validate folder is a directory
  const stats = fs.statSync(folderPath);
  if (!stats.isDirectory()) {
    throw new Error('The specified path is not a folder');
  }

  // Scan for .docx files
  const docxFiles = await findDocxFiles(folderPath);

  if (docxFiles.length === 0) {
    throw new Error(NO_DOCUMENTS_FOUND_ERROR);
  }

  // Validate document count
  if (docxFiles.length > MAX_SCAN_DOCUMENTS) {
    throw new Error(
      `Too many documents found (${docxFiles.length}). Maximum allowed is ${MAX_SCAN_DOCUMENTS}.`
    );
  }

  // Extract text from each document and detect markers
  const documentMarkers: Map<string, string[]> = new Map();
  const errors: Array<{ file: string; error: string }> = [];

  for (const filePath of docxFiles) {
    try {
      const text = await parseDocxFile(filePath);
      const markers = detectMarkers(text, prefix);
      documentMarkers.set(filePath, markers);
    } catch (error) {
      let errorMessage = 'Unknown error';
      if (error instanceof DocxParseError) {
        errorMessage = error.message;
        console.error(`Error parsing ${filePath}:`, errorMessage, error.cause);
      } else if (error instanceof MarkerDetectionError) {
        errorMessage = error.message;
        console.error(`Error detecting markers in ${filePath}:`, errorMessage, error.cause);
      } else if (error instanceof Error) {
        errorMessage = error.message;
        console.error(`Error parsing ${filePath}:`, errorMessage);
      }
      errors.push({ file: filePath, error: errorMessage });
    }
  }

  // Deduplicate markers across all documents
  const markers = deduplicateMarkers(documentMarkers, prefix);

  // Get document names (relative paths)
  const documents = docxFiles.map((filePath) => path.basename(filePath));

  // Create scan result
  const scanResult: ScanResult = {
    folder: folderPath,
    documents,
    markers,
    prefix,
    timestamp: new Date().toISOString(),
  };

  return scanResult;
}

/**
 * Find all .docx files in a folder (non-recursive)
 *
 * @param folderPath - Path to the folder to scan
 * @returns Array of .docx file paths
 */
async function findDocxFiles(folderPath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    fs.readdir(folderPath, (err, files) => {
      if (err) {
        reject(new Error(`Failed to read folder: ${err.message}`));
        return;
      }

      const docxFiles: string[] = [];

      for (const file of files) {
        const filePath = path.join(folderPath, file);
        const ext = path.extname(file).toLowerCase();

        if (ext === DOCUMENT_EXTENSION) {
          // Validate file size
          try {
            const stats = fs.statSync(filePath);
            if (stats.size > MAX_DOCUMENT_SIZE) {
              console.warn(
                `Skipping ${file}: File size exceeds maximum limit of ${MAX_DOCUMENT_SIZE} bytes`
              );
              continue;
            }
            docxFiles.push(filePath);
          } catch (error) {
            console.warn(`Skipping ${file}: ${error}`);
          }
        }
      }

      resolve(docxFiles);
    });
  });
}

/**
 * Deduplicate markers across all documents and create Marker objects
 *
 * @param documentMarkers - Map of file paths to their detected markers
 * @param prefix - Marker prefix used
 * @returns Array of deduplicated Marker objects
 */
function deduplicateMarkers(
  documentMarkers: Map<string, string[]>,
  prefix: string
): Marker[] {
  const markerMap: Map<string, Marker> = new Map();

  for (const [filePath, markers] of documentMarkers.entries()) {
    const fileName = path.basename(filePath);

    for (const identifier of markers) {
      const fullMarker = `${prefix}${identifier}`;

      if (markerMap.has(identifier)) {
        // Add this document to existing marker
        const existingMarker = markerMap.get(identifier);
        if (existingMarker && !existingMarker.documents.includes(fileName)) {
          existingMarker.documents.push(fileName);
        }
      } else {
        // Create new marker
        const marker: Marker = {
          identifier,
          fullMarker,
          value: '',
          status: 'new',
          documents: [fileName],
        };
        markerMap.set(identifier, marker);
      }
    }
  }

  // Convert map to array
  const markers = Array.from(markerMap.values());

  // Validate marker count
  if (markers.length > MAX_UNIQUE_MARKERS) {
    console.warn(
      `Too many unique markers found (${markers.length}). Maximum allowed is ${MAX_UNIQUE_MARKERS}.`
    );
    // Return only the first MAX_UNIQUE_MARKERS markers
    return markers.slice(0, MAX_UNIQUE_MARKERS);
  }

  return markers;
}