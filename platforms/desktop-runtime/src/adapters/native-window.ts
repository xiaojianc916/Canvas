import { invoke } from '@hybrid-canvas/desktop-ipc'

export interface NativeWindow {
  minimize(): Promise<void>
  maximize(): Promise<void>
  close(): Promise<void>
}

export function createNativeWindow(): NativeWindow {
  return {
    minimize: () => invoke('window_minimize'),
    maximize: () => invoke('window_maximize'),
    close: () => invoke('window_close'),
  }
}
