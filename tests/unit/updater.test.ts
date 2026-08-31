/**
 * Unit tests for the Auto-Update Service (updater.ts)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IPC_CHANNELS } from '../../src/shared/types/ipc';
import { RELEASES_URL } from '../../src/shared/constants';

// vi.mock factories are cached across vi.resetModules(), so per-case values
// must NEVER live inside the factories — mutate the hoisted objects instead.
const electronMock = vi.hoisted(() => {
  // One stable spy: getAllWindows returns the same window object on every
  // call so broadcasts can be asserted across calls.
  const send = vi.fn();
  const windows = [{ webContents: { send } }];
  return {
    app: { isPackaged: false, getVersion: vi.fn(() => '1.0.0') },
    BrowserWindow: { getAllWindows: vi.fn(() => windows) },
    shell: { openExternal: vi.fn() },
    send,
  };
})

vi.mock('electron', () => electronMock)

const { autoUpdaterMock, listeners } = vi.hoisted(() => {
  // listeners lives in the same hoisted scope so the `on` closure can fill it
  const listeners: Record<string, (info?: unknown) => void> = {}
  const autoUpdaterMock = {
    autoDownload: undefined as boolean | undefined,
    autoInstallOnAppQuit: undefined as boolean | undefined,
    checkForUpdates: vi.fn(),
    quitAndInstall: vi.fn(),
    on: vi.fn((event: string, cb: (info?: unknown) => void) => {
      listeners[event] = cb
    }),
  }
  return { autoUpdaterMock, listeners }
})

// The service default-imports electron-updater (CJS getter-export interop),
// so the mock must expose it under `default`.
vi.mock('electron-updater', () => ({ default: { autoUpdater: autoUpdaterMock } }))

function setPlatform(platform: string) {
  Object.defineProperty(process, 'platform', { value: platform })
}

function lastBroadcast() {
  const calls = electronMock.send.mock.calls
  return calls[calls.length - 1]
}

describe('Updater Service', () => {
  let originalPlatform: string
  let originalPortableDir: string | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    for (const key of Object.keys(listeners)) {
      delete listeners[key]
    }
    originalPlatform = process.platform
    originalPortableDir = process.env.PORTABLE_EXECUTABLE_DIR
    delete process.env.PORTABLE_EXECUTABLE_DIR
    electronMock.app.isPackaged = false
    autoUpdaterMock.autoDownload = undefined
    autoUpdaterMock.autoInstallOnAppQuit = undefined
    // checkForUpdates and openExternal have no baseline implementation;
    // reset so a rejection set by an earlier case cannot leak into this one
    autoUpdaterMock.checkForUpdates.mockReset()
    electronMock.shell.openExternal.mockReset()
  })

  afterEach(() => {
    setPlatform(originalPlatform)
    if (originalPortableDir === undefined) {
      delete process.env.PORTABLE_EXECUTABLE_DIR
    } else {
      process.env.PORTABLE_EXECUTABLE_DIR = originalPortableDir
    }
  })

  it('skips the update check entirely in development mode', async () => {
    // Given: unpackaged app (dev mode)
    electronMock.app.isPackaged = false
    const updater = await import('../../src/main/services/updater')

    // When: state is queried and the startup hook runs
    const state = updater.getUpdateState()
    updater.startupCheck()

    // Then: unsupported, idle, and no network check ever fired
    expect(state).toEqual({
      supported: false,
      status: { status: 'idle' },
      currentVersion: '1.0.0',
    })
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
  })

  it('auto-downloads on win32 and broadcasts a downloaded update', async () => {
    // Given: packaged win32 app
    electronMock.app.isPackaged = true
    setPlatform('win32')
    const updater = await import('../../src/main/services/updater')

    // When: initialized, then an update finishes downloading
    updater.initUpdater()
    listeners['update-downloaded']({ version: '9.9.9' })

    // Then: autoDownload on, broadcast carries version + restart action
    expect(autoUpdaterMock.autoDownload).toBe(true)
    expect(lastBroadcast()).toEqual([
      IPC_CHANNELS.UPDATER_STATUS,
      { status: 'downloaded', version: '9.9.9', suggestedAction: 'restart' },
    ])
  })

  it('never auto-downloads on darwin and suggests opening the releases page', async () => {
    // Given: packaged darwin app
    electronMock.app.isPackaged = true
    setPlatform('darwin')
    const updater = await import('../../src/main/services/updater')

    // When: initialized, then an update becomes available
    updater.initUpdater()
    listeners['update-available']({ version: '9.9.9' })

    // Then: autoDownload off, broadcast points at the releases page
    expect(autoUpdaterMock.autoDownload).toBe(false)
    expect(lastBroadcast()).toEqual([
      IPC_CHANNELS.UPDATER_STATUS,
      { status: 'available', version: '9.9.9', suggestedAction: 'open-page' },
    ])
  })

  it('refuses to install unless an update is downloaded', async () => {
    // Given: packaged win32 app, no downloaded update yet
    electronMock.app.isPackaged = true
    setPlatform('win32')
    const updater = await import('../../src/main/services/updater')
    updater.initUpdater()

    // When: install is requested with no downloaded update
    const refused = updater.installUpdate()

    // Then: it fails without touching quitAndInstall
    expect(refused.success).toBe(false)
    expect(refused.error).toBe('No downloaded update to install')
    expect(autoUpdaterMock.quitAndInstall).not.toHaveBeenCalled()

    // When: an update has downloaded
    listeners['update-downloaded']({ version: '9.9.9' })
    const accepted = updater.installUpdate()

    // Then: install is dispatched
    expect(accepted).toEqual({ success: true })
    expect(autoUpdaterMock.quitAndInstall).toHaveBeenCalled()
  })

  it('broadcasts updater errors without throwing', async () => {
    // Given: packaged win32 app
    electronMock.app.isPackaged = true
    setPlatform('win32')
    const updater = await import('../../src/main/services/updater')
    updater.initUpdater()

    // When: the updater emits an error
    expect(() => listeners['error'](new Error('boom'))).not.toThrow()

    // Then: an error status is broadcast
    expect(lastBroadcast()).toEqual([
      IPC_CHANNELS.UPDATER_STATUS,
      { status: 'error', error: 'boom' },
    ])
  })

  it('opens the GitHub releases page on request', async () => {
    // Given: the service (openReleasesPage works in any mode)
    const updater = await import('../../src/main/services/updater')

    // When: the releases page is opened
    const result = await updater.openReleasesPage()

    // Then: the shell is directed at RELEASES_URL
    expect(result).toEqual({ success: true })
    expect(electronMock.shell.openExternal).toHaveBeenCalledWith(RELEASES_URL)
  })

  it('degrades a failing openExternal call to a failed action response', async () => {
    // Given: the shell rejects the openExternal call
    electronMock.shell.openExternal.mockRejectedValue(new Error('no shell'))
    const updater = await import('../../src/main/services/updater')

    // When: the releases page is opened
    const result = await updater.openReleasesPage()

    // Then: the rejection is converted, never thrown
    expect(result).toEqual({ success: false, error: 'no shell' })
    expect(electronMock.shell.openExternal).toHaveBeenCalledWith(RELEASES_URL)
  })

  it('returns a pure state snapshot without network activity', async () => {
    // Given: packaged win32 app with a downloaded update in history
    electronMock.app.isPackaged = true
    setPlatform('win32')
    const updater = await import('../../src/main/services/updater')
    updater.getUpdateState() // attaches listeners
    listeners['update-downloaded']({ version: '9.9.9' })

    // When: state is queried again
    const state = updater.getUpdateState()

    // Then: snapshot reflects the latest event and no check was triggered
    expect(state).toEqual({
      supported: true,
      status: { status: 'downloaded', version: '9.9.9', suggestedAction: 'restart' },
      currentVersion: '1.0.0',
    })
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
  })

  it('skips the update check for portable builds', async () => {
    // Given: packaged app launched from the portable launcher
    electronMock.app.isPackaged = true
    process.env.PORTABLE_EXECUTABLE_DIR = '/tmp/portable-dir'
    const updater = await import('../../src/main/services/updater')

    // When: state is queried
    const state = updater.getUpdateState()

    // Then: unsupported and no network check ever fired
    expect(state.supported).toBe(false)
    expect(state.status).toEqual({ status: 'idle' })
    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled()
  })

  it('degrades a failing startup check to an error broadcast', async () => {
    // Given: packaged win32 app whose update check rejects
    electronMock.app.isPackaged = true
    setPlatform('win32')
    autoUpdaterMock.checkForUpdates.mockRejectedValue(new Error('network down'))
    const updater = await import('../../src/main/services/updater')

    // When: the startup check runs
    updater.startupCheck()

    // Then: the failure is broadcast as an error status, never thrown
    await vi.waitFor(() => {
      expect(lastBroadcast()).toEqual([
        IPC_CHANNELS.UPDATER_STATUS,
        { status: 'error', error: 'network down' },
      ])
    })
  })
})
