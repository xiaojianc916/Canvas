#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const shouldApply = process.argv.includes('--apply')

const paths = {
  packageJson: path.join(root, 'package.json'),

  editorSession: path.join(
    root,
    'editor/core/src/runtime/editor-session.ts',
  ),

  documentService: path.join(
    root,
    'editor/document/src/application/canvas-document-service.ts',
  ),

  documentServiceTest: path.join(
    root,
    'editor/document/src/application/canvas-document-service.test.ts',
  ),
}

function fail(message) {
  throw new Error(`[dirty-state-refactor] ${message}`)
}

async function exists(filePath) {
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

async function assertRepository() {
  if (!(await exists(paths.packageJson))) {
    fail(
      '当前目录不存在 package.json，请在 hybrid-canvas 仓库根目录执行。',
    )
  }

  const packageJson = JSON.parse(
    await readFile(paths.packageJson, 'utf8'),
  )

  if (packageJson.name !== 'hybrid-canvas') {
    fail(
      '当前目录不是 hybrid-canvas 仓库根目录：' +
        `package.json.name=${String(packageJson.name)}`,
    )
  }

  for (const filePath of [
    paths.editorSession,
    paths.documentService,
    paths.documentServiceTest,
  ]) {
    if (!(await exists(filePath))) {
      fail(
        `缺少重构文件：${path.relative(root, filePath)}`,
      )
    }
  }
}

/**
 * 跨平台执行命令。
 *
 * Windows 下：
 * - 不直接执行 pnpm.cmd，避免部分 Node 版本出现 EINVAL。
 * - 不使用 shell:true，避免 DEP0190。
 * - 显式调用 cmd.exe /d /s /c pnpm ...。
 *
 * Linux/macOS 下直接执行命令。
 */
function run(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`)

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
            command,
            ...args,
          ],
          options,
        )
      : spawnSync(command, args, options)

  if (result.error) {
    throw result.error
  }

  if (result.signal) {
    fail(
      `${command} 被信号 ${result.signal} 终止。`,
    )
  }

  if (result.status !== 0) {
    fail(
      `${command} 执行失败，退出码：${String(
        result.status,
      )}`,
    )
  }
}

/**
 * 修复 TypeScript noPropertyAccessFromIndexSignature 引发的
 * TS4111 错误。
 *
 * 此操作是幂等的，可以重复执行。
 */
async function fixIndexSignatureAccess() {
  let source = await readFile(
    paths.editorSession,
    'utf8',
  )

  const original = source

  const replacements = [
    {
      from: 'entry.changes',
      to: "entry['changes']",
    },
    {
      from: 'changes.removed',
      to: "changes['removed']",
    },
    {
      from: 'changes.added',
      to: "changes['added']",
    },
    {
      from: 'changes.updated',
      to: "changes['updated']",
    },
    {
      from: 'record.typeName',
      to: "record['typeName']",
    },
  ]

  for (const replacement of replacements) {
    source = source.replaceAll(
      replacement.from,
      replacement.to,
    )
  }

  if (source !== original) {
    await writeFile(paths.editorSession, source)

    console.log(
      `已修复：${path.relative(
        root,
        paths.editorSession,
      )}`,
    )
  } else {
    console.log(
      `无需修改：${path.relative(
        root,
        paths.editorSession,
      )}`,
    )
  }
}

/**
 * 验证 EditorSession 中的脏状态基础设施。
 */
function validateEditorSession(source) {
  const requirements = [
    {
      text: 'function isInitialDocumentBootstrapChange(',
      message:
        '缺少 isInitialDocumentBootstrapChange 初始化识别函数。',
    },
    {
      text: "const changes = entry['changes']",
      message:
        "尚未正确使用 entry['changes']。",
    },
    {
      text: "changes['removed']",
      message:
        "尚未正确使用 changes['removed']。",
    },
    {
      text: "changes['added']",
      message:
        "尚未正确使用 changes['added']。",
    },
    {
      text: "changes['updated']",
      message:
        "尚未正确使用 changes['updated']。",
    },
    {
      text: "record['typeName']",
      message:
        "尚未正确使用 record['typeName']。",
    },
    {
      text: 'capturePersistenceSnapshot()',
      message:
        '缺少原子持久化快照捕获。',
    },
    {
      text: 'getDocumentFingerprint()',
      message:
        '缺少文档指纹读取。',
    },
    {
      text: 'onDocumentChange(listener)',
      message:
        '缺少文档变更监听。',
    },
    {
      text: "kind: 'baseline-established'",
      message:
        '缺少新建画布初始化基线事件。',
    },
    {
      text: "kind: 'content-changed'",
      message:
        '缺少真实文档变更事件。',
    },
    {
      text: 'createDocumentFingerprint(',
      message:
        '缺少文档指纹生成函数。',
    },
    {
      text: 'stableStringify(',
      message:
        '缺少稳定序列化函数。',
    },
  ]

  for (const requirement of requirements) {
    if (!source.includes(requirement.text)) {
      fail(requirement.message)
    }
  }

  const forbiddenPatterns = [
    'entry.changes',
    'changes.removed',
    'changes.added',
    'changes.updated',
    'record.typeName',
    'onUserDocumentChange(listener)',
  ]

  const remainingForbiddenPatterns =
    forbiddenPatterns.filter((pattern) =>
      source.includes(pattern),
    )

  if (remainingForbiddenPatterns.length > 0) {
    fail(
      'editor-session.ts 中仍存在旧代码：' +
        remainingForbiddenPatterns.join(', '),
    )
  }
}

/**
 * 验证 CanvasDocumentService 使用文档指纹作为保存点。
 */
function validateDocumentService(source) {
  const requirements = [
    {
      text: 'currentFingerprint: string',
      message:
        'CanvasDocumentService 缺少 currentFingerprint。',
    },
    {
      text: 'savedFingerprint: string',
      message:
        'CanvasDocumentService 缺少 savedFingerprint。',
    },
    {
      text: 'editor.capturePersistenceSnapshot()',
      message:
        'CanvasDocumentService 未使用原子持久化快照。',
    },
    {
      text: 'editor.getDocumentFingerprint()',
      message:
        'CanvasDocumentService 未读取最新文档指纹。',
    },
    {
      text: 'editor.onDocumentChange((change) =>',
      message:
        'CanvasDocumentService 未监听文档指纹变更。',
    },
    {
      text: "change.kind === 'baseline-established'",
      message:
        'CanvasDocumentService 未处理初始化基线。',
    },
    {
      text:
        'session.currentFingerprint === session.savedFingerprint',
      message:
        'CanvasDocumentService 未比较当前文档和保存点。',
    },
    {
      text: "initialState === 'clean'",
      message:
        'CanvasDocumentService 缺少初始 clean 保存点。',
    },
  ]

  for (const requirement of requirements) {
    if (!source.includes(requirement.text)) {
      fail(requirement.message)
    }
  }

  const forbiddenPatterns = [
    'onUserDocumentChange(',
    'revision: number',
    'savedRevision: number',
    'session.revision += 1',
  ]

  const remainingForbiddenPatterns =
    forbiddenPatterns.filter((pattern) =>
      source.includes(pattern),
    )

  if (remainingForbiddenPatterns.length > 0) {
    fail(
      'canvas-document-service.ts 中仍存在旧 revision 逻辑：' +
        remainingForbiddenPatterns.join(', '),
    )
  }
}

/**
 * 验证关键回归测试存在。
 */
function validateRegressionTests(source) {
  const requiredTests = [
    'keeps a newly mounted empty canvas clean',
    'marks real document content changes as dirty',
    'returns to clean after undo reaches the savepoint',
    'does not treat a second identical fingerprint as a change',
  ]

  for (const testName of requiredTests) {
    if (!source.includes(testName)) {
      fail(`缺少回归测试：${testName}`)
    }
  }
}

/**
 * 在真正运行 TypeScript 和测试之前，先确认重构没有缺失。
 */
async function validateRefactorStructure() {
  const [
    editorSource,
    documentSource,
    testSource,
  ] = await Promise.all([
    readFile(paths.editorSession, 'utf8'),
    readFile(paths.documentService, 'utf8'),
    readFile(paths.documentServiceTest, 'utf8'),
  ])

  validateEditorSession(editorSource)
  validateDocumentService(documentSource)
  validateRegressionTests(testSource)

  console.log('脏状态重构结构检查通过。')
}

/**
 * 格式化代码并执行受影响模块的验证。
 */
function verify() {
  const affectedFiles = [
    path.relative(root, paths.editorSession),
    path.relative(root, paths.documentService),
    path.relative(root, paths.documentServiceTest),
  ]

  run('pnpm', [
    'exec',
    'biome',
    'format',
    '--write',
    ...affectedFiles,
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
Canvas 文档脏状态重构验证脚本

将执行：

1. 修复 editor-session.ts 的 TS4111 索引签名错误。
2. 检查 EditorSession 初始化基线逻辑。
3. 检查 CanvasDocumentService 文档指纹保存点。
4. 检查 Undo 回到保存点的回归测试。
5. 格式化受影响文件。
6. 执行 Canvas 核心类型检查。
7. 执行 Document 模块类型检查。
8. 执行 Document 回归测试。
9. 执行架构测试。

Windows 命令执行方式：

cmd.exe /d /s /c pnpm ...

不会直接执行 pnpm.cmd，不会使用 shell:true。

执行：

node tooling\\\\script\\\\refactor.mjs --apply
`)
    return
  }

  console.log(
    '开始修复并验证 Canvas 文档脏状态重构……',
  )

  await fixIndexSignatureAccess()
  await validateRefactorStructure()

  console.log('\n代码检查完成，开始执行验证。')

  verify()

  console.log(`
Canvas 文档脏状态重构验证完成。

已验证：

- 新建空白画布初始化保持 clean
- tldraw 默认 document/page 初始化不会被误判为用户修改
- 相机、选择、工具和视口状态不会触发 dirty
- 真实 TLStore document 内容变化会进入 dirty
- Undo 回到保存点后会恢复 clean
- 保存快照和保存点指纹来自同一次同步捕获
- 保存期间继续编辑不会被错误标记为 clean
- Canvas 核心类型检查通过
- Document 模块类型检查通过
- Document 回归测试通过
- 架构测试通过
`)
}

main().catch((error) => {
  console.error('\n修复或验证失败：')
  console.error(error)
  process.exitCode = 1
})