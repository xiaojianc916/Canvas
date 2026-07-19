#![forbid(unsafe_code)]

//! Native plugin capability.
//!
//! Planned responsibilities:
//! - plugin package integrity verification (hash, size, structure)
//! - digital signature verification
//! - trust store for publisher keys
//! - package extraction and layout
//!
//! @architecture-stub: Phase 2–3.

mod package;
mod signature;
mod integrity;
mod trust_store;
mod error;

pub use error::{Error, Result};
