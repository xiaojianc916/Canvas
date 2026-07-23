#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'

const path = 'apps/desktop/src/application/canvas/canvas-workflow.ts'

let source = await readFile(path, 'utf8')

source = source.replace(
  `      case 'wait-for-save':
        setCloseSnapshot({
          state: 'release-failed',
          sessionId,
        })`,
  `      case 'wait-for-save':
        setCloseSnapshot({
          state: 'release-failed',
          sessionId,
          intent,
        })`,
)

await writeFile(path, source, 'utf8')

console.log('CanvasCloseSnapshot 的 wait-for-save 兜底状态已保留 close intent。')