#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import process from 'node:process'

const generatedBindingsPath = 'platforms/desktop-ipc/src/generated/ipc-bindings.ts'

const runtimeAdapterPath = 'platforms/desktop-runtime/src/adapters/file/file-system.ts'

const exporterPath = 'apps/desktop/src-tauri/src/ipc/export_bindings.rs'

const requiredGeneratedCommands = [
  'documentOpen',
  'documentSaveAs',
  'documentSave',
  'documentClose',
]

const requiredRustCommands = [
  'document_open',
  'document_save_as',
  'document_save',
  'document_close',
]

const violations = []

const [generatedBindings, runtimeAdapter, exporter] = await Promise.all([
  readFile(generatedBindingsPath, 'utf8'),
  readFile(runtimeAdapterPath, 'utf8'),
  readFile(exporterPath, 'utf8'),
])

if (/export const commands = \{\s*\}/.test(generatedBindings)) {
  violations.push(
    'IPC bindings commands is empty; run cargo run -p hybrid-canvas-desktop --bin export-ipc-bindings',
  )
}

for (const command of requiredGeneratedCommands) {
  if (!new RegExp('async\\s+' + command + '\\s*\\(').test(generatedBindings)) {
    violations.push('Generated IPC bindings is missing commands.' + command)
  }
}

for (const command of requiredRustCommands) {
  if (!new RegExp('collect_commands!\\[[\\s\\S]*' + command).test(exporter)) {
    violations.push('Rust IPC exporter is missing ' + command + ' in collect_commands!')
  }
}

if (!/from '@hybrid-canvas\/desktop-ipc\/generated\/ipc-bindings'/.test(runtimeAdapter)) {
  violations.push('Desktop document adapter must import generated IPC bindings')
}

if (!/\bcommands\.documentOpen\(\)/.test(runtimeAdapter)) {
  violations.push('Desktop document adapter must call generated commands.documentOpen')
}

for (const command of requiredGeneratedCommands.slice(1)) {
  if (!new RegExp('\\bcommands\\.' + command + '\\(').test(runtimeAdapter)) {
    violations.push('Desktop document adapter must call generated commands.' + command)
  }
}

if (/\binvoke(?:<[^>]*>)?\s*\(\s*['"]document_/.test(runtimeAdapter)) {
  violations.push('Desktop document adapter must not handwrite document_* invoke command strings')
}

if (violations.length > 0) {
  console.error(
    'Document IPC architecture check failed:\n' + violations.map((item) => '- ' + item).join('\n'),
  )

  process.exitCode = 1
} else {
  console.log('Document IPC architecture check passed.')
}
