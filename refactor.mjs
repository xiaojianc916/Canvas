#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'

const path = 'apps/desktop/src/application/canvas/canvas-workflow.test.ts'

let source = await readFile(path, 'utf8')

source = source.replace(
  `    let releaseA

    const releaseAPromise = new Promise((resolve) => {
      releaseA = resolve
    })`,
  `    let resolveReleaseA!: () => void

    const releaseAPromise = new Promise<void>((resolve) => {
      resolveReleaseA = resolve
    })`,
)

source = source.replace(
  `    releaseA()`,
  `    resolveReleaseA()`,
)

source = source.replace(
  `    let release

    const pendingRelease = new Promise((resolve) => {
      release = resolve
    })`,
  `    let resolvePendingRelease!: () => void

    const pendingRelease = new Promise<void>((resolve) => {
      resolvePendingRelease = resolve
    })`,
)

source = source.replace(
  `    release()`,
  `    resolvePendingRelease()`,
)

await writeFile(path, source, 'utf8')

console.log('Canvas workflow concurrency test resolver types fixed.')