#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
} from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const failures = []

const bufferPath =
  'foundations/observability/src/diagnostic-buffer.ts'

const logPath =
  'foundations/observability/src/log.ts'

const publicApiPath =
  'foundations/observability/src/public-api.ts'

const fatalIncidentPath =
  'apps/desktop/src/fatal/fatal-incident.ts'

for (const relativePath of [
  bufferPath,
  logPath,
  publicApiPath,
  fatalIncidentPath,
]) {
  if (!existsSync(path.join(ROOT, relativePath))) {
    failures.push(
      'Missing diagnostic observability file: ' +
        relativePath,
    )
  }
}

if (failures.length === 0) {
  const buffer = read(bufferPath)
  const log = read(logPath)
  const publicApi = read(publicApiPath)
  const fatalIncident = read(fatalIncidentPath)

  requireText(
    buffer,
    'DEFAULT_CAPACITY',
    'Diagnostic logs are not bounded.',
  )

  requireText(
    buffer,
    'SENSITIVE_KEY_PATTERN',
    'Diagnostic context has no sensitive-key redaction.',
  )

  requireText(
    buffer,
    'WeakSet<object>',
    'Diagnostic serialization has no circular-reference protection.',
  )

  requireText(
    log,
    'recordDiagnosticLog(',
    'The main log path does not record diagnostic entries.',
  )

  requireText(
    log,
    'Log sink failed',
    'Log sink failures are not isolated.',
  )

  requireText(
    publicApi,
    'getRecentLogEntries',
    'Diagnostic log snapshots are not exported.',
  )

  requireText(
    fatalIncident,
    'recentLogs',
    'Fatal incidents do not freeze recent logs.',
  )

  requireText(
    fatalIncident,
    'formatDiagnosticLogs(incident.recentLogs)',
    'Fatal diagnostic text does not contain recent logs.',
  )
}

if (failures.length > 0) {
  console.error(
    [
      'Diagnostic observability architecture checks failed:',
      ...failures.map(
        (failure) => '- ' + failure,
      ),
    ].join('\n'),
  )

  process.exitCode = 1
} else {
  console.log(
    'Diagnostic observability architecture checks passed.',
  )
}

function read(relativePath) {
  return readFileSync(
    path.join(ROOT, relativePath),
    'utf8',
  )
}

function requireText(
  source,
  expected,
  failure,
) {
  if (!source.includes(expected)) {
    failures.push(failure)
  }
}
