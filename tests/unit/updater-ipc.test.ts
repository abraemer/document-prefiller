/**
 * Unit tests for Updater IPC Handlers (updater.ts)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { IPC_CHANNELS } from '../../src/shared/types/ipc'
import { registerUpdaterHandlers } from '../../src/main/ipc/updater'

// vi.mock factories are cached across vi.resetModules(), so per-case values
// must NEVER live inside the factories — mutate the hoisted objects instead.
const electronMock = vi.hoisted(() => ({
  ipcMain: { handle: vi.fn() },
}))

vi.mock('electron', () => electronMock)

const serviceMock = vi.hoisted(() => ({
  getUpdateState: vi.fn(),
  installUpdate: vi.fn(),
  openReleasesPage: vi.fn(),
}))

vi.mock('../../src/main/services/updater', () => serviceMock)

const stateSnapshot = {
  supported: true,
  status: { status: 'idle' },
  currentVersion: '1.2.3',
} as const

/** Map of channel -> captured handler callback registered by the unit under test */
function capturedHandlers(): Map<string, (event: unknown) => unknown> {
  return new Map(
    electronMock.ipcMain.handle.mock.calls.map((call) => [call[0] as string, call[1]])
  )
}

describe('Updater IPC Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serviceMock.getUpdateState.mockReset()
    serviceMock.installUpdate.mockReset()
    serviceMock.openReleasesPage.mockReset()
  })

  it('registers exactly three handlers on the updater channels', () => {
    // When: handlers are registered
    registerUpdaterHandlers()

    // Then: one handler each for get-state, install, and open-releases
    expect(electronMock.ipcMain.handle).toHaveBeenCalledTimes(3)
    expect(electronMock.ipcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.UPDATER_GET_STATE, expect.any(Function))
    expect(electronMock.ipcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.UPDATER_INSTALL, expect.any(Function))
    expect(electronMock.ipcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.UPDATER_OPEN_RELEASES, expect.any(Function))
    expect(capturedHandlers().has(IPC_CHANNELS.UPDATER_STATUS)).toBe(false)
  })

  it('forwards the get-state handler to the service snapshot', async () => {
    // Given: the service returns a supported idle snapshot
    registerUpdaterHandlers()
    serviceMock.getUpdateState.mockReturnValue(stateSnapshot)
    const handler = capturedHandlers().get(IPC_CHANNELS.UPDATER_GET_STATE)

    // When: the handler is invoked
    const result = await handler?.(null)

    // Then: the service value is passed through untouched
    expect(result).toEqual(stateSnapshot)
    expect(serviceMock.getUpdateState).toHaveBeenCalledOnce()
  })

  it('forwards the install handler to the service', async () => {
    // Given: the service reports a successful install dispatch
    registerUpdaterHandlers()
    serviceMock.installUpdate.mockReturnValue({ success: true })
    const handler = capturedHandlers().get(IPC_CHANNELS.UPDATER_INSTALL)

    // When: the handler is invoked
    const result = await handler?.(null)

    // Then: the service value is passed through untouched
    expect(result).toEqual({ success: true })
    expect(serviceMock.installUpdate).toHaveBeenCalledOnce()
  })

  it('forwards the open-releases handler to the service', async () => {
    // Given: the service reports a successful dispatch
    registerUpdaterHandlers()
    serviceMock.openReleasesPage.mockReturnValue({ success: true })
    const handler = capturedHandlers().get(IPC_CHANNELS.UPDATER_OPEN_RELEASES)

    // When: the handler is invoked
    const result = await handler?.(null)

    // Then: the service value is passed through untouched
    expect(result).toEqual({ success: true })
    expect(serviceMock.openReleasesPage).toHaveBeenCalledOnce()
  })

  it('degrades a throwing get-state service to the error state snapshot shape', async () => {
    // Given: the service snapshot call throws
    registerUpdaterHandlers()
    serviceMock.getUpdateState.mockImplementation(() => {
      throw new Error('state exploded')
    })
    const handler = capturedHandlers().get(IPC_CHANNELS.UPDATER_GET_STATE)

    // When: the handler is invoked
    const result = await handler?.(null)

    // Then: the response keeps the channel's own declared shape
    expect(result).toEqual({
      supported: false,
      status: { status: 'error', error: 'state exploded' },
      currentVersion: '',
    })
  })

  it('degrades a throwing install service to the failed action response shape', async () => {
    // Given: the service install call throws
    registerUpdaterHandlers()
    serviceMock.installUpdate.mockImplementation(() => {
      throw new Error('install exploded')
    })
    const handler = capturedHandlers().get(IPC_CHANNELS.UPDATER_INSTALL)

    // When: the handler is invoked
    const result = await handler?.(null)

    // Then: the response keeps the channel's own declared shape
    expect(result).toEqual({ success: false, error: 'install exploded' })
  })

  it('degrades a throwing open-releases service to the failed action response shape', async () => {
    // Given: the service open-releases call throws
    registerUpdaterHandlers()
    serviceMock.openReleasesPage.mockImplementation(() => {
      throw new Error('releases exploded')
    })
    const handler = capturedHandlers().get(IPC_CHANNELS.UPDATER_OPEN_RELEASES)

    // When: the handler is invoked
    const result = await handler?.(null)

    // Then: the response keeps the channel's own declared shape
    expect(result).toEqual({ success: false, error: 'releases exploded' })
  })
})
