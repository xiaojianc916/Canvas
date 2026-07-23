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

  it('ignores additional requests after native termination begins', () => {
    const terminate = vi.fn()

    const coordinator = createApplicationTerminationCoordinator(
      {
        planApplicationClose: () => ({ kind: 'close-now' }),
      },
      { terminate },
    )

    coordinator.request('window-close')
    coordinator.request('application-exit')

    expect(terminate).toHaveBeenCalledTimes(1)
    expect(terminate).toHaveBeenCalledWith('window-close')
    expect(coordinator.getSnapshot()).toEqual({
      state: 'terminating',
      intent: 'window-close',
    })
  })

  it('waits for all lifecycle settlement before re-evaluating termination', async () => {
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

    expect(terminate).not.toHaveBeenCalled()

    resolveSettlement()
    await settlement
    await Promise.resolve()

    expect(planApplicationClose).toHaveBeenCalledTimes(2)
    expect(terminate).toHaveBeenCalledWith('window-close')
  })

  it('does not cancel after native termination begins', () => {
    const terminate = vi.fn()

    const coordinator = createApplicationTerminationCoordinator(
      {
        planApplicationClose: () => ({ kind: 'close-now' }),
      },
      { terminate },
    )

    coordinator.request('window-close')
    coordinator.cancel()

    expect(terminate).toHaveBeenCalledTimes(1)
    expect(coordinator.getSnapshot()).toEqual({
      state: 'terminating',
      intent: 'window-close',
    })
  })
})
