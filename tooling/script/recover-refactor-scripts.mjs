#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const APPLY = process.argv.includes('--apply')
const ALLOW_DIRTY = process.argv.includes('--allow-dirty')

const GENERATED_FILES = {
  'features/workspace/src/presentation/shell/useWorkspaceLayout.ts': String.raw`import { useSyncExternalStore } from 'react'

export type WorkspaceLayoutMode =
  | 'wide'
  | 'compact'
  | 'narrow'

function getSnapshot():
  WorkspaceLayoutMode {
  if (window.innerWidth >= 1280) {
    return 'wide'
  }

  if (window.innerWidth >= 900) {
    return 'compact'
  }

  return 'narrow'
}

function getServerSnapshot():
  WorkspaceLayoutMode {
  return 'wide'
}

function subscribe(
  listener: () => void,
): () => void {
  window.addEventListener(
    'resize',
    listener,
    {
      passive: true,
    },
  )

  return () => {
    window.removeEventListener(
      'resize',
      listener,
    )
  }
}

export function useWorkspaceLayoutMode():
  WorkspaceLayoutMode {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  )
}
`,

  'features/workspace/src/presentation/shell/SidebarSplitter.tsx': String.raw`export interface SidebarSplitterProps {
  readonly width: number
  readonly min: number
  readonly max: number
  readonly onResizeStart: () => void
  readonly onResize:
    (width: number) => void
  readonly onCollapse: () => void
}

export function SidebarSplitter({
  width,
  min,
  max,
  onResizeStart,
  onResize,
  onCollapse,
}: SidebarSplitterProps) {
  const clamp = (
    nextWidth: number,
  ) => {
    return Math.max(
      min,
      Math.min(
        max,
        nextWidth,
      ),
    )
  }

  return (
    <div
      aria-label="调整侧边栏宽度"
      aria-orientation="vertical"
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={
        Math.round(width)
      }
      className={[
        'absolute right-0 top-0',
        'z-20 h-full w-2',
        'translate-x-1/2',
        'cursor-col-resize',
        'bg-transparent',
        'outline-none',
        'hover:bg-primary/15',
        'focus-visible:bg-primary/25',
      ].join(' ')}
      onDoubleClick={onCollapse}
      onKeyDown={(event) => {
        switch (event.key) {
          case 'ArrowLeft':
            event.preventDefault()

            onResize(
              clamp(width - 16),
            )
            break

          case 'ArrowRight':
            event.preventDefault()

            onResize(
              clamp(width + 16),
            )
            break

          case 'Home':
            event.preventDefault()
            onResize(min)
            break

          case 'End':
            event.preventDefault()
            onResize(max)
            break
        }
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return
        }

        event.preventDefault()

        document.body.style.cursor =
          'col-resize'

        document.body.style.userSelect =
          'none'

        onResizeStart()
      }}
      role="separator"
      tabIndex={0}
    />
  )
}
`,

  'features/workspace/src/presentation/shell/WorkspaceShell.tsx': String.raw`import {
  Button,
  TooltipProvider,
} from '@hybrid-canvas/design-system'
import {
  PanelLeftClose,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type {
  WorkspaceShellProps,
} from '../../contracts/shell-contract'
import {
  NoCanvasSurface,
} from '../empty/NoCanvasSurface'
import {
  InspectorHost,
} from '../inspector/InspectorHost'
import {
  StatusBarHost,
} from '../status/StatusBarHost'
import {
  ActivityRail,
  type CanvasNavigationItemId,
} from './ActivityRail'
import {
  SidebarSplitter,
} from './SidebarSplitter'
import {
  WorkspaceFrame,
} from './WorkspaceFrame'
import {
  WorkspaceSidebar,
} from './WorkspaceSidebar'
import {
  useWorkspaceLayoutMode,
} from './useWorkspaceLayout'

const SIDEBAR_MIN = 220
const SIDEBAR_MAX = 420
const SIDEBAR_DEFAULT = 280

export function WorkspaceShell({
  model,
  actions,
  pages,
  renderChrome,
  editor,
  inspector,
  statusLeft,
  statusRight,
  assistantOverlay,
  overlays,
}: WorkspaceShellProps) {
  const mode =
    useWorkspaceLayoutMode()

  const [
    isSidebarOpen,
    setSidebarOpen,
  ] = useState(true)

  const [
    isInspectorOpen,
    setInspectorOpen,
  ] = useState(
    mode === 'wide',
  )

  const [
    activeNavigationItem,
    setActiveNavigationItem,
  ] = useState<
    CanvasNavigationItemId
  >('pages')

  const [
    sidebarWidth,
    setSidebarWidth,
  ] = useState(
    SIDEBAR_DEFAULT,
  )

  const [
    isResizing,
    setResizing,
  ] = useState(false)

  const rootRef =
    useRef<HTMLDivElement | null>(
      null,
    )

  const previousModeRef =
    useRef(mode)

  const hasCanvas =
    model.activeCanvas !== null

  const dockSidebar =
    mode !== 'narrow' &&
    isSidebarOpen

  const dockInspector =
    mode === 'wide' &&
    isInspectorOpen &&
    hasCanvas

  useEffect(() => {
    const previousMode =
      previousModeRef.current

    if (previousMode === mode) {
      return
    }

    previousModeRef.current = mode

    if (mode === 'compact') {
      setInspectorOpen(false)
    }

    if (mode === 'narrow') {
      setSidebarOpen(false)
      setInspectorOpen(false)
    }
  }, [
    mode,
  ])

  useEffect(() => {
    const handlePointerMove = (
      event: PointerEvent,
    ) => {
      if (
        !isResizing ||
        !rootRef.current
      ) {
        return
      }

      const rootRectangle =
        rootRef.current
          .getBoundingClientRect()

      const computedStyle =
        window.getComputedStyle(
          rootRef.current,
        )

      const railWidth =
        Number.parseFloat(
          computedStyle
            .getPropertyValue(
              '--activity-rail-width',
            ),
        ) || 48

      const nextWidth =
        event.clientX -
        rootRectangle.left -
        railWidth

      setSidebarWidth(
        Math.max(
          SIDEBAR_MIN,
          Math.min(
            SIDEBAR_MAX,
            nextWidth,
          ),
        ),
      )
    }

    const stopResize = () => {
      setResizing(false)

      document.body.style
        .removeProperty('cursor')

      document.body.style
        .removeProperty(
          'user-select',
        )
    }

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key === 'Escape' &&
        isResizing
      ) {
        stopResize()
      }
    }

    window.addEventListener(
      'pointermove',
      handlePointerMove,
    )

    window.addEventListener(
      'pointerup',
      stopResize,
    )

    window.addEventListener(
      'pointercancel',
      stopResize,
    )

    window.addEventListener(
      'blur',
      stopResize,
    )

    document.addEventListener(
      'keydown',
      handleKeyDown,
    )

    return () => {
      window.removeEventListener(
        'pointermove',
        handlePointerMove,
      )

      window.removeEventListener(
        'pointerup',
        stopResize,
      )

      window.removeEventListener(
        'pointercancel',
        stopResize,
      )

      window.removeEventListener(
        'blur',
        stopResize,
      )

      document.removeEventListener(
        'keydown',
        handleKeyDown,
      )

      document.body.style
        .removeProperty('cursor')

      document.body.style
        .removeProperty(
          'user-select',
        )
    }
  }, [
    isResizing,
  ])

  useEffect(() => {
    if (
      mode === 'wide' ||
      (
        !isSidebarOpen &&
        !isInspectorOpen
      )
    ) {
      return
    }

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key !== 'Escape') {
        return
      }

      event.preventDefault()
      setSidebarOpen(false)
      setInspectorOpen(false)
    }

    document.addEventListener(
      'keydown',
      handleKeyDown,
    )

    return () => {
      document.removeEventListener(
        'keydown',
        handleKeyDown,
      )
    }
  }, [
    isInspectorOpen,
    isSidebarOpen,
    mode,
  ])

  const openSidebar = () => {
    if (mode === 'narrow') {
      setInspectorOpen(false)
    }

    setSidebarOpen(true)
  }

  const openInspector = () => {
    if (mode !== 'wide') {
      setSidebarOpen(false)
    }

    setInspectorOpen(true)
  }

  const toggleSidebar = () => {
    if (isSidebarOpen) {
      setSidebarOpen(false)
      return
    }

    openSidebar()
  }

  const columns = useMemo(
    () =>
      [
        'var(--activity-rail-width)',

        dockSidebar
          ? sidebarWidth + 'px'
          : '0px',

        'minmax(0, 1fr)',

        dockInspector
          ? 'var(--inspector-width)'
          : '0px',
      ].join(' '),
    [
      dockInspector,
      dockSidebar,
      sidebarWidth,
    ],
  )

  const rows = hasCanvas
    ? [
        'var(--chrome-height)',
        'minmax(0, 1fr)',
        'var(--status-height)',
      ].join(' ')
    : [
        'var(--chrome-height)',
        'minmax(0, 1fr)',
      ].join(' ')

  const chrome = (
    <header
      className={[
        'col-span-full row-1',
        'min-h-0 min-w-0',
        'border-b border-divider',
        'bg-chrome',
      ].join(' ')}
    >
      {renderChrome({
        isSidebarOpen,
        sidebarWidth:
          dockSidebar
            ? sidebarWidth
            : 0,

        tabs: model.tabs,

        onSidebarToggle:
          toggleSidebar,

        onActivateCanvas:
          actions.activateCanvas,

        onCloseCanvas:
          actions.closeCanvas,

        onCreateCanvas:
          actions.createCanvas,
      })}
    </header>
  )

  const rail = (
    <div
      className={[
        'row-[2/-1]',
        'min-h-0',
        'border-r',
        'border-divider',
        'bg-sidebar',
      ].join(' ')}
      style={{
        gridColumn: 1,
      }}
    >
      <ActivityRail
        activeItemId={
          activeNavigationItem
        }
        onItemActivate={(item) => {
          setActiveNavigationItem(
            item,
          )

          openSidebar()
        }}
        onSettingsOpen={
          actions.openSettingsWindow
        }
      />
    </div>
  )

  const sidebarContent = (
    <WorkspaceSidebar
      activeNavigationItem={
        activeNavigationItem
      }
      onActivatePage={
        actions.activatePage
      }
      onClose={() => {
        setSidebarOpen(false)
      }}
      onCreatePage={
        actions.createPage
      }
      pages={pages}
    />
  )

  const sidebar = (
    <>
      <div
        className={[
          'relative row-[2/-1]',
          'min-h-0 min-w-0',
          'border-r',
          'border-divider',
          'bg-sidebar',
        ].join(' ')}
        style={{
          gridColumn: 2,
        }}
      >
        {dockSidebar
          ? sidebarContent
          : null}

        {dockSidebar ? (
          <SidebarSplitter
            max={SIDEBAR_MAX}
            min={SIDEBAR_MIN}
            onCollapse={() => {
              setSidebarOpen(false)
            }}
            onResize={
              setSidebarWidth
            }
            onResizeStart={() => {
              setResizing(true)
            }}
            width={sidebarWidth}
          />
        ) : null}
      </div>

      {mode === 'narrow' &&
      isSidebarOpen ? (
        <div
          className={[
            'fixed inset-x-0',
            'bottom-0',
            'top-[var(--chrome-height)]',
            'z-[var(--ui-z-popover)]',
          ].join(' ')}
        >
          <button
            aria-label="关闭工作区导航"
            className={[
              'absolute inset-0',
              'cursor-default',
              'bg-black/35',
            ].join(' ')}
            onClick={() => {
              setSidebarOpen(false)
            }}
            type="button"
          />

          <aside
            aria-label="工作区导航"
            className={[
              'relative',
              'ml-[var(--activity-rail-width)]',
              'h-full',
              'w-[min(82vw,320px)]',
              'border-r',
              'border-divider',
              'bg-sidebar',
              'shadow-2xl',
            ].join(' ')}
          >
            <div className="relative h-full">
              {sidebarContent}

              <Button
                aria-label="关闭侧边栏"
                className={[
                  'absolute',
                  'right-2 top-2',
                ].join(' ')}
                onClick={() => {
                  setSidebarOpen(false)
                }}
                size="icon"
                type="button"
                variant="ghost"
              >
                <PanelLeftClose
                  aria-hidden="true"
                  className="size-4"
                />
              </Button>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  )

  const canvas = (
    <section
      aria-label="内容区"
      className={[
        'row-2',
        'min-h-0 min-w-0',
        'overflow-hidden',
      ].join(' ')}
      style={{
        gridColumn: 3,
      }}
    >
      <main
        className={[
          'relative h-full',
          'min-h-0 min-w-0',
          'overflow-hidden',
        ].join(' ')}
      >
        {hasCanvas
          ? editor
          : (
              <NoCanvasSurface
                onCreateDocument={
                  actions.createCanvas
                }
                onOpenDocument={
                  actions.openCanvas
                }
              />
            )}
      </main>
    </section>
  )

  const inspectorContent = (
    <InspectorHost>
      {inspector}
    </InspectorHost>
  )

  const inspectorRegion =
    hasCanvas ? (
      <>
        <aside
          aria-label="属性检查器"
          className={
            dockInspector
              ? [
                  'row-[2/-1]',
                  'min-h-0 min-w-0',
                  'border-l',
                  'border-divider',
                ].join(' ')
              : 'pointer-events-none'
          }
          style={{
            gridColumn: 4,
          }}
        >
          {dockInspector ? (
            <div className="relative h-full">
              <Button
                aria-label="收起属性面板"
                className={[
                  'absolute -left-8',
                  'top-3 z-30',
                  'size-7',
                  'rounded-r-none',
                ].join(' ')}
                onClick={() => {
                  setInspectorOpen(false)
                }}
                size="icon"
                type="button"
                variant="outline"
              >
                <PanelRightClose
                  aria-hidden="true"
                  className="size-3.5"
                />
              </Button>

              {inspectorContent}
            </div>
          ) : null}
        </aside>

        {!dockInspector &&
        !isInspectorOpen ? (
          <Button
            aria-expanded={false}
            aria-label="展开属性面板"
            className={[
              'fixed right-0',
              'top-[calc(var(--chrome-height)+12px)]',
              'z-30',
              'rounded-r-none',
            ].join(' ')}
            onClick={openInspector}
            size="icon"
            type="button"
            variant="outline"
          >
            <PanelRightOpen
              aria-hidden="true"
              className="size-4"
            />
          </Button>
        ) : null}

        {mode !== 'wide' &&
        isInspectorOpen ? (
          <div
            className={[
              'fixed inset-x-0',
              'bottom-0',
              'top-[var(--chrome-height)]',
              'z-[var(--ui-z-popover)]',
            ].join(' ')}
          >
            <button
              aria-label="关闭属性检查器"
              className={[
                'absolute inset-0',
                'cursor-default',
                'bg-black/35',
              ].join(' ')}
              onClick={() => {
                setInspectorOpen(false)
              }}
              type="button"
            />

            <aside
              aria-label="属性检查器"
              className={[
                'relative ml-auto',
                'h-full',
                'w-[min(92vw,340px)]',
                'border-l',
                'border-divider',
                'bg-sidebar',
                'shadow-2xl',
              ].join(' ')}
            >
              {inspectorContent}
            </aside>
          </div>
        ) : null}
      </>
    ) : null

  const status = hasCanvas ? (
    <div
      className="min-w-0"
      style={{
        gridColumn: 3,
        gridRow: 3,
      }}
    >
      <StatusBarHost
        left={statusLeft}
        right={statusRight}
      />
    </div>
  ) : null

  return (
    <TooltipProvider
      delayDuration={450}
    >
      <WorkspaceFrame
        rootRef={rootRef}
        chrome={chrome}
        rail={rail}
        sidebar={sidebar}
        canvas={canvas}
        inspector={inspectorRegion}
        statusBar={status}
        overlays={
          <>
            {assistantOverlay}
            {overlays}
          </>
        }
        gridTemplateColumns={
          columns
        }
        gridTemplateRows={rows}
      />
    </TooltipProvider>
  )
}
`,
}

function absolute(relativePath) {
  return path.join(ROOT, relativePath)
}

function assertRepository() {
  const packageFile = absolute('package.json')

  if (!fs.existsSync(packageFile)) {
    throw new Error('请在 Canvas 仓库根目录运行脚本。')
  }

  const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf8'))

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error('当前目录不是 hybrid-canvas 仓库。')
  }

  for (const relativePath of Object.keys(GENERATED_FILES)) {
    if (!fs.existsSync(absolute(relativePath))) {
      throw new Error('缺少目标文件：' + relativePath)
    }
  }

  if (ALLOW_DIRTY) {
    return
  }

  const status = execFileSync('git', ['status', '--porcelain'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim()

  if (status.length > 0) {
    throw new Error('Git 工作区不干净。' + '请先提交，或显式使用 --allow-dirty。')
  }
}

function buildChanges() {
  return Object.entries(GENERATED_FILES)
    .map(([relativePath, nextContent]) => ({
      relativePath,

      currentContent: fs.readFileSync(absolute(relativePath), 'utf8'),

      nextContent,
    }))
    .filter((change) => change.currentContent !== change.nextContent)
}

function applyChanges(changes) {
  for (const change of changes) {
    fs.mkdirSync(path.dirname(absolute(change.relativePath)), {
      recursive: true,
    })

    fs.writeFileSync(absolute(change.relativePath), change.nextContent, 'utf8')
  }

  execFileSync('git', ['diff', '--check'], {
    cwd: ROOT,
    stdio: 'inherit',
  })
}

function printPlan(changes) {
  console.log('Phase 3 将修改 ' + changes.length + ' 个文件：')

  for (const change of changes) {
    console.log('- ' + change.relativePath)
  }
}

function main() {
  assertRepository()

  const changes = buildChanges()

  if (changes.length === 0) {
    console.log('Phase 3 没有需要应用的修改。')

    return
  }

  printPlan(changes)

  if (!APPLY) {
    console.log('')
    console.log('当前为预检模式，没有写入文件。')

    console.log('应用命令：')

    console.log('node tooling/script/refactor-ui-phase-3.mjs --apply')

    return
  }

  applyChanges(changes)

  console.log('')
  console.log('Phase 3 Workspace 响应式重构已写入。')

  console.log('')
  console.log('请依次执行：')
  console.log('pnpm format')
  console.log('pnpm lint')
  console.log('pnpm typecheck')
  console.log('pnpm test:architecture')
  console.log('pnpm test')
  console.log('pnpm build:desktop')

  console.log('')
  console.log('放弃本阶段未提交修改：')

  console.log('git restore -- ' + changes.map((change) => change.relativePath).join(' '))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)

  process.exitCode = 1
}
