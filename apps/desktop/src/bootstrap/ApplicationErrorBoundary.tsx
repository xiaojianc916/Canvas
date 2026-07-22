import { Button } from '@hybrid-canvas/design-system'
import { error as reportError } from '@hybrid-canvas/foundations-observability'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ApplicationErrorBoundaryProps {
  readonly children: ReactNode
}

interface ApplicationErrorBoundaryState {
  readonly error: Error | null
}

export class ApplicationErrorBoundary extends Component<
  ApplicationErrorBoundaryProps,
  ApplicationErrorBoundaryState
> {
  override state: ApplicationErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ApplicationErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    reportError('Application rendering failed', {
      scope: 'application-error-boundary',
      error,
      componentStack: errorInfo.componentStack,
    })
  }

  override render() {
    const { error } = this.state
    if (!error) {
      return this.props.children
    }

    return (
      <main className="grid h-dvh place-items-center bg-background p-8 text-foreground">
        <section className="w-full max-w-lg rounded-2xl border bg-surface p-6 shadow-xl">
          <div className="grid size-10 place-items-center rounded-xl bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <h1 className="mt-5 text-lg font-semibold">应用无法完成启动</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            界面发生了未处理错误。错误信息已输出到开发日志，你可以重新加载后继续。
          </p>
          <details className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium">技术详情</summary>
            <pre className="mt-2 max-h-32 overflow-auto text-[11px] leading-5">{error.message}</pre>
          </details>
          <Button className="mt-5" onClick={() => window.location.reload()} type="button">
            <RotateCcw className="size-4" />
            重新加载
          </Button>
        </section>
      </main>
    )
  }
}
