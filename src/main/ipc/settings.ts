/**
 * Settings Operations IPC Handlers
 * Handles settings and window state operations
 */

import { ipcMain, BrowserWindow } from 'electron'
import type { AppSettings, SaveSettingsRequest, SaveSettingsResponse } from '../../shared/types'

/**
 * Default settings
 */
const DEFAULT_SETTINGS: AppSettings = {
  selectedFolder: null,
  markers: [],
  windowState: {
    width: 1200,
    height: 800,
    x: null,
    y: null,
  },
}

/**
 * Current settings (in-memory)
 * In production, this would be persisted to disk
 */
let currentSettings: AppSettings = { ...DEFAULT_SETTINGS }

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
      // TODO: Load settings from storage service
      console.log('Getting settings')
      
      return currentSettings
    } catch (error) {
      console.error('Error getting settings:', error)
      return DEFAULT_SETTINGS
    }
  })

  /**
   * Handle saving settings
   * Saves the application settings
   */
  ipcMain.handle('settings:save', async (_event, request: SaveSettingsRequest): Promise<SaveSettingsResponse> => {
    try {
      const { settings } = request
      
      // TODO: Save settings to storage service
      console.log('Saving settings:', settings)
      
      currentSettings = { ...settings }
      
      // Notify all windows about settings change
      BrowserWindow.getAllWindows().forEach((window) => {
        window.webContents.send('settings:changed', settings)
      })
      
      return {
        success: true,
      }
    } catch (error) {
      console.error('Error saving settings:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })
}