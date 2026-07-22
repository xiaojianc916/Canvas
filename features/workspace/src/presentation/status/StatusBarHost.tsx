import type { ReactNode } from 'react'

export interface StatusBarHostProps {
  readonly left: ReactNode
  readonly right?: ReactNode
}

export function StatusBarHost({ left, right }: StatusBarHostProps) {
  return (
    <footer className="col-[2/-1] flex h-(--status-height) items-center justify-between border-t border-divider bg-chrome px-3 text-[10px] text-muted-foreground">
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {left}
      </div>
      {right ? (
        <div className="ml-3 flex shrink-0 items-center gap-3">
          {right}
        </div>
      ) : null}
    </footer>
  )
}
