
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
    `时间: ${occurredAt ?? new Date().toISOString()}`,
    `错误类型: ${error.name || 'Error'}`,
    `错误信息: ${error.message || '未知错误'}`,
    `页面: ${window.location.href}`,
    `User Agent: ${navigator.userAgent}`,
    error.stack ? `\nJavaScript Stack:\n${error.stack}` : undefined,
    componentStack
      ? `\nReact Component Stack:\n${componentStack}`
      : undefined,
  ]
    .filter((item): item is string => Boolean(item))
    .join('\n')
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
