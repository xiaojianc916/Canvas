#!/usr/bin/env node
/**
 * Document IPC contract generation refactor.
 *
 * Rust DTOs are the source of truth.
 * The desktop runtime adapter imports generated TypeScript types.
 *
 * This does not add compatibility aliases and does not restore path-based IPC.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const exportBindingsPath = resolve(
  'apps/desktop/src-tauri/src/ipc/export_bindings.rs',
)

const exportBinaryPath = resolve(
  'apps/desktop/src-tauri/src/bin/export-ipc-bindings.rs',
)

const fileSystemAdapterPath = resolve(
  'platforms/desktop-runtime/src/adapters/file/file-system.ts',
)

async function write(path, content) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
}

const exportBindings = `//! Build-time TypeScript binding exporter for document IPC.
//!
//! Rust command DTOs are the source of truth. The generated file is consumed by
//! @hybrid-canvas/desktop-runtime; renderer code must not redefine native DTOs.

use specta_typescript::Typescript;
use tauri::Wry;
use tauri_specta::Builder;

use crate::commands::document::{
    DocumentCloseRequest, DocumentDescriptor, DocumentId, DocumentOpenResponse,
    DocumentOpenResult, DocumentSaveAsRequest, DocumentSaveAsResult,
    DocumentSaveRequest,
};

const OUTPUT_PATH: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../../../platforms/desktop-ipc/src/generated/ipc-bindings.ts"
);

/// Exports the document IPC DTO surface consumed by the TypeScript runtime.
///
/// This function is intentionally called by the dedicated
/// \`export-ipc-bindings\` binary, never on desktop application startup.
pub fn export_document_bindings() {
    Builder::<Wry>::new()
        .typ::<DocumentId>()
        .typ::<DocumentDescriptor>()
        .typ::<DocumentOpenResult>()
        .typ::<DocumentOpenResponse>()
        .typ::<DocumentSaveRequest>()
        .typ::<DocumentSaveAsRequest>()
        .typ::<DocumentSaveAsResult>()
        .typ::<DocumentCloseRequest>()
        .export(Typescript::default(), OUTPUT_PATH)
        .expect("failed to export document IPC TypeScript bindings");
}
`

const exportBinary = `//! Regenerates TypeScript DTO bindings from Rust document IPC contracts.
//!
//! Usage:
//! cargo run -p hybrid-canvas-desktop --bin export-ipc-bindings

fn main() {
    hybrid_canvas_desktop_lib::ipc::export_bindings::export_document_bindings();
}
`

const fileSystemAdapter = `import { invoke } from '@hybrid-canvas/desktop-ipc'
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
`

await Promise.all([
  write(exportBindingsPath, exportBindings),
  write(exportBinaryPath, exportBinary),
  write(fileSystemAdapterPath, fileSystemAdapter),
])

console.log('Document IPC contract generation refactor written:')
console.log('- Rust Specta DTO exporter')
console.log('- Dedicated export-ipc-bindings binary')
console.log('- Desktop adapter now imports generated DTO types')
console.log('')
console.log('Next commands:')
console.log('  cargo run -p hybrid-canvas-desktop --bin export-ipc-bindings')
console.log('  pnpm typecheck')
console.log('  pnpm test')
console.log('  cargo test --workspace --all-features')