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
import { replaceMarkersInDocumentXml } from '../../core/marker-replace-engine';

/**
 * Custom error class for replacement operations
 */
export class ReplacementError extends Error {
  public readonly cause?: Error;
  public readonly filePath?: string;
  public readonly errorType?: 'corrupted_file' | 'invalid_xml' | 'missing_file' | 'malformed_marker' | 'write_error' | 'read_error' | 'unknown';

  constructor(message: string, cause?: Error, filePath?: string, errorType?: ReplacementError['errorType']) {
    super(message);
    this.name = 'ReplacementError';
    this.cause = cause;
    this.filePath = filePath;
    this.errorType = errorType;
  }
}

/**
 * Progress information for batch document processing
 */
export interface BatchProgress {
  /** Current operation phase */
  phase: 'copying' | 'processing' | 'complete';
  /** Progress percentage (0-100) */
  progress: number;
  /** Current file being processed */
  currentItem?: string;
  /** Total number of files to process */
  total?: number;
  /** Number of files completed */
  completed?: number;
  /** Number of files with errors */
  errors?: number;
}

/**
 * Process multiple documents in batch with enhanced progress tracking
 *
 * This function provides efficient batch processing of multiple documents with:
 * - Detailed progress tracking through different phases
 * - Graceful error handling for individual documents
 * - Aggregated results from all documents
 * - Performance optimizations for large batches
 *
 * @param request - Replacement request containing source folder, output folder, and values
 * @param onProgress - Optional progress callback with detailed batch progress information
 * @returns Promise that resolves with replacement result
 */
export async function processDocumentsBatch(
  request: ReplacementRequest,
  onProgress?: (progress: BatchProgress) => void
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
      if (onProgress) {
        onProgress({
          phase: 'complete',
          progress: 100,
          total: 0,
          completed: 0,
          errors: 0,
        });
      }
      return {
        success: true,
        processed: 0,
        errors: 0,
        processedDocuments: [],
        failedDocuments: [],
      };
    }

    // Phase 1: Copy files to output folder (50% of progress)
    if (onProgress) {
      onProgress({
        phase: 'copying',
        progress: 0,
        currentItem: 'Preparing to copy files...',
        total: docxFiles.length,
        completed: 0,
        errors: 0,
      });
    }

    const copyResult = await copyDocxFiles(sourceFolder, outputFolder, {
      overwrite: true,
      preserveMetadata: true,
      onProgress: (progress: CopyProgress) => {
        if (onProgress) {
          // Copy phase is 50% of total progress
          const copyProgress = progress.percentage * 0.5;
          onProgress({
            phase: 'copying',
            progress: copyProgress,
            currentItem: progress.currentFile,
            total: progress.totalFiles,
            completed: progress.currentFileIndex,
            errors: 0,
          });
        }
      },
    });

    if (!copyResult.success) {
      throw new ReplacementError('Failed to copy documents to output folder');
    }

    // Phase 2: Process each document and replace markers (50% of progress)
    if (onProgress) {
      onProgress({
        phase: 'processing',
        progress: 50,
        currentItem: 'Starting marker replacement...',
        total: docxFiles.length,
        completed: 0,
        errors: 0,
      });
    }

    const processedDocuments: string[] = [];
    const failedDocuments: Array<{ path: string; error: string }> = [];
    let processed = 0;

    for (let i = 0; i < docxFiles.length; i++) {
      const file = docxFiles[i];
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

      // Report progress for processing phase
      if (onProgress) {
        // Processing phase is 50% of total progress (from 50% to 100%)
        const processingProgress = 50 + ((i + 1) / docxFiles.length) * 50;
        onProgress({
          phase: 'processing',
          progress: processingProgress,
          currentItem: file,
          total: docxFiles.length,
          completed: i + 1,
          errors: failedDocuments.length,
        });
      }
    }

    // Phase 3: Complete
    if (onProgress) {
      onProgress({
        phase: 'complete',
        progress: 100,
        total: docxFiles.length,
        completed: processed,
        errors: failedDocuments.length,
      });
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
      `Failed to process documents: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
    // Validate file exists and is readable
    try {
      await fs.access(filePath, fs.constants.R_OK);
    } catch {
      throw new ReplacementError(
        `File not found or not accessible: ${filePath}`,
        undefined,
        filePath,
        'read_error'
      );
    }

    // Read the file
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(filePath);
    } catch (error) {
      throw new ReplacementError(
        `Failed to read file: ${filePath}`,
        error instanceof Error ? error : undefined,
        filePath,
        'read_error'
      );
    }

    // Validate minimum file size
    if (buffer.length < 4) {
      throw new ReplacementError(
        `Invalid .docx file: file too small (${buffer.length} bytes)`,
        undefined,
        filePath,
        'corrupted_file'
      );
    }

    // Check if it's a valid ZIP file (starts with PK signature)
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new ReplacementError(
        `Invalid .docx file: not a valid ZIP archive (missing PK signature)`,
        undefined,
        filePath,
        'corrupted_file'
      );
    }

    // Load the ZIP archive
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(buffer);
    } catch (error) {
      throw new ReplacementError(
        `Failed to parse .docx file: corrupted or invalid ZIP archive`,
        error instanceof Error ? error : undefined,
        filePath,
        'corrupted_file'
      );
    }

    // Get the main document XML file
    const documentXml = zip.file('word/document.xml');
    if (!documentXml) {
      // List available files for better error message
      const availableFiles = Object.keys(zip.files).join(', ');
      throw new ReplacementError(
        `Invalid .docx file: word/document.xml not found. Available entries: ${availableFiles}`,
        undefined,
        filePath,
        'missing_file'
      );
    }

    // Extract the XML content
    let xmlContent: string;
    try {
      xmlContent = await documentXml.async('string');
    } catch (error) {
      throw new ReplacementError(
        `Failed to extract XML content from document.xml`,
        error instanceof Error ? error : undefined,
        filePath,
        'invalid_xml'
      );
    }

    // Validate XML content is not empty
    if (!xmlContent || xmlContent.trim().length === 0) {
      throw new ReplacementError(
        `Invalid .docx file: document.xml is empty`,
        undefined,
        filePath,
        'invalid_xml'
      );
    }

    // Validate XML has basic structure (must have both w:document and w:body)
    if (!xmlContent.includes('<w:document') || !xmlContent.includes('<w:body')) {
      throw new ReplacementError(
        `Invalid .docx file: document.xml has invalid structure (missing w:document or w:body)`,
        undefined,
        filePath,
        'invalid_xml'
      );
    }

    // Replace markers in the XML
    let modifiedXml: string;
    try {
      modifiedXml = replaceMarkersInXml(xmlContent, values, prefix);
    } catch (error) {
      throw new ReplacementError(
        `Failed to replace markers in document: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined,
        filePath,
        'malformed_marker'
      );
    }

    // Update the document in the ZIP
    try {
      zip.file('word/document.xml', modifiedXml);
    } catch (error) {
      throw new ReplacementError(
        `Failed to update document.xml in ZIP archive`,
        error instanceof Error ? error : undefined,
        filePath,
        'write_error'
      );
    }

    // Generate the new buffer
    let newBuffer: Buffer;
    try {
      newBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    } catch (error) {
      throw new ReplacementError(
        `Failed to generate .docx file buffer`,
        error instanceof Error ? error : undefined,
        filePath,
        'write_error'
      );
    }

    // Write the modified file
    try {
      await fs.writeFile(filePath, newBuffer);
    } catch (error) {
      throw new ReplacementError(
        `Failed to write modified file: ${filePath}`,
        error instanceof Error ? error : undefined,
        filePath,
        'write_error'
      );
    }
  } catch (error) {
    if (error instanceof ReplacementError) {
      throw error;
    }
    throw new ReplacementError(
      `Failed to replace markers in file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error instanceof Error ? error : undefined,
      filePath,
      'unknown'
    );
  }
}

/**
 * Replace markers in Word document XML
 *
 * Delegates to the unified paragraph-level replacement engine
 * (marker-replace-engine.ts), which shares its segmentation and marker regex
 * with detection, handles markers fragmented across runs, and merges the
 * fragment runs' formatting into the replacement run.
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
  return replaceMarkersInDocumentXml(xmlContent, values, prefix);
}
