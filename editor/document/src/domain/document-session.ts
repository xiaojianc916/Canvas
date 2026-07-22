import type { TLEditorSnapshot } from 'tldraw'

import {
  checkpointsEqual,
  createDocumentCheckpoint,
  type DocumentCheckpoint,
} from './document-checkpoint'

// Tests: tests/cross-domain-contract/document-lifecycle/document-session.test.ts

export type DocumentSessionPhase =
  | 'initializing'
  | 'ready'
  | 'saving'
  | 'save-failed'
  | 'closing'
  | 'closed'

export type DocumentPersistenceState = 'clean' | 'dirty' | 'saving' | 'failed'

export interface DocumentSaveTicket {
  readonly id: number
  readonly checkpoint: DocumentCheckpoint
}

export interface DocumentSessionSnapshot {
  readonly phase: DocumentSessionPhase
  readonly persistence: DocumentPersistenceState
  readonly filePath: string | null
}

export interface DocumentSession {
  readonly initialize: (snapshot: TLEditorSnapshot) => void

  readonly recordDocumentChange: (snapshot: TLEditorSnapshot) => void

  readonly beginSave: (snapshot: TLEditorSnapshot) => DocumentSaveTicket

  readonly completeSave: (ticket: DocumentSaveTicket, filePath: string) => void

  readonly failSave: (ticket: DocumentSaveTicket) => void

  readonly beginClosing: () => void
  readonly completeClosing: () => void

  readonly isInitialized: () => boolean
  readonly isDirty: () => boolean
  readonly getPhase: () => DocumentSessionPhase
  readonly getFilePath: () => string | null
  readonly getSnapshot: () => DocumentSessionSnapshot
}

export function createDocumentSession(filePath: string | null): DocumentSession {
  let phase: DocumentSessionPhase = 'initializing'

  let currentCheckpoint: DocumentCheckpoint | null = null

  let savedCheckpoint: DocumentCheckpoint | null = null

  let currentFilePath = filePath
  let activeSave: DocumentSaveTicket | null = null
  let nextSaveId = 1

  function assertNotClosed(): void {
    if (phase === 'closing' || phase === 'closed') {
      throw new Error('DOCUMENT_SESSION_NOT_ACTIVE')
    }
  }

  function requireInitialized(): void {
    if (currentCheckpoint === null || savedCheckpoint === null) {
      throw new Error('DOCUMENT_SESSION_NOT_INITIALIZED')
    }
  }

  function requireActiveTicket(ticket: DocumentSaveTicket): void {
    if (activeSave === null || activeSave.id !== ticket.id) {
      throw new Error('DOCUMENT_SESSION_STALE_SAVE_TICKET')
    }
  }

  function isDirty(): boolean {
    if (currentCheckpoint === null || savedCheckpoint === null) {
      return false
    }

    return !checkpointsEqual(currentCheckpoint, savedCheckpoint)
  }

  function getPersistenceState(): DocumentPersistenceState {
    if (phase === 'saving') {
      return 'saving'
    }

    if (phase === 'save-failed') {
      return 'failed'
    }

    return isDirty() ? 'dirty' : 'clean'
  }

  return {
    initialize(snapshot) {
      assertNotClosed()

      if (phase !== 'initializing') {
        throw new Error('DOCUMENT_SESSION_ALREADY_INITIALIZED')
      }

      const checkpoint = createDocumentCheckpoint(snapshot)

      currentCheckpoint = checkpoint
      savedCheckpoint = checkpoint
      phase = 'ready'
    },

    recordDocumentChange(snapshot) {
      assertNotClosed()
      requireInitialized()

      currentCheckpoint = createDocumentCheckpoint(snapshot)

      if (phase === 'save-failed') {
        phase = 'ready'
      }
    },

    beginSave(snapshot) {
      assertNotClosed()
      requireInitialized()

      if (phase === 'saving') {
        throw new Error('DOCUMENT_SESSION_SAVE_ALREADY_ACTIVE')
      }

      currentCheckpoint = createDocumentCheckpoint(snapshot)

      const ticket: DocumentSaveTicket = {
        id: nextSaveId,
        checkpoint: currentCheckpoint,
      }

      nextSaveId += 1
      activeSave = ticket
      phase = 'saving'

      return ticket
    },

    completeSave(ticket, nextFilePath) {
      assertNotClosed()
      requireActiveTicket(ticket)

      savedCheckpoint = ticket.checkpoint
      currentFilePath = nextFilePath
      activeSave = null
      phase = 'ready'
    },

    failSave(ticket) {
      assertNotClosed()
      requireActiveTicket(ticket)

      activeSave = null
      phase = 'save-failed'
    },

    beginClosing() {
      assertNotClosed()

      if (phase === 'saving') {
        throw new Error('DOCUMENT_SESSION_SAVE_IN_PROGRESS')
      }

      phase = 'closing'
    },

    completeClosing() {
      if (phase !== 'closing') {
        throw new Error('DOCUMENT_SESSION_NOT_CLOSING')
      }

      phase = 'closed'
    },

    isInitialized() {
      return currentCheckpoint !== null && savedCheckpoint !== null
    },

    isDirty,

    getPhase() {
      return phase
    },

    getFilePath() {
      return currentFilePath
    },

    getSnapshot() {
      return {
        phase,
        persistence: getPersistenceState(),
        filePath: currentFilePath,
      }
    },
  }
}
