//! Strong content identity for optimistic document concurrency.
//!
//! A revision is the lowercase SHA-256 identity of the exact bytes stored on
//! disk. It is opaque outside Native and must never be interpreted as a
//! timestamp, path or mutable sequence number.

use sha2::{Digest, Sha256};

const SHA256_BYTES: usize = 32;
const SHA256_HEX_LENGTH: usize = SHA256_BYTES * 2;

/// Native-only, validated identity of exact document bytes.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DocumentRevision(String);

impl DocumentRevision {
    /// Calculates the revision of an exact byte sequence.
    pub fn from_bytes(content: &[u8]) -> Self {
        let digest = Sha256::digest(content);
        let revision = hex::encode(digest);

        debug_assert_eq!(revision.len(), SHA256_HEX_LENGTH);

        Self(revision)
    }

    /// Parses an opaque revision received through IPC.
    ///
    /// Only the canonical lowercase SHA-256 representation is accepted.
    pub fn parse(value: &str) -> Option<Self> {
        if value.len() != SHA256_HEX_LENGTH {
            return None;
        }

        if value.bytes().any(|byte| byte.is_ascii_uppercase()) {
            return None;
        }

        let decoded = hex::decode(value).ok()?;

        if decoded.len() != SHA256_BYTES {
            return None;
        }

        Some(Self(value.to_owned()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn into_string(self) -> String {
        self.0
    }
}

/// Calculates the revision of an exact byte sequence.
pub fn document_revision(content: &[u8]) -> DocumentRevision {
    DocumentRevision::from_bytes(content)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn revision_is_stable_for_identical_bytes() {
        let first = document_revision(b"canvas");
        let second = document_revision(b"canvas");

        assert_eq!(first, second);
        assert_eq!(first.as_str().len(), SHA256_HEX_LENGTH);
    }

    #[test]
    fn revision_changes_when_any_byte_changes() {
        assert_ne!(
            document_revision(b"canvas-a"),
            document_revision(b"canvas-b"),
        );
    }

    #[test]
    fn revision_uses_exact_stored_bytes() {
        assert_ne!(
            document_revision(b"{\"value\":1}"),
            document_revision(b"{ \"value\": 1 }"),
        );
    }

    #[test]
    fn parses_canonical_revision() {
        let revision = document_revision(b"canvas");

        let parsed = DocumentRevision::parse(revision.as_str())
            .expect("canonical revision should parse");

        assert_eq!(parsed, revision);
    }

    #[test]
    fn rejects_malformed_revision() {
        assert!(DocumentRevision::parse("revision").is_none());
        assert!(DocumentRevision::parse(&"0".repeat(63)).is_none());
        assert!(DocumentRevision::parse(&"0".repeat(65)).is_none());
        assert!(DocumentRevision::parse(&"A".repeat(64)).is_none());
        assert!(DocumentRevision::parse(&"z".repeat(64)).is_none());
    }
}
