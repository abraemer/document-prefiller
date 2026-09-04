/**
 * File System Access live-folder tier (Chromium only).
 *
 * The directory handle is always acquired with mode 'read' — the web variant
 * never writes to the user's folder; outputs are ZIP downloads. Handle
 * persistence is simply the workspace record: FileSystemDirectoryHandle is
 * structured-cloneable, so workspace-store persists it as-is.
 */

import {
  DOCUMENT_EXTENSION,
  MAX_DOCUMENT_SIZE,
  MAX_SCAN_DOCUMENTS,
  SAVE_FILE_NAME,
} from '../../../shared/constants';
import { isValidReplacementValuesFile } from '../../../shared/utils/validation';
import type { ReplacementValuesFile } from '../../../shared/types';
import { createWorkspace } from './workspace-store';
import type { WorkspaceRecord } from './workspace-store';

/** A top-level .docx document resolved from a live-folder handle */
export interface FssDocumentFile {
  /** File name (top-level only, e.g. 'template.docx') */
  name: string;
  /** Live file handle contents; `.size` is metadata, not a full read */
  file: File;
}

/**
 * Extension filter with path.extname parity: a leading-dot name like '.docx'
 * has no extension for path.extname, so only a dot at index > 0 starts one.
 */
function hasDocumentExtension(name: string): boolean {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) {
    return false;
  }
  return name.slice(dot).toLowerCase() === DOCUMENT_EXTENSION;
}

/**
 * Read `.replacement-values.json` from the picked folder ONCE at workspace
 * creation. Absent or invalid → undefined; never throws (seeding is
 * best-effort — an unreadable save file must not block folder selection).
 */
async function readSeededSaveFile(
  handle: FileSystemDirectoryHandle
): Promise<ReplacementValuesFile | undefined> {
  try {
    const fileHandle = await handle.getFileHandle(SAVE_FILE_NAME, { create: false });
    const file = await fileHandle.getFile();
    const parsed: unknown = JSON.parse(await file.text());
    return isValidReplacementValuesFile(parsed) ? parsed : undefined;
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) {
      console.warn(`Failed to seed save file from ${SAVE_FILE_NAME}:`, error);
    }
    return undefined;
  }
}

/**
 * Open the directory picker and persist a live-folder workspace record.
 *
 * User-CANCEL resolves null silently — desktop parity (the native dialog
 * cancel returns `{folderPath: null}` and App.vue skips on null); any other
 * rejection is rethrown.
 */
export async function pickWorkspace(): Promise<WorkspaceRecord | null> {
  let handle: FileSystemDirectoryHandle;
  try {
    // Read-only by design: outputs are downloads, never folder writes.
    handle = await window.showDirectoryPicker({ mode: 'read' });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return null;
    }
    throw error;
  }
  const saveFile = await readSeededSaveFile(handle);
  return createWorkspace({ kind: 'fss', name: handle.name, handle, saveFile });
}

/**
 * List top-level .docx files in the live folder with scanner-identical
 * limit semantics: the size limit SKIPS the file with a warning, the count
 * limit THROWS.
 */
export async function listDocx(handle: FileSystemDirectoryHandle): Promise<FssDocumentFile[]> {
  const documents: FssDocumentFile[] = [];

  for await (const entry of handle.values()) {
    if (entry.kind !== 'file') {
      continue; // recursive=false parity: subdirectory handles are skipped
    }
    if (!hasDocumentExtension(entry.name)) {
      continue;
    }
    try {
      const file = await (await handle.getFileHandle(entry.name)).getFile();
      if (file.size > MAX_DOCUMENT_SIZE) {
        console.warn(
          `Skipping ${entry.name}: File size exceeds maximum limit of ${MAX_DOCUMENT_SIZE} bytes`
        );
        continue;
      }
      documents.push({ name: entry.name, file });
    } catch (error) {
      console.warn(`Skipping ${entry.name}: ${error}`);
    }
  }

  if (documents.length > MAX_SCAN_DOCUMENTS) {
    throw new Error(
      `Too many documents found (${documents.length}). Maximum allowed is ${MAX_SCAN_DOCUMENTS}.`
    );
  }

  return documents;
}

/**
 * Ensure read permission on a persisted handle.
 *
 * `requestPermission` MUST run inside a user gesture (a click/key handler);
 * callers are responsible for invoking this from gesture context only —
 * outside one, the browser rejects the permission request outright.
 */
export async function regrant(handle: FileSystemDirectoryHandle): Promise<boolean> {
  if ((await handle.queryPermission({ mode: 'read' })) === 'granted') {
    return true;
  }
  return (await handle.requestPermission({ mode: 'read' })) === 'granted';
}

/**
 * Feature-detect the File System Access API.
 *
 * NOT `'showDirectoryPicker' in window`: the API is a WebIDL interface
 * operation on Window.prototype, so `delete window.showDirectoryPicker`
 * only touches own properties (silent no-op) and an own-property shadow
 * with value undefined keeps `in` true. The typeof check correctly yields
 * 'undefined' under both shadowing and absence.
 */
export function isFssAvailable(): boolean {
  return typeof window.showDirectoryPicker === 'function';
}
