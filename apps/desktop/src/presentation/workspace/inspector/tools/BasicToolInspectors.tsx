import {
  ArrowShapeArrowheadEndStyle,
  ArrowShapeArrowheadStartStyle,
  DefaultFontStyle,
  DefaultTextAlignStyle,
} from 'tldraw'
import {
  InspectorHint,
  ShapeInspectorArrowheadSelect,
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
  ToolColorSection,
  ToolDashSection,
  ToolFillSection,
  ToolPanelHeader,
  ToolStrokeSizeSection,
} from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

export function ArrowToolInspector({
  editor,
}: ToolInspectorProps) {
  return (
    <ToolPanelHeader
      description="在对象之间创建连接线；以下参数用于下一条连接线。"
      title="连接"
    >
      <ShapeInspectorSection title="路由">
        <ShapeInspectorSegmentedControl
          ariaLabel="连接线路由"
          onChange={() => {
            // 后续由 flowchart feature 提供路由 StyleProp。
          }}
          options={[
            { value: 'straight', label: '直线' },
            { value: 'curved', label: '曲线' },
            { value: 'orthogonal', label: '正交' },
          ]}
          value="straight"
        />
      </ShapeInspectorSection>

      <ToolColorSection editor={editor} />
      <ToolDashSection editor={editor} />
      <ToolStrokeSizeSection editor={editor} />

      <ShapeInspectorSection title="起点">
        <ShapeInspectorArrowheadSelect
          onChange={(value) =>
            editor.setStyleForNextShapes(
              ArrowShapeArrowheadStartStyle,
              value as never,
            )
          }
          value="none"
        />
      </ShapeInspectorSection>

      <ShapeInspectorSection title="终点">
        <ShapeInspectorArrowheadSelect
          onChange={(value) =>
            editor.setStyleForNextShapes(
              ArrowShapeArrowheadEndStyle,
              value as never,
            )
          }
          value="arrow"
        />
      </ShapeInspectorSection>
    </ToolPanelHeader>
  )
}

export function TextToolInspector({
  editor,
}: ToolInspectorProps) {
  return (
    <ToolPanelHeader
      description="单击创建自动宽度文本，拖动创建固定宽度文本框。"
      title="文本"
    >
      <ToolColorSection editor={editor} />

      <ShapeInspectorSection title="字体分类">
        <ShapeInspectorSegmentedControl
          ariaLabel="默认字体分类"
          onChange={(value) =>
            editor.setStyleForNextShapes(
              DefaultFontStyle,
              value as never,
            )
          }
          options={[
            { value: 'draw', label: '手写' },
            { value: 'sans', label: '无衬线' },
            { value: 'serif', label: '衬线' },
            { value: 'mono', label: '等宽' },
          ]}
          value={null}
        />
      </ShapeInspectorSection>

      <ToolStrokeSizeSection editor={editor} />

      <ShapeInspectorSection title="对齐">
        <ShapeInspectorSegmentedControl
          ariaLabel="默认文本对齐"
          onChange={(value) =>
            editor.setStyleForNextShapes(
              DefaultTextAlignStyle,
              value as never,
            )
          }
          options={[
            { value: 'start', label: '左' },
            { value: 'middle', label: '中' },
            { value: 'end', label: '右' },
          ]}
          value={null}
        />
      </ShapeInspectorSection>
    </ToolPanelHeader>
  )
}

export function NoteToolInspector({
  editor,
}: ToolInspectorProps) {
  return (
    <ToolPanelHeader
      description="在画布中创建便签并立即输入内容。"
      title="便签"
    >
      <ToolColorSection editor={editor} />
      <ToolFillSection editor={editor} includeNone={false} />

      <ShapeInspectorSection title="字体">
        <ShapeInspectorSegmentedControl
          ariaLabel="便签字体"
          onChange={(value) =>
            editor.setStyleForNextShapes(
              DefaultFontStyle,
              value as never,
            )
          }
          options={[
            { value: 'draw', label: '手写' },
            { value: 'sans', label: '无衬线' },
            { value: 'serif', label: '衬线' },
            { value: 'mono', label: '等宽' },
          ]}
          value={null}
        />
      </ShapeInspectorSection>

      <ToolStrokeSizeSection editor={editor} />
    </ToolPanelHeader>
  )
}

export function FrameToolInspector({
  editor,
}: ToolInspectorProps) {
  return (
    <ToolPanelHeader
      description="拖动创建用于组织内容和导出的画框。"
      title="画框"
    >
      <ShapeInspectorSection title="尺寸预设">
        <ShapeInspectorSegmentedControl
          ariaLabel="画框尺寸预设"
          onChange={() => {
            // 后续由 workspace/frame extension 提供尺寸预设。
          }}
          options={[
            { value: 'custom', label: '自定义' },
            { value: 'screen', label: '屏幕' },
            { value: 'paper', label: '纸张' },
            { value: 'slide', label: '演示' },
          ]}
          value="custom"
        />
      </ShapeInspectorSection>

      <ToolColorSection editor={editor} />
      <ToolDashSection editor={editor} />
      <ToolStrokeSizeSection editor={editor} />

      <InspectorHint>
        下一阶段增加精确尺寸、裁剪内容、内边距、布局网格和导出区域。
      </InspectorHint>
    </ToolPanelHeader>
  )
}

export function EraserToolInspector() {
  return (
    <ToolPanelHeader
      description="拖过对象或笔触进行擦除。"
      title="橡皮擦"
    >
      <ShapeInspectorSection title="擦除方式">
        <ShapeInspectorSegmentedControl
          ariaLabel="擦除方式"
          onChange={() => {
            // 后续接入 eraser tool state。
          }}
          options={[
            { value: 'object', label: '对象' },
            { value: 'stroke', label: '笔画' },
            { value: 'partial', label: '局部' },
          ]}
          value="object"
        />
      </ShapeInspectorSection>

      <InspectorHint>
        当前实现使用对象擦除。笔画擦除和局部路径切割需要独立工具状态支持。
      </InspectorHint>
    </ToolPanelHeader>
  )
}

export function HandToolInspector() {
  return (
    <ToolPanelHeader
      description="拖动画布进行平移，滚轮或触控板用于缩放。"
      title="移动画布"
    >
      <ShapeInspectorSection title="快速视图">
        <div className="grid grid-cols-2 gap-2">
          <button
            className="min-h-8 rounded-md border border-divider bg-background px-2 text-[11px] hover:bg-accent"
            type="button"
          >
            适合内容
          </button>

          <button
            className="min-h-8 rounded-md border border-divider bg-background px-2 text-[11px] hover:bg-accent"
            type="button"
          >
            100%
          </button>
        </div>
      </ShapeInspectorSection>
    </ToolPanelHeader>
  )
}

export function SelectToolInspector() {
  return (
    <ToolPanelHeader
      description="选择画布中的对象以编辑属性。"
      title="选择"
    >
      <ShapeInspectorSection title="选择辅助">
        <ShapeInspectorSegmentedControl
          ariaLabel="框选方式"
          onChange={() => {
            // 后续接入 selection tool preferences。
          }}
          options={[
            { value: 'contain', label: '完全包含' },
            { value: 'intersect', label: '相交即选' },
          ]}
          value="intersect"
        />
      </ShapeInspectorSection>

      <InspectorHint>
        按住 Shift 可多选；Alt 拖动可复制；双击对象可进入专用编辑。
      </InspectorHint>
    </ToolPanelHeader>
  )
}
