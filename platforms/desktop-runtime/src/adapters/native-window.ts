import { invoke } from '@hybrid-canvas/desktop-ipc'

export interface MainWindowController {
  minimize(): Promise<void>
  toggleMaximize(): Promise<void>
  close(): Promise<void>
  startDragging(): Promise<void>
  setTitle(title: string): Promise<void>
  saveState(): Promise<void>
}

const MAIN_WINDOW_LABEL = 'main'

export function createMainWindowController(): MainWindowController {
  return {
    minimize: () => invoke('window_minimize', { label: MAIN_WINDOW_LABEL }),
    toggleMaximize: () => invoke('window_maximize', { label: MAIN_WINDOW_LABEL }),
    close: () => invoke('window_close', { label: MAIN_WINDOW_LABEL }),
    startDragging: () => invoke('window_start_dragging', { label: MAIN_WINDOW_LABEL }),
    setTitle: (title) => invoke('window_set_title', { label: MAIN_WINDOW_LABEL, title }),
    saveState: () => invoke('window_save_state'),
  }
}
