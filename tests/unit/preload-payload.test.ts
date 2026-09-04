import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Preload payload contract for folder.scanFolder.
 *
 * The preload module is imported for its side effect (it registers the API via
 * contextBridge.exposeInMainWorld at module top level). The electron module is
 * mocked so the exposed API object and ipcRenderer.invoke are captured, letting
 * us assert the exact IPC payload the renderer side of the bridge produces.
 */
const { exposeInMainWorld, invoke } = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(async (_channel: string, _payload?: unknown) => ({ documents: [] })),
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke },
}))

import '@/preload/index'

type ExposedFolderApi = {
  folder: {
    scanFolder: (folderPath: string, prefix?: string) => Promise<unknown>
  }
}

function getExposedApi(): ExposedFolderApi {
  const call = exposeInMainWorld.mock.calls.find((candidate) => candidate[0] === 'api')
  if (!call) {
    throw new Error('preload module did not expose an "api" object via contextBridge')
  }
  return call[1] as ExposedFolderApi
}

describe('preload scanFolder payload contract', () => {
  beforeEach(() => {
    invoke.mockClear()
  })

  it('forwards folderPath and prefix into the folder:scan invoke payload', async () => {
    // Given: the preload-exposed api
    const api = getExposedApi()

    // When: the renderer scans a folder with an explicit prefix
    await api.folder.scanFolder('x', 'P')

    // Then: the invoke payload carries both fields
    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith('folder:scan', { folderPath: 'x', prefix: 'P' })
  })

  it('leaves the prefix payload field undefined when no prefix is supplied', async () => {
    // Given: the preload-exposed api
    const api = getExposedApi()

    // When: the renderer scans a folder without a prefix
    await api.folder.scanFolder('x')

    // Then: the payload's prefix is undefined so the unchanged main handler
    // falls back to DEFAULT_PREFIX (src/main/ipc/folder.ts:28)
    expect(invoke).toHaveBeenCalledTimes(1)
    const [, payload] = invoke.mock.calls[0]
    expect((payload as { prefix?: string }).prefix).toBeUndefined()
    expect(invoke).toHaveBeenCalledWith('folder:scan', { folderPath: 'x' })
  })
})
