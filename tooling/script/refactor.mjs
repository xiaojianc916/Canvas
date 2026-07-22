#!/usr/bin/env node

/**
 * Canvas tldraw 能力续补脚本
 *
 * 使用：
 *   保存为 scripts/connect-tldraw-capabilities.mjs
 *   在仓库根目录运行：
 *
 *   node scripts/connect-tldraw-capabilities.mjs
 *
 * 效果：
 *   1. 删除无效的“网格”工具栏按钮
 *   2. 取消画布启动时强制开启网格
 *   3. 扩展 tldraw 工具：
 *      - 选择、手形、形状、箭头、直线
 *      - 文本、画笔、高亮、橡皮擦
 *      - 便签、画框、缩放
 *   4. 接入撤销、重做、复制、删除
 *   5. “更多”菜单接入：
 *      - 全选、编组、取消编组
 *      - 锁定、解锁
 *      - 置顶、置底、上移、下移
 *      - 水平/垂直翻转
 *      - 缩放至选区、适应内容、恢复 100%
 *   6. 如果运行过上一个属性面板脚本，同时删除右侧栏里的网格设置
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()

const toolbarPath = resolve(
  root,
  'editor/core/src/react/CanvasToolbar.tsx',
)

const editorCanvasPath = resolve(
  root,
  'editor/core/src/react/EditorCanvas.tsx',
)

const workspaceContainerPath = resolve(
  root,
  'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
)

async function fileExists(path) {
  try {
    await readFile(path)
    return true
  } catch {
    return false
  }
}

async function readText(path) {
  return readFile(path, 'utf8')
}

async function writeText(path, content) {
  await writeFile(path, content, 'utf8')
}

function replaceRequired(source, search, replacement, description) {
  const index = source.indexOf(search)

  if (index === -1) {
    throw new Error(`没有找到修改位置：${description}`)
  }

  return source.slice(0, index) + replacement + source.slice(index + search.length)
}

function replaceOptional(source, search, replacement = '') {
  const index = source.indexOf(search)

  if (index === -1) {
    return source
  }

  return source.slice(0, index) + replacement + source.slice(index + search.length)
}

const toolbarSource = String.raw`import {
  Button,
  cn,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@hybrid-canvas/design-system'
import {
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRight,
  ArrowRightToLine,
  ArrowUpToLine,
  BringToFront,
  Copy,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  Frame,
  Group,
  Hand,
  Highlighter,
  LineChart,
  Lock,
  Menu,
  MousePointer2,
  Pencil,
  Redo2,
  Save,
  Scan,
  SendToBack,
  Shapes,
  StickyNote,
  Type,
  Undo2,
  Ungroup,
  Unlock,
  ZoomIn,
} from 'lucide-react'
import {
  type ComponentType,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useValue } from 'tldraw'

import type { CanvasToolId } from '../application/model/canvas-session-view-model'
import { useEditor } from './editor-context'

interface CanvasToolDefinition {
  readonly id: CanvasToolId
  readonly label: string
  readonly shortcut: string
  readonly icon: ComponentType<{ className?: string }>
  readonly separatorBefore?: boolean
}

const CORE_CANVAS_TOOLS: readonly CanvasToolDefinition[] = [
  {
    id: 'select',
    label: '选择',
    shortcut: 'V',
    icon: MousePointer2,
  },
  {
    id: 'hand',
    label: '移动画布',
    shortcut: 'H',
    icon: Hand,
  },
  {
    id: 'geo',
    label: '形状',
    shortcut: 'R',
    icon: Shapes,
    separatorBefore: true,
  },
  {
    id: 'arrow',
    label: '连接',
    shortcut: 'A',
    icon: ArrowRight,
  },
  {
    id: 'line',
    label: '直线',
    shortcut: 'L',
    icon: LineChart,
  },
  {
    id: 'text',
    label: '文本',
    shortcut: 'T',
    icon: Type,
  },
  {
    id: 'draw',
    label: '自由绘制',
    shortcut: 'D',
    icon: Pencil,
  },
  {
    id: 'highlight',
    label: '高亮',
    shortcut: 'Shift+D',
    icon: Highlighter,
  },
  {
    id: 'eraser',
    label: '橡皮擦',
    shortcut: 'E',
    icon: Eraser,
  },
  {
    id: 'note',
    label: '便签',
    shortcut: 'N',
    icon: StickyNote,
  },
  {
    id: 'frame',
    label: '画框',
    shortcut: 'F',
    icon: Frame,
  },
  {
    id: 'zoom',
    label: '缩放',
    shortcut: 'Z',
    icon: ZoomIn,
  },
]

export interface CanvasToolbarProps {
  readonly onSave?: () => void
}

export function CanvasToolbar({ onSave }: CanvasToolbarProps) {
  const editor = useEditor()
  const [isMoreOpen, setMoreOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const activeToolId = useValue(
    'active canvas tool',
    () => editor?.getCurrentToolId() ?? 'select',
    [editor],
  )

  const selectedShapes = useValue(
    'canvas toolbar selected shapes',
    () => editor?.getSelectedShapes() ?? [],
    [editor],
  )

  const selectionCount = selectedShapes.length
  const hasSelection = selectionCount > 0
  const hasMultipleSelection = selectionCount > 1
  const containsGroup = selectedShapes.some((shape) => shape.type === 'group')
  const allLocked =
    hasSelection && selectedShapes.every((shape) => shape.isLocked)

  useEffect(() => {
    if (!isMoreOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target

      if (
        target instanceof Node &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setMoreOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMoreOpen])

  const selectedIds = selectedShapes.map((shape) => shape.id)

  const activateTool = (toolId: CanvasToolId) => {
    editor?.setCurrentTool(toolId)
    setMoreOpen(false)
  }

  const toggleLock = () => {
    if (!editor || !hasSelection) {
      return
    }

    const shouldLock = !selectedShapes.every((shape) => shape.isLocked)

    editor.updateShapes(
      selectedShapes.map((shape) => ({
        id: shape.id,
        type: shape.type,
        isLocked: shouldLock,
      })) as never,
    )

    setMoreOpen(false)
  }

  const execute = (action: () => void) => {
    action()
    setMoreOpen(false)
  }

  return (
    <div
      aria-label="画布工具"
      className={cn(
        'absolute left-1/2 top-3 z-20 flex max-w-[calc(100%-24px)]',
        '-translate-x-1/2 items-center gap-0.5 rounded-[10px]',
        'border border-border/90 bg-background/95 p-1',
        'shadow-[0_1px_2px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.08)]',
        'backdrop-blur-xl',
      )}
      role="toolbar"
    >
      <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
        {CORE_CANVAS_TOOLS.map((tool) => {
          const Icon = tool.icon
          const isActive = activeToolId === tool.id

          return (
            <div className="contents" key={tool.id}>
              {tool.separatorBefore ? (
                <Separator
                  className="mx-1 h-5 shrink-0"
                  orientation="vertical"
                />
              ) : null}

              <ToolbarButton
                active={isActive}
                icon={Icon}
                label={tool.label}
                onClick={() => activateTool(tool.id)}
                shortcut={tool.shortcut}
              />
            </div>
          )
        })}

        <Separator
          className="mx-1 h-5 shrink-0"
          orientation="vertical"
        />

        <ToolbarButton
          icon={Undo2}
          label="撤销"
          onClick={() => editor?.undo()}
          shortcut="Ctrl+Z"
        />

        <ToolbarButton
          icon={Redo2}
          label="重做"
          onClick={() => editor?.redo()}
          shortcut="Ctrl+Shift+Z"
        />

        <ToolbarButton
          disabled={!hasSelection}
          icon={Copy}
          label="复制对象"
          onClick={() => {
            if (editor) {
              editor.duplicateShapes(selectedIds)
            }
          }}
          shortcut="Ctrl+D"
        />

        <ToolbarButton
          disabled={!hasSelection}
          icon={Eraser}
          label="删除"
          onClick={() => editor?.deleteShapes(selectedIds)}
          shortcut="Delete"
        />
      </div>

      <Separator
        className="mx-1 h-5 shrink-0"
        orientation="vertical"
      />

      <div className="relative shrink-0" ref={menuRef}>
        <ToolbarButton
          active={isMoreOpen}
          icon={Menu}
          label="更多"
          onClick={() => setMoreOpen((open) => !open)}
        />

        {isMoreOpen ? (
          <div
            aria-label="更多画布操作"
            className={cn(
              'absolute right-0 top-[calc(100%+8px)] z-[var(--ui-z-popover)]',
              'w-56 overflow-hidden rounded-lg border border-border',
              'bg-background p-1.5 shadow-xl',
            )}
            role="menu"
          >
            <MenuSection title="选择">
              <MenuAction
                icon={Scan}
                label="选择全部"
                onClick={() => execute(() => editor?.selectAll())}
                shortcut="Ctrl+A"
              />

              <MenuAction
                disabled={!hasMultipleSelection}
                icon={Group}
                label="编组"
                onClick={() =>
                  execute(() => editor?.groupShapes(selectedIds))
                }
                shortcut="Ctrl+G"
              />

              <MenuAction
                disabled={!containsGroup}
                icon={Ungroup}
                label="取消编组"
                onClick={() =>
                  execute(() => editor?.ungroupShapes(selectedIds))
                }
                shortcut="Ctrl+Shift+G"
              />

              <MenuAction
                disabled={!hasSelection}
                icon={allLocked ? Unlock : Lock}
                label={allLocked ? '解除锁定' : '锁定对象'}
                onClick={toggleLock}
              />
            </MenuSection>

            <MenuDivider />

            <MenuSection title="层级">
              <MenuAction
                disabled={!hasSelection}
                icon={BringToFront}
                label="置于顶层"
                onClick={() =>
                  execute(() => editor?.bringToFront(selectedIds))
                }
              />

              <MenuAction
                disabled={!hasSelection}
                icon={ArrowUpToLine}
                label="上移一层"
                onClick={() =>
                  execute(() => editor?.bringForward(selectedIds))
                }
              />

              <MenuAction
                disabled={!hasSelection}
                icon={ArrowDownToLine}
                label="下移一层"
                onClick={() =>
                  execute(() => editor?.sendBackward(selectedIds))
                }
              />

              <MenuAction
                disabled={!hasSelection}
                icon={SendToBack}
                label="置于底层"
                onClick={() =>
                  execute(() => editor?.sendToBack(selectedIds))
                }
              />
            </MenuSection>

            <MenuDivider />

            <MenuSection title="变换">
              <MenuAction
                disabled={!hasSelection}
                icon={FlipHorizontal2}
                label="水平翻转"
                onClick={() =>
                  execute(() =>
                    editor?.flipShapes(selectedIds, 'horizontal'),
                  )
                }
              />

              <MenuAction
                disabled={!hasSelection}
                icon={FlipVertical2}
                label="垂直翻转"
                onClick={() =>
                  execute(() =>
                    editor?.flipShapes(selectedIds, 'vertical'),
                  )
                }
              />
            </MenuSection>

            <MenuDivider />

            <MenuSection title="视图">
              <MenuAction
                disabled={!hasSelection}
                icon={ZoomIn}
                label="缩放至选区"
                onClick={() => execute(() => editor?.zoomToSelection())}
              />

              <MenuAction
                icon={ArrowLeftToLine}
                label="适应全部内容"
                onClick={() => execute(() => editor?.zoomToFit())}
              />

              <MenuAction
                icon={ArrowRightToLine}
                label="恢复 100%"
                onClick={() => execute(() => editor?.resetZoom())}
              />
            </MenuSection>
          </div>
        ) : null}
      </div>

      {onSave ? (
        <>
          <Separator
            className="mx-1 h-5 shrink-0"
            orientation="vertical"
          />

          <ToolbarButton
            icon={Save}
            label="保存"
            onClick={onSave}
            shortcut="Ctrl+S"
          />
        </>
      ) : null}
    </div>
  )
}

interface ToolbarButtonProps {
  readonly icon: ComponentType<{ className?: string }>
  readonly label: string
  readonly onClick: () => void
  readonly shortcut?: string
  readonly active?: boolean
  readonly disabled?: boolean
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
  shortcut,
  active = false,
  disabled = false,
}: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          aria-pressed={active}
          className={cn(
            'size-8 shrink-0 rounded-md text-muted-foreground',
            'hover:bg-accent hover:text-foreground',
            active &&
              'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
          )}
          disabled={disabled}
          onClick={onClick}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>

      <TooltipContent side="bottom">
        <span>{label}</span>
        {shortcut ? (
          <kbd className="ml-2 text-[10px] opacity-60">
            {shortcut}
          </kbd>
        ) : null}
      </TooltipContent>
    </Tooltip>
  )
}

interface MenuSectionProps {
  readonly title: string
  readonly children: ReactNode
}

function MenuSection({ title, children }: MenuSectionProps) {
  return (
    <section>
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div>{children}</div>
    </section>
  )
}

interface MenuActionProps {
  readonly icon: ComponentType<{ className?: string }>
  readonly label: string
  readonly onClick: () => void
  readonly shortcut?: string
  readonly disabled?: boolean
}

function MenuAction({
  icon: Icon,
  label,
  onClick,
  shortcut,
  disabled = false,
}: MenuActionProps) {
  return (
    <button
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-md px-2',
        'text-left text-[11px] transition-colors',
        'hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40',
      )}
      disabled={disabled}
      onClick={onClick}
      role="menuitem"
      type="button"
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut ? (
        <kbd className="shrink-0 text-[9px] text-muted-foreground">
          {shortcut}
        </kbd>
      ) : null}
    </button>
  )
}

function MenuDivider() {
  return <Separator className="my-1" />
}
`

async function replaceToolbar() {
  if (!(await fileExists(toolbarPath))) {
    throw new Error(`文件不存在：${toolbarPath}`)
  }

  await writeText(toolbarPath, toolbarSource)
}

async function disableForcedGrid() {
  const original = await readText(editorCanvasPath)

  let next = original

  next = replaceOptional(
    next,
    `      editor.updateInstanceState({ isGridMode: true })
`,
    `      editor.updateInstanceState({ isGridMode: false })
`,
  )

  /*
   * 如果代码已经被手工修改成其他格式，则匹配精简形式。
   */
  next = replaceOptional(
    next,
    'editor.updateInstanceState({ isGridMode: true })',
    'editor.updateInstanceState({ isGridMode: false })',
  )

  if (next === original) {
    console.warn('未发现强制开启网格的代码，跳过 EditorCanvas 修改。')
    return
  }

  await writeText(editorCanvasPath, next)
}

async function removeInspectorGridControls() {
  if (!(await fileExists(workspaceContainerPath))) {
    return
  }

  const original = await readText(workspaceContainerPath)
  let next = original

  /*
   * 删除上一版脚本中添加的响应式网格状态。
   */
  next = next.replace(
    /\n  const isGridMode = useValue\(\n    'canvas inspector grid mode',\n    \(\) => editor\?\.getInstanceState\(\)\.isGridMode \?\? false,\n    \[editor\],\n  \)\n/g,
    '\n',
  )

  /*
   * 删除上一版脚本中的“画布显示 / 显示网格”区域。
   */
  next = next.replace(
    /\n        <InspectorSection title="画布显示">\n          <InspectorToggle\n            checked=\{isGridMode\}\n            label="显示网格"\n            onChange=\{\(checked\) => \{\n              editor\.updateInstanceState\(\{\n                isGridMode: checked,\n              \}\)\n            \}\}\n          \/>\n        <\/InspectorSection>\n/g,
    '\n',
  )

  /*
   * 如果 InspectorToggle 已经没有调用，则删除组件定义。
   */
  const toggleCallCount = (next.match(/<InspectorToggle/g) ?? []).length

  if (toggleCallCount === 0) {
    next = next.replace(
      /\ninterface InspectorToggleProps \{[\s\S]*?\n\}\n\nfunction InspectorToggle\([\s\S]*?\n\}\n(?=\ninterface InspectorEmptyStateProps)/,
      '\n',
    )
  }

  if (next !== original) {
    await writeText(workspaceContainerPath, next)
  }
}

async function verifyExpectedFiles() {
  const expected = [
    toolbarPath,
    editorCanvasPath,
  ]

  for (const path of expected) {
    if (!(await fileExists(path))) {
      throw new Error(
        `当前目录似乎不是 Canvas 仓库根目录，缺少文件：${path}`,
      )
    }
  }
}

async function main() {
  console.log('正在接入 tldraw 工具能力……')

  await verifyExpectedFiles()
  await replaceToolbar()
  await disableForcedGrid()
  await removeInspectorGridControls()

  console.log('')
  console.log('修改完成：')
  console.log('  ✓ 删除无效的网格按钮')
  console.log('  ✓ 关闭强制网格显示和网格吸附')
  console.log('  ✓ 扩展 tldraw 绘图工具')
  console.log('  ✓ 接入撤销、重做、复制、删除')
  console.log('  ✓ 接入编组、锁定、层级、翻转')
  console.log('  ✓ 接入画布与选区缩放')
  console.log('')
  console.log('请执行：')
  console.log('  pnpm format')
  console.log('  pnpm typecheck')
  console.log('  pnpm test:architecture')
}

main().catch((error) => {
  console.error('')
  console.error('修改失败：')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})