#!/usr/bin/env node

/**
 * 删除裸 TLEdititorSnapshot 隐式兼容路径，只允许正式 .draw 容器。
 *
 * 使用：
 *   node tooling/script/refactor.mjs
 *   node tooling/script/refactor.mjs --write
 *   node tooling/script/refactor.mjs --write --skip-verify
 *
 * 回滚：
 *   node tooling/script/refactor.mjs --rollback <备份目录>
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path'
import { spawnSync } from 'node:child_process'

const SCRIPT_NAME =
  '001-remove-legacy-snapshot-fallback'

const REVIEW_BASELINE =
  '0cfe4cb0507cd9a48c4f76a7fe5ee21537aa3823'

const SOURCE_PATH =
  'editor/document/src/application/canvas-document-service.ts'

const TEST_PATH =
  'tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts'

const argv = process.argv.slice(2)

const writeMode = argv.includes('--write')
const skipVerify = argv.includes('--skip-verify')

const rollbackArgumentIndex =
  argv.indexOf('--rollback')

const rollbackPath =
  rollbackArgumentIndex >= 0
    ? argv[rollbackArgumentIndex + 1]
    : null

main()

function main() {
  validateArguments()

  const root = findRepositoryRoot()

  if (rollbackPath) {
    rollback(root, rollbackPath)
    return
  }

  validateRepository(root)

  const sourceAbsolutePath =
    join(root, SOURCE_PATH)

  const testAbsolutePath =
    join(root, TEST_PATH)

  const originalSource =
    readRequiredText(sourceAbsolutePath)

  const originalTest =
    readRequiredText(testAbsolutePath)

  const nextSource =
    transformSource(originalSource)

  const nextTest =
    transformTest(originalTest)

  const changes = [
    {
      relativePath: SOURCE_PATH,
      absolutePath: sourceAbsolutePath,
      original: originalSource,
      next: nextSource,
    },
    {
      relativePath: TEST_PATH,
      absolutePath: testAbsolutePath,
      original: originalTest,
      next: nextTest,
    },
  ].filter(
    (change) =>
      change.original !== change.next,
  )

  if (changes.length === 0) {
    console.log(
      '无需修改：目标重构已经完成。',
    )
    return
  }

  console.log(
    `\n模式：${writeMode ? 'WRITE' : 'DRY-RUN'}`,
  )

  console.log(`仓库：${root}`)

  console.log(
    `基线：${getGitOutput(root, [
      'rev-parse',
      'HEAD',
    ])}`,
  )

  console.log('\n计划修改：')

  for (const change of changes) {
    console.log(`- ${change.relativePath}`)
  }

  printDiffs(root, changes)

  if (!writeMode) {
    console.log(
      '\n当前为 dry-run，没有写入文件。',
    )

    console.log(
      '执行写入：node tooling/script/refactor.mjs --write',
    )

    return
  }

  ensureTargetsAreClean(root, changes)

  const backupRoot =
    createBackup(root, changes)

  console.log(
    `\n备份目录：${relative(
      root,
      backupRoot,
    )}`,
  )

  try {
    for (const change of changes) {
      writeFileSync(
        change.absolutePath,
        change.next,
        'utf8',
      )
    }

    formatChangedFiles(root, changes)

    assertPostconditions(root)

    if (!skipVerify) {
      runVerification(root)
    } else {
      console.warn(
        '\n已通过 --skip-verify 跳过项目验证。',
      )
    }

    console.log('\n修改完成。')

    console.log(
      '已删除裸 TLEditorSnapshot 隐式兼容读取路径。',
    )

    console.log(
      '现在文档打开流程只接受正式 .draw 容器。',
    )

    console.log('\n回滚命令：')

    console.log(
      `node tooling/script/refactor.mjs --rollback "${relative(
        root,
        backupRoot,
      )}"`,
    )
  } catch (error) {
    console.error(
      '\n修改或验证失败，正在自动恢复原文件……',
    )

    restoreBackup(root, backupRoot)

    console.error(
      '已恢复到脚本执行前状态。',
    )

    throw error
  }
}

function validateArguments() {
  const allowedStandaloneArguments =
    new Set([
      '--write',
      '--skip-verify',
      '--rollback',
    ])

  for (
    let index = 0;
    index < argv.length;
    index += 1
  ) {
    const argument = argv[index]

    if (argument === '--rollback') {
      index += 1
      continue
    }

    if (
      argument.startsWith('--') &&
      !allowedStandaloneArguments.has(
        argument,
      )
    ) {
      throw new Error(
        `未知参数：${argument}`,
      )
    }
  }

  if (
    rollbackArgumentIndex >= 0 &&
    !rollbackPath
  ) {
    throw new Error(
      '--rollback 后必须提供备份目录',
    )
  }

  if (
    rollbackPath &&
    (writeMode || skipVerify)
  ) {
    throw new Error(
      '--rollback 不能与 --write 或 --skip-verify 同时使用',
    )
  }

  if (skipVerify && !writeMode) {
    throw new Error(
      '--skip-verify 只能与 --write 一起使用',
    )
  }
}

function findRepositoryRoot() {
  const result = spawnSync(
    'git',
    [
      'rev-parse',
      '--show-toplevel',
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      windowsHide: true,
    },
  )

  if (
    result.error ||
    result.status !== 0
  ) {
    throw new Error(
      [
        '当前目录不在 Git 仓库中。',
        result.error?.message,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }

  return resolve(result.stdout.trim())
}

function validateRepository(root) {
  const packageJsonPath =
    join(root, 'package.json')

  const packageJson = JSON.parse(
    readRequiredText(packageJsonPath),
  )

  if (
    packageJson.name !== 'hybrid-canvas'
  ) {
    throw new Error(
      [
        '仓库识别失败。',
        'package.json.name 应为 hybrid-canvas。',
        `实际值：${String(
          packageJson.name,
        )}`,
      ].join('\n'),
    )
  }

  for (const target of [
    SOURCE_PATH,
    TEST_PATH,
  ]) {
    const absolutePath =
      join(root, target)

    if (!existsSync(absolutePath)) {
      throw new Error(
        `目标文件不存在：${target}`,
      )
    }

    runGit(
      root,
      [
        'ls-files',
        '--error-unmatch',
        target,
      ],
      {
        quiet: true,
      },
    )
  }

  validateBaseline(root)
}

function validateBaseline(root) {
  const currentHead =
    getGitOutput(root, [
      'rev-parse',
      'HEAD',
    ])

  const baselineExists = spawnSync(
    'git',
    [
      'cat-file',
      '-e',
      `${REVIEW_BASELINE}^{commit}`,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    },
  )

  if (
    baselineExists.error ||
    baselineExists.status !== 0
  ) {
    throw new Error(
      [
        `找不到审查基线：${REVIEW_BASELINE}`,
        '请确认当前仓库包含该提交。',
      ].join('\n'),
    )
  }

  const ancestorCheck = spawnSync(
    'git',
    [
      'merge-base',
      '--is-ancestor',
      REVIEW_BASELINE,
      currentHead,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    },
  )

  if (ancestorCheck.status !== 0) {
    throw new Error(
      [
        '当前 HEAD 不是审查基线的后继提交。',
        `审查基线：${REVIEW_BASELINE}`,
        `当前 HEAD：${currentHead}`,
        '脚本已停止，避免修改不相关分支。',
      ].join('\n'),
    )
  }
}

function transformSource(source) {
  if (
    hasCompletedSourceTransformation(
      source,
    )
  ) {
    return source
  }

  const obsoleteImport =
    "import type { TLEditorSnapshot } from 'tldraw'\n"

  const oldOpenStatement =
    '    const initialSnapshot = parseEditorSnapshot(content)'

  const newOpenStatement =
    '    const initialSnapshot = parseDrawDocument(content).content'

  const legacyStart =
    'function parseEditorSnapshot(json: string): TLEditorSnapshot {'

  const nextFunctionStart =
    'function getFileTitle(filePath: string): string {'

  assertContainsExactlyOnce(
    source,
    obsoleteImport,
    SOURCE_PATH,
  )

  assertContainsExactlyOnce(
    source,
    oldOpenStatement,
    SOURCE_PATH,
  )

  assertContainsExactlyOnce(
    source,
    legacyStart,
    SOURCE_PATH,
  )

  assertContainsExactlyOnce(
    source,
    nextFunctionStart,
    SOURCE_PATH,
  )

  let next = source.replace(
    obsoleteImport,
    '',
  )

  next = next.replace(
    oldOpenStatement,
    newOpenStatement,
  )

  const legacyStartIndex =
    next.indexOf(legacyStart)

  const nextFunctionIndex =
    next.indexOf(nextFunctionStart)

  if (
    legacyStartIndex < 0 ||
    nextFunctionIndex < 0 ||
    legacyStartIndex >= nextFunctionIndex
  ) {
    throw new Error(
      `${SOURCE_PATH} 中旧兼容代码边界异常`,
    )
  }

  const beforeLegacyBlock =
    next.slice(0, legacyStartIndex)

  const afterLegacyBlock =
    next.slice(nextFunctionIndex)

  next =
    beforeLegacyBlock.replace(
      /\n+$/u,
      '\n\n',
    ) + afterLegacyBlock

  const forbiddenFragments = [
    'function parseEditorSnapshot',
    'function isEditorSnapshot',
    'JSON.parse(json)',
    obsoleteImport.trim(),
  ]

  for (
    const fragment of forbiddenFragments
  ) {
    if (next.includes(fragment)) {
      throw new Error(
        `${SOURCE_PATH} 中仍残留旧实现：${fragment}`,
      )
    }
  }

  return next
}

function hasCompletedSourceTransformation(
  source,
) {
  const hasNewStatement =
    source.includes(
      'const initialSnapshot = parseDrawDocument(content).content',
    )

  const hasLegacyParser =
    source.includes(
      'function parseEditorSnapshot',
    ) ||
    source.includes(
      'function isEditorSnapshot',
    )

  const hasObsoleteImport =
    source.includes(
      "import type { TLEditorSnapshot } from 'tldraw'",
    )

  if (
    hasNewStatement &&
    !hasLegacyParser &&
    !hasObsoleteImport
  ) {
    return true
  }

  if (
    hasNewStatement ||
    !hasLegacyParser ||
    !hasObsoleteImport
  ) {
    throw new Error(
      [
        `${SOURCE_PATH} 处于部分修改状态。`,
        '脚本拒绝覆盖无法安全识别的人工修改。',
      ].join('\n'),
    )
  }

  return false
}

function transformTest(source) {
  const testMarker =
    "it('rejects unversioned raw tldraw snapshots instead of enabling a hidden legacy format'"

  if (source.includes(testMarker)) {
    return source
  }

  const describeStart =
    "describe('CanvasDocumentService lifecycle contract', () => {"

  assertContainsExactlyOnce(
    source,
    describeStart,
    TEST_PATH,
  )

  const describeEndIndex =
    source.lastIndexOf('\n})')

  if (describeEndIndex < 0) {
    throw new Error(
      `${TEST_PATH} 中找不到 describe 结束边界`,
    )
  }

  const testCase = `

  it('rejects unversioned raw tldraw snapshots instead of enabling a hidden legacy format', async () => {
    const createEditorSession = vi.fn()

    const service = createCanvasDocumentService({
      editorSessions: {
        create: createEditorSession,
        close: vi.fn(),
        dispose: vi.fn(),
      },
      persistence: {
        read: vi.fn().mockResolvedValue(
          JSON.stringify(
            snapshot({
              shapes: [],
            }),
          ),
        ),
        write: vi.fn(),
      },
      fileSelection: {
        selectOpenPath: vi.fn().mockResolvedValue('/tmp/legacy.draw'),
        selectSavePath: vi.fn(),
      },
      extensions: [],
    })

    await expect(service.open()).rejects.toBeDefined()

    expect(createEditorSession).not.toHaveBeenCalled()
  })
`

  return (
    source.slice(
      0,
      describeEndIndex,
    ) +
    testCase +
    source.slice(describeEndIndex)
  )
}

function ensureTargetsAreClean(
  root,
  changes,
) {
  const result = spawnSync(
    'git',
    [
      'status',
      '--porcelain',
      '--',
      ...changes.map(
        (change) =>
          change.relativePath,
      ),
    ],
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    },
  )

  if (
    result.error ||
    result.status !== 0
  ) {
    throw new Error(
      [
        '无法检查目标文件状态。',
        result.error?.message,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }

  const dirty = result.stdout.trim()

  if (dirty) {
    throw new Error(
      [
        '目标文件存在未提交修改，脚本拒绝覆盖：',
        dirty,
        '',
        '请先提交或暂存现有修改。',
      ].join('\n'),
    )
  }
}

function createBackup(root, changes) {
  const timestamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')

  const backupRoot = join(
    root,
    '.refactor-backup',
    SCRIPT_NAME,
    timestamp,
  )

  for (const change of changes) {
    const destination = join(
      backupRoot,
      change.relativePath,
    )

    mkdirSync(
      dirname(destination),
      {
        recursive: true,
      },
    )

    copyFileSync(
      change.absolutePath,
      destination,
    )
  }

  const metadata = {
    script: SCRIPT_NAME,
    createdAt:
      new Date().toISOString(),
    reviewBaseline: REVIEW_BASELINE,
    originalHead: getGitOutput(
      root,
      [
        'rev-parse',
        'HEAD',
      ],
    ),
    files: changes.map(
      (change) =>
        change.relativePath,
    ),
  }

  writeFileSync(
    join(
      backupRoot,
      'backup.json',
    ),
    `${JSON.stringify(
      metadata,
      null,
      2,
    )}\n`,
    'utf8',
  )

  return backupRoot
}

function restoreBackup(
  root,
  backupRoot,
) {
  const metadataPath = join(
    backupRoot,
    'backup.json',
  )

  const metadata = JSON.parse(
    readRequiredText(metadataPath),
  )

  for (
    const relativePath of metadata.files
  ) {
    const backupFile = join(
      backupRoot,
      relativePath,
    )

    const destination = join(
      root,
      relativePath,
    )

    if (!existsSync(backupFile)) {
      throw new Error(
        `备份文件缺失：${relativePath}`,
      )
    }

    mkdirSync(
      dirname(destination),
      {
        recursive: true,
      },
    )

    copyFileSync(
      backupFile,
      destination,
    )
  }
}

function rollback(
  root,
  requestedPath,
) {
  const backupRoot =
    isAbsolute(requestedPath)
      ? resolve(requestedPath)
      : resolve(
          root,
          requestedPath,
        )

  const allowedBackupParent =
    resolve(
      root,
      '.refactor-backup',
      SCRIPT_NAME,
    )

  const relativeBackupPath =
    relative(
      allowedBackupParent,
      backupRoot,
    )

  if (
    relativeBackupPath.startsWith('..') ||
    isAbsolute(relativeBackupPath)
  ) {
    throw new Error(
      `拒绝读取脚本备份目录之外的路径：${backupRoot}`,
    )
  }

  const metadataPath = join(
    backupRoot,
    'backup.json',
  )

  if (!existsSync(metadataPath)) {
    throw new Error(
      `备份元数据不存在：${metadataPath}`,
    )
  }

  const metadata = JSON.parse(
    readRequiredText(metadataPath),
  )

  if (
    metadata.script !== SCRIPT_NAME ||
    !Array.isArray(metadata.files)
  ) {
    throw new Error(
      '备份元数据格式不正确',
    )
  }

  restoreBackup(root, backupRoot)

  console.log('回滚完成：')

  for (
    const relativePath of metadata.files
  ) {
    console.log(`- ${relativePath}`)
  }
}

function formatChangedFiles(
  root,
  changes,
) {
  run(
    'pnpm',
    [
      'exec',
      'biome',
      'format',
      '--write',
      ...changes.map(
        (change) =>
          change.relativePath,
      ),
    ],
    {
      cwd: root,
      label: '格式化修改文件',
    },
  )
}

function assertPostconditions(root) {
  const source = readRequiredText(
    join(root, SOURCE_PATH),
  )

  const test = readRequiredText(
    join(root, TEST_PATH),
  )

  const requiredSourceFragments = [
    'const initialSnapshot = parseDrawDocument(content).content',
  ]

  const forbiddenSourceFragments = [
    'function parseEditorSnapshot',
    'function isEditorSnapshot',
    'JSON.parse(json)',
    "import type { TLEditorSnapshot } from 'tldraw'",
  ]

  for (
    const fragment of requiredSourceFragments
  ) {
    if (!source.includes(fragment)) {
      throw new Error(
        `修改后缺少预期代码：${fragment}`,
      )
    }
  }

  for (
    const fragment of forbiddenSourceFragments
  ) {
    if (source.includes(fragment)) {
      throw new Error(
        `修改后仍残留旧实现：${fragment}`,
      )
    }
  }

  if (
    !test.includes(
      'rejects unversioned raw tldraw snapshots instead of enabling a hidden legacy format',
    )
  ) {
    throw new Error(
      '修改后缺少旧格式拒绝契约测试',
    )
  }

  runGit(
    root,
    [
      'diff',
      '--check',
      '--',
      SOURCE_PATH,
      TEST_PATH,
    ],
    {
      quiet: false,
    },
  )
}

function runVerification(root) {
  const steps = [
    {
      label: 'Biome 检查',
      command: 'pnpm',
      args: [
        'exec',
        'biome',
        'check',
        SOURCE_PATH,
        TEST_PATH,
      ],
    },
    {
      label: '架构测试',
      command: 'pnpm',
      args: [
        'test:architecture',
      ],
    },
    {
      label:
        'TypeScript 类型检查',
      command: 'pnpm',
      args: [
        'typecheck',
      ],
    },
    {
      label: '项目测试',
      command: 'pnpm',
      args: [
        'test',
      ],
    },
  ]

  console.log('\n开始验证：')

  for (const step of steps) {
    run(
      step.command,
      step.args,
      {
        cwd: root,
        label: step.label,
      },
    )
  }
}

function printDiffs(root, changes) {
  const temporaryRoot =
    mkdtempSync(
      join(
        tmpdir(),
        `${SCRIPT_NAME}-`,
      ),
    )

  try {
    for (
      let index = 0;
      index < changes.length;
      index += 1
    ) {
      const change =
        changes[index]

      const beforePath = join(
        temporaryRoot,
        `${index}-before`,
      )

      const afterPath = join(
        temporaryRoot,
        `${index}-after`,
      )

      writeFileSync(
        beforePath,
        change.original,
        'utf8',
      )

      writeFileSync(
        afterPath,
        change.next,
        'utf8',
      )

      const result = spawnSync(
        'git',
        [
          'diff',
          '--no-index',
          '--no-prefix',
          '--',
          beforePath,
          afterPath,
        ],
        {
          cwd: root,
          encoding: 'utf8',
          windowsHide: true,
        },
      )

      if (result.error) {
        throw new Error(
          `无法生成 diff：${result.error.message}`,
        )
      }

      console.log(
        `\n--- ${change.relativePath}`,
      )

      console.log(
        (result.stdout || '')
          .trimEnd(),
      )
    }
  } finally {
    rmSync(
      temporaryRoot,
      {
        recursive: true,
        force: true,
      },
    )
  }
}

function assertContainsExactlyOnce(
  source,
  expected,
  filePath,
) {
  const first =
    source.indexOf(expected)

  const last =
    source.lastIndexOf(expected)

  if (first < 0) {
    throw new Error(
      `${filePath} 中找不到预期内容：\n${expected}`,
    )
  }

  if (first !== last) {
    throw new Error(
      `${filePath} 中预期内容出现多次，拒绝模糊修改：\n${expected}`,
    )
  }
}

function readRequiredText(path) {
  if (!existsSync(path)) {
    throw new Error(
      `文件不存在：${path}`,
    )
  }

  return readFileSync(
    path,
    'utf8',
  )
}

function runGit(
  root,
  gitArgs,
  options = {},
) {
  return run(
    'git',
    gitArgs,
    {
      cwd: root,
      label: `git ${gitArgs.join(' ')}`,
      quiet:
        options.quiet ?? false,
    },
  )
}

function getGitOutput(
  root,
  gitArgs,
  options = {},
) {
  const result = spawnSync(
    'git',
    gitArgs,
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    },
  )

  if (
    result.error ||
    result.status !== 0
  ) {
    throw new Error(
      [
        `Git 命令失败：git ${gitArgs.join(' ')}`,
        result.error?.message,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }

  const output =
    result.stdout.trim()

  if (
    !output &&
    !options.allowEmpty
  ) {
    throw new Error(
      `Git 命令没有返回内容：git ${gitArgs.join(' ')}`,
    )
  }

  return output
}

/**
 * 统一执行外部命令。
 *
 * Windows + Node.js 26：
 * 不直接执行 pnpm.cmd，而是通过 cmd.exe 执行。
 *
 * Linux/macOS：
 * 直接执行目标命令。
 */
function run(
  command,
  commandArgs,
  {
    cwd,
    label,
    quiet = false,
  },
) {
  const invocation =
    createCommandInvocation(
      command,
      commandArgs,
    )

  if (!quiet) {
    console.log(`\n[${label}]`)

    console.log(
      `$ ${command} ${commandArgs.join(' ')}`,
    )
  }

  const result = spawnSync(
    invocation.command,
    invocation.args,
    {
      cwd,
      encoding: 'utf8',
      stdio:
        quiet
          ? 'pipe'
          : 'inherit',
      shell: false,
      windowsHide: true,
    },
  )

  if (result.error) {
    throw new Error(
      [
        `${label} 无法启动：${result.error.message}`,
        `请求命令：${command}`,
        `实际入口：${invocation.command}`,
        `实际参数：${invocation.args.join(' ')}`,
        '',
        '请检查：',
        `  ${command} --version`,
        process.platform === 'win32'
          ? `  where.exe ${command}`
          : `  command -v ${command}`,
      ].join('\n'),
    )
  }

  if (result.status !== 0) {
    const details = quiet
      ? [
          result.stdout,
          result.stderr,
        ]
          .filter(Boolean)
          .join('\n')
      : ''

    throw new Error(
      `${label} 失败，退出码 ${String(
        result.status,
      )}${details ? `\n${details}` : ''}`,
    )
  }

  return result
}

function createCommandInvocation(
  command,
  commandArgs,
) {
  if (
    process.platform !== 'win32'
  ) {
    return {
      command,
      args: commandArgs,
    }
  }

  const commandNamesRequiringCmd =
    new Set([
      'corepack',
      'npm',
      'npx',
      'pnpm',
      'yarn',
    ])

  if (
    !commandNamesRequiringCmd.has(
      command,
    )
  ) {
    return {
      command,
      args: commandArgs,
    }
  }

  const comspec =
    process.env.ComSpec ||
    process.env.COMSPEC ||
    'C:\\Windows\\System32\\cmd.exe'

  const commandLine = [
    quoteWindowsCommandArgument(
      command,
    ),
    ...commandArgs.map(
      quoteWindowsCommandArgument,
    ),
  ].join(' ')

  return {
    command: comspec,
    args: [
      '/d',
      '/s',
      '/c',
      commandLine,
    ],
  }
}

function quoteWindowsCommandArgument(
  value,
) {
  const text = String(value)

  if (
    /[\r\n&|<>^%!]/u.test(text)
  ) {
    throw new Error(
      `命令参数包含不允许的 Windows Shell 字符：${text}`,
    )
  }

  if (text.length === 0) {
    return '""'
  }

  if (!/[\s"]/u.test(text)) {
    return text
  }

  return `"${text.replaceAll(
    '"',
    '""',
  )}"`
}