# Tooling

## Planned structure

```
tooling/
├── generators/            # Scaffolding (bounded-context, migration, ipc-bindings)
├── dependency-rules/      # Package boundary & layer rule enforcement
├── benchmarks/            # Benchmark runner & result visualization
├── release/               # Release pipeline scripts & changelog
└── config/                # Shared CI/lint/tsconfig base files
```

## Activation phase

Phase 1 (generators, dependency-rules) → Phase 3 (benchmarks) → Phase 4 (release, config)
