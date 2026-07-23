import { describe, expect, it, vi } from 'vitest'

import { createApplicationTerminationCoordinator } from './application-termination-coordinator'

describe('ApplicationTerminationCoordinator', () => {
  it('dispatches the requested native termination intent', () => {
    const terminate = vi.fn()

    const coordinator = createApplicationTerminationCoordinator(
      {
        planApplicationClose: () => ({ kind: 'close-now' }),
      },
      { terminate },
    )

    coordinator.request('update-restart')

    expect(terminate).toHaveBeenCalledTimes(1)
    expect(terminate).toHaveBeenCalledWith('update-restart')
    expect(coordinator.getSnapshot()).toEqual({
      state: 'terminating',
      intent: 'update-restart',
    })
  })

  it('waits for settlement and then recalculates the close plan', async () => {
    let resolveSettlement!: () => void

    const settlement = new Promise<void>((resolve) => {
      resolveSettlement = resolve
    })

    const terminate = vi.fn()

    const planApplicationClose = vi
      .fn()
      .mockReturnValueOnce({
        kind: 'wait-for-settlement' as const,
        operations: [settlement],
      })
      .mockReturnValueOnce({
        kind: 'close-now' as const,
      })

    const coordinator = createApplicationTerminationCoordinator(
      { planApplicationClose },
      { terminate },
    )

    coordinator.request('window-close')

    expect(coordinator.getSnapshot()).toEqual({
      state: 'waiting-for-settlement',
      intent: 'window-close',
    })

    resolveSettlement()
    await settlement
    await Promise.resolve()

    expect(planApplicationClose).toHaveBeenCalledTimes(2)
    expect(terminate).toHaveBeenCalledTimes(1)
    expect(terminate).toHaveBeenCalledWith('window-close')
  })

  it('does not terminate after cancellation when an old settlement resolves', async () => {
    let resolveSettlement!: () => void

    const settlement = new Promise<void>((resolve) => {
      resolveSettlement = resolve
    })

    const terminate = vi.fn()

    const planApplicationClose = vi.fn(() => ({
      kind: 'wait-for-settlement' as const,
      operations: [settlement],
    }))

    const coordinator = createApplicationTerminationCoordinator(
      { planApplicationClose },
      { terminate },
    )

    coordinator.request('window-close')
    coordinator.cancel()

    expect(coordinator.getSnapshot()).toEqual({
      state: 'idle',
    })

    resolveSettlement()
    await settlement
    await Promise.resolve()

    expect(planApplicationClose).toHaveBeenCalledTimes(1)
    expect(terminate).not.toHaveBeenCalled()
    expect(coordinator.getSnapshot()).toEqual({
      state: 'idle',
    })
  })

  it('ignores additional requests and cancellation after termination begins', () => {
    const terminate = vi.fn()

    const coordinator = createApplicationTerminationCoordinator(
      {
        planApplicationClose: () => ({ kind: 'close-now' }),
      },
      { terminate },
    )

    coordinator.request('window-close')
    coordinator.request('application-exit')
    coordinator.cancel()

    expect(terminate).toHaveBeenCalledTimes(1)
    expect(terminate).toHaveBeenCalledWith('window-close')
    expect(coordinator.getSnapshot()).toEqual({
      state: 'terminating',
      intent: 'window-close',
    })
  })
})
