import { DangerCircle, Inbox, Spinner } from '@mynaui/icons-react'import type { ReactNode } from 'react'
import { Button } from './button'

export function LoadingState({ label = '正在加载…' }: { readonly label?: string }) {
  return (
    <div className="grid min-h-32 place-items-center text-sm text-muted-foreground" role="status">
      <span className="flex items-center gap-2">
        <Spinner aria-hidden="true" className="size-4 animate-spin" />
        {label}
      </span>
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  readonly title: string
  readonly description: string
  readonly action?: ReactNode
}) {
  return (
    <section className="grid min-h-40 place-items-center px-6 text-center">
      <div>
        <Inbox aria-hidden="true" className="mx-auto size-5 text-muted-foreground" />

        <h3 className="mt-3 text-sm font-semibold">{title}</h3>

        <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{description}</p>

        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </section>
  )
}

export function ErrorState({
  title = '暂时无法完成操作',
  message,
  onRetry,
}: {
  readonly title?: string
  readonly message: string
  readonly onRetry?: () => void
}) {
  return (
    <section className="grid min-h-40 place-items-center px-6 text-center" role="alert">
      <div>
        <DangerCircle aria-hidden="true" className="mx-auto size-5 text-destructive" />

        <h3 className="mt-3 text-sm font-semibold">{title}</h3>

        <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{message}</p>

        {onRetry ? (
          <Button className="mt-4" onClick={onRetry} size="sm" type="button" variant="outline">
            重试
          </Button>
        ) : null}
      </div>
    </section>
  )
}
