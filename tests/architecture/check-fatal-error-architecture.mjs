#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const failures = []

const requiredFiles = [
  'apps/desktop/src/fatal/fatal-incident.ts',
  'apps/desktop/src/fatal/fatal-controller.ts',
  'apps/desktop/src/fatal/pre-react-entry.ts',
  'apps/desktop/src/fatal/FatalErrorScreen.tsx',
  'apps/desktop/src/fatal/FatalErrorBoundary.tsx',
  'apps/desktop/src/fatal/FatalErrorHost.tsx',
]

const forbiddenFiles = [
  'apps/desktop/src/bootstrap/ApplicationErrorBoundary.tsx',
  'apps/desktop/src/bootstrap/bootstrap-fallback.ts',
  'apps/desktop/src/presentation/boundaries/UiErrorBoundary.tsx',
]

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), 'utf8')
}

for (const relativePath of requiredFiles) {
  if (!existsSync(path.join(ROOT, relativePath))) {
    failures.push('Missing fatal architecture file: ' + relativePath)
  }
}

for (const relativePath of forbiddenFiles) {
  if (existsSync(path.join(ROOT, relativePath))) {
    failures.push('Legacy fatal implementation still exists: ' + relativePath)
  }
}

const html = read('apps/desktop/index.html')
const appShell = read('apps/desktop/src/presentation/AppShell.tsx')
const reactRoot = read('apps/desktop/src/bootstrap/react-root.tsx')

const forbiddenHtmlTerms = [
  'Hybrid Canvas 正在启动',
  '正在加载应用组件',
  'bootstrap-fallback-card',
  'bootstrap-fallback.ts',
]

for (const term of forbiddenHtmlTerms) {
  if (html.includes(term)) {
    failures.push('Legacy startup UI remains in index.html: ' + term)
  }
}

if (!html.includes('/src/fatal/pre-react-entry.ts')) {
  failures.push('The pre-React fatal collector is not loaded.')
}

if (!html.includes('class="fatal-content"') && html.includes('fatal-card')) {
  failures.push('Fatal UI must not use a card container.')
}

if (appShell.includes('UiErrorBoundary')) {
  failures.push('The Workspace root must not use UiErrorBoundary.')
}

if (!reactRoot.includes('FatalErrorHost')) {
  failures.push('React root is not hosted by FatalErrorHost.')
}

if (!reactRoot.includes('fatalIncidentController.markReactMounted()')) {
  failures.push('React mount ownership was not transferred to the fatal controller.')
}

if (failures.length > 0) {
  console.error(
    ['Fatal error architecture checks failed:', ...failures.map((failure) => '- ' + failure)].join(
      '\n',
    ),
  )

  process.exitCode = 1
} else {
  console.log('Fatal error architecture checks passed.')
}
