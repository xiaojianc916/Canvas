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
