// apply-tldraw-license.mjs
// 使用方式：将此文件放到仓库根目录，然后执行：
// node apply-tldraw-license.mjs

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const targetPath = resolve('editor/core/src/react/EditorCanvas.tsx')

const licenseKey =
  'tldraw-2026-10-28/WyJKRWdfbFdwZyIsWyIqIl0sMTYsIjIwMjYtMTAtMjgiXQ.lmi81fI8OPFbKs0/HJEW9FHFXxwCvSb/rS29gNvSO9+nXHlk/d62Tg4yzjBBRqfIqNb5Bcuo1lhf/JZ3DOeuYw'

const constantName = 'TLDRAW_LICENSE_KEY'

let source

try {
  source = await readFile(targetPath, 'utf8')
} catch (error) {
  console.error(`❌ 无法读取文件：${targetPath}`)
  console.error(error)
  process.exit(1)
}

let nextSource = source

// 添加许可证常量。
if (!nextSource.includes(`const ${constantName} =`)) {
  const importAnchor =
    "import { useBindEditorSession, useEditor } from './editor-context'"

  if (!nextSource.includes(importAnchor)) {
    console.error('❌ 未找到预期的 import 位置，文件结构可能已经改变。')
    process.exit(1)
  }

  nextSource = nextSource.replace(
    importAnchor,
    `${importAnchor}

const ${constantName} =
  '${licenseKey}'`,
  )
}

// 给 TldrawProps 添加 licenseKey。
if (!nextSource.includes(`licenseKey: ${constantName}`)) {
  const propsAnchor = `    const base: TldrawProps = {
      hideUi: true,`

  if (!nextSource.includes(propsAnchor)) {
    console.error('❌ 未找到 TldrawProps 配置位置，文件结构可能已经改变。')
    process.exit(1)
  }

  nextSource = nextSource.replace(
    propsAnchor,
    `    const base: TldrawProps = {
      hideUi: true,
      licenseKey: ${constantName},`,
  )
}

if (nextSource === source) {
  console.log('✅ tldraw 许可证密钥已经配置，无需重复修改。')
  process.exit(0)
}

await writeFile(`${targetPath}.bak`, source, 'utf8')
await writeFile(targetPath, nextSource, 'utf8')

console.log('✅ 已配置 tldraw 许可证密钥。')
console.log(`📄 修改文件：${targetPath}`)
console.log(`💾 原文件备份：${targetPath}.bak`)
console.log('')
console.log('请运行以下命令检查：')
console.log('  pnpm typecheck')
console.log('  pnpm build:desktop')