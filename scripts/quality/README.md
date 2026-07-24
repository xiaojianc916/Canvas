# Quality scripts

This directory contains permanent, cross-platform quality runners.

## Principles

- Scripts use Node.js ESM (`.mjs`) and built-in modules only.
- Scripts must run even when TypeScript typechecking fails.
- Scripts must not encode temporary refactor rules or feature-specific migration details.
- One-off migration scripts belong outside version control and must be deleted after use.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm typecheck` | Runs workspace TypeScript checks through Turbo |
| `pnpm test:frontend` | Runs JavaScript and TypeScript package tests through Turbo |
| `pnpm test` | Runs frontend tests and Rust workspace tests |
| `pnpm test:architecture` | Enforces durable package-boundary rules |
| `pnpm check` | Runs the normal local quality gate |
| `pnpm verify:release` | Runs release-level validation |

## Why scripts remain `.mjs`

Quality runners intentionally remain executable ESM rather than TypeScript:

- no `tsx` or `ts-node` runtime dependency;
- no bootstrap dependency on a working TypeScript compiler;
- deterministic execution in Windows and Linux CI;
- scripts are small orchestration tools, not application modules.