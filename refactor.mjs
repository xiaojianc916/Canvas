import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const workflowPath = resolve(".github/workflows/quality.yml");

let workflow = await readFile(workflowPath, "utf8");

const replacements = [
  [
    `    runs-on: ubuntu-latest`,
    `    runs-on: windows-latest`,
  ],
  [
    `      - name: Verify JavaScript toolchain
        shell: bash
        run: |
          set -euo pipefail

          expected_node="$(tr -d '[:space:]' < .node-version)"
          actual_node="$(node --version | sed 's/^v//')"
          actual_pnpm="$(pnpm --version)"

          test "$actual_node" = "$expected_node"
          test "$actual_pnpm" = "11.15.0"`,
    `      - name: Verify JavaScript toolchain
        shell: pwsh
        run: |
          $ErrorActionPreference = "Stop"

          $expectedNode = (Get-Content .node-version -Raw).Trim()
          $actualNode = (node --version).Trim().TrimStart("v")
          $actualPnpm = (pnpm --version).Trim()

          if ($actualNode -ne $expectedNode) {
            throw "Expected Node.js $expectedNode, got $actualNode"
          }

          if ($actualPnpm -ne "11.15.0") {
            throw "Expected pnpm 11.15.0, got $actualPnpm"
          }`,
  ],
  [
    `      - name: Verify Rust toolchain
        shell: bash
        run: |
          set -euo pipefail

          expected="1.88.0"
          actual="$(rustc --version | awk '{print $2}')"

          test "$actual" = "$expected"`,
    `      - name: Verify Rust toolchain
        shell: pwsh
        run: |
          $ErrorActionPreference = "Stop"

          $expected = "1.88.0"
          $actual = ((rustc --version).Trim() -split "\\s+")[1]

          if ($actual -ne $expected) {
            throw "Expected Rust $expected, got $actual"
          }`,
  ],
  [
    `      - name: Verify generated IPC bindings
        shell: bash
        run: |
          set -euo pipefail

          cargo run -p hybrid-canvas-desktop --bin export-ipc-bindings
          git diff --exit-code -- platforms/desktop-ipc/src/generated/ipc-bindings.ts`,
    `      - name: Verify generated IPC bindings
        shell: pwsh
        run: |
          $ErrorActionPreference = "Stop"

          cargo run -p hybrid-canvas-desktop --bin export-ipc-bindings
          git diff --exit-code -- platforms/desktop-ipc/src/generated/ipc-bindings.ts

          if ($LASTEXITCODE -ne 0) {
            throw "Generated IPC bindings are out of date."
          }`,
  ],
];

for (const [from, to] of replacements) {
  if (!workflow.includes(from)) {
    throw new Error(
      `Expected workflow section was not found. Aborting without modifying ${workflowPath}.`,
    );
  }

  workflow = workflow.replaceAll(from, to);
}

if (workflow.includes("ubuntu-latest") || workflow.includes("shell: bash")) {
  throw new Error(
    "Migration validation failed: Linux runner or Bash shell remains in the quality workflow.",
  );
}

await writeFile(workflowPath, workflow, "utf8");

console.log(`Updated ${workflowPath}: all quality jobs now run on Windows.`);