# Tests

## Planned structure

```
tests/
├── architecture/          # Dependency boundary & public-api enforcement
├── cross-domain-contract/ # Contract tests spanning multiple domains
├── desktop-e2e/           # Full application integration tests
├── performance/           # Benchmarks with CI budgets
└── security/              # Archive, SVG, plugin, IPC attack surface
```

## Activation phase

Phase 2 (architecture) → Phase 3 (cross-domain, performance) → Phase 4+ (e2e, security)

## Rules

- Architecture tests run on every PR
- Performance tests gate releases
- Security tests run before audit milestones
