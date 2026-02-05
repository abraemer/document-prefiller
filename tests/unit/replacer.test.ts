/**
 * Unit tests for Replacer Service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { replaceMarkers, processDocuments, processDocumentsBatch, processDocumentsWithProgress, ReplacementError, type BatchProgress } from '../../src/main/services/replacer';
import type { ReplacementRequest } from '../../src/shared/types/data-models';

// Mock the file module with actual file copying
vi.mock('../../src/main/utils/file', () => ({
  copyDocxFiles: vi.fn(async (sourceDir: string, outputDir: string, options?: { overwrite?: boolean; preserveMetadata?: boolean; onProgress?: (progress: { currentFile: string; currentFileIndex: number; totalFiles: number; percentage: number }) => void }) => {
    // Actually copy the files for testing
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const files = await fs.readdir(sourceDir);
    const docxFiles = files.filter(f => f.endsWith('.docx'));
    
    const copiedFiles: string[] = [];
    for (let i = 0; i < docxFiles.length; i++) {
      const file = docxFiles[i];
      const sourcePath = path.join(sourceDir, file);
      const destPath = path.join(outputDir, file);
      await fs.copyFile(sourcePath, destPath);
      copiedFiles.push(file);
      
      // Call progress callback if provided
      if (options?.onProgress) {
        options.onProgress({
          currentFile: file,
          currentFileIndex: i + 1,
          totalFiles: docxFiles.length,
          percentage: ((i + 1) / docxFiles.length) * 100
        });
      }
    }
    
    return {
      success: true,
      copied: copiedFiles.length,
      failed: 0,
      copiedFiles,
      failedFiles: []
    };
  })
}));

describe('Replacer Service', () => {
  const testDir = path.join(process.cwd(), 'tests', 'temp-replacer');
  const sourceDir = path.join(testDir, 'source');
  const outputDir = path.join(testDir, 'output');

  beforeEach(async () => {
    // Create test directories
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directories
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('replaceMarkers', () => {
    it('should replace simple markers in a single text run', async () => {
      // Create a test .docx file with simple markers
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>Hello REPLACEME-NAME, welcome to REPLACEME-COMPANY!</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = path.join(sourceDir, 'test.docx');
      await createTestDocx(docxPath, xmlContent);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: {
          NAME: 'John Doe',
          COMPANY: 'Acme Corp'
        },
        prefix: 'REPLACEME-'
      };

      const result = await replaceMarkers(request);

      expect(result.success).toBe(true);
      expect(result.processed).toBe(1);
      expect(result.errors).toBe(0);

      // Verify the output file
      const outputPath = path.join(outputDir, 'test.docx');
      const modifiedXml = await extractDocumentXml(outputPath);
      
      expect(modifiedXml).toContain('Hello John Doe');
      expect(modifiedXml).toContain('welcome to Acme Corp');
      expect(modifiedXml).not.toContain('REPLACEME-NAME');
      expect(modifiedXml).not.toContain('REPLACEME-COMPANY');
    });

    it('should replace fragmented markers across multiple text runs', async () => {
      // Create a test .docx file with fragmented markers
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>Hello </w:t>
        <w:t>REPLACE</w:t>
        <w:t>ME-</w:t>
        <w:t>NAME</w:t>
        <w:t>!</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = path.join(sourceDir, 'fragmented.docx');
      await createTestDocx(docxPath, xmlContent);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: {
          NAME: 'Jane Smith'
        },
        prefix: 'REPLACEME-'
      };

      const result = await replaceMarkers(request);

      expect(result.success).toBe(true);
      expect(result.processed).toBe(1);

      // Verify the output file
      const outputPath = path.join(outputDir, 'fragmented.docx');
      const modifiedXml = await extractDocumentXml(outputPath);
      
      expect(modifiedXml).toContain('Jane Smith');
      expect(modifiedXml).not.toContain('REPLACEME-NAME');
    });

    it('should handle empty replacement values by removing markers', async () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>Name: REPLACEME-NAME</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = path.join(sourceDir, 'empty.docx');
      await createTestDocx(docxPath, xmlContent);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: {
          NAME: ''
        },
        prefix: 'REPLACEME-'
      };

      const result = await replaceMarkers(request);

      expect(result.success).toBe(true);

      // Verify the marker is removed
      const outputPath = path.join(outputDir, 'empty.docx');
      const modifiedXml = await extractDocumentXml(outputPath);
      
      expect(modifiedXml).toContain('Name: ');
      expect(modifiedXml).not.toContain('REPLACEME-NAME');
    });

    it('should handle special characters in replacement values', async () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>Text: REPLACEME-SPECIAL</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = path.join(sourceDir, 'special.docx');
      await createTestDocx(docxPath, xmlContent);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: {
          SPECIAL: '<>&"\''
        },
        prefix: 'REPLACEME-'
      };

      const result = await replaceMarkers(request);

      expect(result.success).toBe(true);

      // Verify special characters are escaped
      const outputPath = path.join(outputDir, 'special.docx');
      const modifiedXml = await extractDocumentXml(outputPath);
      
      expect(modifiedXml).toContain('&lt;&gt;&amp;&quot;&apos;');
    });

    it('should handle multiple occurrences of the same marker', async () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>REPLACEME-WORD appears here and REPLACEME-WORD appears again</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = path.join(sourceDir, 'multiple.docx');
      await createTestDocx(docxPath, xmlContent);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: {
          WORD: 'TEST'
        },
        prefix: 'REPLACEME-'
      };

      const result = await replaceMarkers(request);

      expect(result.success).toBe(true);

      // Verify all occurrences are replaced
      const outputPath = path.join(outputDir, 'multiple.docx');
      const modifiedXml = await extractDocumentXml(outputPath);
      
      expect(modifiedXml).toContain('TEST appears here and TEST appears again');
      expect(modifiedXml).not.toContain('REPLACEME-WORD');
    });

    it('should throw error if source folder does not exist', async () => {
      const request: ReplacementRequest = {
        sourceFolder: '/nonexistent/folder',
        outputFolder: outputDir,
        values: {},
        prefix: 'REPLACEME-'
      };

      await expect(replaceMarkers(request)).rejects.toThrow(ReplacementError);
      await expect(replaceMarkers(request)).rejects.toThrow('Source folder not accessible');
    });

    it('should handle empty source folder gracefully', async () => {
      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: {},
        prefix: 'REPLACEME-'
      };

      const result = await replaceMarkers(request);

      expect(result.success).toBe(true);
      expect(result.processed).toBe(0);
      expect(result.errors).toBe(0);
    });

    it('should handle malformed .docx files gracefully', async () => {
      // Create an invalid .docx file (not a valid ZIP)
      const invalidPath = path.join(sourceDir, 'invalid.docx');
      await fs.writeFile(invalidPath, 'This is not a valid .docx file');

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: { NAME: 'Test' },
        prefix: 'REPLACEME-'
      };

      const result = await replaceMarkers(request);

      expect(result.success).toBe(false);
      expect(result.errors).toBe(1);
      expect(result.failedDocuments).toHaveLength(1);
      expect(result.failedDocuments[0].path).toContain('invalid.docx');
    });

    it('should process multiple documents in batch', async () => {
      // Create multiple test documents
      const xmlContent1 = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Doc 1: REPLACEME-NAME</w:t></w:r></w:p>
  </w:body>
</w:document>`;

      const xmlContent2 = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Doc 2: REPLACEME-NAME</w:t></w:r></w:p>
  </w:body>
</w:document>`;

      await createTestDocx(path.join(sourceDir, 'doc1.docx'), xmlContent1);
      await createTestDocx(path.join(sourceDir, 'doc2.docx'), xmlContent2);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: { NAME: 'Alice' },
        prefix: 'REPLACEME-'
      };

      const result = await replaceMarkers(request);

      expect(result.success).toBe(true);
      expect(result.processed).toBe(2);
      expect(result.errors).toBe(0);
      expect(result.processedDocuments).toHaveLength(2);
    });

    it('should handle progress callback', async () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Test</w:t></w:r></w:p>
  </w:body>
</w:document>`;

      await createTestDocx(path.join(sourceDir, 'test.docx'), xmlContent);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: {},
        prefix: 'REPLACEME-'
      };

      const progressUpdates: Array<{ progress: number; currentItem?: string }> = [];
      const onProgress = (progress: { operation: 'replace'; progress: number; currentItem?: string }) => {
        progressUpdates.push({ progress: progress.progress, currentItem: progress.currentItem });
      };

      await replaceMarkers(request, onProgress);

      expect(progressUpdates.length).toBeGreaterThan(0);
    });
  });

  describe('processDocuments', () => {
    it('should be an alias for replaceMarkers', async () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>REPLACEME-TEST</w:t></w:r></w:p>
  </w:body>
</w:document>`;

      await createTestDocx(path.join(sourceDir, 'test.docx'), xmlContent);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: { TEST: 'Success' },
        prefix: 'REPLACEME-'
      };

      const result = await processDocuments(request);

      expect(result.success).toBe(true);
      expect(result.processed).toBe(1);
    });
  });

  describe('Formatting Preservation', () => {
    it('should preserve bold formatting during replacement', async () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr>
          <w:b/>
        </w:rPr>
        <w:t>REPLACEME-NAME</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = path.join(sourceDir, 'bold.docx');
      await createTestDocx(docxPath, xmlContent);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: { NAME: 'John Doe' },
        prefix: 'REPLACEME-'
      };

      await replaceMarkers(request);

      const outputPath = path.join(outputDir, 'bold.docx');
      const modifiedXml = await extractDocumentXml(outputPath);

      // Verify text is replaced
      expect(modifiedXml).toContain('John Doe');
      expect(modifiedXml).not.toContain('REPLACEME-NAME');

      // Verify bold formatting is preserved
      expect(modifiedXml).toContain('<w:b/>');
    });

    it('should preserve italic formatting during replacement', async () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr>
          <w:i/>
        </w:rPr>
        <w:t>REPLACEME-NAME</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = path.join(sourceDir, 'italic.docx');
      await createTestDocx(docxPath, xmlContent);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: { NAME: 'Jane Smith' },
        prefix: 'REPLACEME-'
      };

      await replaceMarkers(request);

      const outputPath = path.join(outputDir, 'italic.docx');
      const modifiedXml = await extractDocumentXml(outputPath);

      // Verify text is replaced
      expect(modifiedXml).toContain('Jane Smith');
      expect(modifiedXml).not.toContain('REPLACEME-NAME');

      // Verify italic formatting is preserved
      expect(modifiedXml).toContain('<w:i/>');
    });

    it('should preserve underline formatting during replacement', async () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr>
          <w:u w:val="single"/>
        </w:rPr>
        <w:t>REPLACEME-NAME</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = path.join(sourceDir, 'underline.docx');
      await createTestDocx(docxPath, xmlContent);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: { NAME: 'Bob Johnson' },
        prefix: 'REPLACEME-'
      };

      await replaceMarkers(request);

      const outputPath = path.join(outputDir, 'underline.docx');
      const modifiedXml = await extractDocumentXml(outputPath);

      // Verify text is replaced
      expect(modifiedXml).toContain('Bob Johnson');
      expect(modifiedXml).not.toContain('REPLACEME-NAME');

      // Verify underline formatting is preserved
      expect(modifiedXml).toContain('<w:u w:val="single"/>');
    });

    it('should preserve font size during replacement', async () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr>
          <w:sz w:val="28"/>
        </w:rPr>
        <w:t>REPLACEME-NAME</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = path.join(sourceDir, 'fontsize.docx');
      await createTestDocx(docxPath, xmlContent);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: { NAME: 'Alice Williams' },
        prefix: 'REPLACEME-'
      };

      await replaceMarkers(request);

      const outputPath = path.join(outputDir, 'fontsize.docx');
      const modifiedXml = await extractDocumentXml(outputPath);

      // Verify text is replaced
      expect(modifiedXml).toContain('Alice Williams');
      expect(modifiedXml).not.toContain('REPLACEME-NAME');

      // Verify font size is preserved
      expect(modifiedXml).toContain('<w:sz w:val="28"/>');
    });

    it('should preserve font color during replacement', async () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr>
          <w:color w:val="FF0000"/>
        </w:rPr>
        <w:t>REPLACEME-NAME</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = path.join(sourceDir, 'color.docx');
      await createTestDocx(docxPath, xmlContent);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: { NAME: 'Charlie Brown' },
        prefix: 'REPLACEME-'
      };

      await replaceMarkers(request);

      const outputPath = path.join(outputDir, 'color.docx');
      const modifiedXml = await extractDocumentXml(outputPath);

      // Verify text is replaced
      expect(modifiedXml).toContain('Charlie Brown');
      expect(modifiedXml).not.toContain('REPLACEME-NAME');

      // Verify font color is preserved
      expect(modifiedXml).toContain('<w:color w:val="FF0000"/>');
    });

    it('should preserve multiple formatting properties during replacement', async () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:i/>
          <w:u w:val="single"/>
          <w:sz w:val="32"/>
          <w:color w:val="0000FF"/>
        </w:rPr>
        <w:t>REPLACEME-NAME</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = path.join(sourceDir, 'multiple-formatting.docx');
      await createTestDocx(docxPath, xmlContent);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: { NAME: 'David Lee' },
        prefix: 'REPLACEME-'
      };

      await replaceMarkers(request);

      const outputPath = path.join(outputDir, 'multiple-formatting.docx');
      const modifiedXml = await extractDocumentXml(outputPath);

      // Verify text is replaced
      expect(modifiedXml).toContain('David Lee');
      expect(modifiedXml).not.toContain('REPLACEME-NAME');

      // Verify all formatting is preserved
      expect(modifiedXml).toContain('<w:b/>');
      expect(modifiedXml).toContain('<w:i/>');
      expect(modifiedXml).toContain('<w:u w:val="single"/>');
      expect(modifiedXml).toContain('<w:sz w:val="32"/>');
      expect(modifiedXml).toContain('<w:color w:val="0000FF"/>');
    });

    it('should preserve paragraph formatting during replacement', async () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
      </w:pPr>
      <w:r>
        <w:t>REPLACEME-NAME</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = path.join(sourceDir, 'paragraph.docx');
      await createTestDocx(docxPath, xmlContent);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: { NAME: 'Emma Wilson' },
        prefix: 'REPLACEME-'
      };

      await replaceMarkers(request);

      const outputPath = path.join(outputDir, 'paragraph.docx');
      const modifiedXml = await extractDocumentXml(outputPath);

      // Verify text is replaced
      expect(modifiedXml).toContain('Emma Wilson');
      expect(modifiedXml).not.toContain('REPLACEME-NAME');

      // Verify paragraph formatting is preserved
      expect(modifiedXml).toContain('<w:jc w:val="center"/>');
    });

    it('should preserve document structure (multiple paragraphs)', async () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>First paragraph with REPLACEME-NAME</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Second paragraph with REPLACEME-COMPANY</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Third paragraph with REPLACEME-DATE</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = path.join(sourceDir, 'structure.docx');
      await createTestDocx(docxPath, xmlContent);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: {
          NAME: 'John Doe',
          COMPANY: 'Acme Corp',
          DATE: '2024-01-15'
        },
        prefix: 'REPLACEME-'
      };

      await replaceMarkers(request);

      const outputPath = path.join(outputDir, 'structure.docx');
      const modifiedXml = await extractDocumentXml(outputPath);

      // Verify all text is replaced
      expect(modifiedXml).toContain('First paragraph with John Doe');
      expect(modifiedXml).toContain('Second paragraph with Acme Corp');
      expect(modifiedXml).toContain('Third paragraph with 2024-01-15');
      expect(modifiedXml).not.toContain('REPLACEME-NAME');
      expect(modifiedXml).not.toContain('REPLACEME-COMPANY');
      expect(modifiedXml).not.toContain('REPLACEME-DATE');

      // Verify document structure is preserved (3 paragraphs)
      const paragraphMatches = modifiedXml.match(/<w:p>/g);
      expect(paragraphMatches).toHaveLength(3);
    });

    it('should preserve formatting in fragmented text runs within a single run', async () => {
      // Test fragmented markers within a single <w:r> element (multiple <w:t> tags)
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:i/>
        </w:rPr>
        <w:t>REPLACE</w:t>
        <w:t>ME-</w:t>
        <w:t>NAME</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = path.join(sourceDir, 'fragmented-formatting.docx');
      await createTestDocx(docxPath, xmlContent);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: { NAME: 'Frank Miller' },
        prefix: 'REPLACEME-'
      };

      await replaceMarkers(request);

      const outputPath = path.join(outputDir, 'fragmented-formatting.docx');
      const modifiedXml = await extractDocumentXml(outputPath);

      // Verify text is replaced
      expect(modifiedXml).toContain('Frank Miller');
      expect(modifiedXml).not.toContain('REPLACEME-NAME');

      // Note: When fragmented markers are replaced, the text is consolidated into a single run
      // The first run's formatting is preserved
      expect(modifiedXml).toContain('<w:b/>');
      expect(modifiedXml).toContain('<w:i/>');
    });

    it('should preserve formatting when marker is part of mixed content', async () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr>
          <w:b/>
        </w:rPr>
        <w:t>Hello </w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:i/>
        </w:rPr>
        <w:t>REPLACEME-NAME</w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:b/>
        </w:rPr>
        <w:t>, welcome!</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = path.join(sourceDir, 'mixed-content.docx');
      await createTestDocx(docxPath, xmlContent);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: { NAME: 'Grace Kim' },
        prefix: 'REPLACEME-'
      };

      await replaceMarkers(request);

      const outputPath = path.join(outputDir, 'mixed-content.docx');
      const modifiedXml = await extractDocumentXml(outputPath);

      // Verify text is replaced
      expect(modifiedXml).toContain('Grace Kim');
      expect(modifiedXml).not.toContain('REPLACEME-NAME');

      // Verify formatting of surrounding text is preserved
      expect(modifiedXml).toContain('Hello ');
      expect(modifiedXml).toContain(', welcome!');
      expect(modifiedXml).toContain('<w:b/>');
      expect(modifiedXml).toContain('<w:i/>');
    });

    it('should preserve font family during replacement', async () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>
        </w:rPr>
        <w:t>REPLACEME-NAME</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = path.join(sourceDir, 'fontfamily.docx');
      await createTestDocx(docxPath, xmlContent);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: { NAME: 'Henry Zhang' },
        prefix: 'REPLACEME-'
      };

      await replaceMarkers(request);

      const outputPath = path.join(outputDir, 'fontfamily.docx');
      const modifiedXml = await extractDocumentXml(outputPath);

      // Verify text is replaced
      expect(modifiedXml).toContain('Henry Zhang');
      expect(modifiedXml).not.toContain('REPLACEME-NAME');

      // Verify font family is preserved
      expect(modifiedXml).toContain('<w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>');
    });

    it('should preserve text spacing attributes', async () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t xml:space="preserve">REPLACEME-NAME</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

      const docxPath = path.join(sourceDir, 'spacing.docx');
      await createTestDocx(docxPath, xmlContent);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: { NAME: 'Ivy Chen' },
        prefix: 'REPLACEME-'
      };

      await replaceMarkers(request);

      const outputPath = path.join(outputDir, 'spacing.docx');
      const modifiedXml = await extractDocumentXml(outputPath);

      // Verify text is replaced
      expect(modifiedXml).toContain('Ivy Chen');
      expect(modifiedXml).not.toContain('REPLACEME-NAME');

      // Verify xml:space attribute is preserved
      expect(modifiedXml).toContain('xml:space="preserve"');
    });
  });

  describe('ReplacementError', () => {
    it('should create error with message', () => {
      const error = new ReplacementError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('ReplacementError');
    });

    it('should create error with cause', () => {
      const cause = new Error('Original error');
      const error = new ReplacementError('Test error', cause);
      expect(error.message).toBe('Test error');
      expect(error.cause).toBe(cause);
    });
  });

  describe('Batch Document Processing', () => {
    it('should process multiple documents in batch with detailed progress', async () => {
      // Create multiple test documents
      const xmlContent1 = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Doc 1: REPLACEME-NAME</w:t></w:r></w:p>
  </w:body>
</w:document>`;

      const xmlContent2 = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Doc 2: REPLACEME-NAME</w:t></w:r></w:p>
  </w:body>
</w:document>`;

      const xmlContent3 = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Doc 3: REPLACEME-NAME</w:t></w:r></w:p>
  </w:body>
</w:document>`;

      await createTestDocx(path.join(sourceDir, 'doc1.docx'), xmlContent1);
      await createTestDocx(path.join(sourceDir, 'doc2.docx'), xmlContent2);
      await createTestDocx(path.join(sourceDir, 'doc3.docx'), xmlContent3);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: { NAME: 'Alice' },
        prefix: 'REPLACEME-'
      };

      const progressUpdates: BatchProgress[] = [];
      const onProgress = (progress: BatchProgress) => {
        progressUpdates.push(progress);
      };

      const result = await processDocumentsBatch(request, onProgress);

      expect(result.success).toBe(true);
      expect(result.processed).toBe(3);
      expect(result.errors).toBe(0);
      expect(result.processedDocuments).toHaveLength(3);

      // Verify progress tracking
      expect(progressUpdates.length).toBeGreaterThan(0);
      
      // Check that we have all phases
      const phases = progressUpdates.map(p => p.phase);
      expect(phases).toContain('copying');
      expect(phases).toContain('processing');
      expect(phases).toContain('complete');

      // Check that progress goes from 0 to 100
      const progressValues = progressUpdates.map(p => p.progress);
      expect(Math.min(...progressValues)).toBe(0);
      expect(Math.max(...progressValues)).toBe(100);

      // Verify all documents were processed
      const outputPath1 = path.join(outputDir, 'doc1.docx');
      const outputPath2 = path.join(outputDir, 'doc2.docx');
      const outputPath3 = path.join(outputDir, 'doc3.docx');

      const modifiedXml1 = await extractDocumentXml(outputPath1);
      const modifiedXml2 = await extractDocumentXml(outputPath2);
      const modifiedXml3 = await extractDocumentXml(outputPath3);

      expect(modifiedXml1).toContain('Alice');
      expect(modifiedXml2).toContain('Alice');
      expect(modifiedXml3).toContain('Alice');
    });

    it('should handle individual document failures gracefully in batch', async () => {
      // Create valid and invalid documents
      const xmlContent1 = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Valid: REPLACEME-NAME</w:t></w:r></w:p>
  </w:body>
</w:document>`;

      await createTestDocx(path.join(sourceDir, 'valid.docx'), xmlContent1);
      
      // Create an invalid .docx file (not a valid ZIP)
      const invalidPath = path.join(sourceDir, 'invalid.docx');
      await fs.writeFile(invalidPath, 'This is not a valid .docx file');

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: { NAME: 'Test' },
        prefix: 'REPLACEME-'
      };

      const result = await processDocumentsBatch(request);

      expect(result.success).toBe(false);
      expect(result.processed).toBe(1);
      expect(result.errors).toBe(1);
      expect(result.processedDocuments).toHaveLength(1);
      expect(result.failedDocuments).toHaveLength(1);
      expect(result.failedDocuments[0].path).toContain('invalid.docx');
    });

    it('should handle empty folder in batch processing', async () => {
      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: {},
        prefix: 'REPLACEME-'
      };

      const progressUpdates: BatchProgress[] = [];
      const onProgress = (progress: BatchProgress) => {
        progressUpdates.push(progress);
      };

      const result = await processDocumentsBatch(request, onProgress);

      expect(result.success).toBe(true);
      expect(result.processed).toBe(0);
      expect(result.errors).toBe(0);

      // Verify progress was reported
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1].phase).toBe('complete');
    });

    it('should track progress through all phases', async () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Test: REPLACEME-NAME</w:t></w:r></w:p>
  </w:body>
</w:document>`;

      await createTestDocx(path.join(sourceDir, 'test.docx'), xmlContent);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: { NAME: 'Bob' },
        prefix: 'REPLACEME-'
      };

      const progressUpdates: BatchProgress[] = [];
      const onProgress = (progress: BatchProgress) => {
        progressUpdates.push(progress);
      };

      await processDocumentsBatch(request, onProgress);

      // Verify we have progress updates for each phase
      const copyingUpdates = progressUpdates.filter(p => p.phase === 'copying');
      const processingUpdates = progressUpdates.filter(p => p.phase === 'processing');
      const completeUpdates = progressUpdates.filter(p => p.phase === 'complete');

      expect(copyingUpdates.length).toBeGreaterThan(0);
      expect(processingUpdates.length).toBeGreaterThan(0);
      expect(completeUpdates.length).toBeGreaterThan(0);

      // Verify copying phase progress (0-50%)
      const copyingProgress = copyingUpdates.map(p => p.progress);
      expect(Math.min(...copyingProgress)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...copyingProgress)).toBeLessThanOrEqual(50);

      // Verify processing phase progress (50-100%)
      const processingProgress = processingUpdates.map(p => p.progress);
      expect(Math.min(...processingProgress)).toBeGreaterThanOrEqual(50);
      expect(Math.max(...processingProgress)).toBeLessThanOrEqual(100);

      // Verify complete phase is at 100%
      expect(completeUpdates[0].progress).toBe(100);
    });

    it('should report current item and completion count in progress', async () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Test: REPLACEME-NAME</w:t></w:r></w:p>
  </w:body>
</w:document>`;

      await createTestDocx(path.join(sourceDir, 'test.docx'), xmlContent);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: { NAME: 'Charlie' },
        prefix: 'REPLACEME-'
      };

      const progressUpdates: BatchProgress[] = [];
      const onProgress = (progress: BatchProgress) => {
        progressUpdates.push(progress);
      };

      await processDocumentsBatch(request, onProgress);

      // Check that progress updates include current item
      const updatesWithItem = progressUpdates.filter(p => p.currentItem);
      expect(updatesWithItem.length).toBeGreaterThan(0);

      // Check that total and completed are set
      const processingUpdates = progressUpdates.filter(p => p.phase === 'processing');
      expect(processingUpdates[0].total).toBe(1);
      expect(processingUpdates[processingUpdates.length - 1].completed).toBe(1);
    });

    it('should report errors in progress updates', async () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Valid: REPLACEME-NAME</w:t></w:r></w:p>
  </w:body>
</w:document>`;

      await createTestDocx(path.join(sourceDir, 'valid.docx'), xmlContent);
      
      // Create an invalid .docx file
      const invalidPath = path.join(sourceDir, 'invalid.docx');
      await fs.writeFile(invalidPath, 'Invalid content');

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: { NAME: 'Test' },
        prefix: 'REPLACEME-'
      };

      const progressUpdates: BatchProgress[] = [];
      const onProgress = (progress: BatchProgress) => {
        progressUpdates.push(progress);
      };

      await processDocumentsBatch(request, onProgress);

      // Check that errors are reported in progress
      const updatesWithErrors = progressUpdates.filter(p => p.errors && p.errors > 0);
      expect(updatesWithErrors.length).toBeGreaterThan(0);
      expect(updatesWithErrors[0].errors).toBe(1);
    });

    it('should process large batch efficiently', async () => {
      // Create 10 documents to test efficiency
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Document: REPLACEME-NAME</w:t></w:r></w:p>
  </w:body>
</w:document>`;

      for (let i = 1; i <= 10; i++) {
        await createTestDocx(path.join(sourceDir, `doc${i}.docx`), xmlContent);
      }

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: { NAME: 'Batch Test' },
        prefix: 'REPLACEME-'
      };

      const startTime = Date.now();
      const result = await processDocumentsBatch(request);
      const endTime = Date.now();

      expect(result.success).toBe(true);
      expect(result.processed).toBe(10);
      expect(result.errors).toBe(0);

      // Verify all documents were processed
      for (let i = 1; i <= 10; i++) {
        const outputPath = path.join(outputDir, `doc${i}.docx`);
        const modifiedXml = await extractDocumentXml(outputPath);
        expect(modifiedXml).toContain('Batch Test');
      }

      // Processing should complete in reasonable time (less than 5 seconds for 10 docs)
      expect(endTime - startTime).toBeLessThan(5000);
    });

    it('should aggregate results from all documents', async () => {
      const xmlContent1 = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Doc 1: REPLACEME-NAME</w:t></w:r></w:p>
  </w:body>
</w:document>`;

      const xmlContent2 = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Doc 2: REPLACEME-NAME</w:t></w:r></w:p>
  </w:body>
</w:document>`;

      await createTestDocx(path.join(sourceDir, 'doc1.docx'), xmlContent1);
      await createTestDocx(path.join(sourceDir, 'doc2.docx'), xmlContent2);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: { NAME: 'Aggregated' },
        prefix: 'REPLACEME-'
      };

      const result = await processDocumentsBatch(request);

      expect(result.processedDocuments).toHaveLength(2);
      expect(result.processedDocuments[0]).toContain('doc1.docx');
      expect(result.processedDocuments[1]).toContain('doc2.docx');
      expect(result.failedDocuments).toHaveLength(0);
    });
  });

  describe('processDocumentsWithProgress', () => {
    it('should be an alias for processDocumentsBatch', async () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Test: REPLACEME-NAME</w:t></w:r></w:p>
  </w:body>
</w:document>`;

      await createTestDocx(path.join(sourceDir, 'test.docx'), xmlContent);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: { NAME: 'Progress Test' },
        prefix: 'REPLACEME-'
      };

      const result = await processDocumentsWithProgress(request);

      expect(result.success).toBe(true);
      expect(result.processed).toBe(1);
    });

    it('should support progress callback', async () => {
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Test: REPLACEME-NAME</w:t></w:r></w:p>
  </w:body>
</w:document>`;

      await createTestDocx(path.join(sourceDir, 'test.docx'), xmlContent);

      const request: ReplacementRequest = {
        sourceFolder: sourceDir,
        outputFolder: outputDir,
        values: { NAME: 'Progress Test' },
        prefix: 'REPLACEME-'
      };

      const progressUpdates: BatchProgress[] = [];
      const onProgress = (progress: BatchProgress) => {
        progressUpdates.push(progress);
      };

      await processDocumentsWithProgress(request, onProgress);

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1].phase).toBe('complete');
    });
  });
});

/**
 * Helper function to create a test .docx file
 */
async function createTestDocx(filePath: string, documentXml: string): Promise<void> {
  const zip = new JSZip();

  // Add required .docx structure
  zip.file('word/document.xml', documentXml);
  
  // Add minimal content types
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  // Add minimal relationships
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  // Generate and write the file
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(filePath, buffer);
}

/**
 * Helper function to extract document.xml from a .docx file
 */
async function extractDocumentXml(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = zip.file('word/document.xml');
  
  if (!documentXml) {
    throw new Error('word/document.xml not found in .docx file');
  }

  return await documentXml.async('string');
}
