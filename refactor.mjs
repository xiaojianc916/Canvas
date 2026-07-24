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

source = source.replace(
  /^\s*isValidElement,\s*\n/m,
  '',
)

source = source.replace(
  /import type \{\s*ReactNode,\s*\} from 'react'/,
  `import {
  isValidElement,
  type ReactNode,
} from 'react'`,
)

if (
  !source.includes(
    "import {\n  isValidElement,\n  type ReactNode,\n} from 'react'",
  )
) {
  throw new Error(
    '没有成功把 isValidElement 改为从 React 导入。',
  )
}

await writeFile(
  filePath,
  source.trimEnd() + '\n',
  'utf8',
)

console.log(
  '已修复 isValidElement 导入。',
)