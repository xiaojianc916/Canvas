import {
  Button,
  cn,
  ScrollArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@hybrid-canvas/design-system'
import {
  Archive,
  Boxes,
  ChartNoAxesCombined,
  FileText,
  Files,
  Grid2X2,
  Image,
  Layers3,
  Network,
  PanelLeftClose,
  Plus,
  Search,
} from 'lucide-react'

import type { PageId, WorkspacePageViewModel } from '../../application/model/workbench-view-model'
import type { CanvasNavigationItemId } from './ActivityRail'

export interface WorkspaceSidebarProps {
  readonly activeNavigationItem: CanvasNavigationItemId
  readonly pages: readonly WorkspacePageViewModel[]
  readonly onClose: () => void
  readonly onActivatePage: (pageId: PageId) => void
  readonly onCreatePage: () => void
}

export function WorkspaceSidebar({
  activeNavigationItem,
  pages,
  onClose,
  onActivatePage,
  onCreatePage,
}: WorkspaceSidebarProps) {
  if (activeNavigationItem !== 'pages') {
    return <WorkspacePanel kind={activeNavigationItem} />
  }

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-sidebar">
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-2.5">
          <div className="mb-4 flex h-8 items-center gap-2 rounded-md border border-divider bg-background px-2 text-muted-foreground shadow-[inset_0_1px_1px_rgba(0,0,0,0.02)]">
            <Search className="size-3.5 shrink-0" />
            <span className="text-[11px]">筛选页面</span>
            <kbd className="ml-auto rounded border bg-muted/30 px-1 py-0.5 text-[9px] opacity-60">⌘ F</kbd>
          </div>
          <div className="mb-1.5 flex items-center justify-between px-2 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">画布</span>
            <span className="grid size-4 place-items-center rounded-full bg-muted text-[9px] text-muted-foreground">{pages.length}</span>
          </div>
          {pages.length > 0 ? (
            <div className="space-y-0.5">
              {pages.map((page) => (
                <button
                  aria-current={page.isActive ? 'page' : undefined}
                  className={cn(
                    'group flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground',
                    page.isActive && 'bg-sidebar-accent text-foreground shadow-[inset_2px_0_0_var(--color-foreground)]',
                  )}
                  key={page.pageId}
                  onClick={() => onActivatePage(page.pageId)}
                  type="button"
                >
                  <PageIcon model={page} />
                  <span className="truncate font-medium">{page.title}</span>
                  {page.isActive ? <span className="ml-auto size-1.5 rounded-full bg-primary" /> : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-10 text-center">
              <div className="mx-auto grid size-9 place-items-center rounded-lg border border-divider bg-background">
                <Grid2X2 className="size-4 text-muted-foreground" />
              </div>
              <p className="mt-3 text-xs font-medium">还没有页面</p>
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">创建页面后即可开始绘制</p>
              <Button className="mt-3" onClick={onCreatePage} size="sm" type="button" variant="outline">
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

const PANEL_DETAILS: Record<Exclude<CanvasNavigationItemId, 'pages'>, { title: string; description: string; icon: typeof Files }> = {
  documents: { title: '文档', description: '在这里管理最近打开的画板与本地文件。', icon: Files },
  search: { title: '搜索', description: '搜索当前工作区中的页面、对象和文本内容。', icon: Search },
  layers: { title: '图层', description: '选择页面后，可在这里浏览和整理图层。', icon: Layers3 },
  relations: { title: '关系', description: '连接画布中的内容，建立可视化关系。', icon: Network },
  data: { title: '数据', description: '连接数据源，将信息带入你的画布。', icon: ChartNoAxesCombined },
  assets: { title: '资源', description: '集中管理图片、附件和可复用素材。', icon: Image },
  extensions: { title: '扩展', description: '探索能够增强画布工作流的扩展能力。', icon: Boxes },
}

function WorkspacePanel({ kind }: { readonly kind: Exclude<CanvasNavigationItemId, 'pages'> }) {
  const { title, description, icon: Icon } = PANEL_DETAILS[kind]
  return (
    <section className="grid h-full min-h-0 place-items-center bg-sidebar px-6 text-center">
      <div className="max-w-44"><div className="mx-auto grid size-10 place-items-center rounded-xl border border-divider bg-background shadow-sm"><Icon className="size-4 text-muted-foreground" /></div><p className="mt-3 text-xs font-medium">{title}</p><p className="mt-1 text-[10px] leading-5 text-muted-foreground">{description}</p></div>
    </section>
  )
}

function PageIcon({ model }: { readonly model: WorkspacePageViewModel }) {
  if (model.isArchived) return <Archive className="size-3.5 shrink-0" />
  if (model.kind === 'canvas') return <Grid2X2 className="size-3.5 shrink-0" />
  return <FileText className="size-3.5 shrink-0" />
}
