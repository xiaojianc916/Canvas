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
mod lock;
mod recovery;
mod watcher;
mod error;

pub use error::{Error, Result};
