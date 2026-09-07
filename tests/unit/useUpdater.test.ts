import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { useUpdater } from '@/renderer/composables/useUpdater'
import type { UpdateStatusEvent, UpdaterStateResponse, UpdaterActionResponse } from '@/shared/types'

/**
 * useUpdater dialog state machine tests (todo 4).
 *
 * The composable is mounted inside a dummy host so its onMounted lifecycle
 * (subscribe-then-snapshot) and onUnmounted cleanup run, mirroring the
 * useUpdater-over-shim pattern in web-adapter.test.ts.
 */

let statusCallback: (event: UpdateStatusEvent) => void = () => {}
let snapshot: UpdaterStateResponse
let downloadResponse: UpdaterActionResponse
let skipResponse: UpdaterActionResponse
/** When true, downloadUpdate resolves only when the test calls resolveDownload. */
let useDeferredDownload = false
let resolveDownload: ((response: UpdaterActionResponse) => void) | null = null
let updaterState: ReturnType<typeof useUpdater> | undefined

function makeSnapshot(overrides: Partial<UpdaterStateResponse> = {}): UpdaterStateResponse {
  return {
    supported: true,
    status: { status: 'idle' },
    currentVersion: '1.0.0',
    ...overrides,
  }
}

function mountUpdater(): ReturnType<typeof mount> {
  const Host = defineComponent({
    setup() {
      updaterState = useUpdater()
      return () => h('div')
    },
  })
  return mount(Host)
}

describe('useUpdater composable: event-driven dialog states', () => {
  beforeEach(() => {
    statusCallback = () => {}
    snapshot = makeSnapshot()
    downloadResponse = { success: true }
    skipResponse = { success: true }
    useDeferredDownload = false
    resolveDownload = null
    updaterState = undefined
    window.api = {
      updater: {
        getUpdateState: vi.fn(async () => snapshot),
        installUpdate: vi.fn(async () => ({ success: true })),
        openReleasesPage: vi.fn(async (_version?: string) => ({ success: true })),
        downloadUpdate: vi.fn(async () => {
          if (useDeferredDownload) {
            return new Promise<UpdaterActionResponse>((resolve) => {
              resolveDownload = resolve
            })
          }
          return downloadResponse
        }),
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

  it('shows the offer dialog for an available update with the install suggestion', async () => {
    // Given: mounted against an idle snapshot
    mountUpdater()
    await flushPromises()

    // When: an update is offered (win/linux consent-first flow)
    statusCallback({ status: 'available', version: '9.9.9', suggestedAction: 'install' })
    await flushPromises()

    // Then: the dialog enters the offer state
    expect(updaterState?.dialogState.value).toBe('offer')
    expect(updaterState?.version.value).toBe('9.9.9')
  })

  it('shows the offer dialog for the darwin open-page suggestion', async () => {
    // Given: mounted
    mountUpdater()
    await flushPromises()

    // When: an update is offered with the manual-download suggestion
    statusCallback({ status: 'available', version: '9.9.9', suggestedAction: 'open-page' })
    await flushPromises()

    // Then: the offer dialog is shown
    expect(updaterState?.dialogState.value).toBe('offer')
  })

  it('stays hidden for an available broadcast without a suggested action (skip-suppressed)', async () => {
    // Given: mounted
    mountUpdater()
    await flushPromises()

    // When: a suppressed offer arrives with no suggestion
    statusCallback({ status: 'available', version: '9.9.9' })
    await flushPromises()

    // Then: no dialog
    expect(updaterState?.dialogState.value).toBeNull()
  })

  it('enters the downloading state with live progress', async () => {
    // Given: an update was offered
    mountUpdater()
    await flushPromises()
    statusCallback({ status: 'available', version: '9.9.9', suggestedAction: 'install' })

    // When: the download progresses
    statusCallback({ status: 'downloading', progress: 42 })
    await flushPromises()

    // Then: the dialog shows the downloading state with the progress value
    expect(updaterState?.dialogState.value).toBe('downloading')
    expect(updaterState?.progress.value).toBe(42)
  })

  it('enters the downloaded state for a restart-suggested update', async () => {
    // Given: mounted
    mountUpdater()
    await flushPromises()

    // When: the update finishes downloading
    statusCallback({ status: 'downloaded', version: '9.9.9', suggestedAction: 'restart' })
    await flushPromises()

    // Then: the dialog offers the restart
    expect(updaterState?.dialogState.value).toBe('downloaded')
  })

  it('stays hidden for a downloaded broadcast without the restart suggestion (replay-suppressed)', async () => {
    // Given: mounted
    mountUpdater()
    await flushPromises()

    // When: a cache-replayed download arrives with no suggestion
    statusCallback({ status: 'downloaded', version: '9.9.9' })
    await flushPromises()

    // Then: no dialog
    expect(updaterState?.dialogState.value).toBeNull()
  })

  it('surfaces download-error with the message for an error broadcast while downloading', async () => {
    // Given: a user-initiated download is in flight
    mountUpdater()
    await flushPromises()
    statusCallback({ status: 'available', version: '9.9.9', suggestedAction: 'install' })
    statusCallback({ status: 'downloading', progress: 10 })

    // When: the download throws in main
    statusCallback({ status: 'error', error: 'network gone' })
    await flushPromises()

    // Then: the dialog shows the failure state with the error text
    expect(updaterState?.dialogState.value).toBe('download-error')
    expect(updaterState?.errorMessage.value).toBe('network gone')
  })

  it('stays hidden for an error broadcast while idle (startup-check errors stay invisible)', async () => {
    // Given: mounted with no dialog
    mountUpdater()
    await flushPromises()

    // When: the startup check fails
    statusCallback({ status: 'error', error: 'check failed' })
    await flushPromises()

    // Then: nothing is shown
    expect(updaterState?.dialogState.value).toBeNull()
  })

  it('hides the dialog on an error broadcast while the offer is open (today’s invisible behavior)', async () => {
    // Given: the offer dialog is open
    mountUpdater()
    await flushPromises()
    statusCallback({ status: 'available', version: '9.9.9', suggestedAction: 'install' })
    expect(updaterState?.dialogState.value).toBe('offer')

    // When: an error broadcast arrives while not downloading
    statusCallback({ status: 'error', error: 'boom' })
    await flushPromises()

    // Then: the dialog goes invisible
    expect(updaterState?.dialogState.value).toBeNull()
  })

  it('keeps the dialog null for every event kind after dismiss (session dismissal is absolute)', async () => {
    // Given: the offer dialog is open
    mountUpdater()
    await flushPromises()
    statusCallback({ status: 'available', version: '9.9.9', suggestedAction: 'install' })
    expect(updaterState?.dialogState.value).toBe('offer')

    // When: the user dismisses for this session (✕ / Escape / outside click / Later)
    updaterState?.dismiss()

    // Then: the dialog hides and NO subsequent broadcast re-opens it
    expect(updaterState?.dialogState.value).toBeNull()
    statusCallback({ status: 'available', version: '9.9.9', suggestedAction: 'install' })
    expect(updaterState?.dialogState.value).toBeNull()
    statusCallback({ status: 'downloading', progress: 10 })
    expect(updaterState?.dialogState.value).toBeNull()
    statusCallback({ status: 'downloaded', version: '9.9.9', suggestedAction: 'restart' })
    expect(updaterState?.dialogState.value).toBeNull()
    statusCallback({ status: 'error', error: 'late failure' })
    expect(updaterState?.dialogState.value).toBeNull()
  })

  it('does not let a progress broadcast re-open the dialog after dismissing during a download', async () => {
    // Given: a user-initiated download is in flight
    mountUpdater()
    await flushPromises()
    statusCallback({ status: 'available', version: '9.9.9', suggestedAction: 'install' })
    statusCallback({ status: 'downloading', progress: 10 })
    expect(updaterState?.dialogState.value).toBe('downloading')

    // When: the user presses Escape mid-download, then progress keeps arriving
    updaterState?.dismiss()
    statusCallback({ status: 'downloading', progress: 50 })
    await flushPromises()

    // Then: the dialog stays closed (the round-1 review bug stays locked out)
    expect(updaterState?.dialogState.value).toBeNull()
  })
})

describe('useUpdater composable: operations', () => {
  beforeEach(() => {
    statusCallback = () => {}
    snapshot = makeSnapshot()
    downloadResponse = { success: true }
    skipResponse = { success: true }
    useDeferredDownload = false
    resolveDownload = null
    updaterState = undefined
    window.api = {
      updater: {
        getUpdateState: vi.fn(async () => snapshot),
        installUpdate: vi.fn(async () => ({ success: true })),
        openReleasesPage: vi.fn(async (_version?: string) => ({ success: true })),
        downloadUpdate: vi.fn(async () => {
          if (useDeferredDownload) {
            return new Promise<UpdaterActionResponse>((resolve) => {
              resolveDownload = resolve
            })
          }
          return downloadResponse
        }),
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

  it('dismisses the session and clears the dialog after a successful skipVersion', async () => {
    // Given: the offer dialog is open
    mountUpdater()
    await flushPromises()
    statusCallback({ status: 'available', version: '9.9.9', suggestedAction: 'install' })
    skipResponse = { success: true }

    // When: the user skips this version and main confirms
    await updaterState?.skipVersion()

    // Then: the dialog closes and even a fresh offer broadcast stays hidden
    expect(window.api.updater.skipVersion).toHaveBeenCalledTimes(1)
    expect(updaterState?.dialogState.value).toBeNull()
    statusCallback({ status: 'available', version: '9.9.9', suggestedAction: 'install' })
    expect(updaterState?.dialogState.value).toBeNull()
  })

  it('keeps the offer dialog open when skipVersion fails', async () => {
    // Given: the offer dialog is open
    mountUpdater()
    await flushPromises()
    statusCallback({ status: 'available', version: '9.9.9', suggestedAction: 'install' })
    skipResponse = { success: false, error: 'No update available to skip' }

    // When: main rejects the skip
    await updaterState?.skipVersion()

    // Then: the dialog stays on offer
    expect(updaterState?.dialogState.value).toBe('offer')
  })

  it('optimistically enters downloading (progress 0), calls downloadUpdate, and stays on success', async () => {
    // Given: the offer dialog is open and the response is deferred
    mountUpdater()
    await flushPromises()
    statusCallback({ status: 'available', version: '9.9.9', suggestedAction: 'install' })
    useDeferredDownload = true
    downloadResponse = { success: true }

    // When: the user consents to the download
    const pending = updaterState?.download()
    await flushPromises()

    // Then: the dialog is downloading at 0% while the request is in flight
    expect(window.api.updater.downloadUpdate).toHaveBeenCalledTimes(1)
    expect(updaterState?.dialogState.value).toBe('downloading')
    expect(updaterState?.progress.value).toBe(0)

    // When: main resolves success (the 'downloaded' broadcast drives the next state)
    resolveDownload?.({ success: true })
    await pending

    // Then: still downloading until the broadcast lands
    expect(updaterState?.dialogState.value).toBe('downloading')
  })

  it('lands in download-error with the response message when the download guard fails without broadcasting', async () => {
    // Given: the offer dialog is open and main fails the request silently
    mountUpdater()
    await flushPromises()
    statusCallback({ status: 'available', version: '9.9.9', suggestedAction: 'install' })
    downloadResponse = { success: false, error: 'No update available to download' }

    // When: the download response comes back failed (no broadcast involved)
    await updaterState?.download()

    // Then: the dialog shows the failure state with the response message —
    // an unchecked response would strand the dialog at 0% forever
    expect(updaterState?.dialogState.value).toBe('download-error')
    expect(updaterState?.errorMessage.value).toBe('No update available to download')
  })

  it('retries the download from the error state and inherits the response check', async () => {
    // Given: a previous download attempt failed
    mountUpdater()
    await flushPromises()
    statusCallback({ status: 'available', version: '9.9.9', suggestedAction: 'install' })
    downloadResponse = { success: false, error: 'flaky network' }
    await updaterState?.download()
    expect(updaterState?.dialogState.value).toBe('download-error')

    // When: the user clicks Try again and the retry succeeds
    downloadResponse = { success: true }
    await updaterState?.retryDownload()

    // Then: the download re-runs and the dialog is downloading again
    expect(window.api.updater.downloadUpdate).toHaveBeenCalledTimes(2)
    expect(updaterState?.dialogState.value).toBe('downloading')
  })

  it('returns from download-error to the offer state via backToOffer', async () => {
    // Given: the dialog is in the download-error state
    mountUpdater()
    await flushPromises()
    statusCallback({ status: 'available', version: '9.9.9', suggestedAction: 'install' })
    downloadResponse = { success: false, error: 'flaky network' }
    await updaterState?.download()
    expect(updaterState?.dialogState.value).toBe('download-error')

    // When: the user clicks Back (no event re-emits 'available')
    updaterState?.backToOffer()

    // Then: the dialog returns to the offer state
    expect(updaterState?.dialogState.value).toBe('offer')
  })

  it('ignores backToOffer outside the download-error state', async () => {
    // Given: the dialog cycles through offer and downloaded states
    mountUpdater()
    await flushPromises()
    statusCallback({ status: 'available', version: '9.9.9', suggestedAction: 'install' })

    // When: Back is invoked while offering
    updaterState?.backToOffer()

    // Then: no transition (offer is not download-error)
    expect(updaterState?.dialogState.value).toBe('offer')

    // When: the update downloads and Back is invoked in the downloaded state
    statusCallback({ status: 'downloaded', version: '9.9.9', suggestedAction: 'restart' })
    updaterState?.backToOffer()

    // Then: still downloaded
    expect(updaterState?.dialogState.value).toBe('downloaded')
  })

  it('opens the changelog for the OFFERED version, never the installed currentVersion', async () => {
    // Given: version 9.9.9 is offered while the installed app is 1.0.0
    mountUpdater()
    await flushPromises()
    statusCallback({ status: 'available', version: '9.9.9', suggestedAction: 'install' })
    expect(updaterState?.currentVersion.value).toBe('1.0.0')

    // When: the user clicks View changelog
    await updaterState?.openChangelog()

    // Then: the offered version's release page is requested
    expect(window.api.updater.openReleasesPage).toHaveBeenCalledTimes(1)
    expect(window.api.updater.openReleasesPage).toHaveBeenCalledWith('9.9.9')
  })

  it('openPage passes no version so main opens the plain releases URL (darwin flow)', async () => {
    // Given: the offer dialog is open via the darwin suggestion
    mountUpdater()
    await flushPromises()
    statusCallback({ status: 'available', version: '9.9.9', suggestedAction: 'open-page' })

    // When: the user clicks Get update
    await updaterState?.openPage()

    // Then: the releases page is opened without a version argument
    expect(window.api.updater.openReleasesPage).toHaveBeenCalledWith()
  })

  it('dispatches installUpdate from the downloaded state', async () => {
    // Given: a downloaded update is awaiting restart
    mountUpdater()
    await flushPromises()
    statusCallback({ status: 'downloaded', version: '9.9.9', suggestedAction: 'restart' })

    // When: the user clicks Restart now
    await updaterState?.install()

    // Then: the install action is dispatched
    expect(window.api.updater.installUpdate).toHaveBeenCalledTimes(1)
  })
})

describe('useUpdater composable: startup snapshot and lifecycle', () => {
  beforeEach(() => {
    statusCallback = () => {}
    snapshot = makeSnapshot()
    downloadResponse = { success: true }
    skipResponse = { success: true }
    useDeferredDownload = false
    resolveDownload = null
    updaterState = undefined
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

  it('folds a downloaded snapshot into the downloaded state and exposes currentVersion', async () => {
    // Given: startup reports a downloaded update awaiting restart
    snapshot = makeSnapshot({
      status: { status: 'downloaded', version: '9.9.9', suggestedAction: 'restart' },
    })

    // When: the composable mounts and folds in the snapshot
    mountUpdater()
    await flushPromises()

    // Then: the dialog is in the downloaded state with the installed version
    expect(updaterState?.dialogState.value).toBe('downloaded')
    expect(updaterState?.currentVersion.value).toBe('1.0.0')
  })

  it('folds an available snapshot with the install suggestion into the offer state', async () => {
    // Given: startup reports an offered update
    snapshot = makeSnapshot({
      status: { status: 'available', version: '9.9.9', suggestedAction: 'install' },
    })

    // When: the composable mounts and folds in the snapshot
    mountUpdater()
    await flushPromises()

    // Then: the offer dialog is shown
    expect(updaterState?.dialogState.value).toBe('offer')
  })

  it('renders nothing for an unsupported platform snapshot (web shim, dev mode)', async () => {
    // Given: the platform does not support auto-updates
    snapshot = makeSnapshot({ supported: false })

    // When: the composable mounts
    mountUpdater()
    await flushPromises()

    // Then: no dialog and no status activity
    expect(updaterState?.dialogState.value).toBeNull()
    expect(updaterState?.status.value).toBe('idle')
  })

  it('ignores the snapshot when a fresher broadcast already arrived (subscribe-before-snapshot guard)', async () => {
    // Given: the snapshot (once it resolves) reports a downloaded update
    snapshot = makeSnapshot({
      status: { status: 'downloaded', version: '9.9.9', suggestedAction: 'restart' },
    })

    // When: a broadcast lands before the snapshot resolves
    const wrapper = mountUpdater()
    statusCallback({ status: 'available', version: '8.8.8', suggestedAction: 'install' })
    await flushPromises()

    // Then: the broadcast wins and the late snapshot does not clobber it
    expect(updaterState?.dialogState.value).toBe('offer')
    expect(updaterState?.status.value).toBe('available')
    expect(updaterState?.version.value).toBe('8.8.8')

    // When: the host unmounts
    wrapper.unmount()

    // Then: the status listener is torn down
    expect(window.api.updater.removeUpdaterStatusListener).toHaveBeenCalledTimes(1)
  })

  it('renders nothing and binds no listener when window.api is unavailable', async () => {
    // Given: the preload API bridge is absent
    window.api = undefined as unknown as typeof window.api

    // When: the composable mounts
    mountUpdater()
    await flushPromises()

    // Then: it neither throws nor opens a dialog
    expect(updaterState?.dialogState.value).toBeNull()
  })
})
