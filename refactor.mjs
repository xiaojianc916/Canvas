#!/usr/bin/env node

/**
 * Hybrid Canvas — Tool Inspector Refactor / Phase 3
 *
 * 针对当前远程提交：
 *   f084e5fa8e46e4374815f2b2ecd55d2143888c77
 *
 * 目标：
 * 1. 修复 CanvasInspectorContent 缺失 useEditor 导入。
 * 2. 使用 Editor.getStyleForNextShape 读取真实工具默认样式。
 * 3. 消除颜色、填充、粗细、线型中的 value={null}。
 * 4. 修复形状、箭头、文本、便签和图表工具的写死值。
 * 5. 不引入第二套工具或样式状态。
 *
 * 使用：
 *   node tool-inspector-refactor-phase3.mjs --dry-run
 *   node tool-inspector-refactor-phase3.mjs
 */

import {
  access,
  copyFile,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const SCRIPT_PATH = fileURLToPath(import.meta.url)
const ROOT_DIR = path.dirname(SCRIPT_PATH)
const DRY_RUN = process.argv.includes('--dry-run')

const INSPECTOR_ROOT = path.join(
  ROOT_DIR,
  'apps/desktop/src/presentation/workspace/inspector',
)

const PATHS = {
  packageJson: path.join(ROOT_DIR, 'package.json'),

  canvasInspector: path.join(
    INSPECTOR_ROOT,
    'CanvasInspectorContent.tsx',
  ),

  primitives: path.join(
    INSPECTOR_ROOT,
    'common/InspectorPrimitives.tsx',
  ),

  shapeTool: path.join(
    INSPECTOR_ROOT,
    'tools/ShapeToolInspector.tsx',
  ),

  arrowTool: path.join(
    INSPECTOR_ROOT,
    'tools/ArrowToolInspector.tsx',
  ),

  textTool: path.join(
    INSPECTOR_ROOT,
    'tools/TextToolInspector.tsx',
  ),

  noteTool: path.join(
    INSPECTOR_ROOT,
    'tools/NoteToolInspector.tsx',
  ),

  chartTool: path.join(
    INSPECTOR_ROOT,
    'tools/ScientificChartToolInspector.tsx',
  ),
}

async function main() {
  console.log('')
  console.log('Hybrid Canvas — Tool Inspector Refactor / Phase 3')
  console.log(`Repository: ${ROOT_DIR}`)
  console.log(`Mode: ${DRY_RUN ? 'dry-run' : 'write'}`)
  console.log('')

  await validateFiles()

  const originals = {
    canvasInspector: await readUtf8(PATHS.canvasInspector),
    primitives: await readUtf8(PATHS.primitives),
    shapeTool: await readUtf8(PATHS.shapeTool),
    arrowTool: await readUtf8(PATHS.arrowTool),
    textTool: await readUtf8(PATHS.textTool),
    noteTool: await readUtf8(PATHS.noteTool),
    chartTool: await readUtf8(PATHS.chartTool),
  }

  const transformed = {
    canvasInspector: transformCanvasInspector(
      originals.canvasInspector,
    ),

    primitives: transformPrimitives(
      originals.primitives,
    ),

    shapeTool: transformShapeTool(
      originals.shapeTool,
    ),

    arrowTool: transformArrowTool(
      originals.arrowTool,
    ),

    textTool: transformTextTool(
      originals.textTool,
    ),

    noteTool: transformNoteTool(
      originals.noteTool,
    ),

    chartTool: transformChartTool(
      originals.chartTool,
    ),
  }

  if (DRY_RUN) {
    console.log('✓ Required files detected')
    console.log('✓ Missing useEditor import can be repaired')
    console.log('✓ Common next-shape styles can be subscribed')
    console.log('✓ Shape style can be subscribed')
    console.log('✓ Arrowhead styles can be subscribed')
    console.log('✓ Text styles can be subscribed')
    console.log('✓ Note font style can be subscribed')
    console.log('✓ Scientific chart type can be subscribed')
    console.log('✓ No files were changed')
    console.log('')
    return
  }

  const backupDirectory = await createBackupDirectory()

  for (const filePath of Object.values(PATHS)) {
    if (filePath === PATHS.packageJson) {
      continue
    }

    await backupFile(
      filePath,
      path.join(
        backupDirectory,
        path.relative(INSPECTOR_ROOT, filePath),
      ),
    )
  }

  await writeUtf8(
    PATHS.canvasInspector,
    transformed.canvasInspector,
  )

  await writeUtf8(
    PATHS.primitives,
    transformed.primitives,
  )

  await writeUtf8(
    PATHS.shapeTool,
    transformed.shapeTool,
  )

  await writeUtf8(
    PATHS.arrowTool,
    transformed.arrowTool,
  )

  await writeUtf8(
    PATHS.textTool,
    transformed.textTool,
  )

  await writeUtf8(
    PATHS.noteTool,
    transformed.noteTool,
  )

  await writeUtf8(
    PATHS.chartTool,
    transformed.chartTool,
  )

  console.log('')
  console.log(`Backup: ${relative(backupDirectory)}`)
  console.log('')
  console.log('Phase 3 complete:')
  console.log('  ✓ useEditor import repaired')
  console.log('  ✓ Current next color displayed')
  console.log('  ✓ Current next fill displayed')
  console.log('  ✓ Current next stroke size displayed')
  console.log('  ✓ Current next dash style displayed')
  console.log('  ✓ Current next geo shape displayed')
  console.log('  ✓ Current next arrowheads displayed')
  console.log('  ✓ Current next text styles displayed')
  console.log('  ✓ Current next chart type displayed')
  console.log('')
  console.log('Run validation:')
  console.log(
    '  pnpm exec biome check --write apps/desktop/src/presentation/workspace/inspector',
  )
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('')
}

function transformCanvasInspector(source) {
  if (
    source.includes(
      "import { useEditor } from '@hybrid-canvas/canvas/react'",
    )
  ) {
    return source
  }

  return (
    "import { useEditor } from '@hybrid-canvas/canvas/react'\n" +
    source
  )
}

function transformPrimitives(source) {
  let next = source

  next = replaceRequired(
    next,
    `  type Editor,
} from 'tldraw'`,
    `  type Editor,
  useValue,
} from 'tldraw'`,
    'InspectorPrimitives useValue import',
  )

  next = replaceRequired(
    next,
    `export function ToolColorSection({
  editor,
}: {
  readonly editor: Editor
}) {
  return (`,
    `export function ToolColorSection({
  editor,
}: {
  readonly editor: Editor
}) {
  const currentColor = useValue(
    'inspector next shape color',
    () => editor.getStyleForNextShape(DefaultColorStyle),
    [editor],
  )

  return (`,
    'ToolColorSection current color subscription',
  )

  next = replaceRequired(
    next,
    `            className="size-7 rounded-md border border-divider transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"`,
    `            aria-pressed={currentColor === color.value}
            className={
              'size-7 rounded-md border border-divider transition-transform ' +
              'hover:scale-105 focus-visible:outline-none ' +
              'focus-visible:ring-2 focus-visible:ring-primary ' +
              (currentColor === color.value
                ? 'ring-2 ring-primary ring-offset-1'
                : '')
            }`,
    'ToolColorSection selected color state',
  )

  next = replaceRequired(
    next,
    `export function ToolStrokeSizeSection({
  editor,
}: {
  readonly editor: Editor
}) {
  return (`,
    `export function ToolStrokeSizeSection({
  editor,
}: {
  readonly editor: Editor
}) {
  const currentSize = useValue(
    'inspector next shape size',
    () => editor.getStyleForNextShape(DefaultSizeStyle),
    [editor],
  )

  return (`,
    'ToolStrokeSizeSection current size subscription',
  )

  next = replaceWithinFunction(
    next,
    'export function ToolStrokeSizeSection(',
    'export function ToolDashSection(',
    '        value={null}',
    '        value={currentSize}',
    'ToolStrokeSizeSection current value',
  )

  next = replaceRequired(
    next,
    `export function ToolDashSection({
  editor,
}: {
  readonly editor: Editor
}) {
  return (`,
    `export function ToolDashSection({
  editor,
}: {
  readonly editor: Editor
}) {
  const currentDash = useValue(
    'inspector next shape dash',
    () => editor.getStyleForNextShape(DefaultDashStyle),
    [editor],
  )

  return (`,
    'ToolDashSection current dash subscription',
  )

  next = replaceWithinFunction(
    next,
    'export function ToolDashSection(',
    'export function ToolFillSection(',
    '        value={null}',
    '        value={currentDash}',
    'ToolDashSection current value',
  )

  next = replaceRequired(
    next,
    `export function ToolFillSection({
  editor,
  includeNone = true,
}: {
  readonly editor: Editor
  readonly includeNone?: boolean
}) {
  const options = includeNone`,
    `export function ToolFillSection({
  editor,
  includeNone = true,
}: {
  readonly editor: Editor
  readonly includeNone?: boolean
}) {
  const currentFill = useValue(
    'inspector next shape fill',
    () => editor.getStyleForNextShape(DefaultFillStyle),
    [editor],
  )

  const options = includeNone`,
    'ToolFillSection current fill subscription',
  )

  next = replaceWithinFunction(
    next,
    'export function ToolFillSection(',
    'export function InspectorHint(',
    '        value={null}',
    '        value={currentFill}',
    'ToolFillSection current value',
  )

  return next
}

function transformShapeTool(source) {
  let next = source

  next = replaceRequired(
    next,
    `import { GeoShapeGeoStyle } from 'tldraw'`,
    `import { GeoShapeGeoStyle, useValue } from 'tldraw'`,
    'ShapeToolInspector useValue import',
  )

  next = replaceRequired(
    next,
    `export function ShapeToolInspector({
  editor,
}: ToolInspectorProps) {
  return (`,
    `export function ShapeToolInspector({
  editor,
}: ToolInspectorProps) {
  const currentGeo = useValue(
    'inspector next geo shape',
    () => editor.getStyleForNextShape(GeoShapeGeoStyle),
    [editor],
  )

  return (`,
    'ShapeToolInspector current geo subscription',
  )

  next = replaceRequired(
    next,
    `          value="rectangle"`,
    `          value={currentGeo}`,
    'ShapeToolInspector current geo value',
  )

  return next
}

function transformArrowTool(source) {
  let next = source

  next = replaceRequired(
    next,
    `  ArrowShapeArrowheadStartStyle,
} from 'tldraw'`,
    `  ArrowShapeArrowheadStartStyle,
  useValue,
} from 'tldraw'`,
    'ArrowToolInspector useValue import',
  )

  next = replaceRequired(
    next,
    `export function ArrowToolInspector({
  editor,
}: ToolInspectorProps) {
  return (`,
    `export function ArrowToolInspector({
  editor,
}: ToolInspectorProps) {
  const currentArrowheadStart = useValue(
    'inspector next arrowhead start',
    () =>
      editor.getStyleForNextShape(
        ArrowShapeArrowheadStartStyle,
      ),
    [editor],
  )

  const currentArrowheadEnd = useValue(
    'inspector next arrowhead end',
    () =>
      editor.getStyleForNextShape(
        ArrowShapeArrowheadEndStyle,
      ),
    [editor],
  )

  return (`,
    'ArrowToolInspector arrowhead subscriptions',
  )

  next = replaceRequired(
    next,
    `          value="none"`,
    `          value={currentArrowheadStart}`,
    'ArrowToolInspector start value',
  )

  next = replaceRequired(
    next,
    `          value="arrow"`,
    `          value={currentArrowheadEnd}`,
    'ArrowToolInspector end value',
  )

  return next
}

function transformTextTool(source) {
  let next = source

  next = replaceRequired(
    next,
    `  DefaultTextAlignStyle,
} from 'tldraw'`,
    `  DefaultTextAlignStyle,
  useValue,
} from 'tldraw'`,
    'TextToolInspector useValue import',
  )

  next = replaceRequired(
    next,
    `export function TextToolInspector({
  editor,
}: ToolInspectorProps) {
  return (`,
    `export function TextToolInspector({
  editor,
}: ToolInspectorProps) {
  const currentFont = useValue(
    'inspector next text font',
    () => editor.getStyleForNextShape(DefaultFontStyle),
    [editor],
  )

  const currentTextAlign = useValue(
    'inspector next text alignment',
    () => editor.getStyleForNextShape(DefaultTextAlignStyle),
    [editor],
  )

  return (`,
    'TextToolInspector style subscriptions',
  )

  next = replaceWithinFunction(
    next,
    'export function TextToolInspector(',
    '<ToolStrokeSizeSection editor={editor} />',
    '          value={null}',
    '          value={currentFont}',
    'TextToolInspector font value',
  )

  const alignmentSectionStart =
    '<ShapeInspectorSection title="水平对齐">'

  const alignmentSectionEnd =
    '<ShapeInspectorSection title="文本框">'

  next = replaceWithinFunction(
    next,
    alignmentSectionStart,
    alignmentSectionEnd,
    '          value={null}',
    '          value={currentTextAlign}',
    'TextToolInspector alignment value',
  )

  return next
}

function transformNoteTool(source) {
  let next = source

  next = replaceRequired(
    next,
    `import { DefaultFontStyle } from 'tldraw'`,
    `import { DefaultFontStyle, useValue } from 'tldraw'`,
    'NoteToolInspector useValue import',
  )

  next = replaceRequired(
    next,
    `export function NoteToolInspector({
  editor,
}: ToolInspectorProps) {
  return (`,
    `export function NoteToolInspector({
  editor,
}: ToolInspectorProps) {
  const currentFont = useValue(
    'inspector next note font',
    () => editor.getStyleForNextShape(DefaultFontStyle),
    [editor],
  )

  return (`,
    'NoteToolInspector font subscription',
  )

  next = replaceWithinFunction(
    next,
    'export function NoteToolInspector(',
    '<ToolStrokeSizeSection editor={editor} />',
    '          value={null}',
    '          value={currentFont}',
    'NoteToolInspector font value',
  )

  return next
}

function transformChartTool(source) {
  let next = source

  if (!next.includes("from 'tldraw'")) {
    const scientificImportEnd =
      "} from '@hybrid-canvas/scientific-plot'\n"

    next = replaceRequired(
      next,
      scientificImportEnd,
      scientificImportEnd +
        "import { useValue } from 'tldraw'\n",
      'ScientificChartToolInspector useValue import',
    )
  }

  next = replaceRequired(
    next,
    `export function ScientificChartToolInspector({
  editor,
}: ToolInspectorProps) {
  return (`,
    `export function ScientificChartToolInspector({
  editor,
}: ToolInspectorProps) {
  const currentChartType = useValue(
    'inspector next scientific chart type',
    () =>
      editor.getStyleForNextShape(
        ScientificChartTypeStyle,
      ),
    [editor],
  )

  return (`,
    'ScientificChartToolInspector chart type subscription',
  )

  next = replaceRequired(
    next,
    `          value={null}`,
    `          value={currentChartType}`,
    'ScientificChartToolInspector chart type value',
  )

  return next
}

function replaceWithinFunction(
  source,
  startMarker,
  endMarker,
  oldValue,
  newValue,
  label,
) {
  const startIndex = source.indexOf(startMarker)
  const endIndex = source.indexOf(endMarker, startIndex)

  if (startIndex === -1 || endIndex === -1) {
    throw new Error(
      `Could not locate block for ${label}.`,
    )
  }

  const before = source.slice(0, startIndex)
  const block = source.slice(startIndex, endIndex)
  const after = source.slice(endIndex)

  if (!block.includes(oldValue)) {
    throw new Error(
      `Could not find expected value for ${label}.`,
    )
  }

  return before + block.replace(oldValue, newValue) + after
}

function replaceRequired(
  source,
  oldValue,
  newValue,
  label,
) {
  if (!source.includes(oldValue)) {
    throw new Error(
      `Could not update ${label}.\n` +
        'The source differs from the expected remote version. ' +
        'Refusing an unsafe partial edit.',
    )
  }

  return source.replace(oldValue, newValue)
}

async function validateFiles() {
  for (const filePath of Object.values(PATHS)) {
    await assertFile(filePath)
  }

  const canvasSource = await readUtf8(
    PATHS.canvasInspector,
  )

  if (
    !canvasSource.includes(
      'export function CanvasInspectorContent',
    )
  ) {
    throw new Error(
      'CanvasInspectorContent export was not found.',
    )
  }

  const primitivesSource = await readUtf8(
    PATHS.primitives,
  )

  if (
    !primitivesSource.includes(
      'editor.setStyleForNextShapes',
    )
  ) {
    throw new Error(
      'Expected next-shape style controls were not found.',
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
    `inspector-phase3-${timestamp}`,
  )

  await mkdir(backupDirectory, {
    recursive: true,
  })

  return backupDirectory
}

async function backupFile(
  sourcePath,
  destinationPath,
) {
  await mkdir(path.dirname(destinationPath), {
    recursive: true,
  })

  await copyFile(sourcePath, destinationPath)
}

async function readUtf8(filePath) {
  return readFile(filePath, 'utf8')
}

async function writeUtf8(filePath, source) {
  const normalized =
    source
      .replaceAll('\r\n', '\n')
      .replace(/^\uFEFF/, '')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'

  await writeFile(filePath, normalized, 'utf8')
  console.log(`Updated: ${relative(filePath)}`)
}

function relative(filePath) {
  return path.relative(ROOT_DIR, filePath) || '.'
}

main().catch((error) => {
  console.error('')
  console.error('Phase 3 failed.')
  console.error(error instanceof Error ? error.message : error)
  console.error('')
  process.exitCode = 1
})