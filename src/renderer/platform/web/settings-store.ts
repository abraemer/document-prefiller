/**
 * Web Settings Store
 *
 * localStorage-backed settings for the web variant (separate module from the
 * desktop's electron-store — useSettings.ts stays untouched).
 *
 * Storage: localStorage key `document-prefiller.settings` holding a FULL
 * AppSettings. windowState is write-ignored: saves always persist the
 * constant default in its place and reads always return that constant,
 * because `useSettings.loadSettings` dereferences
 * `loadedSettings.windowState.width` unconditionally — a settings payload
 * without windowState would crash web startup. Window geometry mutations are
 * meaningless in a browser tab and are therefore never persisted.
 *
 * Export shapes match PlatformAPI.settings (todo 12's shim wraps these
 * directly): `getSettings(): Promise<AppSettings>` and
 * `saveSettings(request): Promise<SaveSettingsResponse>`.
 */

import type {
  AppSettings,
  SaveSettingsRequest,
  SaveSettingsResponse,
} from '../../../shared/types';
import { DEFAULT_WINDOW_HEIGHT, DEFAULT_WINDOW_WIDTH } from '../../../shared/constants';

const SETTINGS_STORAGE_KEY = 'document-prefiller.settings';

/** Constant window state used for every persisted copy AND every read */
const WEB_DEFAULT_WINDOW_STATE = {
  width: DEFAULT_WINDOW_WIDTH,
  height: DEFAULT_WINDOW_HEIGHT,
  maximized: false,
} as const;

function defaultWebSettings(): AppSettings {
  return {
    windowState: { ...WEB_DEFAULT_WINDOW_STATE },
    preferences: {},
  };
}

/** Fields recoverable from storage; windowState is intentionally absent (write-ignored) */
interface PersistedSettings {
  lastFolder?: string;
  lastOutputFolder?: string;
  defaultPrefix?: string;
}

function parsePersistedSettings(raw: string): PersistedSettings | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const defaultPrefix =
    'preferences' in parsed &&
    typeof parsed.preferences === 'object' &&
    parsed.preferences !== null &&
    'defaultPrefix' in parsed.preferences &&
    typeof parsed.preferences.defaultPrefix === 'string'
      ? parsed.preferences.defaultPrefix
      : undefined;

  return {
    lastFolder: 'lastFolder' in parsed && typeof parsed.lastFolder === 'string' ? parsed.lastFolder : undefined,
    lastOutputFolder:
      'lastOutputFolder' in parsed && typeof parsed.lastOutputFolder === 'string'
        ? parsed.lastOutputFolder
        : undefined,
    defaultPrefix,
  };
}

/** Get web settings; always returns a FULL AppSettings including windowState. */
export async function getSettings(): Promise<AppSettings> {
  const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (raw === null) return defaultWebSettings();

  const persisted = parsePersistedSettings(raw);
  if (persisted === null) return defaultWebSettings();

  return {
    lastFolder: persisted.lastFolder,
    lastOutputFolder: persisted.lastOutputFolder,
    windowState: { ...WEB_DEFAULT_WINDOW_STATE },
    preferences: { defaultPrefix: persisted.defaultPrefix },
  };
}

/** Save web settings. windowState mutations are write-ignored. */
export async function saveSettings(request: SaveSettingsRequest): Promise<SaveSettingsResponse> {
  const settings = request.settings;
  const persisted = {
    lastFolder: settings.lastFolder,
    lastOutputFolder: settings.lastOutputFolder,
    windowState: { ...WEB_DEFAULT_WINDOW_STATE },
    preferences: settings.preferences,
  };
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(persisted));
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `Failed to save settings: ${message}` };
  }
}
