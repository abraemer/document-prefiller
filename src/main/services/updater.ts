/**
 * Auto-Update Service
 * Wraps electron-updater with dev/portable guards, platform-split
 * download behavior, and status broadcasting to all renderer windows.
 */

import { app, shell, BrowserWindow } from 'electron';
import electronUpdaterPkg from 'electron-updater';
import {
  IPC_CHANNELS,
  type UpdateStatusEvent,
  type UpdaterStateResponse,
  type UpdaterActionResponse,
} from '../../shared/types/ipc.js';
import { RELEASES_URL } from '../../shared/constants/index.js';

// electron-updater is CJS with a getter export; named imports are
// unreliable under ESM interop, so destructure after a default import.
const { autoUpdater } = electronUpdaterPkg;

let initialized = false;
let lastEvent: UpdateStatusEvent = { status: 'idle' };

/**
 * Store the latest status and send it to every renderer window.
 * Update UI must never crash the main process.
 */
function broadcast(event: UpdateStatusEvent): void {
  lastEvent = event;
  BrowserWindow.getAllWindows().forEach((window) => {
    try {
      window.webContents.send(IPC_CHANNELS.UPDATER_STATUS, event);
    } catch {
      // window may be closing — never crash on update UI
    }
  });
}

/**
 * Initialize the updater. Returns false when updates are unsupported
 * (development mode or portable build); idempotent otherwise.
 */
export function initUpdater(): boolean {
  if (!app.isPackaged) {
    console.log('Update check skipped: development mode');
    return false;
  }

  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    console.log('Update check skipped: portable build');
    return false;
  }

  if (initialized) {
    return true;
  }
  initialized = true;

  // macOS cannot in-place-install unsigned apps (Squirrel.Mac validation
  // fails), so mac only detects and points the user at the releases page.
  autoUpdater.autoDownload = process.platform !== 'darwin';
  // Install only on explicit user confirmation.
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => {
    broadcast({ status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    broadcast({
      status: 'available',
      version: info.version,
      suggestedAction: process.platform === 'darwin' ? 'open-page' : undefined,
    });
  });

  autoUpdater.on('update-not-available', () => {
    broadcast({ status: 'not-available' });
  });

  autoUpdater.on('download-progress', (progressInfo) => {
    broadcast({ status: 'downloading', progress: Math.round(progressInfo.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    broadcast({ status: 'downloaded', version: info.version, suggestedAction: 'restart' });
  });

  autoUpdater.on('error', (err) => {
    console.error('Update check failed:', err);
    broadcast({
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return true;
}

/**
 * Pure snapshot of the updater state - performs no network activity.
 */
export function getUpdateState(): UpdaterStateResponse {
  const supported = initUpdater();
  return { supported, status: lastEvent, currentVersion: app.getVersion() };
}

/**
 * Check for updates. Failures degrade to an error broadcast, never a throw.
 */
export async function checkForUpdates(): Promise<void> {
  if (!initUpdater()) {
    return;
  }

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    broadcast({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Install a downloaded update after explicit user confirmation.
 */
export function installUpdate(): UpdaterActionResponse {
  if (lastEvent.status === 'downloaded') {
    autoUpdater.quitAndInstall();
    return { success: true };
  }
  return { success: false, error: 'No downloaded update to install' };
}

/**
 * Open the GitHub releases page for manual updates (macOS flow).
 */
export async function openReleasesPage(): Promise<UpdaterActionResponse> {
  try {
    await shell.openExternal(RELEASES_URL);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Kick off the one and only update check at app startup.
 */
export function startupCheck(): void {
  if (!app.isPackaged) {
    return;
  }
  if (initUpdater()) {
    void checkForUpdates();
  }
}
