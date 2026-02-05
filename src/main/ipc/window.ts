/**
 * Window Operations IPC Handlers
 * Handles window control operations
 */

import { ipcMain, BrowserWindow } from 'electron'

/**
 * Register window operation handlers
 */
export function registerWindowHandlers() {
  /**
   * Handle window minimize
   */
  ipcMain.on('window:minimize', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (focusedWindow) {
      focusedWindow.minimize()
    }
  })

  /**
   * Handle window maximize/restore
   */
  ipcMain.on('window:maximize', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (focusedWindow) {
      if (focusedWindow.isMaximized()) {
        focusedWindow.restore()
      } else {
        focusedWindow.maximize()
      }
    }
  })

  /**
   * Handle window close
   */
  ipcMain.on('window:close', () => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    if (focusedWindow) {
      focusedWindow.close()
    }
  })
}