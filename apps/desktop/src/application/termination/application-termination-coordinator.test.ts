import { describe, expect, it, vi } from 'vitest'

import {
  createApplicationTerminationCoordinator,
  type ApplicationTerminationSnapshot,
} from './application-termination-coordinator'

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve))
}

describe('ApplicationTerminationCoordinator', () => {
  it('enters a recoverable failure state when native termination fails', async () => {
    const terminate = vi.fn().mockRejectedValue(new Error('NATIVE_CLOSE_FAILED'))

    const coordinator = createApplicationTerminationCoordinator(
      {
        planApplicationClose: () => ({ kind: 'close-now' }),
        discardAllAndClose: vi.fn(),
      },
      { terminate },
    )

    coordinator.request('window-close')
    await flushMicrotasks()

    expect(coordinator.getSnapshot()).toEqual({
      state: 'termination-failed',
      intent: 'window-close',
      message: 'NATIVE_CLOSE_FAILED',
    })
  })

  it('retries the original termination intent', async () => {
    const terminate = vi
      .fn()
      .mockRejectedValueOnce(new Error('FIRST_FAILURE'))
      .mockResolvedValueOnce(undefined)

    const snapshots: ApplicationTerminationSnapshot[] = []

    const coordinator = createApplicationTerminationCoordinator(
      {
        planApplicationClose: () => ({ kind: 'close-now' }),
        discardAllAndClose: vi.fn(),
      },
      { terminate },
    )

    coordinator.subscribe(() => {
      snapshots.push(coordinator.getSnapshot())
    })

    coordinator.request('update-restart')
    await flushMicrotasks()

    expect(coordinator.getSnapshot().state).toBe('termination-failed')

    coordinator.retry()
    await flushMicrotasks()

    expect(terminate).toHaveBeenNthCalledWith(1, 'update-restart')
    expect(terminate).toHaveBeenNthCalledWith(2, 'update-restart')
    expect(
      snapshots.some(
        (snapshot) => snapshot.state === 'terminating' && snapshot.intent === 'update-restart',
      ),
    ).toBe(true)
  })

  it('ignores a stale failure after cancellation', async () => {
    let rejectTermination: ((reason?: unknown) => void) | undefined

    const terminate = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectTermination = reject
        }),
    )

    const coordinator = createApplicationTerminationCoordinator(
      {
        planApplicationClose: () => ({ kind: 'close-now' }),
        discardAllAndClose: vi.fn(),
      },
      { terminate },
    )

    coordinator.request('window-close')
    coordinator.cancel()
    rejectTermination?.(new Error('STALE_FAILURE'))
    await flushMicrotasks()

    expect(coordinator.getSnapshot()).toEqual({
      state: 'idle',
    })
  })
})
