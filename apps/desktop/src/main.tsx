import './app.css'

import { mountReactApplication } from './bootstrap/react-root'

function getApplicationRoot(): HTMLElement {
  const root = document.getElementById('root')
  if (!root) {
    throw new Error('Application root element "#root" was not found.')
  }
  return root
}

void mountReactApplication(getApplicationRoot()).catch((error: unknown) => {
  const root = getApplicationRoot()
  const message = error instanceof Error ? error.message : String(error)
  root.innerHTML = `<main class="bootstrap-error"><h1>应用启动失败</h1><p>${escapeHtml(message)}</p><button type="button" onclick="window.location.reload()">重新加载</button></main>`
  console.error('Application bootstrap failed.', error)
})

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => HTML_ENTITIES[character] ?? character)
}

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;',
}
