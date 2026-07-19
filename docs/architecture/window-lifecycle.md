# Window Lifecycle

| Window | Created | Shown | Hidden | Destroyed |
|--------|---------|-------|--------|-----------|
| Main | App start | On create | On close → minimize to tray | App quit |
| Settings | First open | On open | On close → dispose | On close |
| Recovery | Only when recovery state exists | Auto-show | On dismiss/complete | On dismiss |

## Rules

- **Main**: always exists for app lifetime. Close = hide (minimize to tray), not destroy.
- **Settings**: lazy-created on first open, destroyed on close. State persisted via settings store.
- **Recovery**: created only if crash/unclean-shutdown detected. Destroyed when recovery completes or user dismisses.

## Window Capabilities

| Window | File I/O | Dialog | Opener | Clipboard | Process |
|--------|----------|--------|--------|-----------|---------|
| Main | ✓ | ✓ | ✓ | ✓ | ✓ |
| Settings | ✗ | ✓ | ✓ | ✗ | ✗ |
| Recovery | ✓ | ✓ | ✗ | ✗ | ✗ |
