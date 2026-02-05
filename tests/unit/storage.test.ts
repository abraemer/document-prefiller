/**
 * Storage Service Tests
 * Unit tests for save file read/write operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  readSaveFile,
  writeSaveFile,
  readSaveFileSync,
  writeSaveFileSync,
  saveFileExists,
  getSaveFilePath,
  getBackupFilePath,
  createBackupFile,
  cleanupOldBackups,
  getBackupFiles,
  deleteSaveFile,
  restoreFromBackup,
  getSaveFileLastModified,
  StorageError,
  SaveFileNotFoundError,
  SaveFileCorruptedError,
} from '../../src/main/services/storage';
import { createDefaultReplacementValuesFile } from '../../src/shared/utils/validation';
import { DEFAULT_PREFIX } from '../../src/shared/constants';

// Test directory path
const TEST_DIR = path.join(process.cwd(), 'tests', 'temp', 'storage-test');

describe('Storage Service', () => {
  beforeEach(async () => {
    // Create test directory
    await fs.promises.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getSaveFilePath', () => {
    it('should return correct path to save file', () => {
      const result = getSaveFilePath('/test/folder');
      expect(result).toBe('/test/folder/.replacement-values.json');
    });
  });

  describe('getBackupFilePath', () => {
    it('should return correct path to backup file', () => {
      const timestamp = 1234567890;
      const result = getBackupFilePath('/test/folder', timestamp);
      expect(result).toBe('/test/folder/.replacement-values.json.bak.1234567890');
    });
  });

  describe('saveFileExists', () => {
    it('should return false when save file does not exist', async () => {
      const result = await saveFileExists(TEST_DIR);
      expect(result).toBe(false);
    });

    it('should return true when save file exists', async () => {
      const filePath = getSaveFilePath(TEST_DIR);
      await fs.promises.writeFile(filePath, '{}', 'utf-8');
      const result = await saveFileExists(TEST_DIR);
      expect(result).toBe(true);
    });

    it('should return false when path is a directory', async () => {
      const dirPath = path.join(TEST_DIR, 'dir');
      await fs.promises.mkdir(dirPath);
      const result = await saveFileExists(dirPath);
      expect(result).toBe(false);
    });
  });

  describe('readSaveFile', () => {
    it('should read valid save file successfully', async () => {
      const testData = createDefaultReplacementValuesFile(DEFAULT_PREFIX);
      testData.values = { TITLE: 'Test Title', DATA: 'Test Data' };

      await writeSaveFile(TEST_DIR, testData, { createBackup: false });

      const result = await readSaveFile(TEST_DIR);
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.prefix).toBe(DEFAULT_PREFIX);
      expect(result.data?.values).toEqual({ TITLE: 'Test Title', DATA: 'Test Data' });
    });

    it('should return error when save file does not exist', async () => {
      const result = await readSaveFile(TEST_DIR);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should create default file when createDefaultIfNotFound is true', async () => {
      const result = await readSaveFile(TEST_DIR, { createDefaultIfNotFound: true });
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.createdDefault).toBe(true);
      expect(result.data?.prefix).toBe(DEFAULT_PREFIX);
      expect(result.data?.values).toEqual({});
    });

    it('should handle malformed JSON gracefully', async () => {
      const filePath = getSaveFilePath(TEST_DIR);
      await fs.promises.writeFile(filePath, '{ invalid json }', 'utf-8');

      const result = await readSaveFile(TEST_DIR);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid JSON format');
    });

    it('should validate file structure', async () => {
      const filePath = getSaveFilePath(TEST_DIR);
      await fs.promises.writeFile(filePath, JSON.stringify({ invalid: 'structure' }), 'utf-8');

      const result = await readSaveFile(TEST_DIR);
      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });

  });

  describe('readSaveFileSync', () => {
    it('should read valid save file successfully', async () => {
      const testData = createDefaultReplacementValuesFile(DEFAULT_PREFIX);
      testData.values = { TITLE: 'Test Title' };

      await writeSaveFile(TEST_DIR, testData, { createBackup: false });

      const result = await readSaveFileSync(TEST_DIR);
      expect(result.prefix).toBe(DEFAULT_PREFIX);
      expect(result.values).toEqual({ TITLE: 'Test Title' });
    });

    it('should throw SaveFileNotFoundError when file does not exist', async () => {
      await expect(readSaveFileSync(TEST_DIR)).rejects.toThrow(SaveFileNotFoundError);
    });

    it('should throw SaveFileCorruptedError for malformed JSON', async () => {
      const filePath = getSaveFilePath(TEST_DIR);
      await fs.promises.writeFile(filePath, '{ invalid json }', 'utf-8');

      await expect(readSaveFileSync(TEST_DIR)).rejects.toThrow(SaveFileCorruptedError);
    });

    it('should throw SaveFileCorruptedError for invalid structure', async () => {
      const filePath = getSaveFilePath(TEST_DIR);
      await fs.promises.writeFile(filePath, JSON.stringify({ invalid: 'structure' }), 'utf-8');

      await expect(readSaveFileSync(TEST_DIR)).rejects.toThrow(SaveFileCorruptedError);
    });
  });

  describe('writeSaveFile', () => {
    it('should write valid save file successfully', async () => {
      const testData = createDefaultReplacementValuesFile(DEFAULT_PREFIX);
      testData.values = { TITLE: 'Test Title', DATA: 'Test Data' };

      const result = await writeSaveFile(TEST_DIR, testData, { createBackup: false });
      expect(result.success).toBe(true);
      expect(result.filePath).toBeDefined();

      // Verify file was written
      const exists = await saveFileExists(TEST_DIR);
      expect(exists).toBe(true);

      // Verify content
      const readResult = await readSaveFile(TEST_DIR);
      expect(readResult.success).toBe(true);
      expect(readResult.data?.values).toEqual({ TITLE: 'Test Title', DATA: 'Test Data' });
    });

    it('should update timestamp by default', async () => {
      const testData = createDefaultReplacementValuesFile(DEFAULT_PREFIX);
      testData.values = { TITLE: 'Test Title' };

      const beforeWrite = new Date();
      await writeSaveFile(TEST_DIR, testData, { createBackup: false });
      const afterWrite = new Date();

      const readResult = await readSaveFile(TEST_DIR);
      expect(readResult.success).toBe(true);

      if (!readResult.data?.lastModified) {
        throw new Error('lastModified should be defined');
      }
      const lastModified = new Date(readResult.data.lastModified);
      expect(lastModified.getTime()).toBeGreaterThanOrEqual(beforeWrite.getTime());
      expect(lastModified.getTime()).toBeLessThanOrEqual(afterWrite.getTime());
    });

    it('should not update timestamp when updateTimestamp is false', async () => {
      const testData = createDefaultReplacementValuesFile(DEFAULT_PREFIX);
      testData.values = { TITLE: 'Test Title' };
      const originalTimestamp = '2024-01-01T00:00:00.000Z';
      testData.lastModified = originalTimestamp;

      await writeSaveFile(TEST_DIR, testData, { createBackup: false, updateTimestamp: false });

      const readResult = await readSaveFile(TEST_DIR);
      expect(readResult.success).toBe(true);
      expect(readResult.data?.lastModified).toBe(originalTimestamp);
    });

    it('should validate data before writing', async () => {
      
      const invalidData = {
        prefix: 'INVALID-PREFIX-THAT-IS-WAY-TOO-LONG-AND-EXCEEDS-MAXIMUM-LENGTH',
        values: {},
        version: '1.0',
      } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

      const result = await writeSaveFile(TEST_DIR, invalidData);
      expect(result.success).toBe(false);
      expect(result.error).toContain('validation failed');
    });

    it('should create backup when createBackup is true', async () => {
      const testData1 = createDefaultReplacementValuesFile(DEFAULT_PREFIX);
      testData1.values = { TITLE: 'Original' };

      await writeSaveFile(TEST_DIR, testData1, { createBackup: false });

      const testData2 = createDefaultReplacementValuesFile(DEFAULT_PREFIX);
      testData2.values = { TITLE: 'Updated' };

      const result = await writeSaveFile(TEST_DIR, testData2, { createBackup: true });
      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined();

      // Verify backup exists
      const backupFiles = await getBackupFiles(TEST_DIR);
      expect(backupFiles.length).toBeGreaterThan(0);
    });

    it('should use atomic write by default', async () => {
      const testData = createDefaultReplacementValuesFile(DEFAULT_PREFIX);
      testData.values = { TITLE: 'Test Title' };

      const result = await writeSaveFile(TEST_DIR, testData, { createBackup: false });
      expect(result.success).toBe(true);

      // Verify file was written atomically (no temp files left)
      const files = await fs.promises.readdir(TEST_DIR);
      const tempFiles = files.filter((file) => file.startsWith('.replacement-values.json.tmp'));
      expect(tempFiles.length).toBe(0);
    });

    it('should handle write errors gracefully', async () => {
      const testData = createDefaultReplacementValuesFile(DEFAULT_PREFIX);
      testData.values = { TITLE: 'Test Title' };

      // Make directory read-only
      await fs.promises.chmod(TEST_DIR, 0o444);

      const result = await writeSaveFile(TEST_DIR, testData);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to write');

      // Restore permissions for cleanup
      await fs.promises.chmod(TEST_DIR, 0o755);
    });
  });

  describe('writeSaveFileSync', () => {
    it('should write valid save file successfully', async () => {
      const testData = createDefaultReplacementValuesFile(DEFAULT_PREFIX);
      testData.values = { TITLE: 'Test Title' };

      await expect(writeSaveFileSync(TEST_DIR, testData, { createBackup: false })).resolves.not.toThrow();

      const exists = await saveFileExists(TEST_DIR);
      expect(exists).toBe(true);
    });

    it('should throw StorageError for invalid data', async () => {
      const invalidData = {
        prefix: 'INVALID-PREFIX-THAT-IS-WAY-TOO-LONG-AND-EXCEEDS-MAXIMUM-LENGTH',
        values: {},
        version: '1.0',
      } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

      await expect(writeSaveFileSync(TEST_DIR, invalidData)).rejects.toThrow(StorageError);
    });

    it('should throw StorageError for write errors', async () => {
      const testData = createDefaultReplacementValuesFile(DEFAULT_PREFIX);
      testData.values = { TITLE: 'Test Title' };

      // Make directory read-only
      await fs.promises.chmod(TEST_DIR, 0o444);

      await expect(writeSaveFileSync(TEST_DIR, testData)).rejects.toThrow(StorageError);

      // Restore permissions for cleanup
      await fs.promises.chmod(TEST_DIR, 0o755);
    });
  });

  describe('createBackupFile', () => {
    it('should create backup file successfully', async () => {
      const testData = createDefaultReplacementValuesFile(DEFAULT_PREFIX);
      testData.values = { TITLE: 'Test Title' };

      await writeSaveFile(TEST_DIR, testData, { createBackup: false });

      const backupPath = await createBackupFile(TEST_DIR);
      expect(backupPath).toBeDefined();
      expect(backupPath).toContain('.replacement-values.json.bak.');

      // Verify backup exists
      const exists = await fs.promises.access(backupPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should throw error when save file does not exist', async () => {
      await expect(createBackupFile(TEST_DIR)).rejects.toThrow(StorageError);
    });

    it('should clean up old backups', async () => {
      const testData = createDefaultReplacementValuesFile(DEFAULT_PREFIX);
      testData.values = { TITLE: 'Test Title' };

      await writeSaveFile(TEST_DIR, testData, { createBackup: false });

      // Create multiple backups
      for (let i = 0; i < 10; i++) {
        await createBackupFile(TEST_DIR);
      }

      const backupFiles = await getBackupFiles(TEST_DIR);
      expect(backupFiles.length).toBeLessThanOrEqual(5); // MAX_SAVE_FILE_BACKUPS
    });
  });

  describe('cleanupOldBackups', () => {
    it('should clean up old backups', async () => {
      const testData = createDefaultReplacementValuesFile(DEFAULT_PREFIX);
      testData.values = { TITLE: 'Test Title' };

      await writeSaveFile(TEST_DIR, testData, { createBackup: false });

      // Create multiple backups
      for (let i = 0; i < 10; i++) {
        await createBackupFile(TEST_DIR);
      }

      await cleanupOldBackups(TEST_DIR);

      const backupFiles = await getBackupFiles(TEST_DIR);
      expect(backupFiles.length).toBeLessThanOrEqual(5);
    });

    it('should handle errors gracefully', async () => {
      // Should not throw even if directory doesn't exist
      await expect(cleanupOldBackups('/nonexistent/path')).resolves.not.toThrow();
    });
  });

  describe('getBackupFiles', () => {
    it('should return empty array when no backups exist', async () => {
      const result = await getBackupFiles(TEST_DIR);
      expect(result).toEqual([]);
    });

    it('should return list of backup files', async () => {
      const testData = createDefaultReplacementValuesFile(DEFAULT_PREFIX);
      testData.values = { TITLE: 'Test Title' };

      await writeSaveFile(TEST_DIR, testData, { createBackup: false });

      // Create backups
      await createBackupFile(TEST_DIR);
      await createBackupFile(TEST_DIR);

      const result = await getBackupFiles(TEST_DIR);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toContain('.replacement-values.json.bak.');
    });

    it('should sort backups by timestamp descending', async () => {
      const testData = createDefaultReplacementValuesFile(DEFAULT_PREFIX);
      testData.values = { TITLE: 'Test Title' };

      await writeSaveFile(TEST_DIR, testData, { createBackup: false });

      // Create backups with delays
      await createBackupFile(TEST_DIR);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await createBackupFile(TEST_DIR);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await createBackupFile(TEST_DIR);

      const result = await getBackupFiles(TEST_DIR);
      expect(result.length).toBeGreaterThanOrEqual(3);

      // Extract timestamps
      const timestamps = result.map((file) => {
        const match = file.match(/\.bak\.(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
      });

      // Verify descending order
      for (let i = 0; i < timestamps.length - 1; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i + 1]);
      }
    });
  });

  describe('deleteSaveFile', () => {
    it('should delete save file successfully', async () => {
      const testData = createDefaultReplacementValuesFile(DEFAULT_PREFIX);
      testData.values = { TITLE: 'Test Title' };

      await writeSaveFile(TEST_DIR, testData, { createBackup: false });

      const result = await deleteSaveFile(TEST_DIR);
      expect(result).toBe(true);

      const exists = await saveFileExists(TEST_DIR);
      expect(exists).toBe(false);
    });

    it('should return false when save file does not exist', async () => {
      const result = await deleteSaveFile(TEST_DIR);
      expect(result).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      const filePath = getSaveFilePath(TEST_DIR);
      await fs.promises.writeFile(filePath, '{}', 'utf-8');
      await fs.promises.chmod(filePath, 0o000); // Make file read-only

      const result = await deleteSaveFile(TEST_DIR);
      expect(result).toBe(false);

      // Restore permissions for cleanup
      await fs.promises.chmod(filePath, 0o644);
    });
  });

  describe('restoreFromBackup', () => {
    it('should restore from backup successfully', async () => {
      const testData1 = createDefaultReplacementValuesFile(DEFAULT_PREFIX);
      testData1.values = { TITLE: 'Original' };

      await writeSaveFile(TEST_DIR, testData1, { createBackup: false });

      const backupPath = await createBackupFile(TEST_DIR);

      const testData2 = createDefaultReplacementValuesFile(DEFAULT_PREFIX);
      testData2.values = { TITLE: 'Modified' };

      await writeSaveFile(TEST_DIR, testData2, { createBackup: false });

      const result = await restoreFromBackup(TEST_DIR, backupPath);
      expect(result).toBe(true);

      const readResult = await readSaveFile(TEST_DIR);
      expect(readResult.success).toBe(true);
      expect(readResult.data?.values).toEqual({ TITLE: 'Original' });
    });

    it('should return false when backup does not exist', async () => {
      const result = await restoreFromBackup(TEST_DIR, '/nonexistent/backup.bak');
      expect(result).toBe(false);
    });

    it('should return false for invalid backup file', async () => {
      const backupPath = path.join(TEST_DIR, 'invalid.bak');
      await fs.promises.writeFile(backupPath, 'invalid json', 'utf-8');

      const result = await restoreFromBackup(TEST_DIR, backupPath);
      expect(result).toBe(false);
    });

    it('should return false for backup with invalid structure', async () => {
      const backupPath = path.join(TEST_DIR, 'invalid-structure.bak');
      await fs.promises.writeFile(backupPath, JSON.stringify({ invalid: 'structure' }), 'utf-8');

      const result = await restoreFromBackup(TEST_DIR, backupPath);
      expect(result).toBe(false);
    });
  });

  describe('getSaveFileLastModified', () => {
    it('should return null when save file does not exist', async () => {
      const result = await getSaveFileLastModified(TEST_DIR);
      expect(result).toBeNull();
    });

    it('should return last modified timestamp', async () => {
      const testData = createDefaultReplacementValuesFile(DEFAULT_PREFIX);
      testData.values = { TITLE: 'Test Title' };

      await writeSaveFile(TEST_DIR, testData, { createBackup: false });

      const result = await getSaveFileLastModified(TEST_DIR);

      expect(result).not.toBeNull();
      if (!result) {
        throw new Error('result should not be null');
      }
      // Verify it's a valid recent timestamp (within last minute)
      const now = Date.now();
      const oneMinuteAgo = now - 60 * 1000;
      expect(result.getTime()).toBeGreaterThanOrEqual(oneMinuteAgo);
      expect(result.getTime()).toBeLessThanOrEqual(now);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete read-write-read cycle', async () => {
      const testData = createDefaultReplacementValuesFile(DEFAULT_PREFIX);
      testData.values = { TITLE: 'Test Title', DATA: 'Test Data' };

      // Write
      const writeResult = await writeSaveFile(TEST_DIR, testData, { createBackup: false });
      expect(writeResult.success).toBe(true);

      // Read
      const readResult = await readSaveFile(TEST_DIR);
      expect(readResult.success).toBe(true);
      expect(readResult.data?.values).toEqual({ TITLE: 'Test Title', DATA: 'Test Data' });

      // Modify and write again
      testData.values.TITLE = 'Updated Title';
      const writeResult2 = await writeSaveFile(TEST_DIR, testData, { createBackup: true });
      expect(writeResult2.success).toBe(true);
      expect(writeResult2.backupPath).toBeDefined();

      // Read again
      const readResult2 = await readSaveFile(TEST_DIR);
      expect(readResult2.success).toBe(true);
      if (!readResult2.data?.values.TITLE) {
        throw new Error('TITLE should be defined');
      }
      expect(readResult2.data.values.TITLE).toBe('Updated Title');
    });

    it('should handle backup and restore cycle', async () => {
      const testData1 = createDefaultReplacementValuesFile(DEFAULT_PREFIX);
      testData1.values = { TITLE: 'Original' };

      await writeSaveFile(TEST_DIR, testData1, { createBackup: false });

      // Create backup
      const backupPath = await createBackupFile(TEST_DIR);

      // Modify
      const testData2 = createDefaultReplacementValuesFile(DEFAULT_PREFIX);
      testData2.values = { TITLE: 'Modified' };

      await writeSaveFile(TEST_DIR, testData2, { createBackup: false });

      // Verify modified
      const readResult1 = await readSaveFile(TEST_DIR);
      if (!readResult1.data?.values.TITLE) {
        throw new Error('TITLE should be defined');
      }
      expect(readResult1.data.values.TITLE).toBe('Modified');

      // Restore from backup
      const restoreResult = await restoreFromBackup(TEST_DIR, backupPath);
      expect(restoreResult).toBe(true);

      // Verify restored
      const readResult2 = await readSaveFile(TEST_DIR);
      if (!readResult2.data?.values.TITLE) {
        throw new Error('TITLE should be defined');
      }
      expect(readResult2.data.values.TITLE).toBe('Original');
    });

    it('should handle error recovery with default file creation', async () => {
      // Try to read non-existent file with default creation
      const result = await readSaveFile(TEST_DIR, { createDefaultIfNotFound: true });
      expect(result.success).toBe(true);
      expect(result.createdDefault).toBe(true);
      expect(result.data?.values).toEqual({});

      // Verify file was created
      const exists = await saveFileExists(TEST_DIR);
      expect(exists).toBe(true);
    });
  });
});