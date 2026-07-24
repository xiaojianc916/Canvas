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

  diagnosticBuffer:
    'foundations/observability/src/diagnostic-buffer.ts',

  diagnosticBufferTest:
    'foundations/observability/src/diagnostic-buffer.test.ts',

  observabilityLog:
    'foundations/observability/src/log.ts',

  observabilityPublicApi:
    'foundations/observability/src/public-api.ts',

  fatalIncident:
    'apps/desktop/src/fatal/fatal-incident.ts',

  architectureCheck:
    'tests/architecture/check-diagnostic-observability.mjs',
})

async function main() {
  await assertRepository()

  await createDiagnosticBuffer()
  await createDiagnosticBufferTests()
  await replaceObservabilityLog()
  await exportDiagnosticBuffer()
  await integrateFatalSnapshot()
  await createArchitectureCheck()
  await registerArchitectureCheck()

  console.log('')
  console.log(
    'Diagnostic observability refactor applied.',
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

async function createDiagnosticBuffer() {
  await writeText(
    PATHS.diagnosticBuffer,
    String.raw`
import type {
  LogContext,
  LogLevel,
} from './log'

export interface DiagnosticLogEntry {
  readonly sequence: number
  readonly timestamp: string
  readonly level: LogLevel
  readonly message: string
  readonly scope?: string
  readonly correlationId?: string
  readonly context: Readonly<Record<string, string>>
}

const DEFAULT_CAPACITY = 200
const MAX_MESSAGE_LENGTH = 2_000
const MAX_CONTEXT_ENTRIES = 32
const MAX_CONTEXT_VALUE_LENGTH = 4_000
const REDACTED = '[REDACTED]'

const SENSITIVE_KEY_PATTERN =
  /token|secret|password|authorization|cookie|license|api[-_]?key|credential/i

const BEARER_PATTERN =
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi

const WINDOWS_USER_PATH_PATTERN =
  /[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/\s]+/gi

const UNIX_USER_PATH_PATTERN =
  /\/(?:Users|home)\/[^/\s]+/gi

const URL_CREDENTIAL_PATTERN =
  /([a-z][a-z0-9+.-]*:\/\/)([^:@/\s]+):([^@/\s]+)@/gi

let capacity = DEFAULT_CAPACITY
let nextSequence = 1
let entries: DiagnosticLogEntry[] = []

export function recordDiagnosticLog(
  level: LogLevel,
  message: string,
  context: LogContext,
  timestamp: string,
): void {
  try {
    const entry: DiagnosticLogEntry = {
      sequence: nextSequence,
      timestamp: normalizeTimestamp(timestamp),
      level,
      message: normalizeText(
        message,
        MAX_MESSAGE_LENGTH,
      ),
      scope: normalizeOptionalText(
        context.scope,
        256,
      ),
      correlationId: normalizeOptionalText(
        context.correlationId,
        256,
      ),
      context: sanitizeContext(context),
    }

    nextSequence += 1
    entries.push(entry)

    if (entries.length > capacity) {
      entries = entries.slice(
        entries.length - capacity,
      )
    }
  } catch (error: unknown) {
    // Observability must never become an application failure source.
    emergencyConsoleError(
      'Failed to record diagnostic log entry',
      error,
    )
  }
}

export function getRecentLogEntries(
  limit = capacity,
): readonly DiagnosticLogEntry[] {
  const normalizedLimit = Math.max(
    0,
    Math.min(
      Math.floor(limit),
      capacity,
    ),
  )

  return entries
    .slice(
      Math.max(
        0,
        entries.length - normalizedLimit,
      ),
    )
    .map(cloneEntry)
}

export function clearDiagnosticLogs(): void {
  entries = []
}

export function configureDiagnosticBuffer(
  options: {
    readonly capacity?: number
  },
): void {
  if (options.capacity === undefined) {
    return
  }

  if (
    !Number.isInteger(options.capacity) ||
    options.capacity < 1 ||
    options.capacity > 2_000
  ) {
    throw new RangeError(
      'Diagnostic buffer capacity must be an integer between 1 and 2000.',
    )
  }

  capacity = options.capacity

  if (entries.length > capacity) {
    entries = entries.slice(
      entries.length - capacity,
    )
  }
}

export function formatDiagnosticLogs(
  logEntries: readonly DiagnosticLogEntry[],
): string {
  return logEntries
    .map((entry) => {
      const prefix = [
        entry.timestamp,
        entry.level.toUpperCase(),
        entry.scope
          ? '[' + entry.scope + ']'
          : undefined,
        '#' + String(entry.sequence),
      ]
        .filter(
          (value): value is string =>
            typeof value === 'string',
        )
        .join(' ')

      const contextEntries = Object.entries(
        entry.context,
      )

      if (contextEntries.length === 0) {
        return prefix + ' ' + entry.message
      }

      return [
        prefix + ' ' + entry.message,
        ...contextEntries.map(
          ([key, value]) =>
            '  ' + key + ': ' + value,
        ),
      ].join('\n')
    })
    .join('\n')
}

function sanitizeContext(
  context: LogContext,
): Readonly<Record<string, string>> {
  const sanitizedEntries = Object.entries(context)
    .filter(
      ([key]) =>
        key !== 'scope' &&
        key !== 'correlationId',
    )
    .slice(0, MAX_CONTEXT_ENTRIES)
    .map(([key, value]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return [key, REDACTED] as const
      }

      return [
        key,
        normalizeText(
          serializeUnknown(value),
          MAX_CONTEXT_VALUE_LENGTH,
        ),
      ] as const
    })

  return Object.fromEntries(sanitizedEntries)
}

function serializeUnknown(
  value: unknown,
): string {
  if (value === undefined) {
    return 'undefined'
  }

  if (value === null) {
    return 'null'
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value)
  }

  if (typeof value === 'symbol') {
    return value.description
      ? 'Symbol(' + value.description + ')'
      : 'Symbol()'
  }

  if (typeof value === 'function') {
    return (
      '[Function ' +
      (value.name || 'anonymous') +
      ']'
    )
  }

  const seen = new WeakSet<object>()

  try {
    return JSON.stringify(
      value,
      (_key, candidate: unknown) => {
        if (candidate instanceof Error) {
          return serializeError(candidate)
        }

        if (
          typeof candidate === 'object' &&
          candidate !== null
        ) {
          if (seen.has(candidate)) {
            return '[Circular]'
          }

          seen.add(candidate)
        }

        if (typeof candidate === 'bigint') {
          return String(candidate)
        }

        if (typeof candidate === 'symbol') {
          return String(candidate)
        }

        if (typeof candidate === 'function') {
          return (
            '[Function ' +
            (candidate.name || 'anonymous') +
            ']'
          )
        }

        return candidate
      },
      2,
    )
  } catch {
    try {
      return String(value)
    } catch {
      return '[Unserializable value]'
    }
  }
}

function serializeError(
  error: Error,
): Readonly<Record<string, unknown>> {
  const cause =
    'cause' in error
      ? error.cause
      : undefined

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause:
      cause instanceof Error
        ? {
            name: cause.name,
            message: cause.message,
            stack: cause.stack,
          }
        : cause,
  }
}

function cloneEntry(
  entry: DiagnosticLogEntry,
): DiagnosticLogEntry {
  return {
    ...entry,
    context: {
      ...entry.context,
    },
  }
}

function normalizeTimestamp(
  timestamp: string,
): string {
  const parsed = Date.parse(timestamp)

  if (Number.isNaN(parsed)) {
    return new Date().toISOString()
  }

  return new Date(parsed).toISOString()
}

function normalizeOptionalText(
  value: string | undefined,
  maximumLength: number,
): string | undefined {
  if (!value) {
    return undefined
  }

  return normalizeText(
    value,
    maximumLength,
  )
}

function normalizeText(
  value: string,
  maximumLength: number,
): string {
  const redacted = redactText(value)

  if (redacted.length <= maximumLength) {
    return redacted
  }

  return (
    redacted.slice(0, maximumLength) +
    '\n[Diagnostic value truncated]'
  )
}

function redactText(value: string): string {
  return value
    .replace(
      BEARER_PATTERN,
      'Bearer ' + REDACTED,
    )
    .replace(
      WINDOWS_USER_PATH_PATTERN,
      'C:\\Users\\' + REDACTED,
    )
    .replace(
      UNIX_USER_PATH_PATTERN,
      '/Users/' + REDACTED,
    )
    .replace(
      URL_CREDENTIAL_PATTERN,
      '$1' + REDACTED + ':' + REDACTED + '@',
    )
}

function emergencyConsoleError(
  message: string,
  error: unknown,
): void {
  try {
    console.error(
      '[Hybrid Canvas Observability] ' +
        message,
      error,
    )
  } catch {
    // There is deliberately no further fallback.
  }
}
`,
  )
}

async function createDiagnosticBufferTests() {
  await writeText(
    PATHS.diagnosticBufferTest,
    String.raw`
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import {
  clearDiagnosticLogs,
  configureDiagnosticBuffer,
  formatDiagnosticLogs,
  getRecentLogEntries,
  recordDiagnosticLog,
} from './diagnostic-buffer'

describe('diagnostic buffer', () => {
  beforeEach(() => {
    clearDiagnosticLogs()
    configureDiagnosticBuffer({
      capacity: 200,
    })
  })

  it('records structured log entries', () => {
    recordDiagnosticLog(
      'error',
      'canvas save failed',
      {
        scope: 'workspace',
        operation: 'save',
        documentId: 'document-1',
      },
      '2026-07-24T00:00:00.000Z',
    )

    expect(getRecentLogEntries()).toEqual([
      expect.objectContaining({
        level: 'error',
        message: 'canvas save failed',
        scope: 'workspace',
        timestamp:
          '2026-07-24T00:00:00.000Z',
        context: {
          operation: 'save',
          documentId: 'document-1',
        },
      }),
    ])
  })

  it('keeps only the newest bounded entries', () => {
    configureDiagnosticBuffer({
      capacity: 2,
    })

    recordDiagnosticLog(
      'info',
      'one',
      {},
      new Date().toISOString(),
    )

    recordDiagnosticLog(
      'info',
      'two',
      {},
      new Date().toISOString(),
    )

    recordDiagnosticLog(
      'info',
      'three',
      {},
      new Date().toISOString(),
    )

    expect(
      getRecentLogEntries().map(
        (entry) => entry.message,
      ),
    ).toEqual(['two', 'three'])
  })

  it('redacts sensitive keys and bearer tokens', () => {
    recordDiagnosticLog(
      'error',
      'request failed',
      {
        accessToken: 'private-token',
        authorization:
          'Bearer very-private-token',
        endpoint:
          'https://user:password@example.com',
      },
      new Date().toISOString(),
    )

    const [entry] = getRecentLogEntries()

    expect(entry?.context.accessToken).toBe(
      '[REDACTED]',
    )

    expect(
      entry?.context.authorization,
    ).toBe('[REDACTED]')

    expect(entry?.context.endpoint).not.toContain(
      'password',
    )
  })

  it('serializes Error and circular values safely', () => {
    const circular: {
      self?: unknown
    } = {}

    circular.self = circular

    recordDiagnosticLog(
      'error',
      'unexpected failure',
      {
        cause: new Error('broken'),
        circular,
      },
      new Date().toISOString(),
    )

    const [entry] = getRecentLogEntries()

    expect(entry?.context.cause).toContain(
      'broken',
    )

    expect(entry?.context.circular).toContain(
      '[Circular]',
    )
  })

  it('returns cloned immutable snapshots', () => {
    recordDiagnosticLog(
      'info',
      'snapshot',
      {
        operation: 'test',
      },
      new Date().toISOString(),
    )

    const first = getRecentLogEntries()
    const second = getRecentLogEntries()

    expect(first).not.toBe(second)
    expect(first[0]?.context).not.toBe(
      second[0]?.context,
    )
  })

  it('formats readable diagnostic output', () => {
    recordDiagnosticLog(
      'warn',
      'retrying operation',
      {
        scope: 'document',
        attempt: 2,
      },
      '2026-07-24T00:00:00.000Z',
    )

    const formatted = formatDiagnosticLogs(
      getRecentLogEntries(),
    )

    expect(formatted).toContain(
      '2026-07-24T00:00:00.000Z WARN [document]',
    )

    expect(formatted).toContain(
      'attempt: 2',
    )
  })
})
`,
  )
}

async function replaceObservabilityLog() {
  await writeText(
    PATHS.observabilityLog,
    String.raw`
import {
  recordDiagnosticLog,
} from './diagnostic-buffer'
import type { MetricRecorder } from './metric'
import {
  getMetricsRecorder,
  setMetricsRecorder,
} from './metric'

export type LogLevel =
  | 'trace'
  | 'debug'
  | 'info'
  | 'warn'
  | 'error'

export interface LogContext {
  readonly scope?: string
  readonly correlationId?: string
  readonly [key: string]: unknown
}

export type LogSink = (
  level: LogLevel,
  message: string,
  context: LogContext,
  timestamp: string,
) => void

let sink: LogSink = defaultConsoleSink

function defaultConsoleSink(
  level: LogLevel,
  message: string,
  context: LogContext,
  timestamp: string,
): void {
  const prefix = context.scope
    ? '[' + context.scope + ']'
    : ''

  const formatted = [
    timestamp,
    level.toUpperCase(),
    prefix,
    message,
  ]
    .filter(Boolean)
    .join(' ')

  switch (level) {
    case 'trace':
    case 'debug':
      console.debug(formatted, context)
      return

    case 'info':
      console.info(formatted, context)
      return

    case 'warn':
      console.warn(formatted, context)
      return

    case 'error':
      console.error(formatted, context)
      return
  }
}

export function setLogSink(
  next: LogSink,
): void {
  sink = next
}

export function log(
  level: LogLevel,
  message: string,
  context: LogContext = {},
): void {
  const timestamp = new Date().toISOString()

  recordDiagnosticLog(
    level,
    message,
    context,
    timestamp,
  )

  try {
    sink(
      level,
      message,
      context,
      timestamp,
    )
  } catch (error: unknown) {
    // Logging must not recursively become a fatal application error.
    try {
      console.error(
        '[Hybrid Canvas Observability] Log sink failed',
        {
          level,
          message,
          error,
        },
      )
    } catch {
      // No further fallback is safe.
    }
  }
}

export function trace(
  message: string,
  context?: LogContext,
): void {
  log('trace', message, context)
}

export function debug(
  message: string,
  context?: LogContext,
): void {
  log('debug', message, context)
}

export function info(
  message: string,
  context?: LogContext,
): void {
  log('info', message, context)
}

export function warn(
  message: string,
  context?: LogContext,
): void {
  log('warn', message, context)
}

export function error(
  message: string,
  context?: LogContext,
): void {
  log('error', message, context)
}

export function initObservability(
  options?: {
    readonly appName?: string
    readonly sink?: LogSink
    readonly metrics?: MetricRecorder
  },
): void {
  if (options?.sink) {
    setLogSink(options.sink)
  }

  if (options?.metrics) {
    setMetricsRecorder(options.metrics)
  } else {
    getMetricsRecorder()
  }

  info('observability initialized', {
    scope: 'observability',
    appName:
      options?.appName ??
      'hybrid-canvas',
  })
}
`,
  )
}

async function exportDiagnosticBuffer() {
  await transformFile(
    PATHS.observabilityPublicApi,
    (source) => {
      if (
        source.includes(
          "from './diagnostic-buffer'",
        )
      ) {
        return source
      }

      const addition = [
        '',
        'export type {',
        '  DiagnosticLogEntry,',
        "} from './diagnostic-buffer'",
        '',
        'export {',
        '  clearDiagnosticLogs,',
        '  configureDiagnosticBuffer,',
        '  formatDiagnosticLogs,',
        '  getRecentLogEntries,',
        "} from './diagnostic-buffer'",
        '',
      ].join('\n')

      return source.trimEnd() + addition
    },
  )
}

async function integrateFatalSnapshot() {
  await transformFile(
    PATHS.fatalIncident,
    (source) => {
      let next = source

      if (
        !next.includes(
          "from '@hybrid-canvas/foundations-observability'",
        )
      ) {
        next = [
          "import {",
          '  formatDiagnosticLogs,',
          '  getRecentLogEntries,',
          "  type DiagnosticLogEntry,",
          "} from '@hybrid-canvas/foundations-observability'",
          '',
          next,
        ].join('\n')
      }

      if (
        !next.includes(
          'readonly recentLogs: readonly DiagnosticLogEntry[]',
        )
      ) {
        next = next.replace(
          '  readonly context: Readonly<Record<string, string>>\n}',
          [
            '  readonly context: Readonly<Record<string, string>>',
            '  readonly recentLogs: readonly DiagnosticLogEntry[]',
            '}',
          ].join('\n'),
        )
      }

      if (
        !next.includes(
          'const recentLogs = getRecentLogEntries',
        )
      ) {
        next = next.replace(
          '  const occurredAt = new Date().toISOString()\n',
          [
            '  const occurredAt = new Date().toISOString()',
            '  const recentLogs = getRecentLogEntries(100)',
            '',
          ].join('\n'),
        )
      }

      if (
        !next.includes(
          'recentLogs,',
        )
      ) {
        next = next.replace(
          '    context: sanitizeContext(input.context),\n',
          [
            '    context: sanitizeContext(input.context),',
            '    recentLogs,',
            '',
          ].join('\n'),
        )
      }

      if (
        !next.includes(
          'formatDiagnosticLogs(incident.recentLogs)',
        )
      ) {
        const marker =
          "    incident.componentStack\n      ? '\\nReact Component Stack:\\n' +\n        incident.componentStack\n      : undefined,\n"

        if (!next.includes(marker)) {
          throw new Error(
            'Could not locate the fatal diagnostic component stack section.',
          )
        }

        const replacement = [
          marker.trimEnd(),
          '    incident.recentLogs.length > 0',
          "      ? '\\n最近的结构化日志:\\n' +",
          '        formatDiagnosticLogs(incident.recentLogs)',
          '      : undefined,',
          '',
        ].join('\n')

        next = next.replace(
          marker,
          replacement,
        )
      }

      return next
    },
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
`,
  )
}

async function registerArchitectureCheck() {
  await transformFile(
    PATHS.package,
    (source) => {
      const packageJson = JSON.parse(source)

      const command =
        'node tests/architecture/check-diagnostic-observability.mjs'

      const current =
        packageJson.scripts?.['test:architecture']

      if (typeof current !== 'string') {
        throw new Error(
          'package.json is missing test:architecture.',
        )
      }

      if (!current.includes(command)) {
        packageJson.scripts['test:architecture'] =
          current + ' && ' + command
      }

      return (
        JSON.stringify(packageJson, null, 2) +
        '\n'
      )
    },
  )
}

async function transformFile(
  relativePath,
  transform,
) {
  const absolutePath = resolvePath(relativePath)
  const source = await readFile(
    absolutePath,
    'utf8',
  )

  const nextSource = transform(source)

  if (nextSource === source) {
    console.log(
      relativePath + ': no changes required.',
    )
    return
  }

  await writeFile(
    absolutePath,
    normalizeContent(nextSource),
    'utf8',
  )

  console.log(relativePath + ': updated.')
}

async function writeText(
  relativePath,
  content,
) {
  const absolutePath = resolvePath(relativePath)

  await mkdir(path.dirname(absolutePath), {
    recursive: true,
  })

  await writeFile(
    absolutePath,
    normalizeContent(content),
    'utf8',
  )

  console.log(relativePath + ': written.')
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
  return path.join(ROOT, relativePath)
}

main().catch((error) => {
  console.error('')
  console.error(
    'Diagnostic observability refactor failed.',
  )
  console.error(
    error instanceof Error
      ? error.stack ?? error.message
      : error,
  )
  process.exitCode = 1
})