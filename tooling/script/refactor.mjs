#!/usr/bin/env node

/**
 * Canvas 工具栏精简与形状属性面板续补脚本
 *
 * 使用：
 *   保存为 scripts/refine-toolbar-and-shape-inspector.mjs
 *
 *   node scripts/refine-toolbar-and-shape-inspector.mjs
 *
 * 建议在前几个修改脚本之后运行。
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()

const toolbarPath = resolve(
  root,
  'editor/core/src/react/CanvasToolbar.tsx',
)

const shellContractPath = resolve(
  root,
  'features/workspace/src/contracts/shell-contract.ts',
)

const workspaceShellPath = resolve(
  root,
  'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
)

const workspaceContainerPath = resolve(
  root,
  'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
)

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

function replaceFunctionRange(source, functionName, replacement) {
  const startMarker = `function ${functionName}(`
  const startIndex = source.indexOf(startMarker)

  if (startIndex === -1) {
    throw new Error(`没有找到函数：${functionName}`)
  }

  const possibleEndMarkers = [
    'function CanvasSelectionGeometryStatus(',
    'function CanvasStatusLeftContent(',
  ]

  let endIndex = -1

  for (const marker of possibleEndMarkers) {
    const candidate = source.indexOf(marker, startIndex + startMarker.length)

    if (candidate !== -1 && (endIndex === -1 || candidate < endIndex)) {
      endIndex = candidate
    }
  }

  if (endIndex === -1) {
    throw new Error(`没有找到 ${functionName} 后面的状态栏组件`)
  }

  return (
    source.slice(0, startIndex) +
    replacement +
    '\n\n' +
    source.slice(endIndex)
  )
}

function insertAfterRequired(source, marker, content, description) {
  const index = source.indexOf(marker)

  if (index === -1) {
    throw new Error(`没有找到插入位置：${description}`)
  }

  const insertionIndex = index + marker.length

  return (
    source.slice(0, insertionIndex) +
    content +
    source.slice(insertionIndex)
  )
}

async function refineToolbar() {
  let source = await readText(toolbarPath)

  /*
   * 删除顶部工具栏中的缩放工具。
   * 右下角 CanvasZoomControl 继续保留。
   */
  source = source.replace(
    /\n\s*\{\n\s*id: 'zoom',\n\s*label: '缩放',\n\s*shortcut: 'Z',\n\s*icon: ZoomIn,\n\s*\},?/,
    '',
  )

  /*
   * 兼容紧凑写法。
   */
  source = source.replace(
    /\n\s*\{\s*id: 'zoom',\s*label: '缩放',\s*shortcut: 'Z',\s*icon: ZoomIn\s*\},?/,
    '',
  )

  /*
   * 删除工具栏右侧的复制按钮。
   * Ctrl/Cmd+D 和右侧属性栏中的复制功能仍然保留。
   */
  source = source.replace(
    /\n\s*<ToolbarButton\n\s*disabled=\{!hasSelection\}\n\s*icon=\{Copy\}\n\s*label="复制对象"\n\s*onClick=\{\(\) => \{\n\s*if \(editor\) \{\n\s*editor\.duplicateShapes\(selectedIds\)\n\s*\}\n\s*\}\}\n\s*shortcut="Ctrl\+D"\n\s*\/>/,
    '',
  )

  /*
   * 删除工具栏右侧的删除按钮。
   * 注意：这里删除的是 action 按钮，不是 tldraw 橡皮擦工具。
   */
  source = source.replace(
    /\n\s*<ToolbarButton\n\s*disabled=\{!hasSelection\}\n\s*icon=\{Eraser\}\n\s*label="删除"\n\s*onClick=\{\(\) => editor\?\.deleteShapes\(selectedIds\)\}\n\s*shortcut="Delete"\n\s*\/>/,
    '',
  )

  /*
   * 如果 Copy 图标已经没有使用，则删除导入。
   */
  const copyUsageCount = (source.match(/\bCopy\b/g) ?? []).length

  if (copyUsageCount <= 1) {
    source = source.replace(/\n\s*Copy,/, '')
  }

  await writeText(toolbarPath, source)
}

async function extendShellContract() {
  let source = await readText(shellContractPath)

  if (source.includes('readonly inspectorSelectionKey?: string')) {
    return
  }

  source = replaceRequired(
    source,
    '  readonly inspector: ReactNode\n',
    `  readonly inspector: ReactNode
  /**
   * 当前编辑器选区标识。
   * 仅用于请求显示属性面板，不承载画布文档状态。
   */
  readonly inspectorSelectionKey?: string
`,
    'WorkspaceShellProps inspector',
  )

  await writeText(shellContractPath, source)
}

async function enableAutomaticInspectorOpening() {
  let source = await readText(workspaceShellPath)

  if (!source.includes('  inspectorSelectionKey,\n')) {
    source = replaceRequired(
      source,
      `  inspector,
  statusLeft,`,
      `  inspector,
  inspectorSelectionKey,
  statusLeft,`,
      'WorkspaceShell 参数',
    )
  }

  if (!source.includes('previousInspectorSelectionKeyRef')) {
    source = replaceRequired(
      source,
      `  const previousModeRef = useRef(mode)
`,
      `  const previousModeRef = useRef(mode)
  const previousInspectorSelectionKeyRef = useRef(
    inspectorSelectionKey ?? '',
  )
`,
      'WorkspaceShell refs',
    )
  }

  if (!source.includes("'workspace inspector selection changed'")) {
    const marker = `  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {`

    const effect = `  /*
   * 选中新的形状时自动打开右侧属性面板。
   * 选区标识只包含 shape id，不镜像 tldraw 文档数据。
   */
  useEffect(() => {
    const previousKey = previousInspectorSelectionKeyRef.current
    const nextKey = inspectorSelectionKey ?? ''

    previousInspectorSelectionKeyRef.current = nextKey

    if (!nextKey || nextKey === previousKey) {
      return
    }

    if (mode !== 'wide') {
      setSidebarOpen(false)
    }

    setInspectorOpen(true)
  }, [
    inspectorSelectionKey,
    mode,
    'workspace inspector selection changed',
  ])

`

    source = replaceRequired(
      source,
      marker,
      effect + marker,
      'WorkspaceShell 自动打开属性面板 effect',
    )
  }

  await writeText(workspaceShellPath, source)
}

function ensureCanvasReactImport(source) {
  if (
    source.includes(
      "import { EditorSessionHost, useEditor } from '@hybrid-canvas/canvas/react'",
    )
  ) {
    return source
  }

  return replaceRequired(
    source,
    "import { EditorSessionHost } from '@hybrid-canvas/canvas/react'",
    "import { EditorSessionHost, useEditor } from '@hybrid-canvas/canvas/react'",
    'useEditor 导入',
  )
}

function ensureTldrawImport(source) {
  const requiredImport = `import {
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
} from 'tldraw'`

  const importPattern = /import\s*\{[\s\S]*?\}\s*from 'tldraw'/

  if (importPattern.test(source)) {
    return source.replace(importPattern, requiredImport)
  }

  const reactImportPattern = /import\s*\{[\s\S]*?\}\s*from 'react'\n/
  const match = source.match(reactImportPattern)

  if (!match) {
    throw new Error('没有找到 React import，无法插入 tldraw import')
  }

  return source.replace(
    reactImportPattern,
    match[0] + requiredImport + '\n',
  )
}

const shapeInspectorSource = String.raw`function CanvasInspectorContent({
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
}`

async function updateWorkspaceContainer() {
  let source = await readText(workspaceContainerPath)

  source = ensureCanvasReactImport(source)
  source = ensureTldrawImport(source)

  /*
   * 建立当前选区 key。这里只保留 ID，用于 UI 打开请求，
   * 不复制 shape props，也不建立第二套画布状态。
   */
  if (!source.includes("'workspace inspector selection key'")) {
    source = insertAfterRequired(
      source,
      `  const [pendingCloseSessionId, setPendingCloseSessionId] = useState<CanvasSessionId | null>(null)
`,
      `
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
`,
      'WorkspaceContainer state',
    )
  }

  if (!source.includes('inspectorSelectionKey={inspectorSelectionKey}')) {
    source = replaceRequired(
      source,
      `      inspector={<CanvasInspectorContent hasActiveCanvas={workbench.activeCanvas !== null} />}
      mainContent={mainContent}`,
      `      inspector={
        <CanvasInspectorContent
          hasActiveCanvas={workbench.activeCanvas !== null}
        />
      }
      inspectorSelectionKey={inspectorSelectionKey}
      mainContent={mainContent}`,
      'WorkspaceShell inspector props',
    )
  }

  source = replaceFunctionRange(
    source,
    'CanvasInspectorContent',
    shapeInspectorSource,
  )

  await writeText(workspaceContainerPath, source)
}

async function main() {
  console.log('正在精简工具栏并接入形状属性面板……')

  await refineToolbar()
  await extendShellContract()
  await enableAutomaticInspectorOpening()
  await updateWorkspaceContainer()

  console.log('')
  console.log('修改完成：')
  console.log('  ✓ 删除顶部缩放工具')
  console.log('  ✓ 保留画布右下角缩放控件')
  console.log('  ✓ 删除重复的复制和删除按钮')
  console.log('  ✓ 保留真正的橡皮擦绘图工具')
  console.log('  ✓ 选中对象时自动打开右侧栏')
  console.log('  ✓ 根据对象类型显示对应属性 UI')
  console.log('  ✓ 几何信息继续显示在底部状态栏')
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