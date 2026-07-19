export interface CancellationToken {
  readonly cancelled: boolean
  readonly reason?: CancellationReason
  onCancelled(listener: () => void): () => void
}

export type CancellationReason = 'aborted' | 'timeout' | 'cancelled' | 'superseded' | string

export class CancellationTokenSource {
  private _cancelled = false
  private _reason?: CancellationReason
  private listeners: (() => void)[] = []

  get token(): CancellationToken {
    return {
      get cancelled() {
        return this._cancelled
      },
      get reason() {
        return this._reason
      },
      onCancelled: (listener: () => void) => {
        this.listeners.push(listener)
        return () => {
          const idx = this.listeners.indexOf(listener)
          if (idx >= 0) this.listeners.splice(idx, 1)
        }
      },
    }
  }

  cancel(reason: CancellationReason = 'cancelled'): void {
    if (this._cancelled) return
    this._cancelled = true
    this._reason = reason
    const listeners = [...this.listeners]
    this.listeners = []
    for (const l of listeners) {
      try {
        l()
      } catch {}
    }
  }

  static fromSignal(signal: AbortSignal): CancellationToken {
    return {
      get cancelled() {
        return signal.aborted
      },
      get reason() {
        return signal.reason as CancellationReason | undefined
      },
      onCancelled(listener) {
        signal.addEventListener('abort', listener, { once: true })
        return () => signal.removeEventListener('abort', listener)
      },
    }
  }

  static none(): CancellationToken {
    return {
      get cancelled() {
        return false
      },
      get reason() {
        return undefined
      },
      onCancelled(_listener) {
        return () => {}
      },
    }
  }

  static timeout(ms: number): { token: CancellationToken; cancel: () => void } {
    const cts = new CancellationTokenSource()
    const timer = setTimeout(() => cts.cancel('timeout'), ms)
    return {
      token: cts.token,
      cancel: () => {
        clearTimeout(timer)
        cts.cancel('cancelled')
      },
    }
  }
}

export function withCancellation<T>(
  token: CancellationToken,
  promise: Promise<T>,
  onCancel?: (reason?: CancellationReason) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (token.cancelled) {
      reject(new CancellationError(token.reason ?? 'cancelled'))
      return
    }
    const cleanup = token.onCancelled(() => {
      cleanup()
      onCancel?.(token.reason)
      reject(new CancellationError(token.reason ?? 'cancelled'))
    })
    promise.then(
      (v) => {
        cleanup()
        resolve(v)
      },
      (e) => {
        cleanup()
        reject(e)
      },
    )
  })
}

export class CancellationError extends Error {
  constructor(public readonly reason: CancellationReason) {
    super(`Cancelled: ${reason}`)
    this.name = 'CancellationError'
  }
}

export function isCancellationError(error: unknown): error is CancellationError {
  return error instanceof CancellationError
}
