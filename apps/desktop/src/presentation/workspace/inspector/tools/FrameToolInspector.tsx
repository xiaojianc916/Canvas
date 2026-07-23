import { createShapeId, DefaultColorStyle, useValue } from 'tldraw'
import {
  InspectorHint,
  ShapeInspectorSection,
  ToolColorSection,
  ToolPanelHeader,
} from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

const FRAME_PRESETS = [
  {
    id: 'presentation',
    label: '演示',
    description: '16:9',
    width: 1920,
    height: 1080,
  },
  {
    id: 'desktop',
    label: '桌面',
    description: '1440 × 900',
    width: 1440,
    height: 900,
  },
  {
    id: 'mobile',
    label: '移动',
    description: '390 × 844',
    width: 390,
    height: 844,
  },
  {
    id: 'a4-landscape',
    label: 'A4 横向',
    description: '1123 × 794',
    width: 1123,
    height: 794,
  },
] as const

export function FrameToolInspector({ editor }: ToolInspectorProps) {
  const currentColor = useValue(
    'inspector next frame color',
    () => editor.getStyleForNextShape(DefaultColorStyle),
    [editor],
  )

  const createPresetFrame = (preset: (typeof FRAME_PRESETS)[number]) => {
    const id = createShapeId()
    const viewport = editor.getViewportPageBounds()

    const x = viewport.center.x - preset.width / 2

    const y = viewport.center.y - preset.height / 2

    editor.markHistoryStoppingPoint('create frame from preset')

    editor.createShape({
      id,
      type: 'frame',
      x,
      y,
      props: {
        w: preset.width,
        h: preset.height,
        name: preset.label,
        color: currentColor,
      },
    } as never)

    editor.select(id)
    editor.setCurrentTool('select')
  }

  return (
    <ToolPanelHeader description="拖动创建自定义画框，或使用预设快速创建标准尺寸。" title="画框">
      <ShapeInspectorSection
        description="点击预设后，会在当前视口中心创建并选中画框。"
        title="快速创建"
      >
        <div className="grid grid-cols-2 gap-2">
          {FRAME_PRESETS.map((preset) => (
            <button
              className="group min-h-20 rounded-md border border-divider bg-background p-2 text-left transition-colors hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              key={preset.id}
              onClick={() => {
                createPresetFrame(preset)
              }}
              type="button"
            >
              <FramePresetPreview height={preset.height} width={preset.width} />

              <span className="mt-2 block text-[11px] font-medium">{preset.label}</span>

              <span className="mt-0.5 block font-mono text-[9px] tabular-nums text-muted-foreground">
                {preset.description}
              </span>
            </button>
          ))}
        </div>
      </ShapeInspectorSection>

      <ToolColorSection editor={editor} />

      <ShapeInspectorSection title="自定义尺寸">
        <div className="rounded-md border border-divider bg-background p-3 text-[11px] leading-5 text-muted-foreground">
          在画布中拖动以创建任意尺寸的画框。 创建后可在底部状态栏双击 W 或 H 输入精确尺寸。
        </div>
      </ShapeInspectorSection>

      <InspectorHint>
        预设创建是一次完整的文档操作，可以通过撤销命令恢复。
        画框名称、位置和尺寸创建后仍可继续编辑。
      </InspectorHint>
    </ToolPanelHeader>
  )
}

function FramePresetPreview({
  width,
  height,
}: {
  readonly width: number
  readonly height: number
}) {
  const maximumWidth = 72
  const maximumHeight = 34
  const ratio = width / height

  let previewWidth = maximumWidth
  let previewHeight = previewWidth / ratio

  if (previewHeight > maximumHeight) {
    previewHeight = maximumHeight
    previewWidth = previewHeight * ratio
  }

  return (
    <div className="flex h-9 items-center justify-center rounded bg-canvas/70">
      <span
        aria-hidden="true"
        className="block rounded-sm border border-current text-muted-foreground/50 transition-colors group-hover:text-primary/70"
        style={{
          width: previewWidth,
          height: previewHeight,
        }}
      />
    </div>
  )
}
