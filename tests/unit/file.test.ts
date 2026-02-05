/**
 * Unit Tests for File Copy Utility
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  copyFile,
  copyFileWithResult,
  copyFiles,
  copyDocxFiles,
  isFileReadable,
  isDirectoryWritable,
  getFileSize,
  ensureDirectoryExists,
  FileCopyError,
  type CopyProgress,
} from '../../src/main/utils/file.js';

describe('File Copy Utility', () => {
  // ============================================================================
  // TEST SETUP
  // ============================================================================

  const testDir = path.join(process.cwd(), 'tests', 'temp', 'file-copy');
  const sourceDir = path.join(testDir, 'source');
  const destDir = path.join(testDir, 'destination');

  beforeEach(() => {
    // Clean up test directories before each test
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    // Create test directories
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(destDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directories after each test
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  // ============================================================================
  // COPY FILE
  // ============================================================================

  describe('copyFile', () => {
    it('should copy a file successfully', async () => {
      const sourceFile = path.join(sourceDir, 'test.txt');
      const destFile = path.join(destDir, 'test.txt');
      const content = 'Test content';

      fs.writeFileSync(sourceFile, content);

      await copyFile(sourceFile, destFile);

      expect(fs.existsSync(destFile)).toBe(true);
      expect(fs.readFileSync(destFile, 'utf-8')).toBe(content);
    });

    it('should throw error for non-existent source file', async () => {
      const sourceFile = path.join(sourceDir, 'nonexistent.txt');
      const destFile = path.join(destDir, 'test.txt');

      await expect(copyFile(sourceFile, destFile)).rejects.toThrow(FileCopyError);
      await expect(copyFile(sourceFile, destFile)).rejects.toThrow('does not exist');
    });

    it('should throw error when source is a directory', async () => {
      const sourceFile = sourceDir;
      const destFile = path.join(destDir, 'test.txt');

      await expect(copyFile(sourceFile, destFile)).rejects.toThrow(FileCopyError);
      await expect(copyFile(sourceFile, destFile)).rejects.toThrow('not a file');
    });

    it('should create destination directory if it does not exist', async () => {
      const sourceFile = path.join(sourceDir, 'test.txt');
      const destFile = path.join(destDir, 'subdir', 'test.txt');
      const content = 'Test content';

      fs.writeFileSync(sourceFile, content);

      await copyFile(sourceFile, destFile);

      expect(fs.existsSync(destFile)).toBe(true);
      expect(fs.readFileSync(destFile, 'utf-8')).toBe(content);
    });

    it('should throw error when destination file exists and overwrite is false', async () => {
      const sourceFile = path.join(sourceDir, 'test.txt');
      const destFile = path.join(destDir, 'test.txt');
      const content = 'Test content';

      fs.writeFileSync(sourceFile, content);
      fs.writeFileSync(destFile, 'Existing content');

      await expect(copyFile(sourceFile, destFile, { overwrite: false })).rejects.toThrow(
        FileCopyError
      );
      await expect(copyFile(sourceFile, destFile, { overwrite: false })).rejects.toThrow(
        'already exists'
      );
    });

    it('should overwrite destination file when overwrite is true', async () => {
      const sourceFile = path.join(sourceDir, 'test.txt');
      const destFile = path.join(destDir, 'test.txt');
      const sourceContent = 'New content';
      const destContent = 'Old content';

      fs.writeFileSync(sourceFile, sourceContent);
      fs.writeFileSync(destFile, destContent);

      await copyFile(sourceFile, destFile, { overwrite: true });

      expect(fs.readFileSync(destFile, 'utf-8')).toBe(sourceContent);
    });

    it('should preserve file metadata by default', async () => {
      const sourceFile = path.join(sourceDir, 'test.txt');
      const destFile = path.join(destDir, 'test.txt');
      const content = 'Test content';

      fs.writeFileSync(sourceFile, content, { mode: 0o644 });

      await copyFile(sourceFile, destFile, { preserveMetadata: true });

      const sourceStats = fs.statSync(sourceFile);
      const destStats = fs.statSync(destFile);

      expect(destStats.mode).toBe(sourceStats.mode);
    });

    it('should not preserve file metadata when preserveMetadata is false', async () => {
      const sourceFile = path.join(sourceDir, 'test.txt');
      const destFile = path.join(destDir, 'test.txt');
      const content = 'Test content';

      fs.writeFileSync(sourceFile, content, { mode: 0o644 });

      await copyFile(sourceFile, destFile, { preserveMetadata: false });

      // File should still be copied, but metadata may differ
      expect(fs.existsSync(destFile)).toBe(true);
    });
  });

  // ============================================================================
  // COPY FILE WITH RESULT
  // ============================================================================

  describe('copyFileWithResult', () => {
    it('should return successful result for successful copy', async () => {
      const sourceFile = path.join(sourceDir, 'test.txt');
      const destFile = path.join(destDir, 'test.txt');
      const content = 'Test content';

      fs.writeFileSync(sourceFile, content);

      const result = await copyFileWithResult(sourceFile, destFile);

      expect(result.success).toBe(true);
      expect(result.sourcePath).toBe(sourceFile);
      expect(result.destinationPath).toBe(destFile);
      expect(result.error).toBeUndefined();
    });

    it('should return failed result for failed copy', async () => {
      const sourceFile = path.join(sourceDir, 'nonexistent.txt');
      const destFile = path.join(destDir, 'test.txt');

      const result = await copyFileWithResult(sourceFile, destFile);

      expect(result.success).toBe(false);
      expect(result.sourcePath).toBe(sourceFile);
      expect(result.destinationPath).toBe(destFile);
      expect(result.error).toBeDefined();
    });
  });

  // ============================================================================
  // COPY FILES (BATCH)
  // ============================================================================

  describe('copyFiles', () => {
    it('should copy multiple files successfully', async () => {
      const files = [
        path.join(sourceDir, 'file1.txt'),
        path.join(sourceDir, 'file2.txt'),
        path.join(sourceDir, 'file3.txt'),
      ];

      files.forEach((file, index) => {
        fs.writeFileSync(file, `Content ${index + 1}`);
      });

      const result = await copyFiles(files, destDir);

      expect(result.success).toBe(true);
      expect(result.totalFiles).toBe(3);
      expect(result.successfulCopies).toBe(3);
      expect(result.failedCopies).toBe(0);
      expect(result.results).toHaveLength(3);
      expect(result.errors).toHaveLength(0);

      // Verify all files were copied
      files.forEach((file, index) => {
        const destFile = path.join(destDir, path.basename(file));
        expect(fs.existsSync(destFile)).toBe(true);
        expect(fs.readFileSync(destFile, 'utf-8')).toBe(`Content ${index + 1}`);
      });
    });

    it('should handle empty array of files', async () => {
      const result = await copyFiles([], destDir);

      expect(result.success).toBe(true);
      expect(result.totalFiles).toBe(0);
      expect(result.successfulCopies).toBe(0);
      expect(result.failedCopies).toBe(0);
      expect(result.results).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should throw error for non-array input', async () => {
      await expect(copyFiles(null as unknown as string[], destDir)).rejects.toThrow(FileCopyError);
      await expect(copyFiles(null as unknown as string[], destDir)).rejects.toThrow('must be an array');
    });

    it('should create destination directory if it does not exist', async () => {
      const files = [path.join(sourceDir, 'test.txt')];
      const newDestDir = path.join(testDir, 'new-dest');

      fs.writeFileSync(files[0], 'Content');

      const result = await copyFiles(files, newDestDir);

      expect(result.success).toBe(true);
      expect(fs.existsSync(newDestDir)).toBe(true);
    });

    it('should handle partial failures', async () => {
      const files = [
        path.join(sourceDir, 'file1.txt'),
        path.join(sourceDir, 'nonexistent.txt'),
        path.join(sourceDir, 'file2.txt'),
      ];

      fs.writeFileSync(files[0], 'Content 1');
      fs.writeFileSync(files[2], 'Content 2');

      const result = await copyFiles(files, destDir);

      expect(result.success).toBe(false);
      expect(result.totalFiles).toBe(3);
      expect(result.successfulCopies).toBe(2);
      expect(result.failedCopies).toBe(1);
      expect(result.results).toHaveLength(3);
      expect(result.errors).toHaveLength(1);
    });

    it('should report progress via callback', async () => {
      const files = [
        path.join(sourceDir, 'file1.txt'),
        path.join(sourceDir, 'file2.txt'),
        path.join(sourceDir, 'file3.txt'),
      ];

      files.forEach((file, index) => {
        fs.writeFileSync(file, `Content ${index + 1}`);
      });

      const progressUpdates: CopyProgress[] = [];
      const onProgress = (progress: CopyProgress) => {
        progressUpdates.push(progress);
      };

      await copyFiles(files, destDir, { onProgress });

      expect(progressUpdates).toHaveLength(3);
      expect(progressUpdates[0].currentFileIndex).toBe(1);
      expect(progressUpdates[0].totalFiles).toBe(3);
      expect(progressUpdates[1].currentFileIndex).toBe(2);
      expect(progressUpdates[2].currentFileIndex).toBe(3);
    });

    it('should calculate correct percentage', async () => {
      const files = [
        path.join(sourceDir, 'file1.txt'),
        path.join(sourceDir, 'file2.txt'),
      ];

      files.forEach((file, index) => {
        fs.writeFileSync(file, `Content ${index + 1}`);
      });

      const progressUpdates: CopyProgress[] = [];
      const onProgress = (progress: CopyProgress) => {
        progressUpdates.push(progress);
      };

      await copyFiles(files, destDir, { onProgress });

      expect(progressUpdates[0].percentage).toBeGreaterThan(0);
      expect(progressUpdates[1].percentage).toBe(100);
    });
  });

  // ============================================================================
  // COPY DOCX FILES
  // ============================================================================

  describe('copyDocxFiles', () => {
    it('should copy all .docx files from source directory', async () => {
      const docxFiles = ['document1.docx', 'document2.docx', 'document3.docx'];
      const txtFile = 'readme.txt';

      docxFiles.forEach((file) => {
        fs.writeFileSync(path.join(sourceDir, file), 'DOCX content');
      });
      fs.writeFileSync(path.join(sourceDir, txtFile), 'Text content');

      const result = await copyDocxFiles(sourceDir, destDir);

      expect(result.success).toBe(true);
      expect(result.totalFiles).toBe(3);
      expect(result.successfulCopies).toBe(3);

      // Verify only .docx files were copied
      docxFiles.forEach((file) => {
        expect(fs.existsSync(path.join(destDir, file))).toBe(true);
      });
      expect(fs.existsSync(path.join(destDir, txtFile))).toBe(false);
    });

    it('should return empty result when no .docx files found', async () => {
      const txtFile = 'readme.txt';
      fs.writeFileSync(path.join(sourceDir, txtFile), 'Text content');

      const result = await copyDocxFiles(sourceDir, destDir);

      expect(result.success).toBe(true);
      expect(result.totalFiles).toBe(0);
      expect(result.successfulCopies).toBe(0);
      expect(result.failedCopies).toBe(0);
    });

    it('should throw error for non-existent source directory', async () => {
      const nonExistentDir = path.join(testDir, 'nonexistent');

      await expect(copyDocxFiles(nonExistentDir, destDir)).rejects.toThrow(FileCopyError);
      await expect(copyDocxFiles(nonExistentDir, destDir)).rejects.toThrow('does not exist');
    });

    it('should throw error when source is not a directory', async () => {
      const sourceFile = path.join(sourceDir, 'test.txt');
      fs.writeFileSync(sourceFile, 'Content');

      await expect(copyDocxFiles(sourceFile, destDir)).rejects.toThrow(FileCopyError);
      await expect(copyDocxFiles(sourceFile, destDir)).rejects.toThrow('not a directory');
    });

    it('should handle case-insensitive .docx extension', async () => {
      const files = ['document1.DOCX', 'document2.Docx', 'document3.docx'];

      files.forEach((file) => {
        fs.writeFileSync(path.join(sourceDir, file), 'DOCX content');
      });

      const result = await copyDocxFiles(sourceDir, destDir);

      expect(result.success).toBe(true);
      expect(result.totalFiles).toBe(3);
    });

    it('should report progress via callback', async () => {
      const docxFiles = ['document1.docx', 'document2.docx'];

      docxFiles.forEach((file) => {
        fs.writeFileSync(path.join(sourceDir, file), 'DOCX content');
      });

      const progressUpdates: CopyProgress[] = [];
      const onProgress = (progress: CopyProgress) => {
        progressUpdates.push(progress);
      };

      await copyDocxFiles(sourceDir, destDir, { onProgress });

      expect(progressUpdates).toHaveLength(2);
    });
  });

  // ============================================================================
  // IS FILE READABLE
  // ============================================================================

  describe('isFileReadable', () => {
    it('should return true for readable file', async () => {
      const file = path.join(sourceDir, 'test.txt');
      fs.writeFileSync(file, 'Content');

      const result = await isFileReadable(file);

      expect(result).toBe(true);
    });

    it('should return false for non-existent file', async () => {
      const file = path.join(sourceDir, 'nonexistent.txt');

      const result = await isFileReadable(file);

      expect(result).toBe(false);
    });

    it('should return false for directory', async () => {
      const result = await isFileReadable(sourceDir);

      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // IS DIRECTORY WRITABLE
  // ============================================================================

  describe('isDirectoryWritable', () => {
    it('should return true for writable directory', async () => {
      const result = await isDirectoryWritable(destDir);

      expect(result).toBe(true);
    });

    it('should return false for non-existent directory', async () => {
      const dir = path.join(testDir, 'nonexistent');

      const result = await isDirectoryWritable(dir);

      expect(result).toBe(false);
    });

    it('should return false for file', async () => {
      const file = path.join(sourceDir, 'test.txt');
      fs.writeFileSync(file, 'Content');

      const result = await isDirectoryWritable(file);

      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // GET FILE SIZE
  // ============================================================================

  describe('getFileSize', () => {
    it('should return correct file size', async () => {
      const file = path.join(sourceDir, 'test.txt');
      const content = 'Test content';
      fs.writeFileSync(file, content);

      const size = await getFileSize(file);

      expect(size).toBe(content.length);
    });

    it('should throw error for non-existent file', async () => {
      const file = path.join(sourceDir, 'nonexistent.txt');

      await expect(getFileSize(file)).rejects.toThrow(FileCopyError);
    });

    it('should throw error for directory', async () => {
      await expect(getFileSize(sourceDir)).rejects.toThrow(FileCopyError);
      await expect(getFileSize(sourceDir)).rejects.toThrow('not a file');
    });
  });

  // ============================================================================
  // ENSURE DIRECTORY EXISTS
  // ============================================================================

  describe('ensureDirectoryExists', () => {
    it('should create directory if it does not exist', async () => {
      const newDir = path.join(testDir, 'new-directory');

      await ensureDirectoryExists(newDir);

      expect(fs.existsSync(newDir)).toBe(true);
    });

    it('should create nested directories', async () => {
      const newDir = path.join(testDir, 'level1', 'level2', 'level3');

      await ensureDirectoryExists(newDir);

      expect(fs.existsSync(newDir)).toBe(true);
    });

    it('should not throw error if directory already exists', async () => {
      await expect(ensureDirectoryExists(sourceDir)).resolves.not.toThrow();
    });

    it('should throw error if path exists but is not a directory', async () => {
      const file = path.join(sourceDir, 'test.txt');
      fs.writeFileSync(file, 'Content');

      await expect(ensureDirectoryExists(file)).rejects.toThrow(FileCopyError);
      await expect(ensureDirectoryExists(file)).rejects.toThrow('not a directory');
    });
  });

  // ============================================================================
  // FILE COPY ERROR
  // ============================================================================

  describe('FileCopyError', () => {
    it('should create error with message', () => {
      const error = new FileCopyError('Test error message');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(FileCopyError);
      expect(error.message).toBe('Test error message');
      expect(error.name).toBe('FileCopyError');
      expect(error.cause).toBeUndefined();
    });

    it('should create error with message and cause', () => {
      const cause = new Error('Original error');
      const error = new FileCopyError('Test error message', cause);

      expect(error.message).toBe('Test error message');
      expect(error.cause).toBe(cause);
      expect(error.cause?.message).toBe('Original error');
    });

    it('should be throwable and catchable', () => {
      expect(() => {
        throw new FileCopyError('Test error');
      }).toThrow(FileCopyError);
      expect(() => {
        throw new FileCopyError('Test error');
      }).toThrow('Test error');
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle files with special characters in names', async () => {
      const specialNames = ['file with spaces.txt', 'file-with-dashes.txt', 'file_with_underscores.txt'];

      for (const name of specialNames) {
        const sourceFile = path.join(sourceDir, name);
        const destFile = path.join(destDir, name);
        fs.writeFileSync(sourceFile, 'Content');

        await copyFile(sourceFile, destFile);

        expect(fs.existsSync(destFile)).toBe(true);
      }
    });

    it('should handle empty files', async () => {
      const sourceFile = path.join(sourceDir, 'empty.txt');
      const destFile = path.join(destDir, 'empty.txt');
      fs.writeFileSync(sourceFile, '');

      await copyFile(sourceFile, destFile);

      expect(fs.existsSync(destFile)).toBe(true);
      expect(fs.readFileSync(destFile, 'utf-8')).toBe('');
    });

    it('should handle large files', async () => {
      const sourceFile = path.join(sourceDir, 'large.txt');
      const destFile = path.join(destDir, 'large.txt');
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB

      fs.writeFileSync(sourceFile, largeContent);

      await copyFile(sourceFile, destFile);

      expect(fs.existsSync(destFile)).toBe(true);
      expect(fs.readFileSync(destFile, 'utf-8')).toBe(largeContent);
    });

    it('should handle binary files', async () => {
      const sourceFile = path.join(sourceDir, 'binary.bin');
      const destFile = path.join(destDir, 'binary.bin');
      const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd, 0xfc]);

      fs.writeFileSync(sourceFile, binaryContent);

      await copyFile(sourceFile, destFile);

      expect(fs.existsSync(destFile)).toBe(true);
      expect(Buffer.compare(fs.readFileSync(destFile), binaryContent)).toBe(0);
    });
  });
});