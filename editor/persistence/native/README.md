# File Native

## Planned responsibility

Reliable file I/O: atomic writes, container format, locking, watcher, and recovery.

## Activation phase

Phase 1 (atomic_write) → Phase 2 (container, watcher) → Phase 3 (lock, recovery)

## Owned modules

- `atomic_write.rs` — serialize → temp → fsync → rename
- `container.rs` — .draw container archive
- `lock.rs` — concurrent-write detection
- `recovery.rs` — crash recovery from journal
- `watcher.rs` — filesystem modification watcher
- `error.rs` — typed error enum
