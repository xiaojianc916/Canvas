#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'

const sessionPath = 'editor/document/src/domain/document-session.ts'

const sessionTestPath =
  'tests/cross-domain-contract/document-lifecycle/document-session.test.ts'

const architectureCheckPath =
  'tests/architecture/check-canvas-lifecycle.mjs'

let session = await readFile(sessionPath, 'utf8')

session = session.replace(
  `export type DocumentPersistenceState = 'clean' | 'dirty' | 'saving' | 'failed'`,
  `export type DocumentPersistenceState = 'clean' | 'dirty' | 'saving' | 'failed'

type ReopenableDocumentSessionPhase = Exclude<
  DocumentSessionPhase,
  'closing' | 'closed'
>`,
)

session = session.replace(
  `  let activeSave: DocumentSaveTicket | null = null
  let nextSaveId = 1`,
  `  let activeSave: DocumentSaveTicket | null = null
  let phaseBeforeClosing: ReopenableDocumentSessionPhase | null = null
  let nextSaveId = 1`,
)

session = session.replace(
  `    beginClosing() {
      assertNotClosed()

      if (phase === 'saving') {
        throw new Error('DOCUMENT_SESSION_SAVE_IN_PROGRESS')
      }

      phase = 'closing'
    },

    cancelClosing() {
      if (phase !== 'closing') {
        throw new Error('DOCUMENT_SESSION_NOT_CLOSING')
      }

      phase = 'ready'
    },

    completeClosing() {
      if (phase !== 'closing') {
        throw new Error('DOCUMENT_SESSION_NOT_CLOSING')
      }

      phase = 'closed'
    },`,
  `    beginClosing() {
      assertNotClosed()

      if (phase === 'saving') {
        throw new Error('DOCUMENT_SESSION_SAVE_IN_PROGRESS')
      }

      phaseBeforeClosing = phase
      phase = 'closing'
    },

    cancelClosing() {
      if (phase !== 'closing' || !phaseBeforeClosing) {
        throw new Error('DOCUMENT_SESSION_NOT_CLOSING')
      }

      phase = phaseBeforeClosing
      phaseBeforeClosing = null
    },

    completeClosing() {
      if (phase !== 'closing') {
        throw new Error('DOCUMENT_SESSION_NOT_CLOSING')
      }

      phaseBeforeClosing = null
      phase = 'closed'
    },`,
)

await writeFile(sessionPath, session, 'utf8')

let sessionTest = await readFile(sessionTestPath, 'utf8')

sessionTest = sessionTest.replace(
  `  it('enters failed state after a native save failure', () => {`,
  `  it('restores the exact pre-close phase after native release cancellation', () => {
    const session = createDocumentSession('document-native-1')

    const current = snapshot({
      shapes: [{ id: 'shape:1' }],
    })

    session.initialize(snapshot({ shapes: [] }))

    const ticket = session.beginSave(current)
    session.failSave(ticket)

    expect(session.getSnapshot()).toEqual({
      phase: 'save-failed',
      persistence: 'failed',
      documentId: 'document-native-1',
    })

    session.beginClosing()

    expect(session.getSnapshot()).toEqual({
      phase: 'closing',
      persistence: 'dirty',
      documentId: 'document-native-1',
    })

    session.cancelClosing()

    expect(session.getSnapshot()).toEqual({
      phase: 'save-failed',
      persistence: 'failed',
      documentId: 'document-native-1',
    })
  })

  it('restores ready state after a clean close cancellation', () => {
    const session = createDocumentSession('document-native-1')

    session.initialize(snapshot({ shapes: [] }))
    session.beginClosing()
    session.cancelClosing()

    expect(session.getSnapshot()).toEqual({
      phase: 'ready',
      persistence: 'clean',
      documentId: 'document-native-1',
    })
  })

  it('enters failed state after a native save failure', () => {`,
)

await writeFile(sessionTestPath, sessionTest, 'utf8')

let architectureCheck = await readFile(architectureCheckPath, 'utf8')

architectureCheck = architectureCheck.replace(
  `const files = [`,
  `const documentSessionPath =
  'editor/document/src/domain/document-session.ts'

const files = [`,
)

architectureCheck = architectureCheck.replace(
  `const sources = await Promise.all(
  files.map(async (path) => ({
    path,
    source: await readFile(path, 'utf8'),
  })),
)`,
  `const sources = await Promise.all(
  files.map(async (path) => ({
    path,
    source: await readFile(path, 'utf8'),
  })),
)

const documentSession = await readFile(documentSessionPath, 'utf8')`,
)

architectureCheck = architectureCheck.replace(
  `if (!workflow?.includes('CanvasCloseSnapshot')) {
  violations.push('Canvas lifecycle coordinator snapshot is missing')
}`,
  `if (!workflow?.includes('CanvasCloseSnapshot')) {
  violations.push('Canvas lifecycle coordinator snapshot is missing')
}

if (!documentSession.includes('phaseBeforeClosing')) {
  violations.push(
    'DocumentSession must retain the phase that existed before closing',
  )
}

if (!documentSession.includes('phase = phaseBeforeClosing')) {
  violations.push(
    'DocumentSession close cancellation must restore the exact prior phase',
  )
}

if (documentSession.includes("phase = 'ready'\\n    },\\n\\n    completeClosing")) {
  violations.push(
    'DocumentSession close cancellation must not unconditionally restore ready',
  )
}`,
)

await writeFile(architectureCheckPath, architectureCheck, 'utf8')

console.log('DocumentSession close cancellation state restoration refactor written.')