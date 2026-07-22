import {
  useSyncExternalStore,
} from 'react'

export type WorkspaceLayoutMode =
  | 'wide'
  | 'compact'
  | 'narrow'

function getSnapshot(): WorkspaceLayoutMode {
  if (window.innerWidth >= 1280) {
    return 'wide'
  }

  if (window.innerWidth >= 900) {
    return 'compact'
  }

  return 'narrow'
}

function getServerSnapshot(): WorkspaceLayoutMode {
  return 'wide'
}

function subscribe(
  listener: () => void,
): () => void {
  window.addEventListener(
    'resize',
    listener,
    {
      passive: true,
    },
  )

  return () => {
    window.removeEventListener(
      'resize',
      listener,
    )
  }
}

export function useWorkspaceLayoutMode():
  WorkspaceLayoutMode {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  )
}
