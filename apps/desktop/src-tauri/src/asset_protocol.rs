//! Native delivery boundary for document-owned binary assets.
//!
//! Asset bytes are addressed only by opaque session and asset tokens. The
//! protocol never accepts filesystem paths, archive entry names or renderer
//! supplied MIME response headers.

use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tauri::http::{
    header::{
        CACHE_CONTROL, CONTENT_LENGTH, CONTENT_TYPE,
        X_CONTENT_TYPE_OPTIONS,
    },
    Request, Response, StatusCode,
};

pub const ASSET_PROTOCOL_SCHEME: &str = "hybrid-canvas-asset";

const ASSET_PROTOCOL_HOST: &str = "asset";
const MAX_ASSET_BYTES: usize = 32 * 1024 * 1024;
const MAX_REGISTRY_BYTES: usize = 256 * 1024 * 1024;
const MAX_TOKEN_BYTES: usize = 128;

#[derive(Clone, Debug)]
struct RegisteredAsset {
    bytes: Arc<[u8]>,
    content_type: String,
}

#[derive(Debug, Default)]
struct RegistryState {
    sessions: HashMap<String, HashMap<String, RegisteredAsset>>,
    total_bytes: usize,
}

/// Process-local delivery registry for opened document sessions.
///
/// The v2 DocumentCodec owns durable bytes. This registry owns only the bounded
/// runtime delivery cache used by the WebView custom protocol.
#[derive(Clone, Debug, Default)]
pub struct AssetProtocolRegistry {
    state: Arc<RwLock<RegistryState>>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AssetProtocolError {
    InvalidToken,
    UnsupportedContentType,
    AssetTooLarge,
    RegistryBudgetExceeded,
    DuplicateAsset,
    NotFound,
    Internal,
}

impl AssetProtocolRegistry {
    pub fn open_session(
        &self,
        session_token: &str,
    ) -> Result<(), AssetProtocolError> {
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
        content_type: &str,
        bytes: Vec<u8>,
    ) -> Result<(), AssetProtocolError> {
        validate_token(session_token)?;
        validate_token(asset_token)?;
        validate_content_type(content_type)?;

        if bytes.len() > MAX_ASSET_BYTES {
            return Err(AssetProtocolError::AssetTooLarge);
        }

        let mut state = self
            .state
            .write()
            .map_err(|_| AssetProtocolError::Internal)?;

        let session = state
            .sessions
            .get(session_token)
            .ok_or(AssetProtocolError::NotFound)?;

        if session.contains_key(asset_token) {
            return Err(AssetProtocolError::DuplicateAsset);
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

        let removed = session.remove(asset_token);

        if let Some(removed) = removed {
            state.total_bytes = state
                .total_bytes
                .saturating_sub(removed.bytes.len());

            return Ok(true);
        }

        Ok(false)
    }

    pub fn remove_session(
        &self,
        session_token: &str,
    ) -> Result<bool, AssetProtocolError> {
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

        state.total_bytes =
            state.total_bytes.saturating_sub(removed_bytes);

        Ok(true)
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

    pub fn response<B>(
        &self,
        request: &Request<B>,
    ) -> Response<Vec<u8>> {
        match self.resolve_request(request) {
            Ok(asset) => asset_response(&asset),
            Err(AssetProtocolError::NotFound) => {
                empty_response(StatusCode::NOT_FOUND)
            }
            Err(
                AssetProtocolError::InvalidToken
                | AssetProtocolError::UnsupportedContentType
                | AssetProtocolError::AssetTooLarge
                | AssetProtocolError::RegistryBudgetExceeded
                | AssetProtocolError::DuplicateAsset,
            ) => empty_response(StatusCode::BAD_REQUEST),
            Err(AssetProtocolError::Internal) => {
                empty_response(StatusCode::INTERNAL_SERVER_ERROR)
            }
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

        if host == "hybrid-canvas-asset.localhost"
            || host == "localhost"
        {
            if components.next() != Some(ASSET_PROTOCOL_HOST) {
                return Err(AssetProtocolError::InvalidToken);
            }
        } else if host != ASSET_PROTOCOL_HOST {
            return Err(AssetProtocolError::InvalidToken);
        }

        let session_token = components
            .next()
            .ok_or(AssetProtocolError::InvalidToken)?;

        let asset_token = components
            .next()
            .ok_or(AssetProtocolError::InvalidToken)?;

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

    if !value.bytes().all(|byte| {
        byte.is_ascii_alphanumeric()
            || matches!(byte, b'-' | b'_')
    }) {
        return Err(AssetProtocolError::InvalidToken);
    }

    Ok(())
}

fn validate_content_type(
    content_type: &str,
) -> Result<(), AssetProtocolError> {
    match content_type {
        "image/png"
        | "image/jpeg"
        | "image/webp"
        | "image/gif"
        | "application/pdf"
        | "video/mp4"
        | "video/webm"
        | "audio/mpeg"
        | "audio/mp4"
        | "audio/ogg"
        | "audio/wav" => Ok(()),

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
        .unwrap_or_else(|_| {
            empty_response(StatusCode::INTERNAL_SERVER_ERROR)
        })
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

    fn request(uri: &str) -> Request<()> {
        Request::builder()
            .uri(uri)
            .body(())
            .expect("request should be valid")
    }

    #[test]
    fn serves_registered_asset_without_exposing_a_path() {
        let registry = AssetProtocolRegistry::default();

        registry
            .open_session("session-1")
            .expect("session should open");

        registry
            .insert(
                "session-1",
                "asset-1",
                "image/png",
                vec![1, 2, 3, 4],
            )
            .expect("asset should register");

        let response = registry.response(&request(
            "hybrid-canvas-asset://asset/session-1/asset-1",
        ));

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

        registry
            .insert(
                "session-1",
                "asset-1",
                "image/png",
                vec![1, 2, 3],
            )
            .expect("asset should register");

        assert!(
            registry
                .remove_session("session-1")
                .expect("session should close")
        );

        let response = registry.response(&request(
            "hybrid-canvas-asset://asset/session-1/asset-1",
        ));

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[test]
    fn refuses_duplicate_asset_identity() {
        let registry = AssetProtocolRegistry::default();

        registry
            .open_session("session-1")
            .expect("session should open");

        registry
            .insert(
                "session-1",
                "asset-1",
                "image/png",
                vec![1],
            )
            .expect("first asset should register");

        let duplicate = registry.insert(
            "session-1",
            "asset-1",
            "image/png",
            vec![2],
        );

        assert_eq!(
            duplicate,
            Err(AssetProtocolError::DuplicateAsset),
        );
    }

    #[test]
    fn rejects_active_or_unknown_content_types() {
        let registry = AssetProtocolRegistry::default();

        for content_type in [
            "image/svg+xml",
            "text/html",
            "application/javascript",
            "application/octet-stream",
        ] {
            let result = registry.insert(
                "session",
                "asset",
                content_type,
                vec![1],
            );

            assert_eq!(
                result,
                Err(AssetProtocolError::UnsupportedContentType),
            );
        }
    }
}
