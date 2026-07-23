#![deny(unsafe_code)]

//! Native file capability.
//!
//! Current responsibility:
//! - atomic replacement of an already-validated logical .draw payload
//!
//! Archive containers, binary asset storage, advisory locking, external-change
//! watching and recovery journals are intentionally absent until they can be
//! delivered as one complete, tested native DocumentCodec protocol.

// Windows atomic replacement requires direct calls to ReplaceFileW and
// MoveFileExW. Keep that unsafe boundary confined to this module.
#[allow(unsafe_code)]
mod atomic_write;

mod document_codec;
mod error;

pub use atomic_write::atomic_write;
pub use document_codec::canonicalize_draw_document;
pub use error::{Error, Result};
