# Architecture checks

This directory contains durable architecture checks only.

The checker verifies stable engineering boundaries:

- foundations do not depend on higher-level packages;
- editor code remains independent of desktop application and platform packages;
- features do not import Tauri or desktop runtime packages directly;
- platform packages do not depend on application entry packages;
- cross-package imports use public package exports instead of `src/` deep imports;
- relative imports do not cross top-level package boundaries.

Feature-specific migration assertions belong in focused tests while a migration is active.
They must be removed once the migration is complete.
