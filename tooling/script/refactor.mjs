/**
 * scripts/apply-custom-error-ui.mjs
 *
 * 作用：
 * 1. 永久关闭 Vite 默认错误 Overlay。
 * 2. 添加不依赖 React 应用入口的启动错误兜底。
 * 3. 增强 ApplicationErrorBoundary，显示完整错误信息。
 * 4. 捕获 window.error 和 unhandledrejection。
 * 5. 支持复制完整诊断信息。
 *
 * 在仓库根目录执行：
 *   node scripts/apply-custom-error-ui.mjs
 */

import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot =
  path.basename(scriptDirectory) === 'scripts'
    ? path.dirname(scriptDirectory)
    : process.cwd()

const paths = {
  viteConfig: path.join(repositoryRoot, 'apps/desktop/vite.config.ts'),
  indexHtml: path.join(repositoryRoot, 'apps/desktop/index.html'),
  errorBoundary: path.join(
    repositoryRoot,
    'apps/desktop/src/bootstrap/ApplicationErrorBoundary.tsx',
  ),
  bootstrapFallback: path.join(
    repositoryRoot,
    'apps/desktop/src/bootstrap/bootstrap-fallback.ts',
  ),
}

async function assertFileExists(filePath) {
  try {
    await access(filePath)
  } catch {
    throw new Error(`找不到文件：${path.relative(repositoryRoot, filePath)}`)
  }
}

async function readUtf8(filePath) {
  return (await readFile(filePath, 'utf8')).replace(/^\uFEFF/, '')
}

async function atomicWrite(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true })

  const temporaryPath = `${filePath}.${process.pid}.tmp`
  const normalizedContent = `${content.replace(/\r\n/g, '\n').trimEnd()}\n`

  await writeFile(temporaryPath, normalizedContent, 'utf8')
  await rename(temporaryPath, filePath)

  console.log(`已修改：${path.relative(repositoryRoot, filePath)}`)
}

function updateViteConfig(source) {
  if (/hmr\s*:\s*\{[\s\S]*?overlay\s*:\s*false/.test(source)) {
    return source
  }

  const strictPortPattern = /(\s+strictPort:\s*true,\s*\n)/

  if (!strictPortPattern.test(source)) {
    throw new Error(
      '无法定位 vite.config.ts 中的 strictPort: true，请检查文件是否已经改变。',
    )
  }

  return source.replace(
    strictPortPattern,
    `$1    hmr: {
      // 使用 Hybrid Canvas 自己的错误界面，禁止显示 Vite 默认 Overlay。
      overlay: false,
    },
`,
  )
}

function updateIndexHtml(source) {
  let next = source

  if (!next.includes('id="bootstrap-fallback-styles"')) {
    const styleMarker = '    <style id="window-backing-surface">'

    if (!next.includes(styleMarker)) {
      throw new Error(
        '无法定位 index.html 中的 window-backing-surface 样式。',
      )
    }

    const fallbackStyles = `    <style id="bootstrap-fallback-styles">
      #bootstrap-fallback {
        box-sizing: border-box;
        display: grid;
        width: 100%;
        height: 100%;
        place-items: center;
        padding: 32px;
        color: #18181b;
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
      }

      #bootstrap-fallback-card {
        box-sizing: border-box;
        width: min(100%, 680px);
        padding: 24px;
        overflow: hidden;
        background: #ffffff;
        border: 1px solid #dedede;
        border-radius: 16px;
        box-shadow:
          0 16px 48px rgb(0 0 0 / 10%),
          0 2px 8px rgb(0 0 0 / 6%);
      }

      #bootstrap-fallback-icon {
        display: grid;
        width: 40px;
        height: 40px;
        place-items: center;
        color: #b42318;
        font-size: 20px;
        font-weight: 700;
        background: #fee4e2;
        border-radius: 12px;
      }

      #bootstrap-fallback-title {
        margin: 18px 0 0;
        font-size: 18px;
        line-height: 28px;
      }

      #bootstrap-fallback-description {
        margin: 8px 0 0;
        color: #667085;
        font-size: 14px;
        line-height: 22px;
      }

      #bootstrap-fallback-details {
        display: none;
        margin-top: 16px;
        padding: 12px;
        overflow: hidden;
        background: #f4f4f5;
        border-radius: 10px;
      }

      #bootstrap-fallback-details[data-visible="true"] {
        display: block;
      }

      #bootstrap-fallback-diagnostic {
        max-height: 320px;
        margin: 0;
        overflow: auto;
        color: #3f3f46;
        font-family:
          "Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono",
          monospace;
        font-size: 11px;
        line-height: 18px;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        user-select: text;
      }

      #bootstrap-fallback-actions {
        display: none;
        gap: 8px;
        margin-top: 16px;
        flex-wrap: wrap;
      }

      #bootstrap-fallback-actions[data-visible="true"] {
        display: flex;
      }

      .bootstrap-fallback-button {
        min-height: 36px;
        padding: 0 14px;
        color: #18181b;
        font: inherit;
        font-size: 13px;
        font-weight: 600;
        background: #ffffff;
        border: 1px solid #d4d4d8;
        border-radius: 8px;
        cursor: pointer;
      }

      .bootstrap-fallback-button:hover {
        background: #f4f4f5;
      }

      .bootstrap-fallback-button[data-primary="true"] {
        color: #ffffff;
        background: #18181b;
        border-color: #18181b;
      }
    </style>

`

    next = next.replace(styleMarker, `${fallbackStyles}${styleMarker}`)
  }

  if (!next.includes('id="bootstrap-fallback"')) {
    const rootPattern = /<div id="root"><\/div>/

    if (!rootPattern.test(next)) {
      throw new Error('无法定位 index.html 中的空 #root 元素。')
    }

    next = next.replace(
      rootPattern,
      `<div id="root">
      <main id="bootstrap-fallback" role="status">
        <section
          aria-labelledby="bootstrap-fallback-title"
          id="bootstrap-fallback-card"
        >
          <div aria-hidden="true" id="bootstrap-fallback-icon">!</div>
          <h1 id="bootstrap-fallback-title">Hybrid Canvas 正在启动</h1>
          <p id="bootstrap-fallback-description">
            正在加载应用组件，请稍候。
          </p>

          <section
            aria-label="技术详情"
            id="bootstrap-fallback-details"
          >
            <pre id="bootstrap-fallback-diagnostic"></pre>
          </section>

          <div id="bootstrap-fallback-actions">
            <button
              class="bootstrap-fallback-button"
              data-primary="true"
              id="bootstrap-fallback-reload"
              type="button"
            >
              重新加载
            </button>
            <button
              class="bootstrap-fallback-button"
              id="bootstrap-fallback-copy"
              type="button"
            >
              复制诊断信息
            </button>
          </div>
        </section>
      </main>
    </div>`,
    )
  }

  if (!next.includes('/src/bootstrap/bootstrap-fallback.ts')) {
    const mainScript =
      '    <script src="/src/main.tsx" type="module"></script>'

    if (!next.includes(mainScript)) {
      throw new Error('无法定位 index.html 中的 main.tsx 入口。')
    }

    next = next.replace(
      mainScript,
      `    <!-- 必须先于 React 入口加载，确保应用模块失败时仍有错误 UI。 -->
    <script
      src="/src/bootstrap/bootstrap-fallback.ts"
      type="module"
    ></script>
${mainScript}`,
    )
  }

  return next
}

const bootstrapFallbackSource = `
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
    \`时间: \${new Date().toISOString()}\`,
    \`启动时间: \${startedAt}\`,
    \`错误类型: \${error.name}\`,
    \`错误信息: \${error.message}\`,
    source ? \`来源: \${source}\` : undefined,
    typeof line === 'number' ? \`行: \${line}\` : undefined,
    typeof column === 'number' ? \`列: \${column}\` : undefined,
    \`页面: \${window.location.href}\`,
    \`User Agent: \${navigator.userAgent}\`,
    error.stack ? \`\\nStack:\\n\${error.stack}\` : undefined,
  ]
    .filter((item): item is string => Boolean(item))
    .join('\\n')
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
`

const applicationErrorBoundarySource = `
import { Button } from '@hybrid-canvas/design-system'
import { error as reportError } from '@hybrid-canvas/foundations-observability'
import {
  AlertTriangle,
  ClipboardCopy,
  RotateCcw,
} from 'lucide-react'
import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react'

interface ApplicationErrorBoundaryProps {
  readonly children: ReactNode
}

interface ApplicationErrorBoundaryState {
  readonly error: Error | null
  readonly componentStack: string | null
  readonly occurredAt: string | null
  readonly copied: boolean
}

function createDiagnosticText(
  error: Error,
  componentStack: string | null,
  occurredAt: string | null,
): string {
  return [
    \`时间: \${occurredAt ?? new Date().toISOString()}\`,
    \`错误类型: \${error.name || 'Error'}\`,
    \`错误信息: \${error.message || '未知错误'}\`,
    \`页面: \${window.location.href}\`,
    \`User Agent: \${navigator.userAgent}\`,
    error.stack ? \`\\nJavaScript Stack:\\n\${error.stack}\` : undefined,
    componentStack
      ? \`\\nReact Component Stack:\\n\${componentStack}\`
      : undefined,
  ]
    .filter((item): item is string => Boolean(item))
    .join('\\n')
}

export class ApplicationErrorBoundary extends Component<
  ApplicationErrorBoundaryProps,
  ApplicationErrorBoundaryState
> {
  override state: ApplicationErrorBoundaryState = {
    error: null,
    componentStack: null,
    occurredAt: null,
    copied: false,
  }

  static getDerivedStateFromError(
    error: Error,
  ): Partial<ApplicationErrorBoundaryState> {
    return {
      error,
      occurredAt: new Date().toISOString(),
      copied: false,
    }
  }

  override componentDidCatch(
    error: Error,
    errorInfo: ErrorInfo,
  ): void {
    const componentStack = errorInfo.componentStack ?? null

    this.setState({ componentStack })

    reportError('Application rendering failed', {
      scope: 'application-error-boundary',
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
      componentStack,
    })
  }

  private readonly copyDiagnostic = async (): Promise<void> => {
    const { error, componentStack, occurredAt } = this.state

    if (!error) {
      return
    }

    const diagnostic = createDiagnosticText(
      error,
      componentStack,
      occurredAt,
    )

    try {
      await navigator.clipboard.writeText(diagnostic)
      this.setState({ copied: true })
    } catch (cause: unknown) {
      reportError('Copying application diagnostic failed', {
        scope: 'application-error-boundary',
        cause,
      })
    }
  }

  override render(): ReactNode {
    const {
      error,
      componentStack,
      occurredAt,
      copied,
    } = this.state

    if (!error) {
      return this.props.children
    }

    const diagnostic = createDiagnosticText(
      error,
      componentStack,
      occurredAt,
    )

    return (
      <main
        className="grid h-dvh place-items-center overflow-auto bg-background p-8 text-foreground"
        role="alert"
      >
        <section className="w-full max-w-3xl rounded-2xl border bg-surface p-6 shadow-xl">
          <div className="grid size-10 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </div>

          <h1 className="mt-5 text-lg font-semibold">
            应用遇到严重错误
          </h1>

          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Hybrid Canvas 无法继续显示当前界面。你可以复制完整诊断信息，
            然后重新加载应用。
          </p>

          <details
            className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground"
            open
          >
            <summary className="cursor-pointer font-medium">
              完整技术详情
            </summary>

            <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5">
              {diagnostic}
            </pre>
          </details>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              onClick={() => window.location.reload()}
              type="button"
            >
              <RotateCcw className="size-4" />
              重新加载
            </Button>

            <Button
              onClick={() => {
                void this.copyDiagnostic()
              }}
              type="button"
              variant="outline"
            >
              <ClipboardCopy className="size-4" />
              {copied ? '已复制' : '复制诊断信息'}
            </Button>
          </div>
        </section>
      </main>
    )
  }
}
`

async function main() {
  await Promise.all([
    assertFileExists(paths.viteConfig),
    assertFileExists(paths.indexHtml),
    assertFileExists(paths.errorBoundary),
  ])

  const [viteConfig, indexHtml] = await Promise.all([
    readUtf8(paths.viteConfig),
    readUtf8(paths.indexHtml),
  ])

  const nextViteConfig = updateViteConfig(viteConfig)
  const nextIndexHtml = updateIndexHtml(indexHtml)

  await Promise.all([
    atomicWrite(paths.viteConfig, nextViteConfig),
    atomicWrite(paths.indexHtml, nextIndexHtml),
    atomicWrite(paths.bootstrapFallback, bootstrapFallbackSource),
    atomicWrite(paths.errorBoundary, applicationErrorBoundarySource),
  ])

  console.log('')
  console.log('修改完成。建议执行：')
  console.log('  pnpm install')
  console.log('  pnpm --filter @hybrid-canvas/desktop typecheck')
  console.log('  pnpm --filter @hybrid-canvas/desktop dev')
}

main().catch((error) => {
  console.error('')
  console.error('修改失败：')
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})