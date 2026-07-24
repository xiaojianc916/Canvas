import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const filePath = path.join(
  process.cwd(),
  'editor/core/src/react/CanvasTransformStatus.tsx',
)

let source = await readFile(filePath, 'utf8')

source = moveAspectRatioButtonToEnd(source)
source = compactSelectionCount(source)
source = compactTransformFields(source)

await writeFile(filePath, source, 'utf8')

console.log('')
console.log('底部 Transform 布局已优化：')
console.log('- 宽高比按钮移至 Transform 信息最右侧')
console.log('- X/Y/W/H/R 与数值改为紧凑左对齐')
console.log('- Transform 字段宽度调整为 88px')
console.log('- “1 个对象”宽度调整为 56px')
console.log('- 保留固定槽位，快速变化时不会左右抖动')
console.log('')
console.log('请运行：')
console.log('  pnpm format')
console.log('  pnpm typecheck')
console.log('')

function moveAspectRatioButtonToEnd(source) {
  /*
   * 从 W 和 H 中间取出宽高比按钮。
   */
  const aspectButtonPattern =
    /\n\s*<AspectRatioLockButton\s*\n\s*disabled=\{\s*!snapshot\.canResize\s*\|\|\s*snapshot\.hasForcedAspectRatio\s*\}\s*\n\s*forced=\{snapshot\.hasForcedAspectRatio\}\s*\n\s*locked=\{isAspectRatioLocked\}\s*\n\s*onChange=\{setUserAspectRatioLocked\}\s*\n\s*\/>/

  const match = source.match(
    aspectButtonPattern,
  )

  if (!match) {
    /*
     * 如果脚本曾执行过，按钮可能已经移动到末尾。
     */
    const buttonOccurrences =
      source.match(
        /<AspectRatioLockButton/g,
      )?.length ?? 0

    if (buttonOccurrences === 1) {
      return source
    }

    throw new Error(
      '找不到宽高比按钮，或存在多个宽高比按钮。',
    )
  }

  source = source.replace(
    aspectButtonPattern,
    '',
  )

  const closingMarker =
    '\n        </>\n      ) : null}'

  const insertionIndex =
    source.lastIndexOf(closingMarker)

  if (insertionIndex === -1) {
    throw new Error(
      '找不到 Transform 状态内容结束位置。',
    )
  }

  const aspectButtonAtEnd = `

          <StatusDivider />

          <AspectRatioLockButton
            disabled={
              !snapshot.canResize ||
              snapshot.hasForcedAspectRatio
            }
            forced={snapshot.hasForcedAspectRatio}
            locked={isAspectRatioLocked}
            onChange={setUserAspectRatioLocked}
          />`

  source =
    source.slice(0, insertionIndex) +
    aspectButtonAtEnd +
    source.slice(insertionIndex)

  const occurrences =
    source.match(
      /<AspectRatioLockButton/g,
    )?.length ?? 0

  if (occurrences !== 1) {
    throw new Error(
      '宽高比按钮移动后数量异常：' +
        String(occurrences),
    )
  }

  return source
}

function compactSelectionCount(source) {
  const startMarker =
    'function SelectionCount('

  const endMarker =
    '\ninterface TransformGroupProps'

  const startIndex =
    source.indexOf(startMarker)

  const endIndex =
    source.indexOf(
      endMarker,
      startIndex,
    )

  if (
    startIndex === -1 ||
    endIndex === -1
  ) {
    throw new Error(
      '找不到 SelectionCount 组件。',
    )
  }

  const section = source.slice(
    startIndex,
    endIndex,
  )

  let nextSection = section

  /*
   * 兼容前几版脚本可能产生的 68、76 或 96px。
   */
  nextSection = nextSection.replace(
    /h-6 w-\[(?:68|76|96)px\] shrink-0/g,
    'h-6 w-[56px] shrink-0',
  )

  nextSection = nextSection.replace(
    /items-center\s+overflow-hidden px-1\.5/g,
    'items-center overflow-hidden px-1',
  )

  if (
    !nextSection.includes(
      'w-[56px]',
    )
  ) {
    throw new Error(
      '没有成功收紧对象数量宽度。',
    )
  }

  return (
    source.slice(0, startIndex) +
    nextSection +
    source.slice(endIndex)
  )
}

function compactTransformFields(source) {
  const startMarker =
    'function InlineTransformField('

  const endMarker =
    '\ninterface AspectRatioLockButtonProps'

  const startIndex =
    source.indexOf(startMarker)

  const endIndex =
    source.indexOf(
      endMarker,
      startIndex,
    )

  if (
    startIndex === -1 ||
    endIndex === -1
  ) {
    throw new Error(
      '找不到 InlineTransformField 组件。',
    )
  }

  let section = source.slice(
    startIndex,
    endIndex,
  )

  /*
   * 固定宽度仍保留，但从 96px 收紧到 88px。
   */
  section = section.replace(
    /h-6 w-\[(?:76|88|96)px\] shrink-0/g,
    'h-6 w-[88px] shrink-0',
  )

  /*
   * 数值不再靠字段右边缘对齐。
   *
   * X 229.33
   * 而不是：
   * X             229.33
   */
  section = section.replaceAll(
    'text-right font-mono',
    'text-left font-mono',
  )

  section = section.replaceAll(
    'text-right font-mono text-[11px]',
    'text-left font-mono text-[11px]',
  )

  /*
   * 兼容 Tailwind class 被格式化成不同顺序。
   */
  section = section.replace(
    /\btext-right\b/g,
    'text-left',
  )

  /*
   * 标签列从 14px 调整为 12px，
   * 标签与数值之间只保留正常的 4px gap。
   */
  section = section.replaceAll(
    'grid-cols-[14px_minmax(0,1fr)_10px]',
    'grid-cols-[12px_minmax(0,1fr)_10px]',
  )

  if (
    section.includes('text-right')
  ) {
    throw new Error(
      'InlineTransformField 中仍有右对齐数值。',
    )
  }

  if (
    !section.includes(
      'w-[88px]',
    )
  ) {
    throw new Error(
      '没有成功调整 Transform 字段宽度。',
    )
  }

  return (
    source.slice(0, startIndex) +
    section +
    source.slice(endIndex)
  )
}