import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper, DOMWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import App from '@/renderer/App.vue'
import { DEFAULT_PREFIX } from '@/shared/constants'
import type {
  AppSettings,
  PlatformCapabilities,
  ReplaceDocumentsResponse,
  ScanFolderResponse,
  SelectFolderResponse,
  UpdaterStateResponse,
} from '@/shared/types'

function makeSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    windowState: { width: 1200, height: 800 },
    preferences: {},
    ...overrides,
  }
}

function makeCapabilities(overrides: Partial<PlatformCapabilities> = {}): PlatformCapabilities {
  return {
    variant: 'native',
    startupScan: 'auto',
    outputMode: 'disk',
    updater: true,
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
 * window.api assignment with afterEach cleanup. Scaffolded in todo 5,
 * extended in todo 14 with capabilities plus the per-flow web methods
 * (reopenLast, ingestDroppedItems).
 */
function stubWindowApi(settings: AppSettings, capabilities: PlatformCapabilities = makeCapabilities()) {
  const api = {
    capabilities,
    folder: {
      scanFolder: vi.fn(
        async (_folderPath: string, _prefix?: string): Promise<ScanFolderResponse> => ({ documents: [] })
      ),
      selectFolder: vi.fn(async () => ({ canceled: true })),
      checkOutputFolder: vi.fn(async () => ({ documents: [] })),
      reopenLast: vi.fn(
        async (_?: undefined): Promise<SelectFolderResponse> => ({ folderPath: null })
      ),
      ingestDroppedItems: vi.fn(
        async (_items: DataTransferItemList): Promise<SelectFolderResponse> => ({ folderPath: null })
      ),
    },
    document: {
      replaceDocuments: vi.fn(
        async (
          _folderPath: string,
          _markers: unknown[],
          _outputFolder?: string
        ): Promise<ReplaceDocumentsResponse> => ({ success: true, processed: 0 })
      ),
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

/**
 * Per-mount replacements for the global component stubs registered in
 * tests/setup.ts (config.global.stubs). VTU pre-registers every stub key
 * as a renderless global component ({ name }), so the Vuetify tags RESOLVE
 * (no "failed to resolve" element fallback) and the whole tree collapses
 * to empty stubs — and a `false` opt-out leaves the renderless placeholder
 * in place. These slot passthroughs restore rendering: each renders the
 * original tag with its default slot, so buttons are clickable and
 * snackbar/banner text is visible. Same pattern as the VSnackbarStub in
 * tests/unit/UpdateNotification.test.ts.
 */
const slotPassthrough = (tag: string) =>
  defineComponent({
    setup: (_, { slots }) => () => h(tag, slots.default?.()),
  })

/**
 * Tooltip passthrough: unlike slotPassthrough, renders BOTH the activator
 * (with empty tooltip props bound) and the default slot, so warning
 * tooltips in App.vue are visible and assertable in the mounted tree.
 */
const VTooltipStub = defineComponent({
  setup: (_, { slots }) => () =>
    h('v-tooltip', [slots.activator?.({ props: {} }), slots.default?.()]),
})

const RENDERED_STUBS = {
  VApp: slotPassthrough('v-app'),
  VMain: slotPassthrough('v-main'),
  VContainer: slotPassthrough('v-container'),
  VRow: slotPassthrough('v-row'),
  VCol: slotPassthrough('v-col'),
  VCard: slotPassthrough('v-card'),
  VCardTitle: slotPassthrough('v-card-title'),
  VCardText: slotPassthrough('v-card-text'),
  VBtn: slotPassthrough('v-btn'),
  VIcon: slotPassthrough('v-icon'),
  VDivider: slotPassthrough('v-divider'),
  VTooltip: VTooltipStub,
}

function mountApp() {
  return mount(App, { global: { stubs: RENDERED_STUBS } })
}

/** Find a rendered button (unresolved v-btn elements) by label substring. */
function findButton(wrapper: VueWrapper, label: string): DOMWrapper<Element> {
  const button = wrapper.findAll('v-btn').find((b) => b.text().includes(label))
  if (button === undefined) {
    throw new Error(`Button containing "${label}" not found`)
  }
  return button
}

/** A synthetic drop/dragover event carrying a fake dataTransfer. */
function makeDragEvent(type: string, items: string[] = []) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: { items } })
  return event
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

  it('replaces via ZIP download without an output-folder dialog (download mode)', async () => {
    // Given: a scanned web workspace with detected markers
    const settings = makeSettings({ lastFolder: 'ws-1' })
    const capabilities = makeCapabilities({
      variant: 'web-upload',
      startupScan: 'auto',
      outputMode: 'download',
      updater: false,
    })
    const api = stubWindowApi(settings, capabilities)
    api.folder.scanFolder.mockResolvedValue({
      documents: [{ path: 'ws-1/contract.docx', name: 'contract.docx', markers: ['REPLACEME-NAME'] }],
    })
    api.document.replaceDocuments.mockResolvedValue({ success: true, processed: 3 })

    // When: the user triggers Replace
    const wrapper = mountApp()
    await flushPromises()
    await findButton(wrapper, 'Replace').trigger('click')
    await flushPromises()

    // Then: no second selectFolder call, no overwrite check, no confirm
    // dialog — the replacement runs directly and announces the ZIP
    expect(api.folder.selectFolder).not.toHaveBeenCalled()
    expect(api.folder.checkOutputFolder).not.toHaveBeenCalled()
    expect(api.document.replaceDocuments).toHaveBeenCalledTimes(1)
    expect(api.document.replaceDocuments).toHaveBeenCalledWith('ws-1', expect.anything(), undefined)
    expect(wrapper.text()).toContain('Downloaded 3 documents as a ZIP file')
  })

  it('defers the startup scan behind the reopen banner (gesture startup)', async () => {
    // Given: a web-fss session whose last workspace needs a permission gesture
    const settings = makeSettings({
      lastFolder: 'ws-1',
      preferences: { defaultPrefix: 'CUSTOM-' },
    })
    const capabilities = makeCapabilities({
      variant: 'web-fss',
      startupScan: 'gesture',
      outputMode: 'download',
      updater: false,
    })
    const api = stubWindowApi(settings, capabilities)
    api.folder.reopenLast.mockResolvedValue({ folderPath: 'ws-1' })

    // When: App mounts
    const wrapper = mountApp()
    await flushPromises()

    // Then: no scan ran and no error UI surfaced — the banner waits for
    // the user's gesture
    expect(api.folder.scanFolder).not.toHaveBeenCalled()
    expect(api.folder.reopenLast).not.toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('Scan Failed')
    expect(wrapper.text()).toContain("Reopen 'ws-1'")

    // When: the user clicks the reopen banner
    await findButton(wrapper, "Reopen '").trigger('click')
    await flushPromises()

    // Then: the reopened workspace scans once, with the retained custom
    // default prefix (not DEFAULT_PREFIX)
    expect(api.folder.reopenLast).toHaveBeenCalledTimes(1)
    expect(api.folder.scanFolder).toHaveBeenCalledTimes(1)
    expect(api.folder.scanFolder).toHaveBeenCalledWith('ws-1', 'CUSTOM-')
  })

  it('surfaces the adapter error and aborts when reopening is denied (gesture startup)', async () => {
    // Given: the adapter denies the permission regrant
    const settings = makeSettings({ lastFolder: 'ws-1' })
    const capabilities = makeCapabilities({
      variant: 'web-fss',
      startupScan: 'gesture',
      outputMode: 'download',
      updater: false,
    })
    const api = stubWindowApi(settings, capabilities)
    api.folder.reopenLast.mockResolvedValue({
      folderPath: null,
      error: 'Folder permission was denied',
    })

    // When: the user clicks the reopen banner
    const wrapper = mountApp()
    await flushPromises()
    await findButton(wrapper, "Reopen '").trigger('click')
    await flushPromises()

    // Then: the snackbar shows the adapter's exact error string and the
    // flow aborts before any scan
    expect(wrapper.text()).toContain('Folder permission was denied')
    expect(api.folder.scanFolder).not.toHaveBeenCalled()
  })

  it('ingests a dropped folder into the workspace flow (web-upload variant)', async () => {
    // Given: the upload tier accepts drag-dropped folders
    const capabilities = makeCapabilities({
      variant: 'web-upload',
      startupScan: 'auto',
      outputMode: 'download',
      updater: false,
    })
    const api = stubWindowApi(makeSettings(), capabilities)
    api.folder.ingestDroppedItems.mockResolvedValue({ folderPath: 'ws-drop' })

    const wrapper = mountApp()
    await flushPromises()

    // When: a folder is dragged over and dropped onto the folder card
    const dropZone = wrapper.find('.folder-drop-zone')
    expect(dropZone.exists()).toBe(true)
    // dragover is intercepted (preventDefault) so the browser allows the drop
    expect(dropZone.element.dispatchEvent(makeDragEvent('dragover'))).toBe(false)
    expect(dropZone.element.dispatchEvent(makeDragEvent('drop', ['dropped-item']))).toBe(false)
    await flushPromises()

    // Then: the dropped items are ingested and the resulting workspace
    // flows through the same path as the folder button
    expect(api.folder.ingestDroppedItems).toHaveBeenCalledTimes(1)
    expect(api.folder.ingestDroppedItems).toHaveBeenCalledWith(['dropped-item'])
    expect(api.folder.selectFolder).not.toHaveBeenCalled()
    expect(api.folder.scanFolder).toHaveBeenCalledTimes(1)
    expect(api.folder.scanFolder).toHaveBeenCalledWith('ws-drop', DEFAULT_PREFIX)
  })

  it('attaches no drag-drop listeners on the native variant', async () => {
    // Given: native capabilities (default harness)
    const api = stubWindowApi(makeSettings({ lastFolder: 'X' }))
    const wrapper = mountApp()
    await flushPromises()

    // When: a drop is dispatched onto the folder card
    const dropZone = wrapper.find('.folder-drop-zone')
    // Then: the event is not intercepted and nothing is ingested
    expect(dropZone.element.dispatchEvent(makeDragEvent('drop', ['dropped-item']))).toBe(true)
    await flushPromises()
    expect(api.folder.ingestDroppedItems).not.toHaveBeenCalled()
  })

  it('attaches no drag-drop listeners on the web-fss variant', async () => {
    // Given: fss-tier capabilities (folders come from the directory picker)
    const capabilities = makeCapabilities({
      variant: 'web-fss',
      startupScan: 'gesture',
      outputMode: 'download',
      updater: false,
    })
    const api = stubWindowApi(makeSettings(), capabilities)
    const wrapper = mountApp()
    await flushPromises()

    // When: a drop is dispatched onto the folder card
    const dropZone = wrapper.find('.folder-drop-zone')
    // Then: the event is not intercepted and nothing is ingested
    expect(dropZone.element.dispatchEvent(makeDragEvent('drop', ['dropped-item']))).toBe(true)
    await flushPromises()
    expect(api.folder.ingestDroppedItems).not.toHaveBeenCalled()
  })

  it('disables Refresh with a warning tooltip on the web-upload variant', async () => {
    // Given: the snapshot tier (no live folder access — a rescan cannot see
    // disk changes, so Refresh is meaningless)
    const capabilities = makeCapabilities({
      variant: 'web-upload',
      startupScan: 'auto',
      outputMode: 'download',
      updater: false,
    })
    stubWindowApi(makeSettings(), capabilities)
    const wrapper = mountApp()
    await flushPromises()

    // Then: the Refresh button is disabled and the snapshot warning tooltip
    // (with its warning icon) is rendered next to it. The icon lookup is
    // scoped to the button's flex wrapper — the hidden warning snackbar
    // elsewhere in the tree uses the same mdi-alert icon.
    const refreshButton = findButton(wrapper, 'Refresh')
    expect(refreshButton.attributes('disabled')).toBeDefined()
    expect(
      refreshButton.element.parentElement?.querySelector('v-icon[icon="mdi-alert"]')
    ).not.toBeNull()
    expect(wrapper.text()).toContain(
      "This browser keeps a local snapshot of your documents that doesn't update automatically. To load new or changed documents, click 'Change' and re-select the folder."
    )
  })

  it('keeps Refresh enabled without a warning tooltip on the native variant', async () => {
    // Given: native capabilities (default harness — live folder access)
    stubWindowApi(makeSettings({ lastFolder: 'X' }))
    const wrapper = mountApp()
    await flushPromises()

    // Then: Refresh is enabled and no snapshot warning exists
    // (the passthrough stub renders the disabled prop as a raw attribute,
    // so "enabled" shows up as the literal string "false"; the icon lookup
    // is scoped to the button's wrapper to skip the hidden warning snackbar)
    const refreshButton = findButton(wrapper, 'Refresh')
    expect(refreshButton.attributes('disabled')).toBe('false')
    expect(
      refreshButton.element.parentElement?.querySelector('v-icon[icon="mdi-alert"]')
    ).toBeNull()
    expect(wrapper.text()).not.toContain('local snapshot of your documents')
  })

  it('renders the local-processing privacy note on all variants', async () => {
    // Given: the native harness (note is variant-independent)
    stubWindowApi(makeSettings())
    const wrapper = mountApp()
    await flushPromises()

    // Then: the privacy caption is present in the main card
    expect(wrapper.text()).toContain(
      'All processing happens locally — your documents never leave this device.'
    )
  })
})
