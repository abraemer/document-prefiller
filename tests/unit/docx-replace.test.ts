/**
 * Unit tests for the platform-neutral docx replace round-trip
 * (src/core/docx-replace.ts) and its filesystem wrapper
 * (src/main/services/replacer.ts).
 *
 * Locks the extraction contract: identical validation order, byte-identical
 * error messages, and the same errorType mapping the pre-extraction
 * ReplacementError paths produced.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import JSZip from 'jszip';

// Wrap the core round-trip in a spy (default implementation = the real one)
// so contract tests can inject DocxReplaceError rejections for errorTypes
// real bytes cannot reach (read_error, write_error, malformed_marker,
// unknown). DocxReplaceError itself stays the real class, so instanceof
// checks against the wrapper's import keep working.
vi.mock('../../src/core/docx-replace', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/docx-replace')>();
  return {
    ...actual,
    replaceMarkersInDocxBytes: vi.fn(actual.replaceMarkersInDocxBytes),
  };
});

import {
  replaceMarkersInDocxBytes,
  DocxReplaceError,
  type DocxReplaceErrorType,
} from '../../src/core/docx-replace';
import { replaceMarkersInFile, ReplacementError } from '../../src/main/services/replacer';

const MARKER_PREFIX = 'REPLACEME-';
const VALUES = { NAME: 'Test' };

const VALID_DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Hello REPLACEME-NAME, welcome!</w:t></w:r></w:p>
  </w:body>
</w:document>`;

async function buildDocxBytes(documentXml: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('word/document.xml', documentXml);
  return await zip.generateAsync({ type: 'uint8array' });
}

async function buildZipWithoutDocumentXml(fileNames: string[]): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const fileName of fileNames) {
    zip.file(fileName, '<placeholder/>');
  }
  return await zip.generateAsync({ type: 'uint8array' });
}

async function extractDocumentXml(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const documentXml = zip.file('word/document.xml');
  if (!documentXml) {
    throw new Error('word/document.xml not found in test fixture');
  }
  return await documentXml.async('string');
}

/** Run the core round-trip and return the DocxReplaceError it rejects with. */
async function coreError(bytes: Uint8Array): Promise<DocxReplaceError> {
  let thrown: unknown;
  let rejected = false;
  try {
    await replaceMarkersInDocxBytes(bytes, VALUES, MARKER_PREFIX);
  } catch (error) {
    thrown = error;
    rejected = true;
  }
  if (!rejected || !(thrown instanceof DocxReplaceError)) {
    throw new Error(`expected DocxReplaceError, got: ${String(thrown)}`);
  }
  return thrown;
}

/** Run the fs wrapper and return the ReplacementError it rejects with. */
async function wrappedError(filePath: string): Promise<ReplacementError> {
  let thrown: unknown;
  let rejected = false;
  try {
    await replaceMarkersInFile(filePath, VALUES, MARKER_PREFIX);
  } catch (error) {
    thrown = error;
    rejected = true;
  }
  if (!rejected || !(thrown instanceof ReplacementError)) {
    throw new Error(`expected ReplacementError, got: ${String(thrown)}`);
  }
  return thrown;
}

describe('replaceMarkersInDocxBytes (core round-trip)', () => {
  it('replaces a marker and returns a valid docx as Uint8Array', async () => {
    const bytes = await buildDocxBytes(VALID_DOCUMENT_XML);

    const result = await replaceMarkersInDocxBytes(bytes, { NAME: 'John Doe' }, MARKER_PREFIX);

    expect(result).toBeInstanceOf(Uint8Array);
    const modifiedXml = await extractDocumentXml(result);
    expect(modifiedXml).toContain('Hello John Doe, welcome!');
    expect(modifiedXml).not.toContain('REPLACEME-NAME');
  });

  it('round-trips unchanged when no replacement values are provided', async () => {
    const bytes = await buildDocxBytes(VALID_DOCUMENT_XML);

    const result = await replaceMarkersInDocxBytes(bytes, {}, MARKER_PREFIX);

    expect(await extractDocumentXml(result)).toBe(VALID_DOCUMENT_XML);
  });

  it('rejects a truncated (<4-byte) buffer with the exact file-too-small message', async () => {
    const error = await coreError(new Uint8Array([0x50, 0x4b]));
    expect(error.message).toBe('Invalid .docx file: file too small (2 bytes)');
    expect(error.errorType).toBe('corrupted_file');
  });

  it('rejects a zero-byte buffer with the exact file-too-small message', async () => {
    const error = await coreError(new Uint8Array(0));
    expect(error.message).toBe('Invalid .docx file: file too small (0 bytes)');
    expect(error.errorType).toBe('corrupted_file');
  });

  it('rejects a 3-byte buffer before the PK signature check', async () => {
    const error = await coreError(new Uint8Array([0x50, 0x4b, 0x03]));
    expect(error.message).toBe('Invalid .docx file: file too small (3 bytes)');
    expect(error.errorType).toBe('corrupted_file');
  });

  it('rejects non-ZIP bytes with the exact missing-PK message', async () => {
    const error = await coreError(Buffer.from('This is not a valid .docx file', 'utf8'));
    expect(error.message).toBe('Invalid .docx file: not a valid ZIP archive (missing PK signature)');
    expect(error.errorType).toBe('corrupted_file');
  });

  it('rejects PK-prefixed garbage with the exact corrupted-zip message', async () => {
    const error = await coreError(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(100, 0xff)]));
    expect(error.message).toBe('Failed to parse .docx file: corrupted or invalid ZIP archive');
    expect(error.errorType).toBe('corrupted_file');
  });

  it('rejects a zip without word/document.xml, listing the available entries', async () => {
    const bytes = await buildZipWithoutDocumentXml(['[Content_Types].xml', '_rels/.rels']);
    const error = await coreError(bytes);
    // JSZip adds an implicit '_rels/' directory entry alongside '_rels/.rels';
    // the pre-extraction code listed it the same way.
    expect(error.message).toBe(
      'Invalid .docx file: word/document.xml not found. Available entries: [Content_Types].xml, _rels/, _rels/.rels'
    );
    expect(error.errorType).toBe('missing_file');
  });

  it('rejects an empty zip with the not-found message and an empty entries list', async () => {
    const bytes = await new JSZip().generateAsync({ type: 'uint8array' });
    const error = await coreError(bytes);
    expect(error.message).toBe('Invalid .docx file: word/document.xml not found. Available entries: ');
    expect(error.errorType).toBe('missing_file');
  });

  it('rejects an empty document.xml with the exact empty message', async () => {
    const error = await coreError(await buildDocxBytes(''));
    expect(error.message).toBe('Invalid .docx file: document.xml is empty');
    expect(error.errorType).toBe('invalid_xml');
  });

  it('rejects structureless document.xml with the exact invalid-structure message', async () => {
    const error = await coreError(await buildDocxBytes('This is not valid XML at all'));
    expect(error.message).toBe(
      'Invalid .docx file: document.xml has invalid structure (missing w:document or w:body)'
    );
    expect(error.errorType).toBe('invalid_xml');
  });

  it('rejects document.xml missing w:document with the same invalid-structure message', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<w:body xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:r><w:t>REPLACEME-NAME</w:t></w:r></w:p>
</w:body>`;
    const error = await coreError(await buildDocxBytes(xml));
    expect(error.message).toBe(
      'Invalid .docx file: document.xml has invalid structure (missing w:document or w:body)'
    );
    expect(error.errorType).toBe('invalid_xml');
  });
});

describe('corrupt-bytes regression: wrapper surfaces the byte-identical message', () => {
  const testDir = path.join(process.cwd(), 'tests', 'temp-docx-replace');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  interface CorruptFixture {
    name: string;
    bytes: () => Uint8Array | Promise<Uint8Array>;
    message: string;
    errorType: DocxReplaceErrorType;
  }

  const fixtures: CorruptFixture[] = [
    {
      name: 'zero-byte file',
      bytes: () => new Uint8Array(0),
      message: 'Invalid .docx file: file too small (0 bytes)',
      errorType: 'corrupted_file',
    },
    {
      name: '<4-byte PK-only file',
      bytes: () => new Uint8Array([0x50, 0x4b]),
      message: 'Invalid .docx file: file too small (2 bytes)',
      errorType: 'corrupted_file',
    },
    {
      name: 'non-ZIP text file',
      bytes: () => Buffer.from('This is not a valid .docx file', 'utf8'),
      message: 'Invalid .docx file: not a valid ZIP archive (missing PK signature)',
      errorType: 'corrupted_file',
    },
    {
      name: 'PK-prefixed garbage',
      bytes: () =>
        Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(100, 0xff)]),
      message: 'Failed to parse .docx file: corrupted or invalid ZIP archive',
      errorType: 'corrupted_file',
    },
    {
      name: 'zip missing word/document.xml',
      bytes: () => buildZipWithoutDocumentXml(['[Content_Types].xml', '_rels/.rels']),
      // JSZip adds an implicit '_rels/' directory entry alongside '_rels/.rels';
      // the pre-extraction code listed it the same way.
      message: 'Invalid .docx file: word/document.xml not found. Available entries: [Content_Types].xml, _rels/, _rels/.rels',
      errorType: 'missing_file',
    },
    {
      name: 'empty document.xml',
      bytes: () => buildDocxBytes(''),
      message: 'Invalid .docx file: document.xml is empty',
      errorType: 'invalid_xml',
    },
    {
      name: 'structureless document.xml',
      bytes: () => buildDocxBytes('This is not valid XML at all'),
      message: 'Invalid .docx file: document.xml has invalid structure (missing w:document or w:body)',
      errorType: 'invalid_xml',
    },
  ];

  it.each(fixtures)('$name: core and wrapper messages are identical pre/post-extraction strings', async (fixture) => {
    // Given: a corrupt .docx on disk and the same bytes in memory
    const bytes = await fixture.bytes();
    const filePath = path.join(testDir, 'corrupt.docx');
    await fs.writeFile(filePath, bytes);

    // When: both the core round-trip and the fs wrapper process it
    const fromCore = await coreError(bytes);
    const fromWrapper = await wrappedError(filePath);

    // Then: all three agree — core message, wrapper message, and the exact
    // string the pre-extraction ReplacementError path produced.
    expect(fromCore.message).toBe(fixture.message);
    expect(fromCore.errorType).toBe(fixture.errorType);
    expect(fromWrapper).toBeInstanceOf(ReplacementError);
    expect(fromWrapper.message).toBe(fromCore.message);
    expect(fromWrapper.message).toBe(fixture.message);
    expect(fromWrapper.errorType).toBe(fixture.errorType);
    expect(fromWrapper.filePath).toBe(filePath);
  });

  it('replaces markers in a valid file and writes a docx back to disk', async () => {
    const filePath = path.join(testDir, 'valid.docx');
    await fs.writeFile(filePath, await buildDocxBytes(VALID_DOCUMENT_XML));

    await replaceMarkersInFile(filePath, { NAME: 'Jane Doe' }, MARKER_PREFIX);

    const modifiedXml = await extractDocumentXml(await fs.readFile(filePath));
    expect(modifiedXml).toContain('Hello Jane Doe, welcome!');
    expect(modifiedXml).not.toContain('REPLACEME-NAME');
  });
});

describe('error contract: every core errorType maps to an identical wrapped error', () => {
  const testDir = path.join(process.cwd(), 'tests', 'temp-docx-replace');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(path.join(testDir, 'contract.docx'), await buildDocxBytes(VALID_DOCUMENT_XML));
  });

  afterEach(async () => {
    vi.mocked(replaceMarkersInDocxBytes).mockReset();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  interface ContractCase {
    errorType: DocxReplaceErrorType;
    message: string;
  }

  // All seven errorTypes — including write_error, whose two throw sites
  // (ZIP update + buffer generation) live inside the extracted region.
  const cases: ContractCase[] = [
    { errorType: 'corrupted_file', message: 'Invalid .docx file: file too small (2 bytes)' },
    { errorType: 'invalid_xml', message: 'Invalid .docx file: document.xml is empty' },
    {
      errorType: 'missing_file',
      message: 'Invalid .docx file: word/document.xml not found. Available entries: [Content_Types].xml',
    },
    { errorType: 'malformed_marker', message: 'Failed to replace markers in document: malformed' },
    { errorType: 'read_error', message: 'Failed to read file' },
    { errorType: 'write_error', message: 'Failed to generate .docx file buffer' },
    { errorType: 'unknown', message: 'Failed to replace markers in document: unexpected' },
  ];

  it.each(cases)(
    'DocxReplaceError $errorType -> ReplacementError with same message, errorType, cause and filePath',
    async ({ errorType, message }) => {
      const cause = new Error('root cause');
      vi.mocked(replaceMarkersInDocxBytes).mockRejectedValueOnce(
        new DocxReplaceError(message, cause, errorType)
      );

      const filePath = path.join(testDir, 'contract.docx');
      const wrapped = await wrappedError(filePath);

      expect(wrapped).toBeInstanceOf(ReplacementError);
      expect(wrapped.message).toBe(message);
      expect(wrapped.errorType).toBe(errorType);
      expect(wrapped.cause).toBe(cause);
      expect(wrapped.filePath).toBe(filePath);
    }
  );
});
