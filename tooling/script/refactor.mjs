// tooling/script/refactor.mjs
//
// 执行：
// node tooling\script\refactor.mjs --apply

import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const MOTION_VERSION = '12.42.2'
const SHOULD_APPLY = process.argv.includes('--apply')

function findWorkspaceRoot(startDirectory) {
  let currentDirectory = resolve(startDirectory)

  while (true) {
    const packageJsonPath = join(currentDirectory, 'package.json')
    const workspacePath = join(
      currentDirectory,
      'pnpm-workspace.yaml',
    )

    if (
      existsSync(packageJsonPath) &&
      existsSync(workspacePath)
    ) {
      return currentDirectory
    }

    const parentDirectory = dirname(currentDirectory)

    if (parentDirectory === currentDirectory) {
      throw new Error(
        '找不到包含 package.json 和 pnpm-workspace.yaml 的项目根目录',
      )
    }

    currentDirectory = parentDirectory
  }
}

function updateWorkspaceCatalog(content) {
  const newline = content.includes('\r\n') ? '\r\n' : '\n'
  const lines = content.split(/\r?\n/)

  const catalogStartIndex = lines.findIndex(
    (line) => line.trimEnd() === 'catalog:',
  )

  if (catalogStartIndex === -1) {
    throw new Error(
      'pnpm-workspace.yaml 中不存在顶级 catalog 配置',
    )
  }

  let catalogEndIndex = lines.length

  for (
    let index = catalogStartIndex + 1;
    index < lines.length;
    index += 1
  ) {
    const line = lines[index]

    // 找到下一个顶级 YAML 属性，例如 catalogs:
    if (/^[^\s#][^:]*:\s*$/.test(line)) {
      catalogEndIndex = index
      break
    }
  }

  const motionEntry = `  motion: "${MOTION_VERSION}"`

  const existingMotionIndex = lines.findIndex(
    (line, index) =>
      index > catalogStartIndex &&
      index < catalogEndIndex &&
      /^\s{2}motion\s*:/.test(line),
  )

  if (existingMotionIndex !== -1) {
    lines[existingMotionIndex] = motionEntry
    return lines.join(newline)
  }

  // 将 motion 放在 react 前面。
  const reactIndex = lines.findIndex(
    (line, index) =>
      index > catalogStartIndex &&
      index < catalogEndIndex &&
      /^\s{2}react\s*:/.test(line),
  )

  const insertionIndex =
    reactIndex === -1 ? catalogEndIndex : reactIndex

  lines.splice(insertionIndex, 0, motionEntry)

  return lines.join(newline)
}

function updateDesignSystemPackage(content) {
  const packageJson = JSON.parse(content)

  packageJson.dependencies ??= {}
  packageJson.dependencies.motion = 'catalog:'

  // 对 dependencies 排序，减少无意义的 diff。
  packageJson.dependencies = Object.fromEntries(
    Object.entries(packageJson.dependencies).sort(
      ([leftName], [rightName]) =>
        leftName.localeCompare(rightName),
    ),
  )

  return `${JSON.stringify(packageJson, null, 2)}\n`
}

function runPnpmInstall(root) {
  let command
  let args

  if (process.platform === 'win32') {
    // Windows 不能稳定地直接 spawnSync pnpm.cmd，
    // 因此通过 cmd.exe 执行。
    command =
      process.env.ComSpec ??
      'C:\\Windows\\System32\\cmd.exe'

    args = ['/d', '/s', '/c', 'pnpm install']
  } else {
    command = 'pnpm'
    args = ['install']
  }

  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    env: process.env,
  })

  if (result.error) {
    throw new Error(
      `无法启动 pnpm install：${result.error.message}`,
      {
        cause: result.error,
      },
    )
  }

  if (result.signal) {
    throw new Error(
      `pnpm install 被信号 ${result.signal} 终止`,
    )
  }

  if (result.status !== 0) {
    throw new Error(
      `pnpm install 执行失败，退出码：${
        result.status ?? 'unknown'
      }`,
    )
  }
}

function restoreFile(path, originalContent, existed) {
  if (existed) {
    writeFileSync(path, originalContent, 'utf8')
    return
  }

  if (existsSync(path)) {
    unlinkSync(path)
  }
}

function main() {
  const root = findWorkspaceRoot(process.cwd())

  const workspacePath = join(
    root,
    'pnpm-workspace.yaml',
  )

  const designSystemPackagePath = join(
    root,
    'foundations',
    'design-system',
    'package.json',
  )

  const lockfilePath = join(root, 'pnpm-lock.yaml')

  if (!existsSync(designSystemPackagePath)) {
    throw new Error(
      `找不到设计系统配置：${designSystemPackagePath}`,
    )
  }

  const workspaceExisted = existsSync(workspacePath)
  const packageExisted = existsSync(
    designSystemPackagePath,
  )
  const lockfileExisted = existsSync(lockfilePath)

  const originalWorkspace = readFileSync(
    workspacePath,
    'utf8',
  )

  const originalPackage = readFileSync(
    designSystemPackagePath,
    'utf8',
  )

  const originalLockfile = lockfileExisted
    ? readFileSync(lockfilePath, 'utf8')
    : ''

  const updatedWorkspace = updateWorkspaceCatalog(
    originalWorkspace,
  )

  const updatedPackage = updateDesignSystemPackage(
    originalPackage,
  )

  console.log(`项目根目录：${root}`)
  console.log(
    `计划添加：motion ${MOTION_VERSION}`,
  )
  console.log(
    '目标包：@hybrid-canvas/design-system',
  )

  if (!SHOULD_APPLY) {
    console.log('')
    console.log('当前为预览模式，没有修改文件。')
    console.log('请使用以下命令实际应用：')
    console.log(
      'node tooling\\script\\refactor.mjs --apply',
    )
    return
  }

  try {
    writeFileSync(
      workspacePath,
      updatedWorkspace,
      'utf8',
    )

    writeFileSync(
      designSystemPackagePath,
      updatedPackage,
      'utf8',
    )

    console.log(
      `已将 motion ${MOTION_VERSION} 加入 workspace catalog`,
    )

    console.log(
      '已将 motion: catalog: 加入 @hybrid-canvas/design-system',
    )

    console.log(
      '正在更新 pnpm-lock.yaml 和 node_modules...',
    )

    runPnpmInstall(root)

    console.log('')
    console.log('Motion 添加完成。')
    console.log('')
    console.log('导入示例：')
    console.log(
      "import { LazyMotion, domAnimation, m } from 'motion/react'",
    )
  } catch (error) {
    console.error('')
    console.error('操作失败，正在恢复修改...')

    restoreFile(
      workspacePath,
      originalWorkspace,
      workspaceExisted,
    )

    restoreFile(
      designSystemPackagePath,
      originalPackage,
      packageExisted,
    )

    restoreFile(
      lockfilePath,
      originalLockfile,
      lockfileExisted,
    )

    throw error
  }
}

try {
  main()
} catch (error) {
  console.error('')
  console.error(
    '添加 Motion 失败：',
    error instanceof Error
      ? error.message
      : String(error),
  )

  process.exitCode = 1
}