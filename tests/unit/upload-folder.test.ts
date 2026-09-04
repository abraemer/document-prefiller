/**
 * Unit Tests for the Folder Upload Tier (webkitdirectory input + drag-drop)
 *
 * jsdom cannot construct DataTransferItemList, FileList, or FileSystem
 * entries, and its File objects never populate webkitRelativePath — every
 * browser shape here is a structural mock (unknown + narrowing, no `any`),
 * and uploaded paths are defined per-file with Object.defineProperty.
 */

import 'fake-indexeddb';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, vi } from 'vitest';

let upload: typeof import('@/renderer/platform/web/upload-folder');
let store: typeof import('@/renderer/platform/web/workspace-store');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SAVE_FILE_NAME = '.replacement-values.json';

const VALID_SAVE_FILE_JSON = JSON.stringify({
  prefix: 'REPLACEME-',
  values: { NAME: 'Jane' },
  version: '1.0',
  lastModified: '2026-09-04T10:00:00.000Z',
});

/** jsdom Files never populate webkitRelativePath — define it per instance. */
function makeFile(name: string, relativePath: string, contents = 'bytes'): File {
  const file = new File([contents], name);
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
  return file;
}

/** FileList cannot be constructed in jsdom — minimal structural array-like. */
function makeFileList(files: File[]): FileList {
  return {
    ...files,
    length: files.length,
    item: (index: number): File | null =>
      index >= 0 && index < files.length ? files[index] : null,
  } as unknown as FileList;
}

function setInputFiles(input: HTMLInputElement, files: File[]): void {
  Object.defineProperty(input, 'files', {
    value: makeFileList(files),
    configurable: true,
  });
}

/** Drive one picker round: open, select `files`, and await the result. */
async function openAndSelect(files: File[]): Promise<unknown> {
  const pending = upload.openFolderPicker();
  setInputFiles(upload.ensureUploadInput(), files);
  upload.ensureUploadInput().dispatchEvent(new Event('change'));
  return pending;
}

// ============================================================================
// DRAG-DROP STRUCTURAL MOCKS (no jsdom equivalents exist)
// ============================================================================

/** FileSystem cannot be constructed; one shared cast feeds all entry mocks. */
const fakeFilesystem = null as unknown as FileSystem;

function makeFileEntry(name: string, contents = 'bytes'): FileSystemFileEntry {
  const file = new File([contents], name);
  return {
    isFile: true,
    isDirectory: false,
    name,
    fullPath: `/dropped/${name}`,
    filesystem: fakeFilesystem,
    getParent: (): void => undefined,
    file: (successCallback: (file: File) => void): void => {
      successCallback(file);
    },
  };
}

function makeDirectoryEntry(name: string, batches: FileSystemEntry[][]): FileSystemDirectoryEntry {
  let readCount = 0;
  const reader: FileSystemDirectoryReader = {
    readEntries: (successCallback: (entries: FileSystemEntry[]) => void): void => {
      const batch = batches[readCount] ?? [];
      // Advance BEFORE the synchronous callback: the product re-enters
      // readEntries from inside it, and a post-callback increment would
      // never run (readCount frozen -> infinite sync recursion).
      readCount += 1;
      successCallback(batch);
    },
  };
  return {
    isFile: false,
    isDirectory: true,
    name,
    fullPath: `/${name}`,
    filesystem: fakeFilesystem,
    getParent: (): void => undefined,
    createReader: (): FileSystemDirectoryReader => reader,
    getDirectory: (): void => undefined,
    getFile: (): void => undefined,
  };
}

function makeDropItem(entry: FileSystemEntry | null): DataTransferItem {
  return {
    kind: 'file',
    type: '',
    getAsFile: (): File | null => null,
    getAsString: (): void => undefined,
    webkitGetAsEntry: (): FileSystemEntry | null => entry,
  };
}

/** DataTransferItemList cannot be constructed in jsdom — structural mock. */
function makeDropList(items: DataTransferItem[]): DataTransferItemList {
  return {
    ...items,
    length: items.length,
    add: (): DataTransferItem | null => null,
    clear: (): void => undefined,
    remove: (): void => undefined,
  } as unknown as DataTransferItemList;
}

// ============================================================================
// FIXTURES
// ============================================================================

beforeEach(async () => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  document.body.innerHTML = '';
  upload = await import('@/renderer/platform/web/upload-folder');
  store = await import('@/renderer/platform/web/workspace-store');
});

describe('ensureUploadInput', () => {
  it('should attach exactly one hidden input[webkitdirectory] to document.body', () => {
    const input = upload.ensureUploadInput();

    expect(document.body.contains(input)).toBe(true);
    expect(document.querySelectorAll('input[webkitdirectory]')).toHaveLength(1);
    expect(input.type).toBe('file');
    expect(input.style.display).toBe('none');
  });

  it('should return the SAME persistent element on repeated calls', () => {
    const first = upload.ensureUploadInput();
    const second = upload.ensureUploadInput();

    expect(second).toBe(first);
    expect(document.querySelectorAll('input[webkitdirectory]')).toHaveLength(1);
  });
});

describe('openFolderPicker', () => {
  it('should filter extensions and subdirectory files, name from the path root, and seed the save file', async () => {
    const result = await openAndSelect([
      makeFile('a.docx', 'MyFolder/a.docx'),
      makeFile('b.DOCX', 'MyFolder/b.DOCX'),
      makeFile('notes.txt', 'MyFolder/notes.txt'),
      makeFile('nested.docx', 'MyFolder/sub/nested.docx'),
      makeFile(SAVE_FILE_NAME, `MyFolder/${SAVE_FILE_NAME}`, VALID_SAVE_FILE_JSON),
    ]);

    expect(result).not.toBeNull();
    const record = result as { id: string; kind: string; name: string };
    expect(record.id).toMatch(UUID_PATTERN);
    expect(record.kind).toBe('upload');
    expect(record.name).toBe('MyFolder');

    const fetched = await store.getWorkspace(record.id);
    expect(fetched?.kind).toBe('upload');
    if (fetched?.kind === 'upload') {
      expect(fetched.files.map((file) => file.name)).toEqual(['a.docx', 'b.DOCX']);
      expect(fetched.saveFile).toEqual({
        prefix: 'REPLACEME-',
        values: { NAME: 'Jane' },
        version: '1.0',
        lastModified: '2026-09-04T10:00:00.000Z',
      });
    }
  });

  it('should fall back to firstFile.name when webkitRelativePath is empty (CDP-injected files)', async () => {
    const result = await openAndSelect([makeFile('a.docx', ''), makeFile('b.docx', '')]);

    expect((result as { name: string }).name).toBe('a.docx');
    expect(((result as { files?: { name: string }[] }).files ?? []).map((f) => f.name))
      .toEqual(['a.docx', 'b.docx']);
  });

  it("should fall back to 'Uploaded folder' for an empty selection", async () => {
    const result = await openAndSelect([]);

    expect((result as { name: string }).name).toBe('Uploaded folder');
  });

  it('should leave saveFile undefined when no save file was uploaded', async () => {
    const result = await openAndSelect([makeFile('a.docx', 'Root/a.docx')]);

    expect((result as { saveFile?: unknown }).saveFile).toBeUndefined();
  });

  it('should reject an invalid-JSON save file with the exact storage.ts wording and still create the workspace', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await openAndSelect([
      makeFile('a.docx', 'Root/a.docx'),
      makeFile(SAVE_FILE_NAME, `Root/${SAVE_FILE_NAME}`, '{not json'),
    ]);

    expect(warn).toHaveBeenCalledWith(
      'Failed to parse save file at .replacement-values.json: Invalid JSON format'
    );
    expect(result).not.toBeNull();
    expect((result as { saveFile?: unknown }).saveFile).toBeUndefined();
    expect((result as { name: string }).name).toBe('Root');
  });

  it('should reject a save file that fails validation and still create the workspace', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await openAndSelect([
      makeFile('a.docx', 'Root/a.docx'),
      makeFile(
        SAVE_FILE_NAME,
        `Root/${SAVE_FILE_NAME}`,
        JSON.stringify({ prefix: 'REPLACEME-', values: {}, version: 1 })
      ),
    ]);

    expect(warn).toHaveBeenCalledWith(
      'Save file validation failed at .replacement-values.json: version: Version must be a string'
    );
    expect((result as { saveFile?: unknown }).saveFile).toBeUndefined();
  });

  it('should ignore a save file nested in a subdirectory', async () => {
    const result = await openAndSelect([
      makeFile('a.docx', 'Root/a.docx'),
      makeFile(SAVE_FILE_NAME, `Root/sub/${SAVE_FILE_NAME}`, VALID_SAVE_FILE_JSON),
    ]);

    expect((result as { saveFile?: unknown }).saveFile).toBeUndefined();
  });

  it('should resolve null on a cancel event (desktop dialog-cancel parity)', async () => {
    const pending = upload.openFolderPicker();
    upload.ensureUploadInput().dispatchEvent(new Event('cancel'));

    expect(await pending).toBeNull();
  });

  it('should keep the persistent input and serve consecutive open→cancel→open cycles', async () => {
    const input = upload.ensureUploadInput();

    const canceled = upload.openFolderPicker();
    input.dispatchEvent(new Event('cancel'));
    expect(await canceled).toBeNull();

    // No dangling listeners: the retry invocation settles normally.
    const retried = upload.openFolderPicker();
    setInputFiles(input, [makeFile('a.docx', 'Root/a.docx')]);
    input.dispatchEvent(new Event('change'));
    const record = await retried;

    expect(record).not.toBeNull();
    expect((record as { name: string }).name).toBe('Root');
    // The input persists unchanged for retry (same element, still attached).
    expect(upload.ensureUploadInput()).toBe(input);
    expect(document.querySelectorAll('input[webkitdirectory]')).toHaveLength(1);
  });

  it('should clear the input value so re-selecting the SAME folder fires change', async () => {
    const input = upload.ensureUploadInput();

    const first = upload.openFolderPicker();
    setInputFiles(input, [makeFile('a.docx', 'Root/a.docx')]);
    input.dispatchEvent(new Event('change'));
    await first;

    const second = upload.openFolderPicker();
    expect(input.value).toBe('');
    setInputFiles(input, [makeFile('a.docx', 'Root/a.docx')]);
    input.dispatchEvent(new Event('change'));
    expect((await second) as unknown).not.toBeNull();
  });
});

describe('ingestDroppedItems', () => {
  it('should ingest a dropped directory top-level only, seeding the save file, looping readEntries until an empty batch', async () => {
    const subDirectory = makeDirectoryEntry('sub', [[], []]);
    const directory = makeDirectoryEntry('DroppedFolder', [
      [makeFileEntry('a.docx'), subDirectory, makeFileEntry('notes.txt')],
      [makeFileEntry('b.docx'), makeFileEntry(SAVE_FILE_NAME, VALID_SAVE_FILE_JSON)],
      [],
    ]);
    let readCalls = 0;
    const originalReader = directory.createReader();
    vi.spyOn(directory, 'createReader').mockImplementation(() => ({
      readEntries: (successCallback: (entries: FileSystemEntry[]) => void): void => {
        readCalls += 1;
        originalReader.readEntries(successCallback);
      },
    }));

    const result = await upload.ingestDroppedItems(
      makeDropList([makeDropItem(directory)])
    );

    expect(readCalls).toBe(3);
    expect(result).not.toBeNull();
    const record = result as { id: string; kind: string; name: string };
    expect(record.id).toMatch(UUID_PATTERN);
    expect(record.kind).toBe('upload');
    expect(record.name).toBe('DroppedFolder');

    const fetched = await store.getWorkspace(record.id);
    expect(fetched?.kind).toBe('upload');
    if (fetched?.kind === 'upload') {
      expect(fetched.files.map((file) => file.name)).toEqual(['a.docx', 'b.docx']);
      expect(fetched.saveFile).toEqual({
        prefix: 'REPLACEME-',
        values: { NAME: 'Jane' },
        version: '1.0',
        lastModified: '2026-09-04T10:00:00.000Z',
      });
    }
  });

  it('should return null for a non-directory drop', async () => {
    const fileEntry = makeFileEntry('a.docx');

    const result = await upload.ingestDroppedItems(
      makeDropList([makeDropItem(fileEntry)])
    );

    expect(result).toBeNull();
  });

  it('should return null for an empty dropped directory', async () => {
    const emptyDirectory = makeDirectoryEntry('Empty', [[]]);

    const result = await upload.ingestDroppedItems(
      makeDropList([makeDropItem(emptyDirectory)])
    );

    expect(result).toBeNull();
  });

  it('should return null when no item carries a directory entry', async () => {
    const result = await upload.ingestDroppedItems(
      makeDropList([makeDropItem(null)])
    );

    expect(result).toBeNull();
  });

  it('should reject an invalid save file with the exact wording and still create the workspace', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const directory = makeDirectoryEntry('DroppedFolder', [
      [makeFileEntry('a.docx'), makeFileEntry(SAVE_FILE_NAME, '{not json')],
      [],
    ]);

    const result = await upload.ingestDroppedItems(
      makeDropList([makeDropItem(directory)])
    );

    expect(warn).toHaveBeenCalledWith(
      'Failed to parse save file at .replacement-values.json: Invalid JSON format'
    );
    const record = result as { saveFile?: unknown; files?: { name: string }[] };
    expect(record.saveFile).toBeUndefined();
    expect(record.files).toEqual([{ name: 'a.docx', blob: expect.any(Blob) }]);
  });
});
