# Cross-domain contract tests

Tests that verify contracts spanning more than one architectural package.

## Document lifecycle

`document-lifecycle/` verifies the contract between:

- `editor/core`
- `editor/document`
- persistence and close planning

Business source files contain a short comment pointing back to the relevant tests.

Run:

```bash
pnpm --filter @hybrid-canvas/test-cross-domain-contract test
```
