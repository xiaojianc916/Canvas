#!/usr/bin/env node

import {
  readFile,
  writeFile,
} from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const shouldApply =
  process.argv.includes('--apply')

const files = {
  packageJson: 'package.json',

  canvasPackage:
    'editor/core/package.json',

  documentPackage:
    'editor/document/package.json',

  editorSession:
    'editor/core/src/runtime/editor-session.ts',

  documentSession:
    'editor/document/src/domain/document-session.ts',

  documentService:
    'editor/document/src/application/canvas-document-service.ts',

  documentSessionTest:
    'tests/cross-domain-contract/document-lifecycle/document-session.test.ts',

  documentServiceTest:
    'tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts',

  testPackage:
    'tests/cross-domain-contract/package.json',
}

function absolute(relativePath) {
  return path.join(root, relativePath)
}

function fail(message) {
  throw new Error(
    `[document-lifecycle-verification] ${message}`,
  )
}

async function read(relativePath) {
  return readFile(
    absolute(relativePath),
    'utf8',
  )
}

async function write(relativePath, content) {
  await writeFile(
    absolute(relativePath),
    content,
    'utf8',
  )

  console.log(`已修改：${relativePath}`)
}

async function exists(relativePath) {
  try {
    await readFile(absolute(relativePath))
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

async function assertRepository() {
  if (!(await exists(files.packageJson))) {
    fail(
      '请在 hybrid-canvas 仓库根目录执行。',
    )
  }

  const packageJson = JSON.parse(
    await read(files.packageJson),
  )

  if (packageJson.name !== 'hybrid-canvas') {
    fail(
      `当前 package.json.name 不是 hybrid-canvas：${String(
        packageJson.name,
      )}`,
    )
  }

  const requiredFiles = [
    files.canvasPackage,
    files.documentPackage,
    files.editorSession,
    files.documentSession,
    files.documentService,
    files.documentSessionTest,
    files.documentServiceTest,
    files.testPackage,
  ]

  for (const requiredFile of requiredFiles) {
    if (!(await exists(requiredFile))) {
      fail(`缺少文件：${requiredFile}`)
    }
  }
}

function parseTypeImportNames(importBody) {
  return importBody
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
}

function formatCanvasApplicationTypeImport(
  names,
) {
  const orderedNames = [
    ...new Set(names),
  ].sort((left, right) =>
    left.localeCompare(right),
  )

  return `import type {
${orderedNames
  .map((name) => `  ${name},`)
  .join('\n')}
} from '@hybrid-canvas/canvas/application'`
}

/**
 * 确保测试从 canvas/application 显式导入所需类型。
 *
 * 不使用脆弱的 includes('type EditorDocumentEvent')，
 * 而是解析整个 type import 块。
 */
function ensureCanvasApplicationTypeImports(
  source,
) {
  const importPattern =
    /import\s+type\s*\{([\s\S]*?)\}\s*from\s*['"]@hybrid-canvas\/canvas\/application['"]/

  const match = source.match(importPattern)

  if (!match) {
    fail(
      '测试文件缺少 @hybrid-canvas/canvas/application type import。',
    )
  }

  const importBody = match[1]

  if (importBody === undefined) {
    fail(
      '无法读取 canvas/application type import 内容。',
    )
  }

  const importedNames =
    parseTypeImportNames(importBody)

  const requiredNames = [
    'EditorDocumentEvent',
    'EditorSession',
  ]

  let changed = false

  for (const requiredName of requiredNames) {
    if (!importedNames.includes(requiredName)) {
      importedNames.push(requiredName)
      changed = true
    }
  }

  if (!changed) {
    return {
      source,
      changed: false,
    }
  }

  const replacement =
    formatCanvasApplicationTypeImport(
      importedNames,
    )

  return {
    source: source.replace(
      importPattern,
      replacement,
    ),
    changed: true,
  }
}

/**
 * 修复测试桩 listener 的隐式 any。
 */
function ensureTypedSubscribeMethod(source) {
  const untypedPattern =
    /subscribeDocumentEvents\s*\(\s*listener\s*\)\s*\{/

  if (!untypedPattern.test(source)) {
    return {
      source,
      changed: false,
    }
  }

  const replacement = `subscribeDocumentEvents(
      listener: (
        event: EditorDocumentEvent,
      ) => void,
    ) {`

  return {
    source: source.replace(
      untypedPattern,
      replacement,
    ),
    changed: true,
  }
}

async function repairDocumentServiceTest() {
  const original = await read(
    files.documentServiceTest,
  )

  let source = original

  const importResult =
    ensureCanvasApplicationTypeImports(source)

  source = importResult.source

  const methodResult =
    ensureTypedSubscribeMethod(source)

  source = methodResult.source

  if (source !== original) {
    await write(
      files.documentServiceTest,
      source,
    )
  } else {
    console.log(
      `无需修改：${files.documentServiceTest}`,
    )
  }
}

function validateCanvasApplicationImport(
  source,
) {
  const importPattern =
    /import\s+type\s*\{([\s\S]*?)\}\s*from\s*['"]@hybrid-canvas\/canvas\/application['"]/

  const match = source.match(importPattern)

  if (!match) {
    fail(
      '测试文件缺少 canvas/application type import。',
    )
  }

  const importBody = match[1]

  if (importBody === undefined) {
    fail(
      '无法读取 canvas/application import。',
    )
  }

  const importedNames =
    parseTypeImportNames(importBody)

  for (const requiredName of [
    'EditorDocumentEvent',
    'EditorSession',
  ]) {
    if (!importedNames.includes(requiredName)) {
      fail(
        `测试文件没有导入 ${requiredName}。`,
      )
    }
  }
}

function validateTypedSubscribeMethod(source) {
  const typedPattern =
    /subscribeDocumentEvents\s*\(\s*listener\s*:\s*\(\s*event\s*:\s*EditorDocumentEvent\s*\)\s*=>\s*void\s*,?\s*\)\s*\{/

  if (!typedPattern.test(source)) {
    fail(
      'subscribeDocumentEvents listener 没有显式 EditorDocumentEvent 类型。',
    )
  }

  const untypedPattern =
    /subscribeDocumentEvents\s*\(\s*listener\s*\)\s*\{/

  if (untypedPattern.test(source)) {
    fail(
      'subscribeDocumentEvents 仍存在隐式 any。',
    )
  }
}

async function validateTestRepair() {
  const source = await read(
    files.documentServiceTest,
  )

  validateCanvasApplicationImport(source)
  validateTypedSubscribeMethod(source)

  console.log('测试类型修复检查通过。')
}

async function validateArchitectureFiles() {
  const [
    editorSource,
    sessionSource,
    serviceSource,
  ] = await Promise.all([
    read(files.editorSession),
    read(files.documentSession),
    read(files.documentService),
  ])

  const editorRequirements = [
    'captureDocument',
    'subscribeDocumentEvents',
    "kind: 'ready'",
    "kind: 'changed'",
    "source: 'user'",
  ]

  for (const requirement of editorRequirements) {
    if (!editorSource.includes(requirement)) {
      fail(
        `Editor adapter 缺少：${requirement}`,
      )
    }
  }

  const sessionRequirements = [
    'createDocumentSession',
    'createDocumentCheckpoint',
    'recordDocumentChange',
    'beginSave',
    'completeSave',
    'failSave',
    'isDirty',
  ]

  for (const requirement of sessionRequirements) {
    if (!sessionSource.includes(requirement)) {
      fail(
        `DocumentSession 缺少：${requirement}`,
      )
    }
  }

  const serviceRequirements = [
    'createDocumentSession',
    'subscribeDocumentEvents',
    'captureDocument',
    'beginSave',
    'completeSave',
    'recordDocumentChange',
  ]

  for (const requirement of serviceRequirements) {
    if (!serviceSource.includes(requirement)) {
      fail(
        `CanvasDocumentService 缺少：${requirement}`,
      )
    }
  }

  const forbiddenTokens = [
    'bootstrapPending',
    'queueMicrotask',
    'isInitialDocumentBootstrapChange',
    'onUserDocumentChange',
    'savedRevision',
    'session.revision',
  ]

  for (const token of forbiddenTokens) {
    if (
      editorSource.includes(token) ||
      sessionSource.includes(token) ||
      serviceSource.includes(token)
    ) {
      fail(`仍存在旧实现：${token}`)
    }
  }

  console.log('Document lifecycle 架构检查通过。')
}

function runPnpm(args) {
  console.log(`\n> pnpm ${args.join(' ')}`)

  const options = {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
  }

  const result =
    process.platform === 'win32'
      ? spawnSync(
          process.env.ComSpec ?? 'cmd.exe',
          [
            '/d',
            '/s',
            '/c',
            `pnpm ${args.join(' ')}`,
          ],
          options,
        )
      : spawnSync(
          'pnpm',
          args,
          options,
        )

  if (result.error) {
    throw result.error
  }

  if (result.signal) {
    fail(
      `pnpm 被信号 ${result.signal} 终止。`,
    )
  }

  if (result.status !== 0) {
    fail(
      `pnpm ${args.join(
        ' ',
      )} 执行失败，退出码：${String(
        result.status,
      )}`,
    )
  }
}

function verify() {
  runPnpm([
    'exec',
    'biome',
    'format',
    '--write',
    files.documentServiceTest,
  ])

  runPnpm([
    '--filter',
    '@hybrid-canvas/test-cross-domain-contract',
    'typecheck',
  ])

  runPnpm([
    '--filter',
    '@hybrid-canvas/test-cross-domain-contract',
    'test',
  ])

  runPnpm([
    '--filter',
    '@hybrid-canvas/canvas',
    'typecheck',
  ])

  runPnpm([
    '--filter',
    '@hybrid-canvas/document',
    'typecheck',
  ])

  runPnpm(['test:architecture'])
}

async function main() {
  await assertRepository()

  if (!shouldApply) {
    console.log(`
Document lifecycle verification recovery

该脚本将：

1. 修复测试桩 listener 的隐式 any。
2. 解析并验证多行 type import。
3. 自动补充 EditorDocumentEvent 和 EditorSession。
4. 不修改脚本自身。
5. 继续执行类型检查、测试和架构检查。

执行：

node tooling\\\\script\\\\refactor.mjs --apply
`)

    return
  }

  console.log(
    '开始恢复 Document lifecycle 验证……',
  )

  await repairDocumentServiceTest()
  await validateTestRepair()
  await validateArchitectureFiles()

  console.log(
    '\n代码检查完成，继续执行验证。',
  )

  verify()

  console.log(`
Document lifecycle 重构验证完成。

测试文件：

- tests/cross-domain-contract/document-lifecycle/document-session.test.ts
- tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts

业务源码目录中没有测试文件。
`)
}

main().catch((error) => {
  console.error(
    '\nDocument lifecycle 验证失败：',
  )
  console.error(error)
  process.exitCode = 1
})