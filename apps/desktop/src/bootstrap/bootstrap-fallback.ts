
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
  const description = document.getElementById(
    'bootstrap-fallback-description',
  )
  const details = document.getElementById('bootstrap-fallback-details')
  const diagnostic = document.getElementById(
    'bootstrap-fallback-diagnostic',
  )
  const actions = document.getElementById('bootstrap-fallback-actions')
  const reloadButton = document.getElementById(
    'bootstrap-fallback-reload',
  )
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
      stack: value.stack,
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
  elements.description.textContent =
    '应用启动期间发生了未处理错误。完整诊断信息如下。'
  elements.diagnostic.textContent = diagnosticText
  elements.details.dataset.visible = 'true'
  elements.actions.dataset.visible = 'true'

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
