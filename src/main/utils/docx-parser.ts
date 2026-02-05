import { promises as fs } from 'fs';
import JSZip from 'jszip';

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
 * Parse a .docx file and extract its text content
 * @param filePath Path to the .docx file
 * @returns Extracted text content
 * @throws DocxParseError if the file cannot be parsed
 */
export async function parseDocxFile(filePath: string): Promise<string> {
  try {
    // Validate file exists and is readable
    try {
      await fs.access(filePath, fs.constants.R_OK);
    } catch {
      throw new DocxParseError(
        `File not found or not accessible: ${filePath}`,
        undefined,
        filePath,
        'read_error'
      );
    }

    const buffer = await fs.readFile(filePath);
    return await extractTextFromDocx(buffer, filePath);
  } catch (error) {
    if (error instanceof DocxParseError) {
      throw error;
    }
    throw new DocxParseError(
      `Failed to read .docx file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error instanceof Error ? error : undefined,
      filePath,
      'read_error'
    );
  }
}

/**
 * Extract text content from a .docx file buffer
 * @param buffer Buffer containing .docx file data
 * @param filePath Optional file path for error reporting
 * @returns Extracted text content
 * @throws DocxParseError if the buffer cannot be parsed
 */
export async function extractTextFromDocx(buffer: Buffer, filePath?: string): Promise<string> {
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
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
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
  // Extract text from <w:t> tags (text runs)
  const textMatches = xmlContent.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g);
  const textParts: string[] = [];

  for (const match of textMatches) {
    if (match[1]) {
      textParts.push(match[1]);
    }
  }

  // Join text parts and normalize whitespace
  let text = textParts.join('');

  // Handle tabs and line breaks
  text = text.replace(/\t/g, ' ');

  // Normalize multiple spaces to single space
  text = text.replace(/\s+/g, ' ');

  // Trim leading and trailing whitespace
  text = text.trim();

  return text;
}

/**
 * Check if a file is a valid .docx file
 * @param filePath Path to the file to check
 * @returns True if the file is a valid .docx file
 */
export async function isValidDocxFile(filePath: string): Promise<boolean> {
  try {
    const buffer = await fs.readFile(filePath);

    // Check minimum size
    if (buffer.length < 4) {
      return false;
    }

    // Check ZIP signature
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      return false;
    }

    // Try to load as ZIP and check for document.xml
    const zip = await JSZip.loadAsync(buffer);
    const documentXml = zip.file('word/document.xml');

    return documentXml !== null;
  } catch {
    return false;
  }
}

/**
 * Get metadata from a .docx file
 * @param filePath Path to the .docx file
 * @returns Metadata object containing file information
 */
export async function getDocxMetadata(filePath: string): Promise<{
  hasDocument: boolean;
  hasStyles: boolean;
  hasNumbering: boolean;
  entryCount: number;
}> {
  try {
    const buffer = await fs.readFile(filePath);
    const zip = await JSZip.loadAsync(buffer);

    const files = zip.files;
    const entryCount = Object.keys(files).length;

    return {
      hasDocument: zip.file('word/document.xml') !== null,
      hasStyles: zip.file('word/styles.xml') !== null,
      hasNumbering: zip.file('word/numbering.xml') !== null,
      entryCount,
    };
  } catch (error) {
    throw new DocxParseError(
      `Failed to read .docx metadata: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error instanceof Error ? error : undefined
    );
  }
}
