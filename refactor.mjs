#!/usr/bin/env node

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

const ROOT_DIR = path.dirname(
  fileURLToPath(import.meta.url),
)

const DRY_RUN =
  process.argv.includes('--dry-run')

const FRAME_INSPECTOR_PATH = path.join(
  ROOT_DIR,
  'apps/desktop/src/presentation/workspace/inspector/tools/FrameToolInspector.tsx',
)

const PACKAGE_JSON_PATH = path.join(
  ROOT_DIR,
  'package.json',
)

const FRAME_INSPECTOR_SOURCE = `import {
  createShapeId,
  DefaultColorStyle,
  useValue,
} from 'tldraw'
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

export function FrameToolInspector({
  editor,
}: ToolInspectorProps) {
  const currentColor = useValue(
    'inspector next frame color',
    () =>
      editor.getStyleForNextShape(
        DefaultColorStyle,
      ),
    [editor],
  )

  const createPresetFrame = (
    preset:
      (typeof FRAME_PRESETS)[number],
  ) => {
    const id = createShapeId()
    const viewport =
      editor.getViewportPageBounds()

    const x =
      viewport.center.x -
      preset.width / 2

    const y =
      viewport.center.y -
      preset.height / 2

    editor.markHistoryStoppingPoint(
      'create frame from preset',
    )

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
    <ToolPanelHeader
      description="拖动创建自定义画框，或使用预设快速创建标准尺寸。"
      title="画框"
    >
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
              <FramePresetPreview
                height={preset.height}
                width={preset.width}
              />

              <span className="mt-2 block text-[11px] font-medium">
                {preset.label}
              </span>

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
          在画布中拖动以创建任意尺寸的画框。
          创建后可在底部状态栏双击 W 或 H 输入精确尺寸。
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
  let previewHeight =
    previewWidth / ratio

  if (previewHeight > maximumHeight) {
    previewHeight = maximumHeight
    previewWidth =
      previewHeight * ratio
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
`

async function main() {
  console.log('')
  console.log(
    'Hybrid Canvas — Implement Frame Presets',
  )
  console.log(`Repository: ${ROOT_DIR}`)
  console.log(
    `Mode: ${DRY_RUN ? 'dry-run' : 'write'}`,
  )
  console.log('')

  await validateRepository()

  if (DRY_RUN) {
    console.log('✓ Existing Frame inspector detected')
    console.log('✓ Legacy no-op presets detected')
    console.log('✓ Functional preset implementation ready')
    console.log('✓ No files were changed')
    console.log('')
    return
  }

  const backupDirectory =
    await createBackupDirectory()

  await backupFile(
    FRAME_INSPECTOR_PATH,
    path.join(
      backupDirectory,
      'FrameToolInspector.tsx',
    ),
  )

  await writeUtf8(
    FRAME_INSPECTOR_PATH,
    FRAME_INSPECTOR_SOURCE,
  )

  console.log('')
  console.log(
    `Backup: ${relative(backupDirectory)}`,
  )
  console.log('')
  console.log('Frame preset implementation complete:')
  console.log('  ✓ Presentation preset implemented')
  console.log('  ✓ Desktop preset implemented')
  console.log('  ✓ Mobile preset implemented')
  console.log('  ✓ A4 landscape preset implemented')
  console.log('  ✓ Frames created at viewport center')
  console.log('  ✓ Current frame color preserved')
  console.log('  ✓ Created frame selected automatically')
  console.log('  ✓ History support added')
  console.log('  ✓ Legacy no-op controls removed')
  console.log('')
  console.log('Run validation:')
  console.log(
    '  pnpm exec biome check --write apps/desktop/src/presentation/workspace/inspector/tools/FrameToolInspector.tsx',
  )
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('')
}

async function validateRepository() {
  await assertFile(PACKAGE_JSON_PATH)
  await assertFile(FRAME_INSPECTOR_PATH)

  const source =
    await readUtf8(
      FRAME_INSPECTOR_PATH,
    )

  const requiredMarkers = [
    'export function FrameToolInspector',
    '画框尺寸预设',
    '后续接入画框尺寸预设',
    '后续接入 frame clipping',
  ]

  for (
    const marker of requiredMarkers
  ) {
    if (!source.includes(marker)) {
      throw new Error(
        'Expected legacy Frame inspector marker not found: ' +
          marker +
          '\\nThe Frame inspector may already have been changed.',
      )
    }
  }

  if (
    source.includes(
      'createPresetFrame',
    )
  ) {
    throw new Error(
      'Functional Frame presets appear to be already installed.',
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
    `frame-presets-${timestamp}`,
  )

  await mkdir(
    backupDirectory,
    {
      recursive: true,
    },
  )

  return backupDirectory
}

async function backupFile(
  sourcePath,
  destinationPath,
) {
  await mkdir(
    path.dirname(destinationPath),
    {
      recursive: true,
    },
  )

  await copyFile(
    sourcePath,
    destinationPath,
  )
}

async function readUtf8(filePath) {
  return readFile(filePath, 'utf8')
}

async function writeUtf8(
  filePath,
  source,
) {
  await mkdir(
    path.dirname(filePath),
    {
      recursive: true,
    },
  )

  await writeFile(
    filePath,
    source
      .replaceAll('\r\n', '\n')
      .replace(/^\uFEFF/, '')
      .trimEnd() + '\n',
    'utf8',
  )

  console.log(
    `Updated: ${relative(filePath)}`,
  )
}

function relative(filePath) {
  return (
    path.relative(
      ROOT_DIR,
      filePath,
    ) || '.'
  )
}

main().catch((error) => {
  console.error('')
  console.error(
    'Frame preset implementation failed.',
  )
  console.error(
    error instanceof Error
      ? error.message
      : error,
  )
  console.error('')
  process.exitCode = 1
})