import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createWorkbenchSessionController } from './workbench-session-controller'

beforeEach(() => {
  let id = 0
  vi.stubGlobal('crypto', { randomUUID: () => `generated-${++id}` })
})

describe('workbench session controller', () => {
  it('keeps one active canvas while preserving tab order', () => {
    const store = createWorkbenchSessionController()
    store.createCanvas({ canvasId: 'canvas-1', sessionId: 'session-1', title: 'One' })
    store.createCanvas({ canvasId: 'canvas-2', sessionId: 'session-2', title: 'Two' })

    expect(store.getSnapshot()).toMatchObject({
      activeSessionId: 'session-2',
      tabs: [
        { sessionId: 'session-1', isActive: false },
        { sessionId: 'session-2', isActive: true },
      ],
    })

    store.activateCanvas('session-1')
    expect(store.getSnapshot().activeCanvas?.canvasId).toBe('canvas-1')
  })

  it('activates the adjacent tab when the active canvas closes', () => {
    const store = createWorkbenchSessionController()
    for (const id of ['1', '2', '3']) {
      store.createCanvas({ canvasId: `canvas-${id}`, sessionId: `session-${id}`, title: id })
    }
    store.activateCanvas('session-2')
    store.closeCanvas('session-2')

    expect(store.getSnapshot().activeSessionId).toBe('session-3')
    expect(store.getSnapshot().tabs.map((tab) => tab.sessionId)).toEqual(['session-1', 'session-3'])
  })

  it('publishes changes and returns to the canonical empty snapshot', () => {
    const store = createWorkbenchSessionController()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    store.createCanvas({ canvasId: 'canvas-1', sessionId: 'session-1', title: 'One' })
    store.closeCanvas('session-1')
    unsubscribe()

    expect(listener).toHaveBeenCalledTimes(2)
    expect(store.getSnapshot()).toEqual({ activeSessionId: null, tabs: [], activeCanvas: null })
  })
})
