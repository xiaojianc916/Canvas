import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { cwd } from 'node:process'

const root = cwd()

const targetFile =
  'tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts'

const absolutePath = path.join(root, targetFile)

const oldText = `    harness.ready()
    harness.change(snapshot({ shapes: [{ id: 'shape:1' }] }))

    await expect(harness.service.releaseCanvas(opened.sessionId, 'normal')).resolves.toEqual({
      kind: 'confirmation-required',
    })`

const newText = `    harness.ready()

    // createHarness 的 snapshot() 当前仅返回一个空的有效 TLStoreSnapshot，
    // 因此必须显式构造内容不同的快照，才能覆盖 dirty-close 合约。
    const dirtySnapshot = {
      ...validSnapshot(),
      __testDocumentRevision: 'shape:1',
    } as unknown as TLStoreSnapshot

    harness.change(dirtySnapshot)

    await expect(harness.service.releaseCanvas(opened.sessionId, 'normal')).resolves.toEqual({
      kind: 'confirmation-required',
    })`

async function main() {
  let content

  try {
    content = await readFile(absolutePath, 'utf8')
  } catch {
    throw new Error(
      `找不到文件：${absolutePath}\\n请在仓库根目录执行：node fix-cross-domain-test.mjs`,
    )
  }

  if (content.includes(newText)) {
    console.log('测试修复已存在，跳过。')
    return
  }

  if (!content.includes(oldText)) {
    throw new Error(
      [
        '未找到预期测试代码，脚本未修改任何文件。',
        `目标文件：${targetFile}`,
        '请确认文件内容未被手动修改。',
      ].join('\\n'),
    )
  }

  content = content.replace(oldText, newText)

  await writeFile(absolutePath, content, 'utf8')

  console.log(`已修改：${targetFile}`)
  console.log('请重新执行：pnpm test')
}

main().catch((error) => {
  console.error('\\n修复失败：')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})