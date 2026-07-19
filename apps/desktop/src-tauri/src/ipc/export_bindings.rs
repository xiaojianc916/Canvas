//! IPC binding generator.
//!
//! Reads IPC DTO types from contracts/ and writes TypeScript definitions
//! to platforms/desktop-ipc/src/generated/ipc-bindings.ts.
//!
//! This package (`@hybrid-canvas/desktop-ipc`) is consumed by
//! domain adapters without creating `domain → apps/desktop` reverse deps.
//!
//! @architecture-stub: Phase 2.

/// Placeholder: will use specta or ts-rs to generate TS bindings.
#[allow(dead_code)]
pub fn export_bindings() {
    // TBD — run as a CI step or build script.
}
