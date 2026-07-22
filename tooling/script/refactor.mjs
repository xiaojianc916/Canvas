import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const argumentsList = process.argv.slice(2)

let apply = false
let repositoryRoot = process.cwd()

for (let index = 0; index < argumentsList.length; index += 1) {
  const argument = argumentsList[index]

  if (argument === '--apply') {
    apply = true
    continue
  }

  // 为兼容现有脚本调用约定而接受；本脚本不会检查 Git 状态。
  if (argument === '--allow-dirty') {
    continue
  }

  if (argument === '--root') {
    const rootArgument = argumentsList[index + 1]

    if (!rootArgument || rootArgument.startsWith('--')) {
      throw new Error('--root 后必须提供仓库路径')
    }

    repositoryRoot = resolve(rootArgument)
    index += 1
    continue
  }

  if (argument === '--help' || argument === '-h') {
    console.log(`
用法：
  node tooling/script/fix-empty-vitest.mjs [选项]

选项：
  --apply            实际写入修改
  --allow-dirty      兼容参数
  --root <路径>      指定仓库根目录
  -h, --help         显示帮助
`)
    process.exit(0)
  }

  throw new Error(`未知参数：${argument}`)
}

repositoryRoot = resolve(repositoryRoot)

const ignoredDirectories = new Set([
  '.git',
  '.turbo',
  '.idea',
  '.vscode',
  'node_modules',
  'target',
  'dist',
  'build',
  'coverage',
])

const packageJsonPaths = []

async function findPackageJsonFiles(directory) {
  const entries = await readdir(directory, {
    withFileTypes: true,
  })

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue
    }

    const entryPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      await findPackageJsonFiles(entryPath)
      continue
    }

    if (entry.isFile() && entry.name === 'package.json') {
      packageJsonPaths.push(entryPath)
    }
  }
}

await findPackageJsonFiles(repositoryRoot)

const changes = []

const testScriptPattern = /("test"\s*:\s*)"vitest run"/g
const replacement = '$1"vitest run --passWithNoTests"'

for (const packageJsonPath of packageJsonPaths) {
  const source = await readFile(packageJsonPath, 'utf8')

  if (!testScriptPattern.test(source)) {
    testScriptPattern.lastIndex = 0
    continue
  }

  testScriptPattern.lastIndex = 0

  const updatedSource = source.replace(testScriptPattern, replacement)

  changes.push({
    packageJsonPath,
    updatedSource,
  })
}

if (changes.length === 0) {
  console.log('无需修改：没有发现使用裸 `vitest run` 的 test 脚本。')
  process.exit(0)
}

console.log('将修改以下文件：')

for (const change of changes) {
  console.log(`- ${change.packageJsonPath}`)
}

console.log('\n修改内容：')
console.log('- "test": "vitest run"')
console.log('+ "test": "vitest run --passWithNoTests"')

if (!apply) {
  console.log('\n当前为预览模式，尚未写入文件。')
  console.log('确认后添加 --apply 重新运行。')
  process.exit(0)
}

for (const change of changes) {
  await writeFile(
    change.packageJsonPath,
    change.updatedSource,
    'utf8',
  )
}

console.log(`\n修改完成，共更新 ${changes.length} 个 package.json。`)
console.log('请重新运行：pnpm test')