import { TooltipProvider } from '@hybrid-canvas/design-system'
import type { ReactNode } from 'react'
import { useState } from 'react'

import type {
  DocumentSessionId,
  PageId,
  WorkbenchViewModel,
} from '../../application/model/workbench-view-model'
import { NoDocumentSurface } from '../empty/NoDocumentSurface'
import { InspectorHost } from '../inspector/InspectorHost'
import { StatusBarHost } from '../status/StatusBarHost'
import { ActivityRail } from './ActivityRail'
import { DocumentTabs } from './DocumentTabs'
import { WorkspaceSidebar } from './WorkspaceSidebar'

export interface WorkspaceShellActions {
  readonly createDocument: () => void
  readonly openDocument: () => void
  readonly activateDocument: (sessionId: DocumentSessionId) => void
  readonly closeDocument: (sessionId: DocumentSessionId) => void
  readonly activatePage: (pageId: PageId) => void
  readonly createPage: () => void
  readonly openCommandPalette: () => void
  readonly openSettingsWindow: () => void
}

export interface WorkspaceShellProps {
  readonly model: WorkbenchViewModel
  readonly actions: WorkspaceShellActions
  readonly editor: ReactNode
  readonly inspector: ReactNode
  readonly statusLeft: ReactNode
  readonly statusRight?: ReactNode
}

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
        aria-label="主工作台"
        className="grid h-dvh min-h-0 overflow-hidden bg-background text-foreground"
        data-workbench-state={workbenchState}
        style={{
          gridTemplateColumns,
          gridTemplateRows,
        }}
      >
        <header className="min-w-0 col-[2/-1]">
          <DocumentTabs
            onActivate={actions.activateDocument}
            onClose={actions.closeDocument}
            onCommandPaletteOpen={actions.openCommandPalette}
            onCreate={actions.createDocument}
            tabs={model.tabs}
          />
        </header>
        <ActivityRail
          isSidebarOpen={isSidebarOpen}
          onSettingsOpen={actions.openSettingsWindow}
          onSidebarOpen={() => setSidebarOpen(true)}
        />
        {isSidebarOpen ? (
          <aside aria-label="工作区侧栏" className="min-h-0 min-w-0">
            <WorkspaceSidebar
              onActivatePage={actions.activatePage}
              onClose={() => setSidebarOpen(false)}
              onCreatePage={actions.createPage}
              pages={model.activeDocument?.pages ?? []}
            />
          </aside>
        ) : null}
        <section
          aria-label="内容区"
          className="grid min-h-0 min-w-0"
          style={{
            gridTemplateRows: hasActiveDocument
              ? 'minmax(0, 1fr)'
              : 'minmax(0, 1fr)',
          }}
        >
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
          <aside aria-label="属性检查器" className="min-h-0 min-w-0">
            <InspectorHost>{inspector}</InspectorHost>
          </aside>
        ) : null}
        {hasActiveDocument ? <StatusBarHost left={statusLeft} right={statusRight} /> : null}
      </div>
    </TooltipProvider>
  )
}
