#!/usr/bin/env node
/* biome-ignore-all lint/suspicious/noConsole: architecture checks intentionally write output. */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const failures = []

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

const capability = JSON.parse(
  read('apps/desktop/src-tauri/capabilities/main-window.json'),
)

for (const permission of [
  'core:window:allow-minimize',
  'core:window:allow-toggle-maximize',
  'core:window:allow-start-dragging',
]) {
  if (!capability.permissions?.includes(permission)) {
    failures.push(`main window 缺少权限：${permission}`)
  }
}

const adapter = read(
  'platforms/desktop-runtime/src/adapters/native-window.ts',
)

for (const officialCall of [
  'window.minimize()',
  'window.toggleMaximize()',
  'window.startDragging()',
]) {
  if (!adapter.includes(officialCall)) {
    failures.push(`窗口适配器缺少官方调用：${officialCall}`)
  }
}

for (const obsoleteInvoke of [
  "invoke('window_minimize'",
  "invoke('window_maximize'",
  "invoke('window_start_dragging'",
]) {
  if (adapter.includes(obsoleteInvoke)) {
    failures.push(`窗口适配器仍使用旧 IPC：${obsoleteInvoke}`)
  }
}

const titleBar = read(
  'apps/desktop/src/presentation/chrome/DesktopTitleBar.tsx',
)

if (!titleBar.includes('onMouseDownCapture={handleDragMouseDown}')) {
  failures.push('DesktopTitleBar 必须在捕获阶段处理拖动')
}

if (!titleBar.includes('WINDOW_DRAG_EXCLUSION_SELECTOR')) {
  failures.push('DesktopTitleBar 缺少交互元素排除规则')
}

if (titleBar.includes('data-tauri-drag-region')) {
  failures.push(
    'DesktopTitleBar 禁止同时混用 data-tauri-drag-region 与手动拖动',
  )
}

const bootstrap = read(
  'apps/desktop/src-tauri/src/bootstrap/app.rs',
)

for (const obsoleteCommand of [
  'window_start_dragging',
  'window_minimize',
  'window_maximize',
]) {
  if (bootstrap.includes(`commands::window::${obsoleteCommand}`)) {
    failures.push(`Rust bootstrap 仍注册旧命令：${obsoleteCommand}`)
  }
}

if (failures.length > 0) {
  console.error(
    [
      'Window dragging architecture checks failed:',
      ...failures.map((failure) => `- ${failure}`),
    ].join('\n'),
  )

  process.exitCode = 1
} else {
  console.log('Window dragging architecture checks passed.')
}
