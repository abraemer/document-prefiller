/**
 * Updater Operations IPC Handlers
 * Handles auto-update state queries and user-triggered update actions
 */

import { ipcMain } from 'electron';
import {
  IPC_CHANNELS,
  type UpdaterStateResponse,
  type UpdaterActionResponse,
} from '../../shared/types';
import { getUpdateState, installUpdate, openReleasesPage } from '../services/updater';

/**
 * Register updater operation handlers
 */
export function registerUpdaterHandlers(): void {
  /**
   * Handle update-state snapshot request
   */
  ipcMain.handle(IPC_CHANNELS.UPDATER_GET_STATE, (): UpdaterStateResponse => {
    try {
      return getUpdateState();
    } catch (error) {
      return {
        supported: false,
        status: {
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        },
        currentVersion: '',
      };
    }
  });

  /**
   * Handle install-update request
   */
  ipcMain.handle(IPC_CHANNELS.UPDATER_INSTALL, (): UpdaterActionResponse => {
    try {
      return installUpdate();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  /**
   * Handle open-releases-page request
   */
  ipcMain.handle(IPC_CHANNELS.UPDATER_OPEN_RELEASES, (): UpdaterActionResponse => {
    try {
      return openReleasesPage();
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
