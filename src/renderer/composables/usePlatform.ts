/**
 * usePlatform Composable
 * Variant-awareness for the running edition (native / web-fss / web-upload)
 */

import type { PlatformCapabilities } from '../../shared/types';
import { getWorkspaceName } from '../platform/web';

/**
 * usePlatform Composable
 *
 * Provides the running edition's capabilities and variant-aware helpers.
 * App.vue gates ONLY its web-specific branches on these values — native
 * capability values must compile to identical desktop behavior.
 */
export function usePlatform() {
  // Defensive read: unit tests mount the app with no window.api at all
  // (App.test.ts) or a partial mock (UpdateNotification.test.ts) — follow
  // the dev-guard pattern at useUpdater.ts:98.
  const capabilities: PlatformCapabilities = window.api?.capabilities ?? {
    variant: 'native',
    startupScan: 'auto',
    outputMode: 'disk',
    updater: true,
  };

  /**
   * Resolve a folder reference to a human-readable display name.
   *
   * Native folder paths are already display names (identity). Web folder
   * references are workspace ids resolved through the shim's SYNCHRONOUS
   * name cache — never the async IDB store: template interpolation is
   * synchronous, and a promise would render "[object Promise]". Cache
   * misses fall back to the raw id.
   *
   * @param folderPath - Folder path (native) or workspace id (web)
   * @returns The display name
   */
  function displayFolderName(folderPath: string): string {
    if (capabilities.variant === 'native') {
      return folderPath;
    }
    return getWorkspaceName(folderPath) ?? folderPath;
  }

  return {
    capabilities,
    displayFolderName,
  };
}
