import './app.css'

import { installApplicationLifecycle } from './bootstrap/application-lifecycle'
import { mountReactApplication } from './bootstrap/react-root'

function getApplicationRoot(): HTMLElement {
  const root = document.getElementById('root')
  if (!root) {
    throw new Error('Application root element "#root" was not found.')
  }
  return root
}

const mounted = mountReactApplication(getApplicationRoot())
installApplicationLifecycle(mounted.runtime, mounted)
