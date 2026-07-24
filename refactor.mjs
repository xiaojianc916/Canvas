#!/usr/bin/env node

import {
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import {
  spawnSync,
} from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

const removedFeatures = [
  'flowchart',
  'freehand',
  'scientific-plot',
  'import-export',
]

const removedPackages = [
  '@hybrid-canvas/flowchart',
  '@hybrid-canvas/freehand',
  '@hybrid-canvas/scientific-plot',
  '@hybrid-canvas/import-export',
]

await cleanApplicationRuntime()
await cleanDesktopManifest()
await cleanRootManifest()
await cleanArchitectureScaffolds()
await cleanArchitectureRules()
await cleanWorkspaceCatalog()
await removeInspectorSectionApi()
await removeFeatureDirectories()
await regenerateLockfile()

const staleReferences =
  await findStaleReferences()

if (
  staleReferences.length > 0
) {
  console.error('')
  console.error(
    '仍发现已删除 Feature 的引用：',
  )

  for (
    const reference of
    staleReferences
  ) {
    console.error(
      '  - ' + reference,
    )
  }

  console.error('')
  process.exitCode = 1
} else {
  console.log('')
  console.log(
    '无用自定义 Feature 已删除干净。',
  )
  console.log('')
  console.log('已删除：')
  console.log(
    '  - features/flowchart',
  )
  console.log(
    '  - features/freehand',
  )
  console.log(
    '  - features/scientific-plot',
  )
  console.log(
    '  - features/import-export',
  )
  console.log(
    '  - 对应桌面依赖',
  )
  console.log(
    '  - 对应 Extension 注册',
  )
  console.log(
    '  - 对应架构脚手架声明',
  )
  console.log(
    '  - 对应 pnpm lockfile 内容',
  )
  console.log(
    '  - 无调用方的 Inspector Section API',
  )
  console.log('')
  console.log('保留：')
  console.log(
    '  - features/workspace',
  )
  console.log(
    '  - features/settings',
  )
  console.log(
    '  - 官方 tldraw 工具和 Shape',
  )
  console.log(
    '  - 当前右侧属性侧边栏',
  )
  console.log('')
  console.log('验证：')
  console.log('  pnpm format')
  console.log('  pnpm lint')
  console.log('  pnpm typecheck')
  console.log(
    '  pnpm test:architecture',
  )
  console.log('  pnpm test')
  console.log(
    '  pnpm build:desktop',
  )
  console.log('')
}

async function cleanApplicationRuntime() {
  await update(
    'apps/desktop/src/bootstrap/application.ts',
    (source) => {
      source = source.replace(
        `import { flowchartExtension } from '@hybrid-canvas/flowchart'
`,
        '',
      )

      source = source.replace(
        `import { freehandExtension } from '@hybrid-canvas/freehand'
`,
        '',
      )

      source = source.replace(
        `import { scientificPlotExtension } from '@hybrid-canvas/scientific-plot'
`,
        '',
      )

      source = source.replace(
        `    extensions: [flowchartExtension, freehandExtension, scientificPlotExtension],`,
        `    extensions: [],`,
      )

      return source
    },
  )
}

async function cleanDesktopManifest() {
  await updateJson(
    'apps/desktop/package.json',
    (manifest) => {
      for (
        const packageName of
        removedPackages
      ) {
        delete manifest.dependencies?.[
          packageName
        ]

        delete manifest.devDependencies?.[
          packageName
        ]
      }

      return manifest
    },
  )
}

async function cleanRootManifest() {
  await updateJson(
    'package.json',
    (manifest) => {
      manifest.description =
        'A local-first canvas application built on tldraw.'

      return manifest
    },
  )
}

async function cleanArchitectureScaffolds() {
  await updateJson(
    'architecture.scaffolds.json',
    (manifest) => {
      manifest.scaffolds =
        manifest.scaffolds.filter(
          (scaffold) =>
            !removedFeatures.some(
              (feature) =>
                scaffold.path ===
                'features/' +
                  feature,
            ),
        )

      return manifest
    },
  )
}

async function cleanArchitectureRules() {
  await update(
    'tests/architecture/check.mjs',
    (source) => {
      source = source.replace(
        `    '(?:canvas-session|flowchart|freehand|import-export|scientific-plot|settings|workspace)',`,
        `    '(?:canvas-session|settings|workspace)',`,
      )

      source = source.replace(
        `      /@hybrid-canvas\\/(?:asset|canvas|document|desktop(?:-ipc)?|file|flowchart|freehand|import-export|platforms-desktop-runtime|plugin|scientific-plot|settings|workspace)(?=['"/])/`,
        `      /@hybrid-canvas\\/(?:asset|canvas|document|desktop(?:-ipc)?|file|platforms-desktop-runtime|plugin|settings|workspace)(?=['"/])/`,
      )

      return source
    },
  )
}

async function cleanWorkspaceCatalog() {
  await update(
    'pnpm-workspace.yaml',
    (source) => {
      const catalogPackages = [
        '@dagrejs/dagre',
        'apache-arrow',
        'd3-array',
        'd3-scale',
        'elkjs',
        'uplot',
      ]

      const lines =
        source.split('\n')

      const result = []

      for (
        let index = 0;
        index < lines.length;
        index += 1
      ) {
        const line =
          lines[index]

        const matchingPackage =
          catalogPackages.find(
            (packageName) =>
              line.trimStart().startsWith(
                packageName.includes('@')
                  ? `"${packageName}":`
                  : packageName + ':',
              ),
          )

        if (
          matchingPackage
        ) {
          continue
        }

        result.push(line)
      }

      return result.join('\n')
    },
  )
}

async function removeInspectorSectionApi() {
  await rewriteExtensionContract()
  await cleanExtensionPublicExports()
  await cleanEditorCanvas()
  await cleanInspectorPortal()
  await cleanPropertiesContent()
  await cleanPropertiesArchitectureTest()
}

async function rewriteExtensionContract() {
  const content = `import type {
  TLAnyBindingUtilConstructor,
  TLAnyShapeUtilConstructor,
  TLStateNodeConstructor,
} from 'tldraw'

export const HYBRID_CANVAS_EXTENSION_API_VERSION = '3'

export interface HybridCanvasExtension {
  readonly id: string
  readonly version: string
  readonly apiVersion: string
  readonly shapeUtils?: readonly TLAnyShapeUtilConstructor[]
  readonly bindingUtils?: readonly TLAnyBindingUtilConstructor[]
  readonly tools?: readonly TLStateNodeConstructor[]
  readonly shapeLabels?: Readonly<Record<string, string>>
}

export interface ExtensionRegistration {
  readonly extensions: readonly HybridCanvasExtension[]
  readonly shapeUtils: readonly TLAnyShapeUtilConstructor[]
  readonly bindingUtils: readonly TLAnyBindingUtilConstructor[]
  readonly tools: readonly TLStateNodeConstructor[]
  readonly shapeLabels: Readonly<Record<string, string>>
}

export function buildExtensionRegistration(
  input: readonly HybridCanvasExtension[] = [],
): ExtensionRegistration {
  const ids = new Set<string>()
  const shapeUtils: TLAnyShapeUtilConstructor[] = []
  const bindingUtils: TLAnyBindingUtilConstructor[] = []
  const tools: TLStateNodeConstructor[] = []
  const shapeLabels: Record<string, string> = {}

  for (const extension of input) {
    if (
      !extension.id ||
      ids.has(extension.id)
    ) {
      throw new Error(
        'EXTENSION_DUPLICATE_ID',
      )
    }

    if (
      extension.apiVersion !==
      HYBRID_CANVAS_EXTENSION_API_VERSION
    ) {
      throw new Error(
        'EXTENSION_API_VERSION_MISMATCH',
      )
    }

    ids.add(extension.id)

    shapeUtils.push(
      ...(extension.shapeUtils ?? []),
    )

    bindingUtils.push(
      ...(extension.bindingUtils ?? []),
    )

    tools.push(
      ...(extension.tools ?? []),
    )

    Object.assign(
      shapeLabels,
      extension.shapeLabels,
    )
  }

  return Object.freeze({
    extensions:
      Object.freeze([...input]),

    shapeUtils:
      Object.freeze(shapeUtils),

    bindingUtils:
      Object.freeze(bindingUtils),

    tools:
      Object.freeze(tools),

    shapeLabels:
      Object.freeze(shapeLabels),
  })
}
`

  await write(
    'editor/core/src/contracts/extension-contract.ts',
    content,
  )
}

async function cleanExtensionPublicExports() {
  for (
    const relativePath of [
      'editor/core/src/contracts/public-api.ts',
      'editor/core/src/extensions-public-api.ts',
    ]
  ) {
    await update(
      relativePath,
      (source) =>
        source
          .split('\n')
          .filter(
            (line) =>
              !line.includes(
                'HybridCanvasInspectorSection',
              ),
          )
          .join('\n'),
    )
  }
}

async function cleanEditorCanvas() {
  await update(
    'editor/core/src/react/EditorCanvas.tsx',
    (source) => {
      source = source.replace(
        `                inspectorSections={
                  registration.inspectorSections
                }
`,
        '',
      )

      source = source.replace(
        `      [
        isActive,
        registration.inspectorSections,
      ],`,
        `      [isActive],`,
      )

      return source
    },
  )
}

async function cleanInspectorPortal() {
  await update(
    'editor/core/src/react/canvas-inspector-portal.tsx',
    (source) => {
      source = source.replace(
        `import type {
  HybridCanvasInspectorSectionContribution,
  HybridCanvasInspectorSectionMode,
} from '../contracts/extension-contract'
`,
        '',
      )

      source = source.replace(
        `  readonly inspectorSections:
    readonly HybridCanvasInspectorSectionContribution[]
`,
        '',
      )

      source = source.replace(
        `  active,
  inspectorSections,
`,
        `  active,
`,
      )

      source = source.replace(
        /\n  const inspectorTarget =[\s\S]*?\n  \/\*\n   \* useRelevantStyles\(\) 决定官方样式内容。/,
        `
  /*
   * useRelevantStyles() 决定官方样式内容。`,
      )

      source = source.replace(
        `      styles !== null ||
      selectedShapeCount > 0 ||
      matchingInspectorSections.length > 0`,
        `      styles !== null ||
      selectedShapeCount > 0`,
      )

      source = source.replaceAll(
        `          extensionSections={
            extensionSections
          }
`,
        '',
      )

      return source
    },
  )
}

async function cleanPropertiesContent() {
  await update(
    'editor/core/src/react/PropertiesInspectorContent.tsx',
    (source) => {
      source = source.replace(
        `  readonly extensionSections:
    readonly ReactNode[]
`,
        '',
      )

      source = source.replace(
        `  selectedShapeCount,
  extensionSections,
`,
        `  selectedShapeCount,
`,
      )

      source = source.replace(
        `
      {extensionSections}
`,
        '',
      )

      source = source.replace(
        `      'scientific-chart': '图表',
`,
        '',
      )

      source = source.replace(
        `      'flow-node': '流程图节点',
`,
        '',
      )

      return source
    },
  )
}

async function cleanPropertiesArchitectureTest() {
  await update(
    'tests/architecture/check-properties-inspector-architecture.mjs',
    (source) => {
      source = source.replace(
        `
requirePattern(
  'ExtensionContract',
  sources.extensionContract,
  /inspectorSections/,
  'Extension API 必须使用 Section contribution',
)
`,
        '',
      )

      return source
    },
  )
}

async function removeFeatureDirectories() {
  for (
    const feature of
    removedFeatures
  ) {
    await rm(
      path.join(
        root,
        'features',
        feature,
      ),
      {
        recursive: true,
        force: true,
      },
    )
  }
}

async function regenerateLockfile() {
  console.log('')
  console.log(
    '正在重新生成 pnpm-lock.yaml...',
  )

  const result =
    spawnSync(
      'pnpm',
      [
        'install',
        '--lockfile-only',
      ],
      {
        cwd: root,
        stdio: 'inherit',
        shell:
          process.platform ===
          'win32',
      },
    )

  if (
    result.error
  ) {
    throw result.error
  }

  if (
    result.status !== 0
  ) {
    throw new Error(
      'PNPM_LOCKFILE_REGENERATION_FAILED',
    )
  }
}

async function findStaleReferences() {
  const needles = [
    '@hybrid-canvas/flowchart',
    '@hybrid-canvas/freehand',
    '@hybrid-canvas/scientific-plot',
    '@hybrid-canvas/import-export',
    'flowchartExtension',
    'freehandExtension',
    'scientificPlotExtension',
    'ScientificChart',
    'scientific-chart',
    'FlowNodeShape',
    'flow-node',
    'features/flowchart',
    'features/freehand',
    'features/scientific-plot',
    'features/import-export',
    'HybridCanvasInspectorSection',
    'inspectorSections',
  ]

  const ignoredDirectories =
    new Set([
      '.git',
      '.turbo',
      'node_modules',
      'dist',
      'build',
      'coverage',
      'target',
      'test-results',
    ])

  const matches = []

  await scanDirectory(
    root,
    needles,
    ignoredDirectories,
    matches,
  )

  return matches
}

async function scanDirectory(
  directory,
  needles,
  ignoredDirectories,
  matches,
) {
  const entries =
    await readdir(
      directory,
      {
        withFileTypes: true,
      },
    )

  for (
    const entry of entries
  ) {
    if (
      entry.isDirectory() &&
      ignoredDirectories.has(
        entry.name,
      )
    ) {
      continue
    }

    const entryPath =
      path.join(
        directory,
        entry.name,
      )

    if (
      entry.isDirectory()
    ) {
      await scanDirectory(
        entryPath,
        needles,
        ignoredDirectories,
        matches,
      )

      continue
    }

    if (
      entryPath ===
      process.argv[1]
    ) {
      continue
    }

    if (
      !/\.(?:json|yaml|yml|ts|tsx|js|jsx|mjs|cjs|md|css|toml)$/.test(
        entry.name,
      )
    ) {
      continue
    }

    const content =
      normalize(
        await readFile(
          entryPath,
          'utf8',
        ),
      )

    const found =
      needles.filter(
        (needle) =>
          content.includes(
            needle,
          ),
      )

    if (
      found.length > 0
    ) {
      matches.push(
        path.relative(
          root,
          entryPath,
        ) +
          ': ' +
          found.join(', '),
      )
    }
  }
}

async function updateJson(
  relativePath,
  transform,
) {
  const filePath =
    path.join(
      root,
      relativePath,
    )

  const raw =
    await readFile(
      filePath,
      'utf8',
    )

  const manifest =
    JSON.parse(
      raw.replace(
        /^\uFEFF/,
        '',
      ),
    )

  const next =
    transform(manifest)

  await writeFile(
    filePath,
    JSON.stringify(
      next,
      null,
      2,
    ) + '\n',
    'utf8',
  )
}

async function update(
  relativePath,
  transform,
) {
  const filePath =
    path.join(
      root,
      relativePath,
    )

  const previous =
    normalize(
      await readFile(
        filePath,
        'utf8',
      ),
    )

  const next =
    transform(previous)

  await writeFile(
    filePath,
    next.trimEnd() + '\n',
    'utf8',
  )
}

async function write(
  relativePath,
  content,
) {
  await writeFile(
    path.join(
      root,
      relativePath,
    ),
    normalize(content).trimEnd() +
      '\n',
    'utf8',
  )
}

function normalize(
  content,
) {
  return content.replaceAll(
    '\r\n',
    '\n',
  )
}