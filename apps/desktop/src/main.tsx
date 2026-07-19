import './app.css'

import { mountReactApplication } from './bootstrap/react-root'

function getApplicationRoot(): HTMLElement {
  const root = document.getElementById('root')
  if (!root) {
    throw new Error('Application root element "#root" was not found.')
  }
  return root
}

mountReactApplication(getApplicationRoot())
