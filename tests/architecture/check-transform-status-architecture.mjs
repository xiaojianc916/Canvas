import {
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
    async (filePath) => {
      await access(filePath)
    },
  ),
)

const [
  transformStatus,
  transformGeometry,
  workspaceContainer,
  shellContract,
  workspaceShell,
  statusBarHost,
] = await Promise.all([
  readFile(files.transformStatus, 'utf8'),
  readFile(files.transformGeometry, 'utf8'),
  readFile(files.workspaceContainer, 'utf8'),
  readFile(files.shellContract, 'utf8'),
  readFile(files.workspaceShell, 'utf8'),
  readFile(files.statusBarHost, 'utf8'),
])

const failures = []

const forbiddenWorkspaceTerms = [
  'statusLeft',
  'statusRight',
  'CanvasStatusRightContent',
  'SelectionTransformStatus',
]

for (
  const [
    label,
    source,
  ] of [
    ['WorkspaceContainer', workspaceContainer],
    ['WorkspaceShellProps', shellContract],
    ['WorkspaceShell', workspaceShell],
    ['StatusBarHost', statusBarHost],
  ]
) {
  for (
    const term of forbiddenWorkspaceTerms
  ) {
    if (source.includes(term)) {
      failures.push(
        label +
          ' 仍包含旧状态栏术语：' +
          term,
      )
    }
  }
}

const forbiddenStatusGeometry = [
  'resizeToBounds',
  'rotateShapesBy',
  'updateShapes(',
  'getSelectionPageBounds',
  'getSelectionRotatedPageBounds',
  'getShapePageTransform',
  'markHistoryStoppingPoint',
  'TransformFieldId',
  'normalizeRadians',
  'normalizeDegrees',
  'radiansToDegrees',
  'degreesToRadians',
  'TldrawUiIcon',
]

for (
  const term of forbiddenStatusGeometry
) {
  if (transformStatus.includes(term)) {
    failures.push(
      'CanvasTransformStatus 绕过 geometry：' +
        term,
    )
  }
}

const requiredGeometryTerms = [
  'getSelectionTransformSnapshot',
  'commitSelectionTransform',
  'resizeShape(',
  'rotateShapesBy(',
  'getShapePageTransform',
  'markHistoryStoppingPoint',
  'MINIMUM_SELECTION_SIZE',
]

for (
  const term of requiredGeometryTerms
) {
  if (!transformGeometry.includes(term)) {
    failures.push(
      'selection-transform-geometry 缺少：' +
        term,
    )
  }
}

const forbiddenGeometryDependencies = [
  "from 'react'",
  'CanvasTransformStatus',
  'PropertiesInspectorContent',
  'WorkspaceShell',
  'StatusBarHost',
]

for (
  const term of forbiddenGeometryDependencies
) {
  if (transformGeometry.includes(term)) {
    failures.push(
      'geometry 反向依赖 UI：' +
        term,
    )
  }
}

if (
  !shellContract.includes(
    'readonly statusContent: ReactNode',
  )
) {
  failures.push(
    'WorkspaceShellProps 缺少唯一 statusContent。',
  )
}

if (
  !workspaceShell.includes(
    '<StatusBarHost>{statusContent}</StatusBarHost>',
  )
) {
  failures.push(
    'WorkspaceShell 未使用唯一 StatusBarHost children。',
  )
}

if (failures.length > 0) {
  console.error(
    [
      'Transform/状态栏架构检查失败：',
      ...failures.map(
        (failure) => '- ' + failure,
      ),
    ].join('\n'),
  )

  process.exitCode = 1
} else {
  console.log(
    'Transform/状态栏架构检查通过。',
  )
}
