import { TooltipProvider } from '@hybrid-canvas/design-system'
import { useState } from 'react'

import type { WorkspaceShellProps } from '../../contracts/shell-contract'
import { NoDocumentSurface } from '../empty/NoDocumentSurface'
import { InspectorHost } from '../inspector/InspectorHost'
import { StatusBarHost } from '../status/StatusBarHost'
import { ActivityRail } from './ActivityRail'
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
  const [isInspectorOpen] = useState(true)

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
              isSidebarOpen={isSidebarOpen}
              onSettingsOpen={actions.openSettingsWindow}
              onSidebarOpen={() => setSidebarOpen(true)}
            />
          }
          onWindowClose={actions.closeWindow}
          onWindowMaximize={actions.maximizeWindow}
          onWindowMinimize={actions.minimizeWindow}
          onWindowStartDragging={actions.startWindowDragging}
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
          <aside aria-label="画板侧栏" className="min-h-0 min-w-0 border-r border-divider">
            <WorkspaceSidebar
              onActivatePage={actions.activatePage}
              onClose={() => setSidebarOpen(false)}
              onCreatePage={actions.createPage}
              pages={model.activeDocument?.pages ?? []}
            />
          </aside>
        ) : null}
        <section aria-label="内容区" className="grid min-h-0 min-w-0">
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
        {isInspectorOpen && hasActiveDocument ? (
          <aside aria-label="属性检查器" className="min-h-0 min-w-0 border-l border-divider">
            <InspectorHost>{inspector}</InspectorHost>
          </aside>
        ) : null}
        {hasActiveDocument ? <StatusBarHost left={statusLeft} right={statusRight} /> : null}
      </div>
    </TooltipProvider>
  )
}
