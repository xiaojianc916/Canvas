# Plugin Native

## Planned responsibility

Plugin package integrity, signature verification, and trust store management.

## Activation phase

Phase 2 (package, integrity) → Phase 3 (signature, trust_store)

## Owned modules

- `package.rs` — package structure validation
- `signature.rs` — digital signature verification
- `integrity.rs` — hash-based integrity checks
- `trust_store.rs` — publisher key management
- `error.rs` — typed error enum
