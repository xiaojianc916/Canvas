# Frontend Architecture Refactor Progress

## Scope

This refactor preserves:

- tldraw Editor and TLStore as the canonical canvas runtime
- the existing scaffold-first package strategy
- the current .draw file contract
- the editor extension model
- platform-independent editor and document packages

## Progress

| Phase | Status | Notes |
| --- | --- | --- |
| 0. Architecture review | Complete | Runtime and dependency model established |
| 1. Runtime correctness | Complete | External-store snapshots, listener cleanup and environment exposure |
| 2. UI boundaries | Complete after verification | Desktop chrome separated from Workspace; shared confirmation dialog |
| 3. Workflow and errors | Complete after verification | Close orchestration moved to CanvasWorkflow; observability added |
| 4. Dependency and performance baselines | In progress | Import graph and Vite bundle manifest |
| 5. Compatibility and release verification | Pending | File fixtures, native failure recovery and final performance budgets |

## Architectural invariants

1. TLStore records are the only persistent canvas source of truth.
2. Canvas document writes go through Editor or Store transactions.
3. Workspace does not expose Tauri or native-window semantics.
4. Presentation does not orchestrate document save promises.
5. Cross-package imports use package exports.
6. Reserved scaffolds remain registered in architecture.scaffolds.json.
7. Performance optimizations require a recorded baseline.

## Remaining work

- Establish .draw round-trip fixtures and corrupt-file cases.
- Verify atomic save and crash recovery in the Rust layer.
- Record initial bundle, startup and multi-canvas memory baselines.
- Add explicit performance budgets after the first stable baseline.
- Complete settings persistence wiring.
- Run desktop E2E coverage for title-bar drag, close and recovery paths.
