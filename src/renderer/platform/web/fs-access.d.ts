/**
 * Ambient declarations for browser File System Access and webkit upload APIs
 * missing from the installed TypeScript 5.9.3 lib.dom.d.ts.
 *
 * Measured against node_modules/typescript/lib/lib.dom.d.ts (2026-09-04):
 *   showDirectoryPicker        0 hits -> declared here
 *   queryPermission            0 hits -> declared here (on FileSystemHandle)
 *   requestPermission          3 hits, all Notification.requestPermission -> declared here (on FileSystemHandle)
 *   FileSystemDirectoryHandle.values()  absent (interface declares only
 *                              getDirectoryHandle/getFileHandle/removeEntry/resolve) -> declared here
 *
 * Already present in lib.dom and deliberately NOT redeclared (identical members
 * would be required for interface merging):
 *   HTMLInputElement.webkitdirectory, File.webkitRelativePath,
 *   DataTransferItem.webkitGetAsEntry(), FileSystemDirectoryEntry.readEntries().
 *
 * Keep this file free of imports/exports: a top-level import or export turns it
 * into a module and drops the ambient effect. Plain top-level interface
 * declarations in an ambient .d.ts merge with lib.dom directly (`declare global`
 * is not usable here — TS2669 forbids global augmentations outside modules).
 */

interface FileSystemHandle {
  queryPermission(desc?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(desc?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
}

interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemHandle>;
}

interface Window {
  showDirectoryPicker(options?: {
    id?: string;
    mode?: 'read' | 'readwrite';
    startIn?: FileSystemHandle | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
  }): Promise<FileSystemDirectoryHandle>;
}
