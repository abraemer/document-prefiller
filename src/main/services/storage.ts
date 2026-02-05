/**
 * Storage Service
 * Handles file storage operations for save files and settings
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ReplacementValuesFile } from '../../shared/types/data-models';
import {
  validateReplacementValuesFile,
  createDefaultReplacementValuesFile,
} from '../../shared/utils/validation';
import {
  SAVE_FILE_NAME,
  DEFAULT_PREFIX,
  SAVE_FILE_BACKUP_EXTENSION,
  MAX_SAVE_FILE_BACKUPS,
} from '../../shared/constants';

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Custom error class for storage operations
 */
export class StorageError extends Error {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'StorageError';
    this.cause = cause;
  }
}

/**
 * Error thrown when save file is not found
 */
export class SaveFileNotFoundError extends StorageError {
  constructor(filePath: string) {
    super(`Save file not found: ${filePath}`);
    this.name = 'SaveFileNotFoundError';
  }
}

/**
 * Error thrown when save file is corrupted or invalid
 */
export class SaveFileCorruptedError extends StorageError {
  constructor(filePath: string, reason: string) {
    super(`Save file is corrupted: ${filePath} - ${reason}`);
    this.name = 'SaveFileCorruptedError';
  }
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Options for reading save files
 */
export interface ReadSaveFileOptions {
  /**
   * Whether to create a default save file if it doesn't exist
   * @default false
   */
  createDefaultIfNotFound?: boolean;

  /**
   * Prefix to use when creating default save file
   * @default DEFAULT_PREFIX
   */
  defaultPrefix?: string;
}

/**
 * Options for writing save files
 */
export interface WriteSaveFileOptions {
  /**
   * Whether to create a backup before writing
   * @default true
   */
  createBackup?: boolean;

  /**
   * Whether to use atomic write (write to temp file then rename)
   * @default true
   */
  atomic?: boolean;

  /**
   * Whether to update the lastModified timestamp
   * @default true
   */
  updateTimestamp?: boolean;
}

/**
 * Result of a save file read operation
 */
export interface ReadSaveFileResult {
  /**
   * Whether the operation was successful
   */
  success: boolean;

  /**
   * The loaded save file data
   */
  data?: ReplacementValuesFile;

  /**
   * Error message if operation failed
   */
  error?: string;

  /**
   * Whether a new default file was created
   */
  createdDefault?: boolean;
}

/**
 * Result of a save file write operation
 */
export interface WriteSaveFileResult {
  /**
   * Whether the operation was successful
   */
  success: boolean;

  /**
   * Path to the written file
   */
  filePath?: string;

  /**
   * Path to the backup file (if created)
   */
  backupPath?: string;

  /**
   * Error message if operation failed
   */
  error?: string;
}

// ============================================================================
// SAVE FILE PATH UTILITIES
// ============================================================================

/**
 * Get the path to the save file in a folder
 *
 * @param folderPath - Path to the folder
 * @returns Path to the save file
 */
export function getSaveFilePath(folderPath: string): string {
  return path.join(folderPath, SAVE_FILE_NAME);
}

/**
 * Get the path to a backup save file
 *
 * @param folderPath - Path to the folder
 * @param timestamp - Timestamp for the backup
 * @returns Path to the backup file
 */
export function getBackupFilePath(folderPath: string, timestamp: number): string {
  return path.join(
    folderPath,
    `${SAVE_FILE_NAME}${SAVE_FILE_BACKUP_EXTENSION}.${timestamp}`
  );
}

/**
 * Check if a save file exists in a folder
 *
 * @param folderPath - Path to the folder
 * @returns Promise that resolves to true if save file exists
 */
export async function saveFileExists(folderPath: string): Promise<boolean> {
  const filePath = getSaveFilePath(folderPath);
  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    const stats = await fs.promises.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

// ============================================================================
// BACKUP MANAGEMENT
// ============================================================================

/**
 * Create a backup of the save file
 *
 * @param folderPath - Path to the folder containing the save file
 * @returns Promise that resolves to the backup file path
 * @throws StorageError if backup creation fails
 */
export async function createBackupFile(folderPath: string): Promise<string> {
  const filePath = getSaveFilePath(folderPath);

  // Check if save file exists
  if (!(await saveFileExists(folderPath))) {
    throw new StorageError(`Cannot create backup: save file does not exist at ${filePath}`);
  }

  // Create backup with timestamp
  const timestamp = Date.now();
  const backupPath = getBackupFilePath(folderPath, timestamp);

  try {
    await fs.promises.copyFile(filePath, backupPath);
  } catch (error) {
    throw new StorageError(
      `Failed to create backup at ${backupPath}`,
      error instanceof Error ? error : undefined
    );
  }

  // Clean up old backups
  await cleanupOldBackups(folderPath);

  return backupPath;
}

/**
 * Clean up old backup files, keeping only the most recent ones
 *
 * @param folderPath - Path to the folder containing backups
 * @returns Promise that resolves when cleanup is complete
 */
export async function cleanupOldBackups(folderPath: string): Promise<void> {
  try {
    const files = await fs.promises.readdir(folderPath);
    const backupFiles = files
      .filter((file) => file.startsWith(SAVE_FILE_NAME + SAVE_FILE_BACKUP_EXTENSION))
      .map((file) => ({
        name: file,
        path: path.join(folderPath, file),
        timestamp: parseInt(file.split('.').pop() || '0', 10),
      }))
      .filter((file) => !isNaN(file.timestamp))
      .sort((a, b) => b.timestamp - a.timestamp); // Sort by timestamp descending

    // Delete old backups beyond the limit
    const backupsToDelete = backupFiles.slice(MAX_SAVE_FILE_BACKUPS);
    for (const backup of backupsToDelete) {
      try {
        await fs.promises.unlink(backup.path);
      } catch (error) {
        console.warn(`Failed to delete old backup ${backup.path}:`, error);
      }
    }
  } catch (error) {
    console.warn('Failed to clean up old backups:', error);
  }
}

/**
 * Get all backup files for a folder
 *
 * @param folderPath - Path to the folder
 * @returns Promise that resolves to array of backup file paths
 */
export async function getBackupFiles(folderPath: string): Promise<string[]> {
  try {
    const files = await fs.promises.readdir(folderPath);
    return files
      .filter((file) => file.startsWith(SAVE_FILE_NAME + SAVE_FILE_BACKUP_EXTENSION))
      .map((file) => path.join(folderPath, file))
      .sort((a, b) => {
        const timestampA = parseInt(a.split('.').pop() || '0', 10);
        const timestampB = parseInt(b.split('.').pop() || '0', 10);
        return timestampB - timestampA; // Sort by timestamp descending
      });
  } catch {
    return [];
  }
}

// ============================================================================
// SAVE FILE READ OPERATIONS
// ============================================================================

/**
 * Read a save file from a folder
 *
 * @param folderPath - Path to the folder containing the save file
 * @param options - Read options
 * @returns Promise that resolves with the read result
 */
export async function readSaveFile(
  folderPath: string,
  options: ReadSaveFileOptions = {}
): Promise<ReadSaveFileResult> {
  const {
    createDefaultIfNotFound = false,
    defaultPrefix = DEFAULT_PREFIX,
  } = options;

  const filePath = getSaveFilePath(folderPath);

  // Check if save file exists
  const exists = await saveFileExists(folderPath);
  if (!exists) {
    if (createDefaultIfNotFound) {
      // Create default save file
      const defaultFile = createDefaultReplacementValuesFile(defaultPrefix);
      const writeResult = await writeSaveFile(folderPath, defaultFile, {
        createBackup: false,
        atomic: true,
        updateTimestamp: true,
      });

      if (writeResult.success) {
        return {
          success: true,
          data: defaultFile,
          createdDefault: true,
        };
      } else {
        return {
          success: false,
          error: writeResult.error || 'Failed to create default save file',
        };
      }
    } else {
      return {
        success: false,
        error: `Save file not found at ${filePath}`,
      };
    }
  }

  // Read file content
  let fileContent: string;
  try {
    fileContent = await fs.promises.readFile(filePath, 'utf-8');
  } catch (error) {
    return {
      success: false,
      error: `Failed to read save file at ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }

  // Parse JSON
  let parsedData: unknown;
  try {
    parsedData = JSON.parse(fileContent);
  } catch {
    return {
      success: false,
      error: `Failed to parse save file at ${filePath}: Invalid JSON format`,
    };
  }

  // Validate file structure
  const validationResult = validateReplacementValuesFile(parsedData);
  if (!validationResult.valid) {
    const errorMessages = validationResult.errors
      .map((e: { path: string; message: string }) => `${e.path}: ${e.message}`)
      .join(', ');
    return {
      success: false,
      error: `Save file validation failed at ${filePath}: ${errorMessages}`,
    };
  }

  return {
    success: true,
    data: parsedData as ReplacementValuesFile,
  };
}

/**
 * Read a save file and throw errors instead of returning result object
 *
 * @param folderPath - Path to the folder containing the save file
 * @param options - Read options
 * @returns Promise that resolves to the save file data
 * @throws SaveFileNotFoundError if file doesn't exist
 * @throws SaveFileCorruptedError if file is corrupted
 * @throws StorageError for other errors
 */
export async function readSaveFileSync(
  folderPath: string,
  options: ReadSaveFileOptions = {}
): Promise<ReplacementValuesFile> {
  const result = await readSaveFile(folderPath, options);

  if (!result.success) {
    if (result.error?.includes('not found')) {
      throw new SaveFileNotFoundError(getSaveFilePath(folderPath));
    } else if (result.error?.includes('validation failed') || result.error?.includes('Invalid JSON')) {
      throw new SaveFileCorruptedError(getSaveFilePath(folderPath), result.error);
    } else {
      throw new StorageError(result.error || 'Failed to read save file');
    }
  }

  if (!result.data) {
    throw new StorageError('Save file data is missing');
  }

  return result.data;
}

// ============================================================================
// SAVE FILE WRITE OPERATIONS
// ============================================================================

/**
 * Write a save file to a folder
 *
 * @param folderPath - Path to the folder
 * @param data - Save file data to write
 * @param options - Write options
 * @returns Promise that resolves with the write result
 */
export async function writeSaveFile(
  folderPath: string,
  data: ReplacementValuesFile,
  options: WriteSaveFileOptions = {}
): Promise<WriteSaveFileResult> {
  const {
    createBackup = true,
    atomic = true,
    updateTimestamp = true,
  } = options;

  const filePath = getSaveFilePath(folderPath);

  // Validate data before writing
  const validationResult = validateReplacementValuesFile(data);
  if (!validationResult.valid) {
    const errorMessages = validationResult.errors
      .map((e: { path: string; message: string }) => `${e.path}: ${e.message}`)
      .join(', ');
    return {
      success: false,
      error: `Data validation failed: ${errorMessages}`,
    };
  }

  // Update timestamp if requested
  if (updateTimestamp) {
    data.lastModified = new Date().toISOString();
  }

  // Create backup if requested and file exists
  let backupPath: string | undefined;
  if (createBackup && (await saveFileExists(folderPath))) {
    try {
      backupPath = await createBackupFile(folderPath);
    } catch (error) {
      console.warn('Failed to create backup:', error);
      // Continue with write even if backup fails
    }
  }

  // Prepare file content
  const fileContent = JSON.stringify(data, null, 2);

  // Write file
  try {
    if (atomic) {
      // Atomic write: write to temp file then rename
      const tempPath = `${filePath}.tmp.${Date.now()}`;
      await fs.promises.writeFile(tempPath, fileContent, 'utf-8');
      await fs.promises.rename(tempPath, filePath);
    } else {
      // Direct write
      await fs.promises.writeFile(filePath, fileContent, 'utf-8');
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to write save file at ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }

  return {
    success: true,
    filePath,
    backupPath,
  };
}

/**
 * Write a save file and throw errors instead of returning result object
 *
 * @param folderPath - Path to the folder
 * @param data - Save file data to write
 * @param options - Write options
 * @returns Promise that resolves when write is complete
 * @throws StorageError if write fails
 */
export async function writeSaveFileSync(
  folderPath: string,
  data: ReplacementValuesFile,
  options: WriteSaveFileOptions = {}
): Promise<void> {
  const result = await writeSaveFile(folderPath, data, options);

  if (!result.success) {
    throw new StorageError(result.error || 'Failed to write save file');
  }
}

// ============================================================================
// SAVE FILE MANAGEMENT
// ============================================================================

/**
 * Delete a save file from a folder
 *
 * @param folderPath - Path to the folder containing the save file
 * @returns Promise that resolves to true if file was deleted
 */
export async function deleteSaveFile(folderPath: string): Promise<boolean> {
  const filePath = getSaveFilePath(folderPath);

  if (!(await saveFileExists(folderPath))) {
    return false;
  }

  try {
    await fs.promises.unlink(filePath);
    return true;
  } catch (error) {
    console.warn(`Failed to delete save file at ${filePath}:`, error);
    return false;
  }
}

/**
 * Restore a save file from a backup
 *
 * @param folderPath - Path to the folder
 * @param backupPath - Path to the backup file to restore
 * @returns Promise that resolves to true if restore was successful
 */
export async function restoreFromBackup(
  folderPath: string,
  backupPath: string
): Promise<boolean> {
  const filePath = getSaveFilePath(folderPath);

  // Check if backup exists
  try {
    await fs.promises.access(backupPath, fs.constants.R_OK);
  } catch {
    return false;
  }

  // Validate backup file
  let fileContent: string;
  try {
    fileContent = await fs.promises.readFile(backupPath, 'utf-8');
  } catch {
    return false;
  }

  let parsedData: unknown;
  try {
    parsedData = JSON.parse(fileContent);
  } catch {
    return false;
  }

  const validationResult = validateReplacementValuesFile(parsedData);
  if (!validationResult.valid) {
    return false;
  }

  // Restore backup
  try {
    await fs.promises.copyFile(backupPath, filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the last modified time of the save file
 *
 * @param folderPath - Path to the folder containing the save file
 * @returns Promise that resolves to the last modified timestamp, or null if file doesn't exist
 */
export async function getSaveFileLastModified(folderPath: string): Promise<Date | null> {
  const filePath = getSaveFilePath(folderPath);

  if (!(await saveFileExists(folderPath))) {
    return null;
  }

  try {
    const stats = await fs.promises.stat(filePath);
    return stats.mtime;
  } catch {
    return null;
  }
}

// ============================================================================
// WINDOW STATE PERSISTENCE (Placeholder for Step 3.6)
// ============================================================================

export function saveWindowState() {
  // TODO: Implement window state saving
  console.log('Save window state');
}

export function restoreWindowState() {
  // TODO: Implement window state restoration
  console.log('Restore window state');
}