#!/usr/bin/env node
/* biome-ignore-all lint/suspicious/noConsole: CLI architecture checks intentionally write output. */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()

const WINDOW_SURFACE = Object.freeze({
  color: '#f3f3f3',
  cssToken: '--window-backing-surface',
  mainWindowLabel: 'main',
})

const PATHS = Object.freeze({
  tauriConfig: 'apps/desktop/src-tauri/tauri.conf.json',
  htmlEntry: 'apps/desktop/index.html',
  applicationStyles: 'apps/desktop/src/app.css',
})

const failures = []

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath)

  if (!fs.existsSync(absolutePath)) {
    failures.push(`缺少窗口表面契约文件：${relativePath}`)
    return ''
  }

  return fs.readFileSync(absolutePath, 'utf8')
}

function normalize(value) {
  return value.trim().toLowerCase()
}

function checkTauriWindowSurface() {
  const source = read(PATHS.tauriConfig)

  if (!source) {
    return
  }

  let config

  try {
    config = JSON.parse(source)
  } catch (cause) {
    failures.push(
      `Tauri 配置不是合法 JSON：${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    )
    return
  }

  const windows = config.app?.windows

  if (!Array.isArray(windows)) {
    failures.push('Tauri 配置缺少 app.windows')
    return
  }

  const mainWindows = windows.filter(
    (windowConfig) =>
      windowConfig?.label === WINDOW_SURFACE.mainWindowLabel,
  )

  if (mainWindows.length !== 1) {
    failures.push(
      `必须且只能存在一个 label="${WINDOW_SURFACE.mainWindowLabel}" 的主窗口`,
    )
    return
  }

  const [mainWindow] = mainWindows

  if (mainWindow.transparent !== false) {
    failures.push(
      '主窗口必须显式配置 transparent: false；禁止依赖默认值或透明合成',
    )
  }

  if (
    normalize(String(mainWindow.backgroundColor ?? '')) !==
    WINDOW_SURFACE.color
  ) {
    failures.push(
      `主窗口 backgroundColor 必须为 ${WINDOW_SURFACE.color}`,
    )
  }

  if (mainWindow.resizable !== true) {
    failures.push('主窗口必须保持 resizable: true')
  }
}

function checkHtmlBootstrapSurface() {
  const source = read(PATHS.htmlEntry)
  const normalized = source.toLowerCase()

  if (
    !normalized.includes(
      `content="${WINDOW_SURFACE.color}" name="theme-color"`,
    )
  ) {
    failures.push(
      `HTML theme-color 必须为 ${WINDOW_SURFACE.color}`,
    )
  }

  if (!source.includes('id="window-backing-surface"')) {
    failures.push('HTML 缺少首帧 window-backing-surface 样式')
  }

  if (
    !normalized.includes(
      `${WINDOW_SURFACE.cssToken}: ${WINDOW_SURFACE.color}`,
    )
  ) {
    failures.push(
      `HTML 首帧必须声明 ${WINDOW_SURFACE.cssToken}: ${WINDOW_SURFACE.color}`,
    )
  }

  if (
    !normalized.includes(
      `background: var(${WINDOW_SURFACE.cssToken})`,
    )
  ) {
    failures.push('HTML 首帧根节点没有使用窗口 backing surface token')
  }

  const styleIndex = normalized.indexOf(
    'id="window-backing-surface"',
  )
  const applicationScriptIndex = normalized.indexOf(
    'src="/src/main.tsx"',
  )

  if (
    styleIndex < 0 ||
    applicationScriptIndex < 0 ||
    styleIndex > applicationScriptIndex
  ) {
    failures.push('窗口 backing surface 必须在应用脚本执行前声明')
  }
}

function checkApplicationSurface() {
  const source = read(PATHS.applicationStyles)
  const normalized = source.toLowerCase()

  if (
    !normalized.includes(
      `${WINDOW_SURFACE.cssToken}: ${WINDOW_SURFACE.color}`,
    )
  ) {
    failures.push(
      `应用 CSS 必须声明 ${WINDOW_SURFACE.cssToken}: ${WINDOW_SURFACE.color}`,
    )
  }

  if (
    !normalized.includes(
      `background: var(${WINDOW_SURFACE.cssToken})`,
    )
  ) {
    failures.push('应用根节点必须使用窗口 backing surface token')
  }

  const rootSurfacePattern =
    /html\s*,\s*body\s*,\s*#root\s*\{[\s\S]*?background:\s*var\(--window-backing-surface\)/i

  if (!rootSurfacePattern.test(source)) {
    failures.push(
      'html、body、#root 必须共同使用 --window-backing-surface',
    )
  }
}

checkTauriWindowSurface()
checkHtmlBootstrapSurface()
checkApplicationSurface()

if (failures.length > 0) {
  console.error(
    [
      'Window surface architecture checks failed:',
      ...failures.map((failure) => `- ${failure}`),
    ].join('\n'),
  )

  process.exitCode = 1
} else {
  console.log('Window surface architecture checks passed.')
}
