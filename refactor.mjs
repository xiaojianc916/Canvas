#!/usr/bin/env node

/**
 * Hybrid Canvas — Tool Inspector Refactor / Phase 1
 *
 * 目标：
 * 1. 移除 InspectorHost 固定的“设计 / 数据 / 交互”Tab。
 * 2. 从 WorkspaceContainer.tsx 抽离 CanvasInspectorContent。
 * 3. 建立独立的 inspector 目录。
 * 4. 保留当前行为，避免第一阶段同时修改状态和功能。
 * 5. 写入后续工具检查器拆分计划。
 *
 * 使用：
 *   node tool-inspector-refactor-phase1.mjs
 *
 * 可选：
 *   node tool-inspector-refactor-phase1.mjs --dry-run
 *
 * 脚本会在：
 *   .refactor-backup/inspector-phase1-<timestamp>/
 *
 * 创建原始文件备份。
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
const SCRIPT_DIR = path.dirname(SCRIPT_PATH)
const ROOT_DIR = SCRIPT_DIR
const DRY_RUN = process.argv.includes('--dry-run')

const PATHS = {
  packageJson: path.join(ROOT_DIR, 'package.json'),

  workspaceContainer: path.join(
    ROOT_DIR,
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  ),

  inspectorHost: path.join(
    ROOT_DIR,
    'features/workspace/src/presentation/inspector/InspectorHost.tsx',
  ),

  inspectorDirectory: path.join(
    ROOT_DIR,
    'apps/desktop/src/presentation/workspace/inspector',
  ),

  extractedInspector: path.join(
    ROOT_DIR,
    'apps/desktop/src/presentation/workspace/inspector/CanvasInspectorContent.tsx',
  ),

  inspectorIndex: path.join(
    ROOT_DIR,
    'apps/desktop/src/presentation/workspace/inspector/index.ts',
  ),

  refactorPlan: path.join(
    ROOT_DIR,
    'docs/rfcs/tool-inspector-refactor.md',
  ),
}

const INSPECTOR_START_MARKER = 'function CanvasInspectorContent('
const INSPECTOR_END_MARKER = 'function CanvasSelectionGeometryStatus()'

const EXTRACTED_INSPECTOR_IMPORTS = `import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectList,
  type SelectOption,
  SelectTrigger,
} from '@hybrid-canvas/design-system'
import {
  type ScientificChartType,
  ScientificChartTypeStyle,
} from '@hybrid-canvas/scientific-plot'
import { useState } from 'react'
import {
  ArrowShapeArrowheadEndStyle,
  ArrowShapeArrowheadStartStyle,
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultFontStyle,
  DefaultSizeStyle,
  DefaultTextAlignStyle,
  type Editor,
  GeoShapeGeoStyle,
  type TLShape,
  useValue,
} from 'tldraw'

`

const NEW_INSPECTOR_HOST = `import { ScrollArea } from '@hybrid-canvas/design-system'
import type { ReactNode } from 'react'

export interface InspectorHostProps {
  readonly title?: string
  readonly children: ReactNode
}

/**
 * Right-side contextual inspector host.
 *
 * The host owns only layout and scrolling. It must not own editor selection,
 * active tool state, shape-specific rules, data configuration, or interaction
 * configuration.
 *
 * The rendered content is supplied by the active tool or selected object.
 */
export function InspectorHost({ children }: InspectorHostProps) {
  return (
    <aside
      aria-label="工具选项与对象属性"
      className="flex h-full min-h-0 min-w-0 flex-col border-l border-divider bg-sidebar"
    >
      <ScrollArea className="min-h-0 flex-1">
        <div className="min-w-0 p-3">{children}</div>
      </ScrollArea>
    </aside>
  )
}
`

const INSPECTOR_INDEX_CONTENT = `export { CanvasInspectorContent } from './CanvasInspectorContent'
`

const REFACTOR_PLAN_CONTENT = `# Tool Inspector Refactor

## Status

Phase 1 establishes the structural boundary for the contextual tool inspector.

This RFC does not declare all tool inspectors complete. Completion must be
verified by implementation, tests, and visual review.

## Product rule

The right sidebar follows the current editor context:

1. When a creation tool is active and no object is selected, show the defaults
   and behavior for that tool.
2. When the Select tool owns a selection, show the selected object's actual
   properties.
3. When multiple objects are selected, show common properties, mixed values,
   alignment, distribution, grouping, and ordering.
4. When a specialized editing state is active, such as path editing, cropping,
   or chart-series editing, show the controls for that editing state.
5. Data and interaction controls are object capabilities. They are not
   permanent global tabs.

## Ownership

- tldraw Editor and TLStore remain the source of truth.
- The inspector must derive selection and active-tool state directly from the
  Editor.
- The inspector must not introduce a second selection, tool, style, or history
  store.
- Document mutations must use Editor or Store transactions.
- Undo and redo remain owned by tldraw History.
- Feature-specific inspectors should be contributed by the owning feature.

## Target structure

\`\`\`text
apps/desktop/src/presentation/workspace/inspector/
├── CanvasInspectorContent.tsx
├── ToolInspectorRouter.tsx
├── SelectionInspectorRouter.tsx
├── context/
│   ├── inspector-context.ts
│   └── use-inspector-context.ts
├── common/
│   ├── InspectorHeader.tsx
│   ├── InspectorSection.tsx
│   ├── MixedValue.tsx
│   ├── NumericField.tsx
│   ├── ColorControl.tsx
│   ├── StrokeControl.tsx
│   ├── TransformSection.tsx
│   └── ArrangementSection.tsx
├── tools/
│   ├── SelectToolInspector.tsx
│   ├── HandToolInspector.tsx
│   ├── ShapeToolInspector.tsx
│   ├── LineToolInspector.tsx
│   ├── ArrowToolInspector.tsx
│   ├── DrawToolInspector.tsx
│   ├── HighlightToolInspector.tsx
│   ├── EraserToolInspector.tsx
│   ├── TextToolInspector.tsx
│   ├── NoteToolInspector.tsx
│   └── FrameToolInspector.tsx
└── selections/
    ├── ShapeSelectionInspector.tsx
    ├── TextSelectionInspector.tsx
    ├── DrawSelectionInspector.tsx
    ├── ArrowSelectionInspector.tsx
    ├── ImageSelectionInspector.tsx
    └── MultiSelectionInspector.tsx
\`\`\`

The scientific chart inspector should ultimately be owned by:

\`\`\`text
features/scientific-plot/src/presentation/inspector/
├── ScientificChartToolInspector.tsx
├── ScientificChartSelectionInspector.tsx
├── ChartDataSection.tsx
├── ChartSeriesSection.tsx
├── ChartAxisSection.tsx
├── ChartLegendSection.tsx
├── ChartAnnotationSection.tsx
└── ChartExportSection.tsx
\`\`\`

Workspace may host the contribution but must not own scientific-chart domain
rules.

## Phase 1

- Remove permanent Design, Data, and Interaction tabs.
- Keep InspectorHost responsible only for layout and scrolling.
- Extract the existing canvas inspector from WorkspaceContainer.
- Preserve existing behavior.
- Add an explicit module boundary for later decomposition.

## Phase 2

Split active-tool rendering into ToolInspectorRouter.

Initial tool mapping:

| Tool | Inspector |
| --- | --- |
| select | SelectToolInspector |
| hand | HandToolInspector |
| geo | ShapeToolInspector |
| line | LineToolInspector |
| arrow | ArrowToolInspector |
| draw | DrawToolInspector |
| highlight | HighlightToolInspector |
| eraser | EraserToolInspector |
| text | TextToolInspector |
| note | NoteToolInspector |
| frame | FrameToolInspector |
| scientific-chart | Feature contribution |

Each tool inspector must read and display the actual next-shape styles. Controls
must not use a permanent null value when the Editor already has a current
default.

## Phase 3

Split selected-object rendering into SelectionInspectorRouter.

Required selection contexts:

- no selection
- single shape
- multiple shapes of the same type
- mixed-type multiple selection
- locked selection
- text editing
- path or vertex editing
- crop editing
- chart editing

Mixed values must be represented explicitly rather than silently using the
first selected object's value.

## Phase 4

Replace primitive style controls with professional controls:

- exact numeric stroke width plus quick presets
- current color, custom picker, opacity, recent colors, and document colors
- graphical line-style previews
- graphical arrowhead previews
- transform fields for X, Y, width, height, and rotation
- stable alignment and distribution controls
- tool preset persistence
- accessible labels and keyboard operation

## Phase 5

Implement professional tool-specific controls.

### Freehand

- brush preset
- exact size
- opacity and flow
- smoothing mode
- stabilization
- pressure mapping
- tip angle and roundness
- stroke taper
- input-device state

### Arrow and connector

- straight, curved, orthogonal, and manual routing
- start and end arrowheads
- snapping and bindings
- obstacle avoidance
- corner radius
- label position
- automatic rerouting

### Frame

- paper, screen, presentation, and social presets
- exact dimensions
- clipping
- content movement
- padding and layout
- grid
- export region

### Scientific chart

- chart family and type
- data source
- field mapping
- series
- X and Y axes
- legend
- labels and tooltips
- annotations
- themes and palettes
- analysis
- accessibility
- export

## Validation

At the end of each phase, run:

\`\`\`bash
pnpm exec biome check --write apps/desktop/src/presentation/workspace
pnpm exec biome check --write features/workspace/src/presentation/inspector
pnpm typecheck
pnpm test
\`\`\`

Also perform visual review for:

- no clipped or overflowing inspector controls
- no duplicate headers
- stable scroll behavior
- narrow inspector width
- resized inspector width
- every active tool
- no selection
- single selection
- mixed multi-selection
- keyboard focus
- light and dark themes
`

async function main() {
  console.log('')
  console.log('Hybrid Canvas — Tool Inspector Refactor / Phase 1')
  console.log(`Repository: ${ROOT_DIR}`)
  console.log(`Mode: ${DRY_RUN ? 'dry-run' : 'write'}`)
  console.log('')

  await assertRepositoryRoot()

  const workspaceSource = await readUtf8(PATHS.workspaceContainer)
  const inspectorHostSource = await readUtf8(PATHS.inspectorHost)

  const extraction = extractInspector(workspaceSource)

  if (!DRY_RUN) {
    const backupDirectory = await createBackupDirectory()

    await backupFile(
      PATHS.workspaceContainer,
      path.join(
        backupDirectory,
        'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
      ),
    )

    await backupFile(
      PATHS.inspectorHost,
      path.join(
        backupDirectory,
        'features/workspace/src/presentation/inspector/InspectorHost.tsx',
      ),
    )

    await mkdir(PATHS.inspectorDirectory, { recursive: true })
    await mkdir(path.dirname(PATHS.refactorPlan), { recursive: true })

    if (extraction.kind === 'extracted') {
      await writeUtf8(
        PATHS.extractedInspector,
        EXTRACTED_INSPECTOR_IMPORTS + extraction.inspectorSource,
      )

      await writeUtf8(
        PATHS.workspaceContainer,
        normalizeWorkspaceContainer(extraction.workspaceSource),
      )
    } else {
      console.log(
        'Inspector content was already extracted; WorkspaceContainer was left structurally unchanged.',
      )
    }

    await writeUtf8(PATHS.inspectorHost, NEW_INSPECTOR_HOST)
    await writeUtf8(PATHS.inspectorIndex, INSPECTOR_INDEX_CONTENT)
    await writeUtf8(PATHS.refactorPlan, REFACTOR_PLAN_CONTENT)

    console.log('')
    console.log(`Backup created: ${relative(backupDirectory)}`)
  } else {
    console.log('Dry-run validation succeeded.')
    console.log(
      extraction.kind === 'extracted'
        ? 'CanvasInspectorContent can be extracted.'
        : 'CanvasInspectorContent appears to be already extracted.',
    )

    if (inspectorHostSource.includes('value="data"')) {
      console.log('Permanent Data tab will be removed.')
    }

    if (inspectorHostSource.includes('value="interaction"')) {
      console.log('Permanent Interaction tab will be removed.')
    }
  }

  printSummary(extraction.kind)
}

async function assertRepositoryRoot() {
  const requiredPaths = [
    PATHS.packageJson,
    PATHS.workspaceContainer,
    PATHS.inspectorHost,
  ]

  for (const requiredPath of requiredPaths) {
    try {
      await access(requiredPath)
    } catch {
      throw new Error(
        `Missing required file: ${relative(requiredPath)}\n` +
          'Place this script in the Canvas repository root and run it again.',
      )
    }
  }

  const packageJson = JSON.parse(await readUtf8(PATHS.packageJson))

  if (!packageJson || typeof packageJson !== 'object') {
    throw new Error('The root package.json is invalid.')
  }
}

function extractInspector(workspaceSource) {
  const startIndex = workspaceSource.indexOf(INSPECTOR_START_MARKER)
  const endIndex = workspaceSource.indexOf(INSPECTOR_END_MARKER)

  if (startIndex === -1) {
    const alreadyImported =
      workspaceSource.includes(
        "from './inspector/CanvasInspectorContent'",
      ) ||
      workspaceSource.includes("from './inspector'")

    if (alreadyImported) {
      return {
        kind: 'already-extracted',
        workspaceSource,
      }
    }

    throw new Error(
      `Could not find marker: ${INSPECTOR_START_MARKER}\n` +
        'The source file may have changed. Refusing to make an unsafe edit.',
    )
  }

  if (endIndex === -1 || endIndex <= startIndex) {
    throw new Error(
      `Could not find a valid end marker: ${INSPECTOR_END_MARKER}\n` +
        'Refusing to make an unsafe edit.',
    )
  }

  const rawInspectorSource = workspaceSource
    .slice(startIndex, endIndex)
    .trim()

  const inspectorSource = rawInspectorSource.replace(
    'function CanvasInspectorContent(',
    'export function CanvasInspectorContent(',
  )

  const nextWorkspaceSource =
    workspaceSource.slice(0, startIndex) +
    workspaceSource.slice(endIndex)

  return {
    kind: 'extracted',
    inspectorSource: inspectorSource + '\n',
    workspaceSource: nextWorkspaceSource,
  }
}

function normalizeWorkspaceContainer(source) {
  let nextSource = source

  nextSource = replaceRequired(
    nextSource,
    `import {
  ConfirmationDialog,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectList,
  type SelectOption,
  SelectTrigger,
} from '@hybrid-canvas/design-system'`,
    `import { ConfirmationDialog } from '@hybrid-canvas/design-system'`,
    'design-system import',
  )

  nextSource = replaceRequired(
    nextSource,
    `import { type ScientificChartType, ScientificChartTypeStyle } from '@hybrid-canvas/scientific-plot'
`,
    '',
    'scientific chart import',
  )

  nextSource = replaceRequired(
    nextSource,
    `import {
  ArrowShapeArrowheadEndStyle,
  ArrowShapeArrowheadStartStyle,
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultFontStyle,
  DefaultSizeStyle,
  DefaultTextAlignStyle,
  type Editor,
  GeoShapeGeoStyle,
  type TLShape,
  useValue,
} from 'tldraw'`,
    `import { useValue } from 'tldraw'`,
    'tldraw inspector imports',
  )

  const localImportAnchor =
    `import { reportUiError as reportError } from '../ui/ui-feedback'\n`

  if (
    !nextSource.includes(
      "from './inspector/CanvasInspectorContent'",
    )
  ) {
    nextSource = replaceRequired(
      nextSource,
      localImportAnchor,
      localImportAnchor +
        `import { CanvasInspectorContent } from './inspector/CanvasInspectorContent'\n`,
      'local inspector import anchor',
    )
  }

  nextSource = nextSource.replace(/\n{3,}/g, '\n\n')

  return nextSource.trimEnd() + '\n'
}

function replaceRequired(source, oldValue, newValue, label) {
  if (!source.includes(oldValue)) {
    throw new Error(
      `Could not update ${label}.\n` +
        'The source file differs from the expected repository version. ' +
        'Refusing to make a partial edit.',
    )
  }

  return source.replace(oldValue, newValue)
}

async function createBackupDirectory() {
  const timestamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')

  const backupDirectory = path.join(
    ROOT_DIR,
    '.refactor-backup',
    `inspector-phase1-${timestamp}`,
  )

  await mkdir(backupDirectory, { recursive: true })

  return backupDirectory
}

async function backupFile(sourcePath, destinationPath) {
  await mkdir(path.dirname(destinationPath), { recursive: true })
  await copyFile(sourcePath, destinationPath)
}

async function readUtf8(filePath) {
  return readFile(filePath, 'utf8')
}

async function writeUtf8(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true })

  const normalized = content
    .replaceAll('\r\n', '\n')
    .replace(/^\uFEFF/, '')

  await writeFile(filePath, normalized, 'utf8')
  console.log(`Updated: ${relative(filePath)}`)
}

function relative(filePath) {
  return path.relative(ROOT_DIR, filePath) || '.'
}

function printSummary(extractionKind) {
  console.log('')
  console.log('Phase 1 result:')
  console.log(
    extractionKind === 'extracted'
      ? '  ✓ CanvasInspectorContent extracted from WorkspaceContainer'
      : '  ✓ Existing CanvasInspectorContent extraction detected',
  )
  console.log('  ✓ Permanent Design/Data/Interaction tabs removed')
  console.log('  ✓ InspectorHost reduced to layout and scrolling')
  console.log('  ✓ Inspector module entry created')
  console.log('  ✓ Refactor RFC written')
  console.log('')
  console.log('Next commands:')
  console.log(
    '  pnpm exec biome check --write apps/desktop/src/presentation/workspace',
  )
  console.log(
    '  pnpm exec biome check --write features/workspace/src/presentation/inspector',
  )
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('')
  console.log(
    'Next implementation phase: split CanvasActiveToolPanel into one inspector per tool.',
  )
  console.log('')
}

main().catch((error) => {
  console.error('')
  console.error('Refactor failed.')
  console.error(error instanceof Error ? error.message : error)
  console.error('')
  process.exitCode = 1
})