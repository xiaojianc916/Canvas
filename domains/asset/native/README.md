# Asset Native

## Planned responsibility

Content-addressed asset storage with integrity verification.

## Activation phase

Phase 2 (content_address, store) → Phase 3 (reader, writer) → Phase 4 (integrity verification)

## Owned modules

- `store.rs` — content-addressed read/write
- `content_address.rs` — hash computation and addressing
- `integrity.rs` — verification against stored hash
- `error.rs` — typed error enum

## Does NOT own

- Browser cache adapter (TS, domain/asset)
- Asset domain types (TS, domain/asset)
- Tauri IPC commands (src-tauri/commands/asset.rs)
