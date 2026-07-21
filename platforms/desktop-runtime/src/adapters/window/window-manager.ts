import { invoke } from '@hybrid-canvas/desktop-ipc'

export type ApplicationWindowKind = 'main' | 'settings'

export interface ApplicationWindowDescriptor {
  readonly kind: ApplicationWindowKind
  readonly label: string
  readonly title: string
  readonly width: number
  readonly height: number
  readonly minWidth?: number
  readonly minHeight?: number
  readonly resizable: boolean
  readonly decorations: boolean
}

export interface ApplicationWindowInfo {
  readonly label: string
  readonly title: string
  readonly width: number
  readonly height: number
  readonly x: number
  readonly y: number
  readonly fullscreen: boolean
  readonly resizable: boolean
  readonly minimized: boolean
  readonly maximized: boolean
  readonly visible: boolean
  readonly focused: boolean
}

export interface ApplicationWindowManager {
  readonly currentLabel: string
  open(kind: ApplicationWindowKind): Promise<ApplicationWindowInfo>
  show(label: string): Promise<void>
  focus(label: string): Promise<void>
  minimize(label?: string): Promise<void>
  toggleMaximize(label?: string): Promise<void>
  close(label?: string): Promise<void>
  forceClose(label?: string): Promise<void>
  onCloseRequested(handler: () => void): Promise<() => void>
  setTitle(title: string, label?: string): Promise<void>
  saveState(label?: string): Promise<void>
}

const windows: Record<ApplicationWindowKind, ApplicationWindowDescriptor> = {
  main: {
    kind: 'main',
    label: 'main',
    title: 'Hybrid Canvas',
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    resizable: true,
    decorations: false,
  },
  settings: {
    kind: 'settings',
    label: 'settings',
    title: '设置 — Hybrid Canvas',
    width: 980,
    height: 720,
    minWidth: 720,
    minHeight: 560,
    resizable: true,
    decorations: false,
  },
}

export function createApplicationWindowManager(): ApplicationWindowManager {
  const currentLabel = getCurrentWindowLabel()
  const target = (label?: string) => label ?? currentLabel

  return {
    currentLabel,
    async open(kind) {
      const descriptor = windows[kind]
      const existing = await invoke<ApplicationWindowInfo | null>('window_get', {
        label: descriptor.label,
      })
      if (existing) {
        await invoke('window_show', { label: descriptor.label })
        await invoke('window_focus', { label: descriptor.label })
        return { ...existing, visible: true, focused: true }
      }
      return invoke<ApplicationWindowInfo>('window_create', { options: descriptor })
    },
    show: (label) => invoke('window_show', { label }),
    focus: (label) => invoke('window_focus', { label }),
    minimize: (label) => invoke('window_minimize', { label: target(label) }),
    toggleMaximize: (label) => invoke('window_maximize', { label: target(label) }),
    close: (label) => invoke('window_close', { label: target(label) }),
    async forceClose(label) {
      const { getAllWindows } = await import('@tauri-apps/api/window')
      const window = (await getAllWindows()).find((candidate) => candidate.label === target(label))
      await window?.destroy()
    },
    async onCloseRequested(handler) {
      const { isTauri } = await import('@tauri-apps/api/core')
      if (!isTauri()) return () => {}
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      return getCurrentWindow().onCloseRequested((event) => {
        event.preventDefault()
        handler()
      })
    },
    setTitle: (title, label) => invoke('window_set_title', { label: target(label), title }),
    saveState: (label) => invoke('window_save_state', { label: target(label) }),
  }
}

function getCurrentWindowLabel(): string {
  const internals = globalThis as typeof globalThis & {
    __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } }
  }
  return internals.__TAURI_INTERNALS__?.metadata?.currentWindow?.label ?? 'main'
}
