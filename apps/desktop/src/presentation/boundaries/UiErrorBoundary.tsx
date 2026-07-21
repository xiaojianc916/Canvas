import { error as reportError } from '@hybrid-canvas/foundations-observability'
import { Component, type ErrorInfo, type ReactNode } from 'react'

export interface UiErrorBoundaryProps {
  readonly area: string
  readonly children: ReactNode
  readonly fallback?: ReactNode
}

interface UiErrorBoundaryState {
  readonly error: Error | null
}

export class UiErrorBoundary extends Component<UiErrorBoundaryProps, UiErrorBoundaryState> {
  override state: UiErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): UiErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError('UI boundary failed', {
      scope: 'ui-error-boundary',
      area: this.props.area,
      error,
      componentStack: info.componentStack,
    })
  }

  override render(): ReactNode {
    if (!this.state.error) {
      return this.props.children
    }
    return (
      this.props.fallback ?? (
        <section role="alert" className="grid size-full place-items-center p-6 text-center">
          <div>
            <h2 className="text-base font-semibold">界面区域暂时不可用</h2>
            <p className="mt-2 text-sm text-muted-foreground">{this.props.area}</p>
            <button
              className="mt-4 rounded-md border border-divider px-3 py-2 text-sm"
              onClick={() => this.setState({ error: null })}
              type="button"
            >
              重试
            </button>
          </div>
        </section>
      )
    )
  }
}
