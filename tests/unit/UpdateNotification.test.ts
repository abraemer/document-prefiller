import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import UpdateNotification from '@/renderer/components/UpdateNotification.vue'
import type { UpdateStatusEvent, UpdaterActionResponse, UpdaterStateResponse } from '@/shared/types'

/**
 * Minimal VDialog stub mirroring Vuetify's non-eager v-dialog: it renders its
 * default slot ONLY while modelValue is true and emits update:modelValue when
 * the user closes it (Escape / outside click). The bare test mount leaves
 * Vuetify unregistered (see tests/helpers/vuetify.ts), and an unresolved
 * v-dialog would render its slot regardless of the model — the stub keeps
 * production markup idiomatic (actions in the DEFAULT slot; v-dialog has no
 * #actions slot) while making visibility and the close wiring testable.
 */
const VDialogStub = defineComponent({
  name: 'VDialog',
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  setup(props, { slots }) {
    return () =>
      props.modelValue
        ? h('div', { 'data-shim-dialog': true }, [slots.default?.()])
        : null
  },
})

/**
 * Renders the progress bar's bound value as a data attribute so the test can
 * pin that the bar is bound to the composable's live progress ref.
 */
const VProgressLinearStub = defineComponent({
  name: 'VProgressLinear',
  props: {
    modelValue: { type: Number, default: 0 },
  },
  setup(props) {
    return () => h('div', { 'data-progress': String(props.modelValue) })
  },
})

/**
 * Slot-passthrough stub for the globally pre-registered Vuetify stubs
 * (tests/helpers/vuetify.ts registers renderless stubs, and the VTU
 * pre-registration collapses the tree to empty stubs). Each renders the
 * original tag with its default slot so card text and button labels are
 * readable and buttons stay clickable. attrs (data-testid, @click) fall
 * through to the single root automatically.
 */
function SlotPassthrough(tag: string) {
  return defineComponent({
    name: `Passthrough${tag}`,
    setup(_, { slots }) {
      return () => h(tag, slots.default?.())
    },
  })
}

let statusCallback: (event: UpdateStatusEvent) => void = () => {}
let snapshot: UpdaterStateResponse
let downloadResponse: UpdaterActionResponse
let skipResponse: UpdaterActionResponse

function makeSnapshot(overrides: Partial<UpdaterStateResponse> = {}): UpdaterStateResponse {
  return {
    supported: true,
    status: { status: 'idle' },
    currentVersion: '1.0.0',
    ...overrides,
  }
}

function mountNotification() {
  return mount(UpdateNotification, {
    global: {
      stubs: {
        VDialog: VDialogStub,
        VProgressLinear: VProgressLinearStub,
        VCard: SlotPassthrough('div'),
        VCardTitle: SlotPassthrough('div'),
        VCardText: SlotPassthrough('div'),
        VCardActions: SlotPassthrough('div'),
        VBtn: SlotPassthrough('button'),
        VIcon: SlotPassthrough('i'),
      },
    },
  })
}

function offerAvailable(): void {
  statusCallback({ status: 'available', version: '9.9.9', suggestedAction: 'install' })
}

describe('UpdateNotification Component', () => {
  beforeEach(() => {
    statusCallback = () => {}
    snapshot = makeSnapshot()
    downloadResponse = { success: true }
    skipResponse = { success: true }
    window.api = {
      updater: {
        getUpdateState: vi.fn(async () => snapshot),
        installUpdate: vi.fn(async () => ({ success: true })),
        openReleasesPage: vi.fn(async (_version?: string) => ({ success: true })),
        downloadUpdate: vi.fn(async () => downloadResponse),
        skipVersion: vi.fn(async () => skipResponse),
        onUpdaterStatus: vi.fn((cb: (event: UpdateStatusEvent) => void) => {
          statusCallback = cb
        }),
        removeUpdaterStatusListener: vi.fn(),
      },
    } as unknown as typeof window.api
  })

  afterEach(() => {
    window.api = undefined as unknown as typeof window.api
  })

  it('shows the offer dialog with Install update for the install suggestion', async () => {
    // Given: the mounted component listens for status broadcasts
    const wrapper = mountNotification()
    await flushPromises()
    expect(wrapper.find('[data-testid="update-dialog"]').exists()).toBe(false)

    // When: an update is offered (win/linux consent-first flow)
    offerAvailable()
    await flushPromises()

    // Then: the dialog shows the offer content and all four actions
    expect(wrapper.find('[data-testid="update-dialog"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Update available')
    expect(wrapper.text()).toContain('Version 9.9.9 is available (you have 1.0.0).')
    expect(wrapper.find('[data-testid="update-install"]').text()).toBe('Install update')
    expect(wrapper.find('[data-testid="update-skip"]').text()).toBe('Skip this version')
    expect(wrapper.find('[data-testid="update-changelog"]').text()).toBe('View changelog')
    expect(wrapper.find('[data-testid="update-close"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="update-get-update"]').exists()).toBe(false)
  })

  it('shows Get update instead of Install for the open-page suggestion (darwin)', async () => {
    // Given: the mounted component
    const wrapper = mountNotification()
    await flushPromises()

    // When: an update is offered with the manual-download suggestion
    statusCallback({ status: 'available', version: '9.9.9', suggestedAction: 'open-page' })
    await flushPromises()

    // Then: the offer dialog shows Get update and no install button
    expect(wrapper.find('[data-testid="update-dialog"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="update-get-update"]').text()).toBe('Get update')
    expect(wrapper.find('[data-testid="update-install"]').exists()).toBe(false)

    // When: the user clicks Get update
    await wrapper.get('[data-testid="update-get-update"]').trigger('click')
    await flushPromises()

    // Then: the plain releases page is opened (no version argument)
    expect(window.api.updater.openReleasesPage).toHaveBeenCalledTimes(1)
    expect(window.api.updater.openReleasesPage).toHaveBeenCalledWith()
  })

  it('downloads on Install click and shows the live progress bar', async () => {
    // Given: the offer dialog is open and the download response is deferred
    const wrapper = mountNotification()
    await flushPromises()
    offerAvailable()
    await flushPromises()

    // When: the user clicks Install update
    await wrapper.get('[data-testid="update-install"]').trigger('click')
    await flushPromises()

    // Then: the dialog enters downloading at 0% and the IPC call went out
    expect(window.api.updater.downloadUpdate).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="update-dialog"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="update-progress"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="update-progress"]').attributes('data-progress')).toBe('0')
    expect(wrapper.find('[data-testid="update-install"]').exists()).toBe(false)

    // When: main broadcasts progress
    statusCallback({ status: 'downloading', progress: 42 })
    await flushPromises()

    // Then: the progress bar reflects the live value
    expect(wrapper.find('[data-testid="update-progress"]').attributes('data-progress')).toBe('42')
  })

  it('shows the downloaded state with Restart now and Later, and dismisses on Later', async () => {
    // Given: the update finished downloading
    const wrapper = mountNotification()
    await flushPromises()
    statusCallback({ status: 'downloaded', version: '9.9.9', suggestedAction: 'restart' })
    await flushPromises()

    // Then: the restart prompt shows with its two actions
    expect(wrapper.find('[data-testid="update-dialog"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Version 9.9.9 downloaded — restart to update?')
    expect(wrapper.find('[data-testid="update-restart"]').text()).toBe('Restart now')
    expect(wrapper.find('[data-testid="update-later"]').text()).toBe('Later')

    // When: the user clicks Restart now
    await wrapper.get('[data-testid="update-restart"]').trigger('click')
    await flushPromises()

    // Then: the install action is dispatched
    expect(window.api.updater.installUpdate).toHaveBeenCalledTimes(1)

    // When: the user clicks Later
    await wrapper.get('[data-testid="update-later"]').trigger('click')
    await flushPromises()

    // Then: the dialog hides and NO subsequent broadcast re-opens it
    expect(wrapper.find('[data-testid="update-dialog"]').exists()).toBe(false)
    offerAvailable()
    await flushPromises()
    expect(wrapper.find('[data-testid="update-dialog"]').exists()).toBe(false)
  })

  it('skips the version: calls skipVersion, hides the dialog, and stays hidden', async () => {
    // Given: the offer dialog is open
    const wrapper = mountNotification()
    await flushPromises()
    offerAvailable()
    await flushPromises()

    // When: the user clicks Skip this version and main confirms
    await wrapper.get('[data-testid="update-skip"]').trigger('click')
    await flushPromises()

    // Then: the skip is dispatched, the dialog hides, and a fresh offer stays hidden
    expect(window.api.updater.skipVersion).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="update-dialog"]').exists()).toBe(false)
    offerAvailable()
    await flushPromises()
    expect(wrapper.find('[data-testid="update-dialog"]').exists()).toBe(false)
  })

  it('opens the changelog for the offered version and the dialog STAYS open', async () => {
    // Given: the offer dialog is open
    const wrapper = mountNotification()
    await flushPromises()
    offerAvailable()
    await flushPromises()

    // When: the user clicks View changelog
    await wrapper.get('[data-testid="update-changelog"]').trigger('click')
    await flushPromises()

    // Then: the offered version's release page is requested and the dialog stays open
    expect(window.api.updater.openReleasesPage).toHaveBeenCalledTimes(1)
    expect(window.api.updater.openReleasesPage).toHaveBeenCalledWith('9.9.9')
    expect(wrapper.find('[data-testid="update-dialog"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="update-install"]').exists()).toBe(true)
  })

  it('dismisses the session on the ✕ close button', async () => {
    // Given: the offer dialog is open
    const wrapper = mountNotification()
    await flushPromises()
    offerAvailable()
    await flushPromises()

    // When: the user clicks the ✕ icon
    await wrapper.get('[data-testid="update-close"]').trigger('click')
    await flushPromises()

    // Then: the dialog hides and NO subsequent broadcast re-opens it (session dismissal)
    expect(wrapper.find('[data-testid="update-dialog"]').exists()).toBe(false)
    offerAvailable()
    await flushPromises()
    expect(wrapper.find('[data-testid="update-dialog"]').exists()).toBe(false)
    statusCallback({ status: 'downloaded', version: '9.9.9', suggestedAction: 'restart' })
    await flushPromises()
    expect(wrapper.find('[data-testid="update-dialog"]').exists()).toBe(false)
  })

  it('maps the v-dialog default close (Escape / outside click) to dismiss', async () => {
    // Given: the offer dialog is open
    const wrapper = mountNotification()
    await flushPromises()
    offerAvailable()
    await flushPromises()
    expect(wrapper.find('[data-testid="update-dialog"]').exists()).toBe(true)

    // When: v-dialog's default close flips the model to false
    wrapper.findComponent(VDialogStub).vm.$emit('update:modelValue', false)
    await flushPromises()

    // Then: the dialog hides and the session is dismissed (no re-open on the next broadcast)
    expect(wrapper.find('[data-testid="update-dialog"]').exists()).toBe(false)
    offerAvailable()
    await flushPromises()
    expect(wrapper.find('[data-testid="update-dialog"]').exists()).toBe(false)
  })

  it('lands in download-error with the message, offers Try again, and retry re-enters downloading on success', async () => {
    // Given: a user-initiated download failed via a failed response
    const wrapper = mountNotification()
    await flushPromises()
    offerAvailable()
    await flushPromises()
    downloadResponse = { success: false, error: 'flaky network' }

    // When: the user clicked Install and the guard failed
    await wrapper.get('[data-testid="update-install"]').trigger('click')
    await flushPromises()

    // Then: the dialog shows the failure state, not a progress bar
    expect(wrapper.find('[data-testid="update-dialog"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="update-error-text"]').text()).toBe('flaky network')
    expect(wrapper.find('[data-testid="update-progress"]').exists()).toBe(false)

    // When: the user clicks Try again and the retry succeeds
    downloadResponse = { success: true }
    await wrapper.get('[data-testid="update-retry"]').trigger('click')
    await flushPromises()

    // Then: the dialog re-enters the downloading state
    expect(window.api.updater.downloadUpdate).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="update-progress"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="update-error-text"]').exists()).toBe(false)
  })

  it('shows the retry failure message when the retry response fails', async () => {
    // Given: a download previously failed
    const wrapper = mountNotification()
    await flushPromises()
    offerAvailable()
    await flushPromises()
    downloadResponse = { success: false, error: 'first failure' }
    await wrapper.get('[data-testid="update-install"]').trigger('click')
    await flushPromises()

    // When: the user clicks Try again and the retry fails with a new message
    downloadResponse = { success: false, error: 'x' }
    await wrapper.get('[data-testid="update-retry"]').trigger('click')
    await flushPromises()

    // Then: the error text shows the retry's message, still in the error state
    expect(wrapper.find('[data-testid="update-error-text"]').text()).toBe('x')
    expect(wrapper.find('[data-testid="update-progress"]').exists()).toBe(false)
  })

  it('returns from download-error to the offer state via Back', async () => {
    // Given: the dialog is in the download-error state
    const wrapper = mountNotification()
    await flushPromises()
    offerAvailable()
    await flushPromises()
    downloadResponse = { success: false, error: 'flaky network' }
    await wrapper.get('[data-testid="update-install"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="update-error-text"]').exists()).toBe(true)

    // When: the user clicks Back
    await wrapper.get('[data-testid="update-back"]').trigger('click')
    await flushPromises()

    // Then: the offer state is restored (install button back, error text gone)
    expect(wrapper.find('[data-testid="update-dialog"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="update-install"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="update-error-text"]').exists()).toBe(false)
  })

  it('recovers from a mid-download error broadcast: error text, not a frozen progress bar', async () => {
    // Given: the offer is open and the download request is in flight
    const wrapper = mountNotification()
    await flushPromises()
    offerAvailable()
    await flushPromises()
    await wrapper.get('[data-testid="update-install"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="update-progress"]').exists()).toBe(true)

    // When: main broadcasts the download failure
    statusCallback({ status: 'error', error: 'boom' })
    await flushPromises()

    // Then: the dialog shows the error text and no progress bar
    expect(wrapper.find('[data-testid="update-error-text"]').text()).toBe('boom')
    expect(wrapper.find('[data-testid="update-progress"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="update-retry"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="update-back"]').exists()).toBe(true)
  })

  it('renders nothing when window.api is unavailable (dev guard)', async () => {
    // Given: the preload API bridge is absent
    window.api = undefined as unknown as typeof window.api

    // When: the component mounts
    const wrapper = mountNotification()
    await flushPromises()

    // Then: it neither throws nor renders a dialog, and binds no listener
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('[data-testid="update-dialog"]').exists()).toBe(false)
    expect(window.api).toBeUndefined()
  })
})
