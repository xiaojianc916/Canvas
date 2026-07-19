export interface Span {
  readonly name: string
  end(metadata?: Record<string, unknown>): void
}

export function startSpan(name: string, metadata?: Record<string, unknown>): Span {
  const start = performance.now()
  const spanId = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)
  return {
    name,
    end(meta) {
      const duration = performance.now() - start
      // Log span completion — real tracer can replace this
      console.debug(`[trace] span=${name} id=${spanId} duration=${duration.toFixed(2)}ms`, {
        ...metadata,
        ...meta,
      })
    },
  }
}
