#!/usr/bin/env node
/**
 * 修复：
 * 1. noPropertyAccessFromIndexSignature 下的 DOMStringMap 访问。
 * 2. Windows 编译时 atomic_write.rs 的 Unix 专属 File import 警告。
 *
 * 使用：
 *   node refactor.mjs --write
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const workbenchTabsPath = resolve(
  'features/workspace/src/presentation/shell/WorkbenchTabs.tsx',
)

const atomicWritePath = resolve(
  'editor/persistence/native/src/atomic_write.rs',
)

async function rewrite(path, transform) {
  const source = await readFile(path, 'utf8')
  await writeFile(path, transform(source), 'utf8')
}

await rewrite(workbenchTabsPath, (source) =>
  source.replaceAll(
    'viewport.dataset.hasActiveTab',
    "viewport.dataset['hasActiveTab']",
  ),
)

await rewrite(atomicWritePath, (source) =>
  source.replace(
    'use std::fs::File;',
    '#[cfg(unix)]\nuse std::fs::File;',
  ),
)

console.log('已修复：')
console.log('- WorkbenchTabs DOMStringMap 索引访问')
console.log('- atomic_write Windows 未使用 import 警告')