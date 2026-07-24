import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { cwd } from 'node:process'

const root = cwd()

const atomicWriteFile = 'editor/persistence/native/src/atomic_write.rs'
const diagnosticsFile = 'apps/desktop/src-tauri/src/commands/diagnostics.rs'

async function updateFile(file, oldText, newText, description) {
  const absolutePath = path.join(root, file)
  let content

  try {
    content = await readFile(absolutePath, 'utf8')
  } catch {
    throw new Error(
      `找不到文件：${absolutePath}\n请在仓库根目录执行：node fix-windows-atomic-write.mjs`,
    )
  }

  if (content.includes(newText)) {
    console.log(`跳过：${description}（修改已存在）`)
    return
  }

  if (!content.includes(oldText)) {
    throw new Error(
      [
        `未找到预期代码：${file}`,
        `修改项：${description}`,
        '为避免覆盖现有修改，脚本已停止。',
      ].join('\n'),
    )
  }

  content = content.replace(oldText, newText)
  await writeFile(absolutePath, content, 'utf8')

  console.log(`已修改：${description}`)
}

async function main() {
  console.log(`仓库根目录：${root}\n`)

  await updateFile(
    atomicWriteFile,
    `    temporary.write_all(content)?;
    temporary.as_file().sync_all()?;

    replace_destination(temporary.path(), destination)?;
    sync_directory(parent)?;`,
    `    temporary.write_all(content)?;
    temporary.as_file().sync_all()?;

    // Windows 的 ReplaceFileW 无法替换仍被当前进程持有句柄的源文件。
    // into_temp_path 会关闭 NamedTempFile 的文件句柄，同时保留 TempPath：
    // - 替换成功后，源路径已被移动；
    // - 替换失败时，TempPath Drop 会清理临时文件。
    let temporary_path = temporary.into_temp_path();

    replace_destination(temporary_path.as_ref(), destination)?;
    sync_directory(parent)?;`,
    '释放 Windows 原子替换前的临时文件句柄',
  )

  await updateFile(
    diagnosticsFile,
    `type DiagnosticsCommandResult<T> = std::result::Result<T, IpcError>;`,
    `type DiagnosticsCommandResult<T> = Result<T, IpcError>;`,
    '移除 Rust unnecessary qualification 警告',
  )

  console.log('\n修复完成。请执行 cargo fmt 和测试验证。')
}

main().catch((error) => {
  console.error('\n修复失败：')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})