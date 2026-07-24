#!/usr/bin/env node

import {
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const filePath = path.join(
  process.cwd(),
  'editor/core/src/react/PropertiesInspectorContent.tsx',
)

let source = (
  await readFile(
    filePath,
    'utf8',
  )
).replaceAll(
  '\r\n',
  '\n',
)

const oldCode = `<TldrawUiIcon
        icon={item.icon}
        label={label}
      />`

const newCode = `{typeof item.icon === 'string' ? (
        <TldrawUiIcon
          icon={item.icon as TLUiIconType}
          label={label}
        />
      ) : (
        item.icon
      )}`

if (
  !source.includes(oldCode)
) {
  throw new Error(
    '没有找到 ActionButton 中待修复的 TldrawUiIcon。',
  )
}

source = source.replace(
  oldCode,
  newCode,
)

await writeFile(
  filePath,
  source.trimEnd() + '\n',
  'utf8',
)

console.log(
  '已修复官方 Action 图标的联合类型处理。',
)