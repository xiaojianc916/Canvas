#!/usr/bin/env node
/* biome-ignore-all lint/suspicious/noConsole: CLI scripts intentionally write command output. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')

const files = [
  'apps/desktop/src/presentation/AppShell.tsx',
  'apps/desktop/src/application/termination/application-termination-coordinator.ts',
]

const forbidden = ['termination-failed', 'UNKNOWN_TERMINATION_ERROR', '重试退出', '应用退出失败']

const failures = []

for (const file of files) {
  const content = readFileSync(resolve(root, file), 'utf8')

  for (const term of forbidden) {
    if (content.includes(term)) {
      failures.push(`${file}: forbidden termination UX "${term}"`)
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('Termination UX architecture check passed.')
