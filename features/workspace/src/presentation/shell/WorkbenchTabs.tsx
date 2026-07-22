import { Button, cn } from '@hybrid-canvas/design-system'
import { Boxes, FilePlus2, FileText, Image, Network, Plus, Search, Workflow, X } from 'lucide-react'
import { type ComponentType, type KeyboardEvent, useEffect, useRef } from 'react'

import type { WorkbenchTabId, WorkbenchTabViewModel } from '../../contracts/workbench-contract'

export interface WorkbenchTabsProps {
  readonly tabs: readonly WorkbenchTabViewModel[]
  readonly onActivate: (tabId: WorkbenchTabId) => void
  readonly onClose: (tabId: WorkbenchTabId) => void
  readonly onCreate: () => void
}

type TabIcon = ComponentType<{
  readonly className?: string
  readonly 'aria-hidden'?: boolean | 'true' | 'false'
}>

export function WorkbenchTabs({ tabs, onActivate, onClose, onCreate }: WorkbenchTabsProps) {
  const tabRefs = useRef(new Map<WorkbenchTabId, HTMLButtonElement>())

  const activeTabId = tabs.find((tab) => tab.isActive)?.id

  useEffect(() => {
    if (!activeTabId) {
      return
    }

    tabRefs.current.get(activeTabId)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeTabId])

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tabId: WorkbenchTabId): void {
    const currentIndex = tabs.findIndex((tab) => tab.id === tabId)

    if (currentIndex < 0) {
      return
    }

    let nextIndex = currentIndex

    switch (event.key) {
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
        break
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % tabs.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = tabs.length - 1
        break
      case 'Delete': {
        const tab = tabs[currentIndex]
        if (tab?.canClose) {
          event.preventDefault()
          onClose(tab.id)
        }
        return
      }
      default:
        return
    }

    const nextTab = tabs[nextIndex]

    if (!nextTab) {
      return
    }

    event.preventDefault()
    onActivate(nextTab.id)
    tabRefs.current.get(nextTab.id)?.focus()
  }

  return (
    <div className="flex h-full min-w-0 flex-1 bg-chrome">
      <div
        aria-label="工作台标签页"
        className="flex h-full min-w-0 flex-1 items-end overflow-x-auto overflow-y-hidden px-3"
        role="tablist"
      >
        {tabs.map((tab) => {
          const Icon = resolveTabIcon(tab)

          return (
            <div
              className={cn(
                'group relative flex h-[calc(100%-5px)] w-52 shrink-0 items-center',
                'border-r border-divider/70',
                tab.isActive
                  ? 'rounded-t-lg border-x border-t border-divider bg-background'
                  : 'bg-transparent hover:bg-foreground/5',
              )}
              key={tab.id}
            >
              <button
                aria-controls={'workbench-panel-' + encodeDomId(tab.id)}
                aria-selected={tab.isActive}
                className={cn(
                  'flex h-full min-w-0 flex-1 items-center gap-2 px-3 text-left text-xs',
                  'outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
                  tab.isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
                id={'workbench-tab-' + encodeDomId(tab.id)}
                onClick={() => onActivate(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                ref={(node) => {
                  if (node) {
                    tabRefs.current.set(tab.id, node)
                  } else {
                    tabRefs.current.delete(tab.id)
                  }
                }}
                role="tab"
                tabIndex={tab.isActive ? 0 : -1}
                type="button"
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{tab.title}</span>
                <TabStatus model={tab} />
              </button>

              {tab.canClose ? (
                <Button
                  aria-label={'关闭 ' + tab.title}
                  className={cn(
                    'mr-1 size-7 shrink-0 rounded-md',
                    'text-muted-foreground opacity-0',
                    'hover:bg-foreground/10 hover:text-foreground',
                    'focus-visible:opacity-100 group-hover:opacity-100',
                    tab.isActive && 'opacity-100',
                  )}
                  onClick={(event) => {
                    event.stopPropagation()
                    onClose(tab.id)
                  }}
                  size="icon"
                  tabIndex={-1}
                  type="button"
                  variant="ghost"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </Button>
              ) : null}
            </div>
          )
        })}

        <div className="flex h-full shrink-0 items-center px-2">
          <Button
            aria-label="新建画板"
            className="size-8 rounded-full"
            onClick={onCreate}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Plus aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function TabStatus({ model }: { readonly model: WorkbenchTabViewModel }) {
  if (model.kind !== 'canvas' || !model.status || model.status === 'clean') {
    return null
  }

  const label = {
    dirty: '未保存',
    saving: '正在保存',
    failed: '保存失败',
  }[model.status]

  return (
    <span
      aria-label={label}
      className={cn(
        'size-2 shrink-0 rounded-full',
        model.status === 'dirty' && 'bg-amber-500',
        model.status === 'saving' && 'animate-pulse bg-sky-500',
        model.status === 'failed' && 'bg-destructive',
      )}
    />
  )
}

function resolveTabIcon(model: WorkbenchTabViewModel): TabIcon {
  if (model.kind === 'start') {
    return FilePlus2
  }

  if (model.kind === 'canvas') {
    return FileText
  }

  switch (model.surfaceId) {
    case 'assets':
      return Image
    case 'relations':
      return Network
    case 'search':
      return Search
    case 'extensions':
      return Boxes
    case 'data':
      return Workflow
    default:
      return FileText
  }
}

function encodeDomId(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9_-]/g, '-')
}
