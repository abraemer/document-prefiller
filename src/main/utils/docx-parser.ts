import { promises as fs } from 'fs';
import JSZip from 'jszip';
import { extractTextFromDocx, DocxParseError } from '../../core/docx-text';

// Re-exported from core so existing importers (scanner, tests) keep compiling.
export { DocxParseError };

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
