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

const filePath = resolve(process.cwd(), 'turbo.json')
const source = await readFile(filePath, 'utf8')

const oldPattern =
  /("test"\s*:\s*\{\s*"dependsOn"\s*:\s*)\["\^build"\]/

const alreadyFixedPattern =
  /"test"\s*:\s*\{\s*"dependsOn"\s*:\s*\["\^typecheck"\]/

if (alreadyFixedPattern.test(source)) {
  console.log('无需修改：test 任务已经依赖 ^typecheck。')
  process.exit(0)
}

if (!oldPattern.test(source)) {
  throw new Error(
    '没有在 turbo.json 中找到 test.dependsOn = ["^build"]',
  )
}

const updatedSource = source.replace(
  oldPattern,
  '$1["^typecheck"]',
)

console.log(`目标文件：${filePath}`)
console.log('修改内容：')
console.log('- test.dependsOn = ["^build"]')
console.log('+ test.dependsOn = ["^typecheck"]')

if (!apply) {
  console.log('')
  console.log('当前是预览模式，文件尚未修改。')
  console.log('添加 --apply 后执行实际修改。')
  process.exit(0)
}

await writeFile(filePath, updatedSource, 'utf8')

console.log('')
console.log('修改成功。')
console.log('请重新运行：pnpm test')