#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { relative, resolve } from 'node:path'

const root = resolve(process.argv[2] ?? '.')
const expectedHead =
  process.env.EXPECTED_HEAD ??
  '5e246c3abdf1f9ccf559bce1c7c2164783c5df0d'

const changedFiles = new Map()

main().catch((error) => {
  console.error(error)

  if (changedFiles.size > 0) {
    console.error('\n验证失败，正在恢复脚本修改……')
    rollback()
  }

  process.exit(1)
})

async function main() {
  assertRepository()
  assertCleanWorktree()
  assertReviewedHead()

  replaceFlowNodeImplementation()
  quarantinePrototypeScientificPlot()
  removePrototypeChartToolbarEntry()

  formatChangedFiles()
  verify()

  console.log('\nP1 tldraw-first 修复已完成：')

  for (const path of changedFiles.keys()) {
    console.log(`- ${relative(root, path)}`)
  }

  console.log(`
已完成：
- FlowNode 使用统一的视觉、命中、Binding、Indicator 和导出几何
- nodeType 使用真实运行时枚举校验
- SVG 导出不再依赖 foreignObject
- 未完成 Dataset/Worker 管线的科学图表已退出 production composition
- 工具栏不再暴露固定演示数据功能

科学图表重新启用前必须满足：
- Shape 只保存 datasetId、datasetRevision 和轻量 ChartSpec
- 大型 Dataset 位于 TLStore 外部
- 计算进入 Worker
- 结果带输入 revision，过期结果不可提交
- 具备 LOD、取消、超时和资源预算
- SVG/PNG 导出使用同一 ChartSpec 和 Dataset revision
`)
}

/**
 * 使用唯一的几何函数驱动：
 *
 * - tldraw hit testing
 * - selection bounds
 * - arrow binding
 * - React rendering
 * - selection indicator
 * - SVG export
 *
 * 不再允许“CSS 看起来是菱形，但 tldraw 认为它是矩形”。
 */
function replaceFlowNodeImplementation() {
  const path = resolve(
    root,
    'features/flowchart/src/shapes/FlowNodeShapeUtil.tsx',
  )

  const expectedMarker =
    "nodeType: T.string as T.Validator<FlowNodeType>"

  const current = read(path)

  if (!current.includes(expectedMarker)) {
    fail(
      [
        'FlowNodeShapeUtil 已发生变化，拒绝覆盖。',
        `缺少审查时的源码标记：${expectedMarker}`,
        '请重新审查该文件后再更新迁移脚本。',
      ].join('\n'),
    )
  }

  const next = `import { T } from '@tldraw/validate'
import type { ReactElement } from 'react'
import {
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

export type FlowNodeType = (typeof FLOW_NODE_TYPES)[number]

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
    const { label, nodeType, w, h, color } =
      shape.props

    const path = getClosedSvgPath(
      getFlowNodePoints(nodeType, w, h),
    )

    return (
      <svg
        aria-label={label}
        height={h}
        role="img"
        style={{
          display: 'block',
          overflow: 'visible',
          pointerEvents: 'none',
        }}
        viewBox={\`0 0 \${w} \${h}\`}
        width={w}
      >
        <path
          d={path}
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

    const path = new Path2D()

    path.moveTo(points[0].x, points[0].y)

    for (let index = 1; index < points.length; index += 1) {
      path.lineTo(points[index].x, points[index].y)
    }

    path.closePath()

    return path
  }

  override toSvg(
    shape: FlowNodeShape,
  ): ReactElement {
    const { label, nodeType, w, h, color } =
      shape.props

    return (
      <g>
        <path
          d={getClosedSvgPath(
            getFlowNodePoints(nodeType, w, h),
          )}
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
  const radius = Math.min(height / 2, width / 2)
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

  const points = []

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
      x: rightCenterX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
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
      x: leftCenterX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
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
        (Math.PI * 2 * index) / segments

      return {
        x: centerX + Math.cos(angle) * radiusX,
        y: centerY + Math.sin(angle) * radiusY,
      }
    },
  )
}

function getClosedSvgPath(
  points: readonly Point[],
): string {
  if (points.length < 3) {
    throw new Error('FLOW_NODE_GEOMETRY_INVALID')
  }

  return [
    \`M \${formatNumber(points[0].x)} \${formatNumber(points[0].y)}\`,
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

function isSafeCssColor(value: string): boolean {
  /*
   * Persisted colors are intentionally restricted to deterministic,
   * self-contained CSS colors. This rejects url(), var(), gradients and other
   * context-dependent values entering from files or collaboration input.
   */
  return (
    /^#[0-9a-f]{6}$/iu.test(value) ||
    /^#[0-9a-f]{8}$/iu.test(value)
  )
}
`

  update(path, next)
}

/**
 * 当前 scientific chart 使用固定数组渲染，不使用 Dataset/ChartSpec，
 * 也没有 Worker、revision、取消或 LOD。
 *
 * 专业做法不是继续把演示数组包装成“图表系统”，而是在真实数据管线完成前
 * 将其退出 production composition。
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
    'scientific chart toolbar action',
  )

  update(path, source)
}

function formatChangedFiles() {
  const paths = [...changedFiles.keys()].map((path) =>
    relative(root, path),
  )

  run('pnpm', [
    'exec',
    'biome',
    'format',
    '--write',
    ...paths,
  ])
}

function verify() {
  run('pnpm', ['typecheck'])
  run('pnpm', ['lint'])
  run('pnpm', ['test'])
  run('pnpm', ['test:architecture'])
  run('pnpm', ['build:desktop'])
}

function assertRepository() {
  const required = [
    '.git',
    'package.json',
    'apps/desktop/src/bootstrap/application.ts',
    'editor/core/src/react/CanvasToolbar.tsx',
    'features/flowchart/src/shapes/FlowNodeShapeUtil.tsx',
  ]

  for (const item of required) {
    if (!existsSync(resolve(root, item))) {
      fail(`缺少必要路径：${item}`)
    }
  }
}

function assertCleanWorktree() {
  const status = capture('git', [
    'status',
    '--porcelain',
  ])

  if (status.trim()) {
    fail(
      [
        '工作区不干净，拒绝执行迁移。',
        '请先提交或暂存现有修改。',
        '',
        status,
      ].join('\n'),
    )
  }
}

function assertReviewedHead() {
  const actualHead = capture('git', [
    'rev-parse',
    'HEAD',
  ]).trim()

  if (actualHead !== expectedHead) {
    fail(
      [
        '当前提交与审查基线不一致。',
        `审查基线：${expectedHead}`,
        `当前提交：${actualHead}`,
        '',
        '如已人工复核新提交，可通过 EXPECTED_HEAD 指定新 SHA。',
      ].join('\n'),
    )
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
  console.log(`修改：${relative(root, path)}`)
}

function replaceExactlyOnce(
  source,
  oldText,
  newText,
  label,
) {
  const first = source.indexOf(oldText)

  if (first < 0) {
    fail(`没有找到预期源码：${label}`)
  }

  const second = source.indexOf(
    oldText,
    first + oldText.length,
  )

  if (second >= 0) {
    fail(`预期源码不唯一：${label}`)
  }

  return (
    source.slice(0, first) +
    newText +
    source.slice(first + oldText.length)
  )
}

function rollback() {
  for (const [path, original] of changedFiles) {
    writeFileSync(path, original, 'utf8')
    console.error(`已恢复：${relative(root, path)}`)
  }
}

function run(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`)

  execFileSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
}

function capture(command, args) {
  return execFileSync(command, args, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
}

function fail(message) {
  throw new Error(message)
}