import { invoke } from '@hybrid-canvas/desktop-ipc'
import type {
  DocumentCloseRequest,
  DocumentDescriptor,
  DocumentId as NativeDocumentId,
  DocumentOpenResponse,
  DocumentSaveAsRequest,
  DocumentSaveAsResult,
  DocumentSaveRequest,
} from '@hybrid-canvas/desktop-ipc/generated/ipc-bindings'

export type DocumentId = NativeDocumentId

export interface OpenedDocument {
  readonly id: DocumentId
  readonly displayName: string
  readonly content: string
}

export interface DocumentFileCommands {
  /**
   * Opens one local .draw document through the native picker.
   *
   * The renderer never receives the selected filesystem path.
   */
  readonly open: () => Promise<OpenedDocument | null>

  /**
   * Creates a new native document session, or moves an existing session through
   * the native Save As picker. No filesystem path can be supplied.
   */
  readonly saveAs: (
    content: string,
    options?: {
      readonly documentId?: DocumentId
      readonly suggestedName?: string
    },
  ) => Promise<{ readonly id: DocumentId; readonly displayName: string } | null>

  /**
   * Saves content to a document selected earlier by a native picker.
   */
  readonly save: (documentId: DocumentId, content: string) => Promise<void>

  /**
   * Releases the native document session.
   */
  readonly close: (documentId: DocumentId) => Promise<void>
}

function toDocumentDescriptor(
  descriptor: DocumentDescriptor,
): { readonly id: DocumentId; readonly displayName: string } {
  return {
    id: descriptor.documentId,
    displayName: descriptor.displayName,
  }
}

export function createDocumentFileCommands(): DocumentFileCommands {
  return {
    async open() {
      const response = await invoke<DocumentOpenResponse>('document_open')

      if (!response.document) {
        return null
      }

      return {
        id: response.document.documentId,
        displayName: response.document.displayName,
        content: response.document.content,
      }
    },

    async saveAs(content, options) {
      const request: DocumentSaveAsRequest = {
        documentId: options?.documentId ?? null,
        content,
        suggestedName: options?.suggestedName ?? null,
      }

      const response = await invoke<DocumentSaveAsResult>('document_save_as', {
        request,
      })

      return response.document
        ? toDocumentDescriptor(response.document)
        : null
    },

    save(documentId, content) {
      const request: DocumentSaveRequest = {
        documentId,
        content,
      }

      return invoke<void>('document_save', { request })
    },

    close(documentId) {
      const request: DocumentCloseRequest = {
        documentId,
      }

      return invoke<void>('document_close', { request })
    },
  }
}
