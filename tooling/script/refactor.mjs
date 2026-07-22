// apply-tldraw-license-clean.mjs
// 放在仓库根目录执行：
// node apply-tldraw-license-clean.mjs

import { readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'

const editorCanvasPath = resolve(
  'editor/core/src/react/EditorCanvas.tsx',
)

const editorPackagePath = resolve('editor/core/package.json')

const oldLicenseCheckPath = resolve(
  'editor/core/scripts/check-license.js',
)

const oldBackupPath = resolve(
  'editor/core/src/react/EditorCanvas.tsx.bak',
)

const licenseKey =
  'tldraw-2026-10-28/WyJKRWdfbFdwZyIsWyIqIl0sMTYsIjIwMjYtMTAtMjgiXQ.lmi81fI8OPFbKs0/HJEW9FHFXxwCvSb/rS29gNvSO9+nXHlk/d62Tg4yzjBBRqfIqNb5Bcuo1lhf/JZ3DOeuYw'

const constantName = 'TLDRAW_LICENSE_KEY'

async function updateEditorCanvas() {
  let source = await readFile(editorCanvasPath, 'utf8')

  /*
   * 删除已有许可证常量，确保不会保留旧密钥或产生重复定义。
   */
  source = source.replace(
    /(?:export\s+)?const\s+TLDRAW_LICENSE_KEY\s*=\s*(?:\r?\n\s*)?(['"`])[\s\S]*?\1\s*;?\s*/g,
    '',
  )

  /*
   * 删除 TldrawProps 中已有的许可证配置，包括：
   *
   * licenseKey: process.env.xxx
   * licenseKey: import.meta.env.xxx
   * licenseKey: SOME_CONSTANT
   * licenseKey: '直接写入的旧密钥'
   */
  source = source.replace(
    /^\s*licenseKey\s*:\s*[^\n]+,?\r?\n/gm,
    '',
  )

  const importAnchor =
    "import { useBindEditorSession, useEditor } from './editor-context'"

  if (!source.includes(importAnchor)) {
    throw new Error(
      '未找到 EditorCanvas 的 import 插入位置，文件结构可能已经改变。',
    )
  }

  source = source.replace(
    importAnchor,
    `${importAnchor}

const ${constantName} =
  '${licenseKey}'`,
  )

  const propsAnchor = /(\s+hideUi:\s*true,\r?\n)/

  if (!propsAnchor.test(source)) {
    throw new Error(
      '未找到 TldrawProps 中的 hideUi 配置，文件结构可能已经改变。',
    )
  }

  source = source.replace(
    propsAnchor,
    `$1      licenseKey: ${constantName},\n`,
  )

  await writeFile(editorCanvasPath, source, 'utf8')

  console.log('✅ 已更新 EditorCanvas.tsx')
}

async function removeOldBuildCheck() {
  const packageSource = await readFile(editorPackagePath, 'utf8')
  const packageJson = JSON.parse(packageSource)

  const buildScript = packageJson.scripts?.build

  if (typeof buildScript === 'string') {
    const cleanedBuildScript = buildScript
      .replace(
        /\s*&&\s*node\s+(?:\.\/)?scripts\/check-license\.js/g,
        '',
      )
      .trim()

    packageJson.scripts.build = cleanedBuildScript
  }

  await writeFile(
    editorPackagePath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    'utf8',
  )

  console.log('✅ 已清除 package.json 中的旧许可证检查命令')
}

async function deleteOldFiles() {
  await rm(oldLicenseCheckPath, {
    force: true,
  })

  await rm(oldBackupPath, {
    force: true,
  })

  console.log('✅ 已删除旧 check-license.js')
  console.log('✅ 已删除旧 EditorCanvas.tsx.bak')
}

const ignoredDirectories = new Set([
  '.git',
  '.turbo',
  '.vite',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'target',
])

const searchableExtensions = new Set([
  '.cjs',
  '.js',
  '.json',
  '.jsx',
  '.mjs',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
])

async function findOldImplementationReferences(directory) {
  const matches = []
  const entries = await readdir(directory, {
    withFileTypes: true,
  })

  for (const entry of entries) {
    if (ignoredDirectories.has(entry.name)) {
      continue
    }

    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      matches.push(
        ...(await findOldImplementationReferences(path)),
      )
      continue
    }

    if (!searchableExtensions.has(extname(entry.name))) {
      continue
    }

    /*
     * 不扫描当前执行脚本，否则脚本中的检查关键词会被误报。
     */
    if (
      entry.name === 'apply-tldraw-license-clean.mjs' ||
      entry.name === 'apply-tldraw-license.mjs'
    ) {
      continue
    }

    const content = await readFile(path, 'utf8')

    if (
      content.includes('TLDRaw_LICENSE_KEY') ||
      content.includes('scripts/check-license.js')
    ) {
      matches.push(path)
    }
  }

  return matches
}

async function verifyResult() {
  const editorSource = await readFile(editorCanvasPath, 'utf8')

  const constantOccurrences = (
    editorSource.match(
      /const\s+TLDRAW_LICENSE_KEY\s*=/g,
    ) ?? []
  ).length

  const propOccurrences = (
    editorSource.match(
      /licenseKey\s*:\s*TLDRAW_LICENSE_KEY/g,
    ) ?? []
  ).length

  if (constantOccurrences !== 1) {
    throw new Error(
      `TLDRAW_LICENSE_KEY 常量数量异常：${constantOccurrences}`,
    )
  }

  if (propOccurrences !== 1) {
    throw new Error(
      `licenseKey 属性数量异常：${propOccurrences}`,
    )
  }

  const oldReferences =
    await findOldImplementationReferences(resolve('.'))

  if (oldReferences.length > 0) {
    console.error('❌ 仍检测到旧实现引用：')

    for (const path of oldReferences) {
      console.error(`   ${path}`)
    }

    process.exitCode = 1
    return
  }

  console.log('✅ 未发现旧许可证实现残留')
}

async function main() {
  try {
    await updateEditorCanvas()
    await removeOldBuildCheck()
    await deleteOldFiles()
    await verifyResult()

    if (process.exitCode) {
      return
    }

    console.log('')
    console.log('🎉 tldraw 许可证实现已完成干净替换')
    console.log('')
    console.log('请继续运行：')
    console.log('  pnpm typecheck')
    console.log('  pnpm build:desktop')
    console.log('  git diff --check')
  } catch (error) {
    console.error('❌ 修改失败')

    if (error instanceof Error) {
      console.error(error.message)
    } else {
      console.error(error)
    }

    process.exit(1)
  }
}

await main()