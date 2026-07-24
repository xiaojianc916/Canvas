import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const filePath = path.join(
  process.cwd(),
  'editor/core/src/react/CanvasTransformStatus.tsx',
)

let source = await readFile(filePath, 'utf8')

source = replaceRequired(
  source,
  `import type {
  FocusEvent,
  KeyboardEvent,
} from 'react'`,
  `import type {
  FocusEvent,
  KeyboardEvent,
  ReactNode,
} from 'react'`,
  '补充 ReactNode 类型导入',
)

source = replaceRequired(
  source,
  `  readonly children: React.ReactNode`,
  `  readonly children: ReactNode`,
  '修正 ReactNode 类型引用',
)

source = replaceRequired(
  source,
  `      case 'rotation': {
        return
      }
`,
  '',
  '删除不可达的 rotation 分支',
)

source = replaceRequired(
  source,
  `          <TldrawUiIcon
            icon={icon}
            small
          />`,
  `          <TldrawUiIcon
            icon={icon}
            label={label}
            small
          />`,
  '补充 Transform 分组图标标签',
)

source = replaceRequired(
  source,
  `      <TldrawUiIcon
        icon={locked ? 'lock' : 'unlock'}
        small
      />`,
  `      <TldrawUiIcon
        icon={locked ? 'lock' : 'unlock'}
        label={title}
        small
      />`,
  '补充宽高比锁定图标标签',
)

source = replaceRequired(
  source,
  `      <TldrawUiIcon
        icon={icon}
        small
      />`,
  `      <TldrawUiIcon
        icon={icon}
        label={label}
        small
      />`,
  '补充状态图标标签',
)

await writeFile(filePath, source, 'utf8')

console.log('CanvasTransformStatus.tsx 修复完成：')
console.log('- 删除不可达的 rotation switch 分支')
console.log('- 为所有 TldrawUiIcon 补充 label')
console.log('- 修正 ReactNode 类型引用')
console.log('')
console.log('请运行：')
console.log('  pnpm format')
console.log('  pnpm typecheck')

function replaceRequired(source, oldText, newText, description) {
  if (!source.includes(oldText)) {
    throw new Error(`无法执行：${description}。没有找到预期代码。`)
  }

  return source.replace(oldText, newText)
}