/**
 * Unit Tests for Web Settings Store (localStorage persistence)
 *
 * jsdom provides localStorage; it is cleared before each test so tests are
 * order-independent. No fake-indexeddb needed — settings never touch IDB.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DEFAULT_WINDOW_HEIGHT, DEFAULT_WINDOW_WIDTH } from '@/shared/constants';
import { getSettings, saveSettings } from '@/renderer/platform/web/settings-store';

const SETTINGS_STORAGE_KEY = 'document-prefiller.settings';

const WEB_DEFAULT_WINDOW_STATE = {
  width: DEFAULT_WINDOW_WIDTH,
  height: DEFAULT_WINDOW_HEIGHT,
  maximized: false,
};

beforeEach(() => {
  localStorage.clear();
});

describe('Web Settings Store', () => {
  describe('getSettings', () => {
    it('should return full default settings including windowState when nothing is stored', async () => {
      const settings = await getSettings();

      // useSettings.loadSettings dereferences windowState.width unconditionally:
      // the default MUST include it or web startup crashes.
      expect(settings.windowState).toEqual(WEB_DEFAULT_WINDOW_STATE);
      expect(settings.preferences).toEqual({});
      expect(settings.lastFolder).toBeUndefined();
      expect(settings.lastOutputFolder).toBeUndefined();
    });

    it('should return the constant default windowState even after a mutated windowState was saved', async () => {
      // Failure QA: windowState mutations are write-ignored
      const response = await saveSettings({
        settings: {
          lastFolder: 'ws-abc',
          windowState: { width: 999, height: 555, maximized: true },
          preferences: { defaultPrefix: 'X-' },
        },
      });
      expect(response.success).toBe(true);

      const settings = await getSettings();
      expect(settings.windowState).toEqual(WEB_DEFAULT_WINDOW_STATE);
      expect(settings.windowState.width).not.toBe(999);
      expect(settings.windowState.maximized).toBe(false);
    });

    it('should return defaults when the stored JSON is corrupted', async () => {
      localStorage.setItem(SETTINGS_STORAGE_KEY, '{not valid json');

      const settings = await getSettings();
      expect(settings).toEqual({
        windowState: WEB_DEFAULT_WINDOW_STATE,
        preferences: {},
      });
    });

    it('should return defaults when the stored JSON is not an object', async () => {
      localStorage.setItem(SETTINGS_STORAGE_KEY, '"just a string"');

      const settings = await getSettings();
      expect(settings.windowState).toEqual(WEB_DEFAULT_WINDOW_STATE);
      expect(settings.lastFolder).toBeUndefined();
    });
  });

  describe('saveSettings', () => {
    it('should persist lastFolder, lastOutputFolder and preferences across a save/read roundtrip', async () => {
      const response = await saveSettings({
        settings: {
          lastFolder: 'ws-abc',
          lastOutputFolder: 'out',
          windowState: { width: 100, height: 200 },
          preferences: { defaultPrefix: 'X-' },
        },
      });
      expect(response).toEqual({ success: true });

      const settings = await getSettings();
      expect(settings.lastFolder).toBe('ws-abc');
      expect(settings.lastOutputFolder).toBe('out');
      expect(settings.preferences.defaultPrefix).toBe('X-');
      expect(settings.windowState).toEqual(WEB_DEFAULT_WINDOW_STATE);
    });

    it('should persist the full AppSettings shape including a windowState copy', async () => {
      await saveSettings({ settings: { lastFolder: 'ws-1' } });

      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      expect(raw).not.toBeNull();
      const parsed: unknown = JSON.parse(raw ?? 'null');
      // The stored payload is a FULL AppSettings (windowState = constant default)
      if (typeof parsed === 'object' && parsed !== null && 'windowState' in parsed) {
        expect(parsed.windowState).toEqual(WEB_DEFAULT_WINDOW_STATE);
      } else {
        expect.unreachable('stored settings missing windowState');
      }
    });

    it('should return success:false instead of throwing when localStorage fails', async () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota exceeded');
      });

      const response = await saveSettings({ settings: { lastFolder: 'ws-1' } });

      expect(response.success).toBe(false);
      expect(response.error).toContain('quota exceeded');
      setItemSpy.mockRestore();
    });
  });
});
