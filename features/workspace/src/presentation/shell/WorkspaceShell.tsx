import { Button, TooltipProvider } from '@hybrid-canvas/design-system'
import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useState } from 'react'

import type { WorkspaceShellProps } from '../../contracts/shell-contract'
import { NoDocumentSurface } from '../empty/NoDocumentSurface'
import { InspectorHost } from '../inspector/InspectorHost'
import { StatusBarHost } from '../status/StatusBarHost'
import { ActivityRail, type CanvasNavigationItemId } from './ActivityRail'
import { DocumentTabs } from './DocumentTabs'
import { CanvasChrome } from './WorkspaceChrome'
import { WorkspaceSidebar } from './WorkspaceSidebar'

export function WorkspaceShell({
  model,
  actions,
  editor,
  inspector,
  statusLeft,
  statusRight,
}: WorkspaceShellProps) {
  const [isSidebarOpen, setSidebarOpen] = useState(true)
  const [isInspectorOpen, setInspectorOpen] = useState(true)
  const [activeNavigationItem, setActiveNavigationItem] = useState<CanvasNavigationItemId>('pages')

  const hasActiveDocument = model.activeDocument !== null
  const workbenchState = hasActiveDocument ? 'document' : 'empty'
  const gridTemplateColumns = [
    'var(--activity-rail-width)',
    isSidebarOpen ? 'var(--workspace-sidebar-width)' : '0px',
    'minmax(0, 1fr)',
    isInspectorOpen && hasActiveDocument ? 'var(--inspector-width)' : '0px',
  ].join(' ')
  const gridTemplateRows = hasActiveDocument
    ? 'var(--chrome-height) minmax(0, 1fr) var(--status-height)'
    : 'var(--chrome-height) minmax(0, 1fr)'

  return (
    <TooltipProvider delayDuration={450}>
      <div
        className="relative grid h-dvh min-h-0 overflow-hidden bg-background text-foreground"
        data-workbench-state={workbenchState}
        role="application"
        style={{
          gridTemplateColumns,
          gridTemplateRows,
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-(--chrome-height) z-40 h-px bg-divider"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-(--activity-rail-width) top-(--chrome-height) z-40 h-px w-(--workspace-sidebar-width) bg-divider"
        />
        <CanvasChrome
          rail={
            <ActivityRail
              activeItemId={activeNavigationItem}
              onItemActivate={(itemId) => {
                setActiveNavigationItem(itemId)
                setSidebarOpen(true)
              }}
              onSettingsOpen={actions.openSettingsWindow}
            />
          }
          onWindowClose={actions.closeWindow}
          onWindowMaximize={actions.maximizeWindow}
          onWindowMinimize={actions.minimizeWindow}
          onWindowStartDragging={actions.startWindowDragging}
          onSidebarToggle={() => setSidebarOpen((open) => !open)}
          isSidebarOpen={isSidebarOpen}
          tabs={
            <DocumentTabs
              onActivate={actions.activateDocument}
              onClose={actions.closeDocument}
              onCreate={actions.createDocument}
              tabs={model.tabs}
            />
          }
        />
        {isSidebarOpen ? (
          <aside aria-label="画板侧栏" className="col-start-2 min-h-0 min-w-0 border-r border-divider">
            <WorkspaceSidebar
              activeNavigationItem={activeNavigationItem}
              onActivatePage={actions.activatePage}
              onClose={() => setSidebarOpen(false)}
              onCreatePage={actions.createPage}
              pages={model.activeDocument?.pages ?? []}
            />
          </aside>
        ) : null}
        <section aria-label="内容区" className="col-3 grid min-h-0 min-w-0">
          <main className="relative min-h-0 min-w-0 overflow-hidden">
            {hasActiveDocument ? (
              editor
            ) : (
              <NoDocumentSurface
                onCreateDocument={actions.createDocument}
                onOpenDocument={actions.openDocument}
              />
            )}
          </main>
        </section>
        {hasActiveDocument ? (
          <aside
            aria-label="属性检查器"
            className={isInspectorOpen ? 'col-4 min-h-0 min-w-0 border-l border-divider' : 'pointer-events-none'}
          >
            {isInspectorOpen ? (
              <div className="relative h-full">
                <Button
                  aria-label="收起属性面板"
                  className="absolute -left-8 top-3 z-30 size-7 rounded-l-md rounded-r-none border border-r-0 bg-background/95 text-muted-foreground shadow-sm backdrop-blur hover:text-foreground"
                  onClick={() => setInspectorOpen(false)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <PanelRightClose className="size-3.5" />
                </Button>
                <InspectorHost>{inspector}</InspectorHost>
              </div>
            ) : (
              <Button
                aria-label="展开属性面板"
                className="pointer-events-auto absolute right-0 top-(--chrome-height) z-30 size-8 rounded-l-md rounded-r-none border border-r-0 bg-background/95 text-muted-foreground shadow-sm backdrop-blur hover:text-foreground"
                onClick={() => setInspectorOpen(true)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <PanelRightOpen className="size-4" />
              </Button>
            )}
          </aside>
        ) : null}
        {hasActiveDocument ? (
          <div className="col-span-4 row-3 min-w-0">
            <StatusBarHost left={statusLeft} right={statusRight} />
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  )
}
