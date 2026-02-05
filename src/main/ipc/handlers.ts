/**
 * IPC Handler Registration
 * Central registration point for all IPC handlers
 */

import { registerFolderHandlers } from './folder'
import { registerDocumentHandlers } from './document'
import { registerSettingsHandlers } from './settings'
import { registerWindowHandlers } from './window'

/**
 * Register all IPC handlers
 * This function should be called when the app is ready
 */
export function registerIpcHandlers() {
  console.log('Registering IPC handlers...')
  
  // Register folder operation handlers
  registerFolderHandlers()
  
  // Register document operation handlers
  registerDocumentHandlers()
  
  // Register settings operation handlers
  registerSettingsHandlers()
  
  // Register window operation handlers
  registerWindowHandlers()
  
  console.log('All IPC handlers registered successfully')
}