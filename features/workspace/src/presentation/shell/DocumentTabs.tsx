import { Button, cn, Tooltip, TooltipContent, TooltipTrigger } from '@hybrid-canvas/design-system'
import { PanelLeftClose, Plus, X } from 'lucide-react'

import type {
  DocumentPersistenceViewModel,
  DocumentSessionId,
  DocumentTabViewModel,
} from '../../application/model/workbench-view-model'

export interface DocumentTabsProps {
  readonly tabs: readonly DocumentTabViewModel[]
  readonly onActivate: (sessionId: DocumentSessionId) => void
  readonly onClose: (sessionId: DocumentSessionId) => void
  readonly onCreate: () => void
}

export function DocumentTabs({ tabs, onActivate, onClose, onCreate }: DocumentTabsProps) {
  return (
    <header className="flex min-w-0 items-end border-b bg-chrome">
      <div
        aria-label="已打开文档"
        className="flex h-11 min-w-0 flex-1 items-end gap-1 overflow-x-auto px-2"
        role="tablist"
      >
        {tabs.map((tab) => (
          <DocumentTab key={tab.sessionId} model={tab} onActivate={onActivate} onClose={onClose} />
        ))}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="新建画板"
              className="mb-1 size-7 shrink-0"
              onClick={onCreate}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Plus className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">新建画板</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex h-11 shrink-0 items-center gap-0.5 px-2">
        <Button
          aria-label="收起侧边栏"
          className="size-8"
          size="icon"
          type="button"
          variant="ghost"
        >
          <PanelLeftClose className="size-4" />
        </Button>
      </div>
    </header>
  )
}

interface DocumentTabProps {
  readonly model: DocumentTabViewModel
  readonly onActivate: (sessionId: DocumentSessionId) => void
  readonly onClose: (sessionId: DocumentSessionId) => void
}

function DocumentTab({ model, onActivate, onClose }: DocumentTabProps) {
  return (
    <div
      aria-selected={model.isActive}
      className={cn(
        'group relative mb-[3px] flex h-8 min-w-36 max-w-64 shrink-0 items-center gap-2 px-3 text-[12px] text-muted-foreground',
        'rounded-t-[10px] hover:bg-accent/70 hover:text-foreground',
        'after:pointer-events-none after:absolute after:inset-y-1 after:right-0 after:w-px after:bg-divider/70',
        model.isActive && [
          '-mb-px h-[35px] bg-background text-foreground after:hidden',
          'before:pointer-events-none before:absolute before:-left-2 before:bottom-0 before:size-2',
          'before:rounded-br-[8px] before:shadow-[4px_4px_0_4px_var(--background)]',
          '[&>span[data-tab-curve=right]]:block',
        ],
      )}
      onClick={() => onActivate(model.sessionId)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onActivate(model.sessionId)
        }
      }}
      role="tab"
      tabIndex={0}
    >
      <span className="truncate">{model.title}</span>
      <DocumentPersistenceIndicator model={model.persistence} />
      {model.canClose ? (
        <Button
          aria-label={`关闭 ${model.title}`}
          className="ml-auto size-5 shrink-0 opacity-60 hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation()
            onClose(model.sessionId)
          }}
          size="icon"
          type="button"
          variant="ghost"
        >
          <X className="size-3" />
        </Button>
      ) : null}
    </div>
  )
}

function DocumentPersistenceIndicator({ model }: { readonly model: DocumentPersistenceViewModel }) {
  if (model.local === 'failed') {
    return (
      <span
        className="size-1.5 shrink-0 rounded-full bg-red-500"
        role="img"
        title="本地保存失败"
      />
    )
  }
  if (model.local === 'saving') {
    return (
      <span
        className="size-1.5 shrink-0 animate-pulse rounded-full bg-blue-500"
        role="img"
        title="正在保存"
      />
    )
  }
  if (model.local === 'dirty') {
    return (
      <span
        className="size-1.5 shrink-0 rounded-full bg-amber-500"
        role="img"
        title="存在未保存更改"
      />
    )
  }
  if (model.remote === 'conflicted') {
    return (
      <span
        className="size-1.5 shrink-0 rounded-full bg-red-500"
        role="img"
        title="远程同步冲突"
      />
    )
  }
  if (model.remote === 'syncing') {
    return (
      <span
        className="size-1.5 shrink-0 animate-pulse rounded-full bg-violet-500"
        role="img"
        title="正在同步"
      />
    )
  }
  if (model.remote === 'synced') {
    return (
      <span
        className="size-1.5 shrink-0 rounded-full bg-emerald-500"
        role="img"
        title="已同步"
      />
    )
  }
  return null
}
