#![forbid(unsafe_code)]

//! Native file capability.
//!
//! Current responsibility:
//! - atomic replacement of an already-validated logical .draw payload
//!
//! Archive containers, binary asset storage, advisory locking, external-change
//! watching and recovery journals are intentionally absent until they can be
//! delivered as one complete, tested native DocumentCodec protocol.

mod atomic_write;
mod error;

pub use atomic_write::atomic_write;
pub use error::{Error, Result};
