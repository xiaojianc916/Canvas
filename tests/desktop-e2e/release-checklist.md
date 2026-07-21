# Desktop release acceptance

This checklist covers native interactions that are not honestly exercised by
the browser-only Vite test environment.

## Window chrome

- [ ] Dragging an empty title-bar region moves the native window.
- [ ] Double-clicking the title bar toggles maximize and restore.
- [ ] Minimize sends the window to the taskbar or dock.
- [ ] Close exits immediately when no canvas is dirty.
- [ ] Interactive buttons do not start window dragging.

## Document lifecycle

- [ ] Create a canvas, save it through the native save dialog, close it and reopen it.
- [ ] A dirty canvas requests confirmation before close.
- [ ] Cancel keeps the dirty canvas open.
- [ ] Discard closes without writing unsaved changes.
- [ ] A save failure is visible and does not mark the document clean.
- [ ] Files larger than 32 MiB are rejected.
- [ ] A renderer-supplied path not selected by a native dialog is rejected.

## Recovery

- [ ] Existing destination wins over a stale backup.
- [ ] Missing destination is restored from its backup.
- [ ] Interrupted temporary files are removed during recovery.
- [ ] The restored filename is visible and does not begin with a dot.

## Settings

- [ ] Theme, language, auto-save and canvas settings survive restart.
- [ ] Reset restores Rust and TypeScript defaults consistently.

## Evidence

Record the tested commit, operating system and result in the release PR.
Do not mark desktop release acceptance complete from unit tests alone.
