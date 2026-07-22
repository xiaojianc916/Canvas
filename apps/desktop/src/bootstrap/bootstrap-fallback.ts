interface BootstrapDiagnosticElements {
  readonly root: HTMLElement
  readonly title: HTMLElement
  readonly description: HTMLElement
  readonly details: HTMLElement
  readonly diagnostic: HTMLElement
  readonly actions: HTMLElement
  readonly reloadButton: HTMLButtonElement
  readonly copyButton: HTMLButtonElement
}

interface NormalizedError {
  readonly name: string
  readonly message: string
  readonly stack?: string
}

const startedAt = new Date().toISOString()

function getElements(): BootstrapDiagnosticElements | null {
  const root = document.getElementById('bootstrap-fallback')
  const title = document.getElementById('bootstrap-fallback-title')
  const description = document.getElementById('bootstrap-fallback-description')
  const details = document.getElementById('bootstrap-fallback-details')
  const diagnostic = document.getElementById('bootstrap-fallback-diagnostic')
  const actions = document.getElementById('bootstrap-fallback-actions')
  const reloadButton = document.getElementById('bootstrap-fallback-reload')
  const copyButton = document.getElementById('bootstrap-fallback-copy')

  if (
    !root ||
    !title ||
    !description ||
    !details ||
    !diagnostic ||
    !actions ||
    !(reloadButton instanceof HTMLButtonElement) ||
    !(copyButton instanceof HTMLButtonElement)
  ) {
    return null
  }

  return {
    root,
    title,
    description,
    details,
    diagnostic,
    actions,
    reloadButton,
    copyButton,
  }
}

function normalizeError(value: unknown): NormalizedError {
  if (value instanceof Error) {
    return {
      name: value.name || 'Error',
      message: value.message || '未知错误',
      ...optionalProperty('stack', value.stack),
    }
  }

  if (typeof value === 'string') {
    return {
      name: 'Error',
      message: value,
    }
  }

  try {
    return {
      name: 'UnknownError',
      message: JSON.stringify(value, null, 2),
    }
  } catch {
    return {
      name: 'UnknownError',
      message: String(value),
    }
  }
}

function createDiagnostic(
  error: NormalizedError,
  source?: string,
  line?: number,
  column?: number,
): string {
  return [
    `时间: ${new Date().toISOString()}`,
    `启动时间: ${startedAt}`,
    `错误类型: ${error.name}`,
    `错误信息: ${error.message}`,
    source ? `来源: ${source}` : undefined,
    typeof line === 'number' ? `行: ${line}` : undefined,
    typeof column === 'number' ? `列: ${column}` : undefined,
    `页面: ${window.location.href}`,
    `User Agent: ${navigator.userAgent}`,
    error.stack ? `\nStack:\n${error.stack}` : undefined,
  ]
    .filter((item): item is string => Boolean(item))
    .join('\n')
}

function showFatalError(diagnosticText: string): void {
  const elements = getElements()

  if (!elements) {
    console.error(diagnosticText)
    return
  }

  elements.root.setAttribute('role', 'alert')
  elements.title.textContent = '应用无法完成启动'
  elements.description.textContent = '应用启动期间发生了未处理错误。完整诊断信息如下。'
  elements.diagnostic.textContent = diagnosticText
  elements.details.setAttribute('data-visible', 'true')
  elements.actions.setAttribute('data-visible', 'true')

  elements.reloadButton.onclick = () => {
    window.location.reload()
  }

  elements.copyButton.onclick = async () => {
    try {
      await navigator.clipboard.writeText(diagnosticText)
      elements.copyButton.textContent = '已复制'
    } catch {
      elements.copyButton.textContent = '复制失败，请手动选择'
    }
  }
}

window.addEventListener(
  'error',
  (event) => {
    const error = normalizeError(event.error ?? event.message)

    showFatalError(
      createDiagnostic(
        error,
        event.filename || undefined,
        event.lineno || undefined,
        event.colno || undefined,
      ),
    )
  },
  true,
)

window.addEventListener('unhandledrejection', (event) => {
  const error = normalizeError(event.reason)
  showFatalError(createDiagnostic(error))
})

export {}

// HYBRID_CANVAS_VITE_DIAGNOSTIC_BRIDGE

interface ViteDiagnosticLocation {
  readonly file?: string
  readonly line?: number
  readonly column?: number
}

interface ViteDiagnosticError {
  readonly name?: string
  readonly message?: string
  readonly stack?: string
  readonly plugin?: string
  readonly id?: string
  readonly frame?: string
  readonly pluginCode?: string
  readonly location?: ViteDiagnosticLocation
}

interface ViteDiagnosticPayload {
  readonly source?: string
  readonly occurredAt?: string
  readonly error?: ViteDiagnosticError
}

interface HybridCanvasHotContext {
  readonly on: (event: string, listener: (payload: unknown) => void) => void
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readOptionalString(value: Record<string, unknown>, property: string): string | undefined {
  const candidate = value[property]
  return typeof candidate === 'string' ? candidate : undefined
}

function readOptionalNumber(value: Record<string, unknown>, property: string): number | undefined {
  const candidate = value[property]
  return typeof candidate === 'number' ? candidate : undefined
}

function readUnknownProperty(value: Record<string, unknown>, property: string): unknown {
  return value[property]
}

function optionalProperty<Key extends string, Value>(
  property: Key,
  value: Value | undefined,
): Partial<Record<Key, Value>> {
  if (value === undefined) {
    return {}
  }

  return {
    [property]: value,
  } as Record<Key, Value>
}

function parseViteDiagnosticLocation(value: unknown): ViteDiagnosticLocation | undefined {
  if (!isUnknownRecord(value)) {
    return undefined
  }

  return {
    ...optionalProperty('file', readOptionalString(value, 'file')),
    ...optionalProperty('line', readOptionalNumber(value, 'line')),
    ...optionalProperty('column', readOptionalNumber(value, 'column')),
  }
}

function parseViteDiagnosticPayload(value: unknown): ViteDiagnosticPayload {
  if (!isUnknownRecord(value)) {
    return {
      source: 'vite',
      occurredAt: new Date().toISOString(),
      error: {
        name: 'ViteError',
        message: String(value),
      },
    }
  }

  const rawErrorValue = readUnknownProperty(value, 'error')
  const rawError = isUnknownRecord(rawErrorValue) ? rawErrorValue : {}

  const rawLocationValue = readUnknownProperty(rawError, 'location')
  const location = parseViteDiagnosticLocation(rawLocationValue)

  return {
    source: readOptionalString(value, 'source') ?? 'vite',
    occurredAt: readOptionalString(value, 'occurredAt') ?? new Date().toISOString(),
    error: {
      name: readOptionalString(rawError, 'name') ?? 'ViteError',
      message: readOptionalString(rawError, 'message') ?? '未知 Vite 开发服务器错误',
      ...optionalProperty('stack', readOptionalString(rawError, 'stack')),
      ...optionalProperty('plugin', readOptionalString(rawError, 'plugin')),
      ...optionalProperty('id', readOptionalString(rawError, 'id')),
      ...optionalProperty('frame', readOptionalString(rawError, 'frame')),
      ...optionalProperty('pluginCode', readOptionalString(rawError, 'pluginCode')),
      ...optionalProperty('location', location),
    },
  }
}

function formatViteDiagnostic(payload: ViteDiagnosticPayload): string {
  const error = payload.error ?? {}
  const location = error.location

  return [
    '错误来源: Vite 开发服务器',
    `时间: ${payload.occurredAt ?? new Date().toISOString()}`,
    `错误类型: ${error.name ?? 'ViteError'}`,
    `错误信息: ${error.message ?? '未知 Vite 开发服务器错误'}`,
    error.plugin ? `Vite 插件: ${error.plugin}` : undefined,
    error.id ? `模块 ID: ${error.id}` : undefined,
    location?.file ? `文件: ${location.file}` : undefined,
    typeof location?.line === 'number' ? `行: ${location.line}` : undefined,
    typeof location?.column === 'number' ? `列: ${location.column}` : undefined,
    error.frame ? `\n代码定位:\n${error.frame}` : undefined,
    error.pluginCode ? `\n插件代码:\n${error.pluginCode}` : undefined,
    error.stack ? `\nStack:\n${error.stack}` : undefined,
  ]
    .filter((item): item is string => Boolean(item))
    .join('\n')
}

const hybridCanvasHot = (
  import.meta as ImportMeta & {
    readonly hot?: HybridCanvasHotContext
  }
).hot

hybridCanvasHot?.on('hybrid-canvas:diagnostic', (rawPayload: unknown) => {
  const payload = parseViteDiagnosticPayload(rawPayload)
  const diagnostic = formatViteDiagnostic(payload)

  console.error('[Hybrid Canvas Vite Diagnostic]', rawPayload)

  showFatalError(diagnostic)
})
