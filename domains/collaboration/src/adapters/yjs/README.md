# Yjs Adapter (Primary Candidate)

This adapter implements `CollaborationTransport` using Yjs + y-websocket.

**Status**: Primary candidate — **NOT YET VALIDATED**

Requires successful Spike A (see ADR-002 when created) before formal adoption:

- 1,000/10,000 element concurrent editing
- Same-field concurrent modification resolution
- Delete/restore semantics
- Unknown ExtensionElement preservation
- Local Undo integration
- Offline/reconnect behavior
- Schema migration compatibility
- Large transaction handling
- Asset reference sync
- Domain revision alignment

Do not add production code until Spike passes.