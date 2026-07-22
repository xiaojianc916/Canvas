#!/usr/bin/env node

/**
 * Document lifecycle verification runner.
 *
 * This script does not modify business code or tests.
 * TypeScript, Vitest, Biome and architecture tests are the only authorities.
 *
 * Run:
 *
 *   node tooling/script/refactor.mjs --apply
 */

import { spawnSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

const shouldRun = process.argv.includes('--apply') || process.argv.includes('--verify')

const files = {
  packageJson: 'package.json',
  workspace: 'pnpm-workspace.yaml',

  editorSession: 'editor/core/src/runtime/editor-session.ts',

  coreApplicationPublicApi: 'editor/core/src/application/public-api.ts',

  documentCheckpoint: 'editor/document/src/domain/document-checkpoint.ts',

  documentSession: 'editor/document/src/domain/document-session.ts',

  editorDocumentPort: 'editor/document/src/ports/editor-document-port.ts',

  documentService: 'editor/document/src/application/canvas-document-service.ts',

  documentPublicApi: 'editor/document/src/public-api.ts',

  testPackage: 'tests/cross-domain-contract/package.json',

  testTsconfig: 'tests/cross-domain-contract/tsconfig.json',

  documentSessionTest: 'tests/cross-domain-contract/document-lifecycle/document-session.test.ts',

  documentServiceTest:
    'tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts',
}

function absolute(relativePath) {
  return path.join(root, relativePath)
}

function fail(message) {
  throw new Error(`[document-lifecycle-verification] ${message}`)
}

async function exists(relativePath) {
  try {
    await readFile(absolute(relativePath))
    return true
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false
    }

    throw error
  }
}

async function read(relativePath) {
  return readFile(absolute(relativePath), 'utf8')
}

async function assertRepository() {
  if (!(await exists(files.packageJson))) {
    fail('请在 hybrid-canvas 仓库根目录执行。')
  }

  const packageJson = JSON.parse(await read(files.packageJson))

  if (packageJson.name !== 'hybrid-canvas') {
    fail(`当前 package.json.name 不是 hybrid-canvas：${String(packageJson.name)}`)
  }

  const requiredFiles = Object.values(files)

  for (const requiredFile of requiredFiles) {
    if (!(await exists(requiredFile))) {
      fail(`缺少必要文件：${requiredFile}`)
    }
  }
}

/**
 * Structural checks only verify architectural presence and removal.
 *
 * They deliberately do not attempt to parse TypeScript signatures.
 * Type correctness belongs exclusively to tsc.
 */
async function assertArchitectureStructure() {
  const [
    workspace,
    editorSession,
    documentCheckpoint,
    documentSession,
    editorDocumentPort,
    documentService,
    corePublicApi,
    documentPublicApi,
    testPackage,
  ] = await Promise.all([
    read(files.workspace),
    read(files.editorSession),
    read(files.documentCheckpoint),
    read(files.documentSession),
    read(files.editorDocumentPort),
    read(files.documentService),
    read(files.coreApplicationPublicApi),
    read(files.documentPublicApi),
    read(files.testPackage),
  ])

  if (!workspace.includes('- "tests/*"') && !workspace.includes("- 'tests/*'")) {
    fail('pnpm workspace 尚未包含 tests/*。')
  }

  const editorRequirements = [
    'EditorDocumentEvent',
    'captureDocument',
    'subscribeDocumentEvents',
    "kind: 'ready'",
    "kind: 'changed'",
    "source: 'user'",
    'attachEditor',
    'detachEditor',
  ]

  for (const requirement of editorRequirements) {
    if (!editorSession.includes(requirement)) {
      fail(`EditorSession 缺少架构能力：${requirement}`)
    }
  }

  const checkpointRequirements = [
    'DocumentCheckpoint',
    'createDocumentCheckpoint',
    'checkpointsEqual',
    'canonicalDocument',
    'snapshot.document',
  ]

  for (const requirement of checkpointRequirements) {
    if (!documentCheckpoint.includes(requirement)) {
      fail(`DocumentCheckpoint 缺少：${requirement}`)
    }
  }

  const sessionRequirements = [
    'DocumentSessionPhase',
    'DocumentPersistenceState',
    'DocumentSaveTicket',
    'createDocumentSession',
    'initialize',
    'recordDocumentChange',
    'beginSave',
    'completeSave',
    'failSave',
    'beginClosing',
    'completeClosing',
    'isDirty',
  ]

  for (const requirement of sessionRequirements) {
    if (!documentSession.includes(requirement)) {
      fail(`DocumentSession 缺少：${requirement}`)
    }
  }

  const portRequirements = [
    'EditorDocumentPort',
    'EditorDocumentEvent',
    'captureDocument',
    'subscribeDocumentEvents',
  ]

  for (const requirement of portRequirements) {
    if (!editorDocumentPort.includes(requirement)) {
      fail(`EditorDocumentPort 缺少：${requirement}`)
    }
  }

  const serviceRequirements = [
    'createDocumentSession',
    'EditorDocumentPort',
    'subscribeDocumentEvents',
    'captureDocument',
    'recordDocumentChange',
    'beginSave',
    'completeSave',
    'failSave',
    'planApplicationClose',
  ]

  for (const requirement of serviceRequirements) {
    if (!documentService.includes(requirement)) {
      fail(`CanvasDocumentService 缺少：${requirement}`)
    }
  }

  const forbiddenOldImplementation = [
    'bootstrapPending',
    'queueMicrotask',
    'isInitialDocumentBootstrapChange',
    'hasInitialDocumentAndPage',
    'onUserDocumentChange',
    'savedRevision',
    'session.revision',
  ]

  for (const forbidden of forbiddenOldImplementation) {
    if (
      editorSession.includes(forbidden) ||
      documentSession.includes(forbidden) ||
      documentService.includes(forbidden)
    ) {
      fail(`仍存在已废弃实现：${forbidden}`)
    }
  }

  const coreExports = ['EditorDocumentEvent', 'EditorSession', 'createEditorSession']

  for (const requiredExport of coreExports) {
    if (!corePublicApi.includes(requiredExport)) {
      fail(`Canvas application public API 缺少导出：${requiredExport}`)
    }
  }

  const documentExports = [
    'DocumentCheckpoint',
    'DocumentSession',
    'EditorDocumentPort',
    'createDocumentSession',
    'createCanvasDocumentService',
  ]

  for (const requiredExport of documentExports) {
    if (!documentPublicApi.includes(requiredExport)) {
      fail(`Document public API 缺少导出：${requiredExport}`)
    }
  }

  const parsedTestPackage = JSON.parse(testPackage)

  if (parsedTestPackage.name !== '@hybrid-canvas/test-cross-domain-contract') {
    fail('跨域测试包名称配置错误。')
  }

  if (parsedTestPackage.scripts?.test !== 'vitest run document-lifecycle') {
    fail('跨域测试包没有运行 document-lifecycle 测试。')
  }

  console.log('Document lifecycle 架构结构检查通过。')
}

async function findTestFiles(relativeDirectory) {
  const directory = absolute(relativeDirectory)

  const entries = await readdir(directory, {
    withFileTypes: true,
  })

  const results = []

  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory.replaceAll('\\', '/'), entry.name)

    if (entry.isDirectory()) {
      results.push(...(await findTestFiles(relativePath)))

      continue
    }

    if (entry.isFile() && /\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) {
      results.push(relativePath)
    }
  }

  return results
}

async function assertTestsAreCentralized() {
  const businessDirectories = ['editor/core/src', 'editor/document/src']

  const misplacedTests = []

  for (const businessDirectory of businessDirectories) {
    misplacedTests.push(...(await findTestFiles(businessDirectory)))
  }

  if (misplacedTests.length > 0) {
    fail('业务源码目录中仍存在测试文件：\n' + misplacedTests.map((file) => `- ${file}`).join('\n'))
  }

  const expectedTests = [files.documentSessionTest, files.documentServiceTest]

  for (const expectedTest of expectedTests) {
    if (!(await exists(expectedTest))) {
      fail(`缺少测试文件：${expectedTest}`)
    }
  }

  console.log('测试文件位置检查通过。')
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
          ['/d', '/s', '/c', `pnpm ${args.join(' ')}`],
          options,
        )
      : spawnSync('pnpm', args, options)

  if (result.error) {
    throw result.error
  }

  if (result.signal) {
    fail(`pnpm 被信号 ${result.signal} 终止。`)
  }

  if (result.status !== 0) {
    fail(`pnpm ${args.join(' ')} 执行失败，退出码：${String(result.status)}`)
  }
}

function runTargetedVerification() {
  /*
   * tsc is the only authority for TypeScript signatures.
   * No regex-based signature validation is performed.
   */
  runPnpm(['--filter', '@hybrid-canvas/canvas', 'typecheck'])

  runPnpm(['--filter', '@hybrid-canvas/document', 'typecheck'])

  runPnpm(['--filter', '@hybrid-canvas/test-cross-domain-contract', 'typecheck'])

  runPnpm(['--filter', '@hybrid-canvas/test-cross-domain-contract', 'test'])

  runPnpm(['test:architecture'])
}

function runRepositoryVerification() {
  runPnpm(['format:check'])
  runPnpm(['lint'])
  runPnpm(['typecheck'])
  runPnpm(['test'])
}

async function main() {
  await assertRepository()

  if (!shouldRun) {
    console.log(`
Document lifecycle verification runner

该脚本不会修改任何业务代码或测试。

验证内容：

1. Document lifecycle 架构文件完整性
2. 旧 dirty/revision/bootstrap 逻辑已删除
3. 测试只位于专门 tests 目录
4. Canvas 类型检查
5. Document 类型检查
6. Cross-domain tests 类型检查
7. Document lifecycle Vitest
8. 架构测试
9. 全仓库格式、Lint、类型检查和测试

执行：

node tooling\\\\script\\\\refactor.mjs --apply
`)

    return
  }

  console.log('开始验证 Document lifecycle 重构……')

  await assertArchitectureStructure()
  await assertTestsAreCentralized()

  console.log('\n开始执行定向验证。')

  runTargetedVerification()

  console.log('\n定向验证通过，开始执行全仓库验证。')

  runRepositoryVerification()

  console.log(`
Document lifecycle 重构全部验证通过。

测试文件：

- tests/cross-domain-contract/document-lifecycle/document-session.test.ts
- tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts

现在可以重新启动桌面应用，验证：

1. 新建空白画布显示 clean
2. 直接关闭不出现未保存提示
3. 创建图形后显示 dirty
4. Undo 回初始状态后恢复 clean
5. 保存后恢复 clean
`)
}

main().catch((error) => {
  console.error('\nDocument lifecycle 验证失败：')
  console.error(error)
  process.exitCode = 1
})
