#!/usr/bin/env node

/**
 * 完全迁移 lucide-react -> @mynaui/icons-react
 *
 * 用法：
 *   将本文件保存为 scripts/migrate-icons-to-mynaui.mjs
 *   在仓库根目录执行：
 *
 *   node scripts/migrate-icons-to-mynaui.mjs
 *
 * 可选：
 *   node scripts/migrate-icons-to-mynaui.mjs --skip-checks
 *   node scripts/migrate-icons-to-mynaui.mjs --dry-run
 */

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const TARGET_PACKAGE = '@mynaui/icons-react'
const TARGET_VERSION = '0.4.11'
const LEGACY_PACKAGE = 'lucide-react'

const DRY_RUN = process.argv.includes('--dry-run')
const SKIP_CHECKS = process.argv.includes('--skip-checks')

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.turbo',
  '.vite',
  'coverage',
  'dist',
  'node_modules',
  'target',
])

const SOURCE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
])

/**
 * 按优先级列出 Myna UI 中可能对应的正式名称。
 *
 * 脚本会读取实际安装的 @mynaui/icons-react 导出，只选择真实存在的名称。
 * 如果没有可靠匹配，脚本会终止，而不是保留 Lucide 或生成兼容层。
 */
const SEMANTIC_ICON_CANDIDATES = {
  BookOpen: ['BookOpen', 'Book', 'Books'],
  Boxes: ['Boxes', 'BoxMultiple', 'Box'],
  ChartNoAxesCombined: [
    'ChartNoAxesCombined',
    'ChartCombined',
    'ChartBar',
    'ChartLine',
    'Chart',
  ],
  CheckIcon: ['Check', 'CheckCircle'],
  ChevronsUpDownIcon: [
    'ChevronsUpDown',
    'ChevronUpDown',
    'SelectorVertical',
    'UnfoldVertical',
  ],
  CircleHelp: ['CircleHelp', 'CircleQuestion', 'HelpCircle', 'QuestionCircle'],
  Code2: ['Code2', 'Code'],
  Command: ['Command', 'Terminal'],
  Copy: ['Copy', 'WindowRestore', 'Windows'],
  ExternalLink: ['ExternalLink', 'ArrowUpRight', 'OpenExternal'],
  FilePlus2: ['FilePlus2', 'FilePlus', 'DocumentPlus'],
  Files: ['Files', 'FileMultiple', 'Documents'],
  FileText: ['FileText', 'DocumentText', 'File'],
  FolderOpen: ['FolderOpen', 'Folder'],
  Grid2X2: ['Grid2X2', 'GridFour', 'Grid', 'Dashboard'],
  Image: ['Image', 'ImageSquare', 'Picture'],
  Layers3: ['Layers3', 'Layers', 'Layer'],
  MessageCircle: ['MessageCircle', 'ChatCircle', 'Message'],
  Network: ['Network', 'Nodes', 'ShareNetwork'],
  PanelLeftClose: [
    'PanelLeftClose',
    'SidebarLeftClose',
    'SidebarClose',
    'PanelClose',
  ],
  PanelLeftOpen: [
    'PanelLeftOpen',
    'SidebarLeftOpen',
    'SidebarOpen',
    'PanelOpen',
  ],
  RefreshCcw: ['RefreshCcw', 'Refresh', 'ArrowClockwise'],
  SearchIcon: ['Search', 'SearchIcon'],
  Settings: ['Settings', 'Cog', 'Gear'],
  Square: ['Square', 'WindowMaximize'],
  X: ['X', 'Close'],
}

const changedFiles = new Set()

main().catch((error) => {
  console.error('\n迁移失败：')
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 1
})

async function main() {
  assertRepositoryRoot()

  console.log(`迁移 ${LEGACY_PACKAGE} -> ${TARGET_PACKAGE}`)
  console.log(DRY_RUN ? '模式：dry-run\n' : '')

  updateWorkspaceCatalog()
  updateWorkspacePackageJsonFiles()
  removeShadcnLucideConfiguration()
  addIconArchitectureGuard()

  if (DRY_RUN) {
    console.log('\nDry-run 完成，未写入文件，也未安装依赖。')
    printChangedFiles()
    return
  }

  console.log('\n安装新依赖并刷新 pnpm-lock.yaml...')
  run('pnpm', ['install'])

  const mynaExports = await loadMynaExports()

  console.log(`检测到 ${mynaExports.size} 个 Myna UI React 导出。`)

  migrateSourceImports(mynaExports)
  assertNoLegacySourceImports()
  assertNoLegacyDirectDependencies()

  formatChangedFiles()

  if (!SKIP_CHECKS) {
    runChecks()
  }

  console.log('\n迁移完成。')
  printChangedFiles()
}

function assertRepositoryRoot() {
  const requiredFiles = [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
  ]

  for (const file of requiredFiles) {
    if (!existsSync(join(ROOT, file))) {
      throw new Error(
        `请在 Canvas 仓库根目录运行脚本，缺少：${file}`,
      )
    }
  }
}

function updateWorkspaceCatalog() {
  const file = join(ROOT, 'pnpm-workspace.yaml')
  let content = readText(file)

  const legacyLinePattern =
    /^([ \t]*)lucide-react:\s*["']?[^"'#\n]+["']?\s*(?:#.*)?$/m

  const targetLinePattern =
    /^([ \t]*)["']?@mynaui\/icons-react["']?:\s*["']?[^"'#\n]+["']?\s*(?:#.*)?$/m

  if (targetLinePattern.test(content)) {
    content = content.replace(
      targetLinePattern,
      `$1"${TARGET_PACKAGE}": "${TARGET_VERSION}"`,
    )

    content = content.replace(legacyLinePattern, '')
  } else if (legacyLinePattern.test(content)) {
    content = content.replace(
      legacyLinePattern,
      `$1"${TARGET_PACKAGE}": "${TARGET_VERSION}"`,
    )
  } else {
    const catalogPattern = /^catalog:\s*$/m
    const match = catalogPattern.exec(content)

    if (!match) {
      throw new Error('pnpm-workspace.yaml 中没有找到 catalog:')
    }

    const insertionPoint = match.index + match[0].length

    content =
      content.slice(0, insertionPoint) +
      `\n  "${TARGET_PACKAGE}": "${TARGET_VERSION}"` +
      content.slice(insertionPoint)
  }

  content = content.replace(/\n{3,}/g, '\n\n')

  writeTextIfChanged(file, content)
}

function updateWorkspacePackageJsonFiles() {
  const packageJsonFiles = findFiles(
    ROOT,
    (file) => file.endsWith('package.json'),
  )

  for (const file of packageJsonFiles) {
    const source = readText(file)
    const json = JSON.parse(source)
    let changed = false

    for (const sectionName of [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
      'peerDependencies',
    ]) {
      const section = json[sectionName]

      if (!section || typeof section !== 'object') {
        continue
      }

      if (!(LEGACY_PACKAGE in section)) {
        continue
      }

      const legacySpecifier = section[LEGACY_PACKAGE]

      delete section[LEGACY_PACKAGE]

      if (!(TARGET_PACKAGE in section)) {
        section[TARGET_PACKAGE] =
          legacySpecifier === 'catalog:' ? 'catalog:' : 'catalog:'
      }

      json[sectionName] = sortObject(section)
      changed = true
    }

    if (!changed) {
      continue
    }

    writeTextIfChanged(file, `${JSON.stringify(json, null, 2)}\n`)
  }
}

function removeShadcnLucideConfiguration() {
  const file = join(
    ROOT,
    'foundations',
    'design-system',
    'components.json',
  )

  if (!existsSync(file)) {
    return
  }

  const json = JSON.parse(readText(file))

  if (json.iconLibrary !== 'lucide') {
    return
  }

  /**
   * shadcn 当前没有稳定的 mynaui iconLibrary 枚举值。
   * 因此删除该字段，防止以后生成新的 lucide-react import。
   */
  delete json.iconLibrary

  writeTextIfChanged(file, `${JSON.stringify(json, null, 2)}\n`)
}

function addIconArchitectureGuard() {
  const guardFile = join(
    ROOT,
    'tests',
    'architecture',
    'check-icon-library.mjs',
  )

  const guardSource = `#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

const root = resolve(process.cwd())

const forbiddenPackages = [
  'lucide-react',
  'react-icons',
  '@heroicons/',
  '@tabler/icons-react',
]

const ignoredDirectories = new Set([
  '.git',
  '.turbo',
  '.vite',
  'coverage',
  'dist',
  'node_modules',
  'target',
])

const sourceExtensions = new Set([
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
])

const violations = []

walk(root)

if (violations.length > 0) {
  console.error('检测到被禁止的产品图标库：')
  console.error('')

  for (const violation of violations) {
    console.error(
      '- ' +
        violation.file +
        ':' +
        String(violation.line) +
        ' -> ' +
        violation.packageName,
    )
  }

  console.error('')
  console.error('产品 UI 只能使用 @mynaui/icons-react。')
  process.exit(1)
}

console.log('Icon library architecture check passed.')

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) {
      continue
    }

    const absolutePath = join(directory, entry)
    const stats = statSync(absolutePath)

    if (stats.isDirectory()) {
      walk(absolutePath)
      continue
    }

    if (
      entry === 'package.json' ||
      sourceExtensions.has(extensionOf(entry))
    ) {
      inspectFile(absolutePath)
    }
  }
}

function inspectFile(file) {
  if (file === new URL(import.meta.url).pathname) {
    return
  }

  const lines = readFileSync(file, 'utf8').split(/\\r?\\n/)

  for (const [index, line] of lines.entries()) {
    for (const packageName of forbiddenPackages) {
      if (line.includes(packageName)) {
        violations.push({
          file: relative(root, file),
          line: index + 1,
          packageName,
        })
      }
    }
  }
}

function extensionOf(file) {
  const index = file.lastIndexOf('.')
  return index >= 0 ? file.slice(index) : ''
}
`

  writeTextIfChanged(guardFile, guardSource)

  const rootPackageFile = join(ROOT, 'package.json')
  const packageJson = JSON.parse(readText(rootPackageFile))
  const currentScript = packageJson.scripts?.['test:architecture']

  if (typeof currentScript !== 'string') {
    throw new Error('根 package.json 缺少 scripts.test:architecture')
  }

  const guardCommand =
    'node tests/architecture/check-icon-library.mjs'

  if (!currentScript.includes(guardCommand)) {
    packageJson.scripts['test:architecture'] =
      `${currentScript} && ${guardCommand}`

    writeTextIfChanged(
      rootPackageFile,
      `${JSON.stringify(packageJson, null, 2)}\n`,
    )
  }
}

async function loadMynaExports() {
  const candidatePackageDirectories = [
    join(ROOT, 'foundations', 'design-system'),
    join(ROOT, 'features', 'workspace'),
    join(ROOT, 'apps', 'desktop'),
  ]

  let resolvedEntry = null

  for (const packageDirectory of candidatePackageDirectories) {
    const packageJsonFile = join(packageDirectory, 'package.json')

    if (!existsSync(packageJsonFile)) {
      continue
    }

    try {
      const requireFromPackage = createRequire(packageJsonFile)
      resolvedEntry = requireFromPackage.resolve(TARGET_PACKAGE)
      break
    } catch {
      // 尝试下一个 workspace package。
    }
  }

  if (!resolvedEntry) {
    throw new Error(
      `安装后仍无法解析 ${TARGET_PACKAGE}，请检查 pnpm install 输出。`,
    )
  }

  const module = await import(pathToFileURL(resolvedEntry).href)

  return new Set(
    Object.keys(module).filter(
      (name) =>
        name !== 'default' &&
        /^[A-Z][A-Za-z0-9]*$/.test(name),
    ),
  )
}

function migrateSourceImports(mynaExports) {
  const sourceFiles = findFiles(
    ROOT,
    (file) => SOURCE_EXTENSIONS.has(extensionOf(file)),
  )

  const unresolved = []

  for (const file of sourceFiles) {
    let content = readText(file)

    if (!content.includes(LEGACY_PACKAGE)) {
      continue
    }

    const originalContent = content

    const namedImportPattern =
      /import\s+(type\s+)?\{([\s\S]*?)\}\s+from\s+['"]lucide-react['"];?/g

    content = content.replace(
      namedImportPattern,
      (fullMatch, typeKeyword, rawSpecifiers) => {
        if (typeKeyword) {
          throw new Error(
            `${relative(ROOT, file)} 使用了 lucide-react 类型导入；` +
              '请改为最小 React ComponentType 契约。',
          )
        }

        const parsedSpecifiers =
          parseNamedImportSpecifiers(rawSpecifiers)

        const replacements = []
        const targetNames = []

        for (const specifier of parsedSpecifiers) {
          const resolvedName = resolveMynaIconName(
            specifier.imported,
            mynaExports,
          )

          if (!resolvedName) {
            unresolved.push({
              file: relative(ROOT, file),
              icon: specifier.imported,
              suggestions: findClosestExports(
                specifier.imported,
                mynaExports,
              ),
            })

            continue
          }

          targetNames.push(resolvedName)

          if (specifier.local !== resolvedName) {
            replacements.push({
              from: specifier.local,
              to: resolvedName,
            })
          }
        }

        if (
          parsedSpecifiers.some(
            (specifier) =>
              !resolveMynaIconName(
                specifier.imported,
                mynaExports,
              ),
          )
        ) {
          return fullMatch
        }

        for (const replacement of replacements) {
          content = replaceIdentifier(
            content,
            replacement.from,
            replacement.to,
          )
        }

        const uniqueTargetNames = [...new Set(targetNames)].sort()

        if (uniqueTargetNames.length <= 3) {
          return `import { ${uniqueTargetNames.join(', ')} } from '${TARGET_PACKAGE}'`
        }

        return [
          'import {',
          ...uniqueTargetNames.map((name) => `  ${name},`),
          `} from '${TARGET_PACKAGE}'`,
        ].join('\n')
      },
    )

    if (content !== originalContent) {
      writeTextIfChanged(file, content)
    }
  }

  if (unresolved.length > 0) {
    const lines = [
      '以下 Lucide 图标没有可靠的 Myna UI 对应项：',
      '',
    ]

    for (const item of unresolved) {
      lines.push(
        `- ${item.file}: ${item.icon}`,
        `  候选：${item.suggestions.join(', ') || '无'}`,
      )
    }

    lines.push(
      '',
      '脚本已拒绝猜测，因此没有创建兼容层。',
      '请把对应关系加入 SEMANTIC_ICON_CANDIDATES 后重新执行。',
    )

    throw new Error(lines.join('\n'))
  }
}

function parseNamedImportSpecifiers(rawSpecifiers) {
  return rawSpecifiers
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      const match =
        /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(
          value,
        )

      if (!match) {
        throw new Error(
          `无法解析图标 import specifier：${value}`,
        )
      }

      return {
        imported: match[1],
        local: match[2] ?? match[1],
      }
    })
}

function resolveMynaIconName(legacyName, mynaExports) {
  const directCandidates = [
    legacyName,
    stripIconSuffix(legacyName),
    ...(SEMANTIC_ICON_CANDIDATES[legacyName] ?? []),
  ]

  for (const candidate of directCandidates) {
    if (mynaExports.has(candidate)) {
      return candidate
    }
  }

  const normalizedLegacyName = normalizeIconName(legacyName)
  const normalizedMatches = [...mynaExports].filter(
    (candidate) =>
      normalizeIconName(candidate) === normalizedLegacyName,
  )

  if (normalizedMatches.length === 1) {
    return normalizedMatches[0]
  }

  const ranked = rankExports(legacyName, mynaExports)

  if (ranked.length === 0) {
    return null
  }

  const best = ranked[0]
  const second = ranked[1]

  /**
   * 只有高置信度且与第二候选拉开差距时才自动采用。
   */
  if (
    best.score >= 0.82 &&
    (!second || best.score - second.score >= 0.18)
  ) {
    return best.name
  }

  return null
}

function stripIconSuffix(name) {
  return name.endsWith('Icon') ? name.slice(0, -4) : name
}

function normalizeIconName(name) {
  return splitIdentifier(stripIconSuffix(name))
    .filter(
      (token) =>
        !['icon', 'outline', 'regular'].includes(token),
    )
    .sort()
    .join('')
}

function findClosestExports(legacyName, mynaExports) {
  return rankExports(legacyName, mynaExports)
    .slice(0, 8)
    .map(({ name }) => name)
}

function rankExports(legacyName, mynaExports) {
  const legacyTokens = new Set(
    splitIdentifier(stripIconSuffix(legacyName)),
  )

  return [...mynaExports]
    .map((name) => ({
      name,
      score: tokenSimilarity(
        legacyTokens,
        new Set(splitIdentifier(name)),
      ),
    }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.name.localeCompare(right.name),
    )
}

function splitIdentifier(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

function tokenSimilarity(left, right) {
  const intersection = [...left].filter((token) =>
    right.has(token),
  ).length

  const union = new Set([...left, ...right]).size

  return union === 0 ? 0 : intersection / union
}

function replaceIdentifier(content, from, to) {
  if (from === to) {
    return content
  }

  const pattern = new RegExp(
    `(?<![\\w$])${escapeRegExp(from)}(?![\\w$])`,
    'g',
  )

  return content.replace(pattern, to)
}

function assertNoLegacySourceImports() {
  const sourceFiles = findFiles(
    ROOT,
    (file) => SOURCE_EXTENSIONS.has(extensionOf(file)),
  )

  const violations = sourceFiles.filter((file) =>
    readText(file).includes(LEGACY_PACKAGE),
  )

  if (violations.length > 0) {
    throw new Error(
      [
        `仍然存在 ${LEGACY_PACKAGE} 引用：`,
        ...violations.map(
          (file) => `- ${relative(ROOT, file)}`,
        ),
      ].join('\n'),
    )
  }
}

function assertNoLegacyDirectDependencies() {
  const packageJsonFiles = findFiles(
    ROOT,
    (file) => file.endsWith('package.json'),
  )

  const violations = []

  for (const file of packageJsonFiles) {
    const json = JSON.parse(readText(file))

    for (const sectionName of [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
      'peerDependencies',
    ]) {
      if (json[sectionName]?.[LEGACY_PACKAGE]) {
        violations.push(
          `${relative(ROOT, file)} -> ${sectionName}`,
        )
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(
      [
        `仍然存在 ${LEGACY_PACKAGE} 直接依赖：`,
        ...violations.map((value) => `- ${value}`),
      ].join('\n'),
    )
  }
}

function formatChangedFiles() {
  const formattable = [...changedFiles].filter((file) => {
    const extension = extensionOf(file)

    return (
      SOURCE_EXTENSIONS.has(extension) ||
      extension === '.json'
    )
  })

  if (formattable.length === 0) {
    return
  }

  console.log('\n格式化变更文件...')

  run('pnpm', [
    'exec',
    'biome',
    'format',
    '--write',
    ...formattable.map((file) => relative(ROOT, file)),
  ])
}

function runChecks() {
  console.log('\n运行验证...')

  run('node', [
    'tests/architecture/check-icon-library.mjs',
  ])

  run('pnpm', ['format:check'])
  run('pnpm', ['lint'])
  run('pnpm', ['typecheck'])
  run('pnpm', ['test'])
  run('pnpm', ['test:architecture'])
  run('pnpm', ['build:desktop'])
  run('pnpm', ['analyze:bundle:check'])
}

function run(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`)

  execFileSync(command, args, {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
  })
}

function findFiles(directory, predicate) {
  const files = []

  walk(directory)

  return files

  function walk(currentDirectory) {
    for (const entry of readdirSync(currentDirectory)) {
      if (IGNORED_DIRECTORIES.has(entry)) {
        continue
      }

      const absolutePath = join(currentDirectory, entry)
      const stats = statSync(absolutePath)

      if (stats.isDirectory()) {
        walk(absolutePath)
        continue
      }

      if (predicate(absolutePath)) {
        files.push(absolutePath)
      }
    }
  }
}

function readText(file) {
  return readFileSync(file, 'utf8')
}

function writeTextIfChanged(file, content) {
  const previous = existsSync(file) ? readText(file) : null

  if (previous === content) {
    return
  }

  changedFiles.add(resolve(file))

  if (DRY_RUN) {
    console.log(`[dry-run] 修改 ${relative(ROOT, file)}`)
    return
  }

  writeFileSync(file, content, 'utf8')
  console.log(`修改 ${relative(ROOT, file)}`)
}

function sortObject(object) {
  return Object.fromEntries(
    Object.entries(object).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )
}

function extensionOf(file) {
  const name = file.slice(file.lastIndexOf('/') + 1)
  const index = name.lastIndexOf('.')

  return index >= 0 ? name.slice(index) : ''
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function printChangedFiles() {
  if (changedFiles.size === 0) {
    console.log('没有需要修改的文件。')
    return
  }

  console.log('\n变更文件：')

  for (const file of [...changedFiles].sort()) {
    console.log(`- ${relative(ROOT, file)}`)
  }
}