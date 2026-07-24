#!/usr/bin/env node

import {
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

const files = [
  'features/flowchart/src/extension.ts',
  'features/freehand/src/extension.ts',
  'features/scientific-plot/src/extension.ts',
]

for (const relativePath of files) {
  const filePath = path.join(
    root,
    relativePath,
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

  /*
   * 把 type-only import 改为同时导入版本常量。
   */
  source = source.replace(
    /import type \{\s*HybridCanvasExtension\s*\} from '@hybrid-canvas\/canvas\/extensions'/,
    `import {
  HYBRID_CANVAS_EXTENSION_API_VERSION,
  type HybridCanvasExtension,
} from '@hybrid-canvas/canvas/extensions'`,
  )

  /*
   * 不再在 Feature 中硬编码 API 版本。
   */
  source = source.replace(
    /apiVersion:\s*['"][^'"]+['"]/,
    'apiVersion: HYBRID_CANVAS_EXTENSION_API_VERSION',
  )

  if (
    !source.includes(
      'apiVersion: HYBRID_CANVAS_EXTENSION_API_VERSION',
    )
  ) {
    throw new Error(
      `无法修复 ${relativePath} 的 apiVersion`,
    )
  }

  await writeFile(
    filePath,
    source.trimEnd() + '\n',
    'utf8',
  )

  console.log(
    `已修复 ${relativePath}`,
  )
}

console.log('')
console.log(
  'Extension API 版本不匹配已修复。',
)
console.log('')
console.log('请重新启动开发进程后验证：')
console.log('  pnpm typecheck')
console.log('  pnpm test:architecture')
console.log('  pnpm dev')