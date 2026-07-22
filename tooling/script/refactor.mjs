#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const shouldApply = process.argv.includes('--apply')

const editorSessionPath = path.join(
  root,
  'editor/core/src/runtime/editor-session.ts',
)

const refactorScriptPath = path.join(
  root,
  'tooling/script/refactor.mjs',
)

const documentServicePath = path.join(
  root,
  'editor/document/src/application/canvas-document-service.ts',
)

const documentServiceTestPath = path.join(
  root,
  'editor/document/src/application/canvas-document-service.test.ts',
)

const oldBootstrapFunction = `function isInitialDocumentBootstrapChange(entry: unknown): boolean {
  if (!isRecord(entry)) {
    return false
  }

  const changes = entry.changes

  if (!isRecord(changes)) {
    return false
  }

  const removed = isRecord(changes.removed) ? Object.values(changes.removed) : []

  if (removed.length > 0) {
    return false
  }

  const added = isRecord(changes.added) ? Object.values(changes.added) : []

  const updatedValues = isRecord(changes.updated) ? Object.values(changes.updated) : []

  const updated = updatedValues.flatMap((value) =>
    Array.isArray(value) ? value : [value],
  )

  const affectedRecords = [...added, ...updated].filter(isRecord)

  if (affectedRecords.length === 0) {
    return false
  }

  return affectedRecords.every((record) => {
    const typeName = record.typeName
    return typeName === 'document' || typeName === 'page'
  })
}`

const fixedBootstrapFunction = `function isInitialDocumentBootstrapChange(entry: unknown): boolean {
  if (!isRecord(entry)) {
    return false
  }

  const changes = entry['changes']

  if (!isRecord(changes)) {
    return false
  }

  const removedValue = changes['removed']
  const removed = isRecord(removedValue)
    ? Object.values(removedValue)
    : []

  if (removed.length > 0) {
    return false
  }

  const addedValue = changes['added']
  const added = isRecord(addedValue)
    ? Object.values(addedValue)
    : []

  const updatedValue = changes['updated']
  const updatedValues = isRecord(updatedValue)
    ? Object.values(updatedValue)
    : []

  const updated = updatedValues.flatMap((value) =>
    Array.isArray(value) ? value : [value],
  )

  const affectedRecords = [...added, ...updated].filter(isRecord)

  if (affectedRecords.length === 0) {
    return false
  }

  return affectedRecords.every((record) => {
    const typeName = record['typeName']

    return typeName === 'document' || typeName === 'page'
  })
}`

const oldRunFunction = `function run(command, args) {
  console.log(\`\\n> \${command} \${args.join(' ')}\`)

  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    fail(\`\${command} 执行失败，退出码：\${String(result.status)}\`)
  }
}`

const fixedRunFunction = `function run(command, args) {
  const executable =
    process.platform === 'win32' && command === 'pnpm'
      ? 'pnpm.cmd'
      : command

  console.log(\`\\n> \${command} \${args.join(' ')}\`)

  const result = spawnSync(executable, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    fail(
      \`\${command} 执行失败，退出码：\${String(result.status)}\`,
    )
  }
}`

function fail(message) {
  throw new Error(`[fix-refactor] ${message}`)
}

async function fileExists(filePath) {
  try {
    await readFile(filePath)
    return true
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return false
    }

    throw error
  }
}

function replaceExactlyOnce(source, search, replacement, description) {
  const count = source.split(search).length - 1

  if (count === 0 && source.includes(replacement)) {
    console.log(`已修复，跳过：${description}`)
    return {
      content: source,
      changed: false,
    }
  }

  if (count !== 1) {
    fail(
      `${description}：预期找到 1 个旧代码块，实际找到 ${String(count)} 个。`,
    )
  }

  return {
    content: source.replace(search, replacement),
    changed: true,
  }
}

function replaceBootstrapFunctionByBoundary(source, description) {
  const startMarker =
    'function isInitialDocumentBootstrapChange(entry: unknown): boolean {'

  const endMarker =
    '\n\nfunction hasInitialDocumentAndPage'

  const start = source.indexOf(startMarker)

  if (start === -1) {
    if (source.includes(fixedBootstrapFunction)) {
      console.log(`已修复，跳过：${description}`)
      return {
        content: source,
        changed: false,
      }
    }

    fail(`${description}：没有找到初始化变更识别函数。`)
  }

  const end = source.indexOf(endMarker, start)

  if (end === -1) {
    fail(`${description}：无法确定初始化变更识别函数的结束位置。`)
  }

  const currentFunction = source.slice(start, end)

  if (currentFunction === fixedBootstrapFunction) {
    console.log(`已修复，跳过：${description}`)
    return {
      content: source,
      changed: false,
    }
  }

  return {
    content:
      source.slice(0, start) +
      fixedBootstrapFunction +
      source.slice(end),
    changed: true,
  }
}

async function assertRepository() {
  const packageJsonPath = path.join(root, 'package.json')

  if (!(await fileExists(packageJsonPath))) {
    fail('当前目录不存在 package.json，请在仓库根目录执行。')
  }

  const packageJson = JSON.parse(
    await readFile(packageJsonPath, 'utf8'),
  )

  if (packageJson.name !== 'hybrid-canvas') {
    fail(
      '当前目录不是 hybrid-canvas 仓库根目录，' +
        `package.json.name=${String(packageJson.name)}`,
    )
  }

  for (const requiredPath of [
    editorSessionPath,
    refactorScriptPath,
    documentServicePath,
    documentServiceTestPath,
  ]) {
    if (!(await fileExists(requiredPath))) {
      fail(`缺少文件：${path.relative(root, requiredPath)}`)
    }
  }
}

async function patchEditorSession() {
  const source = await readFile(editorSessionPath, 'utf8')

  let result

  if (source.includes(oldBootstrapFunction)) {
    result = replaceExactlyOnce(
      source,
      oldBootstrapFunction,
      fixedBootstrapFunction,
      '修复 editor-session.ts 的索引签名访问',
    )
  } else {
    result = replaceBootstrapFunctionByBoundary(
      source,
      '修复 editor-session.ts 的索引签名访问',
    )
  }

  if (result.changed) {
    await writeFile(editorSessionPath, result.content)
    console.log(
      `已修改：${path.relative(root, editorSessionPath)}`,
    )
  }

  return result.changed
}

async function patchOriginalRefactorScript() {
  let source = await readFile(refactorScriptPath, 'utf8')
  let changed = false

  /*
   * refactor.mjs 内的 TypeScript 内容位于模板字符串中，
   * 但函数边界仍然可以按普通字符串安全定位。
   */
  const bootstrapResult = source.includes(oldBootstrapFunction)
    ? replaceExactlyOnce(
        source,
        oldBootstrapFunction,
        fixedBootstrapFunction,
        '修复 refactor.mjs 生成的 TypeScript 代码',
      )
    : replaceBootstrapFunctionByBoundary(
        source,
        '修复 refactor.mjs 生成的 TypeScript 代码',
      )

  source = bootstrapResult.content
  changed ||= bootstrapResult.changed

  const runResult = replaceExactlyOnce(
    source,
    oldRunFunction,
    fixedRunFunction,
    '修复 refactor.mjs 的 Windows 子进程调用',
  )

  source = runResult.content
  changed ||= runResult.changed

  if (changed) {
    await writeFile(refactorScriptPath, source)
    console.log(
      `已修改：${path.relative(root, refactorScriptPath)}`,
    )
  }

  return changed
}

function run(command, args) {
  const executable =
    process.platform === 'win32' && command === 'pnpm'
      ? 'pnpm.cmd'
      : command

  console.log(`\n> ${command} ${args.join(' ')}`)

  const result = spawnSync(executable, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    fail(
      `${command} 执行失败，退出码：${String(result.status)}`,
    )
  }
}

async function verify() {
  run('pnpm', [
    'exec',
    'biome',
    'format',
    '--write',
    path.relative(root, editorSessionPath),
    path.relative(root, refactorScriptPath),
  ])

  run('pnpm', [
    '--filter',
    '@hybrid-canvas/canvas',
    'typecheck',
  ])

  run('pnpm', [
    '--filter',
    '@hybrid-canvas/document',
    'typecheck',
  ])

  run('pnpm', [
    '--filter',
    '@hybrid-canvas/document',
    'test',
  ])

  run('pnpm', ['test:architecture'])
}

async function main() {
  await assertRepository()

  if (!shouldApply) {
    console.log(`
该脚本将执行以下修改：

1. 修复 editor-session.ts 的 TS4111 索引签名错误。
2. 同步修复 refactor.mjs 中生成该函数的模板。
3. 将 Windows 下的 spawnSync 改为 pnpm.cmd + shell:false。
4. 执行格式化、类型检查、测试和架构检查。

确认后执行：

node tooling\\\\script\\\\fix-refactor.mjs --apply
`)
    return
  }

  console.log('开始修复重构脚本和已生成代码……\n')

  const editorChanged = await patchEditorSession()
  const scriptChanged = await patchOriginalRefactorScript()

  if (!editorChanged && !scriptChanged) {
    console.log('\n代码已经是修复后的状态，直接执行验证。')
  } else {
    console.log('\n代码修复完成，开始验证。')
  }

  await verify()

  console.log(`
修复完成。

已验证：
- @hybrid-canvas/canvas 类型检查
- @hybrid-canvas/document 类型检查
- @hybrid-canvas/document 回归测试
- 架构测试

现在不需要再次运行原始 refactor.mjs。
`)
}

main().catch((error) => {
  console.error('\n修复失败：')
  console.error(error)
  process.exitCode = 1
})