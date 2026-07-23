//! Native delivery boundary for document-owned binary assets.
//!
//! Asset bytes are addressed only by opaque session and asset tokens. The
//! protocol never accepts filesystem paths, archive entry names or renderer
//! supplied MIME response headers.

use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tauri::http::{
    Request, Response, StatusCode,
    header::{CACHE_CONTROL, CONTENT_LENGTH, CONTENT_TYPE, X_CONTENT_TYPE_OPTIONS},
};

pub const ASSET_PROTOCOL_SCHEME: &str = "hybrid-canvas-asset";

const ASSET_PROTOCOL_HOST: &str = "asset";
const MAX_ASSET_BYTES: usize = 32 * 1024 * 1024;
const MAX_REGISTRY_BYTES: usize = 256 * 1024 * 1024;
const MAX_TOKEN_BYTES: usize = 128;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AssetSessionSnapshotEntry {
    pub content_hash: String,
    pub content_type: String,
    pub bytes: Arc<[u8]>,
}

#[derive(Clone, Debug)]
struct RegisteredAsset {
    bytes: Arc<[u8]>,
    content_type: String,
    references: u32,
}

#[derive(Debug, Default)]
struct RegistryState {
    sessions: HashMap<String, HashMap<String, RegisteredAsset>>,
    total_bytes: usize,
}

/// Process-local delivery registry for opened document sessions.
///
/// The DocumentCodec owns durable bytes. This registry owns only the bounded
/// runtime delivery cache used by the WebView custom protocol.
#[derive(Clone, Debug, Default)]
pub struct AssetProtocolRegistry {
    state: Arc<RwLock<RegistryState>>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AssetProtocolError {
    InvalidToken,
    InvalidContentHash,
    UnsupportedContentType,
    AssetTooLarge,
    RegistryBudgetExceeded,
    DuplicateAsset,
    ReferenceOverflow,
    NotFound,
    Internal,
}

impl AssetProtocolRegistry {
    pub fn open_session(&self, session_token: &str) -> Result<(), AssetProtocolError> {
        validate_token(session_token)?;

        let mut state = self
            .state
            .write()
            .map_err(|_| AssetProtocolError::Internal)?;

        if state.sessions.contains_key(session_token) {
            return Err(AssetProtocolError::DuplicateAsset);
        }

        state
            .sessions
            .insert(session_token.to_owned(), HashMap::new());

        Ok(())
    }

    pub fn insert(
        &self,
        session_token: &str,
        asset_token: &str,
        content_hash: &str,
        content_type: &str,
        bytes: Vec<u8>,
    ) -> Result<(), AssetProtocolError> {
        validate_token(session_token)?;
        validate_token(asset_token)?;
        validate_content_hash(content_hash)?;
        validate_content_type(content_type)?;

        /*
         * Runtime asset identity is the canonical lowercase SHA-256 digest.
         * Session tokens remain opaque, but asset tokens are deliberately
         * content-addressed so the same binary has one Native identity.
         */
        if asset_token != content_hash {
            return Err(AssetProtocolError::InvalidContentHash);
        }

        if bytes.len() > MAX_ASSET_BYTES {
            return Err(AssetProtocolError::AssetTooLarge);
        }

        let mut state = self
            .state
            .write()
            .map_err(|_| AssetProtocolError::Internal)?;

        let session = state
            .sessions
            .get_mut(session_token)
            .ok_or(AssetProtocolError::NotFound)?;

        if let Some(existing) = session.get_mut(asset_token) {
            if existing.content_type != content_type || existing.bytes.as_ref() != bytes.as_slice()
            {
                /*
                 * A SHA-256 identity must never resolve to different bytes or
                 * metadata within one session.
                 */
                return Err(AssetProtocolError::DuplicateAsset);
            }

            existing.references = existing
                .references
                .checked_add(1)
                .ok_or(AssetProtocolError::ReferenceOverflow)?;

            return Ok(());
        }

        let next_total = state
            .total_bytes
            .checked_add(bytes.len())
            .ok_or(AssetProtocolError::RegistryBudgetExceeded)?;

        if next_total > MAX_REGISTRY_BYTES {
            return Err(AssetProtocolError::RegistryBudgetExceeded);
        }

        let registered = RegisteredAsset {
            bytes: Arc::from(bytes),
            content_type: content_type.to_owned(),
            references: 1,
        };

        state
            .sessions
            .get_mut(session_token)
            .ok_or(AssetProtocolError::NotFound)?
            .insert(asset_token.to_owned(), registered);

        state.total_bytes = next_total;

        Ok(())
    }

    pub fn remove(
        &self,
        session_token: &str,
        asset_token: &str,
    ) -> Result<bool, AssetProtocolError> {
        validate_token(session_token)?;
        validate_token(asset_token)?;

        let mut state = self
            .state
            .write()
            .map_err(|_| AssetProtocolError::Internal)?;

        let Some(session) = state.sessions.get_mut(session_token) else {
            return Ok(false);
        };

        let Some(asset) = session.get_mut(asset_token) else {
            return Ok(false);
        };

        if asset.references > 1 {
            asset.references -= 1;
            return Ok(true);
        }

        let removed = session
            .remove(asset_token)
            .ok_or(AssetProtocolError::Internal)?;

        state.total_bytes = state.total_bytes.saturating_sub(removed.bytes.len());

        Ok(true)
    }

    pub fn remove_session(&self, session_token: &str) -> Result<bool, AssetProtocolError> {
        validate_token(session_token)?;

        let mut state = self
            .state
            .write()
            .map_err(|_| AssetProtocolError::Internal)?;

        let Some(assets) = state.sessions.remove(session_token) else {
            return Ok(false);
        };

        let removed_bytes = assets
            .values()
            .map(|asset| asset.bytes.len())
            .sum::<usize>();

        state.total_bytes = state.total_bytes.saturating_sub(removed_bytes);

        Ok(true)
    }

    /// Restores one complete document-owned asset session atomically.
    ///
    /// Every asset is validated and materialized in private temporary state
    /// before the registry write lock is acquired. The session becomes visible
    /// only after the complete resource set and global byte budget have been
    /// accepted.
    ///
    /// Failure never publishes an empty or partially restored session.
    pub fn restore_session(
        &self,
        session_token: &str,
        assets: Vec<AssetSessionSnapshotEntry>,
    ) -> Result<(), AssetProtocolError> {
        validate_token(session_token)?;

        let mut restored_assets = HashMap::<String, RegisteredAsset>::new();
        let mut restored_bytes = 0_usize;

        for asset in assets {
            validate_content_hash(&asset.content_hash)?;
            validate_content_type(&asset.content_type)?;

            if asset.bytes.len() > MAX_ASSET_BYTES {
                return Err(AssetProtocolError::AssetTooLarge);
            }

            let actual_hash = hex::encode(Sha256::digest(asset.bytes.as_ref()));

            if actual_hash != asset.content_hash {
                return Err(AssetProtocolError::InvalidContentHash);
            }

            restored_bytes = restored_bytes
                .checked_add(asset.bytes.len())
                .ok_or(AssetProtocolError::RegistryBudgetExceeded)?;

            if restored_bytes > MAX_REGISTRY_BYTES {
                return Err(AssetProtocolError::RegistryBudgetExceeded);
            }

            let content_hash = asset.content_hash;

            let registered = RegisteredAsset {
                bytes: asset.bytes,
                content_type: asset.content_type,
                references: 1,
            };

            if restored_assets.insert(content_hash, registered).is_some() {
                return Err(AssetProtocolError::DuplicateAsset);
            }
        }

        let mut state = self
            .state
            .write()
            .map_err(|_| AssetProtocolError::Internal)?;

        if state.sessions.contains_key(session_token) {
            return Err(AssetProtocolError::DuplicateAsset);
        }

        let next_total = state
            .total_bytes
            .checked_add(restored_bytes)
            .ok_or(AssetProtocolError::RegistryBudgetExceeded)?;

        if next_total > MAX_REGISTRY_BYTES {
            return Err(AssetProtocolError::RegistryBudgetExceeded);
        }

        state
            .sessions
            .insert(session_token.to_owned(), restored_assets);

        state.total_bytes = next_total;

        Ok(())
    }

    pub fn snapshot_session(
        &self,
        session_token: &str,
    ) -> Result<Vec<AssetSessionSnapshotEntry>, AssetProtocolError> {
        validate_token(session_token)?;

        let state = self
            .state
            .read()
            .map_err(|_| AssetProtocolError::Internal)?;

        let session = state
            .sessions
            .get(session_token)
            .ok_or(AssetProtocolError::NotFound)?;

        let mut snapshot = session
            .iter()
            .map(|(content_hash, asset)| AssetSessionSnapshotEntry {
                content_hash: content_hash.clone(),
                content_type: asset.content_type.clone(),
                bytes: Arc::clone(&asset.bytes),
            })
            .collect::<Vec<_>>();

        /*
         * Hash ordering makes the handoff deterministic for the v2 ZIP writer
         * regardless of HashMap iteration order.
         */
        snapshot.sort_unstable_by(|left, right| left.content_hash.cmp(&right.content_hash));

        Ok(snapshot)
    }

    pub fn contains(
        &self,
        session_token: &str,
        asset_token: &str,
    ) -> Result<bool, AssetProtocolError> {
        validate_token(session_token)?;
        validate_token(asset_token)?;

        let state = self
            .state
            .read()
            .map_err(|_| AssetProtocolError::Internal)?;

        Ok(state
            .sessions
            .get(session_token)
            .is_some_and(|assets| assets.contains_key(asset_token)))
    }

    pub fn response<B>(&self, request: &Request<B>) -> Response<Vec<u8>> {
        match self.resolve_request(request) {
            Ok(asset) => asset_response(&asset),
            Err(AssetProtocolError::NotFound) => empty_response(StatusCode::NOT_FOUND),
            Err(
                AssetProtocolError::InvalidToken
                | AssetProtocolError::InvalidContentHash
                | AssetProtocolError::UnsupportedContentType
                | AssetProtocolError::AssetTooLarge
                | AssetProtocolError::RegistryBudgetExceeded
                | AssetProtocolError::DuplicateAsset
                | AssetProtocolError::ReferenceOverflow,
            ) => empty_response(StatusCode::BAD_REQUEST),
            Err(AssetProtocolError::Internal) => empty_response(StatusCode::INTERNAL_SERVER_ERROR),
        }
    }

    fn resolve_request<B>(
        &self,
        request: &Request<B>,
    ) -> Result<RegisteredAsset, AssetProtocolError> {
        let uri = request.uri();

        if uri.query().is_some() {
            return Err(AssetProtocolError::InvalidToken);
        }

        let host = uri.host().unwrap_or(ASSET_PROTOCOL_HOST);

        let mut components = uri
            .path()
            .split('/')
            .filter(|component| !component.is_empty());

        if host == "hybrid-canvas-asset.localhost" || host == "localhost" {
            if components.next() != Some(ASSET_PROTOCOL_HOST) {
                return Err(AssetProtocolError::InvalidToken);
            }
        } else if host != ASSET_PROTOCOL_HOST {
            return Err(AssetProtocolError::InvalidToken);
        }

        let session_token = components.next().ok_or(AssetProtocolError::InvalidToken)?;

        let asset_token = components.next().ok_or(AssetProtocolError::InvalidToken)?;

        if components.next().is_some() {
            return Err(AssetProtocolError::InvalidToken);
        }

        validate_token(session_token)?;
        validate_token(asset_token)?;

        let state = self
            .state
            .read()
            .map_err(|_| AssetProtocolError::Internal)?;

        state
            .sessions
            .get(session_token)
            .and_then(|assets| assets.get(asset_token))
            .cloned()
            .ok_or(AssetProtocolError::NotFound)
    }
}

pub fn asset_protocol_url(
    session_token: &str,
    asset_token: &str,
) -> Result<String, AssetProtocolError> {
    validate_token(session_token)?;
    validate_token(asset_token)?;

    Ok(format!(
        "{ASSET_PROTOCOL_SCHEME}://{ASSET_PROTOCOL_HOST}/{session_token}/{asset_token}"
    ))
}

fn validate_token(value: &str) -> Result<(), AssetProtocolError> {
    if value.is_empty() || value.len() > MAX_TOKEN_BYTES {
        return Err(AssetProtocolError::InvalidToken);
    }

    if !value
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(AssetProtocolError::InvalidToken);
    }

    Ok(())
}

fn validate_content_hash(content_hash: &str) -> Result<(), AssetProtocolError> {
    if content_hash.len() != 64
        || !content_hash
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
    {
        return Err(AssetProtocolError::InvalidContentHash);
    }

    Ok(())
}

fn validate_content_type(content_type: &str) -> Result<(), AssetProtocolError> {
    match content_type {
        "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "application/pdf"
        | "video/mp4" | "video/webm" | "audio/mpeg" | "audio/mp4" | "audio/ogg" | "audio/wav" => {
            Ok(())
        }

        /*
         * SVG is deliberately excluded here. It is active content and requires
         * a dedicated sanitizer and CSP policy before it may enter the protocol.
         */
        _ => Err(AssetProtocolError::UnsupportedContentType),
    }
}

fn asset_response(asset: &RegisteredAsset) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, asset.content_type.as_str())
        .header(CONTENT_LENGTH, asset.bytes.len().to_string())
        .header(X_CONTENT_TYPE_OPTIONS, "nosniff")
        .header(CACHE_CONTROL, "private, max-age=31536000, immutable")
        .body(asset.bytes.as_ref().to_vec())
        .unwrap_or_else(|_| empty_response(StatusCode::INTERNAL_SERVER_ERROR))
}

fn empty_response(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(CONTENT_LENGTH, "0")
        .header(X_CONTENT_TYPE_OPTIONS, "nosniff")
        .header(CACHE_CONTROL, "no-store")
        .body(Vec::new())
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};

    fn request(uri: &str) -> Request<()> {
        Request::builder()
            .uri(uri)
            .body(())
            .expect("request should be valid")
    }

    fn hash(bytes: &[u8]) -> String {
        hex::encode(Sha256::digest(bytes))
    }

    fn insert(
        registry: &AssetProtocolRegistry,
        session: &str,
        content_type: &str,
        bytes: &[u8],
    ) -> String {
        let content_hash = hash(bytes);

        registry
            .insert(
                session,
                &content_hash,
                &content_hash,
                content_type,
                bytes.to_vec(),
            )
            .expect("asset should register");

        content_hash
    }

    #[test]
    fn serves_content_addressed_asset_without_exposing_a_path() {
        let registry = AssetProtocolRegistry::default();

        registry
            .open_session("session-1")
            .expect("session should open");

        let asset = insert(&registry, "session-1", "image/png", &[1, 2, 3, 4]);

        let response = registry.response(&request(&format!(
            "hybrid-canvas-asset://asset/session-1/{asset}"
        )));

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(CONTENT_TYPE),
            Some(&"image/png".parse().expect("header value")),
        );
        assert_eq!(response.body(), &vec![1, 2, 3, 4]);
    }

    #[test]
    fn rejects_path_traversal_and_extra_components() {
        let registry = AssetProtocolRegistry::default();

        for uri in [
            "hybrid-canvas-asset://asset/../asset",
            "hybrid-canvas-asset://asset/session/asset/extra",
            "hybrid-canvas-asset://asset/session\\escape/asset",
            "hybrid-canvas-asset://asset/session/asset?path=secret",
        ] {
            let response = registry.response(&request(uri));

            assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        }
    }

    #[test]
    fn removing_session_invalidates_all_urls() {
        let registry = AssetProtocolRegistry::default();

        registry
            .open_session("session-1")
            .expect("session should open");

        let asset = insert(&registry, "session-1", "image/png", &[1, 2, 3]);

        assert!(
            registry
                .remove_session("session-1")
                .expect("session should close")
        );

        let response = registry.response(&request(&format!(
            "hybrid-canvas-asset://asset/session-1/{asset}"
        )));

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[test]
    fn deduplicates_equal_content_and_tracks_references() {
        let registry = AssetProtocolRegistry::default();

        registry
            .open_session("session-1")
            .expect("session should open");

        let asset = insert(&registry, "session-1", "image/png", &[1, 2, 3]);

        let duplicate = insert(&registry, "session-1", "image/png", &[1, 2, 3]);

        assert_eq!(asset, duplicate);

        let snapshot = registry
            .snapshot_session("session-1")
            .expect("snapshot should succeed");

        assert_eq!(snapshot.len(), 1);
        assert_eq!(snapshot[0].content_hash, asset);

        assert!(
            registry
                .remove("session-1", &asset)
                .expect("first reference should be removed")
        );

        assert!(
            registry
                .contains("session-1", &asset)
                .expect("asset should remain")
        );

        assert!(
            registry
                .remove("session-1", &asset)
                .expect("final reference should be removed")
        );

        assert!(
            !registry
                .contains("session-1", &asset)
                .expect("asset should be gone")
        );
    }

    #[test]
    fn rejects_non_canonical_content_identity() {
        let registry = AssetProtocolRegistry::default();

        registry
            .open_session("session-1")
            .expect("session should open");

        let bytes = vec![1, 2, 3];
        let content_hash = hash(&bytes);

        let result = registry.insert(
            "session-1",
            "different-token",
            &content_hash,
            "image/png",
            bytes,
        );

        assert_eq!(result, Err(AssetProtocolError::InvalidContentHash),);
    }

    #[test]
    fn snapshot_is_sorted_by_content_hash() {
        let registry = AssetProtocolRegistry::default();

        registry
            .open_session("session-1")
            .expect("session should open");

        insert(&registry, "session-1", "image/png", &[3]);
        insert(&registry, "session-1", "image/png", &[1]);
        insert(&registry, "session-1", "image/png", &[2]);

        let snapshot = registry
            .snapshot_session("session-1")
            .expect("snapshot should succeed");

        let hashes = snapshot
            .iter()
            .map(|asset| asset.content_hash.as_str())
            .collect::<Vec<_>>();

        assert!(hashes.windows(2).all(|pair| { pair[0] < pair[1] }));
    }

    #[test]
    fn restores_complete_content_addressed_session() {
        let registry = AssetProtocolRegistry::default();

        let first_bytes = Arc::<[u8]>::from(vec![1, 2, 3]);
        let second_bytes = Arc::<[u8]>::from(vec![4, 5, 6]);

        let first_hash = hash(first_bytes.as_ref());
        let second_hash = hash(second_bytes.as_ref());

        registry
            .restore_session(
                "restored-session",
                vec![
                    AssetSessionSnapshotEntry {
                        content_hash: second_hash.clone(),
                        content_type: "image/png".to_owned(),
                        bytes: Arc::clone(&second_bytes),
                    },
                    AssetSessionSnapshotEntry {
                        content_hash: first_hash.clone(),
                        content_type: "image/png".to_owned(),
                        bytes: Arc::clone(&first_bytes),
                    },
                ],
            )
            .expect("session should restore");

        assert!(
            registry
                .contains("restored-session", &first_hash,)
                .expect("first asset should resolve")
        );

        assert!(
            registry
                .contains("restored-session", &second_hash,)
                .expect("second asset should resolve")
        );

        let snapshot = registry
            .snapshot_session("restored-session")
            .expect("restored session should snapshot");

        assert_eq!(snapshot.len(), 2);

        assert!(
            snapshot
                .windows(2)
                .all(|pair| { pair[0].content_hash < pair[1].content_hash })
        );

        let first_response = registry.response(&request(&format!(
            "hybrid-canvas-asset://asset/restored-session/{first_hash}"
        )));

        assert_eq!(first_response.status(), StatusCode::OK,);

        assert_eq!(first_response.body(), &first_bytes.as_ref().to_vec(),);
    }

    #[test]
    fn invalid_restore_does_not_publish_partial_session() {
        let registry = AssetProtocolRegistry::default();

        let valid_bytes = Arc::<[u8]>::from(vec![1, 2, 3]);

        let valid_hash = hash(valid_bytes.as_ref());

        let result = registry.restore_session(
            "failed-session",
            vec![
                AssetSessionSnapshotEntry {
                    content_hash: valid_hash,
                    content_type: "image/png".to_owned(),
                    bytes: valid_bytes,
                },
                AssetSessionSnapshotEntry {
                    content_hash: "0".repeat(64),
                    content_type: "image/png".to_owned(),
                    bytes: Arc::<[u8]>::from(vec![9, 9, 9]),
                },
            ],
        );

        assert_eq!(result, Err(AssetProtocolError::InvalidContentHash),);

        assert!(matches!(
            registry.snapshot_session("failed-session"),
            Err(AssetProtocolError::NotFound),
        ));
    }

    #[test]
    fn duplicate_restore_hash_does_not_publish_session() {
        let registry = AssetProtocolRegistry::default();

        let bytes = Arc::<[u8]>::from(vec![1, 2, 3]);
        let content_hash = hash(bytes.as_ref());

        let result = registry.restore_session(
            "duplicate-session",
            vec![
                AssetSessionSnapshotEntry {
                    content_hash: content_hash.clone(),
                    content_type: "image/png".to_owned(),
                    bytes: Arc::clone(&bytes),
                },
                AssetSessionSnapshotEntry {
                    content_hash,
                    content_type: "image/png".to_owned(),
                    bytes,
                },
            ],
        );

        assert_eq!(result, Err(AssetProtocolError::DuplicateAsset),);

        assert!(matches!(
            registry.snapshot_session("duplicate-session",),
            Err(AssetProtocolError::NotFound),
        ));
    }

    #[test]
    fn rejects_active_or_unknown_content_types() {
        let registry = AssetProtocolRegistry::default();

        registry
            .open_session("session")
            .expect("session should open");

        for content_type in [
            "image/svg+xml",
            "text/html",
            "application/javascript",
            "application/octet-stream",
        ] {
            let bytes = vec![1];
            let content_hash = hash(&bytes);

            let result =
                registry.insert("session", &content_hash, &content_hash, content_type, bytes);

            assert_eq!(result, Err(AssetProtocolError::UnsupportedContentType),);
        }
    }
}
