#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
} from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const failures = []

const incidentTest =
  'apps/desktop/src/fatal/fatal-incident.test.ts'

const controllerTest =
  'apps/desktop/src/fatal/fatal-controller.test.ts'

const diagnosticBufferTest =
  'foundations/observability/src/diagnostic-buffer.test.ts'

const adr =
  'docs/adr/ADR-005-unified-fatal-incident.md'

for (const relativePath of [
  incidentTest,
  controllerTest,
  diagnosticBufferTest,
  adr,
]) {
  if (
    !existsSync(
      path.join(ROOT, relativePath),
    )
  ) {
    failures.push(
      'Missing fatal contract artifact: ' +
        relativePath,
    )
  }
}

if (failures.length === 0) {
  const incidentSource =
    read(incidentTest)

  const controllerSource =
    read(controllerTest)

  const adrSource =
    read(adr)

  requireText(
    incidentSource,
    'handles circular thrown values',
    'Fatal incident tests do not cover circular thrown values.',
  )

  requireText(
    incidentSource,
    'redacts sensitive context keys',
    'Fatal incident tests do not cover sensitive context.',
  )

  requireText(
    incidentSource,
    'omits absent optional properties',
    'Fatal incident tests do not enforce exact optional properties.',
  )

  requireText(
    incidentSource,
    'freezes recent logs',
    'Fatal incident tests do not enforce log snapshot semantics.',
  )

  requireText(
    controllerSource,
    'keeps the first fatal incident as the primary failure',
    'Fatal controller tests do not enforce first-fatal ownership.',
  )

  requireText(
    controllerSource,
    'deduplicates incidents with the same fingerprint',
    'Fatal controller tests do not enforce deduplication.',
  )

  requireText(
    adrSource,
    'Status: Accepted',
    'Unified fatal incident ADR is not accepted.',
  )

  requireText(
    adrSource,
    'Fatal state is terminal',
    'ADR does not define terminal fatal semantics.',
  )

  requireText(
    adrSource,
    'Expected operational failures remain local',
    'ADR does not separate operational and fatal failures.',
  )
}

if (failures.length > 0) {
  console.error(
    [
      'Fatal contract checks failed:',
      ...failures.map(
        (failure) => '- ' + failure,
      ),
    ].join('\n'),
  )

  process.exitCode = 1
} else {
  console.log(
    'Fatal contract checks passed.',
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
