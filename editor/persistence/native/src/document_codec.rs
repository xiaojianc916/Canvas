//! Native logical-document boundary.
//!
//! Renderer code may supply a .draw payload only as a logical JSON document.
//! This module validates the native file envelope before it reaches disk and
//! serializes it canonically. Atomic replacement remains a separate concern.
//!
//! Future physical formats (ZIP, binary assets, manifests, migrations) must
//! be implemented behind this codec without widening the renderer IPC surface.

use crate::{Error, Result};
use serde_json::Value;

const DRAW_FORMAT: &str = "hybrid-canvas/draw";
const CURRENT_DRAW_VERSION: u64 = 1;
const MAX_LOGICAL_DOCUMENT_BYTES: usize = 32 * 1024 * 1024;

/// Validates a renderer-supplied logical .draw document and returns canonical
/// UTF-8 JSON suitable for physical persistence.
///
/// This does not validate tldraw records. Extension-aware tldraw validation
/// remains at the renderer's actual `loadSnapshot` boundary, where the complete
/// shape and binding schema is available.
pub fn canonicalize_draw_document(input: &[u8]) -> Result<String> {
    if input.len() > MAX_LOGICAL_DOCUMENT_BYTES {
        return Err(Error::CorruptedContainer(
            "logical document exceeds byte budget".into(),
        ));
    }

    let value: Value = serde_json::from_slice(input).map_err(|error| {
        Error::CorruptedContainer(format!("logical document is not valid JSON: {error}"))
    })?;

    validate_draw_envelope(&value)?;

    serde_json::to_string(&value).map_err(|error| {
        Error::CorruptedContainer(format!("logical document cannot be serialized: {error}"))
    })
}

fn validate_draw_envelope(value: &Value) -> Result<()> {
    let root = value.as_object().ok_or_else(|| {
        Error::CorruptedContainer("logical document root must be an object".into())
    })?;

    let header = root
        .get("header")
        .and_then(Value::as_object)
        .ok_or_else(|| {
            Error::CorruptedContainer("logical document header must be an object".into())
        })?;

    let format = header.get("format").and_then(Value::as_str);

    if format != Some(DRAW_FORMAT) {
        return Err(Error::CorruptedContainer(
            "logical document has an unsupported format".into(),
        ));
    }

    let version = header.get("version").and_then(Value::as_u64);

    if version != Some(CURRENT_DRAW_VERSION) {
        return Err(Error::CorruptedContainer(
            "logical document has an unsupported version".into(),
        ));
    }

    let created_at = header.get("createdAt").and_then(Value::as_str);

    if !created_at.is_some_and(|value| !value.trim().is_empty()) {
        return Err(Error::CorruptedContainer(
            "logical document has no creation timestamp".into(),
        ));
    }

    if !root.get("content").is_some_and(Value::is_object) {
        return Err(Error::CorruptedContainer(
            "logical document content must be an object".into(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::canonicalize_draw_document;

    fn valid_document() -> Vec<u8> {
        br#"{
            "header": {
                "format": "hybrid-canvas/draw",
                "version": 1,
                "createdAt": "2026-07-23T00:00:00.000Z"
            },
            "content": {
                "document": {},
                "session": {}
            }
        }"#
        .to_vec()
    }

    #[test]
    fn canonicalizes_a_valid_logical_document() {
        let document = canonicalize_draw_document(&valid_document())
            .expect("valid logical document should be accepted");

        assert!(!document.contains('\n'));
        assert!(document.contains("\"hybrid-canvas/draw\""));
        assert!(document.contains("\"content\""));
    }

    #[test]
    fn rejects_a_non_json_payload() {
        let result = canonicalize_draw_document(b"not-json");

        assert!(result.is_err());
    }

    #[test]
    fn rejects_a_raw_tldraw_snapshot_without_envelope() {
        let result = canonicalize_draw_document(br#"{ "document": {}, "session": {} }"#);

        assert!(result.is_err());
    }

    #[test]
    fn rejects_future_logical_versions() {
        let result = canonicalize_draw_document(
            br#"{
                "header": {
                    "format": "hybrid-canvas/draw",
                    "version": 2,
                    "createdAt": "2026-07-23T00:00:00.000Z"
                },
                "content": {}
            }"#,
        );

        assert!(result.is_err());
    }

    #[test]
    fn rejects_non_object_content() {
        let result = canonicalize_draw_document(
            br#"{
                "header": {
                    "format": "hybrid-canvas/draw",
                    "version": 1,
                    "createdAt": "2026-07-23T00:00:00.000Z"
                },
                "content": []
            }"#,
        );

        assert!(result.is_err());
    }
}
