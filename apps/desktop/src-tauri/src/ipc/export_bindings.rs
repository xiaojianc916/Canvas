//! Build-time TypeScript binding exporter for document IPC.
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
/// `export-ipc-bindings` binary, never on desktop application startup.
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
