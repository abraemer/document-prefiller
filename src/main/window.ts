/**
 * Window Management
 * Handles Electron window creation, state persistence, and lifecycle
 */

import { BrowserWindow, screen } from 'electron';
import Store from 'electron-store';
import type { AppSettings } from '@/shared/types';

// Initialize electron-store for window state persistence
const windowStore = new Store<AppSettings>({
  name: 'window-state',
  defaults: {
    windowState: {
      width: 1200,
      height: 800,
      maximized: false,
    },
    preferences: {},
  },
});

/**
 * Default window dimensions
 */
const DEFAULT_WINDOW_WIDTH = 1200;
const DEFAULT_WINDOW_HEIGHT = 800;
const MIN_WINDOW_WIDTH = 800;
const MIN_WINDOW_HEIGHT = 600;

/**
 * Save the current window state to persistent storage
 * 
 * @param window - The BrowserWindow instance to save state from
 */
export function saveWindowState(window: BrowserWindow): void {
  try {
    const bounds = window.getBounds();
    const isMaximized = window.isMaximized();

    // Only save position if window is not maximized
    const windowState = {
      width: bounds.width,
      height: bounds.height,
      x: isMaximized ? undefined : bounds.x,
      y: isMaximized ? undefined : bounds.y,
      maximized: isMaximized,
    };

    windowStore.set('windowState', windowState);
  } catch (error) {
    console.error('Failed to save window state:', error);
  }
}

/**
 * Restore window state from persistent storage
 * 
 * @returns The saved window state or default values
 */
export function restoreWindowState(): {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
} {
  try {
    const savedState = windowStore.get('windowState');
    
    // Validate and sanitize the saved state
    const width = validateDimension(savedState.width, DEFAULT_WINDOW_WIDTH, MIN_WINDOW_WIDTH);
    const height = validateDimension(savedState.height, DEFAULT_WINDOW_HEIGHT, MIN_WINDOW_HEIGHT);
    const maximized = Boolean(savedState.maximized);
    
    // Only restore position if window is not maximized
    let x: number | undefined;
    let y: number | undefined;
    
    if (!maximized && savedState.x !== undefined && savedState.y !== undefined) {
      const position = validatePosition(savedState.x, savedState.y, width, height);
      x = position.x;
      y = position.y;
    }

    return {
      width,
      height,
      x,
      y,
      maximized,
    };
  } catch (error) {
    console.error('Failed to restore window state:', error);
    // Return default values on error
    return {
      width: DEFAULT_WINDOW_WIDTH,
      height: DEFAULT_WINDOW_HEIGHT,
      maximized: false,
    };
  }
}

/**
 * Validate a window dimension (width or height)
 * 
 * @param value - The dimension value to validate
 * @param defaultValue - The default value to use if validation fails
 * @param minValue - The minimum allowed value
 * @returns A valid dimension value
 */
function validateDimension(
  value: unknown,
  defaultValue: number,
  minValue: number
): number {
  if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
    return defaultValue;
  }
  
  if (value < minValue) {
    return minValue;
  }
  
  // Prevent excessively large windows
  const maxValue = screen.getPrimaryDisplay().workAreaSize.width * 2;
  if (value > maxValue) {
    return defaultValue;
  }
  
  return Math.round(value);
}

/**
 * Validate window position to ensure it's within screen bounds
 * 
 * @param x - The X coordinate to validate
 * @param y - The Y coordinate to validate
 * @param width - The window width
 * @param height - The window height
 * @returns Validated position coordinates
 */
function validatePosition(
  x: number,
  y: number,
  width: number,
  height: number
): { x?: number; y?: number } {
  if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) {
    return { x: undefined, y: undefined };
  }

  const displays = screen.getAllDisplays();
  let validPosition = false;
  let validatedX = x;
  let validatedY = y;

  // Check if the position is valid on any display
  for (const display of displays) {
    const { workArea } = display;
    
    // Ensure at least part of the window is visible
    const windowLeft = x;
    const windowRight = x + width;
    const windowTop = y;
    const windowBottom = y + height;
    
    // Check if window intersects with work area
    const horizontalOverlap = windowRight > workArea.x && windowLeft < workArea.x + workArea.width;
    const verticalOverlap = windowBottom > workArea.y && windowTop < workArea.y + workArea.height;
    
    if (horizontalOverlap && verticalOverlap) {
      validPosition = true;
      
      // Clamp position to ensure window is fully visible if possible
      validatedX = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - width));
      validatedY = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - height));
      
      break;
    }
  }

  // If position is invalid, center on primary display
  if (!validPosition) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { workArea } = primaryDisplay;
    
    validatedX = Math.round(workArea.x + (workArea.width - width) / 2);
    validatedY = Math.round(workArea.y + (workArea.height - height) / 2);
  }

  return { x: validatedX, y: validatedY };
}

/**
 * Create the main application window with state restoration
 * 
 * @param preloadPath - Optional path to the preload script
 * @returns The created BrowserWindow instance
 */
export function createMainWindow(preloadPath?: string): BrowserWindow {
  const state = restoreWindowState();

  const window = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    show: false, // Don't show until ready to prevent flicker
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Restore maximized state if saved
  if (state.maximized) {
    window.maximize();
  }

  // Save window state on various events
  window.on('resize', () => saveWindowState(window));
  window.on('move', () => saveWindowState(window));
  window.on('maximize', () => saveWindowState(window));
  window.on('unmaximize', () => saveWindowState(window));
  window.on('close', () => saveWindowState(window));

  return window;
}

/**
 * Clear saved window state (useful for testing or reset)
 */
export function clearWindowState(): void {
  try {
    windowStore.delete('windowState');
  } catch (error) {
    console.error('Failed to clear window state:', error);
  }
}

/**
 * Get the current window state from storage
 * 
 * @returns The current saved window state
 */
export function getWindowState(): AppSettings['windowState'] {
  return windowStore.get('windowState');
}