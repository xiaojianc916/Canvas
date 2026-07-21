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

mod error;
mod integrity;
mod package;
mod signature;
mod trust_store;

pub use error::{Error, Result};
