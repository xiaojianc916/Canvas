#!/usr/bin/env node

/**
 * Hybrid Canvas — Tool Inspector Refactor / Phase 2.1
 *
 * 针对提交 923683e14bdd1e32941b5396efb354cdc15cf76b
 * 及其兼容后续版本。
 *
 * 目标：
 * 1. 删除临时 BasicToolInspectors.tsx。
 * 2. 每个工具拥有独立检查器入口。
 * 3. 新增 LineToolInspector。
 * 4. 新增 UnknownToolInspector。
 * 5. 更新 ToolInspectorRouter 和 tools/index.ts。
 *
 * 使用：
 *   node tool-inspector-refactor-phase2-1.mjs --dry-run
 *   node tool-inspector-refactor-phase2-1.mjs
 */

import {
  access,
  copyFile,
  mkdir,
  readFile,
  unlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const ROOT_DIR = path.dirname(SCRIPT_PATH)
const DRY_RUN = process.argv.includes('--dry-run')

const TOOLS_DIRECTORY = path.join(
  ROOT_DIR,
  'apps/desktop/src/presentation/workspace/inspector/tools',
)

const PATHS = {
  packageJson: path.join(ROOT_DIR, 'package.json'),

  basicInspectors: path.join(
    TOOLS_DIRECTORY,
    'BasicToolInspectors.tsx',
  ),

  router: path.join(
    TOOLS_DIRECTORY,
    'ToolInspectorRouter.tsx',
  ),

  index: path.join(
    TOOLS_DIRECTORY,
    'index.ts',
  ),

  select: path.join(
    TOOLS_DIRECTORY,
    'SelectToolInspector.tsx',
  ),

  hand: path.join(
    TOOLS_DIRECTORY,
    'HandToolInspector.tsx',
  ),

  line: path.join(
    TOOLS_DIRECTORY,
    'LineToolInspector.tsx',
  ),

  arrow: path.join(
    TOOLS_DIRECTORY,
    'ArrowToolInspector.tsx',
  ),

  text: path.join(
    TOOLS_DIRECTORY,
    'TextToolInspector.tsx',
  ),

  note: path.join(
    TOOLS_DIRECTORY,
    'NoteToolInspector.tsx',
  ),

  frame: path.join(
    TOOLS_DIRECTORY,
    'FrameToolInspector.tsx',
  ),

  eraser: path.join(
    TOOLS_DIRECTORY,
    'EraserToolInspector.tsx',
  ),

  unknown: path.join(
    TOOLS_DIRECTORY,
    'UnknownToolInspector.tsx',
  ),
}

const SELECT_TOOL_SOURCE = `import {
  InspectorHint,
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
  ToolPanelHeader,
} from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

export function SelectToolInspector({
  editor: _editor,
}: ToolInspectorProps) {
  return (
    <ToolPanelHeader
      description="选择画布中的对象以编辑属性。"
      title="选择"
    >
      <ShapeInspectorSection
        description="控制拖动选择框与对象相交时的选择方式。"
        title="框选"
      >
        <ShapeInspectorSegmentedControl
          ariaLabel="框选方式"
          onChange={() => {
            // 后续接入 SelectionTool 的用户偏好。
          }}
          options={[
            { value: 'contain', label: '完全包含' },
            { value: 'intersect', label: '相交即选' },
          ]}
          value="intersect"
        />
      </ShapeInspectorSection>

      <ShapeInspectorSection title="选择辅助">
        <div className="space-y-2 text-[11px] leading-5 text-muted-foreground">
          <p>按住 Shift 单击可增加或移除选中对象。</p>
          <p>按住 Alt 拖动对象可创建副本。</p>
          <p>双击文本、容器或路径可进入专用编辑。</p>
        </div>
      </ShapeInspectorSection>

      <InspectorHint>
        选中一个或多个对象后，右侧栏将切换为对象属性检查器。
      </InspectorHint>
    </ToolPanelHeader>
  )
}
`

const HAND_TOOL_SOURCE = `import {
  InspectorHint,
  ShapeInspectorSection,
  ToolPanelHeader,
} from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

export function HandToolInspector({
  editor,
}: ToolInspectorProps) {
  return (
    <ToolPanelHeader
      description="拖动画布进行平移，滚轮或触控板用于缩放。"
      title="移动画布"
    >
      <ShapeInspectorSection title="快速视图">
        <div className="grid grid-cols-2 gap-2">
          <button
            className="min-h-9 rounded-md border border-divider bg-background px-2 text-[11px] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => editor.zoomToFit()}
            type="button"
          >
            适合内容
          </button>

          <button
            className="min-h-9 rounded-md border border-divider bg-background px-2 text-[11px] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => editor.resetZoom()}
            type="button"
          >
            100%
          </button>
        </div>
      </ShapeInspectorSection>

      <ShapeInspectorSection title="导航快捷键">
        <div className="space-y-2 text-[11px] leading-5 text-muted-foreground">
          <p>按住空格可临时使用移动画布工具。</p>
          <p>使用滚轮或触控板缩放和平移画布。</p>
          <p>选择对象后可使用“适合选择”定位内容。</p>
        </div>
      </ShapeInspectorSection>

      <InspectorHint>
        导航设置属于本地界面状态，不应写入 TLStore 或文档历史。
      </InspectorHint>
    </ToolPanelHeader>
  )
}
`

const LINE_TOOL_SOURCE = `import {
  InspectorHint,
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
  ToolColorSection,
  ToolDashSection,
  ToolPanelHeader,
  ToolStrokeSizeSection,
} from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

export function LineToolInspector({
  editor,
}: ToolInspectorProps) {
  return (
    <ToolPanelHeader
      description="拖动创建直线或折线；以下参数用于下一条线。"
      title="直线"
    >
      <ToolColorSection editor={editor} />
      <ToolDashSection editor={editor} />
      <ToolStrokeSizeSection editor={editor} />

      <ShapeInspectorSection title="角度约束">
        <ShapeInspectorSegmentedControl
          ariaLabel="直线角度吸附"
          onChange={() => {
            // 后续接入 LineTool 的角度约束偏好。
          }}
          options={[
            { value: 'free', label: '自由' },
            { value: '15', label: '15°' },
            { value: '45', label: '45°' },
            { value: '90', label: '90°' },
          ]}
          value="free"
        />
      </ShapeInspectorSection>

      <ShapeInspectorSection title="创建行为">
        <ShapeInspectorSegmentedControl
          ariaLabel="直线创建方式"
          onChange={() => {
            // 后续接入 LineTool 的创建行为。
          }}
          options={[
            { value: 'single', label: '单线' },
            { value: 'polyline', label: '连续折线' },
          ]}
          value="single"
        />
      </ShapeInspectorSection>

      <InspectorHint>
        直线工具只负责几何线段。需要绑定对象、自动重路由或箭头端点时，应使用连接工具。
      </InspectorHint>
    </ToolPanelHeader>
  )
}
`

const ARROW_TOOL_SOURCE = `import {
  ArrowShapeArrowheadEndStyle,
  ArrowShapeArrowheadStartStyle,
} from 'tldraw'
import {
  InspectorHint,
  ShapeInspectorArrowheadSelect,
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
  ToolColorSection,
  ToolDashSection,
  ToolPanelHeader,
  ToolStrokeSizeSection,
} from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

export function ArrowToolInspector({
  editor,
}: ToolInspectorProps) {
  return (
    <ToolPanelHeader
      description="在对象之间创建可绑定的连接线。"
      title="连接"
    >
      <ShapeInspectorSection
        description="控制连接线在起点和终点之间的路径。"
        title="路由"
      >
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

      <ShapeInspectorSection title="连接行为">
        <div className="space-y-2 text-[11px] leading-5 text-muted-foreground">
          <p>连接端点会吸附到支持绑定的对象。</p>
          <p>移动已绑定对象时，连接线会跟随更新。</p>
        </div>
      </ShapeInspectorSection>

      <InspectorHint>
        正交路由、避障、连接标签和自动重路由应由 flowchart feature 提供。
      </InspectorHint>
    </ToolPanelHeader>
  )
}
`

const TEXT_TOOL_SOURCE = `import {
  DefaultFontStyle,
  DefaultTextAlignStyle,
} from 'tldraw'
import {
  InspectorHint,
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
  ToolColorSection,
  ToolPanelHeader,
  ToolStrokeSizeSection,
} from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

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

      <ShapeInspectorSection title="水平对齐">
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

      <ShapeInspectorSection title="文本框">
        <ShapeInspectorSegmentedControl
          ariaLabel="文本框调整方式"
          onChange={() => {
            // 后续接入文本框 sizing mode。
          }}
          options={[
            { value: 'auto-width', label: '自动宽度' },
            { value: 'auto-height', label: '自动高度' },
            { value: 'fixed', label: '固定尺寸' },
          ]}
          value="auto-width"
        />
      </ShapeInspectorSection>

      <InspectorHint>
        下一阶段增加真实字体、字重、精确字号、行高、字距和文本框溢出设置。
      </InspectorHint>
    </ToolPanelHeader>
  )
}
`

const NOTE_TOOL_SOURCE = `import { DefaultFontStyle } from 'tldraw'
import {
  InspectorHint,
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
  ToolColorSection,
  ToolFillSection,
  ToolPanelHeader,
  ToolStrokeSizeSection,
} from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

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

      <ShapeInspectorSection title="尺寸">
        <ShapeInspectorSegmentedControl
          ariaLabel="默认便签尺寸"
          onChange={() => {
            // 后续接入便签尺寸和自动适应内容。
          }}
          options={[
            { value: 'small', label: '小' },
            { value: 'medium', label: '中' },
            { value: 'large', label: '大' },
            { value: 'auto', label: '自适应' },
          ]}
          value="medium"
        />
      </ShapeInspectorSection>

      <InspectorHint>
        便签创建后应立即进入文本编辑，并支持连接线绑定。
      </InspectorHint>
    </ToolPanelHeader>
  )
}
`

const FRAME_TOOL_SOURCE = `import {
  InspectorHint,
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
  ToolColorSection,
  ToolDashSection,
  ToolPanelHeader,
  ToolStrokeSizeSection,
} from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

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
            // 后续接入画框尺寸预设。
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

      <ShapeInspectorSection title="容器行为">
        <ShapeInspectorSegmentedControl
          ariaLabel="画框内容行为"
          onChange={() => {
            // 后续接入 frame clipping 和内容布局。
          }}
          options={[
            { value: 'free', label: '自由' },
            { value: 'clip', label: '裁剪' },
            { value: 'fit', label: '适应内容' },
          ]}
          value="free"
        />
      </ShapeInspectorSection>

      <ToolColorSection editor={editor} />
      <ToolDashSection editor={editor} />
      <ToolStrokeSizeSection editor={editor} />

      <InspectorHint>
        下一阶段增加精确尺寸、内边距、布局网格、内容裁剪和导出区域。
      </InspectorHint>
    </ToolPanelHeader>
  )
}
`

const ERASER_TOOL_SOURCE = `import {
  InspectorHint,
  ShapeInspectorSection,
  ShapeInspectorSegmentedControl,
  ToolPanelHeader,
} from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

export function EraserToolInspector({
  editor: _editor,
}: ToolInspectorProps) {
  return (
    <ToolPanelHeader
      description="拖过对象或笔触进行擦除。"
      title="橡皮擦"
    >
      <ShapeInspectorSection title="擦除方式">
        <ShapeInspectorSegmentedControl
          ariaLabel="擦除方式"
          onChange={() => {
            // 后续接入 EraserTool 状态。
          }}
          options={[
            { value: 'object', label: '对象' },
            { value: 'stroke', label: '笔画' },
            { value: 'partial', label: '局部' },
          ]}
          value="object"
        />
      </ShapeInspectorSection>

      <ShapeInspectorSection title="擦除过滤">
        <ShapeInspectorSegmentedControl
          ariaLabel="擦除对象过滤"
          onChange={() => {
            // 后续接入擦除过滤规则。
          }}
          options={[
            { value: 'all', label: '全部' },
            { value: 'draw', label: '笔触' },
            { value: 'highlight', label: '高亮' },
          ]}
          value="all"
        />
      </ShapeInspectorSection>

      <InspectorHint>
        当前实现使用对象擦除。笔画擦除和局部路径切割需要独立工具状态与几何实现。
      </InspectorHint>
    </ToolPanelHeader>
  )
}
`

const UNKNOWN_TOOL_SOURCE = `import {
  InspectorHint,
  ToolPanelHeader,
} from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

export interface UnknownToolInspectorProps
  extends ToolInspectorProps {
  readonly toolId: string
}

export function UnknownToolInspector({
  toolId,
}: UnknownToolInspectorProps) {
  return (
    <ToolPanelHeader
      description="该工具尚未提供专用右侧栏。"
      title="工具选项"
    >
      <InspectorHint>
        当前工具 ID：{toolId}。应由该工具所属 Feature
        注册专用检查器，而不是降级显示选择工具设置。
      </InspectorHint>
    </ToolPanelHeader>
  )
}
`

const ROUTER_SOURCE = `import { ArrowToolInspector } from './ArrowToolInspector'
import { DrawToolInspector } from './DrawToolInspector'
import { EraserToolInspector } from './EraserToolInspector'
import { FrameToolInspector } from './FrameToolInspector'
import { HandToolInspector } from './HandToolInspector'
import { LineToolInspector } from './LineToolInspector'
import { NoteToolInspector } from './NoteToolInspector'
import { ScientificChartToolInspector } from './ScientificChartToolInspector'
import { SelectToolInspector } from './SelectToolInspector'
import { ShapeToolInspector } from './ShapeToolInspector'
import { TextToolInspector } from './TextToolInspector'
import type { ToolInspectorRouterProps } from './types'
import { UnknownToolInspector } from './UnknownToolInspector'

export function ToolInspectorRouter({
  editor,
  toolId,
}: ToolInspectorRouterProps) {
  switch (toolId) {
    case 'select':
      return <SelectToolInspector editor={editor} />

    case 'hand':
      return <HandToolInspector editor={editor} />

    case 'geo':
      return <ShapeToolInspector editor={editor} />

    case 'line':
      return <LineToolInspector editor={editor} />

    case 'arrow':
      return <ArrowToolInspector editor={editor} />

    case 'draw':
      return (
        <DrawToolInspector
          editor={editor}
          variant="draw"
        />
      )

    case 'highlight':
      return (
        <DrawToolInspector
          editor={editor}
          variant="highlight"
        />
      )

    case 'eraser':
      return <EraserToolInspector editor={editor} />

    case 'text':
      return <TextToolInspector editor={editor} />

    case 'note':
      return <NoteToolInspector editor={editor} />

    case 'frame':
      return <FrameToolInspector editor={editor} />

    case 'scientific-chart':
      return <ScientificChartToolInspector editor={editor} />

    default:
      return (
        <UnknownToolInspector
          editor={editor}
          toolId={toolId}
        />
      )
  }
}
`

const INDEX_SOURCE = `export { ArrowToolInspector } from './ArrowToolInspector'
export { DrawToolInspector } from './DrawToolInspector'
export { EraserToolInspector } from './EraserToolInspector'
export { FrameToolInspector } from './FrameToolInspector'
export { HandToolInspector } from './HandToolInspector'
export { LineToolInspector } from './LineToolInspector'
export { NoteToolInspector } from './NoteToolInspector'
export { ScientificChartToolInspector } from './ScientificChartToolInspector'
export { SelectToolInspector } from './SelectToolInspector'
export { ShapeToolInspector } from './ShapeToolInspector'
export { TextToolInspector } from './TextToolInspector'
export { ToolInspectorRouter } from './ToolInspectorRouter'
export type {
  ToolInspectorProps,
  ToolInspectorRouterProps,
} from './types'
export { UnknownToolInspector } from './UnknownToolInspector'
`

const GENERATED_FILES = [
  [PATHS.select, SELECT_TOOL_SOURCE],
  [PATHS.hand, HAND_TOOL_SOURCE],
  [PATHS.line, LINE_TOOL_SOURCE],
  [PATHS.arrow, ARROW_TOOL_SOURCE],
  [PATHS.text, TEXT_TOOL_SOURCE],
  [PATHS.note, NOTE_TOOL_SOURCE],
  [PATHS.frame, FRAME_TOOL_SOURCE],
  [PATHS.eraser, ERASER_TOOL_SOURCE],
  [PATHS.unknown, UNKNOWN_TOOL_SOURCE],
  [PATHS.router, ROUTER_SOURCE],
  [PATHS.index, INDEX_SOURCE],
]

async function main() {
  console.log('')
  console.log('Hybrid Canvas — Tool Inspector Refactor / Phase 2.1')
  console.log(`Repository: ${ROOT_DIR}`)
  console.log(`Mode: ${DRY_RUN ? 'dry-run' : 'write'}`)
  console.log('')

  await validateRepository()

  if (DRY_RUN) {
    console.log('✓ Current phase-2 structure detected')
    console.log('✓ BasicToolInspectors.tsx detected')
    console.log('✓ ToolInspectorRouter.tsx detected')
    console.log('✓ All individual tool files can be generated')
    console.log('✓ No repository files were changed')
    console.log('')
    return
  }

  const backupDirectory = await createBackupDirectory()

  await backupFile(
    PATHS.basicInspectors,
    path.join(backupDirectory, 'BasicToolInspectors.tsx'),
  )

  await backupFile(
    PATHS.router,
    path.join(backupDirectory, 'ToolInspectorRouter.tsx'),
  )

  await backupFile(
    PATHS.index,
    path.join(backupDirectory, 'index.ts'),
  )

  for (const [filePath, source] of GENERATED_FILES) {
    await writeUtf8(filePath, source)
  }

  await unlink(PATHS.basicInspectors)

  console.log(`Deleted: ${relative(PATHS.basicInspectors)}`)
  console.log('')
  console.log(`Backup: ${relative(backupDirectory)}`)
  console.log('')
  console.log('Phase 2.1 complete:')
  console.log('  ✓ BasicToolInspectors.tsx removed')
  console.log('  ✓ SelectToolInspector extracted')
  console.log('  ✓ HandToolInspector extracted')
  console.log('  ✓ LineToolInspector added')
  console.log('  ✓ ArrowToolInspector extracted')
  console.log('  ✓ TextToolInspector extracted')
  console.log('  ✓ NoteToolInspector extracted')
  console.log('  ✓ FrameToolInspector extracted')
  console.log('  ✓ EraserToolInspector extracted')
  console.log('  ✓ UnknownToolInspector added')
  console.log('  ✓ ToolInspectorRouter updated')
  console.log('')
  console.log('Run validation:')
  console.log(
    '  pnpm exec biome check --write apps/desktop/src/presentation/workspace/inspector',
  )
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('')
}

async function validateRepository() {
  await assertFile(PATHS.packageJson)
  await assertFile(PATHS.basicInspectors)
  await assertFile(PATHS.router)
  await assertFile(PATHS.index)

  const basicSource = await readUtf8(PATHS.basicInspectors)
  const routerSource = await readUtf8(PATHS.router)

  const expectedExports = [
    'export function ArrowToolInspector',
    'export function TextToolInspector',
    'export function NoteToolInspector',
    'export function FrameToolInspector',
    'export function EraserToolInspector',
    'export function HandToolInspector',
    'export function SelectToolInspector',
  ]

  for (const expectedExport of expectedExports) {
    if (!basicSource.includes(expectedExport)) {
      throw new Error(
        `Expected export not found in BasicToolInspectors.tsx: ${expectedExport}\n` +
          'The remote structure may have changed. Refusing an unsafe edit.',
      )
    }
  }

  if (
    !routerSource.includes(
      "from './BasicToolInspectors'",
    )
  ) {
    throw new Error(
      'ToolInspectorRouter no longer imports BasicToolInspectors. ' +
        'This phase may already have been applied.',
    )
  }
}

async function assertFile(filePath) {
  try {
    await access(filePath)
  } catch {
    throw new Error(
      `Missing required file: ${relative(filePath)}`,
    )
  }
}

async function createBackupDirectory() {
  const timestamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')

  const backupDirectory = path.join(
    ROOT_DIR,
    '.refactor-backup',
    `inspector-phase2-1-${timestamp}`,
  )

  await mkdir(backupDirectory, { recursive: true })
  return backupDirectory
}

async function backupFile(sourcePath, destinationPath) {
  await mkdir(path.dirname(destinationPath), {
    recursive: true,
  })

  await copyFile(sourcePath, destinationPath)
}

async function readUtf8(filePath) {
  return readFile(filePath, 'utf8')
}

async function writeUtf8(filePath, source) {
  await mkdir(path.dirname(filePath), {
    recursive: true,
  })

  const normalized =
    source
      .replaceAll('\r\n', '\n')
      .replace(/^\uFEFF/, '')
      .trimEnd() + '\n'

  await writeFile(filePath, normalized, 'utf8')
  console.log(`Updated: ${relative(filePath)}`)
}

function relative(filePath) {
  return path.relative(ROOT_DIR, filePath) || '.'
}

main().catch((error) => {
  console.error('')
  console.error('Phase 2.1 failed.')
  console.error(error instanceof Error ? error.message : error)
  console.error('')
  process.exitCode = 1
})