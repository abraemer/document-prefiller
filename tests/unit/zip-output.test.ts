/**
 * Unit tests for the web-variant output trio (todo 11):
 * - zip.ts      buildOutputZip: archive contains ALL docx + save file,
 *               save-file JSON mirrors the desktop writeSaveFile serialization.
 * - replace.ts  replaceWorkspaceDocuments: copy-all semantics, current-marker
 *               save-file sourcing (regression: stale/absent IDB record),
 *               fail-closed per-file errors with no download.
 * - download.ts triggerDownload: in-DOM anchor click, 10s-delayed revoke.
 *
 * listDocx (fss-folder, todo 9) is mocked: its handle-iteration behavior is
 * covered by fss-folder's own tests; here we lock replace.ts's consumption
 * of its {name, file} contract.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import JSZip from 'jszip';
import { SAVE_FILE_NAME } from '../../src/shared/constants';
import type { DocumentMarker, ReplacementValuesFile } from '../../src/shared/types';

vi.mock('../../src/renderer/platform/web/fss-folder', () => ({
  listDocx: vi.fn(),
}));

import { listDocx } from '../../src/renderer/platform/web/fss-folder';
import { buildOutputZip } from '../../src/renderer/platform/web/zip';
import { formatDownloadFilename, triggerDownload } from '../../src/renderer/platform/web/download';
import { replaceWorkspaceDocuments } from '../../src/renderer/platform/web/replace';
import type {
  FssWorkspaceRecord,
  UploadWorkspaceRecord,
} from '../../src/renderer/platform/web/workspace-store';

const MARKER_PREFIX = 'REPLACEME-';

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Hello REPLACEME-NAME, welcome!</w:t></w:r></w:p>
  </w:body>
</w:document>`;

async function buildDocxBytes(documentXml: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('word/document.xml', documentXml);
  return zip.generateAsync({ type: 'uint8array' });
}

function marker(id: string, value: string): DocumentMarker {
  return { id, name: id, value, prefix: MARKER_PREFIX, enabled: true };
}

function uploadWorkspace(
  files: Array<{ name: string; bytes: Uint8Array }>,
  saveFile?: ReplacementValuesFile
): UploadWorkspaceRecord {
  return {
    id: 'ws-upload',
    kind: 'upload',
    name: 'Uploaded folder',
    // new Uint8Array(...) copies into a plain ArrayBuffer (BlobPart-compatible)
    files: files.map((file) => ({ name: file.name, blob: new Blob([new Uint8Array(file.bytes)]) })),
    saveFile,
    lastModified: new Date(0).toISOString(),
  };
}

/** Minimal structural stand-in for FileSystemDirectoryHandle (listDocx is mocked). */
function mockDirectoryHandle(): FileSystemDirectoryHandle {
  const handle: FileSystemDirectoryHandle = {
    kind: 'directory',
    name: 'Live folder',
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
    getFileHandle: async () => {
      throw new Error('not used in this test');
    },
    getDirectoryHandle: async () => {
      throw new Error('not used in this test');
    },
    removeEntry: async () => undefined,
    resolve: async () => null,
    isSameEntry: async () => false,
    values: async function* () {
      // no entries — listDocx is mocked anyway
    },
  };
  return handle;
}

async function documentXmlFromZip(zip: JSZip, docxName: string): Promise<string> {
  const docxEntry = zip.file(docxName);
  if (!docxEntry) {
    throw new Error(`${docxName} missing from archive`);
  }
  const docx = await JSZip.loadAsync(await docxEntry.async('uint8array'));
  const xmlEntry = docx.file('word/document.xml');
  if (!xmlEntry) {
    throw new Error('word/document.xml missing from docx');
  }
  return xmlEntry.async('string');
}

// jsdom does not implement URL.createObjectURL/revokeObjectURL; stub them
// FIRST or triggerDownload throws before the anchor click.
const createObjectURL = vi.fn((_blob: Blob) => 'blob:mock-url');
const revokeObjectURL = vi.fn();
let anchorClick: MockInstance<() => void>;

beforeEach(() => {
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click');
});

afterEach(() => {
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  anchorClick.mockRestore();
  vi.mocked(listDocx).mockReset();
  vi.useRealTimers();
});

/** The single Blob handed to triggerDownload by the last replace run. */
function lastDownloadedBlob(): Blob {
  expect(createObjectURL).toHaveBeenCalledTimes(1);
  const blob = createObjectURL.mock.calls[0][0];
  return blob;
}

describe('buildOutputZip', () => {
  it('contains every input docx and the desktop-format save file', async () => {
    const saveFile: ReplacementValuesFile = {
      prefix: MARKER_PREFIX,
      values: { NAME: 'Jane' },
      version: '1.0',
      lastModified: '2026-09-04T10:00:00.000Z',
    };
    const blob = await buildOutputZip(
      [
        { name: 'a.docx', bytes: await buildDocxBytes(DOCUMENT_XML) },
        { name: 'b.docx', bytes: await buildDocxBytes(DOCUMENT_XML) },
      ],
      saveFile
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.file('a.docx')).not.toBeNull();
    expect(zip.file('b.docx')).not.toBeNull();

    const saveEntry = zip.file(SAVE_FILE_NAME);
    if (!saveEntry) {
      throw new Error(`${SAVE_FILE_NAME} missing from archive`);
    }
    // Byte-compatible with the desktop's writeSaveFile serialization
    // (storage.ts): JSON.stringify(data, null, 2).
    expect(await saveEntry.async('string')).toBe(JSON.stringify(saveFile, null, 2));
  });

  it('omits the save file when none is supplied', async () => {
    const blob = await buildOutputZip([{ name: 'a.docx', bytes: await buildDocxBytes(DOCUMENT_XML) }]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(zip.file('a.docx')).not.toBeNull();
    expect(zip.file(SAVE_FILE_NAME)).toBeNull();
  });
});

describe('replaceWorkspaceDocuments (upload tier)', () => {
  it('replaces markers, includes ALL workspace docx (replaced or not), and downloads a zip', async () => {
    const workspace = uploadWorkspace([
      { name: 'letter.docx', bytes: await buildDocxBytes(DOCUMENT_XML) },
      {
        name: 'notes.docx',
        bytes: await buildDocxBytes(DOCUMENT_XML.replace('Hello REPLACEME-NAME, welcome!', 'Plain text.')),
      },
    ]);

    const result = await replaceWorkspaceDocuments(workspace, [marker('NAME', 'Jane')]);

    expect(result).toEqual({ success: true, processed: 2 });
    expect(anchorClick).toHaveBeenCalledTimes(1);

    const zip = await JSZip.loadAsync(await lastDownloadedBlob().arrayBuffer());
    // Copy-all semantics: every workspace docx rides along.
    const replacedXml = await documentXmlFromZip(zip, 'letter.docx');
    expect(replacedXml).toContain('Hello Jane, welcome!');
    expect(replacedXml).not.toContain('REPLACEME-NAME');
    const untouchedXml = await documentXmlFromZip(zip, 'notes.docx');
    expect(untouchedXml).toContain('Plain text.');
  });

  it('REGRESSION: ships the just-typed value when the IDB record is stale/empty (no saveFile)', async () => {
    // User typed a value and hit Replace IMMEDIATELY — the 500ms debounced
    // autosave never fired, so the workspace record carries NO save file.
    const workspace = uploadWorkspace([{ name: 'letter.docx', bytes: await buildDocxBytes(DOCUMENT_XML) }]);

    const result = await replaceWorkspaceDocuments(workspace, [marker('NAME', 'FreshValue')]);

    expect(result.success).toBe(true);
    const zip = await JSZip.loadAsync(await lastDownloadedBlob().arrayBuffer());
    const saveEntry = zip.file(SAVE_FILE_NAME);
    if (!saveEntry) {
      throw new Error(`${SAVE_FILE_NAME} missing from archive`);
    }
    const saveFile: ReplacementValuesFile = JSON.parse(await saveEntry.async('string'));
    expect(saveFile.values.NAME).toBe('FreshValue');
    expect(saveFile.prefix).toBe(MARKER_PREFIX);
  });

  it('falls back to the workspace record save file only when no markers are supplied', async () => {
    const recordSaveFile: ReplacementValuesFile = {
      prefix: MARKER_PREFIX,
      values: { NAME: 'PersistedValue' },
      version: '1.0',
      lastModified: '2026-09-01T08:00:00.000Z',
    };
    const workspace = uploadWorkspace(
      [{ name: 'letter.docx', bytes: await buildDocxBytes(DOCUMENT_XML) }],
      recordSaveFile
    );

    const result = await replaceWorkspaceDocuments(workspace, []);

    expect(result).toEqual({ success: true, processed: 1 });
    const zip = await JSZip.loadAsync(await lastDownloadedBlob().arrayBuffer());
    const saveEntry = zip.file(SAVE_FILE_NAME);
    if (!saveEntry) {
      throw new Error(`${SAVE_FILE_NAME} missing from archive`);
    }
    expect(await saveEntry.async('string')).toBe(JSON.stringify(recordSaveFile, null, 2));
  });

  it('FAILURE: one corrupt docx fails the batch, names the file, and never downloads', async () => {
    const workspace = uploadWorkspace([
      { name: 'good.docx', bytes: await buildDocxBytes(DOCUMENT_XML) },
      { name: 'corrupt.docx', bytes: new Uint8Array([1, 2, 3]) }, // <4 bytes: 'file too small'
    ]);

    const result = await replaceWorkspaceDocuments(workspace, [marker('NAME', 'Jane')]);

    expect(result.success).toBe(false);
    expect(result.processed).toBe(1);
    expect(result.error).toContain('corrupt.docx:');
    expect(result.error).toContain('file too small');
    // Fail closed: zero downloads.
    expect(anchorClick).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });
});

describe('replaceWorkspaceDocuments (fss tier)', () => {
  it('resolves the docx set via listDocx and applies the same delivery', async () => {
    const docxBytes = await buildDocxBytes(DOCUMENT_XML);
    const handle = mockDirectoryHandle();
    vi.mocked(listDocx).mockResolvedValue([
      { name: 'fss.docx', file: new File([new Uint8Array(docxBytes)], 'fss.docx') },
    ]);
    const workspace: FssWorkspaceRecord = {
      id: 'ws-fss',
      kind: 'fss',
      name: 'Live folder',
      handle,
      lastModified: new Date(0).toISOString(),
    };

    const result = await replaceWorkspaceDocuments(workspace, [marker('NAME', 'Jane')]);

    expect(result).toEqual({ success: true, processed: 1 });
    expect(listDocx).toHaveBeenCalledWith(handle);
    const zip = await JSZip.loadAsync(await lastDownloadedBlob().arrayBuffer());
    const replacedXml = await documentXmlFromZip(zip, 'fss.docx');
    expect(replacedXml).toContain('Hello Jane, welcome!');
  });
});

describe('triggerDownload', () => {
  it('clicks an in-DOM anchor and revokes the object URL only after 10s', () => {
    vi.useFakeTimers();
    const blob = new Blob(['payload']);

    triggerDownload(blob, 'prefilled-documents-20260904-140509.zip');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledWith(blob);

    // Safari requirement: the anchor must be in the DOM for the click.
    const anchor = anchorClick.mock.instances[0];
    if (!(anchor instanceof HTMLAnchorElement)) {
      throw new Error('expected an HTMLAnchorElement click');
    }
    expect(anchor.download).toBe('prefilled-documents-20260904-140509.zip');
    expect(anchor.href).toBe('blob:mock-url');
    expect(anchorClick).toHaveBeenCalledTimes(1);
    // Removed from the DOM immediately after the click.
    expect(document.body.contains(anchor)).toBe(false);

    // Object URL stays alive for Safari's delayed navigation...
    vi.advanceTimersByTime(9_999);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    // ...and is revoked at the 10s mark.
    vi.advanceTimersByTime(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});

describe('formatDownloadFilename', () => {
  it('formats as prefilled-documents-<YYYYMMDD-HHmmss>.zip', () => {
    expect(formatDownloadFilename(new Date(2026, 8, 4, 14, 5, 9))).toBe(
      'prefilled-documents-20260904-140509.zip'
    );
    expect(formatDownloadFilename(new Date(2026, 0, 31, 0, 0, 0))).toBe(
      'prefilled-documents-20260131-000000.zip'
    );
  });
});
