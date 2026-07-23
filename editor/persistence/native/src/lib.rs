#![deny(unsafe_code)]

//! Native file capability.
//!
//! Current responsibility:
//! - strict v2 ZIP document encoding and decoding
//! - content-addressed binary asset storage
//! - atomic replacement of an already-validated document container
//!
//! Advisory locking, external-change watching and recovery journals remain
//! separate native lifecycle concerns.

// Windows atomic replacement requires direct calls to ReplaceFileW and
// MoveFileExW. Keep that unsafe boundary confined to this module.
#[allow(
    unsafe_code,
    reason = "Win32 atomic file replacement requires audited FFI"
)]
mod atomic_write;

mod document_codec;
mod document_codec_v2;
mod error;
mod revision;

pub use atomic_write::atomic_write;
pub use document_codec::canonicalize_draw_document;
pub use document_codec_v2::{
    decode_draw_document_v2, encode_draw_document_v2, DecodedDrawDocumentV2, DrawAssetInput,
    DrawAssetOutput, DrawDocumentV2Input,
};
pub use error::{Error, Result};
pub use revision::{document_revision, DocumentRevision};
