/**
 * Replacement Engine Service
 * Handles marker replacement in .docx documents
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import type { ReplacementResult, ReplacementRequest } from '../../shared/types/data-models';
import { copyDocxFiles, type CopyProgress } from '../utils/file';
import { DOCUMENT_EXTENSION } from '../../shared/constants';

/**
 * Custom error class for replacement operations
 */
export class ReplacementError extends Error {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'ReplacementError';
    this.cause = cause;
  }
}

/**
 * Replace markers in documents
 *
 * @param request - Replacement request containing source folder, output folder, and values
 * @param onProgress - Optional progress callback
 * @returns Promise that resolves with replacement result
 */
export async function replaceMarkers(
  request: ReplacementRequest,
  onProgress?: (progress: { operation: 'replace'; progress: number; currentItem?: string; total?: number; completed?: number }) => void
): Promise<ReplacementResult> {
  const { sourceFolder, outputFolder, values, prefix } = request;

  try {
    // Validate source folder exists
    try {
      await fs.access(sourceFolder, fs.constants.R_OK);
    } catch {
      throw new ReplacementError(`Source folder not accessible: ${sourceFolder}`);
    }

    // Create output folder if it doesn't exist
    try {
      await fs.mkdir(outputFolder, { recursive: true });
    } catch (error) {
      throw new ReplacementError(
        `Failed to create output folder: ${outputFolder}`,
        error instanceof Error ? error : undefined
      );
    }

    // Find all .docx files in source folder
    const files = await fs.readdir(sourceFolder);
    const docxFiles = files.filter(
      (file) => path.extname(file).toLowerCase() === DOCUMENT_EXTENSION
    );

    if (docxFiles.length === 0) {
      return {
        success: true,
        processed: 0,
        errors: 0,
        processedDocuments: [],
        failedDocuments: [],
      };
    }

    // Copy files to output folder
    const copyResult = await copyDocxFiles(sourceFolder, outputFolder, {
      overwrite: true,
      preserveMetadata: true,
      onProgress: (progress: CopyProgress) => {
        if (onProgress) {
          onProgress({
            operation: 'replace',
            progress: progress.percentage,
            currentItem: progress.currentFile,
            total: progress.totalFiles,
            completed: progress.currentFileIndex,
          });
        }
      },
    });

    if (!copyResult.success) {
      throw new ReplacementError('Failed to copy documents to output folder');
    }

    // Process each document and replace markers
    const processedDocuments: string[] = [];
    const failedDocuments: Array<{ path: string; error: string }> = [];
    let processed = 0;

    for (const file of docxFiles) {
      const outputPath = path.join(outputFolder, file);

      try {
        await replaceMarkersInFile(outputPath, values, prefix);
        processedDocuments.push(outputPath);
        processed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        failedDocuments.push({ path: outputPath, error: errorMessage });
        console.error(`Failed to replace markers in ${file}:`, errorMessage);
      }
    }

    return {
      success: failedDocuments.length === 0,
      processed,
      errors: failedDocuments.length,
      processedDocuments,
      failedDocuments,
    };
  } catch (error) {
    if (error instanceof ReplacementError) {
      throw error;
    }
    throw new ReplacementError(
      `Failed to replace markers: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Replace markers in a single .docx file
 *
 * @param filePath - Path to the .docx file
 * @param values - Replacement values (key: identifier, value: replacement text)
 * @param prefix - Marker prefix
 * @throws ReplacementError if replacement fails
 */
async function replaceMarkersInFile(
  filePath: string,
  values: Record<string, string>,
  prefix: string
): Promise<void> {
  try {
    // Read the file
    const buffer = await fs.readFile(filePath);

    // Load the ZIP archive
    const zip = await JSZip.loadAsync(buffer);

    // Get the main document XML file
    const documentXml = zip.file('word/document.xml');
    if (!documentXml) {
      throw new ReplacementError('Invalid .docx file: word/document.xml not found');
    }

    // Extract the XML content
    const xmlContent = await documentXml.async('string');

    // Replace markers in the XML
    const modifiedXml = replaceMarkersInXml(xmlContent, values, prefix);

    // Update the document in the ZIP
    zip.file('word/document.xml', modifiedXml);

    // Generate the new buffer
    const newBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    // Write the modified file
    await fs.writeFile(filePath, newBuffer);
  } catch (error) {
    if (error instanceof ReplacementError) {
      throw error;
    }
    throw new ReplacementError(
      `Failed to replace markers in file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Replace markers in Word document XML
 *
 * @param xmlContent - XML content from word/document.xml
 * @param values - Replacement values (key: identifier, value: replacement text)
 * @param prefix - Marker prefix
 * @returns Modified XML content
 */
function replaceMarkersInXml(
  xmlContent: string,
  values: Record<string, string>,
  prefix: string
): string {
  let modifiedXml = xmlContent;

  // Replace each marker in the values
  for (const [identifier, replacement] of Object.entries(values)) {
    const fullMarker = `${prefix}${identifier}`;
    
    // Replace markers in <w:t> tags (text runs)
    // We need to be careful to only replace the marker text, not the XML tags
    const regex = new RegExp(
      `(<w:t[^>]*>)([^<]*${escapeRegex(fullMarker)}[^<]*)(</w:t>)`,
      'g'
    );
    
    modifiedXml = modifiedXml.replace(regex, (match, openTag, content, closeTag) => {
      const replacedContent = content.replace(new RegExp(escapeRegex(fullMarker), 'g'), replacement);
      return `${openTag}${replacedContent}${closeTag}`;
    });
  }

  return modifiedXml;
}

/**
 * Escape special regex characters in a string
 *
 * @param str - String to escape
 * @returns Escaped string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Process documents (alias for replaceMarkers)
 *
 * @param request - Replacement request
 * @param onProgress - Optional progress callback
 * @returns Promise that resolves with replacement result
 */
export async function processDocuments(
  request: ReplacementRequest,
  onProgress?: (progress: { operation: 'replace'; progress: number; currentItem?: string; total?: number; completed?: number }) => void
): Promise<ReplacementResult> {
  return replaceMarkers(request, onProgress);
}