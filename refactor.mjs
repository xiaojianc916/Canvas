#!/usr/bin/env node

import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()

const PATHS = Object.freeze({
  package: 'package.json',

  incidentTest:
    'apps/desktop/src/fatal/fatal-incident.test.ts',

  adr:
    'docs/adr/ADR-005-unified-fatal-incident.md',

  architectureCheck:
    'tests/architecture/check-fatal-contract-tests.mjs',
})

async function main() {
  await assertRepository()

  await createIncidentContractTests()
  await createArchitectureDecision()
  await createArchitectureCheck()
  await registerArchitectureCheck()

  console.log('')
  console.log(
    'Fatal incident contract tests and ADR added.',
  )
  console.log('')
  console.log('Run:')
  console.log('  pnpm format')
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('  pnpm test:architecture')
}

async function assertRepository() {
  const source = await readFile(
    resolvePath(PATHS.package),
    'utf8',
  )

  const packageJson = JSON.parse(source)

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error(
      'Run this script from the Hybrid Canvas repository root.',
    )
  }
}

async function createIncidentContractTests() {
  await writeText(
    PATHS.incidentTest,
    String.raw`
import {
  clearDiagnosticLogs,
  error as logError,
  info as logInfo,
} from '@hybrid-canvas/foundations-observability'
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import {
  createFatalIncident,
  formatFatalDiagnostic,
} from './fatal-incident'

describe('fatal incident contract', () => {
  beforeEach(() => {
    clearDiagnosticLogs()
  })

  it('creates a stable fingerprint and unique incident identity', () => {
    const input = {
      error: new Error('render failed'),
      kind: 'render' as const,
      phase: 'running' as const,
      code: 'FATAL_REACT_RENDER_ERROR',
    }

    const first =
      createFatalIncident(input)

    const second =
      createFatalIncident(input)

    expect(first.id).not.toBe(second.id)

    expect(first.fingerprint).toBe(
      second.fingerprint,
    )
  })

  it('normalizes string failures', () => {
    const incident =
      createFatalIncident({
        error: 'string failure',
        kind: 'async',
        phase: 'running',
        code: 'FATAL_STRING_FAILURE',
      })

    expect(incident.errorName).toBe(
      'Error',
    )

    expect(
      incident.technicalMessage,
    ).toBe('string failure')
  })

  it('normalizes structured non-Error failures', () => {
    const incident =
      createFatalIncident({
        error: {
          operation: 'load-document',
          reason: 'invalid snapshot',
        },
        kind: 'invariant',
        phase: 'running',
        code:
          'FATAL_STRUCTURED_FAILURE',
      })

    expect(incident.errorName).toBe(
      'UnknownError',
    )

    expect(
      incident.technicalMessage,
    ).toContain('load-document')

    expect(
      incident.technicalMessage,
    ).toContain('invalid snapshot')
  })

  it('handles circular thrown values without throwing again', () => {
    const circular: {
      readonly name: string
      self?: unknown
    } = {
      name: 'circular-failure',
    }

    circular.self = circular

    expect(() => {
      createFatalIncident({
        error: circular,
        kind: 'invariant',
        phase: 'running',
        code:
          'FATAL_CIRCULAR_FAILURE',
      })
    }).not.toThrow()

    const incident =
      createFatalIncident({
        error: circular,
        kind: 'invariant',
        phase: 'running',
        code:
          'FATAL_CIRCULAR_FAILURE',
      })

    expect(
      incident.technicalMessage,
    ).toContain('[Circular]')
  })

  it('redacts sensitive context keys', () => {
    const incident =
      createFatalIncident({
        error: new Error(
          'authentication failed',
        ),
        kind: 'async',
        phase: 'running',
        code:
          'FATAL_AUTHENTICATION_FAILURE',
        context: {
          accessToken:
            'private-access-token',
          password:
            'private-password',
          authorization:
            'Bearer private-bearer-token',
          operation: 'connect',
        },
      })

    expect(
      incident.context.accessToken,
    ).toBe('[REDACTED]')

    expect(
      incident.context.password,
    ).toBe('[REDACTED]')

    expect(
      incident.context.authorization,
    ).toBe('[REDACTED]')

    expect(
      incident.context.operation,
    ).toBe('connect')
  })

  it('redacts bearer values and Windows user directories', () => {
    const error = new Error(
      [
        'Bearer abc.def.private',
        'C:\\Users\\Alice\\Documents\\private.draw',
      ].join(' '),
    )

    const incident =
      createFatalIncident({
        error,
        kind: 'async',
        phase: 'running',
        code:
          'FATAL_REDACTION_TEST',
        source:
          'C:\\Users\\Alice\\project\\main.ts',
      })

    expect(
      incident.technicalMessage,
    ).not.toContain(
      'abc.def.private',
    )

    expect(
      incident.technicalMessage,
    ).not.toContain(
      'C:\\Users\\Alice',
    )

    expect(incident.source).not.toContain(
      'C:\\Users\\Alice',
    )

    expect(
      incident.technicalMessage,
    ).toContain('[REDACTED]')
  })

  it('omits absent optional properties instead of assigning undefined', () => {
    const incident =
      createFatalIncident({
        error: 'failure without stack',
        kind: 'async',
        phase: 'running',
        code:
          'FATAL_OPTIONAL_PROPERTY_TEST',
      })

    expect(
      Object.hasOwn(
        incident,
        'stack',
      ),
    ).toBe(false)

    expect(
      Object.hasOwn(
        incident,
        'componentStack',
      ),
    ).toBe(false)

    expect(
      Object.hasOwn(
        incident,
        'source',
      ),
    ).toBe(false)

    expect(
      Object.hasOwn(
        incident,
        'line',
      ),
    ).toBe(false)

    expect(
      Object.hasOwn(
        incident,
        'column',
      ),
    ).toBe(false)
  })

  it('bounds oversized error messages', () => {
    const incident =
      createFatalIncident({
        error: 'x'.repeat(10_000),
        kind: 'async',
        phase: 'running',
        code:
          'FATAL_OVERSIZED_MESSAGE',
      })

    expect(
      incident.technicalMessage.length,
    ).toBeLessThan(10_000)

    expect(
      incident.technicalMessage,
    ).toContain(
      'Diagnostic value truncated',
    )
  })

  it('freezes recent logs when the incident is created', () => {
    logInfo('before fatal', {
      scope: 'fatal-test',
      operation: 'before',
    })

    const incident =
      createFatalIncident({
        error: new Error('fatal'),
        kind: 'invariant',
        phase: 'running',
        code:
          'FATAL_LOG_SNAPSHOT_TEST',
      })

    const capturedLength =
      incident.recentLogs.length

    logError('after fatal', {
      scope: 'fatal-test',
      operation: 'after',
    })

    expect(
      incident.recentLogs,
    ).toHaveLength(capturedLength)

    expect(
      incident.recentLogs.some(
        (entry) =>
          entry.message ===
          'before fatal',
      ),
    ).toBe(true)

    expect(
      incident.recentLogs.some(
        (entry) =>
          entry.message ===
          'after fatal',
      ),
    ).toBe(false)
  })

  it('includes recent structured logs in copied diagnostics', () => {
    logInfo('document opened', {
      scope: 'document',
      operation: 'open',
      documentId: 'document-1',
    })

    const incident =
      createFatalIncident({
        error: new Error(
          'render failed',
        ),
        kind: 'render',
        phase: 'running',
        code:
          'FATAL_DIAGNOSTIC_LOG_TEST',
      })

    const diagnostic =
      formatFatalDiagnostic(incident)

    expect(diagnostic).toContain(
      '最近的结构化日志',
    )

    expect(diagnostic).toContain(
      'document opened',
    )

    expect(diagnostic).toContain(
      'operation: open',
    )
  })

  it('includes React component stack when supplied', () => {
    const incident =
      createFatalIncident({
        error: new Error(
          'component failed',
        ),
        kind: 'render',
        phase: 'running',
        code:
          'FATAL_COMPONENT_STACK_TEST',
        componentStack:
          '\n    at CanvasEditor\n    at AppShell',
      })

    const diagnostic =
      formatFatalDiagnostic(incident)

    expect(diagnostic).toContain(
      'React Component Stack',
    )

    expect(diagnostic).toContain(
      'CanvasEditor',
    )
  })
})
`,
  )
}

async function createArchitectureDecision() {
  await writeText(
    PATHS.adr,
    [
      '# ADR-005: Unified fatal incident architecture',
      '',
      '- Status: Accepted',
      '- Date: 2026-07-24',
      '- Owners: Desktop application composition root',
      '',
      '## Context',
      '',
      'Hybrid Canvas previously implemented multiple unrelated failure paths:',
      '',
      '1. a static HTML startup card and bootstrap error renderer;',
      '2. an application-level React error boundary;',
      '3. a workspace-level UI error boundary;',
      '4. console-only global error and unhandled-rejection reporting.',
      '',
      'These paths did not share state, diagnostics, recovery semantics or visual',
      'presentation. The workspace boundary also made a failure of the complete editor',
      'surface appear to be a recoverable local feature failure.',
      '',
      'Native Rust process crashes form a separate physical boundary: once the native',
      'process terminates, the WebView cannot render a React error screen.',
      '',
      '## Decision',
      '',
      'Hybrid Canvas uses one fatal incident model and one terminal fatal state.',
      '',
      '### Ownership',
      '',
      '- `fatal-incident.ts` owns normalization and the diagnostic snapshot.',
      '- `FatalIncidentController` owns terminal fatal state and deduplication.',
      '- `fatal-runtime.ts` owns the application singleton.',
      '- `fatal-collectors.ts` adapts browser and Vite failures.',
      '- `FatalErrorBoundary` adapts React render failures.',
      '- `FatalErrorHost` owns the only React global fatal presentation.',
      '- `pre-react-entry.ts` renders the same view model before React is available.',
      '- Rust diagnostics persist native panic reports for the next application launch.',
      '',
      '### Fatal state',
      '',
      'The first distinct fatal incident becomes the primary incident.',
      '',
      'Later distinct incidents are counted and recorded but do not replace the primary',
      'incident. Repeated incidents with the same fingerprint are deduplicated.',
      '',
      'Fatal state is terminal for the current renderer lifetime. It cannot be cleared',
      'by resetting component state. Recovery requires a reload or native restart.',
      '',
      '### Error classes',
      '',
      'The global fatal surface is only for failures where the application cannot',
      'safely continue:',
      '',
      '- bootstrap and runtime construction failure;',
      '- uncaught renderer exception;',
      '- unhandled Promise rejection;',
      '- root React render failure;',
      '- violated application invariant;',
      '- previous native process panic;',
      '- development-server compilation failure.',
      '',
      'Expected operational failures remain local:',
      '',
      '- document open, save and close failures;',
      '- settings failure;',
      '- native-window operation failure;',
      '- import or export validation failure;',
      '- optional feature and plugin failure;',
      '- image, media and font resource loading failure.',
      '',
      '### Diagnostics',
      '',
      'A fatal incident freezes:',
      '',
      '- incident ID and fingerprint;',
      '- error code, kind and lifecycle phase;',
      '- normalized technical message;',
      '- JavaScript and React component stacks when available;',
      '- source location;',
      '- bounded and redacted context;',
      '- recent bounded structured logs;',
      '- runtime and browser information.',
      '',
      'Sensitive keys, credentials, bearer tokens and user-directory components are',
      'redacted before presentation.',
      '',
      'Rust details remain local and cross the IPC boundary only through bounded,',
      'generated DTOs. Native and renderer reports use incident identifiers for',
      'correlation.',
      '',
      '### Presentation',
      '',
      'The fatal screen is a full-window application state, not a card or dialog.',
      '',
      'It uses:',
      '',
      '- one restrained warning icon;',
      '- concise user-facing language;',
      '- incident code and ID;',
      '- reload and copy-diagnostics actions;',
      '- collapsible technical details.',
      '',
      'Normal startup renders no loading card.',
      '',
      '## Rejected alternatives',
      '',
      '- keeping separate startup and runtime error pages;',
      '- resetting an Error Boundary to pretend that fatal state recovered;',
      '- treating the complete workspace as a recoverable feature boundary;',
      '- sending unrestricted Rust errors or filesystem paths to the renderer;',
      '- treating all resource-loading failures as application fatal;',
      '- allowing the fatal UI to depend on the normal workspace component tree;',
      '- maintaining multiple global error stores.',
      '',
      '## Consequences',
      '',
      '### Positive',
      '',
      '- startup, runtime, React, Vite and native recovery use one diagnostic model;',
      '- diagnostics are useful for debugging and bounded for safety;',
      '- global failure behavior is deterministic and testable;',
      '- local operational errors remain local;',
      '- no second canvas or document state model is introduced.',
      '',
      '### Costs',
      '',
      '- native crashes can only be presented on the next launch;',
      '- every new fatal source needs an explicit collector adapter;',
      '- recovery actions require lifecycle-specific testing;',
      '- diagnostic redaction rules must evolve with new data sources.',
      '',
      '## Verification',
      '',
      'The decision is enforced by:',
      '',
      '- fatal incident unit tests;',
      '- fatal controller state-machine tests;',
      '- diagnostic buffer tests;',
      '- native crash recovery tests;',
      '- architecture checks preventing legacy boundaries and loading UI;',
      '- TypeScript strict type checking;',
      '- Rust tests and Clippy.',
      '',
    ].join('\\n'),
  )
}

async function createArchitectureCheck() {
  await writeText(
    PATHS.architectureCheck,
    String.raw`
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
`,
  )
}

async function registerArchitectureCheck() {
  const packagePath =
    resolvePath(PATHS.package)

  const source = await readFile(
    packagePath,
    'utf8',
  )

  const packageJson = JSON.parse(source)

  const command =
    'node tests/architecture/check-fatal-contract-tests.mjs'

  const current =
    packageJson.scripts?.[
      'test:architecture'
    ]

  if (typeof current !== 'string') {
    throw new Error(
      'package.json is missing test:architecture.',
    )
  }

  if (!current.includes(command)) {
    packageJson.scripts[
      'test:architecture'
    ] =
      current +
      ' && ' +
      command
  }

  await writeFile(
    packagePath,
    JSON.stringify(
      packageJson,
      null,
      2,
    ) + '\n',
    'utf8',
  )
}

async function writeText(
  relativePath,
  content,
) {
  const absolutePath =
    resolvePath(relativePath)

  await mkdir(
    path.dirname(absolutePath),
    {
      recursive: true,
    },
  )

  await writeFile(
    absolutePath,
    normalizeContent(content),
    'utf8',
  )

  console.log(
    relativePath + ': written.',
  )
}

function normalizeContent(source) {
  return (
    source
      .replace(/^\n/, '')
      .replace(/\r\n/g, '\n')
      .trimEnd() + '\n'
  )
}

function resolvePath(relativePath) {
  return path.join(
    ROOT,
    relativePath,
  )
}

main().catch((error) => {
  console.error('')
  console.error(
    'Fatal contract test setup failed.',
  )

  console.error(
    error instanceof Error
      ? error.stack ?? error.message
      : error,
  )

  process.exitCode = 1
})