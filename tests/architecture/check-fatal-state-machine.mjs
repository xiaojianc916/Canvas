#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
} from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const failures = []

const paths = {
  controller:
    'apps/desktop/src/fatal/fatal-controller.ts',
  runtime:
    'apps/desktop/src/fatal/fatal-runtime.ts',
  collectors:
    'apps/desktop/src/fatal/fatal-collectors.ts',
  preReact:
    'apps/desktop/src/fatal/pre-react-entry.ts',
  host:
    'apps/desktop/src/fatal/FatalErrorHost.tsx',
}

for (const relativePath of Object.values(paths)) {
  if (
    !existsSync(
      path.join(ROOT, relativePath),
    )
  ) {
    failures.push(
      'Missing fatal state-machine file: ' +
        relativePath,
    )
  }
}

if (failures.length === 0) {
  const controller = read(
    paths.controller,
  )

  const runtime = read(
    paths.runtime,
  )

  const collectors = read(
    paths.collectors,
  )

  const preReact = read(
    paths.preReact,
  )

  const host = read(paths.host)

  forbidText(
    controller,
    'window.',
    'Pure fatal controller depends on window.',
  )

  forbidText(
    controller,
    'import.meta',
    'Pure fatal controller depends on Vite.',
  )

  forbidText(
    controller,
    'reactMounted',
    'Pure fatal controller owns presentation state.',
  )

  forbidText(
    controller,
    'addEventListener',
    'Pure fatal controller installs browser listeners.',
  )

  requireText(
    controller,
    'export class FatalIncidentController',
    'FatalIncidentController is not independently constructible.',
  )

  requireText(
    runtime,
    'new FatalIncidentController()',
    'Application fatal singleton is not owned by fatal-runtime.',
  )

  requireText(
    collectors,
    "window.addEventListener(",
    'Browser fatal collectors are not isolated.',
  )

  requireText(
    collectors,
    "if (!(event instanceof ErrorEvent))",
    'Resource errors are not excluded from global fatal handling.',
  )

  requireText(
    preReact,
    'installFatalCollectors()',
    'Pre-React bootstrap does not install fatal collectors.',
  )

  requireText(
    host,
    "from './fatal-runtime'",
    'FatalErrorHost does not use the application fatal runtime.',
  )
}

if (failures.length > 0) {
  console.error(
    [
      'Fatal state-machine architecture checks failed:',
      ...failures.map(
        (failure) => '- ' + failure,
      ),
    ].join('\n'),
  )

  process.exitCode = 1
} else {
  console.log(
    'Fatal state-machine architecture checks passed.',
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

function forbidText(
  source,
  forbidden,
  failure,
) {
  if (source.includes(forbidden)) {
    failures.push(failure)
  }
}
