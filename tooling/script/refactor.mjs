// tooling/script/1.mjs
// 只负责添加 Motion，不修改任何业务代码。

import {
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const VERSION = '12.42.2'
const root = process.cwd()

if (!process.argv.includes('--apply')) {
  console.log(
    '请运行：node tooling\\script\\1.mjs --apply',
  )
  process.exit(0)
}

const workspacePath = join(
  root,
  'pnpm-workspace.yaml',
)

const packagePath = join(
  root,
  'foundations',
  'design-system',
  'package.json',
)

if (!existsSync(workspacePath)) {
  throw new Error(
    `找不到文件：${workspacePath}\n请在项目根目录运行脚本。`,
  )
}

if (!existsSync(packagePath)) {
  throw new Error(`找不到文件：${packagePath}`)
}

const originalWorkspace = readFileSync(
  workspacePath,
  'utf8',
)

const originalPackage = readFileSync(
  packagePath,
  'utf8',
)

function addMotionToCatalog(source) {
  const newline = source.includes('\r\n')
    ? '\r\n'
    : '\n'

  // 如果已经存在 motion，则只更新版本。
  if (/^ {2}motion\s*:/m.test(source)) {
    return source.replace(
      /^ {2}motion\s*:.*$/m,
      `  motion: "${VERSION}"`,
    )
  }

  // 将 motion 插入顶级 catalog 开头。
  if (/^catalog:\s*$/m.test(source)) {
    return source.replace(
      /^catalog:\s*$/m,
      `catalog:${newline}  motion: "${VERSION}"`,
    )
  }

  throw new Error(
    'pnpm-workspace.yaml 中找不到顶级 catalog 配置',
  )
}

function addMotionToPackage(source) {
  const packageJson = JSON.parse(source)

  packageJson.dependencies ??= {}
  packageJson.dependencies.motion = 'catalog:'

  packageJson.dependencies = Object.fromEntries(
    Object.entries(packageJson.dependencies).sort(
      ([left], [right]) =>
        left.localeCompare(right),
    ),
  )

  return `${JSON.stringify(packageJson, null, 2)}\n`
}

function installDependencies() {
  if (process.platform === 'win32') {
    const cmd =
      process.env.ComSpec ??
      'C:\\Windows\\System32\\cmd.exe'

    return spawnSync(
      cmd,
      ['/d', '/s', '/c', 'pnpm install'],
      {
        cwd: root,
        stdio: 'inherit',
        env: process.env,
        windowsHide: true,
      },
    )
  }

  return spawnSync('pnpm', ['install'], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  })
}

try {
  const updatedWorkspace =
    addMotionToCatalog(originalWorkspace)

  const updatedPackage =
    addMotionToPackage(originalPackage)

  writeFileSync(
    workspacePath,
    updatedWorkspace,
    'utf8',
  )

  writeFileSync(
    packagePath,
    updatedPackage,
    'utf8',
  )

  console.log(
    `已添加 motion ${VERSION} 到 workspace catalog`,
  )

  console.log(
    '已添加 motion 到 @hybrid-canvas/design-system',
  )

  console.log('正在执行 pnpm install...')

  const result = installDependencies()

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(
      `pnpm install 失败，退出码：${
        result.status ?? 'unknown'
      }`,
    )
  }

  console.log('')
  console.log('Motion 安装完成。')
  console.log(
    "使用方式：import { m } from 'motion/react'",
  )
} catch (error) {
  // 失败后恢复配置文件。
  writeFileSync(
    workspacePath,
    originalWorkspace,
    'utf8',
  )

  writeFileSync(
    packagePath,
    originalPackage,
    'utf8',
  )

  console.error('')
  console.error(
    '添加 Motion 失败：',
    error instanceof Error
      ? error.message
      : String(error),
  )

  process.exitCode = 1
}