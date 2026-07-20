import {
  Button,
  cn,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@hybrid-canvas/design-system'
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
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-sidebar">
      <header className="flex h-11 shrink-0 items-center border-b border-divider px-3">
        <div>
          <h2 className="text-xs font-semibold">页面</h2>
          <p className="text-[10px] text-muted-foreground">当前文档中的画布页面</p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
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
          </TooltipTrigger>
          <TooltipContent side="bottom">新建页面</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="收起页面栏"
              className="size-7"
              onClick={onClose}
              size="icon"
              type="button"
              variant="ghost"
            >
              <PanelLeftClose className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">收起页面栏</TooltipContent>
        </Tooltip>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2">
          {pages.length > 0 ? (
            <div className="space-y-0.5">
              {pages.map((page) => (
                <button
                  aria-current={page.isActive ? 'page' : undefined}
                  className={cn(
                    'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground',
                    page.isActive && 'bg-sidebar-accent text-foreground',
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
            <div className="px-3 py-10 text-center">
              <div className="mx-auto grid size-9 place-items-center rounded-lg border border-divider bg-background">
                <Grid2X2 className="size-4 text-muted-foreground" />
              </div>
              <p className="mt-3 text-xs font-medium">还没有页面</p>
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                创建页面后即可开始绘制
              </p>
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
    </section>
  )
}

function PageIcon({ model }: { readonly model: WorkspacePageViewModel }) {
  if (model.isArchived) {
    return <Archive className="size-3.5 shrink-0" />
  }
  if (model.kind === 'canvas') {
    return <Grid2X2 className="size-3.5 shrink-0" />
  }
  return <FileText className="size-3.5 shrink-0" />
}
