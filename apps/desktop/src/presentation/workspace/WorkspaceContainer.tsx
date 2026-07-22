import type { EditorSession } from '@hybrid-canvas/canvas/application'
import { EditorSessionHost, useEditor } from '@hybrid-canvas/canvas/react'
import { ConfirmationDialog } from '@hybrid-canvas/design-system'
import type {
  CanvasSessionId,
  WorkbenchSessionStore,
  WorkbenchTabId,
  WorkspaceShellActions,
} from '@hybrid-canvas/workspace/contracts'
import {
  NoCanvasSurface,
  WorkbenchTabs,
  WorkspaceShell,
  WorkspaceSurface,
} from '@hybrid-canvas/workspace/react'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'
import { type TLShape, useValue } from 'tldraw'

import { UiErrorBoundary } from '../boundaries/UiErrorBoundary'
import { DesktopTitleBar } from '../chrome/DesktopTitleBar'
import { reportUiError as reportError } from '../ui/ui-feedback'

const EMPTY_EDITOR_SESSION_SNAPSHOT = Object.freeze({
  pages: Object.freeze([]),
})

const EMPTY_SUBSCRIBE = () => () => {}
const EMPTY_EDITOR_SNAPSHOT = () => EMPTY_EDITOR_SESSION_SNAPSHOT

export type WorkspaceCanvasCloseResult =
  | { readonly kind: 'closed' }
  | {
      readonly kind: 'confirmation-required'
      readonly sessionId: CanvasSessionId
    }
  | { readonly kind: 'not-found' }

export interface WorkspaceCanvasUIPort {
  readonly create: (title: string) => void
  readonly open: () => Promise<void>
  readonly save: (sessionId: CanvasSessionId) => Promise<void>
  readonly requestClose: (sessionId: CanvasSessionId) => Promise<WorkspaceCanvasCloseResult>
  readonly discardAndClose: (sessionId: CanvasSessionId) => void
  readonly getEditorSession: (sessionId: CanvasSessionId) => EditorSession | null
  readonly getSessionSnapshot: (
    sessionId: CanvasSessionId,
  ) => import('@hybrid-canvas/document').CanvasSessionSnapshot | null
  readonly getVersion: () => number
  readonly subscribe: (listener: () => void) => () => void
}

export interface WorkspaceUIPort {
  readonly canvases: WorkspaceCanvasUIPort
  readonly workspace: WorkbenchSessionStore
}

export interface WorkspaceContainerProps {
  readonly port: WorkspaceUIPort
  readonly onCommandPaletteOpen: () => void
  readonly onSettingsOpen: () => void
  readonly onWindowMinimize: () => void
  readonly onWindowMaximize: () => void
  readonly onWindowClose: () => void
  readonly onWindowStartDragging: () => void
}

export function WorkspaceContainer({
  port,
  onCommandPaletteOpen,
  onSettingsOpen,
  onWindowMinimize,
  onWindowMaximize,
  onWindowClose,
  onWindowStartDragging,
}: WorkspaceContainerProps) {
  const [pendingCloseSessionId, setPendingCloseSessionId] = useState<CanvasSessionId | null>(null)

  const workbench = useSyncExternalStore(
    port.workspace.subscribe,
    port.workspace.getSnapshot,
    port.workspace.getSnapshot,
  )

  useSyncExternalStore(port.canvases.subscribe, port.canvases.getVersion, port.canvases.getVersion)

  const activeSessionId =
    workbench.activeSurface.kind === 'canvas' ? workbench.activeSurface.sessionId : null

  const activeEditorSession = activeSessionId
    ? port.canvases.getEditorSession(activeSessionId)
    : null

  const pages = useSyncExternalStore(
    activeEditorSession?.subscribe ?? EMPTY_SUBSCRIBE,
    activeEditorSession?.getSessionSnapshot ?? EMPTY_EDITOR_SNAPSHOT,
    activeEditorSession?.getSessionSnapshot ?? EMPTY_EDITOR_SNAPSHOT,
  ).pages

  const handleSave = useCallback(
    (sessionId: CanvasSessionId) => {
      void port.canvases.save(sessionId).catch((cause: unknown) => {
        reportError('canvas save failed', {
          scope: 'workspace',
          operation: 'save-canvas',
          sessionId,
          cause,
        })
      })
    },
    [port.canvases],
  )

  const handleCloseCanvas = useCallback(
    (sessionId: CanvasSessionId) => {
      void port.canvases
        .requestClose(sessionId)
        .then((result) => {
          if (result.kind === 'confirmation-required') {
            setPendingCloseSessionId(result.sessionId)
          }
        })
        .catch((cause: unknown) => {
          reportError('canvas close request failed', {
            scope: 'workspace',
            operation: 'request-close-canvas',
            sessionId,
            cause,
          })
        })
    },
    [port.canvases],
  )

  const handleCloseTab = useCallback(
    (tabId: WorkbenchTabId) => {
      const tab = port.workspace.getSnapshot().tabs.find((candidate) => candidate.id === tabId)

      if (!tab || !tab.canClose) {
        return
      }

      if (tab.kind === 'canvas') {
        handleCloseCanvas(tab.sessionId)
        return
      }

      port.workspace.closeTab(tab.id)
    },
    [handleCloseCanvas, port.workspace],
  )

  const actions = useMemo<WorkspaceShellActions>(
    () => ({
      createCanvas() {
        const existingTitles = workbench.tabs
          .filter((tab) => tab.kind === 'canvas')
          .map((tab) => tab.title)

        port.canvases.create(createUntitledCanvasTitle(existingTitles))
      },

      openCanvas() {
        void port.canvases.open().catch((cause: unknown) => {
          reportError('canvas open failed', {
            scope: 'workspace',
            operation: 'open-canvas',
            cause,
          })
        })
      },

      activateTab(tabId) {
        port.workspace.activateTab(tabId)
      },

      closeTab: handleCloseTab,

      moveTab(tabId, targetIndex) {
        port.workspace.moveTab(tabId, targetIndex)
      },

      openWorkspaceSurface(surfaceId, title) {
        port.workspace.openWorkspaceSurface({
          surfaceId,
          title,
        })
      },

      activatePage(pageId) {
        activeEditorSession?.activatePage(pageId)
      },

      createPage() {
        activeEditorSession?.createPage('画布 ' + String(pages.length + 1))
      },

      openCommandPalette: onCommandPaletteOpen,
      openSettingsWindow: onSettingsOpen,
    }),
    [
      activeEditorSession,
      handleCloseTab,
      onCommandPaletteOpen,
      onSettingsOpen,
      pages.length,
      port.canvases,
      port.workspace,
      workbench.tabs,
    ],
  )

  const tabs = workbench.tabs.map((tab) => {
    if (tab.kind !== 'canvas') {
      return tab
    }

    const status = port.canvases.getSessionSnapshot(tab.sessionId)?.persistence

    return status ? { ...tab, status } : tab
  })

  const model = {
    ...workbench,
    tabs,
  }

  const hostedSessions = useMemo(
    () =>
      workbench.tabs.flatMap((tab) => {
        if (tab.kind !== 'canvas') {
          return []
        }

        const session = port.canvases.getEditorSession(tab.sessionId)

        return session ? [{ sessionId: tab.sessionId, session }] : []
      }),
    [port.canvases, workbench.tabs],
  )

  const mainContent = renderActiveSurface({
    activeSurface: workbench.activeSurface,
    activeSessionId,
    hostedSessions,
    onCreateCanvas: actions.createCanvas,
    onOpenCanvas: actions.openCanvas,
    onSave: handleSave,
  })

  return (
    <WorkspaceShell
      actions={actions}
      inspector={<CanvasInspectorContent hasActiveCanvas={workbench.activeCanvas !== null} />}
      mainContent={mainContent}
      model={model}
      overlays={
        <ConfirmationDialog
          confirmLabel="放弃并关闭"
          description="关闭画布会丢失自上次保存后的更改，此操作无法撤销。"
          destructive
          onCancel={() => setPendingCloseSessionId(null)}
          onConfirm={() => {
            if (!pendingCloseSessionId) {
              return
            }

            try {
              port.canvases.discardAndClose(pendingCloseSessionId)
            } catch (cause) {
              reportError('discard and close canvas failed', {
                scope: 'workspace',
                operation: 'discard-and-close-canvas',
                sessionId: pendingCloseSessionId,
                cause,
              })

              return
            }

            setPendingCloseSessionId(null)
          }}
          open={pendingCloseSessionId !== null}
          title="放弃未保存的更改？"
        />
      }
      pages={pages}
      renderChrome={({
        isSidebarOpen,
        sidebarWidth,
        tabs: chromeTabs,
        onSidebarToggle,
        onActivateTab,
        onCloseTab,
        onMoveTab,
        onCreateCanvas,
      }) => (
        <DesktopTitleBar
          isSidebarOpen={isSidebarOpen}
          onClose={onWindowClose}
          onMaximize={onWindowMaximize}
          onMinimize={onWindowMinimize}
          onSidebarToggle={onSidebarToggle}
          onStartDragging={onWindowStartDragging}
          sidebarWidth={sidebarWidth}
        >
          <WorkbenchTabs
            onActivate={onActivateTab}
            onClose={onCloseTab}
            onMove={onMoveTab}
            onCreate={onCreateCanvas}
            tabs={chromeTabs}
          />
        </DesktopTitleBar>
      )}
      statusLeft={
        <>
          <CanvasStatusLeftContent
            hasActiveCanvas={workbench.activeCanvas !== null}
          />
          <CanvasSelectionGeometryStatus />
        </>
      }
      statusRight={<CanvasStatusRightContent pageCount={pages.length} />}
    />
  )
}

interface ActiveSurfaceRendererProps {
  readonly activeSurface: import('@hybrid-canvas/workspace/contracts').WorkbenchSurfaceViewModel
  readonly activeSessionId: CanvasSessionId | null
  readonly hostedSessions: readonly {
    readonly sessionId: CanvasSessionId
    readonly session: EditorSession
  }[]
  readonly onCreateCanvas: () => void
  readonly onOpenCanvas: () => void
  readonly onSave: (sessionId: CanvasSessionId) => void
}

function renderActiveSurface({
  activeSurface,
  activeSessionId,
  hostedSessions,
  onCreateCanvas,
  onOpenCanvas,
  onSave,
}: ActiveSurfaceRendererProps) {
  switch (activeSurface.kind) {
    case 'start':
      return <NoCanvasSurface onCreateDocument={onCreateCanvas} onOpenDocument={onOpenCanvas} />

    case 'workspace':
      return <WorkspaceSurface surfaceId={activeSurface.surfaceId} />

    case 'canvas':
      return (
        <UiErrorBoundary area="画布编辑器">
          <EditorSessionHost
            activeSessionId={activeSessionId}
            onSave={onSave}
            sessions={hostedSessions}
          />
        </UiErrorBoundary>
      )
  }
}

function CanvasInspectorContent({ hasActiveCanvas }: { readonly hasActiveCanvas: boolean }) {
  const editor = useEditor()

  const selectedShapes = useValue(
    'canvas inspector selected shapes',
    () => editor?.getSelectedShapes() ?? [],
    [editor],
  )


  const selectedIds = useMemo(
    () => selectedShapes.map((shape) => shape.id),
    [selectedShapes],
  )

  const selection = useMemo(() => {
    if (selectedShapes.length === 0) {
      return null
    }

    const first = selectedShapes[0]

    if (!first) {
      return null
    }

    const firstProps = first.props as unknown as Record<string, unknown>
    const firstBounds = editor?.getShapePageBounds(first)

    return {
      type:
        selectedShapes.every((shape) => shape.type === first.type)
          ? getShapeTypeLabel(first.type)
          : '多个类型',
      x: getSharedNumber(selectedShapes, (shape) => shape.x),
      y: getSharedNumber(selectedShapes, (shape) => shape.y),
      rotation: getSharedNumber(selectedShapes, (shape) => radiansToDegrees(shape.rotation)),
      opacity: getSharedNumber(selectedShapes, (shape) => shape.opacity * 100),
      width:
        selectedShapes.length === 1 && firstBounds
          ? Math.round(firstBounds.width * 100) / 100
          : null,
      height:
        selectedShapes.length === 1 && firstBounds
          ? Math.round(firstBounds.height * 100) / 100
          : null,
      color: typeof firstProps.color === 'string' ? firstProps.color : null,
      fill: typeof firstProps.fill === 'string' ? firstProps.fill : null,
      isLocked: selectedShapes.every((shape) => shape.isLocked),
    }
  }, [editor, selectedShapes])

  if (!hasActiveCanvas || !editor) {
    return (
      <InspectorEmptyState
        description="激活一个画布后，可以在这里编辑画布和对象属性。"
        title="没有活动画布"
      />
    )
  }

  const updateTopLevelNumber = (
    key: 'x' | 'y' | 'rotation' | 'opacity',
    value: number,
  ) => {
    const normalizedValue =
      key === 'rotation'
        ? degreesToRadians(value)
        : key === 'opacity'
          ? clamp(value / 100, 0, 1)
          : value

    editor.updateShapes(
      selectedShapes.map((shape) => ({
        id: shape.id,
        type: shape.type,
        [key]: normalizedValue,
      })) as never,
    )
  }

  const updateSize = (key: 'w' | 'h', value: number) => {
    if (selectedShapes.length !== 1 || value <= 0) {
      return
    }

    const shape = selectedShapes[0]

    if (!shape) {
      return
    }

    const props = shape.props as unknown as Record<string, unknown>

    if (typeof props[key] !== 'number') {
      return
    }

    editor.updateShape({
      id: shape.id,
      type: shape.type,
      props: {
        [key]: value,
      },
    } as never)
  }

  const updateShapeStyle = (key: 'color' | 'fill', value: string) => {
    const updates = selectedShapes.flatMap((shape) => {
      const props = shape.props as unknown as Record<string, unknown>

      if (!(key in props)) {
        return []
      }

      return [
        {
          id: shape.id,
          type: shape.type,
          props: {
            [key]: value,
          },
        },
      ]
    })

    if (updates.length > 0) {
      editor.updateShapes(updates as never)
    }
  }

  const toggleLocked = () => {
    const shouldLock = !selectedShapes.every((shape) => shape.isLocked)

    editor.updateShapes(
      selectedShapes.map((shape) => ({
        id: shape.id,
        type: shape.type,
        isLocked: shouldLock,
      })) as never,
    )
  }

  if (!selection) {
    return (
      <div className="space-y-4">
        <InspectorHeader
          description="选择画布中的对象以编辑其属性"
          title="画布"
        />


        <InspectorSection title="视图">
          <div className="grid grid-cols-2 gap-2">
            <InspectorButton onClick={() => editor.zoomToFit()}>
              适应画布
            </InspectorButton>
            <InspectorButton onClick={() => editor.resetZoom()}>
              100%
            </InspectorButton>
            <InspectorButton
              className="col-span-2"
              onClick={() => editor.selectAll()}
            >
              选择全部对象
            </InspectorButton>
          </div>
        </InspectorSection>

        <div className="rounded-lg border border-dashed border-divider px-4 py-8 text-center">
          <p className="text-xs font-medium">未选择对象</p>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            单击或框选对象后，可以修改位置、尺寸、样式和排列方式。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <InspectorHeader
        description={
          selectedShapes.length === 1
            ? selection.type
            : String(selectedShapes.length) + ' 个对象 · ' + selection.type
        }
        title={selectedShapes.length === 1 ? selection.type : '多个对象'}
      />

      <InspectorSection title="外观">
        <div className="space-y-3">
          <div>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              颜色
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {TL_DRAW_COLORS.map((color) => (
                <button
                  aria-label={'设置颜色为 ' + color.label}
                  className={
                    'size-7 rounded-md border transition-transform hover:scale-105 ' +
                    (selection.color === color.value
                      ? 'ring-2 ring-primary ring-offset-1'
                      : '')
                  }
                  key={color.value}
                  onClick={() => updateShapeStyle('color', color.value)}
                  style={{ backgroundColor: color.css }}
                  title={color.label}
                  type="button"
                />
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              填充
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {TL_DRAW_FILLS.map((fill) => (
                <button
                  className={
                    'h-8 rounded-md border px-2 text-[11px] transition-colors hover:bg-accent ' +
                    (selection.fill === fill.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'bg-background')
                  }
                  key={fill.value}
                  onClick={() => updateShapeStyle('fill', fill.value)}
                  type="button"
                >
                  {fill.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </InspectorSection>

      <InspectorSection title="对齐与分布">
        <div className="grid grid-cols-3 gap-1.5">
          <InspectorButton
            disabled={selectedShapes.length < 2}
            onClick={() => editor.alignShapes(selectedIds, 'left')}
          >
            左对齐
          </InspectorButton>
          <InspectorButton
            disabled={selectedShapes.length < 2}
            onClick={() => editor.alignShapes(selectedIds, 'center-horizontal')}
          >
            水平居中
          </InspectorButton>
          <InspectorButton
            disabled={selectedShapes.length < 2}
            onClick={() => editor.alignShapes(selectedIds, 'right')}
          >
            右对齐
          </InspectorButton>
          <InspectorButton
            disabled={selectedShapes.length < 2}
            onClick={() => editor.alignShapes(selectedIds, 'top')}
          >
            顶对齐
          </InspectorButton>
          <InspectorButton
            disabled={selectedShapes.length < 2}
            onClick={() => editor.alignShapes(selectedIds, 'center-vertical')}
          >
            垂直居中
          </InspectorButton>
          <InspectorButton
            disabled={selectedShapes.length < 2}
            onClick={() => editor.alignShapes(selectedIds, 'bottom')}
          >
            底对齐
          </InspectorButton>
          <InspectorButton
            disabled={selectedShapes.length < 3}
            onClick={() => editor.distributeShapes(selectedIds, 'horizontal')}
          >
            水平分布
          </InspectorButton>
          <InspectorButton
            disabled={selectedShapes.length < 3}
            onClick={() => editor.distributeShapes(selectedIds, 'vertical')}
          >
            垂直分布
          </InspectorButton>
          <InspectorButton onClick={() => editor.zoomToSelection()}>
            定位选区
          </InspectorButton>
        </div>
      </InspectorSection>

      <InspectorSection title="层级">
        <div className="grid grid-cols-2 gap-2">
          <InspectorButton onClick={() => editor.bringToFront(selectedIds)}>
            置于顶层
          </InspectorButton>
          <InspectorButton onClick={() => editor.sendToBack(selectedIds)}>
            置于底层
          </InspectorButton>
          <InspectorButton onClick={() => editor.bringForward(selectedIds)}>
            上移一层
          </InspectorButton>
          <InspectorButton onClick={() => editor.sendBackward(selectedIds)}>
            下移一层
          </InspectorButton>
        </div>
      </InspectorSection>

      <InspectorSection title="操作">
        <div className="grid grid-cols-2 gap-2">
          <InspectorButton onClick={() => editor.duplicateShapes(selectedIds)}>
            复制对象
          </InspectorButton>
          <InspectorButton onClick={toggleLocked}>
            {selection.isLocked ? '解除锁定' : '锁定对象'}
          </InspectorButton>
          <InspectorButton
            className="col-span-2 border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => editor.deleteShapes(selectedIds)}
          >
            删除所选对象
          </InspectorButton>
        </div>
      </InspectorSection>
    </div>
  )
}

const TL_DRAW_COLORS = [
  { value: 'black', label: '黑色', css: '#1d1d1d' },
  { value: 'grey', label: '灰色', css: '#9ca3af' },
  { value: 'red', label: '红色', css: '#ef4444' },
  { value: 'orange', label: '橙色', css: '#f97316' },
  { value: 'yellow', label: '黄色', css: '#eab308' },
  { value: 'green', label: '绿色', css: '#22c55e' },
  { value: 'blue', label: '蓝色', css: '#3b82f6' },
  { value: 'violet', label: '紫色', css: '#8b5cf6' },
  { value: 'light-red', label: '浅红', css: '#fca5a5' },
  { value: 'light-green', label: '浅绿', css: '#86efac' },
  { value: 'light-blue', label: '浅蓝', css: '#93c5fd' },
  { value: 'light-violet', label: '浅紫', css: '#c4b5fd' },
] as const

const TL_DRAW_FILLS = [
  { value: 'none', label: '无' },
  { value: 'semi', label: '半透明' },
  { value: 'solid', label: '实心' },
  { value: 'pattern', label: '图案' },
] as const

interface InspectorHeaderProps {
  readonly title: string
  readonly description: string
}

function InspectorHeader({ title, description }: InspectorHeaderProps) {
  return (
    <header className="border-b border-divider pb-3">
      <h2 className="truncate text-sm font-semibold">{title}</h2>
      <p className="mt-1 truncate text-[11px] text-muted-foreground">
        {description}
      </p>
    </header>
  )
}

interface InspectorSectionProps {
  readonly title: string
  readonly children: ReactNode
}

function InspectorSection({ title, children }: InspectorSectionProps) {
  return (
    <section className="space-y-2.5 border-b border-divider pb-4 last:border-b-0">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  )
}

interface InspectorButtonProps {
  readonly children: ReactNode
  readonly onClick: () => void
  readonly disabled?: boolean
  readonly className?: string
}

function InspectorButton({
  children,
  onClick,
  disabled = false,
  className = '',
}: InspectorButtonProps) {
  return (
    <button
      className={
        'min-h-8 rounded-md border border-divider bg-background px-2 text-[11px] ' +
        'transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 ' +
        className
      }
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

interface InspectorNumberFieldProps {
  readonly label: string
  readonly value: number | null
  readonly onCommit: (value: number) => void
  readonly mixed?: boolean
  readonly suffix?: string
  readonly min?: number
  readonly max?: number
  readonly disabled?: boolean
}

function InspectorNumberField({
  label,
  value,
  onCommit,
  mixed = false,
  suffix,
  min,
  max,
  disabled = false,
}: InspectorNumberFieldProps) {
  const [draft, setDraft] = useState(
    value === null ? '' : formatInspectorNumber(value),
  )

  useEffect(() => {
    setDraft(value === null ? '' : formatInspectorNumber(value))
  }, [value])

  const commit = () => {
    const parsed = Number.parseFloat(draft)

    if (!Number.isFinite(parsed)) {
      setDraft(value === null ? '' : formatInspectorNumber(value))
      return
    }

    onCommit(clampOptional(parsed, min, max))
  }

  return (
    <label className="flex h-8 items-center rounded-md border border-divider bg-background focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30">
      <span className="w-8 shrink-0 pl-2 text-[10px] font-medium text-muted-foreground">
        {label}
      </span>
      <input
        className="min-w-0 flex-1 bg-transparent px-1 text-right text-[11px] outline-none disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        inputMode="decimal"
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }

          if (event.key === 'Escape') {
            setDraft(value === null ? '' : formatInspectorNumber(value))
            event.currentTarget.blur()
          }
        }}
        placeholder={mixed ? '多个' : '0'}
        value={draft}
      />
      {suffix ? (
        <span className="pr-2 text-[10px] text-muted-foreground">{suffix}</span>
      ) : null}
    </label>
  )
}


interface InspectorEmptyStateProps {
  readonly title: string
  readonly description: string
}

function InspectorEmptyState({
  title,
  description,
}: InspectorEmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-divider px-4 py-10 text-center">
      <p className="text-xs font-medium">{title}</p>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  )
}

function getSharedNumber(
  shapes: readonly TLShape[],
  read: (shape: TLShape) => number,
): number | null {
  const first = shapes[0]

  if (!first) {
    return null
  }

  const firstValue = read(first)

  if (shapes.every((shape) => Math.abs(read(shape) - firstValue) < 0.001)) {
    return Math.round(firstValue * 100) / 100
  }

  return null
}

function getShapeTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    geo: '形状',
    text: '文本',
    draw: '手绘',
    arrow: '箭头',
    line: '线条',
    note: '便签',
    frame: '画框',
    image: '图片',
    video: '视频',
    bookmark: '书签',
    embed: '嵌入内容',
    highlight: '高亮',
  }

  return labels[type] ?? type
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180
}

function formatInspectorNumber(value: number): string {
  return String(Math.round(value * 100) / 100)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function clampOptional(
  value: number,
  min: number | undefined,
  max: number | undefined,
): number {
  let result = value

  if (min !== undefined) {
    result = Math.max(min, result)
  }

  if (max !== undefined) {
    result = Math.min(max, result)
  }

  return result
}

function CanvasSelectionGeometryStatus() {
  const editor = useEditor()

  const geometry = useValue(
    'canvas status selection geometry',
    () => {
      if (!editor) {
        return null
      }

      const selectedShapes = editor.getSelectedShapes()

      if (selectedShapes.length === 0) {
        return null
      }

      const bounds = editor.getSelectionPageBounds()

      if (!bounds) {
        return null
      }

      const firstShape = selectedShapes[0]

      const sharedRotation =
        firstShape &&
        selectedShapes.every(
          (shape) =>
            Math.abs(shape.rotation - firstShape.rotation) < 0.0001,
        )
          ? radiansToStatusDegrees(firstShape.rotation)
          : null

      return {
        count: selectedShapes.length,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        rotation: sharedRotation,
      }
    },
    [editor],
  )

  if (!geometry) {
    return null
  }

  return (
    <>
      <StatusDivider />

      <span className="shrink-0 font-medium text-foreground/80">
        {geometry.count === 1
          ? '已选择 1 个对象'
          : '已选择 ' + String(geometry.count) + ' 个对象'}
      </span>

      <StatusGeometryValue
        label="X"
        value={formatStatusNumber(geometry.x)}
      />

      <StatusGeometryValue
        label="Y"
        value={formatStatusNumber(geometry.y)}
      />

      <StatusGeometryValue
        label="W"
        value={formatStatusNumber(geometry.width)}
      />

      <StatusGeometryValue
        label="H"
        value={formatStatusNumber(geometry.height)}
      />

      {geometry.rotation !== null ? (
        <StatusGeometryValue
          label="R"
          suffix="°"
          value={formatStatusNumber(geometry.rotation)}
        />
      ) : null}
    </>
  )
}

interface StatusGeometryValueProps {
  readonly label: string
  readonly value: string
  readonly suffix?: string
}

function StatusGeometryValue({
  label,
  value,
  suffix,
}: StatusGeometryValueProps) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1"
      title={label + ': ' + value + (suffix ?? '')}
    >
      <span className="text-muted-foreground/70">{label}</span>
      <span className="min-w-8 rounded bg-background/70 px-1.5 py-0.5 text-right font-mono tabular-nums text-foreground/80">
        {value}
        {suffix}
      </span>
    </span>
  )
}

function StatusDivider() {
  return (
    <span
      aria-hidden="true"
      className="h-3 w-px shrink-0 bg-divider"
    />
  )
}

function radiansToStatusDegrees(value: number): number {
  return (value * 180) / Math.PI
}

function formatStatusNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0'
  }

  return String(Math.round(value * 10) / 10)
}

function CanvasStatusLeftContent({ hasActiveCanvas }: { readonly hasActiveCanvas: boolean }) {
  return <span>{hasActiveCanvas ? '本地画布' : null}</span>
}

function CanvasStatusRightContent({ pageCount }: { readonly pageCount: number }) {
  return pageCount > 0 ? <span>{pageCount} 个页面</span> : null
}

function createUntitledCanvasTitle(existingTitles: readonly string[]): string {
  const baseTitle = '未命名画布'

  if (!existingTitles.includes(baseTitle)) {
    return baseTitle
  }

  let suffix = 2

  while (existingTitles.includes(baseTitle + ' ' + String(suffix))) {
    suffix += 1
  }

  return baseTitle + ' ' + String(suffix)
}
