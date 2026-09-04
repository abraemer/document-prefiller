/**
 * Output ZIP construction for the web variant.
 *
 * The output archive always carries every workspace .docx plus the
 * `.replacement-values.json` save file (locked decision D2: the save file
 * must ride along, even for a single-document workspace).
 */

import JSZip from 'jszip';
import { SAVE_FILE_NAME } from '../../../shared/constants';
import type { ReplacementValuesFile } from '../../../shared/types';

/** One document entry in the output archive */
export interface ZipFileEntry {
  /** Archive-internal file name (e.g. 'template.docx') */
  name: string;
  /** Document contents */
  bytes: Uint8Array;
}

/**
 * Build the output archive from the replaced document set.
 *
 * The save file is serialized exactly like the desktop's
 * `writeSaveFile` (src/main/services/storage.ts): `JSON.stringify(data, null, 2)`
 * with `lastModified` already set by the caller — so the produced JSON is
 * byte-compatible across the native and web variants.
 *
 * @param files - Documents to include (replaced or not — desktop parity)
 * @param saveFile - Save file to attach; omitted from the archive when absent
 * @returns Promise resolving with the archive as a Blob
 */
export async function buildOutputZip(
  files: ZipFileEntry[],
  saveFile?: ReplacementValuesFile
): Promise<Blob> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, file.bytes);
  }
  if (saveFile) {
    zip.file(SAVE_FILE_NAME, JSON.stringify(saveFile, null, 2));
  }
  return zip.generateAsync({ type: 'blob' });
}
