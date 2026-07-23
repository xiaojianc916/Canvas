#!/usr/bin/env node
/**
 * P0 — 删除未经版本化和 schema 验证的裸 tldraw snapshot fallback
 *
 * 问题：
 * canvas-document-service.ts 当前在 parseDrawDocument() 失败后，
 * 会接受任意带 { document, session } 顶层字段的 JSON，并强制断言为
 * TLEditorSnapshot。这绕过了：
 *
 * - .draw 容器 header 校验
 * - 文件版本策略
 * - 文件大小、对象数量和嵌套预算
 * - future-version 只读策略
 * - 真实 snapshot schema 验证边界
 *
 * 修复：
 * - 删除“猜测旧格式”的 fallback；
 * - .draw 文件只能经 parseDrawDocument() 读取；
 * - 旧裸 JSON 必须由后续显式 migration/import 流程处理，
 *   而不能作为无期限运行时兼容层保留在主打开路径中。
 *
 * 特性：
 * - fail-closed：目标源码不完全匹配时拒绝修改；
 * - 幂等：已修复时不会重复写入；
 * - 不使用模糊正则替换；
 * - 不生成 backup / 不保留旧逻辑副本；
 * - 修改后输出必须执行的验证命令。
 *
 * 用法：
 *   node fix-p0-remove-raw-snapshot-fallback.mjs .
 *   node fix-p0-remove-raw-snapshot-fallback.mjs /absolute/path/to/Canvas
 */

import { access, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const repositoryRoot = resolve(process.argv[2] ?? process.cwd())

const targetRelativePath =
  'editor/document/src/application/canvas-document-service.ts'

const targetPath = join(repositoryRoot, targetRelativePath)

const oldImplementation = `function parseEditorSnapshot(json: string): TLEditorSnapshot {
  try {
    return parseDrawDocument(json).content
  } catch (containerError) {
    try {
      const parsed: unknown = JSON.parse(json)

      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'document' in parsed &&
        'session' in parsed
      ) {
        return parsed as TLEditorSnapshot
      }
    } catch {
      // Preserve the validated container error.
    }

    throw containerError
  }
}`

const newImplementation = `function parseEditorSnapshot(json: string): TLEditorSnapshot {
  /*
   * The application has exactly one supported persisted-document wire format:
   * the versioned Hybrid Canvas .draw container.
   *
   * Do not add a fallback that guesses whether arbitrary JSON is a tldraw
   * snapshot. Legacy formats must be recognized by an explicit importer or
   * migration pipeline with a bounded compatibility policy; they must never
   * bypass the canonical file-format validation path.
   */
  return parseDrawDocument(json).content
}`

async function fileExists(path) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function fail(message) {
  console.error(`\nP0 修复失败：${message}\n`)
  process.exitCode = 1
}

async function main() {
  const packageJsonPath = join(repositoryRoot, 'package.json')

  if (!(await fileExists(packageJsonPath))) {
    fail(
      [
        `未找到仓库根 package.json：${packageJsonPath}`,
        '请在 Hybrid Canvas 仓库根目录运行，或把仓库根目录作为第一个参数传入。',
      ].join('\n'),
    )
    return
  }

  if (!(await fileExists(targetPath))) {
    fail(`未找到目标文件：${targetRelativePath}`)
    return
  }

  const source = await readFile(targetPath, 'utf8')

  if (source.includes(newImplementation)) {
    console.log(`已是单一容器读取路径，跳过：${targetRelativePath}`)
    return
  }

  if (!source.includes(oldImplementation)) {
    fail(
      [
        `目标文件与已审查版本不匹配：${targetRelativePath}`,
        '拒绝进行模糊替换。',
        '请人工检查当前 parseEditorSnapshot()，重新确认兼容策略后再修改。',
      ].join('\n'),
    )
    return
  }

  const nextSource = source.replace(oldImplementation, newImplementation)

  if (nextSource === source) {
    fail('替换未产生变化。')
    return
  }

  await writeFile(targetPath, nextSource, 'utf8')

  console.log(`已修复：${targetRelativePath}`)
  console.log('')
  console.log('结果：')
  console.log('- .draw 打开路径不再猜测或强制断言裸 JSON snapshot。')
  console.log('- 所有持久化输入必须经过 versioned DrawFileContainer 校验。')
  console.log('- 历史裸 JSON 文件需要后续显式迁移工具处理。')
  console.log('')
  console.log('必须验证：')
  console.log('  pnpm format:check')
  console.log('  pnpm lint')
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('  pnpm test:architecture')
  console.log('  cargo fmt --check')
  console.log('  cargo clippy --workspace --all-targets --all-features -- -D warnings')
  console.log('  cargo test --workspace --all-features')
}

await main()