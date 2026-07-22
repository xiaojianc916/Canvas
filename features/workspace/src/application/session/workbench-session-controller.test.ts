import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createWorkbenchSessionController } from './workbench-session-controller'

beforeEach(() => {
  let id = 0
  vi.stubGlobal('crypto', {
    randomUUID: () => 'generated-' + String(++id),
  })
})

describe('workbench session controller', () => {
  it('starts with a permanent 新标签页 surface', () => {
    const store = createWorkbenchSessionController()
    const snapshot = store.getSnapshot()

    expect(snapshot.activeSurface).toEqual({
      kind: 'start',
      tabId: 'workbench:start',
    })

    expect(snapshot.tabs).toEqual([
      {
        id: 'workbench:start',
        kind: 'start',
        title: '新标签页',
        isActive: true,
        canClose: false,
      },
    ])
  })

  it('drives canvas and workspace surfaces through one tab model', () => {
    const store = createWorkbenchSessionController()

    store.createCanvas({
      canvasId: 'canvas-1',
      sessionId: 'session-1',
      title: 'One.draw',
    })

    store.openWorkspaceSurface({
      surfaceId: 'assets',
      title: '素材',
    })

    expect(store.getSnapshot().tabs).toMatchObject([
      { id: 'workbench:start', kind: 'start' },
      {
        id: 'canvas:session-1',
        kind: 'canvas',
        sessionId: 'session-1',
      },
      {
        id: 'workspace:assets',
        kind: 'workspace',
        surfaceId: 'assets',
        isActive: true,
      },
    ])
  })

  it('deduplicates singleton workspace surfaces', () => {
    const store = createWorkbenchSessionController()

    store.openWorkspaceSurface({
      surfaceId: 'relations',
      title: '关系',
    })

    store.openWorkspaceSurface({
      surfaceId: 'relations',
      title: '关系',
    })

    expect(store.getSnapshot().tabs.filter((tab) => tab.id === 'workspace:relations')).toHaveLength(
      1,
    )
  })

  it('activates the adjacent tab after closing the active tab', () => {
    const store = createWorkbenchSessionController()

    store.openWorkspaceSurface({
      surfaceId: 'assets',
      title: '素材',
    })

    store.openWorkspaceSurface({
      surfaceId: 'relations',
      title: '关系',
    })

    store.closeTab('workspace:relations')

    expect(store.getSnapshot().activeTabId).toBe('workspace:assets')
  })

  it('does not close the permanent start tab', () => {
    const store = createWorkbenchSessionController()

    store.closeTab('workbench:start')

    expect(store.getSnapshot().tabs).toHaveLength(1)
    expect(store.getSnapshot().activeTabId).toBe('workbench:start')
  })

  it('keeps canvas compatibility commands at the document boundary', () => {
    const store = createWorkbenchSessionController()

    store.createCanvas({
      canvasId: 'canvas-1',
      sessionId: 'session-1',
      title: 'One',
    })

    store.openWorkspaceSurface({
      surfaceId: 'assets',
      title: '素材',
    })

    store.activateCanvas('session-1')

    expect(store.getSnapshot().activeSessionId).toBe('session-1')

    store.closeCanvas('session-1')

    expect(store.getSnapshot().tabs.some((tab) => tab.id === 'canvas:session-1')).toBe(false)
  })
})
