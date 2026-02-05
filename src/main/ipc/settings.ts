/**
 * Settings Operations IPC Handlers
 * Handles settings and window state operations
 */

import { ipcMain, BrowserWindow, app } from 'electron';
import type { AppSettings, SaveSettingsRequest, SaveSettingsResponse } from '../../shared/types';
import * as path from 'path';

/**
 * Default settings
 */
const DEFAULT_SETTINGS: AppSettings = {
  windowState: {
    width: 1200,
    height: 800,
  },
  preferences: {},
};

/**
 * Path to settings file
 */
function getSettingsPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'settings.json');
}

/**
 * Current settings (in-memory cache)
 */
let currentSettings: AppSettings = { ...DEFAULT_SETTINGS };

/**
 * Load settings from disk
 */
async function loadSettings(): Promise<AppSettings> {
  try {
    const settingsPath = getSettingsPath();
    const fs = await import('fs/promises');
    
    try {
      await fs.access(settingsPath);
    } catch {
      // Settings file doesn't exist, return defaults
      return { ...DEFAULT_SETTINGS };
    }

    const content = await fs.readFile(settingsPath, 'utf-8');
    const parsed = JSON.parse(content);
    
    // Validate and merge with defaults
    const settings: AppSettings = {
      windowState: {
        ...DEFAULT_SETTINGS.windowState,
        ...parsed.windowState,
      },
      preferences: {
        ...DEFAULT_SETTINGS.preferences,
        ...parsed.preferences,
      },
      lastFolder: parsed.lastFolder,
    };

    return settings;
  } catch (error) {
    console.error('Error loading settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Save settings to disk
 */
async function saveSettingsToDisk(settings: AppSettings): Promise<void> {
  try {
    const settingsPath = getSettingsPath();
    const fs = await import('fs/promises');
    
    // Ensure directory exists
    const dir = path.dirname(settingsPath);
    await fs.mkdir(dir, { recursive: true });
    
    // Write settings
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving settings to disk:', error);
    throw error;
  }
}

/**
 * Register settings operation handlers
 */
export function registerSettingsHandlers() {
  /**
   * Handle getting settings
   * Returns the current application settings
   */
  ipcMain.handle('settings:get', async (): Promise<AppSettings> => {
    try {
      // Load settings from disk if not already loaded
      if (currentSettings === DEFAULT_SETTINGS) {
        currentSettings = await loadSettings();
      }
      
      return currentSettings;
    } catch (error) {
      console.error('Error getting settings:', error);
      return DEFAULT_SETTINGS;
    }
  });

  /**
   * Handle saving settings
   * Saves the application settings
   */
  ipcMain.handle('settings:save', async (event, request: SaveSettingsRequest): Promise<SaveSettingsResponse> => {
    try {
      const { settings } = request;

      // Validate settings
      if (!settings || typeof settings !== 'object') {
        return {
          success: false,
          error: 'Invalid settings provided',
        };
      }

      // Merge settings with current settings
      currentSettings = {
        ...currentSettings,
        ...settings,
        windowState: {
          ...currentSettings.windowState,
          ...settings.windowState,
        },
        preferences: {
          ...currentSettings.preferences,
          ...settings.preferences,
        },
      };

      // Save to disk
      await saveSettingsToDisk(currentSettings);

      // Notify all windows about settings change
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send('settings:changed', settings);
      });

      return {
        success: true,
      };
    } catch (error) {
      console.error('Error saving settings:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });
}

/**
 * Initialize settings (call this when app starts)
 */
export async function initializeSettings(): Promise<void> {
  currentSettings = await loadSettings();
}

/**
 * Get current settings (for internal use)
 */
export function getCurrentSettings(): AppSettings {
  return currentSettings;
}