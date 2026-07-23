//! Strong content identity for optimistic document concurrency.
//!
//! Revisions are calculated from the exact bytes currently stored on disk.
//! They are opaque outside Native and must never be interpreted as timestamps.

use sha2::{Digest, Sha256};

const SHA256_BYTES: usize = 32;
const SHA256_HEX_LENGTH: usize = SHA256_BYTES * 2;

/// Returns the lowercase SHA-256 identity of an exact byte sequence.
pub fn document_revision(content: &[u8]) -> String {
    let digest = Sha256::digest(content);
    let revision = hex::encode(digest);

    debug_assert_eq!(revision.len(), SHA256_HEX_LENGTH);

    revision
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn revision_is_stable_for_identical_bytes() {
        let first = document_revision(b"canvas");
        let second = document_revision(b"canvas");

        assert_eq!(first, second);
        assert_eq!(first.len(), SHA256_HEX_LENGTH);
    }

    #[test]
    fn revision_changes_when_any_byte_changes() {
        assert_ne!(
            document_revision(b"canvas-a"),
            document_revision(b"canvas-b"),
        );
    }

    #[test]
    fn revision_uses_the_exact_stored_bytes() {
        assert_ne!(
            document_revision(b"{\"value\":1}"),
            document_revision(b"{ \"value\": 1 }"),
        );
    }
}
