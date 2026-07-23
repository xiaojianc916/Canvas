#!/usr/bin/env node

/**
 * 完全迁移 lucide-react -> @mynaui/icons-react
 *
 * 执行：
 *   node refactor.mjs --apply
 *
 * 仅预览依赖和配置修改：
 *   node refactor.mjs
 *
 * 跳过验证：
 *   node refactor.mjs --apply --skip-checks
 */

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import {
  dirname,
  extname,
  join,
  relative,
  resolve,
} from 'node:path'
import {
  fileURLToPath,
  pathToFileURL,
} from 'node:url'

const ROOT = process.cwd()
const CURRENT_SCRIPT = resolve(fileURLToPath(import.meta.url))

const APPLY = process.argv.includes('--apply')
const SKIP_CHECKS = process.argv.includes('--skip-checks')

const LEGACY_PACKAGE = 'lucide-react'
const TARGET_PACKAGE = '@mynaui/icons-react'
const TARGET_VERSION = '0.4.11'

const ARCHITECTURE_GUARD_FILE = resolve(
  ROOT,
  'tests',
  'architecture',
  'check-icon-library.mjs',
)

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
  '.cjs',
  '.js',
  '.jsx',
  '.mjs',
  '.ts',
  '.tsx',
])

const changedFiles = new Set()

/**
 * Lucide 名称到 Myna UI 正式名称的候选关系。
 *
 * 脚本会读取实际安装的 @mynaui/icons-react 导出，
 * 只采用真实存在的第一个候选名称。
 *
 * 如果找不到可靠对应项，脚本会终止并列出候选，
 * 不会保留 Lucide、生成兼容层或复制旧 SVG。
 */
const SEMANTIC_ICON_CANDIDATES = {
  BookOpen: [
    'BookOpen',
    'Book',
    'Books',
  ],

  Boxes: [
    'Boxes',
    'BoxMultiple',
    'Box',
  ],

  ChartNoAxesCombined: [
  'ChartNoAxesCombined',
],

  CheckIcon: [
  'Check',
],

  ChevronsUpDownIcon: [
  'ChevronsUpDown',
],
  CircleHelp: [
  'QuestionCircle',
],

  Code2: [
    'Code',
  ],

  Command: [
    'Command',
    'Terminal',
  ],

  Copy: [
    'Copy',
    'WindowRestore',
    'Windows',
  ],

  ExternalLink: [
    'ExternalLink',
    'ArrowUpRight',
    'OpenExternal',
  ],

  FilePlus2: [
    'FilePlus',
  ],

  Files: [
  'FolderTwo',
],

  FileText: [
    'FileText',
    'DocumentText',
    'File',
  ],

  FolderOpen: [
    'FolderOpen',
    'Folder',
  ],

  Grid2X2: [
    'Grid',
  ],

  Image: [
    'Image',
    'ImageSquare',
    'Picture',
  ],

  Layers3: [
  'LayersThree',
],

  MessageCircle: [
    'Message',
  ],

  Network: [
  'ChartNetwork',
],

  PanelLeftClose: [
    'PanelLeftClose',
  ],

  PanelLeftOpen: [
    'PanelLeftOpen',
  
  ],

  RefreshCcw: [
  'RefreshAlt',
],

  SearchIcon: [
    'Search',
  ],

  Settings: [
    'Cog',
  ],

  Square: [
    'Square',
    'WindowMaximize',
  ],

  X: [
    'X',
    'Close',
  ],
}

main().catch((error) => {
  console.error('\n迁移失败：')

  if (error instanceof Error) {
    console.error(error.stack ?? error.message)
  } else {
    console.error(String(error))
  }

  process.exitCode = 1
})

async function main() {
  assertRepositoryRoot()

  console.log(
    `迁移 ${LEGACY_PACKAGE} -> ${TARGET_PACKAGE}`,
  )

  if (!APPLY) {
    console.log('\n当前为预览模式，不会写入文件。')
    console.log('正式执行请运行：')
    console.log('\n  node refactor.mjs --apply\n')
  }

  updateWorkspaceCatalog()
  updateWorkspacePackageJsonFiles()
  removeShadcnLucideConfiguration()
  addIconArchitectureGuard()

  if (!APPLY) {
    console.log('\n预览完成。')
    printChangedFiles()
    return
  }

  console.log('\n安装 Myna UI Icons 并刷新锁文件...')

  run('pnpm', ['install'])

  const mynaExports = await loadMynaExports()

  console.log(
    `\n检测到 ${mynaExports.size} 个 Myna UI React 导出。`,
  )

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
    const absolutePath = join(ROOT, file)

    if (!existsSync(absolutePath)) {
      throw new Error(
        `请在仓库根目录运行脚本，缺少：${file}`,
      )
    }
  }
}

function updateWorkspaceCatalog() {
  const file = join(ROOT, 'pnpm-workspace.yaml')
  let content = readText(file)

  const legacyLinePattern =
    /^([ \t]*)["']?lucide-react["']?\s*:\s*["']?[^"'#\n]+["']?\s*(?:#.*)?$/m

  const targetLinePattern =
    /^([ \t]*)["']?@mynaui\/icons-react["']?\s*:\s*["']?[^"'#\n]+["']?\s*(?:#.*)?$/m

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
      throw new Error(
        'pnpm-workspace.yaml 中没有找到 catalog:',
      )
    }

    const insertionPoint =
      match.index + match[0].length

    content =
      content.slice(0, insertionPoint) +
      `\n  "${TARGET_PACKAGE}": "${TARGET_VERSION}"` +
      content.slice(insertionPoint)
  }

  content = content
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')

  writeTextIfChanged(file, content)
}

function updateWorkspacePackageJsonFiles() {
  const packageJsonFiles = findFiles(
    ROOT,
    (file) => file.endsWith('package.json'),
  )

  for (const file of packageJsonFiles) {
    const json = readJson(file)
    let changed = false

    for (const sectionName of [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
      'peerDependencies',
    ]) {
      const section = json[sectionName]

      if (
        !section ||
        typeof section !== 'object' ||
        Array.isArray(section)
      ) {
        continue
      }

      if (!(LEGACY_PACKAGE in section)) {
        continue
      }

      delete section[LEGACY_PACKAGE]

      if (!(TARGET_PACKAGE in section)) {
        section[TARGET_PACKAGE] = 'catalog:'
      }

      json[sectionName] = sortObject(section)
      changed = true
    }

    if (!changed) {
      continue
    }

    writeTextIfChanged(
      file,
      `${JSON.stringify(json, null, 2)}\n`,
    )
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

  const json = readJson(file)

  if (!('iconLibrary' in json)) {
    return
  }

  if (json.iconLibrary !== 'lucide') {
    return
  }

  /**
   * shadcn 当前没有稳定的 mynaui iconLibrary 枚举值。
   * 删除该字段，避免以后自动生成 lucide-react import。
   */
  delete json.iconLibrary

  writeTextIfChanged(
    file,
    `${JSON.stringify(json, null, 2)}\n`,
  )
}

function addIconArchitectureGuard() {
  const guardSource = String.raw`#!/usr/bin/env node

import {
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

const root = resolve(process.cwd())

const allowedIconPackage = '@mynaui/icons-react'

const forbiddenExactPackages = new Set([
  'lucide-react',
  'react-icons',
  '@tabler/icons-react',
])

const forbiddenPackagePrefixes = [
  '@heroicons/',
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
  '.cjs',
  '.js',
  '.jsx',
  '.mjs',
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
  console.error(
    '产品 UI 只能直接使用 ' + allowedIconPackage + '。',
  )

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

    if (entry === 'package.json') {
      inspectPackageJson(absolutePath)
      continue
    }

    if (sourceExtensions.has(extname(entry))) {
      inspectSourceFile(absolutePath)
    }
  }
}

function inspectPackageJson(file) {
  const json = parseJson(file)

  for (const sectionName of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    const section = json[sectionName]

    if (
      !section ||
      typeof section !== 'object' ||
      Array.isArray(section)
    ) {
      continue
    }

    for (const packageName of Object.keys(section)) {
      if (isForbiddenPackage(packageName)) {
        violations.push({
          file: relative(root, file),
          line: 1,
          packageName,
        })
      }
    }
  }
}

function inspectSourceFile(file) {
  const content = readFileSync(file, 'utf8')
  const lines = content.split(/\r?\n/)

  const importPatterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]

  for (const [lineIndex, line] of lines.entries()) {
    for (const pattern of importPatterns) {
      pattern.lastIndex = 0

      for (
        let match = pattern.exec(line);
        match;
        match = pattern.exec(line)
      ) {
        const packageName = match[1]

        if (isForbiddenPackage(packageName)) {
          violations.push({
            file: relative(root, file),
            line: lineIndex + 1,
            packageName,
          })
        }
      }
    }
  }
}

function isForbiddenPackage(packageName) {
  if (forbiddenExactPackages.has(packageName)) {
    return true
  }

  return forbiddenPackagePrefixes.some(
    (prefix) =>
      packageName === prefix.slice(0, -1) ||
      packageName.startsWith(prefix),
  )
}

function parseJson(file) {
  const content = readFileSync(file, 'utf8')
  const normalized =
    content.charCodeAt(0) === 0xfeff
      ? content.slice(1)
      : content

  try {
    return JSON.parse(normalized)
  } catch (error) {
    throw new Error(
      '无法解析 JSON：' +
        relative(root, file) +
        '\n' +
        String(error),
    )
  }
}
`

  writeTextIfChanged(
    ARCHITECTURE_GUARD_FILE,
    guardSource,
  )

  const rootPackageFile = join(ROOT, 'package.json')
  const packageJson = readJson(rootPackageFile)

  const currentScript =
    packageJson.scripts?.['test:architecture']

  if (typeof currentScript !== 'string') {
    throw new Error(
      '根 package.json 缺少 scripts.test:architecture',
    )
  }

  const guardCommand =
    'node tests/architecture/check-icon-library.mjs'

  if (currentScript.includes(guardCommand)) {
    return
  }

  packageJson.scripts['test:architecture'] =
    `${currentScript} && ${guardCommand}`

  writeTextIfChanged(
    rootPackageFile,
    `${JSON.stringify(packageJson, null, 2)}\n`,
  )
}

async function loadMynaExports() {
  const candidatePackageDirectories = [
    join(ROOT, 'foundations', 'design-system'),
    join(ROOT, 'features', 'workspace'),
    join(ROOT, 'apps', 'desktop'),
    ROOT,
  ]

  let resolvedEntry = null

  for (const packageDirectory of candidatePackageDirectories) {
    const packageJsonFile = join(
      packageDirectory,
      'package.json',
    )

    if (!existsSync(packageJsonFile)) {
      continue
    }

    try {
      const requireFromPackage =
        createRequire(packageJsonFile)

      resolvedEntry =
        requireFromPackage.resolve(TARGET_PACKAGE)

      break
    } catch {
      // 继续尝试下一个 workspace package。
    }
  }

  if (!resolvedEntry) {
    throw new Error(
      `安装后仍无法解析 ${TARGET_PACKAGE}。` +
        '\n请检查 pnpm install 是否成功。',
    )
  }

  const module = await import(
    pathToFileURL(resolvedEntry).href
  )

  const exportedNames = Object.keys(module).filter(
    (name) =>
      name !== 'default' &&
      /^[A-Z][A-Za-z0-9]*$/.test(name),
  )

  if (exportedNames.length === 0) {
    throw new Error(
      `${TARGET_PACKAGE} 没有检测到可用的 React 图标导出。`,
    )
  }

  return new Set(exportedNames)
}

function migrateSourceImports(mynaExports) {
  const sourceFiles = findFiles(
    ROOT,
    (file) =>
      SOURCE_EXTENSIONS.has(extname(file)) &&
      !isMigrationInfrastructureFile(file),
  )

  const plans = []
  const unresolved = []

  for (const file of sourceFiles) {
    const content = readText(file)

    if (!hasLegacyImport(content)) {
      continue
    }

    const plan = createSourceMigrationPlan(
      file,
      content,
      mynaExports,
    )

    plans.push(plan)
    unresolved.push(...plan.unresolved)
  }

  if (unresolved.length > 0) {
    throwUnresolvedIcons(unresolved)
  }

  for (const plan of plans) {
    writeTextIfChanged(plan.file, plan.content)
  }
}

function createSourceMigrationPlan(
  file,
  originalContent,
  mynaExports,
) {
  const importPattern =
  /import\s+(type\s+)?\{([^}]*)\}\s+from\s+['"]lucide-react['"]\s*;?/g

  const matches = [
    ...originalContent.matchAll(importPattern),
  ]

  const edits = []
  const renameMap = new Map()
  const unresolved = []

  for (const match of matches) {
    const fullMatch = match[0]
    const typeKeyword = match[1]
    const rawSpecifiers = match[2]
    const matchIndex = match.index

    if (matchIndex === undefined) {
      continue
    }

    if (typeKeyword) {
      throw new Error(
        `${relative(ROOT, file)} 使用了 ${LEGACY_PACKAGE} 类型导入。` +
          '\n请改为最小 React ComponentType 契约。',
      )
    }

    const parsedSpecifiers =
      parseNamedImportSpecifiers(rawSpecifiers)

    const resolvedSpecifiers = []

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

      resolvedSpecifiers.push({
        imported: resolvedName,
        previousLocal: specifier.local,
      })

      if (specifier.local !== resolvedName) {
        const existingTarget =
          renameMap.get(specifier.local)

        if (
          existingTarget &&
          existingTarget !== resolvedName
        ) {
          throw new Error(
            `${relative(ROOT, file)} 中的标识符 ` +
              `${specifier.local} 出现冲突映射：` +
              `${existingTarget} / ${resolvedName}`,
          )
        }

        renameMap.set(
          specifier.local,
          resolvedName,
        )
      }
    }

    if (
      resolvedSpecifiers.length !==
      parsedSpecifiers.length
    ) {
      continue
    }

    const targetNames = [
      ...new Set(
        resolvedSpecifiers.map(
          (specifier) => specifier.imported,
        ),
      ),
    ].sort((left, right) =>
      left.localeCompare(right),
    )

    edits.push({
      start: matchIndex,
      end: matchIndex + fullMatch.length,
      replacement: formatMynaImport(targetNames),
    })
  }

  if (unresolved.length > 0) {
    return {
      file,
      content: originalContent,
      unresolved,
    }
  }

  let content = applyTextEdits(
    originalContent,
    edits,
  )

  for (const [from, to] of renameMap) {
    content = replaceIdentifierReferences(
      content,
      from,
      to,
    )
  }

  return {
    file,
    content,
    unresolved,
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

function formatMynaImport(names) {
  if (names.length === 0) {
    throw new Error('不能生成空的 Myna UI import')
  }

  if (names.length <= 3) {
    return (
      `import { ${names.join(', ')} } ` +
      `from '${TARGET_PACKAGE}'`
    )
  }

  return [
    'import {',
    ...names.map((name) => `  ${name},`),
    `} from '${TARGET_PACKAGE}'`,
  ].join('\n')
}

function applyTextEdits(content, edits) {
  const sortedEdits = [...edits].sort(
    (left, right) => right.start - left.start,
  )

  let result = content

  for (const edit of sortedEdits) {
    result =
      result.slice(0, edit.start) +
      edit.replacement +
      result.slice(edit.end)
  }

  return result
}

function replaceIdentifierReferences(
  content,
  from,
  to,
) {
  if (from === to) {
    return content
  }

  const pattern = new RegExp(
    `(?<![\\w$])${escapeRegExp(from)}(?![\\w$])`,
    'g',
  )

  return content.replace(pattern, to)
}

function resolveMynaIconName(
  legacyName,
  mynaExports,
) {
  const directCandidates = [
    legacyName,
    stripIconSuffix(legacyName),
    ...(SEMANTIC_ICON_CANDIDATES[legacyName] ??
      []),
  ]

  for (const candidate of directCandidates) {
    if (mynaExports.has(candidate)) {
      return candidate
    }
  }

  const normalizedLegacyName =
    normalizeIconName(legacyName)

  const normalizedMatches = [
    ...mynaExports,
  ].filter(
    (candidate) =>
      normalizeIconName(candidate) ===
      normalizedLegacyName,
  )

  if (normalizedMatches.length === 1) {
    return normalizedMatches[0]
  }

  const ranked = rankExports(
    legacyName,
    mynaExports,
  )

  const best = ranked[0]
  const second = ranked[1]

  if (!best) {
    return null
  }

  /**
   * 只有高置信度且明显优于第二候选时才自动采用。
   */
  if (
    best.score >= 0.82 &&
    (!second ||
      best.score - second.score >= 0.18)
  ) {
    return best.name
  }

  return null
}

function stripIconSuffix(name) {
  return name.endsWith('Icon')
    ? name.slice(0, -4)
    : name
}

function normalizeIconName(name) {
  return splitIdentifier(
    stripIconSuffix(name),
  )
    .filter(
      (token) =>
        ![
          'icon',
          'outline',
          'regular',
        ].includes(token),
    )
    .sort()
    .join('')
}

function findClosestExports(
  legacyName,
  mynaExports,
) {
  return rankExports(
    legacyName,
    mynaExports,
  )
    .slice(0, 8)
    .map(({ name }) => name)
}

function rankExports(legacyName, mynaExports) {
  const legacyTokens = new Set(
    splitIdentifier(
      stripIconSuffix(legacyName),
    ),
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
    .replace(
      /([A-Z]+)([A-Z][a-z])/g,
      '$1 $2',
    )
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

function tokenSimilarity(left, right) {
  const intersection = [...left].filter(
    (token) => right.has(token),
  ).length

  const union = new Set([
    ...left,
    ...right,
  ]).size

  return union === 0
    ? 0
    : intersection / union
}

function throwUnresolvedIcons(unresolved) {
  const unique = new Map()

  for (const item of unresolved) {
    const key = `${item.file}:${item.icon}`

    if (!unique.has(key)) {
      unique.set(key, item)
    }
  }

  const lines = [
    '以下 Lucide 图标没有可靠的 Myna UI 对应项：',
    '',
  ]

  for (const item of unique.values()) {
    lines.push(
      `- ${item.file}: ${item.icon}`,
      `  候选：${
        item.suggestions.join(', ') || '无'
      }`,
    )
  }

  lines.push(
    '',
    '脚本已拒绝猜测，因此没有生成兼容层。',
    '请把对应关系加入 SEMANTIC_ICON_CANDIDATES 后重新执行。',
  )

  throw new Error(lines.join('\n'))
}

function assertNoLegacySourceImports() {
  const sourceFiles = findFiles(
    ROOT,
    (file) =>
      SOURCE_EXTENSIONS.has(extname(file)) &&
      !isMigrationInfrastructureFile(file),
  )

  const violations = []

  for (const file of sourceFiles) {
    const content = readText(file)

    if (hasLegacyImport(content)) {
      violations.push(relative(ROOT, file))
    }
  }

  if (violations.length > 0) {
    throw new Error(
      [
        `仍然存在 ${LEGACY_PACKAGE} import：`,
        ...violations.map(
          (file) => `- ${file}`,
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
    const json = readJson(file)

    for (const sectionName of [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
      'peerDependencies',
    ]) {
      if (
        json[sectionName]?.[LEGACY_PACKAGE]
      ) {
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
        ...violations.map(
          (value) => `- ${value}`,
        ),
      ].join('\n'),
    )
  }
}

function hasLegacyImport(content) {
  const escapedPackage =
    escapeRegExp(LEGACY_PACKAGE)

  const patterns = [
    new RegExp(
      `\\bfrom\\s+['"]${escapedPackage}['"]`,
    ),
    new RegExp(
      `\\bimport\\s+['"]${escapedPackage}['"]`,
    ),
    new RegExp(
      `\\bimport\\s*\\(\\s*['"]${escapedPackage}['"]\\s*\\)`,
    ),
    new RegExp(
      `\\brequire\\s*\\(\\s*['"]${escapedPackage}['"]\\s*\\)`,
    ),
  ]

  return patterns.some(
    (pattern) => pattern.test(content),
  )
}

function isMigrationInfrastructureFile(file) {
  const absolutePath = resolve(file)

  return (
    absolutePath === CURRENT_SCRIPT ||
    absolutePath === ARCHITECTURE_GUARD_FILE
  )
}

function formatChangedFiles() {
  const formattable = new Set([
    CURRENT_SCRIPT,
    ...changedFiles,
  ])

  const files = [...formattable].filter(
    (file) =>
      existsSync(file) &&
      (
        SOURCE_EXTENSIONS.has(extname(file)) ||
        extname(file) === '.json'
      ),
  )

  if (files.length === 0) {
    return
  }

  console.log('\n格式化变更文件...')

  run('pnpm', [
    'exec',
    'biome',
    'format',
    '--write',
    ...files.map(
      (file) => relative(ROOT, file),
    ),
  ])
}

function runChecks() {
  console.log('\n运行图标库架构检查...')

  run('node', [
    'tests/architecture/check-icon-library.mjs',
  ])

  console.log('\n运行格式检查...')

  run('pnpm', ['format:check'])

  console.log('\n运行 lint...')

  run('pnpm', ['lint'])

  console.log('\n运行 TypeScript 类型检查...')

  run('pnpm', ['typecheck'])

  console.log('\n运行测试...')

  run('pnpm', ['test'])

  console.log('\n运行架构测试...')

  run('pnpm', ['test:architecture'])

  console.log('\n构建桌面应用...')

  run('pnpm', ['build:desktop'])

  console.log('\n检查 Bundle Budget...')

  run('pnpm', ['analyze:bundle:check'])
}

function run(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`)

  const options = {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
    shell: false,
  }

  if (process.platform === 'win32') {
    const commandLine = [
      quoteWindowsCommandArgument(command),
      ...args.map(quoteWindowsCommandArgument),
    ].join(' ')

    execFileSync(
      process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
      [
        '/d',
        '/s',
        '/c',
        commandLine,
      ],
      options,
    )

    return
  }

  execFileSync(command, args, options)
}

function quoteWindowsCommandArgument(value) {
  const stringValue = String(value)

  if (stringValue.length === 0) {
    return '""'
  }

  if (!/[\s"&|<>^()]/.test(stringValue)) {
    return stringValue
  }

  return `"${stringValue
    .replace(/"/g, '""')
    .replace(/%/g, '%%')}"`
}

function findFiles(directory, predicate) {
  const files = []

  walk(directory)

  return files

  function walk(currentDirectory) {
    for (
      const entry of readdirSync(
        currentDirectory,
      )
    ) {
      if (IGNORED_DIRECTORIES.has(entry)) {
        continue
      }

      const absolutePath = join(
        currentDirectory,
        entry,
      )

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
  const content = readFileSync(file, 'utf8')

  /**
   * Windows 环境中的部分 JSON 文件可能带 UTF-8 BOM。
   * JSON.parse 不接受 BOM，所以读取时统一去掉。
   */
  return content.charCodeAt(0) === 0xfeff
    ? content.slice(1)
    : content
}

function readJson(file) {
  const content = readText(file)

  try {
    return JSON.parse(content)
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error)

    throw new SyntaxError(
      `无法解析 JSON 文件：${relative(ROOT, file)}` +
        `\n${message}`,
      {
        cause: error,
      },
    )
  }
}

function writeTextIfChanged(file, content) {
  const absolutePath = resolve(file)

  const previous = existsSync(absolutePath)
    ? readText(absolutePath)
    : null

  if (previous === content) {
    return
  }

  changedFiles.add(absolutePath)

  if (!APPLY) {
    console.log(
      `[预览] 修改 ${relative(ROOT, absolutePath)}`,
    )

    return
  }

  mkdirSync(dirname(absolutePath), {
    recursive: true,
  })

  writeFileSync(
    absolutePath,
    content,
    'utf8',
  )

  console.log(
    `修改 ${relative(ROOT, absolutePath)}`,
  )
}

function sortObject(object) {
  return Object.fromEntries(
    Object.entries(object).sort(
      ([left], [right]) =>
        left.localeCompare(right),
    ),
  )
}

function escapeRegExp(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  )
}

function printChangedFiles() {
  if (changedFiles.size === 0) {
    console.log('没有需要修改的文件。')
    return
  }

  console.log('\n变更文件：')

  for (
    const file of [...changedFiles].sort()
  ) {
    console.log(`- ${relative(ROOT, file)}`)
  }
}