import {
  Button,
  cn,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@hybrid-canvas/design-system'
import {
  ArrowRight,
  Copy,
  Eraser,
  Grid2X2,
  Hand,
  MoreHorizontal,
  MousePointer2,
  Pencil,
  Save,
  Shapes,
  StickyNote,
  Type,
} from 'lucide-react'
import type { ComponentType } from 'react'
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
  { id: 'select', label: '选择', shortcut: 'V', icon: MousePointer2 },
  { id: 'hand', label: '移动画布', shortcut: 'H', icon: Hand },
  { id: 'geo', label: '形状', shortcut: 'R', icon: Shapes, separatorBefore: true },
  { id: 'arrow', label: '连接', shortcut: 'A', icon: ArrowRight },
  { id: 'text', label: '文本', shortcut: 'T', icon: Type },
  { id: 'draw', label: '自由绘制', shortcut: 'D', icon: Pencil },
  { id: 'note', label: '便签', shortcut: 'N', icon: StickyNote },
]

export interface CanvasToolbarProps {
  readonly onSave?: () => void
}

export function CanvasToolbar({ onSave }: CanvasToolbarProps) {
  const editor = useEditor()
  const activeToolId = useValue(
    'active canvas tool',
    () => editor?.getCurrentToolId() ?? 'select',
    [editor],
  )

  function activateTool(toolId: CanvasToolId): void {
    editor?.setCurrentTool(toolId)
  }

  return (
    <div
      aria-label="画布工具"
      className={cn(
        'absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center',
        'gap-0.5 rounded-[10px] border border-border/90 bg-background/95 p-1',
        'shadow-[0_1px_2px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.08)]',
        'backdrop-blur-xl',
      )}
      role="toolbar"
    >
      {CORE_CANVAS_TOOLS.map((tool) => {
        const Icon = tool.icon
        const isActive = activeToolId === tool.id
        return (
          <div className="contents" key={tool.id}>
            {tool.separatorBefore ? (
              <Separator className="mx-1 h-5" orientation="vertical" />
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={tool.label}
                  aria-pressed={isActive}
                  className={cn(
                    'size-8 rounded-md text-muted-foreground',
                    isActive && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
                  )}
                  onClick={() => activateTool(tool.id)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Icon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span>{tool.label}</span>
                <kbd className="ml-2 text-[10px] opacity-60">{tool.shortcut}</kbd>
              </TooltipContent>
            </Tooltip>
          </div>
        )
      })}
      <Separator className="mx-1 h-5" orientation="vertical" />
      <ToolbarAction icon={Grid2X2} label="网格" onClick={() => undefined} />
      <ToolbarAction
        icon={Copy}
        label="复制样式"
        onClick={() => editor?.duplicateShapes(editor.getSelectedShapeIds())}
      />
      <ToolbarAction
        icon={Eraser}
        label="删除"
        onClick={() => editor?.deleteShapes(editor.getSelectedShapeIds())}
      />
      <ToolbarAction icon={MoreHorizontal} label="更多" onClick={() => undefined} />
      {onSave ? (
        <>
          <Separator className="mx-1 h-5" orientation="vertical" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="保存"
                className="size-8 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={onSave}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Save className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <span>保存</span>
              <kbd className="ml-2 text-[10px] opacity-60">Ctrl+S</kbd>
            </TooltipContent>
          </Tooltip>
        </>
      ) : null}
    </div>
  )
}

function ToolbarAction({
  icon: Icon,
  label,
  onClick,
}: {
  readonly icon: ComponentType<{ className?: string }>
  readonly label: string
  readonly onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          className="size-8 rounded-md text-muted-foreground"
          onClick={onClick}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Icon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
