/**
 * Web-variant document replacement with ZIP download delivery.
 *
 * Desktop parity notes (src/main/services/replacer.ts):
 * - The output contains ALL workspace .docx files, replaced or not
 *   (the desktop copies every docx to the output folder first, then
 *   replaces markers in the copies).
 * - Any per-file failure fails the whole batch; v1 keeps the
 *   ReplaceDocumentsResponse semantics simple (no partial download).
 *
 * The save file in the archive is built from the CURRENT markers, not the
 * IndexedDB workspace record: the record only updates via the 500ms
 * debounced autosave (useMarkers.ts), which App.vue's replace flow never
 * flushes — reading the record alone could ship a stale or absent save
 * file. The record is used only as a fallback when no markers are supplied.
 */

import { markersToValues } from '../../../core/scan-support';
import { replaceMarkersInDocxBytes } from '../../../core/docx-replace';
import type {
  DocumentMarker,
  ReplaceDocumentsResponse,
  ReplacementValuesFile,
} from '../../../shared/types';
import type { WorkspaceRecord } from './workspace-store';
import { listDocx } from './fss-folder';
import { buildOutputZip, type ZipFileEntry } from './zip';
import { formatDownloadFilename, triggerDownload } from './download';

/**
 * Save-file format version. Mirrors the payload the desktop renderer
 * writes via useMarkers.saveMarkers ('1.0'), so save files produced by
 * either variant are interchangeable.
 */
const SAVE_FILE_VERSION = '1.0';

/**
 * Resolve the workspace's .docx set into memory, discriminated by kind.
 *
 * @param workspace - Workspace record (fss live folder or uploaded copy)
 * @returns Document entries with their raw bytes
 */
async function resolveWorkspaceDocx(workspace: WorkspaceRecord): Promise<ZipFileEntry[]> {
  const files: ZipFileEntry[] = [];

  if (workspace.kind === 'fss') {
    for (const entry of await listDocx(workspace.handle)) {
      files.push({ name: entry.name, bytes: new Uint8Array(await entry.file.arrayBuffer()) });
    }
  } else {
    for (const entry of workspace.files) {
      files.push({ name: entry.name, bytes: new Uint8Array(await entry.blob.arrayBuffer()) });
    }
  }

  return files;
}

/**
 * Build the save-file payload from current replacement values.
 *
 * Same envelope the desktop's writeSaveFile path persists: prefix + values
 * plus the version/lastModified fields required by ReplacementValuesFile.
 */
function buildSaveFile(values: Record<string, string>, prefix: string): ReplacementValuesFile {
  return {
    prefix,
    values,
    version: SAVE_FILE_VERSION,
    lastModified: new Date().toISOString(),
  };
}

/**
 * Replace markers in every workspace document and deliver the result as a
 * ZIP download (always zipped — the save file rides along even for a
 * single document).
 *
 * Per-file failures are collected as `<filename>: <message>` joined with
 * '; ' and fail the whole batch — no download happens (fail closed).
 *
 * @param workspace - Workspace record to process
 * @param markers - Current markers (the save file is built from these)
 * @returns Promise resolving with the ReplaceDocumentsResponse shape
 */
export async function replaceWorkspaceDocuments(
  workspace: WorkspaceRecord,
  markers: DocumentMarker[]
): Promise<ReplaceDocumentsResponse> {
  try {
    const docxFiles = await resolveWorkspaceDocx(workspace);

    if (docxFiles.length === 0) {
      // Desktop parity: an empty folder succeeds with nothing to deliver.
      return { success: true, processed: 0 };
    }

    const { values, prefix } = markersToValues(markers);

    const outputFiles: ZipFileEntry[] = [];
    const failures: string[] = [];

    for (const file of docxFiles) {
      try {
        outputFiles.push({
          name: file.name,
          bytes: await replaceMarkersInDocxBytes(file.bytes, values, prefix),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        failures.push(`${file.name}: ${message}`);
      }
    }

    if (failures.length > 0) {
      return { success: false, processed: outputFiles.length, error: failures.join('; ') };
    }

    const saveFile =
      markers.length > 0 ? buildSaveFile(values, prefix) : workspace.saveFile;

    const zip = await buildOutputZip(outputFiles, saveFile);
    triggerDownload(zip, formatDownloadFilename(new Date()));

    return { success: true, processed: docxFiles.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, processed: 0, error: message };
  }
}
