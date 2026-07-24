import {
  access,
  appendFile,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const SCRIPT_PATH = path.resolve(process.argv[1] ?? '')

const files = {
  transformStatus: path.join(
    ROOT,
    'editor/core/src/react/CanvasTransformStatus.tsx',
  ),
  transformGeometry: path.join(
    ROOT,
    'editor/core/src/react/selection-transform-geometry.ts',
  ),
  propertiesInspector: path.join(
    ROOT,
    'editor/core/src/react/PropertiesInspectorContent.tsx',
  ),
  workspaceContainer: path.join(
    ROOT,
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  ),
  architectureTest: path.join(
    ROOT,
    'tests/architecture/check-transform-status-architecture.mjs',
  ),
  gitignore: path.join(ROOT, '.gitignore'),
  obsoleteRefactor: path.join(ROOT, 'refactor.mjs'),
  devErrorLog: path.join(ROOT, 'dev-err.txt'),
  devOutputLog: path.join(ROOT, 'dev-output.txt'),
}

await main()

async function main() {
  if (
    SCRIPT_PATH ===
    path.resolve(files.obsoleteRefactor)
  ) {
    throw new Error(
      [
        '不要把本脚本保存为 refactor.mjs。',
        '请保存为 cleanup-final-v15.mjs 后执行。',
        '脚本需要删除仓库中的旧 refactor.mjs。',
      ].join('\n'),
    )
  }

  await assertRequiredFiles()

  await cleanTransformStatus()
  await cleanTransformGeometry()
  await cleanPropertiesInspector()
  await cleanWorkspaceContainer()
  await rewriteArchitectureTest()
  await removeRepositoryArtifacts()
  await updateGitignore()
  await verifyFinalState()

  console.log('')
  console.log('V15 最终清理完成：')
  console.log('- 删除状态栏重复分隔线')
  console.log('- 清理脚本生成的异常空行')
  console.log('- 修正 Transform 尺寸语义文案')
  console.log('- 删除媒体类型双轨派生')
  console.log('- 媒体下载能力拆分为 Image / Video')
  console.log('- Frame 能力收敛为 canManageFrame')
  console.log('- bounds 改用官方 Box 类型')
  console.log('- 架构测试不再锁死内部 API')
  console.log('- 删除根目录 refactor.mjs')
  console.log('- 删除空开发日志')
  console.log('- 更新 .gitignore')
  console.log('')
  console.log('继续运行：')
  console.log('  pnpm format')
  console.log('  pnpm lint')
  console.log('  pnpm typecheck')
  console.log('  pnpm test:architecture')
  console.log('  pnpm test')
  console.log('  pnpm build:desktop')
  console.log('')
}

async function assertRequiredFiles() {
  for (
    const filePath of [
      files.transformStatus,
      files.transformGeometry,
      files.propertiesInspector,
      files.workspaceContainer,
      files.architectureTest,
      files.gitignore,
    ]
  ) {
    try {
      await access(filePath)
    } catch {
      throw new Error(
        '找不到必要文件：' +
          path.relative(ROOT, filePath),
      )
    }
  }
}

async function cleanTransformStatus() {
  let source = await readFile(
    files.transformStatus,
    'utf8',
  )

  /*
   * 共同旋转对象使用 rotated selection bounds，
   * 不能继续标记为页面轴对齐包围盒。
   */
  source = replaceRequired(
    source,
    `          <TransformGroup

            label="尺寸"
            title="页面轴对齐包围盒"
          >`,
    `          <TransformGroup
            label="尺寸"
            title={
              snapshot.hasMixedRotation
                ? '页面轴对齐包围盒'
                : '选择包围盒'
            }
          >`,
    '修正尺寸包围盒文案',
  )

  /*
   * 如果用户已经运行过 format，异常空行可能已经消失，
   * 但旧静态 title 仍然存在。
   */
  source = source.replace(
    `          <TransformGroup
            label="尺寸"
            title="页面轴对齐包围盒"
          >`,
    `          <TransformGroup
            label="尺寸"
            title={
              snapshot.hasMixedRotation
                ? '页面轴对齐包围盒'
                : '选择包围盒'
            }
          >`,
  )

  /*
   * 删除比例锁定按钮前的重复分隔线。
   */
  source = replaceRegexRequired(
    source,
    /(\n\s*<StatusDivider\s*\/>\s*)\n\s*<StatusDivider\s*\/>(\s*\n\s*<AspectRatioLockButton)/,
    '$1$2',
    '删除重复 StatusDivider',
  )

  /*
   * 删除 TSX 标签内部的脚本替换残留空行。
   */
  source = source.replace(
    /(<TransformGroup[^>]*>\s*)\n\s*\n(\s*\{children\})/g,
    '$1\n$2',
  )

  source = source.replace(
    /(<span[^>]*>\s*)\n\s*\n(\s*<span>)/g,
    '$1\n$2',
  )

  source = collapseExcessBlankLines(source)

  const dividerBeforeAspect =
    source.match(
      /<StatusDivider\s*\/>\s*<AspectRatioLockButton/g,
    )?.length ?? 0

  if (dividerBeforeAspect !== 1) {
    throw new Error(
      '比例锁定按钮前应且只能保留一个 StatusDivider。',
    )
  }

  if (
    source.includes(
      'title="页面轴对齐包围盒"',
    )
  ) {
    throw new Error(
      'CanvasTransformStatus 仍存在过时的静态 bounds 文案。',
    )
  }

  await writeFile(
    files.transformStatus,
    source,
    'utf8',
  )
}

async function cleanTransformGeometry() {
  let source = await readFile(
    files.transformGeometry,
    'utf8',
  )

  /*
   * 使用 tldraw 官方 Box 类型，
   * 删除手工复制的 bounds 影子接口。
   */
  if (
    !source.includes('type Box,')
  ) {
    source = replaceRequired(
      source,
      `import {
  type Editor,`,
      `import {
  type Box,
  type Editor,`,
      '导入官方 Box 类型',
    )
  }

  source = replaceRegexRequired(
    source,
    /  readonly bounds: \{\n    readonly x: number\n    readonly y: number\n    readonly w: number\n    readonly h: number\n    readonly point: \{\n      readonly x: number\n      readonly y: number\n    \}\n  \}/,
    '  readonly bounds: Box',
    '删除手写 bounds 类型',
  )

  if (
    source.includes(
      `readonly bounds: {
    readonly x: number`,
    )
  ) {
    throw new Error(
      'selection-transform-geometry 仍存在手写 bounds 接口。',
    )
  }

  await writeFile(
    files.transformGeometry,
    source,
    'utf8',
  )
}

async function cleanPropertiesInspector() {
  let source = await readFile(
    files.propertiesInspector,
    'utf8',
  )

  /*
   * SelectionCapabilities 收敛：
   * - canFitFrame + canRemoveFrame -> canManageFrame
   * - canDownloadMedia -> canDownloadImage / canDownloadVideo
   */
  source = replaceRequired(
    source,
    `  readonly canFitFrame: boolean
  readonly canRemoveFrame: boolean
  readonly canReplaceImage: boolean
  readonly canReplaceVideo: boolean
  readonly canDownloadMedia: boolean`,
    `  readonly canManageFrame: boolean
  readonly canReplaceImage: boolean
  readonly canReplaceVideo: boolean
  readonly canDownloadImage: boolean
  readonly canDownloadVideo: boolean`,
    '收敛 Frame 与媒体 capabilities',
  )

  /*
   * 删除 onlySelectedShapeType 的独立 reactive 订阅。
   * Shape 类型只在 capability 派生中读取一次。
   */
  source = replaceRegexRequired(
    source,
    /\n  const onlySelectedShapeType = useValue\(\n    'right properties sidebar selected shape type',\n    \(\) => editor\.getOnlySelectedShape\(\)\?\.type \?\? null,\n    \[editor\],\n  \)\n/,
    '\n',
    '删除 onlySelectedShapeType 双轨订阅',
  )

  /*
   * Frame 两个完全相同的条件收敛为一个。
   */
  source = replaceRequired(
    source,
    `          canFitFrame:
            !readonly &&
            onlySelectedIsUnlocked &&
            onlySelectedIsFrameLike,

          canRemoveFrame:
            !readonly &&
            onlySelectedIsUnlocked &&
            onlySelectedIsFrameLike,`,
    `          canManageFrame:
            !readonly &&
            onlySelectedIsUnlocked &&
            onlySelectedIsFrameLike,`,
    '收敛 Frame capability',
  )

  /*
   * 下载能力直接区分媒体类型，
   * UI 不再额外读取 onlySelectedShapeType。
   */
  source = replaceRequired(
    source,
    `          canDownloadMedia:
            (
              onlySelectedIsImage ||
              onlySelectedIsVideo
            ) &&
            onlySelectedHasMediaAsset,`,
    `          canDownloadImage:
            onlySelectedIsImage &&
            onlySelectedHasMediaAsset,

          canDownloadVideo:
            onlySelectedIsVideo &&
            onlySelectedHasMediaAsset,`,
    '拆分媒体下载 capability',
  )

  /*
   * 删除 SelectionActions 调用中的旧 shape type 参数。
   */
  source = source.replace(
    /\n\s*onlySelectedShapeType=\{onlySelectedShapeType\}/,
    '',
  )

  /*
   * 删除 SelectionActionsProps 中的旧字段。
   */
  source = replaceRequired(
    source,
    `  readonly isCroppingImage: boolean
  readonly onlySelectedShapeType: string | null
  readonly selectionLockState: 'locked' | 'unlocked' | 'mixed'`,
    `  readonly isCroppingImage: boolean
  readonly selectionLockState: 'locked' | 'unlocked' | 'mixed'`,
    '删除 SelectionActionsProps shape type',
  )

  /*
   * 删除函数解构中的旧字段，同时修复损坏的缩进。
   */
  source = source.replace(
    /\n\s*onlySelectedShapeType,\s*/,
    '\n',
  )

  /*
   * Frame UI 只读取 canManageFrame。
   */
  const frameStart =
    source.indexOf(
      '          {capabilities.canFitFrame || capabilities.canRemoveFrame ? (',
    )

  const cropStart =
    source.indexOf(
      '          {capabilities.canCropImage ? (',
      frameStart,
    )

  if (
    frameStart === -1 ||
    cropStart === -1
  ) {
    throw new Error(
      '找不到旧 Frame actions 区域。',
    )
  }

  const frameReplacement = `          {capabilities.canManageFrame ? (
            <>
              <ActionButton
                actions={actions}
                icon="corners"
                id="fit-frame-to-content"
                label="适应内容"
              />

              <ActionButton
                actions={actions}
                icon="cross-2"
                id="remove-frame"
                label="移除画框"
              />
            </>
          ) : null}

`

  source =
    source.slice(0, frameStart) +
    frameReplacement +
    source.slice(cropStart)

  /*
   * 图片区域改为 canDownloadImage。
   */
  source = replaceRegexRequired(
    source,
    /\{capabilities\.canReplaceImage \|\|\s*\(onlySelectedShapeType === 'image' && capabilities\.canDownloadMedia\) \? \(/,
    '{capabilities.canReplaceImage || capabilities.canDownloadImage ? (',
    '更新图片 action 条件',
  )

  source = replaceInsideRange(
    source,
    '{capabilities.canReplaceImage || capabilities.canDownloadImage ? (',
    '{capabilities.canReplaceVideo ||',
    'capabilities.canDownloadMedia',
    'capabilities.canDownloadImage',
    '更新图片下载 capability',
  )

  /*
   * 视频区域改为 canDownloadVideo。
   */
  source = replaceRegexRequired(
    source,
    /\{capabilities\.canReplaceVideo \|\|\s*\(onlySelectedShapeType === 'video' && capabilities\.canDownloadMedia\) \? \(/,
    '{capabilities.canReplaceVideo || capabilities.canDownloadVideo ? (',
    '更新视频 action 条件',
  )

  source = replaceInsideRange(
    source,
    '{capabilities.canReplaceVideo || capabilities.canDownloadVideo ? (',
    '{capabilities.canEnableTextAutoSize ? (',
    'capabilities.canDownloadMedia',
    'capabilities.canDownloadVideo',
    '更新视频下载 capability',
  )

  source = collapseExcessBlankLines(source)

  const forbiddenTerms = [
    'onlySelectedShapeType',
    'canDownloadMedia',
    'canFitFrame',
    'canRemoveFrame',
  ]

  const remainingTerms =
    forbiddenTerms.filter(
      (term) => source.includes(term),
    )

  if (remainingTerms.length > 0) {
    throw new Error(
      [
        'PropertiesInspector 仍有旧双轨字段：',
        ...remainingTerms.map(
          (term) => '- ' + term,
        ),
      ].join('\n'),
    )
  }

  const requiredTerms = [
    'canManageFrame',
    'canDownloadImage',
    'canDownloadVideo',
  ]

  for (
    const term of requiredTerms
  ) {
    if (!source.includes(term)) {
      throw new Error(
        'PropertiesInspector 缺少：' +
          term,
      )
    }
  }

  await writeFile(
    files.propertiesInspector,
    source,
    'utf8',
  )
}

async function cleanWorkspaceContainer() {
  let source = await readFile(
    files.workspaceContainer,
    'utf8',
  )

  source = collapseExcessBlankLines(source)

  await writeFile(
    files.workspaceContainer,
    source,
    'utf8',
  )
}

async function rewriteArchitectureTest() {
  const source = `import {
  access,
  readFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()

const files = {
  transformStatus: path.join(
    ROOT,
    'editor/core/src/react/CanvasTransformStatus.tsx',
  ),
  transformGeometry: path.join(
    ROOT,
    'editor/core/src/react/selection-transform-geometry.ts',
  ),
  propertiesInspector: path.join(
    ROOT,
    'editor/core/src/react/PropertiesInspectorContent.tsx',
  ),
  workspaceContainer: path.join(
    ROOT,
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  ),
  shellContract: path.join(
    ROOT,
    'features/workspace/src/contracts/shell-contract.ts',
  ),
  workspaceShell: path.join(
    ROOT,
    'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
  ),
  statusBarHost: path.join(
    ROOT,
    'features/workspace/src/presentation/status/StatusBarHost.tsx',
  ),
}

await Promise.all(
  Object.values(files).map(
    (filePath) => access(filePath),
  ),
)

const entries = await Promise.all(
  Object.entries(files).map(
    async ([name, filePath]) => [
      name,
      await readFile(filePath, 'utf8'),
    ],
  ),
)

const sources = Object.fromEntries(entries)
const failures = []

checkForbiddenTerms(
  'Workspace 状态栏',
  [
    sources.workspaceContainer,
    sources.shellContract,
    sources.workspaceShell,
    sources.statusBarHost,
  ],
  [
    'statusLeft',
    'statusRight',
    'CanvasStatusRightContent',
    'SelectionTransformStatus',
  ],
)

checkRequiredTerms(
  'Workspace 状态栏',
  sources.shellContract +
    sources.workspaceShell +
    sources.workspaceContainer,
  [
    'statusContent',
  ],
)

checkForbiddenTerms(
  'CanvasTransformStatus',
  [sources.transformStatus],
  [
    'editor.resizeShape',
    'editor.rotateShapesBy',
    'editor.updateShapes',
    'editor.getSelectionPageBounds',
    'editor.getSelectionRotatedPageBounds',
    'editor.getShapePageTransform',
    'editor.markHistoryStoppingPoint',
    'editor.run(',
    'resizeToBounds',
    'TldrawUiIcon',
    'TransformFieldId',
  ],
)

checkRequiredTerms(
  'CanvasTransformStatus',
  sources.transformStatus,
  [
    'getSelectionTransformSnapshot',
    'commitSelectionTransform',
    'SelectionTransformField',
    'SelectionTransformSnapshot',
  ],
)

checkForbiddenTerms(
  'Transform geometry',
  [sources.transformGeometry],
  [
    "from 'react'",
    'CanvasTransformStatus',
    'PropertiesInspectorContent',
    'WorkspaceShell',
    'StatusBarHost',
    'useEditor',
    'useValue',
  ],
)

checkRequiredTerms(
  'Transform geometry public boundary',
  sources.transformGeometry,
  [
    'export function getSelectionTransformSnapshot',
    'export function commitSelectionTransform',
    'export type SelectionTransformField',
    'export interface SelectionTransformSnapshot',
    'readonly bounds: Box',
  ],
)

checkForbiddenTerms(
  'Properties Inspector',
  [sources.propertiesInspector],
  [
    'onlySelectedShapeType',
    'canDownloadMedia',
    'canFitFrame',
    'canRemoveFrame',
    'creationInspectors',
    'CanvasInspectorDock',
    'HybridCanvasCreationInspector',
    'ConnectorToolInspector',
    'FreehandToolInspector',
    'ScientificChartToolInspector',
  ],
)

checkRequiredTerms(
  'Properties Inspector capabilities',
  sources.propertiesInspector,
  [
    'canManageFrame',
    'canDownloadImage',
    'canDownloadVideo',
  ],
)

if (
  sources.transformStatus.includes(
    '<StatusDivider />\\n\\n          <StatusDivider />',
  )
) {
  failures.push(
    'CanvasTransformStatus 存在连续重复分隔线。',
  )
}

for (
  const artifact of [
    'refactor.mjs',
    'dev-err.txt',
    'dev-output.txt',
  ]
) {
  try {
    await access(
      path.join(ROOT, artifact),
    )

    failures.push(
      '仓库根目录仍存在临时文件：' +
        artifact,
    )
  } catch {
    // 文件不存在即为正确状态。
  }
}

if (failures.length > 0) {
  console.error(
    [
      'Transform / Inspector 架构检查失败：',
      ...failures.map(
        (failure) => '- ' + failure,
      ),
    ].join('\\n'),
  )

  process.exitCode = 1
} else {
  console.log(
    'Transform / Inspector 架构检查通过。',
  )
}

function checkForbiddenTerms(
  label,
  candidateSources,
  terms,
) {
  const source = candidateSources.join('\\n')

  for (const term of terms) {
    if (source.includes(term)) {
      failures.push(
        label +
          ' 不应包含：' +
          term,
      )
    }
  }
}

function checkRequiredTerms(
  label,
  source,
  terms,
) {
  for (const term of terms) {
    if (!source.includes(term)) {
      failures.push(
        label +
          ' 缺少：' +
          term,
      )
    }
  }
}
`

  await writeFile(
    files.architectureTest,
    source,
    'utf8',
  )
}

async function removeRepositoryArtifacts() {
  for (
    const filePath of [
      files.obsoleteRefactor,
      files.devErrorLog,
      files.devOutputLog,
    ]
  ) {
    await rm(filePath, {
      force: true,
    })
  }
}

async function updateGitignore() {
  const source = await readFile(
    files.gitignore,
    'utf8',
  )

  const entries = [
    'dev-err.txt',
    'dev-output.txt',
  ]

  const missingEntries =
    entries.filter(
      (entry) =>
        !source
          .split(/\r?\n/)
          .includes(entry),
    )

  if (missingEntries.length === 0) {
    return
  }

  const prefix =
    source.endsWith('\n')
      ? ''
      : '\n'

  await appendFile(
    files.gitignore,
    prefix +
      '\n# Local development logs\n' +
      missingEntries.join('\n') +
      '\n',
    'utf8',
  )
}

async function verifyFinalState() {
  const sources = {
    transformStatus: await readFile(
      files.transformStatus,
      'utf8',
    ),
    transformGeometry: await readFile(
      files.transformGeometry,
      'utf8',
    ),
    propertiesInspector: await readFile(
      files.propertiesInspector,
      'utf8',
    ),
    workspaceContainer: await readFile(
      files.workspaceContainer,
      'utf8',
    ),
  }

  const forbiddenByFile = [
    [
      'CanvasTransformStatus',
      sources.transformStatus,
      [
        'TransformFieldId',
        'title="页面轴对齐包围盒"',
        'resizeToBounds',
      ],
    ],
    [
      'selection-transform-geometry',
      sources.transformGeometry,
      [
        `readonly bounds: {
    readonly x: number`,
      ],
    ],
    [
      'PropertiesInspectorContent',
      sources.propertiesInspector,
      [
        'onlySelectedShapeType',
        'canDownloadMedia',
        'canFitFrame',
        'canRemoveFrame',
      ],
    ],
  ]

  const failures = []

  for (
    const [
      label,
      source,
      terms,
    ] of forbiddenByFile
  ) {
    for (
      const term of terms
    ) {
      if (source.includes(term)) {
        failures.push(
          String(label) +
            ': ' +
            term,
        )
      }
    }
  }

  for (
    const artifact of [
      files.obsoleteRefactor,
      files.devErrorLog,
      files.devOutputLog,
    ]
  ) {
    try {
      await access(artifact)

      failures.push(
        '临时文件仍然存在：' +
          path.relative(ROOT, artifact),
      )
    } catch {
      // 正确：文件不存在。
    }
  }

  if (failures.length > 0) {
    throw new Error(
      [
        '最终检查失败：',
        ...failures.map(
          (failure) =>
            '- ' + failure,
        ),
      ].join('\n'),
    )
  }
}

function replaceRequired(
  source,
  oldText,
  newText,
  description,
) {
  if (!source.includes(oldText)) {
    throw new Error(
      '找不到预期代码，无法' +
        description +
        '。',
    )
  }

  return source.replace(
    oldText,
    newText,
  )
}

function replaceRegexRequired(
  source,
  pattern,
  replacement,
  description,
) {
  if (!pattern.test(source)) {
    throw new Error(
      '找不到预期代码，无法' +
        description +
        '。',
    )
  }

  pattern.lastIndex = 0

  return source.replace(
    pattern,
    replacement,
  )
}

function replaceInsideRange(
  source,
  startMarker,
  endMarker,
  oldText,
  newText,
  description,
) {
  const start =
    source.indexOf(startMarker)

  const end =
    source.indexOf(
      endMarker,
      start + startMarker.length,
    )

  if (
    start === -1 ||
    end === -1
  ) {
    throw new Error(
      '找不到代码区域，无法' +
        description +
        '。',
    )
  }

  const before =
    source.slice(0, start)

  let section =
    source.slice(start, end)

  const after =
    source.slice(end)

  if (!section.includes(oldText)) {
    throw new Error(
      '代码区域中找不到旧字段，无法' +
        description +
        '。',
    )
  }

  section = section.replaceAll(
    oldText,
    newText,
  )

  return before + section + after
}

function collapseExcessBlankLines(
  source,
) {
  return (
    source
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  )
}