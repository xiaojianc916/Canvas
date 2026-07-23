import {
  IpcInvocationError,
  isIpcError,
} from '@hybrid-canvas/desktop-ipc'
import {
  commands,
  type DocumentCloseRequest,
  type DocumentDescriptor,
  type DocumentId as NativeDocumentId,
  type DocumentOpenResponse,
  type DocumentSaveAsRequest,
  type DocumentSaveAsResult,
  type DocumentSaveRequest,
} from '@hybrid-canvas/desktop-ipc/generated/ipc-bindings'

export type DocumentId = NativeDocumentId

export interface OpenedDocument {
  readonly id: DocumentId
  readonly displayName: string
  readonly content: string
}

export interface DocumentFileCommands {
  readonly open: () => Promise<OpenedDocument | null>

  readonly saveAs: (
    content: string,
    options?: {
      readonly documentId?: DocumentId
      readonly suggestedName?: string
    },
  ) => Promise<{ readonly id: DocumentId; readonly displayName: string } | null>

  readonly save: (documentId: DocumentId, content: string) => Promise<void>

  readonly close: (documentId: DocumentId) => Promise<void>
}

async function invokeDocumentCommand<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (isIpcError(error)) {
      throw new IpcInvocationError(error)
    }

    throw error
  }
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
      const response: DocumentOpenResponse =
        await invokeDocumentCommand(() => commands.documentOpen())

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

      const response: DocumentSaveAsResult =
        await invokeDocumentCommand(() => commands.documentSaveAs(request))

      return response.document
        ? toDocumentDescriptor(response.document)
        : null
    },

    async save(documentId, content) {
      const request: DocumentSaveRequest = {
        documentId,
        content,
      }

      await invokeDocumentCommand(() => commands.documentSave(request))
    },

    async close(documentId) {
      const request: DocumentCloseRequest = {
        documentId,
      }

      await invokeDocumentCommand(() => commands.documentClose(request))
    },
  }
}
