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

export function DocumentTabs({
  tabs,
  onActivate,
  onClose,
  onCreate,
}: DocumentTabsProps) {
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
        <Button aria-label="收起侧边栏" className="size-8" size="icon" type="button" variant="ghost"><PanelLeftClose className="size-4" /></Button>
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
        'group mb-[3px] flex h-8 min-w-36 max-w-64 shrink-0 items-center gap-2 rounded-md border px-2.5 text-[12px] text-muted-foreground',
        'hover:bg-accent/70 hover:text-foreground',
        model.isActive &&
          '-mb-px h-[35px] rounded-b-none border-b-background bg-background text-foreground',
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
        aria-label="本地保存失败"
        className="size-1.5 shrink-0 rounded-full bg-red-500"
        title="本地保存失败"
      />
    )
  }
  if (model.local === 'saving') {
    return (
      <span
        aria-label="正在保存"
        className="size-1.5 shrink-0 animate-pulse rounded-full bg-blue-500"
        title="正在保存"
      />
    )
  }
  if (model.local === 'dirty') {
    return (
      <span
        aria-label="存在未保存更改"
        className="size-1.5 shrink-0 rounded-full bg-amber-500"
        title="存在未保存更改"
      />
    )
  }
  if (model.remote === 'conflicted') {
    return (
      <span
        aria-label="远程同步冲突"
        className="size-1.5 shrink-0 rounded-full bg-red-500"
        title="远程同步冲突"
      />
    )
  }
  if (model.remote === 'syncing') {
    return (
      <span
        aria-label="正在同步"
        className="size-1.5 shrink-0 animate-pulse rounded-full bg-violet-500"
        title="正在同步"
      />
    )
  }
  if (model.remote === 'synced') {
    return (
      <span
        aria-label="已同步"
        className="size-1.5 shrink-0 rounded-full bg-emerald-500"
        title="已同步"
      />
    )
  }
  return null
}
