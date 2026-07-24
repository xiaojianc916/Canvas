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

  controller:
    'apps/desktop/src/fatal/fatal-controller.ts',

  runtime:
    'apps/desktop/src/fatal/fatal-runtime.ts',

  collectors:
    'apps/desktop/src/fatal/fatal-collectors.ts',

  controllerTest:
    'apps/desktop/src/fatal/fatal-controller.test.ts',

  preReact:
    'apps/desktop/src/fatal/pre-react-entry.ts',

  boundary:
    'apps/desktop/src/fatal/FatalErrorBoundary.tsx',

  host:
    'apps/desktop/src/fatal/FatalErrorHost.tsx',

  reactRoot:
    'apps/desktop/src/bootstrap/react-root.tsx',

  main:
    'apps/desktop/src/main.tsx',

  architectureCheck:
    'tests/architecture/check-fatal-state-machine.mjs',
})

async function main() {
  await assertRepository()

  await replacePureController()
  await createFatalRuntime()
  await createFatalCollectors()
  await createControllerTests()
  await updatePreReactEntry()
  await updateRuntimeImports()
  await createArchitectureCheck()
  await registerArchitectureCheck()
  await verifyNoLegacyImports()

  console.log('')
  console.log(
    'Fatal state machine refactor applied.',
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

async function replacePureController() {
  await writeText(
    PATHS.controller,
    String.raw`
import {
  createFatalIncident,
  type CreateFatalIncidentInput,
  type FatalIncident,
} from './fatal-incident'

export type FatalSnapshot =
  | {
      readonly status: 'healthy'
    }
  | {
      readonly status: 'fatal'
      readonly incident: FatalIncident
      readonly additionalIncidentCount: number
    }

export type FatalListener = () => void

export type FatalIncidentFactory = (
  input: CreateFatalIncidentInput,
) => FatalIncident

const HEALTHY_SNAPSHOT: FatalSnapshot =
  Object.freeze({
    status: 'healthy',
  })

/**
 * Owns the terminal fatal-incident state.
 *
 * This class deliberately has no browser, React, Vite, logging or native
 * dependencies. Error collectors adapt external failures into
 * CreateFatalIncidentInput before reporting them here.
 */
export class FatalIncidentController {
  private snapshot: FatalSnapshot =
    HEALTHY_SNAPSHOT

  private readonly listeners =
    new Set<FatalListener>()

  private readonly fingerprints =
    new Set<string>()

  constructor(
    private readonly createIncident:
      FatalIncidentFactory =
      createFatalIncident,
  ) {}

  readonly getSnapshot =
    (): FatalSnapshot => {
      return this.snapshot
    }

  readonly subscribe = (
    listener: FatalListener,
  ): (() => void) => {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  report(
    input: CreateFatalIncidentInput,
  ): FatalIncident {
    const incident =
      this.createIncident(input)

    if (
      this.fingerprints.has(
        incident.fingerprint,
      )
    ) {
      if (this.snapshot.status === 'fatal') {
        return this.snapshot.incident
      }

      return incident
    }

    this.fingerprints.add(
      incident.fingerprint,
    )

    if (this.snapshot.status === 'fatal') {
      this.snapshot = Object.freeze({
        status: 'fatal',
        incident: this.snapshot.incident,
        additionalIncidentCount:
          this.snapshot
            .additionalIncidentCount + 1,
      })

      this.emit()

      return this.snapshot.incident
    }

    this.snapshot = Object.freeze({
      status: 'fatal',
      incident,
      additionalIncidentCount: 0,
    })

    this.emit()

    return incident
  }

  private emit(): void {
    const listeners = [
      ...this.listeners,
    ]

    for (const listener of listeners) {
      try {
        listener()
      } catch (error: unknown) {
        emergencyReportListenerFailure(error)
      }
    }
  }
}

function emergencyReportListenerFailure(
  error: unknown,
): void {
  try {
    console.error(
      '[Hybrid Canvas] Fatal state listener failed',
      error,
    )
  } catch {
    // No further fallback is safe.
  }
}
`,
  )
}

async function createFatalRuntime() {
  await writeText(
    PATHS.runtime,
    String.raw`
import { FatalIncidentController } from './fatal-controller'

export const fatalIncidentController =
  new FatalIncidentController()

let reactFatalHostMounted = false

export function markReactFatalHostMounted(): void {
  reactFatalHostMounted = true
}

export function isReactFatalHostMounted(): boolean {
  return reactFatalHostMounted
}
`,
  )
}

async function createFatalCollectors() {
  await writeText(
    PATHS.collectors,
    String.raw`
import type {
  FatalIncidentPhase,
} from './fatal-incident'
import {
  fatalIncidentController,
  isReactFatalHostMounted,
} from './fatal-runtime'

interface ViteHotContext {
  readonly on: (
    event: string,
    listener: (payload: unknown) => void,
  ) => void
}

interface ParsedViteError {
  readonly error: Error
  readonly source?: string
  readonly line?: number
  readonly column?: number
  readonly context:
    Readonly<Record<string, unknown>>
}

let installed = false

/**
 * Installs process-lifetime browser collectors.
 *
 * Resource element failures are intentionally ignored here because an image,
 * font or media load failure is not automatically an application-fatal error.
 */
export function installFatalCollectors(): void {
  if (installed) {
    return
  }

  installed = true

  window.addEventListener(
    'error',
    handleWindowError,
    true,
  )

  window.addEventListener(
    'unhandledrejection',
    handleUnhandledRejection,
  )

  const hot = (
    import.meta as ImportMeta & {
      readonly hot?: ViteHotContext
    }
  ).hot

  hot?.on(
    'hybrid-canvas:diagnostic',
    handleViteDiagnostic,
  )
}

function handleWindowError(
  event: Event,
): void {
  if (!(event instanceof ErrorEvent)) {
    return
  }

  const reactMounted =
    isReactFatalHostMounted()

  const error =
    event.error ??
    event.message ??
    'Unhandled window error'

  const incident =
    fatalIncidentController.report({
      error,
      kind: reactMounted
        ? 'async'
        : 'bootstrap',
      phase: currentPhase(),
      code: reactMounted
        ? 'FATAL_UNHANDLED_WINDOW_ERROR'
        : 'FATAL_BOOTSTRAP_WINDOW_ERROR',
      source:
        event.filename || undefined,
      line:
        event.lineno || undefined,
      column:
        event.colno || undefined,
      context: {
        collector:
          'window-error',
        eventType:
          event.type,
      },
    })

  emergencyLogIncident(incident)
}

function handleUnhandledRejection(
  event: PromiseRejectionEvent,
): void {
  const reactMounted =
    isReactFatalHostMounted()

  const incident =
    fatalIncidentController.report({
      error: event.reason,
      kind: reactMounted
        ? 'async'
        : 'bootstrap',
      phase: currentPhase(),
      code: reactMounted
        ? 'FATAL_UNHANDLED_PROMISE_REJECTION'
        : 'FATAL_BOOTSTRAP_PROMISE_REJECTION',
      context: {
        collector:
          'unhandled-rejection',
        eventType:
          event.type,
      },
    })

  emergencyLogIncident(incident)
}

function handleViteDiagnostic(
  payload: unknown,
): void {
  const viteError =
    parseViteError(payload)

  const incident =
    fatalIncidentController.report({
      error: viteError.error,
      kind: 'vite',
      phase: currentPhase(),
      code:
        'FATAL_VITE_DEVELOPMENT_ERROR',
      source: viteError.source,
      line: viteError.line,
      column: viteError.column,
      context: viteError.context,
    })

  emergencyLogIncident(incident)
}

function currentPhase(): FatalIncidentPhase {
  return isReactFatalHostMounted()
    ? 'running'
    : 'react-mount'
}

function parseViteError(
  payload: unknown,
): ParsedViteError {
  if (!isRecord(payload)) {
    return {
      error: createError(
        'ViteError',
        stringifyUnknown(payload),
      ),
      context: {
        diagnosticSource: 'vite',
      },
    }
  }

  const rawError = isRecord(payload.error)
    ? payload.error
    : payload

  const rawLocation = isRecord(
    rawError.location,
  )
    ? rawError.location
    : undefined

  const error = createError(
    readString(rawError, 'name') ??
      'ViteError',
    readString(rawError, 'message') ??
      readString(rawError, 'msg') ??
      'Unknown Vite development error',
    readString(rawError, 'stack'),
  )

  return {
    error,
    source:
      readString(
        rawLocation,
        'file',
      ) ??
      readString(rawError, 'id'),
    line:
      readNumber(
        rawLocation,
        'line',
      ),
    column:
      readNumber(
        rawLocation,
        'column',
      ),
    context: {
      collector:
        'vite-diagnostic',
      diagnosticSource:
        readString(
          payload,
          'source',
        ) ?? 'vite',
      plugin:
        readString(
          rawError,
          'plugin',
        ) ?? '',
      moduleId:
        readString(
          rawError,
          'id',
        ) ?? '',
      frame:
        readString(
          rawError,
          'frame',
        ) ?? '',
      pluginCode:
        readString(
          rawError,
          'pluginCode',
        ) ?? '',
    },
  }
}

function createError(
  name: string,
  message: string,
  stack?: string,
): Error {
  const error = new Error(message)
  error.name = name

  if (stack) {
    error.stack = stack
  }

  return error
}

function stringifyUnknown(
  value: unknown,
): string {
  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null
  )
}

function readString(
  record:
    | Record<string, unknown>
    | undefined,
  property: string,
): string | undefined {
  const value = record?.[property]

  return typeof value === 'string'
    ? value
    : undefined
}

function readNumber(
  record:
    | Record<string, unknown>
    | undefined,
  property: string,
): number | undefined {
  const value = record?.[property]

  return typeof value === 'number'
    ? value
    : undefined
}

function emergencyLogIncident(
  incident: {
    readonly id: string
    readonly code: string
    readonly technicalMessage: string
  },
): void {
  try {
    console.error(
      '[Hybrid Canvas Fatal Incident]',
      incident,
    )
  } catch {
    // The fatal UI remains the primary output.
  }
}
`,
  )
}

async function createControllerTests() {
  await writeText(
    PATHS.controllerTest,
    String.raw`
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  FatalIncidentController,
  type FatalIncidentFactory,
} from './fatal-controller'
import type {
  CreateFatalIncidentInput,
  FatalIncident,
} from './fatal-incident'

describe('FatalIncidentController', () => {
  it('starts healthy', () => {
    const controller =
      createController()

    expect(
      controller.getSnapshot(),
    ).toEqual({
      status: 'healthy',
    })
  })

  it('stores the first fatal incident', () => {
    const controller =
      createController()

    const incident = controller.report(
      createInput('FIRST'),
    )

    expect(
      controller.getSnapshot(),
    ).toEqual({
      status: 'fatal',
      incident,
      additionalIncidentCount: 0,
    })
  })

  it('keeps the first fatal incident as the primary failure', () => {
    const controller =
      createController()

    const first = controller.report(
      createInput('FIRST'),
    )

    controller.report(
      createInput('SECOND'),
    )

    expect(
      controller.getSnapshot(),
    ).toEqual({
      status: 'fatal',
      incident: first,
      additionalIncidentCount: 1,
    })
  })

  it('deduplicates incidents with the same fingerprint', () => {
    const controller =
      createController()

    const first = controller.report(
      createInput('DUPLICATE'),
    )

    const second = controller.report(
      createInput('DUPLICATE'),
    )

    expect(second).toBe(first)

    expect(
      controller.getSnapshot(),
    ).toEqual({
      status: 'fatal',
      incident: first,
      additionalIncidentCount: 0,
    })
  })

  it('notifies subscribers after state transitions', () => {
    const controller =
      createController()

    const listener = vi.fn()

    const unsubscribe =
      controller.subscribe(listener)

    controller.report(
      createInput('FIRST'),
    )

    expect(listener).toHaveBeenCalledTimes(1)

    controller.report(
      createInput('SECOND'),
    )

    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()

    controller.report(
      createInput('THIRD'),
    )

    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('isolates a failing subscriber', () => {
    const controller =
      createController()

    const healthyListener = vi.fn()

    controller.subscribe(() => {
      throw new Error(
        'listener failed',
      )
    })

    controller.subscribe(
      healthyListener,
    )

    expect(() => {
      controller.report(
        createInput('FIRST'),
      )
    }).not.toThrow()

    expect(
      healthyListener,
    ).toHaveBeenCalledTimes(1)
  })

  it('keeps getSnapshot stable until a transition occurs', () => {
    const controller =
      createController()

    const healthyOne =
      controller.getSnapshot()

    const healthyTwo =
      controller.getSnapshot()

    expect(healthyOne).toBe(healthyTwo)

    controller.report(
      createInput('FIRST'),
    )

    const fatalOne =
      controller.getSnapshot()

    const fatalTwo =
      controller.getSnapshot()

    expect(fatalOne).toBe(fatalTwo)
    expect(fatalOne).not.toBe(
      healthyOne,
    )
  })
})

function createController(): FatalIncidentController {
  let sequence = 0

  const factory: FatalIncidentFactory = (
    input,
  ) => {
    sequence += 1

    return createIncident(
      input,
      sequence,
    )
  }

  return new FatalIncidentController(
    factory,
  )
}

function createInput(
  code: string,
): CreateFatalIncidentInput {
  return {
    error: new Error(code),
    kind: 'invariant',
    phase: 'running',
    code,
  }
}

function createIncident(
  input: CreateFatalIncidentInput,
  sequence: number,
): FatalIncident {
  const code =
    input.code ?? 'UNKNOWN'

  return {
    id: 'incident-' + String(sequence),
    fingerprint: code,
    severity: 'fatal',
    kind: input.kind,
    phase: input.phase,
    code,
    title: 'Fatal',
    message: 'Fatal',
    technicalMessage: code,
    errorName: 'Error',
    occurredAt:
      '2026-07-24T00:00:00.000Z',
    pageUrl: 'http://localhost',
    userAgent: 'test',
    recovery: 'reload',
    context: {},
    recentLogs: [],
  }
}
`,
  )
}

async function updatePreReactEntry() {
  await transformFile(
    PATHS.preReact,
    (source) => {
      let next = source

      next = next.replace(
        "import { fatalIncidentController } from './fatal-controller'",
        [
          "import { installFatalCollectors } from './fatal-collectors'",
          'import {',
          '  fatalIncidentController,',
          '  isReactFatalHostMounted,',
          "} from './fatal-runtime'",
        ].join('\n'),
      )

      next = next.replace(
        'fatalIncidentController.installCollectors()',
        'installFatalCollectors()',
      )

      next = next.replaceAll(
        'fatalIncidentController.isReactMounted()',
        'isReactFatalHostMounted()',
      )

      return next
    },
  )
}

async function updateRuntimeImports() {
  await transformFile(
    PATHS.boundary,
    replaceControllerImport,
  )

  await transformFile(
    PATHS.host,
    replaceControllerImport,
  )

  await transformFile(
    PATHS.main,
    replaceControllerImport,
  )

  await transformFile(
    PATHS.reactRoot,
    (source) => {
      let next =
        replaceControllerImport(source)

      next = next.replace(
        'fatalIncidentController.markReactMounted()',
        'markReactFatalHostMounted()',
      )

      if (
        next.includes(
          'markReactFatalHostMounted()',
        ) &&
        !next.includes(
          '  markReactFatalHostMounted,',
        )
      ) {
        next = next.replace(
          /import\s+\{\s*fatalIncidentController,?\s*\}\s+from\s+['"]\.\.\/fatal\/fatal-runtime['"]/,
          [
            'import {',
            '  fatalIncidentController,',
            '  markReactFatalHostMounted,',
            "} from '../fatal/fatal-runtime'",
          ].join('\n'),
        )
      }

      return next
    },
  )
}

function replaceControllerImport(source) {
  return source
    .replaceAll(
      "from './fatal-controller'",
      "from './fatal-runtime'",
    )
    .replaceAll(
      "from '../fatal/fatal-controller'",
      "from '../fatal/fatal-runtime'",
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
`,
  )
}

async function registerArchitectureCheck() {
  await transformFile(
    PATHS.package,
    (source) => {
      const packageJson =
        JSON.parse(source)

      const command =
        'node tests/architecture/check-fatal-state-machine.mjs'

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

      return (
        JSON.stringify(
          packageJson,
          null,
          2,
        ) + '\n'
      )
    },
  )
}

async function verifyNoLegacyImports() {
  const files = [
    PATHS.preReact,
    PATHS.boundary,
    PATHS.host,
    PATHS.reactRoot,
    PATHS.main,
  ]

  const failures = []

  for (const relativePath of files) {
    const source = await readFile(
      resolvePath(relativePath),
      'utf8',
    )

    if (
      source.includes(
        "from './fatal-controller'",
      ) ||
      source.includes(
        "from '../fatal/fatal-controller'",
      )
    ) {
      failures.push(relativePath)
    }
  }

  if (failures.length > 0) {
    throw new Error(
      [
        'Application code still imports the pure controller module as the singleton:',
        ...failures.map(
          (file) => '  - ' + file,
        ),
      ].join('\n'),
    )
  }
}

async function transformFile(
  relativePath,
  transform,
) {
  const absolutePath =
    resolvePath(relativePath)

  const source = await readFile(
    absolutePath,
    'utf8',
  )

  const nextSource =
    transform(source)

  if (nextSource === source) {
    console.log(
      relativePath +
        ': no changes required.',
    )
    return
  }

  await writeFile(
    absolutePath,
    normalizeContent(nextSource),
    'utf8',
  )

  console.log(
    relativePath + ': updated.',
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
    'Fatal state machine refactor failed.',
  )
  console.error(
    error instanceof Error
      ? error.stack ??
        error.message
      : error,
  )

  process.exitCode = 1
})