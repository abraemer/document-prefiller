/**
 * Unit Tests for Web Workspace Store (IndexedDB persistence)
 *
 * `fake-indexeddb` installs a fake IndexedDB on import. Each test gets a
 * fresh IDBFactory plus a fresh module instance (vi.resetModules) so the
 * store's cached connection can never leak records across tests.
 */

import 'fake-indexeddb';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReplacementValuesFile } from '@/shared/types';

let store: typeof import('@/renderer/platform/web/workspace-store');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * FakeDirectoryHandle keeps data (kind/name) as own cloneable properties and
 * all methods on the prototype: fake-indexeddb structured-clones puts, so
 * function-valued OWN properties would throw DataCloneError, while prototype
 * methods are simply stripped by the clone (as in a real browser's IDB).
 */
class FakeDirectoryHandle implements FileSystemDirectoryHandle {
  readonly kind = 'directory' as const;
  constructor(readonly name: string) {}

  async isSameEntry(): Promise<boolean> {
    return false;
  }
  async queryPermission(): Promise<PermissionState> {
    return 'granted';
  }
  async requestPermission(): Promise<PermissionState> {
    return 'granted';
  }
  async getFileHandle(): Promise<FileSystemFileHandle> {
    throw new Error('not used in this test');
  }
  async getDirectoryHandle(): Promise<FileSystemDirectoryHandle> {
    throw new Error('not used in this test');
  }
  async removeEntry(): Promise<void> {}
  async resolve(): Promise<string[] | null> {
    return null;
  }
  values(): AsyncIterableIterator<FileSystemHandle> {
    return (async function* () {})();
  }
}

function fakeDirectoryHandle(name: string): FileSystemDirectoryHandle {
  return new FakeDirectoryHandle(name);
}

function makeSaveFile(values: Record<string, string>): ReplacementValuesFile {
  return { prefix: 'REPLACEME-', values, version: '1.0', lastModified: '2026-09-04T10:00:00.000Z' };
}

beforeEach(async () => {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  store = await import('@/renderer/platform/web/workspace-store');
});

describe('Web Workspace Store', () => {
  describe('createWorkspace', () => {
    it('should create and round-trip an fss workspace with its handle', async () => {
      const created = await store.createWorkspace({
        kind: 'fss',
        name: 'Templates',
        handle: fakeDirectoryHandle('Templates'),
      });

      expect(created.id).toMatch(UUID_PATTERN);
      expect(created.kind).toBe('fss');
      expect(created.name).toBe('Templates');
      expect(created.saveFile).toBeUndefined();

      const fetched = await store.getWorkspace(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.kind).toBe('fss');
      if (fetched?.kind === 'fss') {
        expect(fetched.handle.kind).toBe('directory');
        expect(fetched.handle.name).toBe('Templates');
      }
    });

    it('should create and round-trip an upload workspace with file blobs', async () => {
      const created = await store.createWorkspace({
        kind: 'upload',
        name: 'Upload',
        files: [{ name: 'a.docx', blob: new Blob(['bytes']) }],
      });

      expect(created.kind).toBe('upload');
      if (created.kind === 'upload') {
        expect(created.files[0]?.blob).toBeInstanceOf(Blob);
        expect(created.files[0]?.blob.size).toBe(5);
      }

      // fake-indexeddb's structuredClone degrades jsdom Blobs to plain objects
      // (real browsers preserve Blob identity per spec) — so the roundtrip
      // asserts the file entry and blob presence, not Blob identity.
      const fetched = await store.getWorkspace(created.id);
      expect(fetched?.kind).toBe('upload');
      if (fetched?.kind === 'upload') {
        expect(fetched.files).toHaveLength(1);
        expect(fetched.files[0]?.name).toBe('a.docx');
        expect(typeof fetched.files[0]?.blob).toBe('object');
      }
    });

    it('should seed the save file when provided at creation', async () => {
      const saveFile = makeSaveFile({ NAME: 'Jane' });
      const created = await store.createWorkspace({
        kind: 'fss',
        name: 'WithValues',
        handle: fakeDirectoryHandle('WithValues'),
        saveFile,
      });

      const fetched = await store.getWorkspace(created.id);
      expect(fetched?.saveFile).toEqual(saveFile);
    });
  });

  describe('getWorkspace', () => {
    it('should return null for an unknown id', async () => {
      const result = await store.getWorkspace('does-not-exist');
      expect(result).toBeNull();
    });

    it('should return null for a malformed stored record', async () => {
      // Write a raw record that fails the read-boundary parse (missing handle)
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = globalThis.indexedDB.open('document-prefiller', 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore('workspaces', { keyPath: 'id' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('workspaces', 'readwrite');
        tx.objectStore('workspaces').put({ id: 'broken', name: 'x', kind: 'fss', lastModified: 'now' });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      expect(await store.getWorkspace('broken')).toBeNull();
      expect(await store.listWorkspaces()).toEqual([]);
    });
  });

  describe('updateWorkspace', () => {
    it('should persist name changes and bump lastModified', async () => {
      const created = await store.createWorkspace({
        kind: 'upload',
        name: 'Original',
        files: [{ name: 'a.docx', blob: new Blob(['x']) }],
      });

      const updated = await store.updateWorkspace(created.id, { name: 'Renamed' });
      expect(updated?.name).toBe('Renamed');
      expect(Date.parse(updated?.lastModified ?? '')).toBeGreaterThanOrEqual(
        Date.parse(created.lastModified)
      );

      const fetched = await store.getWorkspace(created.id);
      expect(fetched?.name).toBe('Renamed');
      if (fetched?.kind === 'upload') {
        expect(fetched.files).toHaveLength(1);
      }
    });

    it('should return null when updating an unknown id', async () => {
      const updated = await store.updateWorkspace('missing', { name: 'X' });
      expect(updated).toBeNull();
    });
  });

  describe('deleteWorkspace', () => {
    it('should delete a workspace and leave others untouched', async () => {
      const first = await store.createWorkspace({
        kind: 'upload',
        name: 'First',
        files: [],
      });
      const second = await store.createWorkspace({
        kind: 'fss',
        name: 'Second',
        handle: fakeDirectoryHandle('Second'),
      });

      await store.deleteWorkspace(first.id);

      expect(await store.getWorkspace(first.id)).toBeNull();
      expect(await store.getWorkspace(second.id)).not.toBeNull();
    });
  });

  describe('listWorkspaces', () => {
    it('should list all stored workspaces', async () => {
      const fss = await store.createWorkspace({
        kind: 'fss',
        name: 'Live',
        handle: fakeDirectoryHandle('Live'),
      });
      const upload = await store.createWorkspace({
        kind: 'upload',
        name: 'Snapshot',
        files: [{ name: 'a.docx', blob: new Blob(['x']) }],
      });

      const all = await store.listWorkspaces();
      expect(all).toHaveLength(2);
      const ids = all.map((record) => record.id);
      expect(ids).toContain(fss.id);
      expect(ids).toContain(upload.id);
    });

    it('should return an empty list for an empty store', async () => {
      expect(await store.listWorkspaces()).toEqual([]);
    });
  });

  describe('upsertSaveFile', () => {
    it('should insert and then replace the save file', async () => {
      const created = await store.createWorkspace({
        kind: 'upload',
        name: 'Values',
        files: [{ name: 'a.docx', blob: new Blob(['x']) }],
      });

      const initial = makeSaveFile({ NAME: 'first' });
      expect(await store.upsertSaveFile(created.id, initial)).toBe(true);

      const fetched = await store.getWorkspace(created.id);
      expect(fetched?.saveFile).toEqual(initial);

      const replaced = makeSaveFile({ NAME: 'second' });
      expect(await store.upsertSaveFile(created.id, replaced)).toBe(true);

      const refetched = await store.getWorkspace(created.id);
      expect(refetched?.saveFile).toEqual(replaced);
    });

    it('should return false for an unknown workspace id', async () => {
      expect(await store.upsertSaveFile('missing', makeSaveFile({ NAME: 'x' }))).toBe(false);
    });
  });
});
