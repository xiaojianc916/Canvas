import type { EditorSession } from '@hybrid-canvas/canvas/application'
import {
  DefaultArrowheadEndStyle,
  DefaultArrowheadStartStyle,
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultFontStyle,
  DefaultSizeStyle,
  DefaultTextAlignStyle,
  type TLShape,
  useValue,
} from 'tldraw'

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

  const editor = useEditor()

  const inspectorSelectionKey = useValue(
    'workspace inspector selection key',
    () =>
      editor
        ? editor
            .getSelectedShapeIds()
            .map(String)
            .sort()
            .join('|')
        : '',
    [editor],
  )

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
      inspector={
        <CanvasInspectorContent
          hasActiveCanvas={workbench.activeCanvas !== null}
        />
      }
      inspectorSelectionKey={inspectorSelectionKey}
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

function CanvasInspectorContent({
  hasActiveCanvas,
}: {
  readonly hasActiveCanvas: boolean
}) {
  const editor = useEditor()

  const selectedShapes = useValue(
    'canvas inspector selected shapes',
    () => editor?.getSelectedShapes() ?? [],
    [editor],
  )

  if (!hasActiveCanvas || !editor) {
    return (
      <div className="rounded-lg border border-dashed border-divider px-4 py-10 text-center">
        <p className="text-xs font-medium">没有活动画布</p>
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
          激活一个画布后，可以在这里编辑对象属性。
        </p>
      </div>
    )
  }

  if (selectedShapes.length === 0) {
    return (
      <div className="space-y-4">
        <header className="border-b border-divider pb-3">
          <h2 className="text-sm font-semibold">画布</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">
            选择对象后显示对应属性
          </p>
        </header>

        <ShapeInspectorSection title="视图">
          <div className="grid grid-cols-2 gap-2">
            <ShapeInspectorButton onClick={() => editor.zoomToFit()}>
              适应内容
            </ShapeInspectorButton>

            <ShapeInspectorButton onClick={() => editor.resetZoom()}>
              恢复 100%
            </ShapeInspectorButton>

            <ShapeInspectorButton
              className="col-span-2"
              onClick={() => editor.selectAll()}
            >
              选择全部对象
            </ShapeInspectorButton>
          </div>
        </ShapeInspectorSection>

        <div className="rounded-lg border border-dashed border-divider px-4 py-8 text-center">
          <p className="text-xs font-medium">未选择对象</p>
          <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
            单击形状、文本、箭头或其他对象以编辑属性。
          </p>
        </div>
      </div>
    )
  }

  const selectedIds = selectedShapes.map((shape) => shape.id)
  const primaryShape = selectedShapes[0]

  if (!primaryShape) {
    return null
  }

  const commonType = selectedShapes.every(
    (shape) => shape.type === primaryShape.type,
  )
    ? primaryShape.type
    : 'mixed'

  const commonColor = getCommonShapeProp(selectedShapes, 'color')
  const commonFill = getCommonShapeProp(selectedShapes, 'fill')
  const commonDash = getCommonShapeProp(selectedShapes, 'dash')
  const commonSize = getCommonShapeProp(selectedShapes, 'size')
  const commonFont = getCommonShapeProp(selectedShapes, 'font')
  const commonAlign = getCommonShapeProp(selectedShapes, 'textAlign')
  const commonGeo = getCommonShapeProp(selectedShapes, 'geo')
  const commonArrowheadStart = getCommonShapeProp(
    selectedShapes,
    'arrowheadStart',
  )
  const commonArrowheadEnd = getCommonShapeProp(
    selectedShapes,
    'arrowheadEnd',
  )

  const applyStyle = (
    style:
      | typeof DefaultColorStyle
      | typeof DefaultFillStyle
      | typeof DefaultDashStyle
      | typeof DefaultSizeStyle
      | typeof DefaultFontStyle
      | typeof DefaultTextAlignStyle
      | typeof DefaultArrowheadStartStyle
      | typeof DefaultArrowheadEndStyle,
    value: string,
  ) => {
    editor.setStyleForSelectedShapes(style as never, value as never)
  }

  const updateGeo = (geo: string) => {
    const updates = selectedShapes.flatMap((shape) => {
      if (shape.type !== 'geo') {
        return []
      }

      return [
        {
          id: shape.id,
          type: shape.type,
          props: {
            geo,
          },
        },
      ]
    })

    if (updates.length > 0) {
      editor.updateShapes(updates as never)
    }
  }

  const allLocked = selectedShapes.every((shape) => shape.isLocked)

  const toggleLocked = () => {
    editor.updateShapes(
      selectedShapes.map((shape) => ({
        id: shape.id,
        type: shape.type,
        isLocked: !allLocked,
      })) as never,
    )
  }

  return (
    <div className="space-y-4">
      <header className="border-b border-divider pb-3">
        <h2 className="truncate text-sm font-semibold">
          {selectedShapes.length === 1
            ? getInspectorShapeName(commonType)
            : String(selectedShapes.length) + ' 个对象'}
        </h2>

        <p className="mt-1 truncate text-[11px] text-muted-foreground">
          {selectedShapes.length === 1
            ? getInspectorShapeDescription(commonType)
            : commonType === 'mixed'
              ? '多个不同类型的对象'
              : getInspectorShapeName(commonType)}
        </p>
      </header>

      <ShapeInspectorSection title="颜色">
        <div className="grid grid-cols-6 gap-1.5">
          {SHAPE_COLORS.map((color) => (
            <button
              aria-label={'设置颜色为' + color.label}
              className={
                'size-7 rounded-md border transition-transform hover:scale-105 ' +
                (commonColor === color.value
                  ? 'ring-2 ring-primary ring-offset-1'
                  : '')
              }
              key={color.value}
              onClick={() =>
                applyStyle(DefaultColorStyle, color.value)
              }
              style={{ backgroundColor: color.css }}
              title={color.label}
              type="button"
            />
          ))}
        </div>
      </ShapeInspectorSection>

      {supportsFill(commonType) ? (
        <ShapeInspectorSection title="填充">
          <ShapeInspectorSegmentedControl
            onChange={(value) =>
              applyStyle(DefaultFillStyle, value)
            }
            options={[
              { value: 'none', label: '无' },
              { value: 'semi', label: '半透明' },
              { value: 'solid', label: '实心' },
              { value: 'pattern', label: '图案' },
            ]}
            value={commonFill}
          />
        </ShapeInspectorSection>
      ) : null}

      {supportsStroke(commonType) ? (
        <>
          <ShapeInspectorSection title="线型">
            <ShapeInspectorSegmentedControl
              onChange={(value) =>
                applyStyle(DefaultDashStyle, value)
              }
              options={[
                { value: 'draw', label: '手绘' },
                { value: 'solid', label: '实线' },
                { value: 'dashed', label: '虚线' },
                { value: 'dotted', label: '点线' },
              ]}
              value={commonDash}
            />
          </ShapeInspectorSection>

          <ShapeInspectorSection title="粗细">
            <ShapeInspectorSegmentedControl
              onChange={(value) =>
                applyStyle(DefaultSizeStyle, value)
              }
              options={[
                { value: 's', label: '细' },
                { value: 'm', label: '中' },
                { value: 'l', label: '粗' },
                { value: 'xl', label: '特粗' },
              ]}
              value={commonSize}
            />
          </ShapeInspectorSection>
        </>
      ) : null}

      {commonType === 'geo' ? (
        <ShapeInspectorSection title="形状">
          <select
            className="h-8 w-full rounded-md border border-divider bg-background px-2 text-[11px] outline-none focus:border-primary"
            onChange={(event) => updateGeo(event.target.value)}
            value={commonGeo ?? 'rectangle'}
          >
            <option value="rectangle">矩形</option>
            <option value="ellipse">椭圆</option>
            <option value="triangle">三角形</option>
            <option value="diamond">菱形</option>
            <option value="pentagon">五边形</option>
            <option value="hexagon">六边形</option>
            <option value="octagon">八边形</option>
            <option value="star">星形</option>
            <option value="cloud">云形</option>
            <option value="rhombus">平行四边形</option>
            <option value="trapezoid">梯形</option>
            <option value="arrow-right">右箭头</option>
            <option value="arrow-left">左箭头</option>
            <option value="arrow-up">上箭头</option>
            <option value="arrow-down">下箭头</option>
          </select>
        </ShapeInspectorSection>
      ) : null}

      {commonType === 'text' || commonType === 'note' ? (
        <>
          <ShapeInspectorSection title="字体">
            <ShapeInspectorSegmentedControl
              onChange={(value) =>
                applyStyle(DefaultFontStyle, value)
              }
              options={[
                { value: 'draw', label: '手写' },
                { value: 'sans', label: '无衬线' },
                { value: 'serif', label: '衬线' },
                { value: 'mono', label: '等宽' },
              ]}
              value={commonFont}
            />
          </ShapeInspectorSection>

          <ShapeInspectorSection title="对齐">
            <ShapeInspectorSegmentedControl
              onChange={(value) =>
                applyStyle(DefaultTextAlignStyle, value)
              }
              options={[
                { value: 'start', label: '左' },
                { value: 'middle', label: '中' },
                { value: 'end', label: '右' },
              ]}
              value={commonAlign}
            />
          </ShapeInspectorSection>
        </>
      ) : null}

      {commonType === 'arrow' ? (
        <>
          <ShapeInspectorSection title="起点">
            <ShapeInspectorArrowheadSelect
              onChange={(value) =>
                applyStyle(DefaultArrowheadStartStyle, value)
              }
              value={commonArrowheadStart}
            />
          </ShapeInspectorSection>

          <ShapeInspectorSection title="终点">
            <ShapeInspectorArrowheadSelect
              onChange={(value) =>
                applyStyle(DefaultArrowheadEndStyle, value)
              }
              value={commonArrowheadEnd}
            />
          </ShapeInspectorSection>
        </>
      ) : null}

      <ShapeInspectorSection title="排列">
        <div className="grid grid-cols-2 gap-2">
          <ShapeInspectorButton
            onClick={() => editor.bringToFront(selectedIds)}
          >
            置于顶层
          </ShapeInspectorButton>

          <ShapeInspectorButton
            onClick={() => editor.sendToBack(selectedIds)}
          >
            置于底层
          </ShapeInspectorButton>

          <ShapeInspectorButton
            onClick={() => editor.bringForward(selectedIds)}
          >
            上移一层
          </ShapeInspectorButton>

          <ShapeInspectorButton
            onClick={() => editor.sendBackward(selectedIds)}
          >
            下移一层
          </ShapeInspectorButton>
        </div>
      </ShapeInspectorSection>

      <ShapeInspectorSection title="对象操作">
        <div className="grid grid-cols-2 gap-2">
          <ShapeInspectorButton
            onClick={() => editor.duplicateShapes(selectedIds)}
          >
            复制
          </ShapeInspectorButton>

          <ShapeInspectorButton onClick={toggleLocked}>
            {allLocked ? '解除锁定' : '锁定'}
          </ShapeInspectorButton>

          <ShapeInspectorButton
            className="col-span-2 border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => editor.deleteShapes(selectedIds)}
          >
            删除对象
          </ShapeInspectorButton>
        </div>
      </ShapeInspectorSection>
    </div>
  )
}

const SHAPE_COLORS = [
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

function ShapeInspectorSection({
  title,
  children,
}: {
  readonly title: string
  readonly children: import('react').ReactNode
}) {
  return (
    <section className="space-y-2.5 border-b border-divider pb-4 last:border-b-0">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  )
}

function ShapeInspectorButton({
  children,
  onClick,
  className = '',
}: {
  readonly children: import('react').ReactNode
  readonly onClick: () => void
  readonly className?: string
}) {
  return (
    <button
      className={
        'min-h-8 rounded-md border border-divider bg-background px-2 text-[11px] ' +
        'transition-colors hover:bg-accent ' +
        className
      }
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

function ShapeInspectorSegmentedControl({
  options,
  value,
  onChange,
}: {
  readonly options: readonly {
    readonly value: string
    readonly label: string
  }[]
  readonly value: string | null
  readonly onChange: (value: string) => void
}) {
  return (
    <div
      className="grid gap-1.5"
      style={{
        gridTemplateColumns:
          'repeat(' + String(options.length) + ', minmax(0, 1fr))',
      }}
    >
      {options.map((option) => (
        <button
          className={
            'h-8 rounded-md border px-1 text-[10px] transition-colors ' +
            (value === option.value
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-divider bg-background hover:bg-accent')
          }
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function ShapeInspectorArrowheadSelect({
  value,
  onChange,
}: {
  readonly value: string | null
  readonly onChange: (value: string) => void
}) {
  return (
    <select
      className="h-8 w-full rounded-md border border-divider bg-background px-2 text-[11px] outline-none focus:border-primary"
      onChange={(event) => onChange(event.target.value)}
      value={value ?? 'none'}
    >
      <option value="none">无</option>
      <option value="arrow">箭头</option>
      <option value="triangle">实心三角</option>
      <option value="square">方形</option>
      <option value="dot">圆点</option>
      <option value="diamond">菱形</option>
      <option value="inverted">反向三角</option>
      <option value="bar">横线</option>
    </select>
  )
}

function getCommonShapeProp(
  shapes: readonly TLShape[],
  key: string,
): string | null {
  const firstShape = shapes[0]

  if (!firstShape) {
    return null
  }

  const firstProps =
    firstShape.props as unknown as Record<string, unknown>
  const firstValue = firstProps[key]

  if (typeof firstValue !== 'string') {
    return null
  }

  const isShared = shapes.every((shape) => {
    const props = shape.props as unknown as Record<string, unknown>
    return props[key] === firstValue
  })

  return isShared ? firstValue : null
}

function supportsFill(type: string): boolean {
  return type === 'geo' || type === 'note' || type === 'frame'
}

function supportsStroke(type: string): boolean {
  return [
    'geo',
    'draw',
    'highlight',
    'arrow',
    'line',
    'note',
    'frame',
    'mixed',
  ].includes(type)
}

function getInspectorShapeName(type: string): string {
  const names: Record<string, string> = {
    geo: '形状',
    text: '文本',
    draw: '自由绘制',
    highlight: '高亮',
    arrow: '箭头',
    line: '直线',
    note: '便签',
    frame: '画框',
    image: '图片',
    video: '视频',
    bookmark: '书签',
    embed: '嵌入内容',
    group: '对象组',
    mixed: '多个对象',
  }

  return names[type] ?? type
}

function getInspectorShapeDescription(type: string): string {
  const descriptions: Record<string, string> = {
    geo: '编辑形状、颜色、填充和边框',
    text: '编辑字体、字号、颜色和对齐',
    draw: '编辑画笔颜色、线型和粗细',
    highlight: '编辑高亮颜色和粗细',
    arrow: '编辑箭头、端点、颜色和线型',
    line: '编辑线条颜色、线型和粗细',
    note: '编辑便签文字、颜色和填充',
    frame: '编辑画框样式',
    image: '编辑图片对象和层级',
    video: '编辑视频对象和层级',
    group: '编辑对象组和层级',
  }

  return descriptions[type] ?? '编辑所选对象的属性'
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
