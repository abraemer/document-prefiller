/**
 * Web Adapter — the browser-side window.api shim (PlatformAPI).
 *
 * Installs the same surface the desktop preload exposes via contextBridge:
 * workspaces live in IndexedDB (workspace-store), settings in localStorage
 * (settings-store), and outputs are delivered as ZIP downloads (replace +
 * zip + download). The web `folderPath` is the stable workspace ID, never
 * the display name — name collisions make name-keying unsafe.
 *
 * Name cache: template bindings are synchronous (App.vue display line), so
 * a synchronous Map<id, name> is populated at install from listWorkspaces()
 * and updated on every workspace creation. `installWebApi()` returns
 * `{ ready }` resolving once the cache is populated; the population is
 * wrapped in a catch that resolves with an EMPTY cache so an IDB open
 * failure can never leave `ready` pending (the app mount is chained on it).
 *
 * allow: SIZE_OK — one-file assembly of the frozen PlatformAPI surface
 * (todo 6): every member's shape is dictated by the contract, mirroring the
 * native twin preload/index.ts (274 pure LOC). A split would need a third
 * file outside todo 12's pinned deliverable set.
 */

import type {
  CheckOutputFolderResponse,
  DocumentMarker,
  GetDocumentsResponse,
  PlatformAPI,
  ReplacementValuesFile,
  ReplaceDocumentsResponse,
  ScanFolderResponse,
  SelectFolderResponse,
  UpdaterActionResponse,
  UpdaterStateResponse,
} from '../../../shared/types';
import {
  APP_VERSION,
  DEFAULT_PREFIX,
  FOLDER_NOT_FOUND_ERROR,
  MAX_DOCUMENT_SIZE,
  MAX_SCAN_DOCUMENTS,
  NO_DOCUMENTS_FOUND_ERROR,
} from '../../../shared/constants';
import { extractTextFromDocx } from '../../../core/docx-text';
import { detectMarkers } from '../../../core/marker-detection';
import { dedupeMarkers } from '../../../core/scan-support';
import {
  getWorkspace,
  listWorkspaces,
  upsertSaveFile,
  type WorkspaceFile,
  type WorkspaceRecord,
} from './workspace-store';
import { isFssAvailable, listDocx, pickWorkspace, regrant } from './fss-folder';
import { ensureUploadInput, ingestDroppedItems, openFolderPicker } from './upload-folder';
import { replaceWorkspaceDocuments } from './replace';
import { getSettings, saveSettings } from './settings-store';

// ============================================================================
// NAME CACHE (synchronous — todo 14's displayFolderName reads it)
// ============================================================================

const workspaceNames = new Map<string, string>();

/** Synchronously look up a workspace display name; undefined on a cache miss. */
export function getWorkspaceName(id: string): string | undefined {
  return workspaceNames.get(id);
}

// ============================================================================
// SCAN HELPERS
// ============================================================================

/** A workspace .docx resolved to bytes, ready for marker detection. */
interface WorkspaceDocx {
  name: string;
  bytes: Uint8Array;
}

/**
 * Resolve the workspace's .docx set with scanner-identical limit semantics
 * for BOTH tiers: the size limit SKIPS the file with a warning, the count
 * limit THROWS (scanner.ts:55-59 / 127-133). fss-tier listDocx already
 * enforces both, so only the upload tier is enforced here.
 */
async function resolveWorkspaceDocx(workspace: WorkspaceRecord): Promise<WorkspaceDocx[]> {
  if (workspace.kind === 'fss') {
    const entries = await listDocx(workspace.handle);
    return Promise.all(
      entries.map(async (entry) => ({
        name: entry.name,
        bytes: new Uint8Array(await entry.file.arrayBuffer()),
      }))
    );
  }

  const withinSize: WorkspaceFile[] = [];
  for (const file of workspace.files) {
    if (file.blob.size > MAX_DOCUMENT_SIZE) {
      console.warn(
        `Skipping ${file.name}: File size exceeds maximum limit of ${MAX_DOCUMENT_SIZE} bytes`
      );
      continue;
    }
    withinSize.push(file);
  }

  if (withinSize.length > MAX_SCAN_DOCUMENTS) {
    throw new Error(
      `Too many documents found (${withinSize.length}). Maximum allowed is ${MAX_SCAN_DOCUMENTS}.`
    );
  }

  return Promise.all(
    withinSize.map(async (file) => ({
      name: file.name,
      bytes: new Uint8Array(await file.blob.arrayBuffer()),
    }))
  );
}

// ============================================================================
// INSTALL
// ============================================================================

/**
 * Assign window.api (the web shim) and start populating the name cache.
 *
 * The assignment is synchronous — app code importing this module statically
 * (todo 13) sees window.api defined before it runs. The returned `ready`
 * promise resolves when the cache is populated and NEVER rejects: an IDB
 * open failure settles it with an empty cache (getWorkspaceName then misses
 * and callers fall back to the raw workspace id).
 */
export function installWebApi(): { ready: Promise<void> } {
  // Attach the persistent hidden upload input once (upload tier, todo 10).
  ensureUploadInput();

  const ready = listWorkspaces()
    .then((workspaces) => {
      workspaceNames.clear();
      for (const workspace of workspaces) {
        workspaceNames.set(workspace.id, workspace.name);
      }
    })
    .catch((error) => {
      console.warn('Failed to load workspaces for the name cache:', error);
      workspaceNames.clear();
    });

  window.api = {
    folder: {
      /** Folder selection: FSS picker on Chromium, upload input elsewhere. */
      selectFolder: async (): Promise<SelectFolderResponse> => {
        const workspace = isFssAvailable() ? await pickWorkspace() : await openFolderPicker();
        if (workspace === null) {
          return { folderPath: null }; // user cancel — desktop dialog parity
        }
        workspaceNames.set(workspace.id, workspace.name);
        return { folderPath: workspace.id };
      },

      /**
       * Scan a workspace for documents and markers. Errors come back in the
       * response envelope (`{documents: [], error}`) — folder.ts parity.
       */
      scanFolder: async (id: string, prefix?: string): Promise<ScanFolderResponse> => {
        try {
          const workspace = await getWorkspace(id);
          if (workspace === null) {
            return { documents: [], error: FOLDER_NOT_FOUND_ERROR };
          }

          const effectivePrefix = prefix ?? DEFAULT_PREFIX;
          const docxFiles = await resolveWorkspaceDocx(workspace);
          if (docxFiles.length === 0) {
            return { documents: [], error: NO_DOCUMENTS_FOUND_ERROR };
          }

          // Map keyed by FILE NAME (scan-support contract); parse failures
          // warn and skip the file's markers, scanner.ts:71-84 parity.
          const documentMarkers = new Map<string, string[]>();
          for (const file of docxFiles) {
            try {
              documentMarkers.set(
                file.name,
                detectMarkers(await extractTextFromDocx(file.bytes), effectivePrefix)
              );
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Unknown error';
              console.error(`Error parsing ${file.name}:`, message);
            }
          }

          const markers = dedupeMarkers(documentMarkers, effectivePrefix);

          return {
            documents: docxFiles.map((file) => ({
              path: `${id}/${file.name}`,
              name: file.name,
              markers: markers
                .filter((marker) => marker.documents.includes(file.name))
                .map((marker) => marker.fullMarker),
            })),
          };
        } catch (error) {
          return {
            documents: [],
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },

      /** Downloads never overwrite — the check always passes. */
      checkOutputFolder: async (): Promise<CheckOutputFolderResponse> => ({
        success: true,
        existingDocuments: [],
      }),

      /**
       * Reopen the last workspace (settings.lastFolder holds the id). FSS
       * handles must re-request read permission — always invoked from the
       * banner click's user-gesture context.
       */
      reopenLast: async (): Promise<SelectFolderResponse> => {
        const settings = await getSettings();
        const id = settings.lastFolder;
        if (id === undefined) {
          return { folderPath: null, error: 'Folder not found' };
        }
        const workspace = await getWorkspace(id);
        if (workspace === null) {
          return { folderPath: null, error: 'Folder not found' };
        }
        if (workspace.kind === 'fss') {
          const granted = await regrant(workspace.handle);
          if (!granted) {
            return { folderPath: null, error: 'Folder permission was denied' };
          }
        }
        return { folderPath: id };
      },

      /** Drag-drop folder ingest — upload tier, same path as the picker. */
      ingestDroppedItems: async (items: DataTransferItemList): Promise<SelectFolderResponse> => {
        const workspace = await ingestDroppedItems(items);
        if (workspace === null) {
          return { folderPath: null }; // non-directory or empty drop
        }
        workspaceNames.set(workspace.id, workspace.name);
        return { folderPath: workspace.id };
      },
    },

    document: {
      /** Replace markers in every workspace document; deliver as ZIP download. */
      replaceDocuments: async (
        id: string,
        markers: DocumentMarker[],
        _outputFolder?: string
      ): Promise<ReplaceDocumentsResponse> => {
        const workspace = await getWorkspace(id);
        if (workspace === null) {
          return { success: false, processed: 0, error: FOLDER_NOT_FOUND_ERROR };
        }
        return replaceWorkspaceDocuments(workspace, markers);
      },

      /** Shape stub — no live renderer caller (only dead utils/ipc.ts). */
      getDocuments: async (_folderPath: string): Promise<GetDocumentsResponse> => ({
        documents: [],
      }),
    },

    settings: { getSettings, saveSettings },

    /**
     * Save file operations. The workspace's IDB record is the single
     * source of truth after the first seed: the folder's/uploaded file is
     * read once at workspace creation; later external edits to it are NOT
     * picked up (documented limitation, todo 17).
     */
    saveFile: {
      readSaveFile: async (
        id: string
      ): Promise<{ success: boolean; data?: ReplacementValuesFile; error?: string }> => {
        const workspace = await getWorkspace(id);
        if (workspace === null || workspace.saveFile === undefined) {
          return { success: false, error: 'Save file not found' };
        }
        return { success: true, data: workspace.saveFile };
      },

      writeSaveFile: async (
        id: string,
        data: ReplacementValuesFile
      ): Promise<{ success: boolean; error?: string }> => {
        const stored = await upsertSaveFile(id, data);
        return stored ? { success: true } : { success: false, error: FOLDER_NOT_FOUND_ERROR };
      },

      getSaveFileLastModified: async (
        id: string
      ): Promise<{ success: boolean; lastModified?: string; error?: string }> => {
        const workspace = await getWorkspace(id);
        if (workspace === null) {
          return { success: false, error: FOLDER_NOT_FOUND_ERROR };
        }
        if (workspace.saveFile === undefined) {
          return { success: false, error: 'Save file not found' };
        }
        return { success: true, lastModified: workspace.lastModified };
      },
    },

    /** Window operations are meaningless in a browser tab. */
    window: {
      minimize: () => {},
      maximize: () => {},
      close: () => {},
    },

    /** No main-process broadcasts exist on the web — subscribe no-ops. */
    events: {
      onSettingsChanged: () => {},
      removeSettingsChangedListener: () => {},
      onDocumentUpdated: () => {},
      removeDocumentUpdatedListener: () => {},
      onError: () => {},
      removeErrorListener: () => {},
      removeAllListeners: () => {},
    },

    /** No auto-updater on the web — the supported:false path renders nothing. */
    updater: {
      getUpdateState: async (): Promise<UpdaterStateResponse> => ({
        supported: false,
        status: { status: 'idle' },
        currentVersion: APP_VERSION,
      }),
      installUpdate: async (): Promise<UpdaterActionResponse> => ({ success: false }),
      openReleasesPage: async (): Promise<UpdaterActionResponse> => ({ success: false }),
      onUpdaterStatus: () => {},
      removeUpdaterStatusListener: () => {},
    },

    capabilities: {
      variant: isFssAvailable() ? 'web-fss' : 'web-upload',
      startupScan: isFssAvailable() ? 'gesture' : 'auto',
      outputMode: 'download',
      updater: false,
    },
  } satisfies PlatformAPI;

  return { ready };
}
