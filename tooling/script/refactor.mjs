// refactor-sidebar-resize.mjs
// 放在仓库根目录执行：
// node refactor-sidebar-resize.mjs

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const sidebarSplitterPath = resolve(
  'features/workspace/src/presentation/shell/SidebarSplitter.tsx',
)

const workspaceShellPath = resolve(
  'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
)

const sidebarSplitterSource = `import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
} from 'react'

export interface SidebarSplitterProps {
  readonly width: number
  readonly min: number
  readonly max: number
  readonly onResizeStart?: () => void
  readonly onResize: (width: number) => void
  readonly onResizeEnd?: () => void
  readonly onCollapse: () => void
}

interface SidebarDragSession {
  readonly pointerId: number
  readonly element: HTMLDivElement
  readonly startX: number
  readonly startWidth: number
  readonly previousBodyCursor: string
  readonly previousBodyUserSelect: string
}

export function SidebarSplitter({
  width,
  min,
  max,
  onResizeStart,
  onResize,
  onResizeEnd,
  onCollapse,
}: SidebarSplitterProps) {
  const dragSessionRef =
    useRef<SidebarDragSession | null>(null)

  const resizeEndRef = useRef(onResizeEnd)

  resizeEndRef.current = onResizeEnd

  const clamp = (nextWidth: number) => {
    return Math.max(
      min,
      Math.min(max, nextWidth),
    )
  }

  const restoreBodyInteraction = (
    session: SidebarDragSession,
  ) => {
    document.body.style.cursor =
      session.previousBodyCursor

    document.body.style.userSelect =
      session.previousBodyUserSelect
  }

  const finishResize = () => {
    const session = dragSessionRef.current

    if (!session) {
      return
    }

    /*
     * 先清除会话，再释放 pointer capture。
     * releasePointerCapture 会触发 lostpointercapture，
     * 先清除可以避免重复执行结束逻辑。
     */
    dragSessionRef.current = null

    if (
      session.element.hasPointerCapture(
        session.pointerId,
      )
    ) {
      session.element.releasePointerCapture(
        session.pointerId,
      )
    }

    restoreBodyInteraction(session)
    resizeEndRef.current?.()
  }

  useEffect(() => {
    return () => {
      const session = dragSessionRef.current

      if (!session) {
        return
      }

      dragSessionRef.current = null
      restoreBodyInteraction(session)
    }
  }, [])

  const handlePointerDown = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    /*
     * 理论上不会同时存在两个拖拽会话，
     * 但如果旧会话因平台事件异常尚未结束，
     * 在开始新会话前先完成清理。
     */
    finishResize()

    const element = event.currentTarget

    const session: SidebarDragSession = {
      pointerId: event.pointerId,
      element,
      startX: event.clientX,
      startWidth: width,
      previousBodyCursor:
        document.body.style.cursor,
      previousBodyUserSelect:
        document.body.style.userSelect,
    }

    dragSessionRef.current = session

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    /*
     * Pointer Capture 是拖拽可靠性的关键。
     * 即使指针进入 tldraw 画布、其他面板或离开
     * 分隔条的可见区域，后续事件仍发送给此元素。
     */
    element.setPointerCapture(event.pointerId)

    onResizeStart?.()
  }

  const handlePointerMove = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    const session = dragSessionRef.current

    if (
      !session ||
      session.pointerId !== event.pointerId
    ) {
      return
    }

    event.preventDefault()

    const deltaX =
      event.clientX - session.startX

    const nextWidth = clamp(
      session.startWidth + deltaX,
    )

    onResize(nextWidth)
  }

  const handlePointerUp = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    const session = dragSessionRef.current

    if (
      !session ||
      session.pointerId !== event.pointerId
    ) {
      return
    }

    event.preventDefault()
    finishResize()
  }

  const handlePointerCancel = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    const session = dragSessionRef.current

    if (
      !session ||
      session.pointerId !== event.pointerId
    ) {
      return
    }

    finishResize()
  }

  const handleLostPointerCapture = (
    event: PointerEvent<HTMLDivElement>,
  ) => {
    const session = dragSessionRef.current

    if (
      !session ||
      session.pointerId !== event.pointerId
    ) {
      return
    }

    finishResize()
  }

  const handleKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
  ) => {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault()
        onResize(clamp(width - 16))
        break

      case 'ArrowRight':
        event.preventDefault()
        onResize(clamp(width + 16))
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
  }

  return (
    <div
      aria-label="调整侧边栏宽度"
      aria-orientation="vertical"
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={Math.round(width)}
      className={[
        'absolute -right-1 top-0',
        'z-40 h-full w-2',
        'cursor-col-resize',
        'touch-none select-none',
        'bg-transparent',
        'outline-none',
        'transition-colors',
        'hover:bg-primary/15',
        'focus-visible:bg-primary/25',
        'data-[resizing=true]:bg-primary/25',
      ].join(' ')}
      data-resizing={
        dragSessionRef.current !== null
      }
      data-window-drag-exclude
      onDoubleClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onCollapse()
      }}
      onKeyDown={handleKeyDown}
      onLostPointerCapture={
        handleLostPointerCapture
      }
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      role="separator"
      tabIndex={0}
    />
  )
}
`

function replaceRequired(
  source,
  oldCode,
  newCode,
  description,
) {
  if (source.includes(newCode)) {
    console.log(`⏭️ 已存在：${description}`)
    return source
  }

  if (!source.includes(oldCode)) {
    throw new Error(
      `无法找到修改位置：${description}`,
    )
  }

  return source.replace(oldCode, newCode)
}

async function updateSidebarSplitter() {
  await writeFile(
    sidebarSplitterPath,
    sidebarSplitterSource,
    'utf8',
  )

  console.log(
    '✅ 已重写 SidebarSplitter 拖拽生命周期',
  )
}

async function updateWorkspaceShell() {
  let source = await readFile(
    workspaceShellPath,
    'utf8',
  )

  /*
   * rootRef 只被旧的全局 pointermove 实现用于计算位置。
   * 新实现使用 startX + deltaX，不再需要 rootRef。
   */
  source = replaceRequired(
    source,
    `import { useEffect, useMemo, useRef, useState } from 'react'`,
    `import { useEffect, useMemo, useState } from 'react'`,
    '删除 WorkspaceShell 的 useRef 导入',
  )

  source = replaceRequired(
    source,
    `  const mode = useWorkspaceLayoutMode()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const previousModeRef = useRef(mode)`,
    `  const mode = useWorkspaceLayoutMode()
  const previousModeRef = useRef(mode)`,
    '删除旧 rootRef',
  )

  /*
   * previousModeRef 和 previousInspectorSelectionKeyRef
   * 仍然需要 useRef，因此恢复 useRef 导入。
   *
   * 上面的替换只是为了明确删除 rootRef 本身，
   * 不能删除 React useRef。
   */
  source = replaceRequired(
    source,
    `import { useEffect, useMemo, useState } from 'react'`,
    `import { useEffect, useMemo, useRef, useState } from 'react'`,
    '保留其他状态引用需要的 useRef',
  )

  /*
   * 删除父组件中旧的全局拖拽生命周期。
   */
  const oldGlobalResizeEffect =
    /  useEffect\(\(\) => \{\n    const handlePointerMove = \(event: PointerEvent\) => \{[\s\S]*?\n  \}, \[isResizing\]\)\n\n/

  if (oldGlobalResizeEffect.test(source)) {
    source = source.replace(
      oldGlobalResizeEffect,
      '',
    )

    console.log(
      '✅ 已删除旧 window pointermove/pointerup 监听',
    )
  } else if (
    source.includes(
      "window.addEventListener('pointermove'",
    )
  ) {
    throw new Error(
      '检测到旧 pointermove 实现，但无法安全删除。',
    )
  } else {
    console.log(
      '⏭️ 旧全局 Pointer 监听已经删除',
    )
  }

  /*
   * 提高整个侧边栏区域层级。
   * 分隔条向右延伸到画布区域时不会被画布覆盖。
   */
  source = replaceRequired(
    source,
    `className="relative row-[2/-1] min-h-0 min-w-0 overflow-visible border-r border-divider bg-sidebar"`,
    `className="relative z-20 row-[2/-1] min-h-0 min-w-0 overflow-visible border-r border-divider bg-sidebar"`,
    '提高侧边栏和分隔条层级',
  )

  /*
   * 新的 SidebarSplitter 自己拥有 pointermove/up/cancel，
   * 父组件只负责接收宽度及控制布局动画。
   */
  source = replaceRequired(
    source,
    `            onCollapse={() => setSidebarOpen(false)}
            onResize={setSidebarWidth}
            onResizeStart={() => setResizing(true)}
            width={sidebarWidth}`,
    `            onCollapse={() => setSidebarOpen(false)}
            onResize={setSidebarWidth}
            onResizeEnd={() => setResizing(false)}
            onResizeStart={() => setResizing(true)}
            width={sidebarWidth}`,
    '连接拖拽结束事件',
  )

  /*
   * WorkspaceFrame 不再需要旧的拖拽位置引用。
   */
  source = source.replace(
    /^\s*rootRef=\{rootRef\}\n/m,
    '',
  )

  await writeFile(
    workspaceShellPath,
    source,
    'utf8',
  )

  console.log('✅ 已更新 WorkspaceShell')
}

async function verifyResult() {
  const [
    splitterSource,
    shellSource,
  ] = await Promise.all([
    readFile(sidebarSplitterPath, 'utf8'),
    readFile(workspaceShellPath, 'utf8'),
  ])

  const checks = [
    {
      passed: splitterSource.includes(
        'setPointerCapture(event.pointerId)',
      ),
      message:
        'SidebarSplitter 缺少 setPointerCapture',
    },
    {
      passed: splitterSource.includes(
        'releasePointerCapture',
      ),
      message:
        'SidebarSplitter 缺少 releasePointerCapture',
    },
    {
      passed: splitterSource.includes(
        'onLostPointerCapture',
      ),
      message:
        'SidebarSplitter 缺少 lostpointercapture 处理',
    },
    {
      passed: splitterSource.includes(
        'onPointerCancel',
      ),
      message:
        'SidebarSplitter 缺少 pointercancel 处理',
    },
    {
      passed: splitterSource.includes(
        'startWidth + deltaX',
      ),
      message:
        'SidebarSplitter 没有使用相对位移计算宽度',
    },
    {
      passed: splitterSource.includes(
        'touch-none select-none',
      ),
      message:
        'SidebarSplitter 缺少触摸和选择保护',
    },
    {
      passed: splitterSource.includes(
        'data-window-drag-exclude',
      ),
      message:
        'SidebarSplitter 缺少窗口拖拽排除标记',
    },
    {
      passed: shellSource.includes(
        'onResizeEnd={() => setResizing(false)}',
      ),
      message:
        'WorkspaceShell 缺少 resize end 状态处理',
    },
    {
      passed: !shellSource.includes(
        "window.addEventListener('pointermove'",
      ),
      message:
        'WorkspaceShell 仍然残留全局 pointermove',
    },
    {
      passed: !shellSource.includes(
        "window.addEventListener('pointerup'",
      ),
      message:
        'WorkspaceShell 仍然残留全局 pointerup',
    },
    {
      passed: !shellSource.includes(
        "document.body.style.removeProperty('cursor')",
      ),
      message:
        'WorkspaceShell 仍然拥有旧 body 清理逻辑',
    },
    {
      passed: !shellSource.includes(
        'rootRef={rootRef}',
      ),
      message:
        'WorkspaceShell 仍然传递旧 rootRef',
    },
  ]

  const failures = checks.filter(
    (check) => !check.passed,
  )

  if (failures.length > 0) {
    console.error('❌ 验证失败：')

    for (const failure of failures) {
      console.error(`   - ${failure.message}`)
    }

    process.exitCode = 1
    return
  }

  console.log(
    '✅ 已确认旧全局拖拽实现删除干净',
  )

  console.log(
    '✅ 已确认 Pointer Capture 生命周期完整',
  )
}

async function main() {
  try {
    await updateSidebarSplitter()
    await updateWorkspaceShell()
    await verifyResult()

    if (process.exitCode) {
      return
    }

    console.log('')
    console.log('🎉 侧边栏拖拽重构完成')
    console.log('')
    console.log('请执行：')
    console.log('  pnpm format')
    console.log('  pnpm typecheck')
    console.log('  pnpm test:architecture')
    console.log('  pnpm build:desktop')
    console.log('  git diff --check')
  } catch (error) {
    console.error('❌ 重构失败')

    if (error instanceof Error) {
      console.error(error.message)
    } else {
      console.error(error)
    }

    process.exit(1)
  }
}

await main()