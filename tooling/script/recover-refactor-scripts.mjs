// fix-typecheck.mjs
// 在仓库根目录执行：node fix-typecheck.mjs
// 修改完成后执行：pnpm typecheck

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const changedFiles = []

function update(relativePath, transform, { optional = false } = {}) {
  const filePath = resolve(root, relativePath)

  if (!existsSync(filePath)) {
    if (optional) {
      console.log(`[跳过] 文件不存在：${relativePath}`)
      return
    }
    throw new Error(`文件不存在：${relativePath}`)
  }

  const before = readFileSync(filePath, 'utf8')
  const after = transform(before)

  if (after === before) {
    console.log(`[无需修改] ${relativePath}`)
    return
  }

  writeFileSync(filePath, after, 'utf8')
  changedFiles.push(relativePath)
  console.log(`[已修改] ${relativePath}`)
}

function replaceRequired(source, searchValue, replacement, description) {
  if (!source.includes(searchValue)) {
    if (source.includes(replacement)) {
      return source
    }

    throw new Error(`未找到待修改内容：${description}`)
  }

  return source.replace(searchValue, replacement)
}

// 1. 修复 TS4111：Record<string, unknown> 必须使用方括号访问。
update('platforms/desktop-ipc/src/error.ts', (source) => {
  const properties = ['code', 'message', 'operation', 'recoverable']

  for (const property of properties) {
    source = source.replaceAll(
      `candidate.${property}`,
      `candidate['${property}']`,
    )
  }

  return source
})

// 2. EditorSession 和 EditorSessionRegistry 属于 canvas/application，
//    HybridCanvasExtension 才属于 canvas/extensions。
update(
  'editor/document/src/application/canvas-document-service.ts',
  (source) => {
    source = replaceRequired(
      source,
      "import type { EditorSession, EditorSessionRegistry } from '@hybrid-canvas/canvas/extensions'",
      "import type { EditorSession, EditorSessionRegistry } from '@hybrid-canvas/canvas/application'",
      '修正 EditorSession 导入路径',
    )

    return source
  },
)

// 3. 修复截图中的 CommandRegistry 导入错误。
//    CommandRegistry 由 workspace/application 导出，不由 workspace/contracts 导出。
update(
  'apps/desktop/src/presentation/AppShell.tsx',
  (source) => {
    const incorrectCombinedImport =
      "import type { CommandRegistry, WorkbenchSessionStore } from '@hybrid-canvas/workspace/contracts'"

    const correctedImports = [
      "import type { CommandRegistry } from '@hybrid-canvas/workspace/application'",
      "import type { WorkbenchSessionStore } from '@hybrid-canvas/workspace/contracts'",
    ].join('\n')

    if (source.includes(incorrectCombinedImport)) {
      source = source.replace(incorrectCombinedImport, correctedImports)
    }

    source = source.replace(
      "import type { CommandRegistry } from '@hybrid-canvas/workspace/contracts'",
      "import type { CommandRegistry } from '@hybrid-canvas/workspace/application'",
    )

    return source
  },
  { optional: true },
)

// 4. 同步修复快捷键 Hook 中相同的 CommandRegistry 错误。
update(
  'apps/desktop/src/presentation/commands/useGlobalCommandShortcuts.ts',
  (source) =>
    source.replace(
      "import type { CommandRegistry } from '@hybrid-canvas/workspace/contracts'",
      "import type { CommandRegistry } from '@hybrid-canvas/workspace/application'",
    ),
  { optional: true },
)

// 5. 修复截图中的 SettingsShell 未导出错误。
//    兼容 function、const、SettingsShell 和 SettingsDialog 两种本地代码状态。
update(
  'apps/desktop/src/windows/settings/SettingsShell.tsx',
  (source) => {
    if (
      /\bexport\s+(?:default\s+)?(?:function|const|class)\s+(?:SettingsShell|SettingsDialog)\b/.test(
        source,
      )
    ) {
      return source
    }

    if (/\bfunction\s+SettingsShell\b/.test(source)) {
      return source.replace(
        /\bfunction\s+SettingsShell\b/,
        'export function SettingsShell',
      )
    }

    if (/\bconst\s+SettingsShell\b/.test(source)) {
      return source.replace(
        /\bconst\s+SettingsShell\b/,
        'export const SettingsShell',
      )
    }

    if (/\bclass\s+SettingsShell\b/.test(source)) {
      return source.replace(
        /\bclass\s+SettingsShell\b/,
        'export class SettingsShell',
      )
    }

    if (/\bfunction\s+SettingsDialog\b/.test(source)) {
      return source.replace(
        /\bfunction\s+SettingsDialog\b/,
        'export function SettingsDialog',
      )
    }

    if (/\bconst\s+SettingsDialog\b/.test(source)) {
      return source.replace(
        /\bconst\s+SettingsDialog\b/,
        'export const SettingsDialog',
      )
    }

    if (/\bclass\s+SettingsDialog\b/.test(source)) {
      return source.replace(
        /\bclass\s+SettingsDialog\b/,
        'export class SettingsDialog',
      )
    }

    throw new Error(
      'SettingsShell.tsx 存在，但未找到 SettingsShell 或 SettingsDialog 声明',
    )
  },
  { optional: true },
)

console.log('\n处理完成。')

if (changedFiles.length === 0) {
  console.log('没有文件需要修改。')
} else {
  console.log('修改的文件：')
  for (const file of changedFiles) {
    console.log(`  - ${file}`)
  }
}

console.log('\n请执行：pnpm typecheck')