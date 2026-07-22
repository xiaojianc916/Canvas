// scripts/keep-active-sidebar-icon-color.mjs

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const filePath = resolve(
  process.cwd(),
  'features/workspace/src/presentation/shell/ActivityRail.tsx',
)

let source = await readFile(filePath, 'utf8')

const oldCode = `? ['relative size-9', 'bg-sidebar-accent', 'text-primary', 'hover:bg-sidebar-accent'].join(' ')`

const newCode = `? [
        'relative size-9',
        'bg-sidebar-accent',
        'text-muted-foreground',
        'hover:bg-sidebar-accent',
      ].join(' ')`

if (!source.includes(oldCode)) {
  throw new Error('没有找到侧边栏激活图标的 text-primary 样式。')
}

source = source.replace(oldCode, newCode)

await writeFile(filePath, source, 'utf8')

console.log('已保持侧边栏图标激活前后的颜色一致。')