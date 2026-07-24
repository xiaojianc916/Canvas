import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()

const files = {
  transformStatus: path.join(ROOT, 'editor/core/src/react/CanvasTransformStatus.tsx'),
  transformGeometry: path.join(ROOT, 'editor/core/src/react/selection-transform-geometry.ts'),
  propertiesInspector: path.join(ROOT, 'editor/core/src/react/PropertiesInspectorContent.tsx'),
  workspaceContainer: path.join(
    ROOT,
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  ),
  shellContract: path.join(ROOT, 'features/workspace/src/contracts/shell-contract.ts'),
  workspaceShell: path.join(ROOT, 'features/workspace/src/presentation/shell/WorkspaceShell.tsx'),
  statusBarHost: path.join(ROOT, 'features/workspace/src/presentation/status/StatusBarHost.tsx'),
}

await Promise.all(Object.values(files).map((filePath) => access(filePath)))

const entries = await Promise.all(
  Object.entries(files).map(async ([name, filePath]) => [name, await readFile(filePath, 'utf8')]),
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
  ['statusLeft', 'statusRight', 'CanvasStatusRightContent', 'SelectionTransformStatus'],
)

checkRequiredTerms(
  'Workspace 状态栏',
  sources.shellContract + sources.workspaceShell + sources.workspaceContainer,
  ['statusContent'],
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

checkRequiredTerms('CanvasTransformStatus', sources.transformStatus, [
  'getSelectionTransformSnapshot',
  'commitSelectionTransform',
  'SelectionTransformField',
  'SelectionTransformSnapshot',
])

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

checkRequiredTerms('Transform geometry public boundary', sources.transformGeometry, [
  'export function getSelectionTransformSnapshot',
  'export function commitSelectionTransform',
  'export type SelectionTransformField',
  'export interface SelectionTransformSnapshot',
  'readonly bounds: Box',
])

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

checkRequiredTerms('Properties Inspector capabilities', sources.propertiesInspector, [
  'canManageFrame',
  'canDownloadImage',
  'canDownloadVideo',
])

if (sources.transformStatus.includes('<StatusDivider />\n\n          <StatusDivider />')) {
  failures.push('CanvasTransformStatus 存在连续重复分隔线。')
}

for (const artifact of ['refactor.mjs', 'dev-err.txt', 'dev-output.txt']) {
  try {
    await access(path.join(ROOT, artifact))

    failures.push('仓库根目录仍存在临时文件：' + artifact)
  } catch {
    // 文件不存在即为正确状态。
  }
}

if (failures.length > 0) {
  console.error(
    ['Transform / Inspector 架构检查失败：', ...failures.map((failure) => '- ' + failure)].join(
      '\n',
    ),
  )

  process.exitCode = 1
} else {
  console.log('Transform / Inspector 架构检查通过。')
}

function checkForbiddenTerms(label, candidateSources, terms) {
  const source = candidateSources.join('\n')

  for (const term of terms) {
    if (source.includes(term)) {
      failures.push(label + ' 不应包含：' + term)
    }
  }
}

function checkRequiredTerms(label, source, terms) {
  for (const term of terms) {
    if (!source.includes(term)) {
      failures.push(label + ' 缺少：' + term)
    }
  }
}
