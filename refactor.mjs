import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const filePath = path.join(
  process.cwd(),
  'editor/core/src/react/CanvasTransformStatus.tsx',
)

let source = await readFile(filePath, 'utf8')

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
 * 原布局：
 *
 * 12px 标签 | 可伸缩数值列 | 10px 单位列
 *
 * 可伸缩数值列会占据所有剩余空间，
 * 所以 0 和 ° 被推到字段两侧。
 *
 * 新布局：
 *
 * 12px 标签 | 数值自然宽度 | 单位自然宽度 | 剩余空间
 *
 * 这样 ° 会始终跟在数字后面。
 */
section = section.replaceAll(
  'grid-cols-[12px_minmax(0,1fr)_10px]',
  'grid-cols-[12px_auto_auto_minmax(0,1fr)]',
)

/*
 * 编辑态 input 需要明确的紧凑宽度，
 * 避免 auto 列使用浏览器默认 number input 宽度。
 */
section = section.replace(
  /\bmin-w-0 w-full appearance-none\b/g,
  'min-w-0 w-[48px] appearance-none',
)

/*
 * 单位列不再占固定的 10px，
 * 并取消它与数字之间额外的 Grid gap。
 */
section = section.replace(
  `className="
            overflow-hidden text-left
            font-sans text-[10px]
            text-muted-foreground/75
          "`,
  `className="
            -ml-1 whitespace-nowrap text-left
            font-sans text-[10px]
            text-muted-foreground/75
          "`,
)

section = section.replace(
  `className="
          overflow-hidden text-left
          font-sans text-[10px]
          text-muted-foreground/75
        "`,
  `className="
          -ml-1 whitespace-nowrap text-left
          font-sans text-[10px]
          text-muted-foreground/75
        "`,
)

if (
  section.includes(
    'grid-cols-[12px_minmax(0,1fr)_10px]',
  )
) {
  throw new Error(
    '旧的单位列布局仍然存在。',
  )
}

if (
  !section.includes(
    'grid-cols-[12px_auto_auto_minmax(0,1fr)]',
  )
) {
  throw new Error(
    '没有成功写入紧凑的数字单位布局。',
  )
}

source =
  source.slice(0, startIndex) +
  section +
  source.slice(endIndex)

await writeFile(
  filePath,
  source,
  'utf8',
)

console.log('')
console.log('旋转角度单位间距已修复：')
console.log('- ° 不再固定在字段右边缘')
console.log('- ° 始终紧跟旋转数值')
console.log('- 编辑态和显示态使用相同布局')
console.log('- 字段总宽度仍然固定，不会产生状态栏抖动')
console.log('')
console.log('请运行：')
console.log('  pnpm format')
console.log('  pnpm typecheck')
console.log('')