/**
 * useSettings Composable
 * Manages settings state and operations
 */

import { ref, computed, watch, onUnmounted } from 'vue';
import type { AppSettings } from '../../shared/types';
import { DEFAULT_SETTINGS, DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT } from '../../shared/constants';

/**
 * Settings save status
 */
export type SettingsSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Settings statistics
 */
export interface SettingsStatistics {
  /** Whether settings have been loaded */
  isLoaded: boolean;
  /** Whether settings have been modified */
  isModified: boolean;
  /** Number of settings properties */
  propertyCount: number;
}

/**
 * useSettings Composable
 * 
 * Provides reactive state and operations for managing application settings
 * 
 * @example
 * ```typescript
 * const {
 *   settings,
 *   saveStatus,
 *   saveError,
 *   statistics,
 *   loadSettings,
 *   saveSettings,
 *   updateSettings,
 *   resetSettings,
 *   updateLastFolder,
 *   updateWindowState,
 *   updatePreferences,
 *   isLoaded,
 *   isModified,
 *   lastFolder,
 *   windowState,
 *   preferences
 * } = useSettings();
 * ```
 */
export function useSettings() {
  // ============================================================================
  // STATE
  // ============================================================================

  /** Current settings */
  const settings = ref<AppSettings>({
    windowState: {
      width: DEFAULT_WINDOW_WIDTH,
      height: DEFAULT_WINDOW_HEIGHT,
    },
    preferences: {},
  });

  /** Save status */
  const saveStatus = ref<SettingsSaveStatus>('idle');

  /** Save error message */
  const saveError = ref<string>('');

  /** Whether settings have been loaded from main process */
  const isLoaded = ref<boolean>(false);

  /** Whether settings have been modified since last save */
  const isModified = ref<boolean>(false);

  /** Debounce timer for auto-save */
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // ============================================================================
  // COMPUTED PROPERTIES
  // ============================================================================

  /**
   * Settings statistics
   */
  const statistics = computed<SettingsStatistics>(() => {
    const propertyCount = Object.keys(settings.value).length + 
      Object.keys(settings.value.windowState).length + 
      Object.keys(settings.value.preferences).length;
    
    return {
      isLoaded: isLoaded.value,
      isModified: isModified.value,
      propertyCount,
    };
  });

  /**
   * Last folder path
   */
  const lastFolder = computed<string | undefined>(() => {
    return settings.value.lastFolder;
  });

  /**
   * Window state
   */
  const windowState = computed(() => {
    return settings.value.windowState;
  });

  /**
   * User preferences
   */
  const preferences = computed(() => {
    return settings.value.preferences;
  });

  /**
   * Default prefix from preferences
   */
  const defaultPrefix = computed<string>(() => {
    return settings.value.preferences.defaultPrefix || DEFAULT_SETTINGS.preferences.defaultPrefix || '';
  });

  /**
   * Window width
   */
  const windowWidth = computed<number>(() => {
    return settings.value.windowState.width;
  });

  /**
   * Window height
   */
  const windowHeight = computed<number>(() => {
    return settings.value.windowState.height;
  });

  /**
   * Window X position
   */
  const windowX = computed<number | undefined>(() => {
    return settings.value.windowState.x;
  });

  /**
   * Window Y position
   */
  const windowY = computed<number | undefined>(() => {
    return settings.value.windowState.y;
  });

  /**
   * Window maximized state
   */
  const windowMaximized = computed<boolean>(() => {
    return settings.value.windowState.maximized || false;
  });

  /**
   * Is saving
   */
  const isSaving = computed<boolean>(() => {
    return saveStatus.value === 'saving';
  });

  /**
   * Has error
   */
  const hasError = computed<boolean>(() => {
    return saveStatus.value === 'error' && saveError.value.length > 0;
  });

  // ============================================================================
  // SETTINGS OPERATIONS
  // ============================================================================

  /**
   * Load settings from main process
   * 
   * @returns Promise that resolves to true if load was successful
   */
  async function loadSettings(): Promise<boolean> {
    saveStatus.value = 'idle';
    saveError.value = '';

    try {
      const loadedSettings = await window.api.settings.getSettings();
      
      // Merge loaded settings with defaults to ensure all properties exist
      settings.value = {
        lastFolder: loadedSettings.lastFolder,
        windowState: {
          width: loadedSettings.windowState.width || DEFAULT_WINDOW_WIDTH,
          height: loadedSettings.windowState.height || DEFAULT_WINDOW_HEIGHT,
          x: loadedSettings.windowState.x,
          y: loadedSettings.windowState.y,
          maximized: loadedSettings.windowState.maximized || false,
        },
        preferences: {
          defaultPrefix: loadedSettings.preferences.defaultPrefix,
        },
      };

      isLoaded.value = true;
      isModified.value = false;
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      saveError.value = errorMessage;
      saveStatus.value = 'error';
      console.error('Error loading settings:', error);
      return false;
    }
  }

  /**
   * Save settings to main process
   * 
   * @returns Promise that resolves to true if save was successful
   */
  async function saveSettings(): Promise<boolean> {
    saveStatus.value = 'saving';
    saveError.value = '';

    try {
      const response = await window.api.settings.saveSettings({ settings: settings.value });

      if (response.success) {
        saveStatus.value = 'saved';
        isModified.value = false;
        return true;
      } else {
        saveError.value = response.error || 'Failed to save settings';
        saveStatus.value = 'error';
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      saveError.value = errorMessage;
      saveStatus.value = 'error';
      console.error('Error saving settings:', error);
      return false;
    }
  }

  /**
   * Update settings with partial data
   * 
   * @param updates - Partial settings to update
   */
  function updateSettings(updates: Partial<AppSettings>): void {
    if (updates.lastFolder !== undefined) {
      settings.value.lastFolder = updates.lastFolder;
    }

    if (updates.windowState) {
      settings.value.windowState = {
        ...settings.value.windowState,
        ...updates.windowState,
      };
    }

    if (updates.preferences) {
      settings.value.preferences = {
        ...settings.value.preferences,
        ...updates.preferences,
      };
    }

    isModified.value = true;
  }

  /**
   * Reset settings to defaults
   */
  function resetSettings(): void {
    settings.value = {
      windowState: {
        width: DEFAULT_WINDOW_WIDTH,
        height: DEFAULT_WINDOW_HEIGHT,
      },
      preferences: {
        defaultPrefix: DEFAULT_SETTINGS.preferences.defaultPrefix,
      },
    };

    isModified.value = true;
  }

  /**
   * Update last folder path
   * 
   * @param folderPath - The folder path to set
   */
  function updateLastFolder(folderPath: string): void {
    settings.value.lastFolder = folderPath;
    isModified.value = true;
  }

  /**
   * Update window state
   * 
   * @param windowStateUpdates - Partial window state to update
   */
  function updateWindowState(windowStateUpdates: Partial<AppSettings['windowState']>): void {
    settings.value.windowState = {
      ...settings.value.windowState,
      ...windowStateUpdates,
    };
    isModified.value = true;
  }

  /**
   * Update window dimensions
   * 
   * @param width - Window width
   * @param height - Window height
   */
  function updateWindowDimensions(width: number, height: number): void {
    settings.value.windowState.width = width;
    settings.value.windowState.height = height;
    isModified.value = true;
  }

  /**
   * Update window position
   * 
   * @param x - Window X position
   * @param y - Window Y position
   */
  function updateWindowPosition(x: number, y: number): void {
    settings.value.windowState.x = x;
    settings.value.windowState.y = y;
    isModified.value = true;
  }

  /**
   * Update window maximized state
   * 
   * @param maximized - Whether window is maximized
   */
  function updateWindowMaximized(maximized: boolean): void {
    settings.value.windowState.maximized = maximized;
    isModified.value = true;
  }

  /**
   * Update user preferences
   * 
   * @param preferencesUpdates - Partial preferences to update
   */
  function updatePreferences(preferencesUpdates: Partial<AppSettings['preferences']>): void {
    settings.value.preferences = {
      ...settings.value.preferences,
      ...preferencesUpdates,
    };
    isModified.value = true;
  }

  /**
   * Update default prefix
   * 
   * @param prefix - The default prefix to set
   */
  function updateDefaultPrefix(prefix: string): void {
    settings.value.preferences.defaultPrefix = prefix;
    isModified.value = true;
  }

  /**
   * Auto-save settings with debounce
   * 
   * @param delay - Debounce delay in milliseconds (default: 500)
   */
  function autoSave(delay: number = 500): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      saveSettings();
    }, delay);
  }

  /**
   * Cancel pending auto-save
   */
  function cancelAutoSave(): void {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  }

  /**
   * Get a specific setting value
   * 
   * @param key - The setting key (supports nested keys with dot notation)
   * @returns The setting value or undefined if not found
   */
  function getSetting(key: string): unknown {
    const keys = key.split('.');
    let value: unknown = settings.value;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Set a specific setting value
   * 
   * @param key - The setting key (supports nested keys with dot notation)
   * @param value - The value to set
   */
  function setSetting(key: string, value: unknown): void {
    const keys = key.split('.');
    const lastKey = keys.pop();
    let target: Record<string, unknown> = settings.value as Record<string, unknown>;

    for (const k of keys) {
      if (!(k in target) || typeof target[k] !== 'object') {
        target[k] = {};
      }
      target = target[k] as Record<string, unknown>;
    }

    if (lastKey) {
      target[lastKey] = value;
      isModified.value = true;
    }
  }

  /**
   * Export settings as JSON string
   * 
   * @returns JSON string representation of settings
   */
  function exportSettings(): string {
    return JSON.stringify(settings.value, null, 2);
  }

  /**
   * Import settings from JSON string
   * 
   * @param json - JSON string to import
   * @returns True if import was successful
   */
  function importSettings(json: string): boolean {
    try {
      const parsed = JSON.parse(json);
      
      // Validate basic structure
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Invalid settings format');
      }

      // Merge with current settings
      updateSettings(parsed);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      saveError.value = errorMessage;
      saveStatus.value = 'error';
      return false;
    }
  }

  // ============================================================================
  // WATCHERS
  // ============================================================================

  // Auto-save on settings changes
  watch(
    () => settings.value,
    () => {
      if (isModified.value) {
        autoSave();
      }
    },
    { deep: true }
  );

  // ============================================================================
  // CLEANUP
  // ============================================================================

  onUnmounted(() => {
    cancelAutoSave();
  });

  // ============================================================================
  // RETURN
  // ============================================================================

  return {
    // State
    settings,
    saveStatus,
    saveError,
    isLoaded,
    isModified,

    // Computed
    statistics,
    lastFolder,
    windowState,
    preferences,
    defaultPrefix,
    windowWidth,
    windowHeight,
    windowX,
    windowY,
    windowMaximized,
    isSaving,
    hasError,

    // Operations
    loadSettings,
    saveSettings,
    updateSettings,
    resetSettings,
    updateLastFolder,
    updateWindowState,
    updateWindowDimensions,
    updateWindowPosition,
    updateWindowMaximized,
    updatePreferences,
    updateDefaultPrefix,
    autoSave,
    cancelAutoSave,
    getSetting,
    setSetting,
    exportSettings,
    importSettings,
  };
}