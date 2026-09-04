/**
 * Folder Upload Tier — all-browsers workspace ingestion.
 *
 * A single hidden `<input type="file" webkitdirectory>` (created once,
 * attached to document.body, reused across clicks) backs openFolderPicker;
 * drag-and-drop folders are ingested through ingestDroppedItems via the
 * DataTransferItem.webkitGetAsEntry() API. Both paths snapshot the TOP-LEVEL
 * .docx documents (non-recursive — parity with the desktop scanner; files
 * inside subdirectories are excluded, not traversed) into an IndexedDB
 * upload workspace, seeding `.replacement-values.json` when present.
 */

import {
  DOCUMENT_EXTENSION,
  SAVE_FILE_NAME,
} from '../../../shared/constants';
import {
  isValidReplacementValuesFile,
  validateReplacementValuesFile,
} from '../../../shared/utils/validation';
import type { ReplacementValuesFile } from '../../../shared/types';
import {
  createWorkspace,
  type WorkspaceRecord,
  type WorkspaceFile,
} from './workspace-store';

const FALLBACK_WORKSPACE_NAME = 'Uploaded folder';

/** The persistent hidden upload input; created once, reused across clicks. */
let uploadInput: HTMLInputElement | null = null;

// ============================================================================
// HIDDEN INPUT
// ============================================================================

/**
 * Create (once) the hidden folder-upload input and keep it attached to
 * document.body. The `webkitdirectory` attribute is the element's stable DOM
 * selector (no id/class); the element is display:none but never detached so
 * the native file chooser is reachable on every click.
 */
export function ensureUploadInput(): HTMLInputElement {
  if (uploadInput !== null) {
    return uploadInput;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.setAttribute('webkitdirectory', '');
  input.style.display = 'none';
  document.body.appendChild(input);
  uploadInput = input;
  return input;
}

// ============================================================================
// ENTRY NARROWING (runtime DOM properties, not test hooks)
// ============================================================================

function isDirectoryEntry(entry: FileSystemEntry): entry is FileSystemDirectoryEntry {
  return entry.isDirectory;
}

function isFileEntry(entry: FileSystemEntry): entry is FileSystemFileEntry {
  return entry.isFile;
}

// ============================================================================
// SHARED SELECTION -> WORKSPACE LOGIC
// ============================================================================

/** Extension check identical to the desktop scanner (extname equality). */
function hasDocumentExtension(fileName: string): boolean {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 && fileName.slice(dot).toLowerCase() === DOCUMENT_EXTENSION;
}

/**
 * Top-level = no subdirectory segment. Real webkitdirectory uploads carry
 * `<root>/<name>` paths; CDP-injected files carry an empty webkitRelativePath
 * and are treated as top-level (depth is unknowable, dialog parity).
 */
function isTopLevelUpload(file: File): boolean {
  if (file.webkitRelativePath === '') {
    return true;
  }
  return file.webkitRelativePath.split('/').length <= 2;
}

/**
 * Workspace name = first webkitRelativePath segment of the first file, with
 * the fallback chain firstFile.name -> 'Uploaded folder' for injected files
 * (empty path) and empty selections.
 */
function uploadWorkspaceName(files: File[]): string {
  const firstFile = files[0];
  if (firstFile === undefined) {
    return FALLBACK_WORKSPACE_NAME;
  }
  const rootSegment = firstFile.webkitRelativePath.split('/')[0];
  if (rootSegment !== '') {
    return rootSegment;
  }
  return firstFile.name !== '' ? firstFile.name : FALLBACK_WORKSPACE_NAME;
}

/**
 * Parse and validate an uploaded `.replacement-values.json`. Rejection
 * wording mirrors storage.ts with the file NAME substituted where desktop
 * embeds a filesystem path; a rejected seed still yields a workspace
 * (saveFile undefined).
 */
async function seedSaveFile(
  saveFileSource: File
): Promise<ReplacementValuesFile | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await saveFileSource.text());
  } catch {
    console.warn(`Failed to parse save file at ${SAVE_FILE_NAME}: Invalid JSON format`);
    return undefined;
  }
  if (isValidReplacementValuesFile(parsed)) {
    return parsed;
  }
  const errorMessages = validateReplacementValuesFile(parsed)
    .errors.map((error) => `${error.path}: ${error.message}`)
    .join(', ');
  console.warn(`Save file validation failed at ${SAVE_FILE_NAME}: ${errorMessages}`);
  return undefined;
}

/** Persist a new upload workspace from the selected/dropped top-level files. */
async function createUploadWorkspace(
  name: string,
  documents: File[],
  saveFileSource: File | undefined
): Promise<WorkspaceRecord> {
  const saveFile =
    saveFileSource !== undefined ? await seedSaveFile(saveFileSource) : undefined;
  const files: WorkspaceFile[] = documents.map((file) => ({ name: file.name, blob: file }));
  return createWorkspace({ kind: 'upload', name, files, saveFile });
}

// ============================================================================
// FOLDER PICKER (hidden webkitdirectory input)
// ============================================================================

/** Snapshot the input's current selection into a persisted workspace. */
async function createWorkspaceFromSelection(
  input: HTMLInputElement
): Promise<WorkspaceRecord> {
  const files = input.files !== null ? Array.from(input.files) : [];
  const saveFileSource = files.find(
    (file) => isTopLevelUpload(file) && file.name === SAVE_FILE_NAME
  );
  const documents = files.filter(
    (file) => isTopLevelUpload(file) && hasDocumentExtension(file.name)
  );
  return createUploadWorkspace(uploadWorkspaceName(files), documents, saveFileSource);
}

/**
 * Open the folder picker (the caller runs inside a user-gesture handler).
 * Resolves with a persisted upload workspace on selection, or null when the
 * picker is dismissed — desktop dialog-cancel parity: the pending promise
 * always settles so the caller's loading overlay clears, and the persistent
 * input remains available for retry.
 */
export function openFolderPicker(): Promise<WorkspaceRecord | null> {
  const input = ensureUploadInput();
  // Only the empty string is settable on file inputs; clearing lets a retry
  // pick the SAME folder again (change would not re-fire on an equal value).
  input.value = '';
  return new Promise<WorkspaceRecord | null>((resolve, reject) => {
    const removeListeners = (): void => {
      input.removeEventListener('change', onChange);
      input.removeEventListener('cancel', onCancel);
    };
    const onChange = (): void => {
      removeListeners();
      void createWorkspaceFromSelection(input).then(resolve, reject);
    };
    const onCancel = (): void => {
      removeListeners();
      resolve(null);
    };
    input.addEventListener('change', onChange);
    input.addEventListener('cancel', onCancel);
    input.click();
  });
}

// ============================================================================
// DRAG-AND-DROP INGESTION (webkitGetAsEntry traversal)
// ============================================================================

/**
 * Read every entry of a directory, looping readEntries until it returns an
 * empty batch (each call yields at most ~100 entries — the batching quirk).
 */
function readAllEntries(
  reader: FileSystemDirectoryReader
): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const entries: FileSystemEntry[] = [];
    const readNextBatch = (): void => {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) {
            resolve(entries);
            return;
          }
          entries.push(...batch);
          readNextBatch();
        },
        (err: DOMException) => reject(err)
      );
    };
    readNextBatch();
  });
}

/** Read the File behind a FileSystemFileEntry (callback API -> Promise). */
function readEntryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(
      (file) => resolve(file),
      (err: DOMException) => reject(err)
    );
  });
}

/**
 * Ingest a dropped directory. Traverses the dropped directory's TOP LEVEL
 * only (subdirectories are skipped, not traversed), applies the same
 * extension filtering and save-file seeding as the picker, and names the
 * workspace after the directory entry. Returns null for a non-directory
 * drop or an empty directory.
 */
export async function ingestDroppedItems(
  items: DataTransferItemList
): Promise<WorkspaceRecord | null> {
  const entries = Array.from(items, (item) => item.webkitGetAsEntry()).filter(
    (entry): entry is FileSystemEntry => entry !== null
  );
  const directory = entries.find(isDirectoryEntry);
  if (directory === undefined) {
    return null;
  }
  const childEntries = await readAllEntries(directory.createReader());
  if (childEntries.length === 0) {
    return null;
  }
  const fileEntries = childEntries.filter(isFileEntry);
  const documents: File[] = [];
  for (const entry of fileEntries) {
    if (hasDocumentExtension(entry.name)) {
      documents.push(await readEntryFile(entry));
    }
  }
  const saveFileEntry = fileEntries.find((entry) => entry.name === SAVE_FILE_NAME);
  const saveFileSource =
    saveFileEntry !== undefined ? await readEntryFile(saveFileEntry) : undefined;
  return createUploadWorkspace(directory.name, documents, saveFileSource);
}
