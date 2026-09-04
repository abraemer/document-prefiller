import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import App from '@/renderer/App.vue'
import type { AppSettings, UpdaterStateResponse } from '@/shared/types'

function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    windowState: { width: 1200, height: 800 },
    preferences: {},
    ...overrides,
  }
}

function makeUpdaterSnapshot(overrides: Partial<UpdaterStateResponse> = {}): UpdaterStateResponse {
  return {
    supported: false,
    status: { status: 'idle' },
    currentVersion: '1.0.0',
    ...overrides,
  }
}

/**
 * Minimal window.api mock harness so App.vue's mount flow (settings load,
 * startup auto-scan, saved-values load, updater state) completes cleanly.
 * Pattern copied from tests/unit/UpdateNotification.test.ts: direct
 * window.api assignment with afterEach cleanup. Todo 14 extends this harness.
 */
function stubWindowApi(settings: AppSettings) {
  const api = {
    folder: {
      scanFolder: vi.fn(async () => ({ documents: [] })),
      selectFolder: vi.fn(async () => ({ canceled: true })),
      checkOutputFolder: vi.fn(async () => ({ documents: [] })),
    },
    document: {
      replaceDocuments: vi.fn(async () => ({ success: true })),
      getDocuments: vi.fn(async () => ({ documents: [] })),
    },
    settings: {
      getSettings: vi.fn(async () => settings),
      saveSettings: vi.fn(async () => ({ success: true })),
    },
    saveFile: {
      readSaveFile: vi.fn(async () => ({ success: false })),
      writeSaveFile: vi.fn(async () => ({ success: true })),
      getSaveFileLastModified: vi.fn(async () => ({ success: false })),
    },
    window: {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
    },
    events: {
      onSettingsChanged: vi.fn(),
      removeSettingsChangedListener: vi.fn(),
      onDocumentUpdated: vi.fn(),
      removeDocumentUpdatedListener: vi.fn(),
      onError: vi.fn(),
      removeErrorListener: vi.fn(),
      removeAllListeners: vi.fn(),
    },
    updater: {
      getUpdateState: vi.fn(async () => makeUpdaterSnapshot()),
      installUpdate: vi.fn(async () => ({ success: true })),
      openReleasesPage: vi.fn(async () => ({ success: true })),
      onUpdaterStatus: vi.fn(),
      removeUpdaterStatusListener: vi.fn(),
    },
  }
  window.api = api as unknown as typeof window.api
  return api
}

describe('App Component', () => {
  afterEach(() => {
    window.api = undefined as unknown as typeof window.api
  })

  it('should render the component', () => {
    const wrapper = mount(App)
    expect(wrapper.exists()).toBe(true)
  })

  it('should have a root element', () => {
    const wrapper = mount(App)
    expect(wrapper.element.tagName).toBeDefined()
  })

  it('passes the configured marker prefix to the startup auto-scan', async () => {
    // Given: settings remember a last folder and a custom default prefix;
    // onMounted sets markerPrefix from preferences BEFORE auto-scanning
    const settings = makeSettings({
      lastFolder: 'X',
      preferences: { defaultPrefix: 'CUSTOM-' },
    })
    const api = stubWindowApi(settings)

    // When: App mounts and the startup auto-scan runs
    mount(App)
    await flushPromises()

    // Then: the scan request carries the configured prefix, not DEFAULT_PREFIX
    expect(api.folder.scanFolder).toHaveBeenCalledTimes(1)
    expect(api.folder.scanFolder).toHaveBeenCalledWith('X', 'CUSTOM-')
  })
})
