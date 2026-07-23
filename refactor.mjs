#!/usr/bin/env node
/**
 * Hybrid Canvas — 审查 Phase 0 自动修复
 *
 * 只修复两项已经由源码确认、且可以无行为歧义自动修复的问题：
 * 1. DOMMatrix 变换向量时错误带入平移。
 * 2. CancellationTokenSource 的“检查后订阅”取消竞态。
 *
 * 该脚本故意 fail-closed：
 * - 仅匹配已审查版本的精确源码片段；
 * - 源码已变化且不符合预期时立即报错，不进行猜测性替换；
 * - 可重复执行；已修复时只输出提示。
 *
 * 使用：
 *   node audit-phase0.mjs /path/to/Canvas
 *
 * 然后必须验证：
 *   pnpm format:check
 *   pnpm lint
 *   pnpm typecheck
 *   pnpm test
 *   cargo fmt --check
 *   cargo clippy --workspace --all-targets --all-features
 *   cargo test --workspace
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const repositoryRoot = resolve(process.argv[2] ?? process.cwd())

const edits = [
  {
    file: 'foundations/geometry/src/transform.ts',

    before: `export function transformVector(t: Transform2D, v: Vector2D): Vector2D {
  const pt = t.transformPoint(new DOMPoint(v[0], v[1]))
  return [pt.x, pt.y]
}`,

    after: `export function transformVector(t: Transform2D, v: Vector2D): Vector2D {
  // A vector has homogeneous w = 0: matrix translation must not affect it.
  const pt = t.transformPoint(new DOMPoint(v[0], v[1], 0, 0))
  return [pt.x, pt.y]
}`,
  },

  {
    file: 'foundations/kernel/src/cancellation.ts',

    before: `      onCancelled(listener: () => void): () => void {
        source.#listeners.push(listener)
        return () => {
          const idx = source.#listeners.indexOf(listener)
          if (idx >= 0) source.#listeners.splice(idx, 1)
        }
      },`,

    after: `      onCancelled(listener: () => void): () => void {
        // Cancellation is level-triggered. A listener registered after
        // cancellation must observe the already-cancelled state immediately;
        // otherwise withCancellation has a check-then-subscribe race.
        if (source.#cancelled) {
          listener()
          return () => {}
        }

        source.#listeners.push(listener)

        return () => {
          const idx = source.#listeners.indexOf(listener)

          if (idx >= 0) {
            source.#listeners.splice(idx, 1)
          }
        }
      },`,
  },
]

async function patchFile({ file, before, after }) {
  const path = join(repositoryRoot, file)
  const source = await readFile(path, 'utf8')

  if (source.includes(after)) {
    console.log(`已修复，跳过：${file}`)
    return false
  }

  if (!source.includes(before)) {
    throw new Error(
      [
        `拒绝修改：${file}`,
        '原因：源码片段与已审查版本不一致。',
        '脚本不会对未知版本进行模糊替换；请先人工重新审查差异。',
      ].join('\n'),
    )
  }

  const next = source.replace(before, after)

  if (next === source) {
    throw new Error(`拒绝修改：${file} 未产生预期变更。`)
  }

  await writeFile(path, next, 'utf8')
  console.log(`已修复：${file}`)

  return true
}

async function main() {
  const packageJsonPath = join(repositoryRoot, 'package.json')

  try {
    await readFile(packageJsonPath, 'utf8')
  } catch {
    throw new Error(
      `未找到 ${packageJsonPath}。请传入 Hybrid Canvas 仓库根目录，或在仓库根目录执行脚本。`,
    )
  }

  let changedCount = 0

  for (const edit of edits) {
    if (await patchFile(edit)) {
      changedCount += 1
    }
  }

  console.log('')
  console.log(`完成：应用了 ${changedCount} 项确定性修复。`)
  console.log('')
  console.log('必须执行以下验证：')
  console.log('  pnpm format:check')
  console.log('  pnpm lint')
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('  cargo fmt --check')
  console.log('  cargo clippy --workspace --all-targets --all-features')
  console.log('  cargo test --workspace')
}

await main()