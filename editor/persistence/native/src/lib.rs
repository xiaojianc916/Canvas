#![forbid(unsafe_code)]

//! Native file capability.
//!
//! Planned responsibilities:
//! - atomic writes (write → fsync → rename)
//! - .draw container archive (deflate, async zip)
//! - file locking and conflict detection
//! - file-system watcher
//! - recovery from partial writes
//!
//! @architecture-stub: Phase 1–2.

mod atomic_write;
mod container;
mod error;
mod lock;
mod recovery;
mod watcher;

pub use atomic_write::atomic_write;
pub use error::{Error, Result};
pub use recovery::{recover_directory, RecoveryAction};
