/**
 * Unit Tests for the Web Adapter (window.api shim, todo 12)
 *
 * Acceptance (a)-(h) of the plan's todo 12 plus the pinned error-string and
 * cancel-parity cases todos 13/14 build on.
 *
 * getWorkspace is mocked as a DELEGATING spy (default impl = real store):
 * fake-indexeddb's structured clone strips Blob contents and handle methods
 * on the IDB roundtrip (Task 8 lesson), so tier payloads must be fed
 * directly. Cache population, workspace creation and save-file persistence
 * all run against the REAL store.
 *
 * The mock is registered per test with vi.doMock — NOT the hoisted vi.mock,
 * whose factory result is cached across vi.resetModules(), leaking both the
 * mock's call state and the real store's cached IDB connection.
 *
 * Mock handles are class instances with prototype methods (Task 8/9
 * pattern) so they survive IDB puts where needed.
 */

import 'fake-indexeddb';
import { IDBFactory } from 'fake-indexeddb';
import JSZip from 'jszip';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import {
  APP_VERSION,
  DEFAULT_PREFIX,
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  FOLDER_NOT_FOUND_ERROR,
  MAX_DOCUMENT_SIZE,
  MAX_SCAN_DOCUMENTS,
  MAX_UNIQUE_MARKERS,
} from '@/shared/constants';
import type { PlatformAPI, ReplacementValuesFile } from '@/shared/types';
import { useUpdater } from '@/renderer/composables/useUpdater';
import type { WorkspaceFile, WorkspaceRecord } from '@/renderer/platform/web/workspace-store';

let adapter: typeof import('@/renderer/platform/web/index');
let store: typeof import('@/renderer/platform/web/workspace-store');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TIMESTAMP = '2026-09-04T10:00:00.000Z';

// ============================================================================
// FIXTURES
// ============================================================================

/** Build a minimal valid .docx (zip with word/document.xml) containing text. */
async function makeDocxBytes(text: string): Promise<Uint8Array> {
  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body>' +
    '<w:p><w:r><w:t>Template</w:t></w:r></w:p>' +
    `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>` +
    '</w:body></w:document>';
  const zip = new JSZip();
  zip.file('word/document.xml', documentXml);
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array' }));
}

/** jsdom File cannot be constructed from JSZip's Uint8Array<ArrayBufferLike> directly. */
async function makeDocxFile(name: string, text: string): Promise<File> {
  return new File([new Uint8Array(await makeDocxBytes(text))], name);
}

function makeSaveFile(values: Record<string, string>): ReplacementValuesFile {
  return { prefix: DEFAULT_PREFIX, values, version: '1.0', lastModified: TIMESTAMP };
}

function fssRecord(id: string, handle: FakeDirectoryHandle): WorkspaceRecord {
  return { id, kind: 'fss', name: handle.name, handle, lastModified: TIMESTAMP };
}

function uploadRecord(id: string, files: WorkspaceFile[]): WorkspaceRecord {
  return { id, kind: 'upload', name: 'Uploaded folder', files, lastModified: TIMESTAMP };
}

// ============================================================================
// FSS HANDLE MOCKS (class instances — prototype methods survive IDB puts)
// ============================================================================

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

class FakeDirectoryHandle implements FileSystemDirectoryHandle {
  readonly kind = 'directory' as const;
  private readonly files = new Map<string, FakeFileHandle>();

  queryState: PermissionState = 'granted';
  requestState: PermissionState = 'granted';
  requestPermissionCalls = 0;

  constructor(readonly name: string) {}

  addFile(file: File): this {
    this.files.set(file.name, new FakeFileHandle(file.name, file));
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
    const entries: FileSystemHandle[] = [...this.files.values()];
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
  async queryPermission(): Promise<PermissionState> {
    return this.queryState;
  }
  async requestPermission(): Promise<PermissionState> {
    this.requestPermissionCalls += 1;
    return this.requestState;
  }
}

// ============================================================================
// DRAG-DROP STRUCTURAL MOCKS (no jsdom equivalents exist)
// ============================================================================

const fakeFilesystem = null as unknown as FileSystem;

function makeFileEntry(name: string): FileSystemFileEntry {
  const file = new File(['bytes'], name);
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
      // Advance BEFORE the synchronous callback — the product re-enters
      // readEntries from inside it (Task 10 lesson).
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
    getFile: (): void => {
      throw new Error('not used in this test');
    },
    getDirectory: (): void => {
      throw new Error('not used in this test');
    },
  };
}

/** DataTransferItemList cannot be constructed in jsdom — structural array-like. */
function makeItems(entries: FileSystemEntry[]): DataTransferItemList {
  const items = entries.map((entry) => ({ webkitGetAsEntry: () => entry }));
  return { ...items, length: items.length } as unknown as DataTransferItemList;
}

// ============================================================================
// HARNESS
// ============================================================================

/** Install the shim and wait for the name cache; returns the assigned api. */
async function installApi(): Promise<PlatformAPI> {
  const { ready } = adapter.installWebApi();
  await ready;
  return window.api;
}

beforeEach(async () => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  vi.doMock('@/renderer/platform/web/workspace-store', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/renderer/platform/web/workspace-store')>();
    return { ...actual, getWorkspace: vi.fn(actual.getWorkspace) };
  });
  adapter = await import('@/renderer/platform/web/index');
  store = await import('@/renderer/platform/web/workspace-store');
});

afterEach(() => {
  window.api = undefined as unknown as typeof window.api;
  vi.unstubAllGlobals();
  document.querySelectorAll('input[webkitdirectory]').forEach((input) => input.remove());
});

// ============================================================================
// INSTALL — window.api assignment, name cache, ready ordering
// ============================================================================

describe('Web Adapter: installWebApi', () => {
  it('assigns window.api and populates the name cache from existing workspaces', async () => {
    const first = await store.createWorkspace({ kind: 'upload', name: 'Alpha', files: [] });
    const second = await store.createWorkspace({ kind: 'upload', name: 'Beta', files: [] });

    const api = await installApi();

    expect(api).toBe(window.api);
    expect(adapter.getWorkspaceName(first.id)).toBe('Alpha');
    expect(adapter.getWorkspaceName(second.id)).toBe('Beta');
    expect(adapter.getWorkspaceName('missing-id')).toBeUndefined();
  });

  it('(h) settles ready with an empty cache when the IDB open throws — no pending boot', async () => {
    globalThis.indexedDB = {
      open: () => {
        throw new Error('IDB blocked');
      },
    } as unknown as IDBFactory;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { ready } = adapter.installWebApi();
    await expect(ready).resolves.toBeUndefined();
    expect(adapter.getWorkspaceName('any-id')).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to load workspaces for the name cache:',
      expect.any(Error)
    );

    warnSpy.mockRestore();
  });

  it('(e) reports capabilities.startupScan per tier, not per literal', async () => {
    // Absent API (jsdom default): upload tier, no gesture banner.
    await installApi();
    expect(window.api.capabilities).toEqual({
      variant: 'web-upload',
      startupScan: 'auto',
      outputMode: 'download',
      updater: false,
    });

    // Shadowed with an own undefined property ('in' stays true — the
    // typeof feature-detect must still see it as unavailable).
    vi.stubGlobal('showDirectoryPicker', undefined);
    await installApi();
    expect(window.api.capabilities).toEqual({
      variant: 'web-upload',
      startupScan: 'auto',
      outputMode: 'download',
      updater: false,
    });

    // Present: FSS tier with gesture startup.
    vi.stubGlobal('showDirectoryPicker', vi.fn());
    await installApi();
    expect(window.api.capabilities).toEqual({
      variant: 'web-fss',
      startupScan: 'gesture',
      outputMode: 'download',
      updater: false,
    });
  });

  it('attaches the hidden upload input to document.body at install', async () => {
    await installApi();

    const input = document.querySelector('input[webkitdirectory]');
    expect(input).toBeInstanceOf(HTMLInputElement);
  });
});

// ============================================================================
// SETTINGS + SAVE FILE
// ============================================================================

describe('Web Adapter: settings', () => {
  it('(b) getSettings returns a full AppSettings including windowState', async () => {
    const api = await installApi();

    const settings = await api.settings.getSettings();

    expect(settings.windowState).toEqual({
      width: DEFAULT_WINDOW_WIDTH,
      height: DEFAULT_WINDOW_HEIGHT,
      maximized: false,
    });
    expect(settings.preferences).toEqual({});
    expect(settings.lastFolder).toBeUndefined();
  });

  it('persists lastFolder through saveSettings for reopenLast', async () => {
    const api = await installApi();

    const save = await api.settings.saveSettings({ settings: { lastFolder: 'ws-1' } });
    expect(save).toEqual({ success: true });

    const settings = await api.settings.getSettings();
    expect(settings.lastFolder).toBe('ws-1');
  });
});

describe('Web Adapter: saveFile', () => {
  it('(c) writeSaveFile then readSaveFile returns the updated values (single source of truth)', async () => {
    const workspace = await store.createWorkspace({ kind: 'upload', name: 'U', files: [] });
    const api = await installApi();

    const before = await api.saveFile.readSaveFile(workspace.id);
    expect(before).toEqual({ success: false, error: 'Save file not found' });

    const firstWrite = await api.saveFile.writeSaveFile(workspace.id, makeSaveFile({ NAME: 'Jane' }));
    expect(firstWrite).toEqual({ success: true });

    const firstRead = await api.saveFile.readSaveFile(workspace.id);
    expect(firstRead.success).toBe(true);
    expect(firstRead.data?.values.NAME).toBe('Jane');

    // A second write replaces the stored values — the IDB record is the
    // single source of truth after the first seed.
    await api.saveFile.writeSaveFile(workspace.id, makeSaveFile({ NAME: 'John' }));
    const secondRead = await api.saveFile.readSaveFile(workspace.id);
    expect(secondRead.data?.values.NAME).toBe('John');

    const lastModified = await api.saveFile.getSaveFileLastModified(workspace.id);
    expect(lastModified.success).toBe(true);
    expect(typeof lastModified.lastModified).toBe('string');
  });

  it('writeSaveFile on an unknown workspace id fails without throwing', async () => {
    const api = await installApi();

    const write = await api.saveFile.writeSaveFile('missing-id', makeSaveFile({ NAME: 'x' }));
    expect(write).toEqual({ success: false, error: FOLDER_NOT_FOUND_ERROR });
  });
});

// ============================================================================
// FOLDER: selectFolder
// ============================================================================

describe('Web Adapter: folder.selectFolder', () => {
  it('returns the workspace id (not the display name) and updates the name cache (fss tier)', async () => {
    const handle = new FakeDirectoryHandle('MyFolder').addFile(
      await makeDocxFile('a.docx', 'REPLACEME-A')
    );
    vi.stubGlobal('showDirectoryPicker', vi.fn(async () => handle));

    const api = await installApi();
    const result = await api.folder.selectFolder();

    const all = await store.listWorkspaces();
    expect(all).toHaveLength(1);
    expect(result.folderPath).toBe(all[0]?.id);
    expect(result.folderPath).toMatch(UUID_PATTERN);
    if (result.folderPath === null) {
      throw new Error('expected a folderPath');
    }
    expect(adapter.getWorkspaceName(result.folderPath)).toBe('MyFolder');
  });

  it('resolves {folderPath: null} on fss picker cancel (AbortError)', async () => {
    vi.stubGlobal('showDirectoryPicker', vi.fn(async () => {
      throw new DOMException('The user aborted the request.', 'AbortError');
    }));

    const api = await installApi();
    const result = await api.folder.selectFolder();

    expect(result).toEqual({ folderPath: null });
  });

  it('resolves {folderPath: null} on upload picker cancel', async () => {
    const api = await installApi();

    const pending = api.folder.selectFolder();
    const input = document.querySelector('input[webkitdirectory]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error('upload input not attached');
    }
    input.dispatchEvent(new Event('cancel'));

    expect(await pending).toEqual({ folderPath: null });
  });
});

// ============================================================================
// FOLDER: scanFolder
// ============================================================================

describe('Web Adapter: folder.scanFolder', () => {
  it('(d) returns the shape App.vue consumes: documents[].name + documents[].markers', async () => {
    const handle = new FakeDirectoryHandle('Templates')
      .addFile(await makeDocxFile('a.docx', 'Hello REPLACEME-NAME and REPLACEME-CITY'))
      .addFile(await makeDocxFile('b.docx', 'No markers here'));
    vi.mocked(store.getWorkspace).mockResolvedValue(fssRecord('ws-1', handle));

    const api = await installApi();
    const response = await api.folder.scanFolder('ws-1');

    expect(response.error).toBeUndefined();
    expect(response.documents).toHaveLength(2);

    const docA = response.documents.find((doc) => doc.name === 'a.docx');
    expect(docA?.path).toBe('ws-1/a.docx');
    expect(docA?.markers).toEqual(['REPLACEME-NAME', 'REPLACEME-CITY']);
    // App.vue:824 strips the prefix from each marker text.
    for (const marker of docA?.markers ?? []) {
      expect(marker.startsWith(DEFAULT_PREFIX)).toBe(true);
    }

    const docB = response.documents.find((doc) => doc.name === 'b.docx');
    expect(docB?.path).toBe('ws-1/b.docx');
    expect(docB?.markers).toEqual([]);
  });

  it('honors the prefix argument (detectMarkers runs with it)', async () => {
    const handle = new FakeDirectoryHandle('Templates').addFile(
      await makeDocxFile('a.docx', 'ZZ-FOO and REPLACEME-BAR')
    );
    vi.mocked(store.getWorkspace).mockResolvedValue(fssRecord('ws-1', handle));

    const api = await installApi();
    const response = await api.folder.scanFolder('ws-1', 'ZZ-');

    expect(response.documents[0]?.markers).toEqual(['ZZ-FOO']);
  });

  it('returns the error envelope (no throw) for an unknown workspace id', async () => {
    const api = await installApi();

    const response = await api.folder.scanFolder('missing-id');

    expect(response).toEqual({ documents: [], error: FOLDER_NOT_FOUND_ERROR });
  });

  it('returns the no-documents error for an empty workspace', async () => {
    vi.mocked(store.getWorkspace).mockResolvedValue(uploadRecord('ws-empty', []));

    const api = await installApi();
    const response = await api.folder.scanFolder('ws-empty');

    expect(response).toEqual({
      documents: [],
      error: 'No .docx files found in the selected folder',
    });
  });

  it('(f) applies the MAX_UNIQUE_MARKERS warn+slice cap exactly as on desktop', async () => {
    const text = Array.from({ length: MAX_UNIQUE_MARKERS + 1 }, (_, i) => `REPLACEME-M${i}`).join(' ');
    const bytes = await makeDocxBytes(text);
    vi.mocked(store.getWorkspace).mockResolvedValue(
      uploadRecord('ws-cap', [{ name: 'many.docx', blob: new Blob([new Uint8Array(bytes)]) }])
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const api = await installApi();
    const response = await api.folder.scanFolder('ws-cap');

    expect(warnSpy).toHaveBeenCalledWith(
      `Too many unique markers found (${MAX_UNIQUE_MARKERS + 1}). Maximum allowed is ${MAX_UNIQUE_MARKERS}.`
    );
    expect(response.documents[0]?.markers).toHaveLength(MAX_UNIQUE_MARKERS);

    warnSpy.mockRestore();
  });

  it('(g) upload tier: skips oversized files with the exact scanner message', async () => {
    const bigBlob = new Blob(['x']);
    Object.defineProperty(bigBlob, 'size', { value: MAX_DOCUMENT_SIZE + 1 });
    const okBytes = await makeDocxBytes('REPLACEME-OK1');
    vi.mocked(store.getWorkspace).mockResolvedValue(
      uploadRecord('ws-lim', [
        { name: 'big.docx', blob: bigBlob },
        { name: 'ok.docx', blob: new Blob([new Uint8Array(okBytes)]) },
      ])
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const api = await installApi();
    const response = await api.folder.scanFolder('ws-lim');

    expect(warnSpy).toHaveBeenCalledWith(
      `Skipping big.docx: File size exceeds maximum limit of ${MAX_DOCUMENT_SIZE} bytes`
    );
    expect(response.error).toBeUndefined();
    expect(response.documents.map((doc) => doc.name)).toEqual(['ok.docx']);
    expect(response.documents[0]?.markers).toEqual(['REPLACEME-OK1']);

    warnSpy.mockRestore();
  });

  it('(g) upload tier: surfaces the count-limit throw in the error envelope', async () => {
    const files: WorkspaceFile[] = Array.from({ length: MAX_SCAN_DOCUMENTS + 1 }, (_, i) => ({
      name: `f${i}.docx`,
      blob: new Blob(['x']),
    }));
    vi.mocked(store.getWorkspace).mockResolvedValue(uploadRecord('ws-count', files));

    const api = await installApi();
    const response = await api.folder.scanFolder('ws-count');

    expect(response).toEqual({
      documents: [],
      error: `Too many documents found (${MAX_SCAN_DOCUMENTS + 1}). Maximum allowed is ${MAX_SCAN_DOCUMENTS}.`,
    });
  });
});

// ============================================================================
// FOLDER: reopenLast
// ============================================================================

describe('Web Adapter: folder.reopenLast', () => {
  it("returns {folderPath: null, error: 'Folder not found'} for an unknown workspace id", async () => {
    const api = await installApi();
    await api.settings.saveSettings({ settings: { lastFolder: 'stale-id' } });

    const result = await api.folder.reopenLast?.();

    expect(result).toEqual({ folderPath: null, error: 'Folder not found' });
  });

  it("returns {folderPath: null, error: 'Folder not found'} when no lastFolder is set", async () => {
    const api = await installApi();

    const result = await api.folder.reopenLast?.();

    expect(result).toEqual({ folderPath: null, error: 'Folder not found' });
  });

  it("returns {folderPath: null, error: 'Folder permission was denied'} when regrant is denied", async () => {
    const handle = new FakeDirectoryHandle('Templates');
    handle.queryState = 'prompt';
    handle.requestState = 'denied';
    vi.mocked(store.getWorkspace).mockResolvedValue(fssRecord('ws-fss', handle));

    const api = await installApi();
    await api.settings.saveSettings({ settings: { lastFolder: 'ws-fss' } });

    const result = await api.folder.reopenLast?.();

    expect(result).toEqual({ folderPath: null, error: 'Folder permission was denied' });
  });

  it('reopens an fss workspace whose permission is already granted', async () => {
    const handle = new FakeDirectoryHandle('Templates').addFile(
      await makeDocxFile('a.docx', 'REPLACEME-A')
    );
    vi.mocked(store.getWorkspace).mockResolvedValue(fssRecord('ws-fss', handle));

    const api = await installApi();
    await api.settings.saveSettings({ settings: { lastFolder: 'ws-fss' } });

    const result = await api.folder.reopenLast?.();

    expect(result).toEqual({ folderPath: 'ws-fss' });
    expect(handle.requestPermissionCalls).toBe(0);
  });

  it('reopens an upload workspace directly without touching permissions', async () => {
    const workspace = await store.createWorkspace({ kind: 'upload', name: 'U', files: [] });
    const api = await installApi();
    await api.settings.saveSettings({ settings: { lastFolder: workspace.id } });

    const result = await api.folder.reopenLast?.();

    expect(result).toEqual({ folderPath: workspace.id });
  });
});

// ============================================================================
// FOLDER: ingestDroppedItems
// ============================================================================

describe('Web Adapter: folder.ingestDroppedItems', () => {
  it('creates a workspace from the drop and updates the name cache', async () => {
    const directory = makeDirectoryEntry('DroppedFolder', [[makeFileEntry('x.docx')]]);

    const api = await installApi();
    const result = await api.folder.ingestDroppedItems?.(makeItems([directory]));

    expect(result?.folderPath).toMatch(UUID_PATTERN);
    if (result?.folderPath == null) {
      throw new Error('expected a folderPath');
    }
    expect(adapter.getWorkspaceName(result.folderPath)).toBe('DroppedFolder');

    const stored = await store.listWorkspaces();
    expect(stored.map((ws) => ws.name)).toContain('DroppedFolder');
  });

  it('resolves {folderPath: null} for a non-directory drop', async () => {
    const api = await installApi();

    const result = await api.folder.ingestDroppedItems?.(makeItems([makeFileEntry('x.docx')]));

    expect(result).toEqual({ folderPath: null });
  });
});

// ============================================================================
// STUBS: updater, window, events, document
// ============================================================================

describe('Web Adapter: updater stub', () => {
  it('(a) useUpdater exposes no visible UI state against the shim updater', async () => {
    const api = await installApi();

    const snapshot = await api.updater.getUpdateState();
    expect(snapshot).toEqual({
      supported: false,
      status: { status: 'idle' },
      currentVersion: APP_VERSION,
    });
    await expect(api.updater.installUpdate()).resolves.toEqual({ success: false });
    await expect(api.updater.openReleasesPage()).resolves.toEqual({ success: false });

    let updaterState: ReturnType<typeof useUpdater> | undefined;
    const Host = defineComponent({
      setup() {
        updaterState = useUpdater();
        return () => h('div');
      },
    });

    mount(Host);
    await flushPromises();

    // The supported:false path renders nothing: no visible state, no
    // suggested action, snackbar stays hidden.
    expect(updaterState?.visible.value).toBe(false);
    expect(updaterState?.status.value).toBe('idle');
    expect(updaterState?.suggestedAction.value).toBeNull();
  });
});

describe('Web Adapter: stub members', () => {
  it('document.getDocuments resolves empty (shape stub)', async () => {
    const api = await installApi();

    await expect(api.document.getDocuments('ws-1')).resolves.toEqual({ documents: [] });
  });

  it('checkOutputFolder always passes (downloads never overwrite)', async () => {
    const api = await installApi();

    await expect(api.folder.checkOutputFolder('src-ws', 'out')).resolves.toEqual({
      success: true,
      existingDocuments: [],
    });
  });

  it('replaceDocuments on an unknown workspace id fails in the response envelope', async () => {
    const api = await installApi();

    const result = await api.document.replaceDocuments('missing-id', []);

    expect(result).toEqual({ success: false, processed: 0, error: FOLDER_NOT_FOUND_ERROR });
  });

  it('window and events members are callable no-ops', async () => {
    const api = await installApi();

    expect(api.window.minimize()).toBeUndefined();
    expect(api.window.maximize()).toBeUndefined();
    expect(api.window.close()).toBeUndefined();

    api.events.onSettingsChanged(() => {});
    api.events.removeSettingsChangedListener();
    api.events.onDocumentUpdated(() => {});
    api.events.removeDocumentUpdatedListener();
    api.events.onError(() => {});
    api.events.removeErrorListener();
    api.events.removeAllListeners('settings:changed');
    api.updater.onUpdaterStatus(() => {});
    api.updater.removeUpdaterStatusListener();
  });
});
