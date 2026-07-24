#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const failures = []

const requiredFiles = [
  'apps/desktop/src-tauri/src/diagnostics/mod.rs',
  'apps/desktop/src-tauri/src/commands/diagnostics.rs',
  'platforms/desktop-runtime/src/adapters/native-crash-report.ts',
]

for (const relativePath of requiredFiles) {
  if (!existsSync(path.join(ROOT, relativePath))) {
    failures.push('Missing native crash recovery file: ' + relativePath)
  }
}

const app = read('apps/desktop/src-tauri/src/bootstrap/app.rs')

const diagnostics = read('apps/desktop/src-tauri/src/diagnostics/mod.rs')

const exporter = read('apps/desktop/src-tauri/src/ipc/export_bindings.rs')

const renderer = read('apps/desktop/src/main.tsx')

const fatalIncident = read('apps/desktop/src/fatal/fatal-incident.ts')

requireText(
  app,
  'crate::diagnostics::install(app.handle())',
  'Native panic recorder is not installed during Tauri setup.',
)

requireText(app, 'diagnostics_take_previous_crash', 'Native crash IPC command is not registered.')

requireText(diagnostics, 'std::panic::set_hook', 'Native panic hook is missing.')

requireText(
  diagnostics,
  'write_report_atomically',
  'Native crash report is not written atomically.',
)

requireText(diagnostics, 'file.sync_all()', 'Native crash report is not flushed to disk.')

requireText(
  exporter,
  'diagnostics_take_previous_crash',
  'Native crash command is missing from generated IPC bindings.',
)

requireText(
  renderer,
  'takePreviousNativeCrashReport',
  'Renderer startup does not inspect the previous native crash.',
)

requireText(
  renderer,
  'FATAL_PREVIOUS_NATIVE_PROCESS_CRASH',
  'Previous native crashes are not mapped to the fatal controller.',
)

requireText(fatalIncident, "'native-crash'", 'FatalIncidentKind does not include native-crash.')

if (failures.length > 0) {
  console.error(
    [
      'Native crash recovery architecture checks failed:',
      ...failures.map((failure) => '- ' + failure),
    ].join('\n'),
  )

  process.exitCode = 1
} else {
  console.log('Native crash recovery architecture checks passed.')
}

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), 'utf8')
}

function requireText(source, expected, failure) {
  if (!source.includes(expected)) {
    failures.push(failure)
  }
}
