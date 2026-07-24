import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()

const transformStatusPath = path.join(
  ROOT,
  'editor/core/src/react/CanvasTransformStatus.tsx',
)

const workspaceContainerPath = path.join(
  ROOT,
  'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
)

await updateTransformStatus()
await removePageCount()

console.log('')
console.log('底部状态栏布局已调整：')
console.log('- 删除右侧页面数量')
console.log('- 压缩画布标题占用空间')
console.log('- 扩大 X / Y / W / H / R 数值空间')
console.log('- 删除 Transform 数值省略号')
console.log('- 保持各字段位置稳定')
console.log('')
console.log('请运行：')
console.log('  pnpm format')
console.log('  pnpm typecheck')
console.log('')

async function updateTransformStatus() {
  let source = await readFile(
    transformStatusPath,
    'utf8',
  )

  /*
   * 画布标题原来固定为 160px，明显浪费状态栏左侧空间。
   * 112px 足够完整显示“未命名画布”等常见标题。
   */
  source = source.replaceAll(
    'w-40 max-w-40 shrink-0 truncate px-1',
    'w-[112px] max-w-[112px] shrink-0 truncate px-1',
  )

  /*
   * 对象数量稍微扩大，避免两位、三位选择数量过早截断。
   */
  source = source.replaceAll(
    'h-6 w-[68px] shrink-0',
    'h-6 w-[76px] shrink-0',
  )

  /*
   * SelectionCount 不需要内部再做一次省略。
   */
  source = source.replace(
    `<span className="block w-full truncate">
        {label}
      </span>`,
    `<span className="block w-full whitespace-nowrap">
        {label}
      </span>`,
  )

  /*
   * 数值字段从 76px 扩展到 96px。
   *
   * 字段内部还包含：
   * - X/Y/W/H/R 标签
   * - Grid gap
   * - 角度单位槽
   * - 左右 padding
   *
   * 76px 实际留给数字的空间太小。
   */
  source = source.replaceAll(
    'h-6 w-[76px] shrink-0',
    'h-6 w-[96px] shrink-0',
  )

  /*
   * 删除静态数值的省略号。
   */
  source = source.replace(
    `className="
          block min-w-0 overflow-hidden
          text-ellipsis whitespace-nowrap
          text-right font-mono
          text-foreground/85
        "`,
    `className="
          block min-w-0 whitespace-nowrap
          text-right font-mono
          text-foreground/85
        "`,
  )

  /*
   * 防止 pnpm format 改变换行后导致精确替换未命中。
   */
  source = source.replace(
    /\bmin-w-0\s+overflow-hidden\s+text-ellipsis\s+whitespace-nowrap\s+text-right\s+font-mono\b/g,
    'min-w-0 whitespace-nowrap text-right font-mono',
  )

  source = source.replace(
    /\boverflow-hidden\s+text-ellipsis\s+whitespace-nowrap\s+text-right\b/g,
    'whitespace-nowrap text-right',
  )

  if (source.includes('text-ellipsis')) {
    throw new Error(
      'CanvasTransformStatus.tsx 中仍存在 Transform 数值省略号样式。',
    )
  }

  if (
    !source.includes(
      'w-[112px] max-w-[112px]',
    )
  ) {
    throw new Error(
      '没有成功调整画布标题宽度。',
    )
  }

  if (
    !source.includes(
      'h-6 w-[96px] shrink-0',
    )
  ) {
    throw new Error(
      '没有成功调整 Transform 字段宽度。',
    )
  }

  await writeFile(
    transformStatusPath,
    source,
    'utf8',
  )
}

async function removePageCount() {
  let source = await readFile(
    workspaceContainerPath,
    'utf8',
  )

  /*
   * 删除 WorkspaceShell 的右侧页面计数。
   */
  source = source.replace(
    /\n\s*statusRight=\{<CanvasStatusRightContent pageCount=\{pages\.length\} \/>\}/,
    '',
  )

  /*
   * 删除已经没有消费者的页面计数组件。
   */
  source = source.replace(
    /\nfunction CanvasStatusRightContent\(\{\s*pageCount\s*\}:\s*\{\s*readonly pageCount:\s*number\s*\}\)\s*\{\s*return pageCount > 0 \? <span>\{pageCount\} 个页面<\/span> : null\s*\}\n/m,
    '\n',
  )

  /*
   * 兼容格式化后的多行版本。
   */
  source = source.replace(
    /\nfunction CanvasStatusRightContent[\s\S]*?\n\}\n\n(?=function createUntitledCanvasTitle)/m,
    '\n',
  )

  if (
    source.includes(
      'CanvasStatusRightContent',
    )
  ) {
    throw new Error(
      'WorkspaceContainer.tsx 中仍存在 CanvasStatusRightContent。',
    )
  }

  if (
    source.includes(
      'statusRight={<CanvasStatusRightContent',
    )
  ) {
    throw new Error(
      'WorkspaceShell 中仍然挂载了页面数量。',
    )
  }

  await writeFile(
    workspaceContainerPath,
    source,
    'utf8',
  )
}