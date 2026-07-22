#!/usr/bin/env node

/**
 * 将仓库许可证和仓库元数据统一为 Apache-2.0。
 *
 * 使用：
 *   node tooling/script/refactor.mjs
 *   node tooling/script/refactor.mjs --write
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const SCRIPT_NAME =
  '008-unify-apache-license-metadata'

const REPOSITORY_URL =
  'https://github.com/xiaojianc916/Canvas'

const NPM_REPOSITORY_URL =
  'git+https://github.com/xiaojianc916/Canvas.git'

const TARGET_PATHS = [
  'package.json',
  'Cargo.toml',
  'apps/desktop/src-tauri/Cargo.toml',
  'editor/assets/native/Cargo.toml',
  'editor/persistence/native/Cargo.toml',
  'editor/extensions/native/Cargo.toml',
  'platforms/desktop-runtime/native/Cargo.toml',
]

const argv = process.argv.slice(2)
const writeMode = argv.includes('--write')

main()

function main() {
  validateArguments()

  const root = findRepositoryRoot()

  validateRepository(root)
  validateApacheLicense(root)

  const changes = buildChanges(root).filter(
    (change) =>
      normalizeNewlines(change.original) !==
      normalizeNewlines(change.modified),
  )

  if (changes.length === 0) {
    console.log(
      '无需修改：许可证和仓库元数据已经统一为 Apache-2.0。',
    )
    return
  }

  console.log(
    `\n模式：${writeMode ? 'WRITE' : 'DRY-RUN'}`,
  )
  console.log(`仓库：${root}`)

  console.log('\n计划修改：')

  for (const change of changes) {
    console.log(`- ${change.relativePath}`)
  }

  console.log('\n变更摘要：')
  console.log(
    '- 根 package.json 使用 Apache-2.0',
  )
  console.log(
    '- 增加 npm repository、bugs 和 homepage 元数据',
  )
  console.log(
    '- Cargo workspace 使用 Apache-2.0',
  )
  console.log(
    '- Cargo repository 指向真实 GitHub 仓库',
  )
  console.log(
    '- 所有 Rust crate 继承 workspace license',
  )
  console.log(
    '- 所有 Rust crate 继承 workspace repository',
  )
  console.log(
    '- 保留现有标准 Apache-2.0 LICENSE 全文',
  )

  if (!writeMode) {
    console.log('\n当前为 dry-run，没有写入文件。')
    console.log(
      '执行：node tooling/script/refactor.mjs --write',
    )
    return
  }

  ensureTargetsAreClean(root, changes)

  const backupRoot =
    createBackup(root, changes)

  console.log(
    `\n备份目录：${relative(root, backupRoot)}`,
  )

  try {
    for (const change of changes) {
      writeFileSync(
        change.absolutePath,
        ensureFinalNewline(
          change.modified,
        ),
        'utf8',
      )
    }

    run(
      'pnpm',
      [
        'exec',
        'biome',
        'format',
        '--write',
        'package.json',
      ],
      {
        cwd: root,
        label: '格式化 package.json',
      },
    )

    assertPostconditions(root)

    run(
      'pnpm',
      [
        'exec',
        'biome',
        'check',
        'package.json',
      ],
      {
        cwd: root,
        label: '检查 package.json',
      },
    )

    run(
      'cargo',
      [
        'metadata',
        '--no-deps',
        '--format-version',
        '1',
      ],
      {
        cwd: root,
        label: '验证 Cargo workspace 元数据',
        suppressOutput: true,
      },
    )

    run(
      'pnpm',
      ['test:architecture'],
      {
        cwd: root,
        label: '架构测试',
      },
    )

    run(
      'git',
      [
        'diff',
        '--check',
        '--',
        ...TARGET_PATHS,
      ],
      {
        cwd: root,
        label: 'Git diff 检查',
      },
    )

    console.log('\n修改完成。')
    console.log(
      '根 npm 包、Cargo workspace 和全部 Rust crate 已统一为 Apache-2.0。',
    )
  } catch (error) {
    console.error(
      '\n修改或验证失败，正在恢复原文件……',
    )

    for (const change of changes) {
      copyFileSync(
        join(
          backupRoot,
          change.relativePath,
        ),
        change.absolutePath,
      )
    }

    console.error(
      '已恢复到脚本执行前状态。',
    )

    throw error
  }
}

function validateArguments() {
  for (const argument of argv) {
    if (argument !== '--write') {
      throw new Error(`未知参数：${argument}`)
    }
  }
}

function findRepositoryRoot() {
  const result = spawnSync(
    'git',
    ['rev-parse', '--show-toplevel'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      windowsHide: true,
    },
  )

  if (result.error || result.status !== 0) {
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
  const packageJson = JSON.parse(
    readRequiredText(
      join(root, 'package.json'),
    ),
  )

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error(
      `仓库识别失败：${String(packageJson.name)}`,
    )
  }

  for (const relativePath of TARGET_PATHS) {
    if (
      !existsSync(join(root, relativePath))
    ) {
      throw new Error(
        `必要文件不存在：${relativePath}`,
      )
    }
  }
}

function validateApacheLicense(root) {
  const license = readRequiredText(
    join(root, 'LICENSE'),
  )

  const requiredFragments = [
    'Apache License',
    'Version 2.0, January 2004',
    'TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION',
    'END OF TERMS AND CONDITIONS',
  ]

  for (const fragment of requiredFragments) {
    if (!license.includes(fragment)) {
      throw new Error(
        [
          '根 LICENSE 不是预期的 Apache-2.0 全文。',
          `缺少：${fragment}`,
          '脚本拒绝自动替换法律文本。',
        ].join('\n'),
      )
    }
  }
}

function buildChanges(root) {
  return TARGET_PATHS.map(
    (relativePath) => {
      const absolutePath =
        join(root, relativePath)

      const original =
        readRequiredText(absolutePath)

      const modified =
        relativePath === 'package.json'
          ? transformPackageJson(original)
          : relativePath === 'Cargo.toml'
            ? transformWorkspaceCargo(
                original,
              )
            : transformMemberCargo(
                original,
                relativePath,
              )

      return {
        relativePath,
        absolutePath,
        original,
        modified,
      }
    },
  )
}

function transformPackageJson(source) {
  const packageJson = JSON.parse(source)

  const {
    name,
    version,
    private: isPrivate,
    description,
    license: _license,
    repository: _repository,
    bugs: _bugs,
    homepage: _homepage,
    ...remaining
  } = packageJson

  const transformed = {
    name,
    version,
    private: isPrivate,
    description,
    license: 'Apache-2.0',
    repository: {
      type: 'git',
      url: NPM_REPOSITORY_URL,
    },
    bugs: {
      url: `${REPOSITORY_URL}/issues`,
    },
    homepage: `${REPOSITORY_URL}#readme`,
    ...remaining,
  }

  return `${JSON.stringify(
    transformed,
    null,
    2,
  )}\n`
}

function transformWorkspaceCargo(source) {
  let next = normalizeNewlines(source)

  next = replaceCargoMetadataValue(
    next,
    'license',
    '"Apache-2.0"',
  )

  next = replaceCargoMetadataValue(
    next,
    'repository',
    `"${REPOSITORY_URL}"`,
  )

  return next
}

function replaceCargoMetadataValue(
  source,
  property,
  value,
) {
  const pattern = new RegExp(
    `^${escapeRegExp(property)}\\s*=\\s*.+$`,
    'mu',
  )

  const matches = source.match(
    new RegExp(
      `^${escapeRegExp(property)}\\s*=\\s*.+$`,
      'gmu',
    ),
  )

  if (!matches || matches.length !== 1) {
    throw new Error(
      `Cargo workspace 中 ${property} 应当且只能出现一次`,
    )
  }

  return source.replace(
    pattern,
    `${property} = ${value}`,
  )
}

function transformMemberCargo(
  source,
  relativePath,
) {
  let next = normalizeNewlines(source)

  if (
    !next.startsWith('[package]') &&
    !next.startsWith('\uFEFF[package]')
  ) {
    throw new Error(
      `${relativePath} 缺少 [package]`,
    )
  }

  next = ensureWorkspaceField(
    next,
    relativePath,
    'license',
  )

  next = ensureWorkspaceField(
    next,
    relativePath,
    'repository',
  )

  return next
}

function ensureWorkspaceField(
  source,
  relativePath,
  field,
) {
  const workspaceLine =
    `${field}.workspace = true`

  if (source.includes(workspaceLine)) {
    return source
  }

  const explicitPattern = new RegExp(
    `^${escapeRegExp(field)}\\s*=\\s*.+$`,
    'mu',
  )

  if (explicitPattern.test(source)) {
    return source.replace(
      explicitPattern,
      workspaceLine,
    )
  }

  const packageSectionEnd =
    findTomlSectionEnd(source, '[package]')

  if (packageSectionEnd < 0) {
    throw new Error(
      `${relativePath} 无法定位 [package] 结束位置`,
    )
  }

  const packageSection =
    source.slice(0, packageSectionEnd)

  const insertionCandidates = [
    'license.workspace = true',
    'authors.workspace = true',
    'rust-version.workspace = true',
    'edition.workspace = true',
    /^license\s*=\s*.+$/mu,
    /^authors\s*=\s*.+$/mu,
    /^edition\s*=\s*.+$/mu,
    /^version\s*=\s*.+$/mu,
    /^name\s*=\s*.+$/mu,
  ]

  for (
    const candidate of insertionCandidates
  ) {
    const match =
      typeof candidate === 'string'
        ? findLiteralLine(
            packageSection,
            candidate,
          )
        : packageSection.match(candidate)

    if (!match) {
      continue
    }

    const matchedText =
      typeof match === 'string'
        ? match
        : match[0]

    const insertionIndex =
      packageSection.lastIndexOf(
        matchedText,
      ) + matchedText.length

    return (
      source.slice(0, insertionIndex) +
      `\n${workspaceLine}` +
      source.slice(insertionIndex)
    )
  }

  throw new Error(
    `${relativePath} 无法找到 ${field} 的安全插入位置`,
  )
}

function findTomlSectionEnd(
  source,
  section,
) {
  const sectionStart =
    source.indexOf(section)

  if (sectionStart < 0) {
    return -1
  }

  const nextSection = source.indexOf(
    '\n[',
    sectionStart + section.length,
  )

  return nextSection < 0
    ? source.length
    : nextSection + 1
}

function findLiteralLine(
  source,
  expected,
) {
  return source
    .split('\n')
    .find(
      (line) => line.trim() === expected,
    )
}

function assertPostconditions(root) {
  const packageJson = JSON.parse(
    readRequiredText(
      join(root, 'package.json'),
    ),
  )

  if (
    packageJson.license !==
    'Apache-2.0'
  ) {
    throw new Error(
      'package.json license 不是 Apache-2.0',
    )
  }

  if (
    packageJson.repository?.url !==
    NPM_REPOSITORY_URL
  ) {
    throw new Error(
      'package.json repository 不正确',
    )
  }

  if (
    packageJson.bugs?.url !==
    `${REPOSITORY_URL}/issues`
  ) {
    throw new Error(
      'package.json bugs URL 不正确',
    )
  }

  if (
    packageJson.homepage !==
    `${REPOSITORY_URL}#readme`
  ) {
    throw new Error(
      'package.json homepage 不正确',
    )
  }

  const workspaceCargo =
    readRequiredText(
      join(root, 'Cargo.toml'),
    )

  const workspaceFragments = [
    'license = "Apache-2.0"',
    `repository = "${REPOSITORY_URL}"`,
  ]

  for (
    const fragment of workspaceFragments
  ) {
    if (
      !workspaceCargo.includes(fragment)
    ) {
      throw new Error(
        `Cargo workspace 缺少：${fragment}`,
      )
    }
  }

  const forbiddenWorkspaceFragments = [
    'license = "Proprietary"',
    'example.invalid',
  ]

  for (
    const fragment of forbiddenWorkspaceFragments
  ) {
    if (
      workspaceCargo.includes(fragment)
    ) {
      throw new Error(
        `Cargo workspace 仍残留旧元数据：${fragment}`,
      )
    }
  }

  for (
    const relativePath of TARGET_PATHS.slice(2)
  ) {
    const cargo = readRequiredText(
      join(root, relativePath),
    )

    if (
      !cargo.includes(
        'license.workspace = true',
      )
    ) {
      throw new Error(
        `${relativePath} 未继承 workspace license`,
      )
    }

    if (
      !cargo.includes(
        'repository.workspace = true',
      )
    ) {
      throw new Error(
        `${relativePath} 未继承 workspace repository`,
      )
    }

    const forbiddenMemberFragments = [
      'license = "MIT OR Apache-2.0"',
      'license = "Proprietary"',
      'example.invalid',
    ]

    for (
      const fragment of forbiddenMemberFragments
    ) {
      if (cargo.includes(fragment)) {
        throw new Error(
          `${relativePath} 仍残留旧许可证或仓库元数据：${fragment}`,
        )
      }
    }
  }
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
        (change) => change.relativePath,
      ),
    ],
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    },
  )

  if (result.error || result.status !== 0) {
    throw new Error(
      '无法检查目标文件状态',
    )
  }

  if (result.stdout.trim()) {
    throw new Error(
      [
        '目标文件存在未提交修改，脚本拒绝覆盖：',
        result.stdout.trim(),
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

    mkdirSync(dirname(destination), {
      recursive: true,
    })

    copyFileSync(
      change.absolutePath,
      destination,
    )
  }

  return backupRoot
}

function escapeRegExp(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/gu,
    '\\$&',
  )
}

function normalizeNewlines(value) {
  return value
    .replace(/^\uFEFF/u, '')
    .replace(/\r\n/g, '\n')
}

function ensureFinalNewline(value) {
  return `${normalizeNewlines(value).replace(/\s*$/u, '')}\n`
}

function readRequiredText(path) {
  if (!existsSync(path)) {
    throw new Error(`文件不存在：${path}`)
  }

  return readFileSync(path, 'utf8')
}

function run(
  command,
  commandArgs,
  {
    cwd,
    label,
    suppressOutput = false,
  },
) {
  const invocation =
    createCommandInvocation(
      command,
      commandArgs,
    )

  console.log(`\n[${label}]`)
  console.log(
    `$ ${command} ${commandArgs.join(' ')}`,
  )

  const result = spawnSync(
    invocation.command,
    invocation.args,
    {
      cwd,
      encoding: 'utf8',
      stdio: suppressOutput
        ? 'pipe'
        : 'inherit',
      shell: false,
      windowsHide: true,
    },
  )

  if (result.error) {
    throw new Error(
      `${label} 无法启动：${result.error.message}`,
    )
  }

  if (result.status !== 0) {
    throw new Error(
      [
        `${label} 失败，退出码 ${String(result.status)}`,
        suppressOutput
          ? result.stdout
          : '',
        suppressOutput
          ? result.stderr
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }
}

function createCommandInvocation(
  command,
  commandArgs,
) {
  if (process.platform !== 'win32') {
    return {
      command,
      args: commandArgs,
    }
  }

  const commandsRequiringCmd =
    new Set([
      'corepack',
      'npm',
      'npx',
      'pnpm',
      'yarn',
    ])

  if (
    !commandsRequiringCmd.has(command)
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
    quoteWindowsCommandArgument(command),
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

  if (/[\r\n&|<>^%!]/u.test(text)) {
    throw new Error(
      `命令参数包含不允许的字符：${text}`,
    )
  }

  if (text.length === 0) {
    return '""'
  }

  if (!/[\s"]/u.test(text)) {
    return text
  }

  return `"${text.replaceAll('"', '""')}"`
}