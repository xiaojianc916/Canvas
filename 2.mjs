import {
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const target = path.join(
  process.cwd(),
  '1.mjs',
)

let source = await readFile(
  target,
  'utf8',
)

const startMarker =
  'async function cleanTransformStatus() {'

const endMarker =
  'async function cleanTransformGeometry() {'

const start = source.indexOf(startMarker)
const end = source.indexOf(
  endMarker,
  start,
)

if (start === -1 || end === -1) {
  throw new Error(
    '找不到 cleanTransformStatus 函数区域。',
  )
}

const replacement = String.raw`async function cleanTransformStatus() {
  let source = await readFile(
    files.transformStatus,
    'utf8',
  )

  /*
   * 不匹配整个 TransformGroup，避免受格式化和空行影响。
   * 这里只替换唯一的旧 title 属性。
   */
  if (
    source.includes(
      'title="页面轴对齐包围盒"',
    )
  ) {
    const boundsTitle = [
      'title={',
      '              snapshot.hasMixedRotation',
      "                ? '页面轴对齐包围盒'",
      "                : '选择包围盒'",
      '            }',
    ].join('\n')

    source = source.replace(
      'title="页面轴对齐包围盒"',
      boundsTitle,
    )
  }

  /*
   * 删除任意数量的连续重复分隔线。
   * 仅处理中间没有其他内容的 StatusDivider。
   */
  while (
    /<StatusDivider\s*\/>\s*<StatusDivider\s*\/>/.test(
      source,
    )
  ) {
    source = source.replace(
      /<StatusDivider\s*\/>\s*<StatusDivider\s*\/>/,
      '<StatusDivider />',
    )
  }

  /*
   * 清理脚本替换残留的多余空行和行尾空格。
   */
  source = collapseExcessBlankLines(source)

  if (
    source.includes(
      'title="页面轴对齐包围盒"',
    )
  ) {
    throw new Error(
      'CanvasTransformStatus 仍存在旧的静态 bounds 文案。',
    )
  }

  if (
    !source.includes(
      "'选择包围盒'",
    )
  ) {
    throw new Error(
      'CanvasTransformStatus 缺少新的选择包围盒文案。',
    )
  }

  if (
    /<StatusDivider\s*\/>\s*<StatusDivider\s*\/>/.test(
      source,
    )
  ) {
    throw new Error(
      'CanvasTransformStatus 仍存在连续重复分隔线。',
    )
  }

  await writeFile(
    files.transformStatus,
    source,
    'utf8',
  )
}

`

source =
  source.slice(0, start) +
  replacement +
  source.slice(end)

await writeFile(
  target,
  source,
  'utf8',
)

console.log(
  '已修复 1.mjs 中过度严格的 TransformStatus 匹配。',
)