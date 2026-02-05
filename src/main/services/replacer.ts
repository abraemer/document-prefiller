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
 * This function handles the complexity of Word's XML structure where text can be
 * split across multiple <w:t> tags. It uses a two-phase approach:
 * 1. Extract all text runs and their positions
 * 2. Replace markers in the concatenated text and rebuild the XML
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
  // First, try simple replacement for markers that aren't fragmented
  let modifiedXml = replaceSimpleMarkers(xmlContent, values, prefix);

  // Then, handle fragmented markers by normalizing text runs
  modifiedXml = replaceFragmentedMarkers(modifiedXml, values, prefix);

  return modifiedXml;
}

/**
 * Replace markers that appear within a single <w:t> tag
 *
 * @param xmlContent - XML content
 * @param values - Replacement values
 * @param prefix - Marker prefix
 * @returns Modified XML content
 */
function replaceSimpleMarkers(
  xmlContent: string,
  values: Record<string, string>,
  prefix: string
): string {
  let modifiedXml = xmlContent;

  // Replace each marker in the values
  for (const [identifier, replacement] of Object.entries(values)) {
    const fullMarker = `${prefix}${identifier}`;
    
    // Replace markers in <w:t> tags (text runs)
    // Match: <w:t>...marker...</w:t> or <w:t xml:space="preserve">...marker...</w:t>
    const regex = new RegExp(
      `(<w:t[^>]*>)([^<]*${escapeRegex(fullMarker)}[^<]*)(</w:t>)`,
      'g'
    );
    
    modifiedXml = modifiedXml.replace(regex, (match, openTag, content, closeTag) => {
      // If replacement is empty, remove the marker entirely
      const replacedContent = replacement === '' 
        ? content.replace(new RegExp(escapeRegex(fullMarker), 'g'), '')
        : content.replace(new RegExp(escapeRegex(fullMarker), 'g'), escapeXml(replacement));
      return `${openTag}${replacedContent}${closeTag}`;
    });
  }

  return modifiedXml;
}

/**
 * Replace markers that are fragmented across multiple <w:t> tags
 *
 * Word often splits text across multiple runs, especially when formatting is applied.
 * This function handles cases like: <w:t>REPLACE</w:t><w:t>ME-</w:t><w:t>WORD</w:t>
 *
 * @param xmlContent - XML content
 * @param values - Replacement values
 * @param prefix - Marker prefix
 * @returns Modified XML content
 */
function replaceFragmentedMarkers(
  xmlContent: string,
  values: Record<string, string>,
  prefix: string
): string {
  // Build a list of all markers to search for
  const markers = Object.keys(values).map(id => `${prefix}${id}`);
  
  if (markers.length === 0) {
    return xmlContent;
  }

  // Find all <w:r> (run) elements which contain <w:t> (text) elements
  const runRegex = /<w:r\b[^>]*>.*?<\/w:r>/gs;
  
  return xmlContent.replace(runRegex, (runMatch) => {
    // Extract all text from <w:t> tags within this run
    const textRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let textMatch;
    const textSegments: Array<{ fullMatch: string; text: string; start: number; end: number }> = [];
    
    while ((textMatch = textRegex.exec(runMatch)) !== null) {
      textSegments.push({
        fullMatch: textMatch[0],
        text: textMatch[1],
        start: textMatch.index,
        end: textMatch.index + textMatch[0].length
      });
    }

    if (textSegments.length === 0) {
      return runMatch;
    }

    // Concatenate all text to check for markers
    const concatenatedText = textSegments.map(seg => seg.text).join('');
    
    // Check if any marker exists in the concatenated text
    let hasMarker = false;
    for (const marker of markers) {
      if (concatenatedText.includes(marker)) {
        hasMarker = true;
        break;
      }
    }

    if (!hasMarker) {
      return runMatch;
    }

    // Replace markers in the concatenated text
    let replacedText = concatenatedText;
    for (const [identifier, replacement] of Object.entries(values)) {
      const fullMarker = `${prefix}${identifier}`;
      const markerRegex = new RegExp(escapeRegex(fullMarker), 'g');
      replacedText = replacedText.replace(markerRegex, replacement);
    }

    // If text hasn't changed, return original
    if (replacedText === concatenatedText) {
      return runMatch;
    }

    // Rebuild the run with the replaced text in a single <w:t> tag
    // Keep the first <w:t> tag's attributes and replace all text segments with one
    const firstSegment = textSegments[0];
    const firstTagMatch = firstSegment.fullMatch.match(/<w:t([^>]*)>/);
    const attributes = firstTagMatch ? firstTagMatch[1] : '';
    
    // Build the new text tag
    const newTextTag = `<w:t${attributes}>${escapeXml(replacedText)}</w:t>`;
    
    // Replace all text segments with the new single text tag
    let modifiedRun = runMatch;
    
    // Remove all text segments from the run
    for (let i = textSegments.length - 1; i >= 0; i--) {
      const segment = textSegments[i];
      modifiedRun = modifiedRun.substring(0, segment.start) + 
                    (i === 0 ? newTextTag : '') + 
                    modifiedRun.substring(segment.end);
    }

    return modifiedRun;
  });
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
 * Escape special XML characters in a string
 *
 * @param str - String to escape
 * @returns XML-safe string
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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

/**
 * Process documents with enhanced batch processing
 *
 * This is the recommended function for batch document processing as it provides
 * detailed progress tracking and better error handling.
 *
 * @param request - Replacement request
 * @param onProgress - Optional progress callback with detailed batch progress
 * @returns Promise that resolves with replacement result
 */
export async function processDocumentsWithProgress(
  request: ReplacementRequest,
  onProgress?: (progress: BatchProgress) => void
): Promise<ReplacementResult> {
  return processDocumentsBatch(request, onProgress);
}