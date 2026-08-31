import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import UpdateNotification from '@/renderer/components/UpdateNotification.vue'
import type { UpdateStatusEvent, UpdaterStateResponse } from '@/shared/types'

/**
 * Minimal VSnackbar stub forwarding the default and #actions slots.
 * The bare test mount leaves Vuetify unregistered (see tests/helpers/vuetify.ts),
 * and unresolved v-snackbar elements do not render named slots, so the action
 * buttons would be unreachable. This stub keeps production markup idiomatic
 * (template #actions, like App.vue) while making buttons interactive in tests.
 */
const VSnackbarStub = defineComponent({
  name: 'VSnackbar',
  props: {
    modelValue: { type: Boolean, default: false },
    color: { type: String, default: undefined },
    timeout: { type: Number, default: undefined },
    location: { type: String, default: undefined },
  },
  emits: ['update:modelValue'],
  setup(props, { slots }) {
    return () =>
      h(
        'div',
        { 'data-shim-snackbar': true, style: { display: props.modelValue ? '' : 'none' } },
        [slots.default?.(), slots.actions?.()]
      )
  },
})

let statusCallback: (event: UpdateStatusEvent) => void = () => {}
let snapshot: UpdaterStateResponse

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
        VSnackbar: VSnackbarStub,
      },
    },
  })
}

describe('UpdateNotification Component', () => {
  beforeEach(() => {
    statusCallback = () => {}
    snapshot = makeSnapshot()
    window.api = {
      updater: {
        getUpdateState: vi.fn(async () => snapshot),
        installUpdate: vi.fn(async () => ({ success: true })),
        openReleasesPage: vi.fn(async () => ({ success: true })),
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

  it('shows a restart snackbar for a downloaded update and installs on Restart click', async () => {
    // Given: startup snapshot reports a downloaded update awaiting restart
    snapshot = makeSnapshot({
      status: { status: 'downloaded', version: '9.9.9', suggestedAction: 'restart' },
    })

    // When: the component mounts and folds in the snapshot
    const wrapper = mountNotification()
    await flushPromises()

    // Then: the restart snackbar is visible with its actions
    expect(wrapper.find('[data-testid="update-snackbar"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Version 9.9.9 downloaded — restart to update?')
    expect(wrapper.find('[data-testid="update-restart"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="update-later"]').exists()).toBe(true)

    // When: the user clicks Restart
    await wrapper.get('[data-testid="update-restart"]').trigger('click')
    await flushPromises()

    // Then: the install action is dispatched
    expect(window.api.updater.installUpdate).toHaveBeenCalledTimes(1)
  })

  it('shows a download snackbar for an available update and opens the releases page on Download click', async () => {
    // Given: the mounted component listens for status broadcasts
    const wrapper = mountNotification()
    await flushPromises()
    expect(wrapper.find('[data-testid="update-snackbar"]').exists()).toBe(false)

    // When: a new version becomes available with the open-page suggestion
    statusCallback({
      status: 'available',
      version: '9.9.9',
      suggestedAction: 'open-page',
    })
    await flushPromises()

    // Then: the download snackbar is visible with its actions
    expect(wrapper.find('[data-testid="update-snackbar"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('New version 9.9.9 available')
    expect(wrapper.find('[data-testid="update-download"]').exists()).toBe(true)

    // When: the user clicks Download
    await wrapper.get('[data-testid="update-download"]').trigger('click')
    await flushPromises()

    // Then: the releases page action is dispatched
    expect(window.api.updater.openReleasesPage).toHaveBeenCalledTimes(1)
  })

  it('stays silent on error and hides the snackbar after Later on a downloaded update', async () => {
    // Given: a downloaded update is announced
    const wrapper = mountNotification()
    await flushPromises()
    statusCallback({
      status: 'downloaded',
      version: '9.9.9',
      suggestedAction: 'restart',
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="update-snackbar"]').exists()).toBe(true)

    // When: an error status is broadcast
    statusCallback({ status: 'error', error: 'boom' })
    await flushPromises()

    // Then: nothing is rendered and no throw escaped
    expect(wrapper.find('[data-testid="update-snackbar"]').exists()).toBe(false)

    // Given: the update is downloaded again
    statusCallback({
      status: 'downloaded',
      version: '9.9.9',
      suggestedAction: 'restart',
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="update-snackbar"]').exists()).toBe(true)

    // When: the user clicks Later
    await wrapper.get('[data-testid="update-later"]').trigger('click')
    await flushPromises()

    // Then: the snackbar is gone and the listener is torn down on unmount
    expect(wrapper.find('[data-testid="update-snackbar"]').exists()).toBe(false)
    wrapper.unmount()
    expect(window.api.updater.removeUpdaterStatusListener).toHaveBeenCalledTimes(1)
  })

  it('renders nothing when window.api is unavailable (dev guard)', async () => {
    // Given: the preload API bridge is absent
    window.api = undefined as unknown as typeof window.api

    // When: the component mounts
    const wrapper = mountNotification()
    await flushPromises()

    // Then: it neither throws nor renders a snackbar, and binds no listener
    expect(wrapper.exists()).toBe(true)
    expect(wrapper.find('[data-testid="update-snackbar"]').exists()).toBe(false)
    expect(window.api).toBeUndefined()
  })
})
