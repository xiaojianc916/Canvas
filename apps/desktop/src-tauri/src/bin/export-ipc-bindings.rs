//! Regenerates TypeScript DTO bindings from Rust document IPC contracts.
//!
//! Usage:
//! cargo run -p hybrid-canvas-desktop --bin export-ipc-bindings

fn main() {
    hybrid_canvas_desktop_lib::ipc::export_bindings::export_document_bindings();
}
