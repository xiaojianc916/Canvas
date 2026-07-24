#!/usr/bin/env node

import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { cwd } from 'node:process'

const root = cwd()

const packageJsonPath = path.join(root, 'package.json')
const workflowPath = path.join(root, '.github', 'workflows', 'quality.yml')

const qualityWorkflow = `name: Quality

on:
  pull_request:
  push:
    branches:
      - main
  workflow_dispatch:

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

env:
  CARGO_INCREMENTAL: 0
  CARGO_TERM_COLOR: always

jobs:
  frontend:
    name: Frontend
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 11.15.0
          run_install: false

      - name: Install Node
        uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
          cache: pnpm

      - name: Verify JavaScript toolchain
        shell: bash
        run: |
          set -euo pipefail

          expected_node="$(tr -d '[:space:]' < .node-version)"
          actual_node="$(node --version | sed 's/^v//')"
          actual_pnpm="$(pnpm --version)"

          test "$actual_node" = "$expected_node"
          test "$actual_pnpm" = "11.15.0"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: JavaScript dependency audit
        run: pnpm audit --audit-level high

      - name: Format
        run: pnpm format:check

      - name: Lint
        run: pnpm lint

      - name: Architecture
        run: pnpm test:architecture

      - name: Typecheck
        run: pnpm typecheck

      - name: JavaScript tests
        run: pnpm test:frontend

      - name: Build
        run: pnpm build

  windows-desktop:
    name: Windows Desktop
    runs-on: windows-latest
    timeout-minutes: 45

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 11.15.0
          run_install: false

      - name: Install Node
        uses: actions/setup-node@v4
        with:
          node-version-file: .node-version
          cache: pnpm

      - name: Install Rust
        uses: dtolnay/rust-toolchain@1.88.0
        with:
          components: rustfmt, clippy

      - name: Cache Rust
        uses: Swatinem/rust-cache@v2

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck workspace
        run: pnpm typecheck

      - name: Build desktop frontend
        run: pnpm build

      - name: Check Windows native target
        run: cargo check -p hybrid-canvas-desktop --all-targets --all-features

      - name: Build Windows desktop binary
        run: pnpm --filter @hybrid-canvas/desktop exec tauri build --debug --no-bundle

  rust:
    name: Rust
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@1.88.0
        with:
          components: rustfmt, clippy

      - name: Cache Rust
        uses: Swatinem/rust-cache@v2

      - name: Verify Rust toolchain
        shell: bash
        run: |
          set -euo pipefail

          expected="1.88.0"
          actual="$(rustc --version | awk '{print $2}')"

          test "$actual" = "$expected"

      - name: Format
        run: cargo fmt --check

      - name: Check
        run: cargo check --workspace --all-targets --all-features

      - name: Verify generated IPC bindings
        shell: bash
        run: |
          set -euo pipefail

          cargo run -p hybrid-canvas-desktop --bin export-ipc-bindings
          git diff --exit-code -- platforms/desktop-ipc/src/generated/ipc-bindings.ts

      - name: Clippy
        run: cargo clippy --workspace --all-targets --all-features -- -D warnings

      - name: Tests
        run: cargo test --workspace --all-features

      - name: Dependency policy
        uses: EmbarkStudios/cargo-deny-action@v2
        with:
          command: check
          arguments: --all-features
`

async function ensureExists(filePath) {
  try {
    await access(filePath)
  } catch {
    throw new Error(`找不到文件：${filePath}`)
  }
}

async function updatePackageJson() {
  await ensureExists(packageJsonPath)

  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))

  if (!packageJson.scripts || typeof packageJson.scripts !== 'object') {
    throw new Error('package.json 中不存在 scripts 配置。')
  }

  const command = 'node scripts/quality/run.mjs frontend-test'

  if (packageJson.scripts['test:frontend'] === command) {
    console.log('跳过：package.json 的 test:frontend 已正确配置。')
    return
  }

  packageJson.scripts['test:frontend'] = command

  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')

  console.log('已更新：package.json')
}

async function updateWorkflow() {
  await ensureExists(workflowPath)

  await writeFile(workflowPath, qualityWorkflow, 'utf8')

  console.log('已更新：.github/workflows/quality.yml')
}

async function main() {
  console.log(`仓库根目录：${root}\n`)

  await updatePackageJson()
  await updateWorkflow()

  console.log('\nGitHub Actions CI 已优化。')
  console.log('请继续执行：')
  console.log('pnpm format')
  console.log('pnpm format:check')
  console.log('pnpm test:frontend')
}

main().catch((error) => {
  console.error('\nCI 重构失败：')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})