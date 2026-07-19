import type { MetricRecorder } from './metric'
import { getMetricsRecorder } from './metric'

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

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
) {
  const prefix = context.scope ? `[${context.scope}]` : ''
  console.log(`${timestamp} ${level.toUpperCase()} ${prefix} ${message}`, context)
}

export function setLogSink(next: LogSink): void {
  sink = next
}

export function log(level: LogLevel, message: string, context: LogContext = {}): void {
  sink(level, message, context, new Date().toISOString())
}

export function trace(message: string, context?: LogContext) {
  log('trace', message, context)
}
export function debug(message: string, context?: LogContext) {
  log('debug', message, context)
}
export function info(message: string, context?: LogContext) {
  log('info', message, context)
}
export function warn(message: string, context?: LogContext) {
  log('warn', message, context)
}
export function error(message: string, context?: LogContext) {
  log('error', message, context)
}

export function initObservability(options?: {
  appName?: string
  sink?: LogSink
  metrics?: MetricRecorder
}): void {
  if (options?.sink) setLogSink(options.sink)
  if (options?.metrics) getMetricsRecorder()
  info('observability initialized', { appName: options?.appName })
}
