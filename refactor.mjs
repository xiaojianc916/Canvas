import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const filePath = path.join(
  process.cwd(),
  'editor/core/src/react/CanvasTransformStatus.tsx',
)

let source = await readFile(filePath, 'utf8')

/*
 * TldrawUiIcon 依赖 tldraw UI 内部的 AssetUrls Provider。
 * CanvasTransformStatus 位于 Workspace 状态栏，不在该 Provider 内。
 */
source = source.replace(
  /import\s*\{\s*TldrawUiIcon,\s*useValue,\s*\}\s*from\s*'tldraw'/m,
  "import { useValue } from 'tldraw'",
)

source = source.replace(
  /import\s*\{\s*useValue,\s*TldrawUiIcon,\s*\}\s*from\s*'tldraw'/m,
  "import { useValue } from 'tldraw'",
)

/*
 * 尺寸组已经有标准 W / H 图例，不再额外插入依赖 UI Context 的图标。
 */
source = source.replace(
  /(\s*)<TransformGroup\s*\n\s*icon="corners"\s*\n\s*label="尺寸"/g,
  '$1<TransformGroup\n$1  label="尺寸"',
)

/*
 * 删除 TransformGroup 的 icon 属性。
 */
source = source.replace(
  /\n\s*readonly icon\?: 'corners'/g,
  '',
)

source = source.replace(
  /,\s*\n\s*icon,\s*\n\}: TransformGroupProps\)/g,
  ',\n}: TransformGroupProps)',
)

/*
 * 删除 TransformGroup 内部的 TldrawUiIcon 渲染。
 */
source = source.replace(
  /\n\s*\{icon \? \(\s*<span[\s\S]*?<TldrawUiIcon[\s\S]*?<\/span>\s*\) : null\}\n/m,
  '\n',
)

/*
 * 比例锁定按钮改为专业的 W:H / W/H 图例。
 *
 * W:H = 保持宽高比
 * W/H = 宽高可独立修改
 */
source = source.replace(
  /<TldrawUiIcon\s*\n\s*icon=\{locked \? 'lock' : 'unlock'\}\s*\n\s*label=\{title\}\s*\n\s*small\s*\n\s*\/>/m,
  `<span
        aria-hidden="true"
        className="font-mono text-[9px] font-semibold tracking-[-0.08em]"
      >
        {locked ? 'W:H' : 'W/H'}
      </span>`,
)

/*
 * 状态文字本身已经明确表达“只读”和“已锁定”，
 * 不再使用依赖 tldraw Provider 的 lock 图标。
 */
source = source.replaceAll(
  `              <StatusState
                icon="lock"
                label="只读"
                title="当前画布为只读状态"
              />`,
  `              <StatusState
                label="只读"
                title="当前画布为只读状态"
              />`,
)

source = source.replaceAll(
  `              <StatusState
                icon="lock"
                label="已锁定"
                title="选择中包含锁定对象"
              />`,
  `              <StatusState
                label="已锁定"
                title="选择中包含锁定对象"
              />`,
)

source = source.replace(
  /\n\s*readonly icon: 'lock'/g,
  '',
)

source = source.replace(
  /function StatusState\(\{\s*\n\s*icon,\s*\n\s*label,\s*\n\s*title,\s*\n\}: StatusStateProps\)/m,
  `function StatusState({
  label,
  title,
}: StatusStateProps)`,
)

/*
 * 删除 StatusState 中残余的 TldrawUiIcon。
 */
source = source.replace(
  /\n\s*<TldrawUiIcon\s*\n\s*icon=\{icon\}\s*\n\s*label=\{label\}\s*\n\s*small\s*\n\s*\/>\n/m,
  '\n',
)

/*
 * 防止格式化结果不同导致上述精确替换没有覆盖。
 */
source = source.replace(
  /<TldrawUiIcon[\s\S]*?\/>/g,
  '',
)

/*
 * 清理可能残留的 icon 解构与类型。
 */
source = source.replace(
  /\n\s*readonly icon\?: 'corners'/g,
  '',
)

source = source.replace(
  /\n\s*readonly icon: 'lock'/g,
  '',
)

source = source.replace(
  /,\s*\n\s*icon,\s*\n/g,
  ',\n',
)

if (source.includes('TldrawUiIcon')) {
  throw new Error(
    'CanvasTransformStatus.tsx 中仍存在 TldrawUiIcon，请不要启动应用。',
  )
}

if (source.includes('icon="corners"')) {
  throw new Error(
    'CanvasTransformStatus.tsx 中仍存在 corners 图标引用。',
  )
}

await writeFile(filePath, source, 'utf8')

console.log('')
console.log('底部 Transform 状态栏运行时错误已修复：')
console.log('- 删除 Workspace 状态栏中的 TldrawUiIcon')
console.log('- 删除对 tldraw AssetUrls Provider 的隐式依赖')
console.log('- 保留 Editor、ShapeUtil、History 官方能力')
console.log('- 比例锁定改为 W:H / W/H 专业图例')
console.log('- 未使用 emoji 或自绘 SVG')
console.log('')
console.log('请运行：')
console.log('  pnpm format')
console.log('  pnpm typecheck')
console.log('')