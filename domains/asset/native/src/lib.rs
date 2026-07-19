#![forbid(unsafe_code)]

//! Native asset capability.
//!
//! Planned responsibilities:
//! - content-addressed storage
//! - streaming reads and writes
//! - integrity verification
//!
//! @architecture-stub: Phase 2.

mod store;
mod content_address;
mod integrity;
mod error;

pub use error::{Error, Result};
