/**
 * Unit Tests for the File System Access live-folder tier (fss-folder)
 *
 * FileSystemDirectoryHandle is mocked with plain class instances (methods on
 * the PROTOTYPE): fake-indexeddb structured-clones IDB puts, so
 * function-valued OWN properties would throw DataCloneError (Task 8 lesson).
 * showDirectoryPicker is mocked on the global only — the product code always
 * reads the real `window` global.
 */

import 'fake-indexeddb';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MAX_DOCUMENT_SIZE, MAX_SCAN_DOCUMENTS, SAVE_FILE_NAME } from '@/shared/constants';
import type { ReplacementValuesFile } from '@/shared/types';

let fss: typeof import('@/renderer/platform/web/fss-folder');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

class FakeFileHandle implements FileSystemFileHandle {
  readonly kind = 'file' as const;
  constructor(
    readonly name: string,
    private readonly contents: File
  ) {}

  async getFile(): Promise<File> {
    return this.contents;
  }
  async createWritable(): Promise<FileSystemWritableFileStream> {
    throw new Error('not used in this test');
  }
  async isSameEntry(): Promise<boolean> {
    return false;
  }
  async queryPermission(): Promise<PermissionState> {
    return 'granted';
  }
  async requestPermission(): Promise<PermissionState> {
    return 'granted';
  }
}

/**
 * FakeDirectoryHandle keeps data (kind/name/file map) as own cloneable
 * properties and all methods on the prototype, mirroring a real
 * FileSystemDirectoryHandle under IDB structured clone.
 */
class FakeDirectoryHandle implements FileSystemDirectoryHandle {
  readonly kind = 'directory' as const;
  private readonly files = new Map<string, FakeFileHandle>();
  private readonly subdirectories: FakeDirectoryHandle[] = [];

  /** Permission behavior faked for regrant(); counters/descriptors for asserts */
  queryState: PermissionState = 'granted';
  requestState: PermissionState = 'granted';
  requestPermissionCalls = 0;
  lastQueryDescriptor?: { mode?: 'read' | 'readwrite' };
  lastRequestDescriptor?: { mode?: 'read' | 'readwrite' };

  constructor(readonly name: string) {}

  addFile(name: string, contents: File): this {
    this.files.set(name, new FakeFileHandle(name, contents));
    return this;
  }

  addSubdirectory(name: string): this {
    this.subdirectories.push(new FakeDirectoryHandle(name));
    return this;
  }

  async getFileHandle(name: string): Promise<FileSystemFileHandle> {
    const found = this.files.get(name);
    if (found === undefined) {
      throw new DOMException('File not found', 'NotFoundError');
    }
    return found;
  }

  values(): AsyncIterableIterator<FileSystemHandle> {
    const entries: FileSystemHandle[] = [...this.files.values(), ...this.subdirectories];
    return (async function* () {
      yield* entries;
    })();
  }

  async getDirectoryHandle(): Promise<FileSystemDirectoryHandle> {
    throw new Error('not used in this test');
  }
  async removeEntry(): Promise<void> {}
  async resolve(): Promise<string[] | null> {
    return null;
  }
  async isSameEntry(): Promise<boolean> {
    return false;
  }
  async queryPermission(desc?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState> {
    this.lastQueryDescriptor = desc;
    return this.queryState;
  }
  async requestPermission(desc?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState> {
    this.lastRequestDescriptor = desc;
    this.requestPermissionCalls += 1;
    return this.requestState;
  }
}

function docxFile(name: string): File {
  return new File(['PK\x03\x04'], name);
}

function saveFilePayload(): ReplacementValuesFile {
  return {
    prefix: 'REPLACEME-',
    values: { NAME: 'Jane' },
    version: '1.0',
    lastModified: '2026-09-04T10:00:00.000Z',
  };
}

beforeEach(async () => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  fss = await import('@/renderer/platform/web/fss-folder');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fss-folder', () => {
  describe('isFssAvailable', () => {
    it('should return false when showDirectoryPicker is absent (Firefox/Safari)', () => {
      expect('showDirectoryPicker' in window).toBe(false); // jsdom default: genuinely absent
      expect(fss.isFssAvailable()).toBe(false);
    });

    it('should return true when showDirectoryPicker is present (Chromium)', () => {
      vi.stubGlobal('showDirectoryPicker', async () => new FakeDirectoryHandle('Picked'));
      expect(fss.isFssAvailable()).toBe(true);
    });

    it('should return false under an own-property shadow holding undefined', () => {
      vi.stubGlobal('showDirectoryPicker', undefined);
      expect('showDirectoryPicker' in window).toBe(true); // `in` lies here — typeof must not
      expect(fss.isFssAvailable()).toBe(false);
    });
  });

  describe('pickWorkspace', () => {
    it('should create an fss workspace named after the picked handle', async () => {
      const handle = new FakeDirectoryHandle('Templates').addFile('a.docx', docxFile('a.docx'));
      vi.stubGlobal('showDirectoryPicker', async () => handle);

      const workspace = await fss.pickWorkspace();

      expect(workspace?.kind).toBe('fss');
      expect(workspace?.name).toBe('Templates');
      expect(workspace?.id).toMatch(UUID_PATTERN);
      expect(workspace?.saveFile).toBeUndefined();
      if (workspace?.kind === 'fss') {
        expect(workspace.handle).toBe(handle);
      }
    });

    it('should request the picker in read-only mode', async () => {
      const picker = vi.fn(async (_options?: { mode?: 'read' | 'readwrite' }) =>
        new FakeDirectoryHandle('Templates')
      );
      vi.stubGlobal('showDirectoryPicker', picker);

      await fss.pickWorkspace();

      expect(picker).toHaveBeenCalledWith({ mode: 'read' });
    });

    it('should seed saveFile from a valid .replacement-values.json in the folder', async () => {
      const saveFile = saveFilePayload();
      const handle = new FakeDirectoryHandle('WithValues').addFile(
        SAVE_FILE_NAME,
        new File([JSON.stringify(saveFile)], SAVE_FILE_NAME)
      );
      vi.stubGlobal('showDirectoryPicker', async () => handle);

      const workspace = await fss.pickWorkspace();

      expect(workspace?.saveFile).toEqual(saveFile);
    });

    it('should leave saveFile undefined when the folder has no save file', async () => {
      const handle = new FakeDirectoryHandle('NoValues').addFile('a.docx', docxFile('a.docx'));
      vi.stubGlobal('showDirectoryPicker', async () => handle);

      const workspace = await fss.pickWorkspace();

      expect(workspace?.saveFile).toBeUndefined();
    });

    it('should leave saveFile undefined without throwing on invalid JSON', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const handle = new FakeDirectoryHandle('BrokenJson').addFile(
        SAVE_FILE_NAME,
        new File(['{not valid json'], SAVE_FILE_NAME)
      );
      vi.stubGlobal('showDirectoryPicker', async () => handle);

      const workspace = await fss.pickWorkspace();

      expect(workspace?.saveFile).toBeUndefined();
    });

    it('should leave saveFile undefined when the save file fails validation', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      // Valid JSON, but it is not a ReplacementValuesFile (no version)
      const handle = new FakeDirectoryHandle('InvalidShape').addFile(
        SAVE_FILE_NAME,
        new File([JSON.stringify({ prefix: 'REPLACEME-', values: { NAME: 'x' } })], SAVE_FILE_NAME)
      );
      vi.stubGlobal('showDirectoryPicker', async () => handle);

      const workspace = await fss.pickWorkspace();

      expect(workspace?.saveFile).toBeUndefined();
    });

    it('should resolve null when the user cancels the picker (AbortError)', async () => {
      vi.stubGlobal('showDirectoryPicker', async () => {
        throw new DOMException('The user aborted the request.', 'AbortError');
      });

      expect(await fss.pickWorkspace()).toBeNull();
    });

    it('should rethrow non-abort failures (plain Error)', async () => {
      vi.stubGlobal('showDirectoryPicker', async () => {
        throw new Error('picker exploded');
      });

      await expect(fss.pickWorkspace()).rejects.toThrow('picker exploded');
    });

    it('should rethrow DOMException failures that are not AbortError', async () => {
      vi.stubGlobal('showDirectoryPicker', async () => {
        throw new DOMException('read blocked', 'SecurityError');
      });

      await expect(fss.pickWorkspace()).rejects.toThrow('read blocked');
    });
  });

  describe('listDocx', () => {
    it('should return only top-level .docx files, skipping subdirectories and non-docx entries', async () => {
      const handle = new FakeDirectoryHandle('Templates')
        .addFile('a.docx', docxFile('a.docx'))
        .addFile('notes.txt', new File(['x'], 'notes.txt'))
        .addFile('b.DOCX', docxFile('b.DOCX'))
        .addFile(SAVE_FILE_NAME, new File(['{}'], SAVE_FILE_NAME))
        .addFile('.docx', docxFile('.docx')) // path.extname parity: dotfile has no extension
        .addSubdirectory('sub')
        .addSubdirectory('nested')
        .addFile('c.docx', docxFile('c.docx'));

      const result = await fss.listDocx(handle);

      expect(result.map((doc) => doc.name)).toEqual(['a.docx', 'b.DOCX', 'c.docx']);
      expect(result[0]?.file).toBeInstanceOf(File);
    });

    it('should throw the scanner-identical message when the count exceeds MAX_SCAN_DOCUMENTS', async () => {
      const handle = new FakeDirectoryHandle('Huge');
      for (let i = 0; i <= MAX_SCAN_DOCUMENTS; i += 1) {
        handle.addFile(`doc-${i}.docx`, docxFile(`doc-${i}.docx`));
      }

      const error: unknown = await fss.listDocx(handle).then(
        () => undefined,
        (caught: unknown) => caught
      );

      expect(error).toBeInstanceOf(Error);
      if (error instanceof Error) {
        expect(error.message).toBe(
          `Too many documents found (${MAX_SCAN_DOCUMENTS + 1}). Maximum allowed is ${MAX_SCAN_DOCUMENTS}.`
        );
      }
    });

    it('should skip oversized files with the scanner-identical warning and continue', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const huge = docxFile('big.docx');
      Object.defineProperty(huge, 'size', { value: MAX_DOCUMENT_SIZE + 1 });
      const handle = new FakeDirectoryHandle('Templates')
        .addFile('big.docx', huge)
        .addFile('small.docx', docxFile('small.docx'));

      const result = await fss.listDocx(handle);

      expect(result.map((doc) => doc.name)).toEqual(['small.docx']);
      expect(warn).toHaveBeenCalledWith(
        `Skipping big.docx: File size exceeds maximum limit of ${MAX_DOCUMENT_SIZE} bytes`
      );
    });
  });

  describe('regrant', () => {
    it('should return true without prompting when permission is already granted', async () => {
      const handle = new FakeDirectoryHandle('Granted');
      handle.queryState = 'granted';

      expect(await fss.regrant(handle)).toBe(true);
      expect(handle.requestPermissionCalls).toBe(0);
      expect(handle.lastQueryDescriptor).toEqual({ mode: 'read' });
    });

    it('should return true when the read permission request succeeds', async () => {
      const handle = new FakeDirectoryHandle('Prompt');
      handle.queryState = 'prompt';
      handle.requestState = 'granted';

      expect(await fss.regrant(handle)).toBe(true);
      expect(handle.requestPermissionCalls).toBe(1);
      expect(handle.lastRequestDescriptor).toEqual({ mode: 'read' });
    });

    it('should return false when the permission request is denied', async () => {
      const handle = new FakeDirectoryHandle('Denied');
      handle.queryState = 'prompt';
      handle.requestState = 'denied';

      expect(await fss.regrant(handle)).toBe(false);
    });
  });
});
