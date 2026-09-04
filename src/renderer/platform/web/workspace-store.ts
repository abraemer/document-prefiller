/**
 * Web Workspace Store — IndexedDB persistence for web-variant workspaces.
 * Database `document-prefiller` (version 1, no migrations: nothing shipped
 * yet), object store `workspaces` (keyPath `id`). FSS directory handles are
 * structured-cloneable and stored as-is; upload workspaces persist uploaded
 * files as Blobs.
 */

import { isValidReplacementValuesFile } from '../../../shared/utils/validation';
import type { ReplacementValuesFile } from '../../../shared/types';

/** A single uploaded document snapshot (upload-tier workspaces only) */
export interface WorkspaceFile {
  /** Document file name (top-level only, e.g. 'template.docx') */
  name: string;
  /** Document contents snapshot */
  blob: Blob;
}

/** Fields shared by every workspace record */
interface WorkspaceRecordBase {
  /** Stable workspace identifier (crypto.randomUUID()); IDB key and web `folderPath` */
  id: string;
  /** Human-readable workspace display name */
  name: string;
  /** Seeded/last-known save file, validated at the IDB read boundary */
  saveFile?: ReplacementValuesFile;
  /** ISO timestamp of the last mutation */
  lastModified: string;
}

/** Live-folder workspace (Chromium File System Access tier) */
export interface FssWorkspaceRecord extends WorkspaceRecordBase {
  kind: 'fss';
  /** Read-only directory handle; persisted as-is (structured-cloneable) */
  handle: FileSystemDirectoryHandle;
}

/** Uploaded-copy workspace (all-browsers tier) */
export interface UploadWorkspaceRecord extends WorkspaceRecordBase {
  kind: 'upload';
  /** Snapshot of the uploaded top-level documents */
  files: WorkspaceFile[];
}

/** Exactly one payload shape per record — narrow with `record.kind` */
export type WorkspaceRecord = FssWorkspaceRecord | UploadWorkspaceRecord;

/** createWorkspace input; the union enforces the payload rule at the boundary */
export type CreateWorkspaceInput =
  | {
      kind: 'fss';
      name: string;
      handle: FileSystemDirectoryHandle;
      saveFile?: ReplacementValuesFile;
    }
  | {
      kind: 'upload';
      name: string;
      files: WorkspaceFile[];
      saveFile?: ReplacementValuesFile;
    };

/** Mutable fields for updateWorkspace (payload fields cannot be cleared) */
export interface UpdateWorkspaceChanges {
  name?: string;
  handle?: FileSystemDirectoryHandle;
  files?: WorkspaceFile[];
  saveFile?: ReplacementValuesFile;
}

const DB_NAME = 'document-prefiller';
const DB_VERSION = 1;
const STORE_NAME = 'workspaces';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise === null) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeTransaction(write: (store: IDBObjectStore) => void): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    write(tx.objectStore(STORE_NAME));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Read-modify-write one record in a single transaction; null when unknown/malformed */
async function mutateWorkspaceRecord(
  id: string,
  apply: (record: WorkspaceRecord) => WorkspaceRecord
): Promise<WorkspaceRecord | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const getRequest = tx.objectStore(STORE_NAME).get(id);
    let result: WorkspaceRecord | null = null;
    getRequest.onsuccess = () => {
      const existing = getRequest.result;
      if (isWorkspaceRecord(existing)) {
        result = apply(existing);
        tx.objectStore(STORE_NAME).put(result);
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function applyWorkspaceChanges(
  record: WorkspaceRecord,
  changes: UpdateWorkspaceChanges,
  timestamp: string
): WorkspaceRecord {
  if (record.kind === 'fss') {
    return {
      ...record,
      name: changes.name ?? record.name,
      handle: changes.handle ?? record.handle,
      saveFile: changes.saveFile ?? record.saveFile,
      lastModified: timestamp,
    };
  }
  return {
    ...record,
    name: changes.name ?? record.name,
    files: changes.files ?? record.files,
    saveFile: changes.saveFile ?? record.saveFile,
    lastModified: timestamp,
  };
}

// ============================================================================
// READ-BOUNDARY PARSING
// IDB contents are untrusted (schema drift, user edits); records are parsed
// into the typed union at the boundary with `in`-narrowing, no casts.
// Payload checks are envelope-only (kind/name presence): IndexedDB
// structured clone strips prototypes, so method members are not observable
// on stored values, and jsdom test environments degrade Blobs to plain
// objects. Use-time errors surface the real API contract instead.
// ============================================================================

function isDirectoryHandle(value: unknown): value is FileSystemDirectoryHandle {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'kind' in value &&
    value.kind === 'directory' &&
    'name' in value &&
    typeof value.name === 'string'
  );
}

function isWorkspaceFileList(value: unknown): value is WorkspaceFile[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (file) =>
      typeof file === 'object' &&
      file !== null &&
      'name' in file &&
      typeof file.name === 'string' &&
      'blob' in file &&
      typeof file.blob === 'object' &&
      file.blob !== null
  );
}

function isWorkspaceRecord(value: unknown): value is WorkspaceRecord {
  if (typeof value !== 'object' || value === null) return false;
  if (!('id' in value) || typeof value.id !== 'string') return false;
  if (!('name' in value) || typeof value.name !== 'string') return false;
  if (!('lastModified' in value) || typeof value.lastModified !== 'string') return false;
  if ('saveFile' in value && value.saveFile !== undefined && !isValidReplacementValuesFile(value.saveFile)) {
    return false;
  }
  if (!('kind' in value)) return false;
  if (value.kind === 'fss') {
    return 'handle' in value && isDirectoryHandle(value.handle);
  }
  if (value.kind === 'upload') {
    return 'files' in value && isWorkspaceFileList(value.files);
  }
  return false;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/** Create and persist a new workspace record; returns the stored record. */
export async function createWorkspace(input: CreateWorkspaceInput): Promise<WorkspaceRecord> {
  const timestamp = new Date().toISOString();
  const record: WorkspaceRecord =
    input.kind === 'fss'
      ? {
          id: crypto.randomUUID(),
          kind: 'fss',
          name: input.name,
          handle: input.handle,
          saveFile: input.saveFile,
          lastModified: timestamp,
        }
      : {
          id: crypto.randomUUID(),
          kind: 'upload',
          name: input.name,
          files: input.files,
          saveFile: input.saveFile,
          lastModified: timestamp,
        };
  await writeTransaction((store) => {
    store.put(record);
  });
  return record;
}

/** Get a workspace by id; null when unknown or the stored record is malformed. */
export async function getWorkspace(id: string): Promise<WorkspaceRecord | null> {
  const db = await openDatabase();
  const result = await requestResult<unknown>(
    db.transaction(STORE_NAME).objectStore(STORE_NAME).get(id)
  );
  return isWorkspaceRecord(result) ? result : null;
}

/** Update mutable fields of a workspace; bumps lastModified. Null when unknown. */
export async function updateWorkspace(
  id: string,
  changes: UpdateWorkspaceChanges
): Promise<WorkspaceRecord | null> {
  const timestamp = new Date().toISOString();
  return mutateWorkspaceRecord(id, (record) => applyWorkspaceChanges(record, changes, timestamp));
}

/** Delete a workspace by id. */
export async function deleteWorkspace(id: string): Promise<void> {
  await writeTransaction((store) => {
    store.delete(id);
  });
}

/** List all workspaces (no ordering guarantee). Malformed records are skipped. */
export async function listWorkspaces(): Promise<WorkspaceRecord[]> {
  const db = await openDatabase();
  const results = await requestResult<unknown[]>(
    db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll()
  );
  return results.filter(isWorkspaceRecord);
}

/**
 * Insert or replace the save file of a workspace; bumps lastModified.
 * Returns false when the workspace id is unknown.
 */
export async function upsertSaveFile(id: string, saveFile: ReplacementValuesFile): Promise<boolean> {
  const timestamp = new Date().toISOString();
  const updated = await mutateWorkspaceRecord(id, (record) =>
    applyWorkspaceChanges(record, { saveFile }, timestamp)
  );
  return updated !== null;
}
