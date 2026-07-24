import type { ReactNode } from 'react'

export interface StatusBarHostProps {
  readonly left: ReactNode
  readonly right?: ReactNode
}

export function StatusBarHost({ left, right }: StatusBarHostProps) {
  return (
    <footer
      aria-label="画布状态栏"
      className="
        flex h-(--status-height) min-w-0 items-center
        border-t border-divider bg-chrome
        text-[11px] text-muted-foreground
      "
    >
      <div
        className="
          flex min-w-0 flex-1 items-center gap-1 overflow-x-auto
          px-2 whitespace-nowrap
          [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
        "
      >
        {left}
      </div>

      {right ? (
        <div
          className="
            flex h-full shrink-0 items-center gap-2
            border-l border-divider px-3
          "
        >
          {right}
        </div>
      ) : null}
    </footer>
  )
}
