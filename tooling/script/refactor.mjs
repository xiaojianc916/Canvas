import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const apply = args.includes('--apply')

const supportedArgs = new Set(['--apply', '--allow-dirty'])

for (const arg of args) {
  if (!supportedArgs.has(arg)) {
    throw new Error(`未知参数：${arg}`)
  }
}

const edits = [
  {
    path: 'apps/desktop/src-tauri/src/commands/file.rs',
    oldText: 'use std::path::{Path, PathBuf};',
    newText: 'use std::path::Path;',
    description: '移除未使用的 PathBuf 导入',
  },
  {
    path: 'apps/desktop/src-tauri/src/security/approved_paths.rs',
    oldText: '#[derive(Default)]',
    newText: '#[derive(Debug, Default)]',
    description: '为 ApprovedPathRegistry 派生 Debug',
  },
]

const pendingEdits = []

for (const edit of edits) {
  const filePath = resolve(process.cwd(), edit.path)
  const source = await readFile(filePath, 'utf8')

  if (source.includes(edit.newText)) {
    console.log(`已修复，跳过：${edit.path}`)
    continue
  }

  if (!source.includes(edit.oldText)) {
    throw new Error(
      `未在 ${edit.path} 中找到预期内容：\n${edit.oldText}`,
    )
  }

  pendingEdits.push({
    ...edit,
    filePath,
    updatedSource: source.replace(edit.oldText, edit.newText),
  })
}

if (pendingEdits.length === 0) {
  console.log('无需修改：所有 Rust 警告均已修复。')
  process.exit(0)
}

console.log('计划修改：')

for (const edit of pendingEdits) {
  console.log(`- ${edit.path}：${edit.description}`)
  console.log(`  - ${edit.oldText}`)
  console.log(`  + ${edit.newText}`)
}

if (!apply) {
  console.log('')
  console.log('当前为预览模式，文件尚未修改。')
  console.log('添加 --apply 后执行实际修改。')
  process.exit(0)
}

for (const edit of pendingEdits) {
  await writeFile(edit.filePath, edit.updatedSource, 'utf8')
}

console.log('')
console.log(`修改成功，共更新 ${pendingEdits.length} 个文件。`)