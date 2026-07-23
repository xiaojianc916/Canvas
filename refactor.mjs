#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'

const path = 'editor/document/src/domain/document-session.ts'

let source = await readFile(path, 'utf8')

const oldBlock = `    beginClosing() {
      assertNotClosed()

      if (phase === 'saving') {
        throw new Error('DOCUMENT_SESSION_SAVE_IN_PROGRESS')
      }

      phaseBeforeClosing = phase
      phase = 'closing'
    },`

const newBlock = `    beginClosing() {
      switch (phase) {
        case 'initializing':
        case 'ready':
        case 'save-failed':
          phaseBeforeClosing = phase
          phase = 'closing'
          return

        case 'saving':
          throw new Error('DOCUMENT_SESSION_SAVE_IN_PROGRESS')

        case 'closing':
        case 'closed':
          throw new Error('DOCUMENT_SESSION_NOT_ACTIVE')
      }
    },`

if (!source.includes(oldBlock)) {
  throw new Error(
    'Cannot apply DocumentSession transition refactor: beginClosing block was not found.',
  )
}

source = source.replace(oldBlock, newBlock)

await writeFile(path, source, 'utf8')

console.log(
  'DocumentSession beginClosing transition narrowed with an explicit state machine.',
)