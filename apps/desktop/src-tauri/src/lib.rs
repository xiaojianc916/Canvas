pub mod commands;
pub mod error;

pub mod bootstrap;
pub mod ipc;

pub use error::{Error, Result};
pub use bootstrap::app;

/// Single composition root. Called from main.rs.
pub fn run() {
    app::build()
        .run(tauri::generate_context!())
        .expect("failed to run hybrid-canvas desktop");
}
