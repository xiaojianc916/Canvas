import { Button, cn, ScrollArea } from '@hybrid-canvas/design-system'
import { Archive, FileText, Grid2X2, PanelLeftClose, Plus } from 'lucide-react'

import type { PageId, WorkspacePageViewModel } from '../../application/model/workbench-view-model'

export interface WorkspaceSidebarProps {
  readonly pages: readonly WorkspacePageViewModel[]
  readonly onClose: () => void
  readonly onActivatePage: (pageId: PageId) => void
  readonly onCreatePage: () => void
}

export function WorkspaceSidebar({
  pages,
  onClose,
  onActivatePage,
  onCreatePage,
}: WorkspaceSidebarProps) {
  return (
    <aside className="min-h-0 min-w-0 border-r bg-sidebar">
      <header className="flex h-10 items-center px-3">
        <span className="text-[11px] font-semibold tracking-wide">页面</span>
        <Button
          aria-label="新建页面"
          className="ml-auto size-7"
          onClick={onCreatePage}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Plus className="size-3.5" />
        </Button>
        <Button
          aria-label="收起侧栏"
          className="size-7"
          onClick={onClose}
          size="icon"
          type="button"
          variant="ghost"
        >
          <PanelLeftClose className="size-3.5" />
        </Button>
      </header>
      <ScrollArea className="h-[calc(100%-2.5rem)]">
        <div className="px-2 pb-6">
          {pages.length > 0 ? (
            <div className="space-y-0.5">
              {pages.map((page) => (
                <button
                  aria-current={page.isActive ? 'page' : undefined}
                  className={cn(
                    'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[12px] text-muted-foreground',
                    'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    page.isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
                  )}
                  key={page.pageId}
                  onClick={() => onActivatePage(page.pageId)}
                  type="button"
                >
                  <PageIcon model={page} />
                  <span className="truncate">{page.title}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-8 text-center">
              <p className="text-[11px] text-muted-foreground">当前文档没有页面</p>
              <Button
                className="mt-3"
                onClick={onCreatePage}
                size="sm"
                type="button"
                variant="outline"
              >
                <Plus className="size-3.5" />
                新建页面
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  )
}

function PageIcon({ model }: { readonly model: WorkspacePageViewModel }) {
  if (model.isArchived) return <Archive className="size-3.5 shrink-0" />
  if (model.kind === 'canvas') return <Grid2X2 className="size-3.5 shrink-0" />
  return <FileText className="size-3.5 shrink-0" />
}
