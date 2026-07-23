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
