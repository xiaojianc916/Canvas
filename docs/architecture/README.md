# Architecture Overview

## Layer Dependencies

```
Presentation → Application → Domain
Application → Ports
Adapters implements Ports
Composition → Application + Adapters
Foundations → (no deps)
```

## Key Rules

- **Domain** — pure business logic, zero framework imports, zero side effects
- **Application** — use-case orchestration, depends on Domain and Ports only
- **Ports** — outbound interface contracts defined in the domain layer
- **Adapters** — implementations of Ports, live in platforms or adapters/ subdirs
- **Composition** — wires Application + Adapters together, lives in apps/ or composition/

Strict prohibition:

- Domain → Apps
- Domain → Desktop IPC
- Application → Adapter (injects via Ports)
- Platform → Apps
- Native domain crate → Tauri
