#![allow(
    clippy::needless_pass_by_value,
    clippy::unused_async,
    reason = "Tauri command signatures are consumed by generated IPC handlers"
)]

pub mod commands;
pub mod error;

pub mod bootstrap;
pub mod ipc;
pub mod security;

pub use bootstrap::app;
pub use error::{Error, Result};

/// Single composition root. Called from main.rs.
pub fn run() {
    app::build()
        .run(tauri::generate_context!())
        .expect("failed to run hybrid-canvas desktop");
}
