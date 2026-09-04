/**
 * Platform-neutral .docx text extraction.
 *
 * Extracts the plain text of `word/document.xml` from raw .docx bytes
 * (Uint8Array) using JSZip and the shared segmentation module. No Node
 * APIs — usable from both the Electron main process and the web renderer.
 */

import JSZip from 'jszip';
import { parseParagraphs, paragraphText } from './docx-structure';

/**
 * Custom error class for .docx parsing errors
 */
export class DocxParseError extends Error {
  public readonly cause?: Error;
  public readonly filePath?: string;
  public readonly errorType?: 'corrupted_file' | 'invalid_xml' | 'missing_file' | 'read_error' | 'unknown';

  constructor(message: string, cause?: Error, filePath?: string, errorType?: DocxParseError['errorType']) {
    super(message);
    this.name = 'DocxParseError';
    this.cause = cause;
    this.filePath = filePath;
    this.errorType = errorType;
  }
}

/**
 * Check whether the bytes start with the ZIP archive signature ("PK")
 * @param bytes Byte array to inspect
 * @returns True if the first two bytes are the PK signature
 */
export function isZipSignature(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

/**
 * Extract text content from a .docx file buffer
 * @param buffer Uint8Array containing .docx file data
 * @param filePath Optional file path for error reporting
 * @returns Extracted text content
 * @throws DocxParseError if the buffer cannot be parsed
 */
export async function extractTextFromDocx(buffer: Uint8Array, filePath?: string): Promise<string> {
  // Validate minimum file size
  if (buffer.length < 4) {
    throw new DocxParseError(
      `Invalid .docx file: file too small (${buffer.length} bytes)`,
      undefined,
      filePath,
      'corrupted_file'
    );
  }

  // Check if it's a valid ZIP file (starts with PK signature)
  if (!isZipSignature(buffer)) {
    throw new DocxParseError(
      'Invalid .docx file: not a valid ZIP archive (missing PK signature)',
      undefined,
      filePath,
      'corrupted_file'
    );
  }

  try {
    // Use JSZip to extract the archive
    const zip = await JSZip.loadAsync(buffer);

    // Try to extract text from the main document
    const text = await extractTextFromZip(zip, filePath);
    return text;
  } catch (error) {
    if (error instanceof DocxParseError) {
      throw error;
    }
    throw new DocxParseError(
      `Failed to extract text from .docx file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error instanceof Error ? error : undefined,
      filePath,
      'corrupted_file'
    );
  }
}

/**
 * Extract text from a JSZip instance
 * @param zip JSZip instance containing .docx data
 * @param filePath Optional file path for error reporting
 * @returns Extracted text content
 * @throws DocxParseError if document.xml cannot be found or parsed
 */
async function extractTextFromZip(zip: JSZip, filePath?: string): Promise<string> {
  // Get the main document XML file
  const documentXml = zip.file('word/document.xml');

  if (!documentXml) {
    // List available files for debugging
    const availableFiles = Object.keys(zip.files).join(', ');
    throw new DocxParseError(
      `Invalid .docx file: word/document.xml not found. Available entries: ${availableFiles}`,
      undefined,
      filePath,
      'missing_file'
    );
  }

  try {
    // Extract the XML content
    const xmlContent = await documentXml.async('string');

    // Validate XML content is not empty
    if (!xmlContent || xmlContent.trim().length === 0) {
      throw new DocxParseError(
        'Invalid .docx file: document.xml is empty',
        undefined,
        filePath,
        'invalid_xml'
      );
    }

    // Validate XML has basic structure (must have both w:document and w:body)
    if (!xmlContent.includes('<w:document') || !xmlContent.includes('<w:body')) {
      throw new DocxParseError(
        'Invalid .docx file: document.xml has invalid structure (missing w:document or w:body)',
        undefined,
        filePath,
        'invalid_xml'
      );
    }

    // Extract text from the XML
    return extractTextFromXml(xmlContent);
  } catch (error) {
    if (error instanceof DocxParseError) {
      throw error;
    }
    throw new DocxParseError(
      `Failed to extract text from document.xml: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error instanceof Error ? error : undefined,
      filePath,
      'invalid_xml'
    );
  }
}

/**
 * Extract text content from Word document XML
 * @param xmlContent XML content from word/document.xml
 * @returns Extracted text content
 */
function extractTextFromXml(xmlContent: string): string {
  // Extract paragraphs via the shared segmentation module. This fixes two
  // defects of the previous inline regex: `<w:pPr>` was matched as a
  // paragraph open tag, and a self-closed `<w:p/>` swallowed the next
  // paragraph's content.
  const paragraphs: string[] = [];

  for (const paragraph of parseParagraphs(xmlContent)) {
    const text = paragraphText(paragraph);
    if (text.trim()) {
      paragraphs.push(text);
    }
  }

  // Join paragraphs with space to preserve word boundaries
  let text = paragraphs.join(' ');

  // Handle tabs and line breaks
  text = text.replace(/\t/g, ' ');

  // Normalize multiple spaces to single space
  text = text.replace(/\s+/g, ' ');

  // Trim leading and trailing whitespace
  text = text.trim();

  return text;
}
