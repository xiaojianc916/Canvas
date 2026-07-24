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
