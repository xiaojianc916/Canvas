#!/usr/bin/env node

import {
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

  collectors:
    'apps/desktop/src/fatal/fatal-collectors.ts',

  boundary:
    'apps/desktop/src/fatal/FatalErrorBoundary.tsx',

  incident:
    'apps/desktop/src/fatal/fatal-incident.ts',

  main:
    'apps/desktop/src/main.tsx',
})

async function main() {
  await assertRepository()

  await replaceController()
  await replaceCollectors()
  await replaceBoundary()
  await repairFatalIncident()
  await repairNativeCrashBootstrap()
  await verifyStrictTypePatterns()

  console.log('')
  console.log(
    'Fatal strict TypeScript errors repaired.',
  )
  console.log('')
  console.log('Run:')
  console.log('  pnpm format')
  console.log('  pnpm typecheck')
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

async function replaceController() {
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
 * Owns only the terminal fatal-incident state.
 *
 * Browser, React, Vite and native failure sources are adapted elsewhere.
 */
export class FatalIncidentController {
  private snapshot: FatalSnapshot =
    HEALTHY_SNAPSHOT

  private readonly listeners =
    new Set<FatalListener>()

  private readonly fingerprints =
    new Set<string>()

  private readonly createIncident:
    FatalIncidentFactory

  constructor(
    createIncident:
      FatalIncidentFactory =
      createFatalIncident,
  ) {
    this.createIncident = createIncident
  }

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

async function replaceCollectors() {
  await writeText(
    PATHS.collectors,
    String.raw`
import type {
  CreateFatalIncidentInput,
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
 * Resource element failures are deliberately ignored. An image, font or media
 * loading failure is not automatically an application-fatal incident.
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

  const capturedError =
    event['error'] ??
    event.message ??
    'Unhandled window error'

  const input: CreateFatalIncidentInput = {
    error: capturedError,
    kind: reactMounted
      ? 'async'
      : 'bootstrap',
    phase: currentPhase(),
    code: reactMounted
      ? 'FATAL_UNHANDLED_WINDOW_ERROR'
      : 'FATAL_BOOTSTRAP_WINDOW_ERROR',
    ...optionalProperty(
      'source',
      nonEmptyString(event.filename),
    ),
    ...optionalProperty(
      'line',
      positiveNumber(event.lineno),
    ),
    ...optionalProperty(
      'column',
      positiveNumber(event.colno),
    ),
    context: {
      collector: 'window-error',
      eventType: event.type,
    },
  }

  const incident =
    fatalIncidentController.report(input)

  emergencyLogIncident(incident)
}

function handleUnhandledRejection(
  event: PromiseRejectionEvent,
): void {
  const reactMounted =
    isReactFatalHostMounted()

  const input: CreateFatalIncidentInput = {
    error: event.reason,
    kind: reactMounted
      ? 'async'
      : 'bootstrap',
    phase: currentPhase(),
    code: reactMounted
      ? 'FATAL_UNHANDLED_PROMISE_REJECTION'
      : 'FATAL_BOOTSTRAP_PROMISE_REJECTION',
    context: {
      collector: 'unhandled-rejection',
      eventType: event.type,
    },
  }

  const incident =
    fatalIncidentController.report(input)

  emergencyLogIncident(incident)
}

function handleViteDiagnostic(
  payload: unknown,
): void {
  const viteError =
    parseViteError(payload)

  const input: CreateFatalIncidentInput = {
    error: viteError.error,
    kind: 'vite',
    phase: currentPhase(),
    code:
      'FATAL_VITE_DEVELOPMENT_ERROR',
    ...optionalProperty(
      'source',
      viteError.source,
    ),
    ...optionalProperty(
      'line',
      viteError.line,
    ),
    ...optionalProperty(
      'column',
      viteError.column,
    ),
    context: viteError.context,
  }

  const incident =
    fatalIncidentController.report(input)

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
        collector: 'vite-diagnostic',
        diagnosticSource: 'vite',
      },
    }
  }

  const payloadError =
    payload['error']

  const rawError = isRecord(payloadError)
    ? payloadError
    : payload

  const locationValue =
    rawError['location']

  const rawLocation = isRecord(
    locationValue,
  )
    ? locationValue
    : undefined

  const error = createError(
    readString(rawError, 'name') ??
      'ViteError',
    readString(rawError, 'message') ??
      readString(rawError, 'msg') ??
      'Unknown Vite development error',
    readString(rawError, 'stack'),
  )

  const source =
    readString(rawLocation, 'file') ??
    readString(rawError, 'id')

  const line =
    readNumber(rawLocation, 'line')

  const column =
    readNumber(rawLocation, 'column')

  return {
    error,
    ...optionalProperty(
      'source',
      source,
    ),
    ...optionalProperty(
      'line',
      line,
    ),
    ...optionalProperty(
      'column',
      column,
    ),
    context: {
      collector: 'vite-diagnostic',
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

  if (stack !== undefined) {
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
    const serialized =
      JSON.stringify(value)

    return serialized ?? String(value)
  } catch {
    try {
      return String(value)
    } catch {
      return '[Unserializable Vite error]'
    }
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

function nonEmptyString(
  value: string,
): string | undefined {
  return value.length > 0
    ? value
    : undefined
}

function positiveNumber(
  value: number,
): number | undefined {
  return value > 0
    ? value
    : undefined
}

function optionalProperty<
  Key extends string,
  Value,
>(
  key: Key,
  value: Value | undefined,
): Partial<Record<Key, Value>> {
  if (value === undefined) {
    return {}
  }

  return {
    [key]: value,
  } as Record<Key, Value>
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

async function replaceBoundary() {
  await writeText(
    PATHS.boundary,
    String.raw`
import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react'
import { fatalIncidentController } from './fatal-runtime'

export interface FatalErrorBoundaryProps {
  readonly children: ReactNode
}

interface FatalErrorBoundaryState {
  readonly crashed: boolean
}

export class FatalErrorBoundary extends Component<
  FatalErrorBoundaryProps,
  FatalErrorBoundaryState
> {
  override state: FatalErrorBoundaryState = {
    crashed: false,
  }

  static getDerivedStateFromError(): FatalErrorBoundaryState {
    return {
      crashed: true,
    }
  }

  override componentDidCatch(
    error: Error,
    info: ErrorInfo,
  ): void {
    const componentStack =
      info.componentStack ?? undefined

    fatalIncidentController.report({
      error,
      kind: 'render',
      phase: 'running',
      code: 'FATAL_REACT_RENDER_ERROR',
      ...(componentStack === undefined
        ? {}
        : {
            componentStack,
          }),
      context: {
        collector: 'react-error-boundary',
      },
    })
  }

  override render(): ReactNode {
    if (this.state.crashed) {
      // FatalErrorHost owns the only global fatal UI.
      return null
    }

    return this.props.children
  }
}
`,
  )
}

async function repairFatalIncident() {
  await transformFile(
    PATHS.incident,
    (source) => {
      let next = source

      next = next.replace(
        [
          '    errorName: normalized.name,',
          '    stack: normalized.stack,',
          '    componentStack:',
          '      normalizeOptionalText(',
          '        input.componentStack ?? undefined,',
          '        MAX_STACK_LENGTH,',
          '      ),',
          '    source: normalizeOptionalText(input.source, MAX_MESSAGE_LENGTH),',
          '    line: input.line,',
          '    column: input.column,',
          '    occurredAt,',
        ].join('\n'),
        [
          '    errorName: normalized.name,',
          '    ...optionalProperty(',
          "      'stack',",
          '      normalized.stack,',
          '    ),',
          '    ...optionalProperty(',
          "      'componentStack',",
          '      normalizeOptionalText(',
          '        input.componentStack ?? undefined,',
          '        MAX_STACK_LENGTH,',
          '      ),',
          '    ),',
          '    ...optionalProperty(',
          "      'source',",
          '      normalizeOptionalText(',
          '        input.source,',
          '        MAX_MESSAGE_LENGTH,',
          '      ),',
          '    ),',
          '    ...optionalProperty(',
          "      'line',",
          '      input.line,',
          '    ),',
          '    ...optionalProperty(',
          "      'column',",
          '      input.column,',
          '    ),',
          '    occurredAt,',
        ].join('\n'),
      )

      next = next.replace(
        [
          '      stack: normalizeOptionalText(',
          '        value.stack,',
          '        MAX_STACK_LENGTH,',
          '      ),',
        ].join('\n'),
        [
          '      ...optionalProperty(',
          "        'stack',",
          '        normalizeOptionalText(',
          '          value.stack,',
          '          MAX_STACK_LENGTH,',
          '        ),',
          '      ),',
        ].join('\n'),
      )

      if (
        !next.includes(
          'function optionalProperty<',
        )
      ) {
        const marker =
          'function normalizeOptionalText('

        if (!next.includes(marker)) {
          throw new Error(
            'Could not find the fatal incident helper insertion point.',
          )
        }

        const helper = [
          'function optionalProperty<',
          '  Key extends string,',
          '  Value,',
          '>(',
          '  key: Key,',
          '  value: Value | undefined,',
          '): Partial<Record<Key, Value>> {',
          '  if (value === undefined) {',
          '    return {}',
          '  }',
          '',
          '  return {',
          '    [key]: value,',
          '  } as Record<Key, Value>',
          '}',
          '',
        ].join('\n')

        next = next.replace(
          marker,
          helper + marker,
        )
      }

      return next
    },
  )
}

async function repairNativeCrashBootstrap() {
  const absolutePath =
    resolvePath(PATHS.main)

  let source = await readFile(
    absolutePath,
    'utf8',
  )

  if (
    !source.includes(
      'FATAL_PREVIOUS_NATIVE_PROCESS_CRASH',
    )
  ) {
    console.log(
      PATHS.main +
        ': no Native crash bootstrap repair required.',
    )
    return
  }

  source = source.replace(
    '    source: report.location ?? undefined,\n',
    [
      '    ...(report.location === null',
      '      ? {}',
      '      : {',
      '          source: report.location,',
      '        }),',
      '',
    ].join('\n'),
  )

  await writeFile(
    absolutePath,
    normalizeContent(source),
    'utf8',
  )

  console.log(
    PATHS.main + ': updated.',
  )
}

async function verifyStrictTypePatterns() {
  const files = [
    PATHS.controller,
    PATHS.collectors,
    PATHS.boundary,
    PATHS.incident,
  ]

  const failures = []

  for (const relativePath of files) {
    const source = await readFile(
      resolvePath(relativePath),
      'utf8',
    )

    if (
      /constructor\s*\(\s*(?:public|private|protected|readonly)/m.test(
        source,
      )
    ) {
      failures.push(
        relativePath +
          ': constructor parameter property remains',
      )
    }
  }

  const collectors = await readFile(
    resolvePath(PATHS.collectors),
    'utf8',
  )

  const forbiddenCollectorPatterns = [
    'source: viteError.source,',
    'line: viteError.line,',
    'column: viteError.column,',
    'event.error',
    'rawError.location',
    'payload.error',
  ]

  for (
    const pattern of
    forbiddenCollectorPatterns
  ) {
    if (collectors.includes(pattern)) {
      failures.push(
        PATHS.collectors +
          ': forbidden strict-type pattern remains: ' +
          pattern,
      )
    }
  }

  const boundary = await readFile(
    resolvePath(PATHS.boundary),
    'utf8',
  )

  if (
    boundary.includes(
      'componentStack: info.componentStack ?? undefined',
    )
  ) {
    failures.push(
      PATHS.boundary +
        ': componentStack still explicitly receives undefined',
    )
  }

  if (failures.length > 0) {
    throw new Error(
      [
        'Strict TypeScript verification failed:',
        ...failures.map(
          (failure) => '  - ' + failure,
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
  await writeFile(
    resolvePath(relativePath),
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
    'Fatal strict TypeScript repair failed.',
  )
  console.error(
    error instanceof Error
      ? error.stack ?? error.message
      : error,
  )

  process.exitCode = 1
})