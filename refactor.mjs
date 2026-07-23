#!/usr/bin/env node

/* biome-ignore-all lint/suspicious/noConsole: Migration CLI intentionally reports progress. */

import {
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import {
  relative,
  resolve,
} from 'node:path'

const cli = parseCliArguments(process.argv.slice(2))
const requestedRoot = resolve(cli.root)
const root = findRepositoryRoot(requestedRoot)

/**
 * 保存脚本修改前的文件内容。
 *
 * 如果格式化、类型检查、测试或构建失败，会恢复这些文件，
 * 避免留下只完成了一半的迁移。
 */
const changedFiles = new Map()

main().catch((error) => {
  console.error('')

  if (error instanceof Error) {
    console.error(error.stack ?? error.message)
  } else {
    console.error(error)
  }

  if (changedFiles.size > 0) {
    console.error('\n验证失败，正在恢复本次脚本修改……')

    try {
      rollback()
      console.error('已恢复全部脚本修改。')
    } catch (rollbackError) {
      console.error('自动恢复失败：', rollbackError)
      console.error(
        '请执行 git status 和 git diff，人工恢复脚本修改。',
      )
    }
  }

  process.exitCode = 1
})

async function main() {
  assertRepository()
  assertCleanWorktree()

  console.log(`仓库：${root}`)
  console.log('模式：应用 P1 tldraw-first 修复')
  console.log('')

  replaceFlowNodeImplementation()
  quarantinePrototypeScientificPlot()
  removePrototypeChartToolbarEntry()

  formatChangedFiles()
  verifyChangedSource()
  verifyProject()

  console.log('\nP1 tldraw-first 修复完成。')
  console.log('\n修改文件：')

  for (const path of changedFiles.keys()) {
    console.log(`- ${relative(root, path)}`)
  }

  console.log(`
已完成：

1. FlowNode 使用统一几何来源：
   - React 画布渲染
   - tldraw hit testing
   - selection outline
   - arrow binding
   - indicator
   - SVG/PNG 导出

2. nodeType 使用 T.literalEnum 运行时校验。

3. FlowNode 尺寸和颜色增加持久化边界校验。

4. SVG 导出不再使用 foreignObject。

5. 未接入 Dataset、Worker、revision 和 LOD 的科学图表，
   已从 production composition root 和正式工具栏退出。

6. 没有增加 fallback、兼容 wrapper 或第二套 Shape 实现。

科学图表重新进入 production 前必须满足：

- Shape 只保存 datasetId、datasetRevision 和轻量 ChartSpec；
- 大型 Dataset 位于 TLStore 外部；
- 数据计算和降采样进入 Worker；
- Worker 输出带输入 revision，过期结果不可提交；
- 支持取消、超时和资源预算；
- 屏幕渲染和导出使用同一个 ChartSpec；
- 具有大数据集性能基准和 round-trip 测试。
`)
}

function parseCliArguments(arguments_) {
  let rootArgument = null

  for (const argument of arguments_) {
    if (argument === '--apply') {
      continue
    }

    if (
      argument === '--help' ||
      argument === '-h'
    ) {
      printHelp()
      process.exit(0)
    }

    if (argument.startsWith('--')) {
      fail(`未知参数：${argument}`)
    }

    if (rootArgument !== null) {
      fail(
        [
          '只能指定一个项目目录。',
          `第一个目录：${rootArgument}`,
          `第二个目录：${argument}`,
        ].join('\n'),
      )
    }

    rootArgument = argument
  }

  return Object.freeze({
    root: rootArgument ?? '.',
  })
}

function printHelp() {
  console.log(`
用法：

  node refactor.mjs
  node refactor.mjs --apply
  node refactor.mjs "D:\\\\xiaojianc\\\\hybrid-canvas"
  node refactor.mjs --apply "D:\\\\xiaojianc\\\\hybrid-canvas"

说明：

  --apply 是可选参数。脚本默认就是应用修改。

执行条件：

  - 必须位于 Git 工作区中；
  - 工作区必须干净；
  - 目标源码必须与迁移脚本的前置条件匹配；
  - 验证失败时自动恢复修改。
`)
}

function findRepositoryRoot(startDirectory) {
  try {
    return resolve(
      execFileSync(
        'git',
        [
          '-C',
          startDirectory,
          'rev-parse',
          '--show-toplevel',
        ],
        {
          encoding: 'utf8',
          env: process.env,
          shell: process.platform === 'win32',
        },
      ).trim(),
    )
  } catch {
    fail(
      [
        `无法从目标目录找到 Git 仓库：${startDirectory}`,
        '',
        '请确认：',
        '1. 当前项目通过 git clone 获取，而不是解压 ZIP；',
        '2. Git 已安装并可以在 PowerShell 中运行；',
        '3. 传入的路径位于 hybrid-canvas 仓库中。',
      ].join('\n'),
    )
  }
}

function assertRepository() {
  const packagePath = resolve(root, 'package.json')

  if (!existsSync(packagePath)) {
    fail(`缺少必要项目文件：package.json`)
  }

  let packageJson

  try {
    packageJson = JSON.parse(
      readFileSync(packagePath, 'utf8'),
    )
  } catch {
    fail('package.json 不是有效 JSON。')
  }

  if (packageJson.name !== 'hybrid-canvas') {
    fail(
      [
        '目标仓库不是预期的 hybrid-canvas 项目。',
        `实际 package name：${String(packageJson.name)}`,
      ].join('\n'),
    )
  }

  const required = [
    'apps/desktop/src/bootstrap/application.ts',
    'editor/core/src/react/CanvasToolbar.tsx',
    'features/flowchart/src/shapes/FlowNodeShapeUtil.tsx',
    'features/scientific-plot/src/shapes/ScientificChartShapeUtil.tsx',
  ]

  for (const item of required) {
    if (!existsSync(resolve(root, item))) {
      fail(`缺少必要项目文件：${item}`)
    }
  }
}

function assertCleanWorktree() {
  const status = capture('git', [
    'status',
    '--porcelain',
    '--untracked-files=normal',
  ])

  if (status.trim()) {
    fail(
      [
        'Git 工作区不干净，拒绝执行自动迁移。',
        '',
        '请先提交、暂存或移走现有修改。',
        '',
        status,
      ].join('\n'),
    )
  }
}

/**
 * 彻底替换 FlowNode Shape。
 *
 * 不保留旧的 CSS clip-path 视觉实现，因为它与 tldraw 的
 * Rectangle2d 命中几何不一致。
 */
function replaceFlowNodeImplementation() {
  const path = resolve(
    root,
    'features/flowchart/src/shapes/FlowNodeShapeUtil.tsx',
  )

  const current = read(path)

  const requiredMarkers = [
    "nodeType: T.string as T.Validator<FlowNodeType>",
    'return new Rectangle2d({',
    "clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)'",
    '<foreignObject',
  ]

  for (const marker of requiredMarkers) {
    if (!current.includes(marker)) {
      fail(
        [
          'FlowNodeShapeUtil 与脚本预期不一致，拒绝整文件覆盖。',
          `缺少源码标记：${marker}`,
          `文件：${relative(root, path)}`,
        ].join('\n'),
      )
    }
  }

  const next = `import { T } from '@tldraw/validate'
import type { ReactElement } from 'react'
import {
  HTMLContainer,
  Polygon2d,
  ShapeUtil,
  type TLBaseShape,
  type TLIndicatorPath,
  Vec,
} from 'tldraw'

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'flow-node': FlowNodeShapeProps
  }
}

export const FLOW_NODE_TYPES = [
  'process',
  'decision',
  'start-end',
  'input-output',
] as const

export type FlowNodeType =
  (typeof FLOW_NODE_TYPES)[number]

export interface FlowNodeShapeProps {
  readonly label: string
  readonly nodeType: FlowNodeType
  readonly w: number
  readonly h: number
  readonly color: string
}

export type FlowNodeShape = TLBaseShape<
  'flow-node',
  FlowNodeShapeProps
>

interface Point {
  readonly x: number
  readonly y: number
}

const MIN_FLOW_NODE_WIDTH = 32
const MIN_FLOW_NODE_HEIGHT = 24
const CAPSULE_SEGMENTS_PER_HALF = 12

export class FlowNodeShapeUtil extends ShapeUtil<FlowNodeShape> {
  static override type = 'flow-node' as const

  static override props = {
    label: T.string,

    /*
     * Runtime validation must agree with the TypeScript union.
     * A type assertion around T.string would only hide malformed persisted
     * values from TypeScript; it would not reject them at the Store boundary.
     */
    nodeType: T.literalEnum(...FLOW_NODE_TYPES),

    w: T.number.refine(
      (value) =>
        Number.isFinite(value) &&
        value >= MIN_FLOW_NODE_WIDTH,
    ),

    h: T.number.refine(
      (value) =>
        Number.isFinite(value) &&
        value >= MIN_FLOW_NODE_HEIGHT,
    ),

    /*
     * Persisted colors are intentionally self-contained.
     * Reject url(), var(), gradients and other context-dependent CSS values.
     */
    color: T.string.refine(isSafeCssColor),
  }

  getDefaultProps(): FlowNodeShape['props'] {
    return {
      label: '节点',
      nodeType: 'process',
      w: 160,
      h: 60,
      color: '#3b82f6',
    }
  }

  getGeometry(shape: FlowNodeShape): Polygon2d {
    const points = getFlowNodePoints(
      shape.props.nodeType,
      shape.props.w,
      shape.props.h,
    )

    return new Polygon2d({
      points: points.map(
        ({ x, y }) => new Vec(x, y),
      ),
      isFilled: true,
    })
  }

  override component(
    shape: FlowNodeShape,
  ): ReactElement {
    const {
      label,
      nodeType,
      w,
      h,
      color,
    } = shape.props

    const pathData = getClosedSvgPath(
      getFlowNodePoints(nodeType, w, h),
    )

    return (
      <HTMLContainer
        style={{
          width: w,
          height: h,
          pointerEvents: 'none',
        }}
      >
        <svg
          aria-label={label}
          height={h}
          role="img"
          style={{
            display: 'block',
            overflow: 'visible',
          }}
          viewBox={\`0 0 \${w} \${h}\`}
          width={w}
        >
          <path
            d={pathData}
            fill={color}
            stroke="rgba(0, 0, 0, 0.18)"
            strokeLinejoin="round"
            strokeWidth={1}
          />

          <text
            dominantBaseline="middle"
            fill="#ffffff"
            fontFamily="system-ui, sans-serif"
            fontSize={13}
            fontWeight={500}
            textAnchor="middle"
            x={w / 2}
            y={h / 2}
          >
            {label}
          </text>
        </svg>
      </HTMLContainer>
    )
  }

  override getIndicatorPath(
    shape: FlowNodeShape,
  ): TLIndicatorPath {
    const points = getFlowNodePoints(
      shape.props.nodeType,
      shape.props.w,
      shape.props.h,
    )

    const firstPoint = points[0]

    if (!firstPoint) {
      throw new Error('FLOW_NODE_GEOMETRY_EMPTY')
    }

    const path = new Path2D()

    path.moveTo(firstPoint.x, firstPoint.y)

    for (
      let index = 1;
      index < points.length;
      index += 1
    ) {
      const point = points[index]

      if (!point) {
        throw new Error(
          'FLOW_NODE_GEOMETRY_INVALID_POINT',
        )
      }

      path.lineTo(point.x, point.y)
    }

    path.closePath()

    return path
  }

  override toSvg(
    shape: FlowNodeShape,
  ): ReactElement {
    const {
      label,
      nodeType,
      w,
      h,
      color,
    } = shape.props

    const pathData = getClosedSvgPath(
      getFlowNodePoints(nodeType, w, h),
    )

    /*
     * Export native SVG elements instead of foreignObject.
     * This keeps SVG/PNG export independent from HTML/CSS rendering support.
     */
    return (
      <g>
        <path
          d={pathData}
          fill={color}
          stroke="rgba(0, 0, 0, 0.18)"
          strokeLinejoin="round"
          strokeWidth={1}
        />

        <text
          dominantBaseline="middle"
          fill="#ffffff"
          fontFamily="system-ui, sans-serif"
          fontSize={13}
          fontWeight={500}
          textAnchor="middle"
          x={w / 2}
          y={h / 2}
        >
          {label}
        </text>
      </g>
    )
  }
}

/**
 * This function is the sole source of FlowNode outline geometry.
 *
 * Rendering, hit testing, binding, selection indicators and SVG export must
 * consume these same points.
 */
function getFlowNodePoints(
  type: FlowNodeType,
  width: number,
  height: number,
): readonly Point[] {
  switch (type) {
    case 'process':
      return [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: height },
        { x: 0, y: height },
      ]

    case 'decision':
      return [
        { x: width / 2, y: 0 },
        { x: width, y: height / 2 },
        { x: width / 2, y: height },
        { x: 0, y: height / 2 },
      ]

    case 'input-output': {
      const inset = Math.min(
        width * 0.12,
        height * 0.45,
      )

      return [
        { x: inset, y: 0 },
        { x: width - inset, y: 0 },
        { x: width, y: height / 2 },
        { x: width - inset, y: height },
        { x: inset, y: height },
        { x: 0, y: height / 2 },
      ]
    }

    case 'start-end':
      return getCapsulePoints(width, height)
  }
}

function getCapsulePoints(
  width: number,
  height: number,
): readonly Point[] {
  const radius = Math.min(
    height / 2,
    width / 2,
  )

  const leftCenterX = radius
  const rightCenterX = width - radius
  const centerY = height / 2

  if (leftCenterX >= rightCenterX) {
    return getEllipsePoints(
      width / 2,
      centerY,
      width / 2,
      height / 2,
      CAPSULE_SEGMENTS_PER_HALF * 2,
    )
  }

  const points: Point[] = []

  for (
    let index = 0;
    index <= CAPSULE_SEGMENTS_PER_HALF;
    index += 1
  ) {
    const angle =
      -Math.PI / 2 +
      (Math.PI * index) /
        CAPSULE_SEGMENTS_PER_HALF

    points.push({
      x:
        rightCenterX +
        Math.cos(angle) * radius,
      y:
        centerY +
        Math.sin(angle) * radius,
    })
  }

  for (
    let index = 0;
    index <= CAPSULE_SEGMENTS_PER_HALF;
    index += 1
  ) {
    const angle =
      Math.PI / 2 +
      (Math.PI * index) /
        CAPSULE_SEGMENTS_PER_HALF

    points.push({
      x:
        leftCenterX +
        Math.cos(angle) * radius,
      y:
        centerY +
        Math.sin(angle) * radius,
    })
  }

  return points
}

function getEllipsePoints(
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  segments: number,
): readonly Point[] {
  return Array.from(
    { length: segments },
    (_, index) => {
      const angle =
        (Math.PI * 2 * index) /
        segments

      return {
        x:
          centerX +
          Math.cos(angle) * radiusX,
        y:
          centerY +
          Math.sin(angle) * radiusY,
      }
    },
  )
}

function getClosedSvgPath(
  points: readonly Point[],
): string {
  if (points.length < 3) {
    throw new Error(
      'FLOW_NODE_GEOMETRY_REQUIRES_THREE_POINTS',
    )
  }

  const firstPoint = points[0]

  if (!firstPoint) {
    throw new Error('FLOW_NODE_GEOMETRY_EMPTY')
  }

  return [
    \`M \${formatNumber(firstPoint.x)} \${formatNumber(firstPoint.y)}\`,
    ...points
      .slice(1)
      .map(
        ({ x, y }) =>
          \`L \${formatNumber(x)} \${formatNumber(y)}\`,
      ),
    'Z',
  ].join(' ')
}

function formatNumber(value: number): string {
  return Number(value.toFixed(3)).toString()
}

function isSafeCssColor(
  value: string,
): boolean {
  return (
    /^#[0-9a-f]{6}$/iu.test(value) ||
    /^#[0-9a-f]{8}$/iu.test(value)
  )
}
`

  update(path, next)
}

/**
 * 当前 ScientificChartShapeUtil 使用固定 values 数组。
 *
 * 这不是完整 scientific plot 能力，因此在 Dataset repository、Worker、
 * revision 和 LOD 管线完成前，不应继续出现在正式 composition root 中。
 *
 * 保留 feature 包源码，不创建 legacy fallback，也不注册第二种图表实现。
 */
function quarantinePrototypeScientificPlot() {
  const path = resolve(
    root,
    'apps/desktop/src/bootstrap/application.ts',
  )

  let source = read(path)

  source = replaceExactlyOnce(
    source,
    `import { scientificPlotExtension } from '@hybrid-canvas/scientific-plot'\n`,
    '',
    'scientific plot production import',
  )

  source = replaceExactlyOnce(
    source,
    `      flowchartExtension,
      freehandExtension,
      scientificPlotExtension,
`,
    `      flowchartExtension,
      freehandExtension,
`,
    'scientific plot production registration',
  )

  update(path, source)
}

function removePrototypeChartToolbarEntry() {
  const path = resolve(
    root,
    'editor/core/src/react/CanvasToolbar.tsx',
  )

  let source = read(path)

  source = replaceExactlyOnce(
    source,
    `  ChartLine,
`,
    '',
    'scientific chart toolbar icon',
  )

  source = replaceExactlyOnce(
    source,
    `  {
    id: 'scientific-chart',
    label: '图表',
    shortcut: 'C',
    icon: ChartLine,
  },
`,
    '',
    'scientific chart toolbar entry',
  )

  update(path, source)
}

function formatChangedFiles() {
  const paths = [...changedFiles.keys()].map(
    (path) => relative(root, path),
  )

  if (paths.length === 0) {
    fail('脚本没有产生任何修改。')
  }

  run('pnpm', [
    'exec',
    'biome',
    'format',
    '--write',
    ...paths,
  ])
}

/**
 * 格式化之后再次检查关键不变量。
 */
function verifyChangedSource() {
  const flowNode = read(
    resolve(
      root,
      'features/flowchart/src/shapes/FlowNodeShapeUtil.tsx',
    ),
  )

  const application = read(
    resolve(
      root,
      'apps/desktop/src/bootstrap/application.ts',
    ),
  )

  const toolbar = read(
    resolve(
      root,
      'editor/core/src/react/CanvasToolbar.tsx',
    ),
  )

  assertAbsent(
    flowNode,
    'T.string as T.Validator<FlowNodeType>',
    '伪造的 FlowNode 枚举 validator 仍然存在',
  )

  assertAbsent(
    flowNode,
    '<foreignObject',
    'FlowNode SVG 导出仍使用 foreignObject',
  )

  assertAbsent(
    flowNode,
    'clipPath:',
    'FlowNode 仍存在独立 CSS clip-path 几何',
  )

  assertPresent(
    flowNode,
    'T.literalEnum(...FLOW_NODE_TYPES)',
    'FlowNode 没有使用运行时枚举校验',
  )

  assertPresent(
    flowNode,
    'new Polygon2d({',
    'FlowNode 没有使用真实多边形几何',
  )

  assertPresent(
    flowNode,
    'getFlowNodePoints(',
    'FlowNode 没有统一几何来源',
  )

  assertAbsent(
    application,
    'scientificPlotExtension',
    '科学图表原型仍注册在 production composition root',
  )

  assertAbsent(
    toolbar,
    "id: 'scientific-chart'",
    '科学图表原型仍暴露在正式工具栏',
  )
}

function verifyProject() {
  run('pnpm', ['typecheck'])
  run('pnpm', ['lint'])
  run('pnpm', ['test'])
  run('pnpm', ['test:architecture'])
  run('pnpm', ['build:desktop'])
}

function assertPresent(
  source,
  expected,
  message,
) {
  if (!source.includes(expected)) {
    fail(message)
  }
}

function assertAbsent(
  source,
  forbidden,
  message,
) {
  if (source.includes(forbidden)) {
    fail(message)
  }
}

function read(path) {
  return readFileSync(path, 'utf8')
}

function update(path, nextContent) {
  if (!changedFiles.has(path)) {
    changedFiles.set(path, read(path))
  }

  writeFileSync(path, nextContent, 'utf8')

  console.log(
    `修改：${relative(root, path)}`,
  )
}

function replaceExactlyOnce(
  source,
  oldText,
  newText,
  label,
) {
  const firstIndex = source.indexOf(oldText)

  if (firstIndex < 0) {
    fail(
      [
        `没有找到预期源码：${label}`,
        '',
        '目标文件可能已经修改。',
        '脚本拒绝猜测或模糊替换。',
      ].join('\n'),
    )
  }

  const secondIndex = source.indexOf(
    oldText,
    firstIndex + oldText.length,
  )

  if (secondIndex >= 0) {
    fail(
      `预期源码出现多次，拒绝修改：${label}`,
    )
  }

  return (
    source.slice(0, firstIndex) +
    newText +
    source.slice(
      firstIndex + oldText.length,
    )
  )
}

function rollback() {
  const failures = []

  for (const [path, original] of changedFiles) {
    try {
      writeFileSync(path, original, 'utf8')

      console.error(
        `已恢复：${relative(root, path)}`,
      )
    } catch (error) {
      failures.push({
        path,
        error,
      })
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(
      failures.map(({ error }) => error),
      '部分文件恢复失败',
    )
  }
}

function run(command, arguments_) {
  console.log(
    `\n> ${command} ${arguments_.join(' ')}`,
  )

  execFileSync(command, arguments_, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
}

function capture(command, arguments_) {
  return execFileSync(command, arguments_, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
}

function fail(message) {
  throw new Error(message)
}