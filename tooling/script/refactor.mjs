// add-motion.mjs
// 用法：在仓库任意目录运行 `node add-motion.mjs`

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const MOTION_VERSION = '12.42.2'

function findWorkspaceRoot(startDirectory) {
  let directory = resolve(startDirectory)

  while (true) {
    const packageJsonPath = join(directory, 'package.json')
    const workspacePath = join(directory, 'pnpm-workspace.yaml')

    if (existsSync(packageJsonPath) && existsSync(workspacePath)) {
      return directory
    }

    const parent = dirname(directory)

    if (parent === directory) {
      throw new Error('找不到包含 package.json 和 pnpm-workspace.yaml 的仓库根目录')
    }

    directory = parent
  }
}

function updateWorkspaceCatalog(content) {
  const newline = content.includes('\r\n') ? '\r\n' : '\n'
  const lines = content.split(/\r?\n/)

  const catalogIndex = lines.findIndex((line) => line === 'catalog:')

  if (catalogIndex === -1) {
    throw new Error('pnpm-workspace.yaml 中不存在顶级 catalog 配置')
  }

  let catalogEndIndex = lines.length

  for (let index = catalogIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]

    if (/^[^\s#][^:]*:/.test(line)) {
      catalogEndIndex = index
      break
    }
  }

  const existingMotionIndex = lines.findIndex(
    (line, index) =>
      index > catalogIndex &&
      index < catalogEndIndex &&
      /^\s{2}motion\s*:/.test(line),
  )

  const motionEntry = `  motion: "${MOTION_VERSION}"`

  if (existingMotionIndex !== -1) {
    lines[existingMotionIndex] = motionEntry
    return lines.join(newline)
  }

  // 放在 react 之前，保持 catalog 相对整齐。
  const reactIndex = lines.findIndex(
    (line, index) =>
      index > catalogIndex &&
      index < catalogEndIndex &&
      /^\s{2}react\s*:/.test(line),
  )

  const insertionIndex =
    reactIndex !== -1 ? reactIndex : catalogEndIndex

  lines.splice(insertionIndex, 0, motionEntry)

  return lines.join(newline)
}

function updateDesignSystemPackage(content) {
  const packageJson = JSON.parse(content)

  packageJson.dependencies ??= {}
  packageJson.dependencies.motion = 'catalog:'

  packageJson.dependencies = Object.fromEntries(
    Object.entries(packageJson.dependencies).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )

  return `${JSON.stringify(packageJson, null, 2)}\n`
}

function runPnpmInstall(root) {
  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

  const result = spawnSync(command, ['install'], {
    cwd: root,
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`pnpm install 执行失败，退出码：${result.status}`)
  }
}

function main() {
  const root = findWorkspaceRoot(process.cwd())

  const workspacePath = join(root, 'pnpm-workspace.yaml')
  const designSystemPackagePath = join(
    root,
    'foundations',
    'design-system',
    'package.json',
  )

  if (!existsSync(designSystemPackagePath)) {
    throw new Error(
      `找不到设计系统 package.json：${designSystemPackagePath}`,
    )
  }

  const originalWorkspace = readFileSync(workspacePath, 'utf8')
  const originalPackageJson = readFileSync(
    designSystemPackagePath,
    'utf8',
  )

  const updatedWorkspace = updateWorkspaceCatalog(originalWorkspace)
  const updatedPackageJson = updateDesignSystemPackage(
    originalPackageJson,
  )

  try {
    writeFileSync(workspacePath, updatedWorkspace, 'utf8')
    writeFileSync(
      designSystemPackagePath,
      updatedPackageJson,
      'utf8',
    )

    console.log(`已将 motion ${MOTION_VERSION} 加入 workspace catalog`)
    console.log(
      '已将 motion: catalog: 加入 @hybrid-canvas/design-system',
    )
    console.log('正在更新 pnpm-lock.yaml 和 node_modules...')

    runPnpmInstall(root)

    console.log('\n完成。可以这样导入：')
    console.log("import { m, LazyMotion } from 'motion/react'")
  } catch (error) {
    // 安装失败时恢复两个配置文件。
    writeFileSync(workspacePath, originalWorkspace, 'utf8')
    writeFileSync(
      designSystemPackagePath,
      originalPackageJson,
      'utf8',
    )

    throw error
  }
}

try {
  main()
} catch (error) {
  console.error(
    '\n添加 Motion 失败：',
    error instanceof Error ? error.message : error,
  )
  process.exitCode = 1
}