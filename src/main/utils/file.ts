/**
 * File Utilities
 * Utility functions for file operations including copying, batch operations, and progress tracking
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Custom error class for file copy operations
 */
export class FileCopyError extends Error {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'FileCopyError';
    this.cause = cause;
  }
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Progress information for file copy operations
 */
export interface CopyProgress {
  currentFile: string;
  currentFileIndex: number;
  totalFiles: number;
  bytesCopied: number;
  totalBytes: number;
  percentage: number;
}

/**
 * Result of a file copy operation
 */
export interface CopyResult {
  success: boolean;
  sourcePath: string;
  destinationPath: string;
  error?: string;
}

/**
 * Result of a batch copy operation
 */
export interface BatchCopyResult {
  success: boolean;
  totalFiles: number;
  successfulCopies: number;
  failedCopies: number;
  results: CopyResult[];
  errors: Array<{ file: string; error: string }>;
}

/**
 * Options for file copy operations
 */
export interface CopyOptions {
  /**
   * Whether to overwrite existing files
   * @default false
   */
  overwrite?: boolean;

  /**
   * Whether to preserve file metadata (mode, timestamps)
   * @default true
   */
  preserveMetadata?: boolean;

  /**
   * Progress callback for tracking copy operations
   */
  onProgress?: (progress: CopyProgress) => void;
}

// ============================================================================
// SINGLE FILE COPY OPERATIONS
// ============================================================================

/**
 * Copy a single file from source to destination
 *
 * @param sourcePath - Path to the source file
 * @param destinationPath - Path to the destination file
 * @param options - Copy options
 * @returns Promise that resolves when the copy is complete
 * @throws FileCopyError if the copy operation fails
 */
export async function copyFile(
  sourcePath: string,
  destinationPath: string,
  options: CopyOptions = {}
): Promise<void> {
  const { overwrite = false, preserveMetadata = true } = options;

  // Validate source file exists
  if (!fs.existsSync(sourcePath)) {
    throw new FileCopyError(`Source file does not exist: ${sourcePath}`);
  }

  // Validate source is a file (not a directory)
  const sourceStats = fs.statSync(sourcePath);
  if (!sourceStats.isFile()) {
    throw new FileCopyError(`Source path is not a file: ${sourcePath}`);
  }

  // Ensure destination directory exists
  const destinationDir = path.dirname(destinationPath);
  if (!fs.existsSync(destinationDir)) {
    try {
      fs.mkdirSync(destinationDir, { recursive: true });
    } catch (error) {
      throw new FileCopyError(
        `Failed to create destination directory: ${destinationDir}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  // Check if destination file exists
  if (fs.existsSync(destinationPath) && !overwrite) {
    throw new FileCopyError(
      `Destination file already exists and overwrite is disabled: ${destinationPath}`
    );
  }

  // Perform the copy operation
  try {
    await fs.promises.copyFile(sourcePath, destinationPath, overwrite ? 0 : fs.constants.COPYFILE_EXCL);

    // Preserve metadata if requested
    if (preserveMetadata) {
      try {
        await fs.promises.chmod(destinationPath, sourceStats.mode);
        await fs.promises.utimes(destinationPath, sourceStats.atime, sourceStats.mtime);
      } catch (error) {
        // Log warning but don't fail the copy operation
        console.warn(`Failed to preserve metadata for ${destinationPath}:`, error);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new FileCopyError(
      `Failed to copy file from ${sourcePath} to ${destinationPath}: ${errorMessage}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Copy a file and return detailed result
 *
 * @param sourcePath - Path to the source file
 * @param destinationPath - Path to the destination file
 * @param options - Copy options
 * @returns Promise that resolves with the copy result
 */
export async function copyFileWithResult(
  sourcePath: string,
  destinationPath: string,
  options: CopyOptions = {}
): Promise<CopyResult> {
  try {
    await copyFile(sourcePath, destinationPath, options);
    return {
      success: true,
      sourcePath,
      destinationPath,
    };
  } catch (error) {
    return {
      success: false,
      sourcePath,
      destinationPath,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// BATCH COPY OPERATIONS
// ============================================================================

/**
 * Copy multiple files from source to destination directory
 *
 * @param sourceFiles - Array of source file paths
 * @param destinationDir - Destination directory path
 * @param options - Copy options
 * @returns Promise that resolves with batch copy result
 */
export async function copyFiles(
  sourceFiles: string[],
  destinationDir: string,
  options: CopyOptions = {}
): Promise<BatchCopyResult> {
  const { onProgress } = options;

  // Validate inputs
  if (!Array.isArray(sourceFiles)) {
    throw new FileCopyError('Source files must be an array');
  }

  if (sourceFiles.length === 0) {
    return {
      success: true,
      totalFiles: 0,
      successfulCopies: 0,
      failedCopies: 0,
      results: [],
      errors: [],
    };
  }

  // Ensure destination directory exists
  if (!fs.existsSync(destinationDir)) {
    try {
      fs.mkdirSync(destinationDir, { recursive: true });
    } catch (error) {
      throw new FileCopyError(
        `Failed to create destination directory: ${destinationDir}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  // Calculate total bytes for progress tracking
  let totalBytes = 0;
  const fileSizes: Map<string, number> = new Map();

  for (const sourceFile of sourceFiles) {
    try {
      const stats = fs.statSync(sourceFile);
      if (stats.isFile()) {
        totalBytes += stats.size;
        fileSizes.set(sourceFile, stats.size);
      }
    } catch (error) {
      console.warn(`Failed to get size for ${sourceFile}:`, error);
    }
  }

  // Copy files sequentially
  const results: CopyResult[] = [];
  const errors: Array<{ file: string; error: string }> = [];
  let successfulCopies = 0;
  let failedCopies = 0;
  let bytesCopied = 0;

  for (let i = 0; i < sourceFiles.length; i++) {
    const sourceFile = sourceFiles[i];
    const fileName = path.basename(sourceFile);
    const destinationPath = path.join(destinationDir, fileName);

    const result = await copyFileWithResult(sourceFile, destinationPath, options);
    results.push(result);

    if (result.success) {
      successfulCopies++;
      bytesCopied += fileSizes.get(sourceFile) || 0;
    } else {
      failedCopies++;
      errors.push({ file: sourceFile, error: result.error || 'Unknown error' });
    }

    // Report progress
    if (onProgress) {
      const progress: CopyProgress = {
        currentFile: fileName,
        currentFileIndex: i + 1,
        totalFiles: sourceFiles.length,
        bytesCopied,
        totalBytes,
        percentage: totalBytes > 0 ? Math.round((bytesCopied / totalBytes) * 100) : 0,
      };
      onProgress(progress);
    }
  }

  return {
    success: failedCopies === 0,
    totalFiles: sourceFiles.length,
    successfulCopies,
    failedCopies,
    results,
    errors,
  };
}

/**
 * Copy all .docx files from source directory to destination directory
 *
 * @param sourceDir - Source directory path
 * @param destinationDir - Destination directory path
 * @param options - Copy options
 * @returns Promise that resolves with batch copy result
 */
export async function copyDocxFiles(
  sourceDir: string,
  destinationDir: string,
  options: CopyOptions = {}
): Promise<BatchCopyResult> {
  // Validate source directory exists
  if (!fs.existsSync(sourceDir)) {
    throw new FileCopyError(`Source directory does not exist: ${sourceDir}`);
  }

  // Validate source is a directory
  const sourceStats = fs.statSync(sourceDir);
  if (!sourceStats.isDirectory()) {
    throw new FileCopyError(`Source path is not a directory: ${sourceDir}`);
  }

  // Find all .docx files in source directory
  const docxFiles: string[] = [];
  try {
    const files = fs.readdirSync(sourceDir);
    for (const file of files) {
      const filePath = path.join(sourceDir, file);
      const ext = path.extname(file).toLowerCase();
      if (ext === '.docx' && fs.statSync(filePath).isFile()) {
        docxFiles.push(filePath);
      }
    }
  } catch (error) {
    throw new FileCopyError(
      `Failed to read source directory: ${sourceDir}`,
      error instanceof Error ? error : undefined
    );
  }

  if (docxFiles.length === 0) {
    return {
      success: true,
      totalFiles: 0,
      successfulCopies: 0,
      failedCopies: 0,
      results: [],
      errors: [],
    };
  }

  // Copy all .docx files
  return copyFiles(docxFiles, destinationDir, options);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a file exists and is readable
 *
 * @param filePath - Path to the file
 * @returns Promise that resolves to true if file exists and is readable
 */
export async function isFileReadable(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    const stats = await fs.promises.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Check if a directory exists and is writable
 *
 * @param dirPath - Path to the directory
 * @returns Promise that resolves to true if directory exists and is writable
 */
export async function isDirectoryWritable(dirPath: string): Promise<boolean> {
  try {
    await fs.promises.access(dirPath, fs.constants.W_OK);
    const stats = await fs.promises.stat(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Get file size in bytes
 *
 * @param filePath - Path to the file
 * @returns Promise that resolves to file size in bytes
 * @throws FileCopyError if file doesn't exist or is not accessible
 */
export async function getFileSize(filePath: string): Promise<number> {
  try {
    const stats = await fs.promises.stat(filePath);
    if (!stats.isFile()) {
      throw new FileCopyError(`Path is not a file: ${filePath}`);
    }
    return stats.size;
  } catch (error) {
    if (error instanceof FileCopyError) {
      throw error;
    }
    throw new FileCopyError(
      `Failed to get file size for ${filePath}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Ensure a directory exists, creating it if necessary
 *
 * @param dirPath - Path to the directory
 * @throws FileCopyError if directory cannot be created
 */
export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  if (fs.existsSync(dirPath)) {
    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      throw new FileCopyError(`Path exists but is not a directory: ${dirPath}`);
    }
    return;
  }

  try {
    await fs.promises.mkdir(dirPath, { recursive: true });
  } catch (error) {
    throw new FileCopyError(
      `Failed to create directory: ${dirPath}`,
      error instanceof Error ? error : undefined
    );
  }
}