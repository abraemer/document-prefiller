/**
 * Auto-Update Service
 * Wraps electron-updater with dev/portable guards, consent-first update
 * offers, and status broadcasting to all renderer windows.
 */

import { app, shell, BrowserWindow } from 'electron';
import Store from 'electron-store';
import electronUpdaterPkg from 'electron-updater';
import {
  IPC_CHANNELS,
  type UpdateStatusEvent,
  type UpdaterStateResponse,
  type UpdaterActionResponse,
} from '../../shared/types/ipc.js';
import { RELEASES_URL, releaseTagUrl } from '../../shared/constants/index.js';

// electron-updater is CJS with a getter export; named imports are
// unreliable under ESM interop, so destructure after a default import.
const { autoUpdater } = electronUpdaterPkg;

const updaterStore = new Store<{ skippedVersion?: string }>({
  name: 'updater-state',
  defaults: {},
});

let initialized = false;
let lastEvent: UpdateStatusEvent = { status: 'idle' };
let lastOfferedVersion: string | undefined;

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

  // Consent-first: nothing downloads without an explicit user click.
  autoUpdater.autoDownload = false;
  // Invariant: never restart without an explicit user click.
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => {
    broadcast({ status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    lastOfferedVersion = info.version;
    if (info.version === updaterStore.get('skippedVersion')) {
      // Skipped by the user: no suggestedAction, and the renderer hides
      // suggestion-less events — this version is never offered again.
      broadcast({ status: 'available', version: info.version });
      return;
    }
    broadcast({
      status: 'available',
      version: info.version,
      suggestedAction: process.platform === 'darwin' ? 'open-page' : 'install',
    });
  });

  autoUpdater.on('update-not-available', () => {
    broadcast({ status: 'not-available' });
  });

  autoUpdater.on('download-progress', (progressInfo) => {
    broadcast({ status: 'downloading', progress: Math.round(progressInfo.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (info.version === updaterStore.get('skippedVersion')) {
      // electron-updater replays this event from its download cache on a
      // later launch — a skipped version must never prompt a restart.
      broadcast({ status: 'downloaded', version: info.version });
      return;
    }
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
 * Download the offered update after an explicit user click. Guards key off
 * lastOfferedVersion, never lastEvent.status — the 'error' broadcast
 * overwrites lastEvent and must not permanently break retry-after-error.
 */
export async function downloadUpdate(): Promise<UpdaterActionResponse> {
  if (process.platform === 'darwin') {
    return { success: false, error: 'Download & install is not supported on macOS' };
  }
  if (!lastOfferedVersion) {
    return { success: false, error: 'No update available to download' };
  }
  broadcast({ status: 'downloading' });
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    broadcast({ status: 'error', error: message });
    return { success: false, error: message };
  }
}

/**
 * Persist the user's decision to never be offered this exact version again.
 */
export async function skipVersion(): Promise<UpdaterActionResponse> {
  if (!lastOfferedVersion) {
    return { success: false, error: 'No update available to skip' };
  }
  updaterStore.set('skippedVersion', lastOfferedVersion);
  return { success: true };
}

/**
 * Open the GitHub releases page for manual updates (macOS flow); with a
 * version, opens that release's tag page (the changelog entry point).
 */
export async function openReleasesPage(version?: string): Promise<UpdaterActionResponse> {
  const url = version === undefined ? RELEASES_URL : releaseTagUrl(version);
  if (url === null) {
    return { success: false, error: 'Invalid version' };
  }
  try {
    await shell.openExternal(url);
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
