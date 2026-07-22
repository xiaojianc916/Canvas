// fix-settings-typecheck.mjs
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const repositoryRoot = process.argv[2]
  ? resolve(process.argv[2])
  : process.cwd()

const filePath = resolve(
  repositoryRoot,
  'features/settings/src/presentation/SettingsDialog.tsx',
)

const source = await readFile(filePath, 'utf8')

const oldCode = "readonly operation?: 'save' | 'reset'"
const newCode = "readonly operation: 'save' | 'reset' | undefined"

const matches = source.split(oldCode).length - 1

if (matches === 0) {
  throw new Error(
    `没有找到待修改的代码：${oldCode}\n文件可能已经修改：${filePath}`,
  )
}

if (matches > 1) {
  throw new Error(
    `找到 ${matches} 处匹配，为避免误改已停止执行：${filePath}`,
  )
}

const updatedSource = source.replace(oldCode, newCode)

await writeFile(filePath, updatedSource, 'utf8')

console.log('修改成功：')
console.log(filePath)
console.log(`- ${oldCode}`)
console.log(`+ ${newCode}`)
console.log('\n请运行：pnpm typecheck')