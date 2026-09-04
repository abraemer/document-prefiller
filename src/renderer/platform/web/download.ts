/**
 * Browser download delivery for the web variant.
 *
 * Always a ZIP download — never a bare single-document download — so the
 * save file rides along (locked decision D2).
 */

/** How long the object URL stays alive after the click (Safari quirk). */
const REVOKE_DELAY_MS = 10_000;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Format the download filename: `prefilled-documents-<YYYYMMDD-HHmmss>.zip`
 */
export function formatDownloadFilename(date: Date): string {
  const datePart = `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
  const timePart = `${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;
  return `prefilled-documents-${datePart}-${timePart}.zip`;
}

/**
 * Trigger a browser download of a Blob.
 *
 * The anchor is appended to document.body before clicking (Safari requires
 * the element to be in the DOM for programmatic clicks to navigate) and
 * removed immediately after. The object URL is revoked only after a 10s
 * timeout: Safari resolves the download navigation late, and revoking while
 * the URL is still referenced aborts the transfer.
 *
 * KNOWN LIMITATION: this is fired from the replaceDocuments promise chain.
 * Chromium's transient user-activation window expires ~5s after the Replace
 * click, so very large/slow batches may lose the activation and the browser
 * can block the download (documented in docs/web.md).
 *
 * @param blob - Payload to download
 * @param filename - Suggested file name for the download
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
