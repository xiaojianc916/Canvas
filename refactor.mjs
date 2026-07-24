#!/usr/bin/env node

import {
  access,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()

const PATHS = Object.freeze({
  rootPackage: 'package.json',
  desktopIndex: 'apps/desktop/index.html',
  main: 'apps/desktop/src/main.tsx',
  reactRoot: 'apps/desktop/src/bootstrap/react-root.tsx',
  appShell: 'apps/desktop/src/presentation/AppShell.tsx',

  oldApplicationBoundary:
    'apps/desktop/src/bootstrap/ApplicationErrorBoundary.tsx',
  oldBootstrapFallback:
    'apps/desktop/src/bootstrap/bootstrap-fallback.ts',
  oldUiBoundary:
    'apps/desktop/src/presentation/boundaries/UiErrorBoundary.tsx',

  fatalIncident:
    'apps/desktop/src/fatal/fatal-incident.ts',
  fatalController:
    'apps/desktop/src/fatal/fatal-controller.ts',
  preReactEntry:
    'apps/desktop/src/fatal/pre-react-entry.ts',
  fatalScreen:
    'apps/desktop/src/fatal/FatalErrorScreen.tsx',
  fatalBoundary:
    'apps/desktop/src/fatal/FatalErrorBoundary.tsx',
  fatalHost:
    'apps/desktop/src/fatal/FatalErrorHost.tsx',

  architectureCheck:
    'tests/architecture/check-fatal-error-architecture.mjs',
})

async function main() {
  await assertRepository()
  await createFatalInfrastructure()
  await replaceDesktopBootstrap()
  await replaceReactRoot()
  await removeWorkspaceRootBoundary()
  await removeLegacyImplementations()
  await createArchitectureCheck()
  await registerArchitectureCheck()

  console.log('')
  console.log('Fatal error architecture refactor applied.')
  console.log('')
  console.log('Next steps:')
  console.log('  pnpm format')
  console.log('  pnpm test:architecture')
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('')
  console.log(
    'Review the generated diff before committing. Native Rust panic recovery is intentionally a separate phase.',
  )
}

async function assertRepository() {
  const packagePath = resolvePath(PATHS.rootPackage)
  const source = await readFile(packagePath, 'utf8')
  const packageJson = JSON.parse(source)

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error(
      'Run this script from the Hybrid Canvas repository root.',
    )
  }

  const required = [
    PATHS.desktopIndex,
    PATHS.main,
    PATHS.reactRoot,
    PATHS.appShell,
  ]

  for (const relativePath of required) {
    try {
      await access(resolvePath(relativePath))
    } catch {
      throw new Error(
        'Required repository file is missing: ' + relativePath,
      )
    }
  }
}

async function createFatalInfrastructure() {
  await writeText(
    PATHS.fatalIncident,
    String.raw`
export type FatalIncidentKind =
  | 'bootstrap'
  | 'render'
  | 'async'
  | 'invariant'
  | 'vite'
  | 'webview'

export type FatalIncidentPhase =
  | 'preflight'
  | 'runtime-construction'
  | 'react-mount'
  | 'running'
  | 'shutdown'

export type FatalRecovery =
  | 'reload'
  | 'restart'
  | 'none'

export interface FatalIncident {
  readonly id: string
  readonly fingerprint: string
  readonly severity: 'fatal'
  readonly kind: FatalIncidentKind
  readonly phase: FatalIncidentPhase
  readonly code: string
  readonly title: string
  readonly message: string
  readonly technicalMessage: string
  readonly errorName: string
  readonly stack?: string
  readonly componentStack?: string
  readonly source?: string
  readonly line?: number
  readonly column?: number
  readonly occurredAt: string
  readonly pageUrl: string
  readonly userAgent: string
  readonly recovery: FatalRecovery
  readonly context: Readonly<Record<string, string>>
}

export interface CreateFatalIncidentInput {
  readonly error: unknown
  readonly kind: FatalIncidentKind
  readonly phase: FatalIncidentPhase
  readonly code?: string
  readonly title?: string
  readonly componentStack?: string | null
  readonly source?: string
  readonly line?: number
  readonly column?: number
  readonly recovery?: FatalRecovery
  readonly context?: Readonly<Record<string, unknown>>
}

interface NormalizedError {
  readonly name: string
  readonly message: string
  readonly stack?: string
}

const REDACTED = '[REDACTED]'
const MAX_MESSAGE_LENGTH = 4_000
const MAX_STACK_LENGTH = 32_000
const MAX_CONTEXT_VALUE_LENGTH = 2_000
const MAX_CONTEXT_ENTRIES = 32

const SENSITIVE_KEY_PATTERN =
  /token|secret|password|authorization|cookie|license|api[-_]?key/i

const BEARER_PATTERN =
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi

const WINDOWS_USER_PATH_PATTERN =
  /[A-Za-z]:\\Users\\[^\\\s]+/gi

const UNIX_USER_PATH_PATTERN =
  /\/(?:Users|home)\/[^/\s]+/gi

export function createFatalIncident(
  input: CreateFatalIncidentInput,
): FatalIncident {
  const normalized = normalizeUnknownError(input.error)
  const occurredAt = new Date().toISOString()
  const code =
    input.code ??
    createDefaultCode(input.kind, input.phase)

  const technicalMessage =
    normalized.message || 'Unknown fatal error'

  const fingerprint = [
    input.kind,
    input.phase,
    code,
    normalized.name,
    technicalMessage,
    input.source ?? '',
  ].join('|')

  return {
    id: createIncidentId(),
    fingerprint,
    severity: 'fatal',
    kind: input.kind,
    phase: input.phase,
    code,
    title: input.title ?? '应用遇到严重错误',
    message:
      'Hybrid Canvas 无法安全地继续当前运行。请复制诊断信息后重新加载应用。',
    technicalMessage,
    errorName: normalized.name,
    stack: normalized.stack,
    componentStack:
      normalizeOptionalText(
        input.componentStack ?? undefined,
        MAX_STACK_LENGTH,
      ),
    source: normalizeOptionalText(input.source, MAX_MESSAGE_LENGTH),
    line: input.line,
    column: input.column,
    occurredAt,
    pageUrl: redactText(
      globalThis.location?.href ?? 'unknown',
    ),
    userAgent: redactText(
      globalThis.navigator?.userAgent ?? 'unknown',
    ),
    recovery: input.recovery ?? 'reload',
    context: sanitizeContext(input.context),
  }
}

export function formatFatalDiagnostic(
  incident: FatalIncident,
): string {
  const contextEntries = Object.entries(incident.context)

  return [
    'Hybrid Canvas Fatal Incident',
    '',
    'Incident ID: ' + incident.id,
    '时间: ' + incident.occurredAt,
    '错误码: ' + incident.code,
    '错误类型: ' + incident.errorName,
    '错误种类: ' + incident.kind,
    '运行阶段: ' + incident.phase,
    '错误信息: ' + incident.technicalMessage,
    incident.source
      ? '来源: ' + incident.source
      : undefined,
    typeof incident.line === 'number'
      ? '行: ' + String(incident.line)
      : undefined,
    typeof incident.column === 'number'
      ? '列: ' + String(incident.column)
      : undefined,
    '页面: ' + incident.pageUrl,
    'User Agent: ' + incident.userAgent,
    contextEntries.length > 0
      ? '\n上下文:\n' +
        contextEntries
          .map(([key, value]) => key + ': ' + value)
          .join('\n')
      : undefined,
    incident.stack
      ? '\nJavaScript Stack:\n' + incident.stack
      : undefined,
    incident.componentStack
      ? '\nReact Component Stack:\n' +
        incident.componentStack
      : undefined,
  ]
    .filter(
      (value): value is string =>
        typeof value === 'string' && value.length > 0,
    )
    .join('\n')
}

export function normalizeUnknownError(
  value: unknown,
): NormalizedError {
  if (value instanceof Error) {
    return {
      name: value.name || 'Error',
      message: normalizeText(
        value.message || 'Unknown error',
        MAX_MESSAGE_LENGTH,
      ),
      stack: normalizeOptionalText(
        value.stack,
        MAX_STACK_LENGTH,
      ),
    }
  }

  if (typeof value === 'string') {
    return {
      name: 'Error',
      message: normalizeText(
        value || 'Unknown error',
        MAX_MESSAGE_LENGTH,
      ),
    }
  }

  return {
    name: 'UnknownError',
    message: normalizeText(
      safeStringify(value),
      MAX_MESSAGE_LENGTH,
    ),
  }
}

function sanitizeContext(
  context: Readonly<Record<string, unknown>> | undefined,
): Readonly<Record<string, string>> {
  if (!context) {
    return {}
  }

  const entries = Object.entries(context)
    .slice(0, MAX_CONTEXT_ENTRIES)
    .map(([key, value]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return [key, REDACTED] as const
      }

      return [
        key,
        normalizeText(
          safeStringify(value),
          MAX_CONTEXT_VALUE_LENGTH,
        ),
      ] as const
    })

  return Object.fromEntries(entries)
}

function safeStringify(value: unknown): string {
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

  const seen = new WeakSet<object>()

  try {
    return JSON.stringify(
      value,
      (_key, candidate: unknown) => {
        if (
          typeof candidate === 'object' &&
          candidate !== null
        ) {
          if (seen.has(candidate)) {
            return '[Circular]'
          }

          seen.add(candidate)
        }

        if (candidate instanceof Error) {
          return {
            name: candidate.name,
            message: candidate.message,
            stack: candidate.stack,
          }
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

function normalizeOptionalText(
  value: string | undefined,
  maximumLength: number,
): string | undefined {
  if (!value) {
    return undefined
  }

  return normalizeText(value, maximumLength)
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
    .replace(BEARER_PATTERN, 'Bearer ' + REDACTED)
    .replace(
      WINDOWS_USER_PATH_PATTERN,
      'C:\\Users\\' + REDACTED,
    )
    .replace(
      UNIX_USER_PATH_PATTERN,
      '/Users/' + REDACTED,
    )
}

function createDefaultCode(
  kind: FatalIncidentKind,
  phase: FatalIncidentPhase,
): string {
  return (
    'FATAL_' +
    kind.replaceAll('-', '_').toUpperCase() +
    '_' +
    phase.replaceAll('-', '_').toUpperCase()
  )
}

function createIncidentId(): string {
  const randomPart =
    globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2)

  return (
    'fatal-' +
    Date.now().toString(36) +
    '-' +
    randomPart
  )
}
`,
  )

  await writeText(
    PATHS.fatalController,
    String.raw`
import {
  createFatalIncident,
  type CreateFatalIncidentInput,
  type FatalIncident,
  type FatalIncidentPhase,
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

type FatalListener = () => void

interface ViteHotContext {
  readonly on: (
    event: string,
    listener: (payload: unknown) => void,
  ) => void
}

class FatalIncidentController {
  private snapshot: FatalSnapshot = {
    status: 'healthy',
  }

  private readonly listeners = new Set<FatalListener>()
  private readonly fingerprints = new Set<string>()
  private collectorsInstalled = false
  private reactMounted = false

  readonly getSnapshot = (): FatalSnapshot => {
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

  report(input: CreateFatalIncidentInput): FatalIncident {
    const incident = createFatalIncident(input)

    if (this.fingerprints.has(incident.fingerprint)) {
      if (this.snapshot.status === 'fatal') {
        return this.snapshot.incident
      }

      return incident
    }

    this.fingerprints.add(incident.fingerprint)

    if (this.snapshot.status === 'fatal') {
      this.snapshot = {
        ...this.snapshot,
        additionalIncidentCount:
          this.snapshot.additionalIncidentCount + 1,
      }

      this.emit()
      this.writeEmergencyLog(incident)

      return this.snapshot.incident
    }

    this.snapshot = {
      status: 'fatal',
      incident,
      additionalIncidentCount: 0,
    }

    this.writeEmergencyLog(incident)
    this.emit()

    return incident
  }

  installCollectors(): void {
    if (this.collectorsInstalled) {
      return
    }

    this.collectorsInstalled = true

    window.addEventListener(
      'error',
      this.handleWindowError,
      true,
    )

    window.addEventListener(
      'unhandledrejection',
      this.handleUnhandledRejection,
    )

    const hot = (
      import.meta as ImportMeta & {
        readonly hot?: ViteHotContext
      }
    ).hot

    hot?.on(
      'hybrid-canvas:diagnostic',
      this.handleViteDiagnostic,
    )
  }

  markReactMounted(): void {
    this.reactMounted = true
  }

  isReactMounted(): boolean {
    return this.reactMounted
  }

  private readonly handleWindowError = (
    event: Event,
  ): void => {
    // Resource loading events do not contain an executable Error.
    // They must not automatically terminate the application.
    if (!(event instanceof ErrorEvent)) {
      return
    }

    const error =
      event.error ??
      event.message ??
      'Unhandled window error'

    this.report({
      error,
      kind: this.reactMounted
        ? 'async'
        : 'bootstrap',
      phase: this.currentPhase(),
      code: this.reactMounted
        ? 'FATAL_UNHANDLED_WINDOW_ERROR'
        : 'FATAL_BOOTSTRAP_WINDOW_ERROR',
      source: event.filename || undefined,
      line: event.lineno || undefined,
      column: event.colno || undefined,
      context: {
        eventType: event.type,
      },
    })
  }

  private readonly handleUnhandledRejection = (
    event: PromiseRejectionEvent,
  ): void => {
    this.report({
      error: event.reason,
      kind: this.reactMounted
        ? 'async'
        : 'bootstrap',
      phase: this.currentPhase(),
      code: this.reactMounted
        ? 'FATAL_UNHANDLED_PROMISE_REJECTION'
        : 'FATAL_BOOTSTRAP_PROMISE_REJECTION',
      context: {
        eventType: event.type,
      },
    })
  }

  private readonly handleViteDiagnostic = (
    payload: unknown,
  ): void => {
    const viteError = readViteError(payload)

    this.report({
      error: viteError.error,
      kind: 'vite',
      phase: this.currentPhase(),
      code: 'FATAL_VITE_DEVELOPMENT_ERROR',
      source: viteError.source,
      line: viteError.line,
      column: viteError.column,
      context: viteError.context,
    })
  }

  private currentPhase(): FatalIncidentPhase {
    return this.reactMounted
      ? 'running'
      : 'react-mount'
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (error: unknown) {
        console.error(
          '[Hybrid Canvas] Fatal listener failed',
          error,
        )
      }
    }
  }

  private writeEmergencyLog(
    incident: FatalIncident,
  ): void {
    console.error(
      '[Hybrid Canvas Fatal Incident]',
      incident,
    )
  }
}

interface ParsedViteError {
  readonly error: unknown
  readonly source?: string
  readonly line?: number
  readonly column?: number
  readonly context: Readonly<Record<string, unknown>>
}

export const fatalIncidentController =
  new FatalIncidentController()

function readViteError(
  payload: unknown,
): ParsedViteError {
  if (!isRecord(payload)) {
    return {
      error: payload,
      context: {
        diagnosticSource: 'vite',
      },
    }
  }

  const rawError = isRecord(payload.error)
    ? payload.error
    : payload

  const rawLocation = isRecord(rawError.location)
    ? rawError.location
    : undefined

  const message =
    readString(rawError, 'message') ??
    readString(rawError, 'msg') ??
    'Unknown Vite development error'

  const error = new Error(message)
  error.name =
    readString(rawError, 'name') ?? 'ViteError'

  const stack = readString(rawError, 'stack')
  if (stack) {
    error.stack = stack
  }

  return {
    error,
    source:
      readString(rawLocation, 'file') ??
      readString(rawError, 'id'),
    line: readNumber(rawLocation, 'line'),
    column: readNumber(rawLocation, 'column'),
    context: {
      diagnosticSource:
        readString(payload, 'source') ?? 'vite',
      plugin:
        readString(rawError, 'plugin') ?? '',
      moduleId:
        readString(rawError, 'id') ?? '',
      frame:
        readString(rawError, 'frame') ?? '',
      pluginCode:
        readString(rawError, 'pluginCode') ?? '',
    },
  }
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(
  record: Record<string, unknown> | undefined,
  property: string,
): string | undefined {
  const value = record?.[property]

  return typeof value === 'string'
    ? value
    : undefined
}

function readNumber(
  record: Record<string, unknown> | undefined,
  property: string,
): number | undefined {
  const value = record?.[property]

  return typeof value === 'number'
    ? value
    : undefined
}
`,
  )

  await writeText(
    PATHS.preReactEntry,
    String.raw`
import { fatalIncidentController } from './fatal-controller'
import {
  formatFatalDiagnostic,
  type FatalIncident,
} from './fatal-incident'

fatalIncidentController.installCollectors()

fatalIncidentController.subscribe(() => {
  if (fatalIncidentController.isReactMounted()) {
    return
  }

  const snapshot =
    fatalIncidentController.getSnapshot()

  if (snapshot.status !== 'fatal') {
    return
  }

  renderPreReactFatalScreen(snapshot.incident)
})

function renderPreReactFatalScreen(
  incident: FatalIncident,
): void {
  const root = document.getElementById('root')

  if (!root) {
    console.error(
      '[Hybrid Canvas] Root element unavailable',
      incident,
    )
    return
  }

  const diagnostic =
    formatFatalDiagnostic(incident)

  root.replaceChildren(
    createFatalSurface(incident, diagnostic),
  )
}

function createFatalSurface(
  incident: FatalIncident,
  diagnostic: string,
): HTMLElement {
  const main = document.createElement('main')
  main.className = 'fatal-surface'
  main.setAttribute('role', 'alert')
  main.setAttribute('aria-live', 'assertive')

  const content = document.createElement('section')
  content.className = 'fatal-content'

  const icon = document.createElement('div')
  icon.className = 'fatal-icon'
  icon.setAttribute('aria-hidden', 'true')
  icon.innerHTML = createWarningIcon()

  const title = document.createElement('h1')
  title.className = 'fatal-title'
  title.textContent = incident.title

  const description = document.createElement('p')
  description.className = 'fatal-description'
  description.textContent = incident.message

  const summary = document.createElement('p')
  summary.className = 'fatal-summary'
  summary.textContent =
    incident.code + ' · ' + incident.id

  const details = document.createElement('details')
  details.className = 'fatal-details'

  const detailsSummary =
    document.createElement('summary')
  detailsSummary.textContent = '查看诊断信息'

  const pre = document.createElement('pre')
  pre.className = 'fatal-diagnostic'
  pre.textContent = diagnostic

  details.append(detailsSummary, pre)

  const actions = document.createElement('div')
  actions.className = 'fatal-actions'

  const reloadButton =
    document.createElement('button')
  reloadButton.className =
    'fatal-button fatal-button-primary'
  reloadButton.type = 'button'
  reloadButton.textContent = '重新加载'
  reloadButton.onclick = () => {
    window.location.reload()
  }

  const copyButton =
    document.createElement('button')
  copyButton.className = 'fatal-button'
  copyButton.type = 'button'
  copyButton.textContent = '复制诊断信息'
  copyButton.onclick = async () => {
    try {
      await navigator.clipboard.writeText(diagnostic)
      copyButton.textContent = '已复制'
    } catch {
      copyButton.textContent = '复制失败，请手动选择'
      details.open = true
    }
  }

  actions.append(reloadButton, copyButton)

  content.append(
    icon,
    title,
    description,
    summary,
    actions,
    details,
  )

  main.append(content)

  return main
}

function createWarningIcon(): string {
  return [
    '<svg',
    ' viewBox="0 0 24 24"',
    ' fill="none"',
    ' stroke="currentColor"',
    ' stroke-width="1.7"',
    ' stroke-linecap="round"',
    ' stroke-linejoin="round"',
    ' aria-hidden="true"',
    '>',
    '<path d="M12 8.5v4.25" />',
    '<path d="M12 16.25h.01" />',
    '<path d="M10.28 3.86 2.82 16.8a2 2 0 0 0 1.73 3h14.9a2 2 0 0 0 1.73-3L13.72 3.86a2 2 0 0 0-3.44 0Z" />',
    '</svg>',
  ].join('')
}
`,
  )

  await writeText(
    PATHS.fatalScreen,
    String.raw`
import {
  useMemo,
  useState,
} from 'react'
import {
  formatFatalDiagnostic,
  type FatalIncident,
} from './fatal-incident'

export interface FatalErrorScreenProps {
  readonly incident: FatalIncident
  readonly additionalIncidentCount?: number
}

export function FatalErrorScreen({
  incident,
  additionalIncidentCount = 0,
}: FatalErrorScreenProps) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] =
    useState(false)

  const diagnostic = useMemo(
    () => formatFatalDiagnostic(incident),
    [incident],
  )

  const copyDiagnostic = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(diagnostic)
      setCopied(true)
      setCopyFailed(false)
    } catch {
      setCopied(false)
      setCopyFailed(true)
    }
  }

  return (
    <main
      aria-live="assertive"
      className="fatal-surface"
      role="alert"
    >
      <section className="fatal-content">
        <div
          aria-hidden="true"
          className="fatal-icon"
        >
          <WarningIcon />
        </div>

        <h1 className="fatal-title">
          {incident.title}
        </h1>

        <p className="fatal-description">
          {incident.message}
        </p>

        <p className="fatal-summary">
          {incident.code}
          {' · '}
          {incident.id}
        </p>

        {additionalIncidentCount > 0 ? (
          <p className="fatal-secondary">
            此后还捕获到 {additionalIncidentCount}{' '}
            个相关异常。
          </p>
        ) : null}

        <div className="fatal-actions">
          <button
            className="fatal-button fatal-button-primary"
            onClick={() => window.location.reload()}
            type="button"
          >
            <ReloadIcon />
            重新加载
          </button>

          <button
            className="fatal-button"
            onClick={() => {
              void copyDiagnostic()
            }}
            type="button"
          >
            <CopyIcon />
            {copied
              ? '已复制'
              : copyFailed
                ? '复制失败'
                : '复制诊断信息'}
          </button>
        </div>

        <details
          className="fatal-details"
          open={copyFailed}
        >
          <summary>查看诊断信息</summary>

          <pre className="fatal-diagnostic">
            {diagnostic}
          </pre>
        </details>
      </section>
    </main>
  )
}

function WarningIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
    >
      <path d="M12 8.5v4.25" />
      <path d="M12 16.25h.01" />
      <path d="M10.28 3.86 2.82 16.8a2 2 0 0 0 1.73 3h14.9a2 2 0 0 0 1.73-3L13.72 3.86a2 2 0 0 0-3.44 0Z" />
    </svg>
  )
}

function ReloadIcon() {
  return (
    <svg
      aria-hidden="true"
      className="fatal-button-icon"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
    >
      <path d="M20 6v5h-5" />
      <path d="M19 11a7.5 7.5 0 1 0 .4 4" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg
      aria-hidden="true"
      className="fatal-button-icon"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
      viewBox="0 0 24 24"
    >
      <rect
        height="13"
        rx="2"
        width="13"
        x="8"
        y="8"
      />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
    </svg>
  )
}
`,
  )

  await writeText(
    PATHS.fatalBoundary,
    String.raw`
import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react'
import { fatalIncidentController } from './fatal-controller'

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
    fatalIncidentController.report({
      error,
      kind: 'render',
      phase: 'running',
      code: 'FATAL_REACT_RENDER_ERROR',
      componentStack:
        info.componentStack ?? undefined,
      context: {
        collector: 'react-error-boundary',
      },
    })
  }

  override render(): ReactNode {
    if (this.state.crashed) {
      // FatalErrorHost owns the only global error UI.
      return null
    }

    return this.props.children
  }
}
`,
  )

  await writeText(
    PATHS.fatalHost,
    String.raw`
import {
  type ReactNode,
  useSyncExternalStore,
} from 'react'
import { fatalIncidentController } from './fatal-controller'
import { FatalErrorBoundary } from './FatalErrorBoundary'
import { FatalErrorScreen } from './FatalErrorScreen'

export interface FatalErrorHostProps {
  readonly children: ReactNode
}

export function FatalErrorHost({
  children,
}: FatalErrorHostProps) {
  const snapshot = useSyncExternalStore(
    fatalIncidentController.subscribe,
    fatalIncidentController.getSnapshot,
    fatalIncidentController.getSnapshot,
  )

  if (snapshot.status === 'fatal') {
    return (
      <FatalErrorScreen
        additionalIncidentCount={
          snapshot.additionalIncidentCount
        }
        incident={snapshot.incident}
      />
    )
  }

  return (
    <FatalErrorBoundary>
      {children}
    </FatalErrorBoundary>
  )
}
`,
  )
}

async function replaceDesktopBootstrap() {
  await writeText(
    PATHS.desktopIndex,
    String.raw`
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta
      content="width=device-width, initial-scale=1.0"
      name="viewport"
    />
    <meta content="#f3f3f3" name="theme-color" />

    <!--
      Native window, WebView and document surfaces must remain aligned.
      See docs/adr/ADR-003-opaque-window-surface.md.
    -->
    <style id="window-backing-surface">
      :root {
        --window-backing-surface: #f3f3f3;
        --fatal-foreground: #18181b;
        --fatal-muted: #71717a;
        --fatal-border: #d4d4d8;
        --fatal-hover: rgb(24 24 27 / 5%);
        --fatal-danger: #b42318;
        --fatal-danger-surface: #fee4e2;
      }

      html,
      body,
      #root {
        width: 100%;
        height: 100%;
        margin: 0;
        background: var(--window-backing-surface);
      }

      .fatal-surface,
      .fatal-surface * {
        box-sizing: border-box;
      }

      .fatal-surface {
        display: grid;
        width: 100%;
        min-height: 100%;
        place-items: center;
        overflow: auto;
        padding: 48px 32px;
        color: var(--fatal-foreground);
        background: var(--window-backing-surface);
        font-family:
          Inter,
          ui-sans-serif,
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;
      }

      .fatal-content {
        width: min(100%, 620px);
      }

      .fatal-icon {
        display: grid;
        width: 44px;
        height: 44px;
        place-items: center;
        color: var(--fatal-danger);
        background: var(--fatal-danger-surface);
        border-radius: 50%;
      }

      .fatal-icon svg {
        width: 22px;
        height: 22px;
      }

      .fatal-title {
        margin: 22px 0 0;
        font-size: 20px;
        font-weight: 650;
        line-height: 1.4;
        letter-spacing: -0.015em;
      }

      .fatal-description {
        max-width: 560px;
        margin: 10px 0 0;
        color: var(--fatal-muted);
        font-size: 14px;
        line-height: 1.7;
      }

      .fatal-summary,
      .fatal-secondary {
        margin: 12px 0 0;
        color: var(--fatal-muted);
        font-family:
          "Cascadia Code",
          "SFMono-Regular",
          Consolas,
          "Liberation Mono",
          monospace;
        font-size: 11px;
        line-height: 1.6;
        overflow-wrap: anywhere;
      }

      .fatal-secondary {
        font-family: inherit;
      }

      .fatal-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 24px;
      }

      .fatal-button {
        display: inline-flex;
        min-height: 36px;
        align-items: center;
        justify-content: center;
        gap: 7px;
        padding: 0 13px;
        color: var(--fatal-foreground);
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        background: transparent;
        border: 1px solid var(--fatal-border);
        border-radius: 8px;
        cursor: pointer;
        transition:
          background-color 120ms ease,
          border-color 120ms ease;
      }

      .fatal-button:hover {
        background: var(--fatal-hover);
      }

      .fatal-button:focus-visible,
      .fatal-details summary:focus-visible {
        outline: 2px solid rgb(24 24 27 / 35%);
        outline-offset: 2px;
      }

      .fatal-button-primary {
        color: #ffffff;
        background: var(--fatal-foreground);
        border-color: var(--fatal-foreground);
      }

      .fatal-button-primary:hover {
        background: #27272a;
      }

      .fatal-button-icon {
        width: 15px;
        height: 15px;
      }

      .fatal-details {
        margin-top: 28px;
        padding-top: 18px;
        border-top: 1px solid var(--fatal-border);
      }

      .fatal-details summary {
        width: fit-content;
        color: var(--fatal-muted);
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        user-select: none;
      }

      .fatal-diagnostic {
        max-height: 320px;
        margin: 16px 0 0;
        overflow: auto;
        color: #3f3f46;
        font-family:
          "Cascadia Code",
          "SFMono-Regular",
          Consolas,
          "Liberation Mono",
          monospace;
        font-size: 11px;
        line-height: 1.7;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        user-select: text;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --window-backing-surface: #18181b;
          --fatal-foreground: #f4f4f5;
          --fatal-muted: #a1a1aa;
          --fatal-border: #3f3f46;
          --fatal-hover: rgb(255 255 255 / 6%);
          --fatal-danger: #f97066;
          --fatal-danger-surface: rgb(240 68 56 / 14%);
        }

        .fatal-button-primary {
          color: #18181b;
          background: #f4f4f5;
          border-color: #f4f4f5;
        }

        .fatal-button-primary:hover {
          background: #e4e4e7;
        }

        .fatal-diagnostic {
          color: #d4d4d8;
        }
      }

      @media (max-width: 640px) {
        .fatal-surface {
          place-items: start;
          padding: 40px 24px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .fatal-button {
          transition: none;
        }
      }
    </style>

    <title>Hybrid Canvas</title>
  </head>

  <body>
    <div id="root"></div>

    <!--
      This module installs fatal collectors before the React entry executes.
      It renders nothing during a healthy startup.
    -->
    <script
      src="/src/fatal/pre-react-entry.ts"
      type="module"
    ></script>

    <script
      src="/src/main.tsx"
      type="module"
    ></script>
  </body>
</html>
`,
  )
}

async function replaceReactRoot() {
  await writeText(
    PATHS.reactRoot,
    String.raw`
import type { Root } from 'react-dom/client'
import { createRoot } from 'react-dom/client'
import {
  fatalIncidentController,
} from '../fatal/fatal-controller'
import { FatalErrorHost } from '../fatal/FatalErrorHost'
import { AppShell } from '../presentation/AppShell'
import { createApplicationRuntime } from './application'

export interface MountedReactApplication {
  readonly runtime: ReturnType<
    typeof createApplicationRuntime
  >
  readonly unmount: () => Promise<void>
}

export function mountReactApplication(
  container: HTMLElement,
): MountedReactApplication {
  let runtime: ReturnType<
    typeof createApplicationRuntime
  >

  try {
    runtime = createApplicationRuntime({
      tldrawLicenseKey: readTldrawLicenseKey(),
    })
  } catch (error: unknown) {
    fatalIncidentController.report({
      error,
      kind: 'bootstrap',
      phase: 'runtime-construction',
      code: 'FATAL_APPLICATION_RUNTIME_CONSTRUCTION',
      context: {
        collector: 'react-root',
      },
    })

    throw error
  }

  const root: Root = createRoot(container)

  fatalIncidentController.markReactMounted()

  root.render(
    <FatalErrorHost>
      <AppShell runtime={runtime} />
    </FatalErrorHost>,
  )

  return {
    runtime,

    async unmount() {
      root.unmount()
      await runtime.dispose()
    },
  }
}

function readTldrawLicenseKey(): string {
  const licenseKey =
    import.meta.env.VITE_TLDRAW_LICENSE_KEY?.trim()

  if (!licenseKey) {
    throw new Error(
      'Required tldraw license configuration is missing.',
    )
  }

  return licenseKey
}
`,
  )
}

async function removeWorkspaceRootBoundary() {
  const filePath = resolvePath(PATHS.appShell)
  let source = await readFile(filePath, 'utf8')

  source = source.replace(
    /import\s+\{\s*UiErrorBoundary\s*\}\s+from\s+['"]\.\/boundaries\/UiErrorBoundary['"]\s*\n/,
    '',
  )

  const openingBoundary =
    /(\s*)<UiErrorBoundary area="工作区">\s*\n/

  if (!openingBoundary.test(source)) {
    throw new Error(
      'Could not find the Workspace UiErrorBoundary opening tag.',
    )
  }

  source = source.replace(openingBoundary, '\n')

  const closingBoundary =
    /\n\s*<\/UiErrorBoundary>(\s*\n\s*<CommandPalette)/

  if (!closingBoundary.test(source)) {
    throw new Error(
      'Could not find the Workspace UiErrorBoundary closing tag.',
    )
  }

  source = source.replace(
    closingBoundary,
    '$1',
  )

  await writeFile(filePath, source, 'utf8')
}

async function removeLegacyImplementations() {
  const files = [
    PATHS.oldApplicationBoundary,
    PATHS.oldBootstrapFallback,
    PATHS.oldUiBoundary,
  ]

  for (const relativePath of files) {
    await rm(resolvePath(relativePath), {
      force: true,
    })
  }

  const boundaryDirectory = resolvePath(
    'apps/desktop/src/presentation/boundaries',
  )

  try {
    await rm(boundaryDirectory, {
      recursive: false,
    })
  } catch {
    // Keep the directory when other feature boundaries exist.
  }
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

const requiredFiles = [
  'apps/desktop/src/fatal/fatal-incident.ts',
  'apps/desktop/src/fatal/fatal-controller.ts',
  'apps/desktop/src/fatal/pre-react-entry.ts',
  'apps/desktop/src/fatal/FatalErrorScreen.tsx',
  'apps/desktop/src/fatal/FatalErrorBoundary.tsx',
  'apps/desktop/src/fatal/FatalErrorHost.tsx',
]

const forbiddenFiles = [
  'apps/desktop/src/bootstrap/ApplicationErrorBoundary.tsx',
  'apps/desktop/src/bootstrap/bootstrap-fallback.ts',
  'apps/desktop/src/presentation/boundaries/UiErrorBoundary.tsx',
]

function read(relativePath) {
  return readFileSync(
    path.join(ROOT, relativePath),
    'utf8',
  )
}

for (const relativePath of requiredFiles) {
  if (!existsSync(path.join(ROOT, relativePath))) {
    failures.push(
      'Missing fatal architecture file: ' +
        relativePath,
    )
  }
}

for (const relativePath of forbiddenFiles) {
  if (existsSync(path.join(ROOT, relativePath))) {
    failures.push(
      'Legacy fatal implementation still exists: ' +
        relativePath,
    )
  }
}

const html = read('apps/desktop/index.html')
const appShell = read(
  'apps/desktop/src/presentation/AppShell.tsx',
)
const reactRoot = read(
  'apps/desktop/src/bootstrap/react-root.tsx',
)

const forbiddenHtmlTerms = [
  'Hybrid Canvas 正在启动',
  '正在加载应用组件',
  'bootstrap-fallback-card',
  'bootstrap-fallback.ts',
]

for (const term of forbiddenHtmlTerms) {
  if (html.includes(term)) {
    failures.push(
      'Legacy startup UI remains in index.html: ' +
        term,
    )
  }
}

if (
  !html.includes(
    '/src/fatal/pre-react-entry.ts',
  )
) {
  failures.push(
    'The pre-React fatal collector is not loaded.',
  )
}

if (
  !html.includes(
    'class="fatal-content"',
  ) &&
  html.includes('fatal-card')
) {
  failures.push(
    'Fatal UI must not use a card container.',
  )
}

if (appShell.includes('UiErrorBoundary')) {
  failures.push(
    'The Workspace root must not use UiErrorBoundary.',
  )
}

if (!reactRoot.includes('FatalErrorHost')) {
  failures.push(
    'React root is not hosted by FatalErrorHost.',
  )
}

if (
  !reactRoot.includes(
    'fatalIncidentController.markReactMounted()',
  )
) {
  failures.push(
    'React mount ownership was not transferred to the fatal controller.',
  )
}

if (failures.length > 0) {
  console.error(
    [
      'Fatal error architecture checks failed:',
      ...failures.map(
        (failure) => '- ' + failure,
      ),
    ].join('\n'),
  )

  process.exitCode = 1
} else {
  console.log(
    'Fatal error architecture checks passed.',
  )
}
`,
  )
}

async function registerArchitectureCheck() {
  const packagePath = resolvePath(PATHS.rootPackage)
  const source = await readFile(packagePath, 'utf8')
  const packageJson = JSON.parse(source)

  const command =
    'node tests/architecture/check-fatal-error-architecture.mjs'

  const current =
    packageJson.scripts?.['test:architecture']

  if (typeof current !== 'string') {
    throw new Error(
      'package.json does not contain test:architecture.',
    )
  }

  if (!current.includes(command)) {
    packageJson.scripts['test:architecture'] =
      current + ' && ' + command
  }

  await writeFile(
    packagePath,
    JSON.stringify(packageJson, null, 2) + '\n',
    'utf8',
  )
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
}

function normalizeContent(content) {
  return content
    .replace(/^\n/, '')
    .replace(/\s+$/, '') + '\n'
}

function resolvePath(relativePath) {
  return path.join(ROOT, relativePath)
}

main().catch((error) => {
  console.error('')
  console.error('Fatal error refactor failed.')
  console.error(error)
  process.exitCode = 1
})