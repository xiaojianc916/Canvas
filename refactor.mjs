#!/usr/bin/env node
/**
 * 完成 document IPC command generation：
 *
 * - Rust command 使用 #[specta::specta]
 * - command error 使用可导出的 IpcError
 * - tauri-specta 收集实际 document commands
 * - 生成 commands.documentOpen / documentSaveAs / documentSave / documentClose
 * - desktop runtime 删除 document command 字符串与手写 invoke 泛型
 */

import { readFile, writeFile } from 'node:fs/promises'

const documentCommandsPath = 'apps/desktop/src-tauri/src/commands/document.rs'
const errorPath = 'apps/desktop/src-tauri/src/error.rs'
const exporterPath = 'apps/desktop/src-tauri/src/ipc/export_bindings.rs'
const adapterPath =
  'platforms/desktop-runtime/src/adapters/file/file-system.ts'

async function rewrite(path, transform) {
  const source = await readFile(path, 'utf8')
  await writeFile(path, transform(source), 'utf8')
}

await rewrite(documentCommandsPath, (source) => {
  let next = source.replace(
    'use crate::error::{Error, Result};',
    'use crate::error::{Error, IpcError, Result};',
  )

  next = next.replace(
    'const DEFAULT_DOCUMENT_NAME: &str = "untitled.draw";',
    `const DEFAULT_DOCUMENT_NAME: &str = "untitled.draw";

type DocumentCommandResult<T> = std::result::Result<T, IpcError>;`,
  )

  next = next.replaceAll(
    '#[command]\npub ',
    '#[command]\n#[specta::specta]\npub ',
  )

  next = next.replace(
    `pub async fn document_open(
    app: AppHandle,
    documents: State<'_, DocumentRegistry>,
) -> Result<DocumentOpenResponse> {`,
    `pub async fn document_open(
    app: AppHandle,
    documents: State<'_, DocumentRegistry>,
) -> DocumentCommandResult<DocumentOpenResponse> {`,
  )

  next = next.replace(
    `pub async fn document_save_as(
    app: AppHandle,
    documents: State<'_, DocumentRegistry>,
    request: DocumentSaveAsRequest,
) -> Result<DocumentSaveAsResult> {`,
    `pub async fn document_save_as(
    app: AppHandle,
    documents: State<'_, DocumentRegistry>,
    request: DocumentSaveAsRequest,
) -> DocumentCommandResult<DocumentSaveAsResult> {`,
  )

  next = next.replace(
    `pub async fn document_save(
    documents: State<'_, DocumentRegistry>,
    request: DocumentSaveRequest,
) -> Result<()> {`,
    `pub async fn document_save(
    documents: State<'_, DocumentRegistry>,
    request: DocumentSaveRequest,
) -> DocumentCommandResult<()> {`,
  )

  next = next.replace(
    `pub fn document_close(
    documents: State<'_, DocumentRegistry>,
    request: DocumentCloseRequest,
) -> Result<()> {`,
    `pub fn document_close(
    documents: State<'_, DocumentRegistry>,
    request: DocumentCloseRequest,
) -> DocumentCommandResult<()> {`,
  )

  return next
})

await rewrite(errorPath, (source) => {
  let next = source

  next = next.replace(
    `impl Error {
    fn code(&self) -> IpcErrorCode {`,
    `impl Error {
    fn to_ipc_error(&self) -> IpcError {
        IpcError {
            code: self.code(),
            message: self.public_message().to_owned(),
            operation: self.operation(),
            recoverable: self.recoverable(),
        }
    }

    fn code(&self) -> IpcErrorCode {`,
  )

  next = next.replace(
    `impl Serialize for Error {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        IpcError {
            code: self.code(),
            message: self.public_message().to_owned(),
            operation: self.operation(),
            recoverable: self.recoverable(),
        }
        .serialize(serializer)
    }
}`,
    `impl From<Error> for IpcError {
    fn from(error: Error) -> Self {
        error.to_ipc_error()
    }
}

impl Serialize for Error {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        self.to_ipc_error().serialize(serializer)
    }
}`,
  )

  return next
})

await rewrite(exporterPath, (source) => {
  let next = source.replace(
    'use tauri_specta::Builder;',
    'use tauri_specta::{Builder, ErrorHandlingMode};',
  )

  next = next.replace(
    `Builder::<Wry>::new()
        .typ::<DocumentId>()`,
    `Builder::<Wry>::new()
        .error_handling(ErrorHandlingMode::Throw)
        .commands(tauri_specta::collect_commands![
            crate::commands::document::document_open,
            crate::commands::document::document_save_as,
            crate::commands::document::document_save,
            crate::commands::document::document_close,
        ])
        .typ::<DocumentId>()`,
  )

  return next
})

const adapter = `import {
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
`

await writeFile(adapterPath, adapter, 'utf8')

console.log('Document IPC command generation refactor written.')
console.log('')
console.log('Generate bindings with:')
console.log('  cargo run -p hybrid-canvas-desktop --bin export-ipc-bindings')