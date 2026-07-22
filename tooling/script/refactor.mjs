#!/usr/bin/env node

/**
 * 建立 scaffold 的 package/crate 级精确依赖许可。
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
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const SCRIPT_NAME =
  '009-enforce-package-crate-dependency-permissions'

const MANIFEST_PATH =
  'architecture.scaffolds.json'

const ARCHITECTURE_CHECK_PATH =
  'tests/architecture/check.mjs'

const DEPENDENCY_CHECK_PATH =
  'tests/architecture/check-scaffold-dependencies.mjs'

const CHECK_IMPORT_LINE =
  "await import('./check-scaffold-dependencies.mjs')"

const argv = process.argv.slice(2)
const writeMode = argv.includes('--write')

const dependencyPermissions = {
  'editor/assets/native': {
    allowedPackages: [],
    allowedCrates: [],
  },
  'editor/extensions/native': {
    allowedPackages: [],
    allowedCrates: [],
  },
  'platforms/desktop-runtime/native': {
    allowedPackages: [],
    allowedCrates: [],
  },
  'features/freehand': {
    allowedPackages: [
      '@hybrid-canvas/canvas',
      '@hybrid-canvas/foundations-geometry',
      '@hybrid-canvas/foundations-kernel',
    ],
    allowedCrates: [],
  },
  'features/scientific-plot': {
    allowedPackages: [
      '@hybrid-canvas/asset',
      '@hybrid-canvas/canvas',
      '@hybrid-canvas/foundations-geometry',
      '@hybrid-canvas/foundations-kernel',
    ],
    allowedCrates: [],
  },
  'features/import-export': {
    allowedPackages: [
      '@hybrid-canvas/flowchart',
      '@hybrid-canvas/freehand',
      '@hybrid-canvas/foundations-kernel',
      '@hybrid-canvas/scientific-plot',
    ],
    allowedCrates: [],
  },
}

main()

function main() {
  validateArguments()

  const root = findRepositoryRoot()
  validateRepository(root)

  const manifestPath =
    join(root, MANIFEST_PATH)

  const architectureCheckPath =
    join(root, ARCHITECTURE_CHECK_PATH)

  const dependencyCheckPath =
    join(root, DEPENDENCY_CHECK_PATH)

  const originalManifest =
    readRequiredText(manifestPath)

  const originalArchitectureCheck =
    readRequiredText(architectureCheckPath)

  const dependencyCheckExisted =
    existsSync(dependencyCheckPath)

  const originalDependencyCheck =
    dependencyCheckExisted
      ? readRequiredText(dependencyCheckPath)
      : ''

  const modifiedManifest =
    transformManifest(originalManifest)

  const modifiedArchitectureCheck =
    transformArchitectureCheck(
      originalArchitectureCheck,
    )

  const modifiedDependencyCheck =
    createDependencyChecker()

  const changes = [
    {
      relativePath: MANIFEST_PATH,
      absolutePath: manifestPath,
      original: originalManifest,
      modified: modifiedManifest,
      existedBefore: true,
    },
    {
      relativePath:
        ARCHITECTURE_CHECK_PATH,
      absolutePath:
        architectureCheckPath,
      original:
        originalArchitectureCheck,
      modified:
        modifiedArchitectureCheck,
      existedBefore: true,
    },
    {
      relativePath:
        DEPENDENCY_CHECK_PATH,
      absolutePath:
        dependencyCheckPath,
      original:
        originalDependencyCheck,
      modified:
        modifiedDependencyCheck,
      existedBefore:
        dependencyCheckExisted,
    },
  ].filter(
    (change) =>
      normalizeNewlines(change.original) !==
      normalizeNewlines(change.modified),
  )

  if (changes.length === 0) {
    console.log(
      '无需修改：package/crate 精确依赖许可已经启用。',
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
    '- scaffold manifest 升级为版本 3',
  )
  console.log(
    '- 删除粗粒度 allowedDependencies/forbiddenDependencies',
  )
  console.log(
    '- 使用 allowedPackages 精确许可 workspace package',
  )
  console.log(
    '- 使用 allowedCrates 精确许可 Rust crate',
  )
  console.log(
    '- 使用 TypeScript AST 分析源码依赖',
  )
  console.log(
    '- 校验 package.json 运行时内部依赖',
  )
  console.log(
    '- 校验 Cargo path dependency',
  )
  console.log(
    '- 同层跨包依赖不再隐式允许',
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
      mkdirSync(
        dirname(change.absolutePath),
        {
          recursive: true,
        },
      )

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
        MANIFEST_PATH,
        DEPENDENCY_CHECK_PATH,
      ],
      {
        cwd: root,
        label: '格式化依赖许可文件',
      },
    )

    assertPostconditions(root)

    run(
      'pnpm',
      [
        'exec',
        'biome',
        'check',
        MANIFEST_PATH,
        DEPENDENCY_CHECK_PATH,
      ],
      {
        cwd: root,
        label: 'Biome 检查',
      },
    )

    run(
      'node',
      [DEPENDENCY_CHECK_PATH],
      {
        cwd: root,
        label: 'package/crate 依赖许可检查',
      },
    )

    run(
      'pnpm',
      ['test:architecture'],
      {
        cwd: root,
        label: '完整架构测试',
      },
    )

    run(
      'git',
      [
        'diff',
        '--check',
        '--',
        MANIFEST_PATH,
        ARCHITECTURE_CHECK_PATH,
        DEPENDENCY_CHECK_PATH,
      ],
      {
        cwd: root,
        label: 'Git diff 检查',
      },
    )

    console.log('\n修改完成。')
    console.log(
      'scaffold 跨 package/crate 依赖现在必须显式许可。',
    )
  } catch (error) {
    console.error(
      '\n修改或验证失败，正在恢复原文件……',
    )

    restoreBackup(
      root,
      backupRoot,
      changes,
    )

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

  for (const relativePath of [
    MANIFEST_PATH,
    ARCHITECTURE_CHECK_PATH,
  ]) {
    if (
      !existsSync(join(root, relativePath))
    ) {
      throw new Error(
        `必要文件不存在：${relativePath}`,
      )
    }
  }

  const manifest = parseJson(
    readRequiredText(
      join(root, MANIFEST_PATH),
    ),
    MANIFEST_PATH,
  )

  if (!Array.isArray(manifest.scaffolds)) {
    throw new Error(
      `${MANIFEST_PATH} 缺少 scaffolds 数组`,
    )
  }

  const actualPaths = new Set(
    manifest.scaffolds.map(
      (scaffold) => scaffold.path,
    ),
  )

  for (
    const path of Object.keys(
      dependencyPermissions,
    )
  ) {
    if (!actualPaths.has(path)) {
      throw new Error(
        `manifest 中找不到预期 scaffold：${path}`,
      )
    }
  }

  for (const path of actualPaths) {
    if (
      !Object.hasOwn(
        dependencyPermissions,
        path,
      )
    ) {
      throw new Error(
        `存在未配置精确依赖许可的 scaffold：${String(path)}`,
      )
    }
  }
}

function transformManifest(source) {
  const manifest = parseJson(
    source,
    MANIFEST_PATH,
  )

  const scaffolds = manifest.scaffolds.map(
    (scaffold) => {
      const permission =
        dependencyPermissions[
          scaffold.path
        ]

      if (!permission) {
        throw new Error(
          `缺少 scaffold 许可配置：${String(scaffold.path)}`,
        )
      }

      const {
        allowedDependencies:
          _allowedDependencies,
        forbiddenDependencies:
          _forbiddenDependencies,
        allowedPackages:
          _allowedPackages,
        allowedCrates:
          _allowedCrates,
        ...remaining
      } = scaffold

      return {
        ...remaining,
        allowedPackages:
          permission.allowedPackages,
        allowedCrates:
          permission.allowedCrates,
      }
    },
  )

  return `${JSON.stringify(
    {
      ...manifest,
      version: 3,
      dependencyPolicy:
        'explicit-package-and-crate',
      scaffolds,
    },
    null,
    2,
  )}\n`
}

function transformArchitectureCheck(source) {
  if (source.includes(CHECK_IMPORT_LINE)) {
    return source
  }

  return `${source.replace(/\s*$/u, '')}

${CHECK_IMPORT_LINE}
`
}

function createDependencyChecker() {
  return String.raw`/* biome-ignore-all lint/suspicious/noConsole: architecture checks intentionally report violations to the terminal */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const manifestPath = join(root, 'architecture.scaffolds.json')
const manifest = readJson(manifestPath)
const violations = []

const packageRoots = discoverPackageRoots()
const packagesByName = new Map(
  packageRoots.map((entry) => [entry.name, entry]),
)
const sortedPackageNames = [...packagesByName.keys()].sort(
  (left, right) => right.length - left.length,
)

const crateRoots = discoverCrateRoots()
const cratesByName = new Map(
  crateRoots.map((entry) => [entry.name, entry]),
)

validateManifest()

for (const scaffold of manifest.scaffolds) {
  validateScaffold(scaffold)
}

if (violations.length > 0) {
  console.error('Scaffold dependency permission violations:')

  for (const violation of violations) {
    console.error(§- ¤{violation}§)
  }

  process.exitCode = 1
} else {
  console.log(
    §Scaffold dependency permissions OK: ¤{manifest.scaffolds.length} scaffolds, ¤{packageRoots.length} packages, ¤{crateRoots.length} crates§,
  )
}

function validateManifest() {
  if (manifest.version !== 3) {
    addViolation(
      §architecture.scaffolds.json: expected version 3, received ¤{String(manifest.version)}§,
    )
  }

  if (manifest.dependencyPolicy !== 'explicit-package-and-crate') {
    addViolation(
      'architecture.scaffolds.json: dependencyPolicy must be explicit-package-and-crate',
    )
  }

  if (!Array.isArray(manifest.scaffolds)) {
    addViolation('architecture.scaffolds.json: scaffolds must be an array')
  }
}

function validateScaffold(scaffold) {
  if (!scaffold || typeof scaffold !== 'object') {
    addViolation('architecture.scaffolds.json: scaffold must be an object')
    return
  }

  if (typeof scaffold.path !== 'string') {
    addViolation('architecture.scaffolds.json: scaffold path must be a string')
    return
  }

  const scaffoldRoot = resolve(root, scaffold.path)

  if (!isInsideRoot(scaffoldRoot) || !existsSync(scaffoldRoot)) {
    addViolation(§¤{scaffold.path}: scaffold path does not exist§)
    return
  }

  const allowedPackages = validatePermissionList(
    scaffold,
    'allowedPackages',
    packagesByName,
  )
  const allowedCrates = validatePermissionList(
    scaffold,
    'allowedCrates',
    cratesByName,
  )

  validateTypeScriptDependencies(scaffold, scaffoldRoot, allowedPackages)
  validateRustDependencies(scaffold, scaffoldRoot, allowedCrates)
}

function validatePermissionList(scaffold, property, knownEntries) {
  const value = scaffold[property]

  if (!Array.isArray(value)) {
    addViolation(§¤{scaffold.path}: ¤{property} must be an array§)
    return new Set()
  }

  const result = new Set()

  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0) {
      addViolation(§¤{scaffold.path}: ¤{property} contains an invalid value§)
      continue
    }

    if (result.has(entry)) {
      addViolation(§¤{scaffold.path}: duplicate ¤{property} entry ¤{entry}§)
      continue
    }

    if (!knownEntries.has(entry)) {
      addViolation(§¤{scaffold.path}: unknown ¤{property} entry ¤{entry}§)
      continue
    }

    result.add(entry)
  }

  return result
}

function validateTypeScriptDependencies(scaffold, scaffoldRoot, allowedPackages) {
  const ownerPackage = findOwningPackage(scaffoldRoot)

  if (!ownerPackage) {
    if (containsTypeScriptSource(scaffoldRoot)) {
      addViolation(§¤{scaffold.path}: TypeScript source has no owning package.json§)
    }

    return
  }

  if (allowedPackages.has(ownerPackage.name)) {
    addViolation(
      §¤{scaffold.path}: allowedPackages must not contain its own package ¤{ownerPackage.name}§,
    )
  }

  validateDeclaredPackageDependencies(scaffold, ownerPackage, allowedPackages)

  const sourceRoot = join(scaffoldRoot, 'src')

  if (!existsSync(sourceRoot)) {
    return
  }

  for (const file of collectTypeScriptFiles(sourceRoot)) {
    validateTypeScriptFile(scaffold, file, ownerPackage, allowedPackages)
  }
}

function validateDeclaredPackageDependencies(
  scaffold,
  ownerPackage,
  allowedPackages,
) {
  const packageJson = readJson(ownerPackage.manifestPath)
  const runtimeDependencies = {
    ...packageJson.dependencies,
    ...packageJson.optionalDependencies,
  }

  for (const dependencyName of Object.keys(runtimeDependencies)) {
    if (!packagesByName.has(dependencyName)) {
      continue
    }

    if (dependencyName === ownerPackage.name) {
      addViolation(
        §¤{relativePath(ownerPackage.manifestPath)}: package declares itself as a dependency§,
      )
      continue
    }

    if (!allowedPackages.has(dependencyName)) {
      addViolation(
        §¤{scaffold.path}: package.json dependency ¤{dependencyName} is not listed in allowedPackages§,
      )
    }
  }
}

function validateTypeScriptFile(scaffold, file, ownerPackage, allowedPackages) {
  for (const specifier of collectModuleSpecifiers(file)) {
    const dependencyName = resolveWorkspacePackageName(specifier)

    if (!dependencyName || dependencyName === ownerPackage.name) {
      continue
    }

    if (!allowedPackages.has(dependencyName)) {
      addViolation(
        §¤{relativePath(file)}: ¤{dependencyName} is not listed in ¤{scaffold.path}.allowedPackages§,
      )
    }

    const packageJson = readJson(ownerPackage.manifestPath)
    const declaredDependencies = {
      ...packageJson.dependencies,
      ...packageJson.optionalDependencies,
      ...packageJson.peerDependencies,
    }

    if (!Object.hasOwn(declaredDependencies, dependencyName)) {
      addViolation(
        §¤{relativePath(file)}: ¤{dependencyName} is imported but not declared as a runtime dependency§,
      )
    }
  }
}

function collectModuleSpecifiers(file) {
  const source = readFileSync(file, 'utf8')
  const sourceFile = ts.createSourceFile(
  file,
  source,
  ts.ScriptTarget.Latest,
  true,
)
  const specifiers = new Set()

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.add(node.moduleSpecifier.text)
    }

    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      specifiers.add(node.moduleReference.expression.text)
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.add(node.arguments[0].text)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)

  return specifiers
}

function resolveWorkspacePackageName(specifier) {
  for (const packageName of sortedPackageNames) {
    if (specifier === packageName || specifier.startsWith(§¤{packageName}/§)) {
      return packageName
    }
  }

  if (specifier.startsWith('@hybrid-canvas/')) {
    addViolation(§unresolved internal package import: ¤{specifier}§)
  }

  return null
}

function validateRustDependencies(scaffold, scaffoldRoot, allowedCrates) {
  const cargoPath = join(scaffoldRoot, 'Cargo.toml')

  if (!existsSync(cargoPath)) {
    if (containsRustSource(scaffoldRoot)) {
      addViolation(§¤{scaffold.path}: Rust source has no Cargo.toml§)
    }

    return
  }

  const ownerCrate = crateRoots.find(
    (entry) => entry.manifestPath === cargoPath,
  )

  if (!ownerCrate) {
    addViolation(§¤{scaffold.path}: Cargo crate is not a workspace member§)
    return
  }

  if (allowedCrates.has(ownerCrate.name)) {
    addViolation(
      §¤{scaffold.path}: allowedCrates must not contain its own crate ¤{ownerCrate.name}§,
    )
  }

  for (const dependency of collectCargoPathDependencies(cargoPath)) {
    const dependencyRoot = resolve(ownerCrate.root, dependency.path)
    const dependencyCrate = crateRoots.find(
      (entry) => entry.root === dependencyRoot,
    )

    if (!dependencyCrate) {
      addViolation(
        §¤{relativePath(cargoPath)}: path dependency ¤{dependency.name} does not resolve to a workspace crate§,
      )
      continue
    }

    if (!allowedCrates.has(dependencyCrate.name)) {
      addViolation(
        §¤{scaffold.path}: crate ¤{dependencyCrate.name} is not listed in allowedCrates§,
      )
    }
  }
}

function collectCargoPathDependencies(cargoPath) {
  const source = readFileSync(cargoPath, 'utf8').replace(/^\uFEFF/u, '')
  const dependencies = []
  let currentSection = ''

  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim()

    if (line.startsWith('[') && line.endsWith(']')) {
      currentSection = line.slice(1, -1)
      continue
    }

    const isRuntimeDependencySection =
      currentSection === 'dependencies' ||
      currentSection.endsWith('.dependencies')

    if (!isRuntimeDependencySection || !line || line.startsWith('#')) {
      continue
    }

    const match = line.match(
      /^([A-Za-z0-9_-]+)\s*=\s*\{[^}]*\bpath\s*=\s*"([^"]+)"[^}]*\}\s*$/u,
    )

    if (match) {
      dependencies.push({
        name: match[1],
        path: match[2],
      })
    }
  }

  return dependencies
}

function discoverPackageRoots() {
  const roots = [
    'apps',
    'editor',
    'features',
    'foundations',
    'platforms',
    'tooling',
    'tests',
  ]
  const result = []

  for (const rootName of roots) {
    const workspaceRoot = join(root, rootName)

    if (!existsSync(workspaceRoot)) {
      continue
    }

    for (const entry of readdirSync(workspaceRoot)) {
      const packageRoot = join(workspaceRoot, entry)
      const manifestPath = join(packageRoot, 'package.json')

      if (!isDirectory(packageRoot) || !existsSync(manifestPath)) {
        continue
      }

      const packageJson = readJson(manifestPath)

      if (typeof packageJson.name !== 'string') {
        addViolation(§¤{relativePath(manifestPath)}: package name is missing§)
        continue
      }

      result.push({
        name: packageJson.name,
        root: packageRoot,
        manifestPath,
      })
    }
  }

  return result
}

function discoverCrateRoots() {
  const workspaceCargoPath = join(root, 'Cargo.toml')
  const source = readFileSync(workspaceCargoPath, 'utf8')
  const membersMatch = source.match(/\bmembers\s*=\s*\[([\s\S]*?)\]/u)

  if (!membersMatch) {
    addViolation('Cargo.toml: workspace members array is missing')
    return []
  }

  const result = []
  const memberPattern = /"([^"]+)"/gu

  for (const match of membersMatch[1].matchAll(memberPattern)) {
    const crateRoot = resolve(root, match[1])
    const manifestPath = join(crateRoot, 'Cargo.toml')

    if (!existsSync(manifestPath)) {
      addViolation(§Cargo workspace member does not exist: ¤{match[1]}§)
      continue
    }

    const cargo = readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/u, '')
    const packageSection = cargo.match(
      /\[package\]([\s\S]*?)(?=\n\[|$)/u,
    )
    const nameMatch = packageSection?.[1].match(
      /^name\s*=\s*"([^"]+)"$/mu,
    )

    if (!nameMatch) {
      addViolation(§¤{relativePath(manifestPath)}: crate name is missing§)
      continue
    }

    result.push({
      name: nameMatch[1],
      root: crateRoot,
      manifestPath,
    })
  }

  return result
}

function findOwningPackage(path) {
  let current = path

  while (isInsideRoot(current)) {
    const manifestPath = join(current, 'package.json')

    if (existsSync(manifestPath)) {
      const packageJson = readJson(manifestPath)

      return {
        name: packageJson.name,
        root: current,
        manifestPath,
      }
    }

    if (current === root) {
      break
    }

    current = dirname(current)
  }

  return null
}

function collectTypeScriptFiles(directory) {
  const files = []

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)

    if (isDirectory(path)) {
      files.push(...collectTypeScriptFiles(path))
      continue
    }

    if (/\.(?:cts|mts|ts|tsx)$/u.test(path) && !path.endsWith('.d.ts')) {
      files.push(path)
    }
  }

  return files
}

function containsTypeScriptSource(directory) {
  return (
    existsSync(join(directory, 'src')) &&
    collectTypeScriptFiles(join(directory, 'src')).length > 0
  )
}

function containsRustSource(directory) {
  const sourceRoot = join(directory, 'src')

  if (!existsSync(sourceRoot)) {
    return false
  }

  return collectFilesWithExtension(sourceRoot, '.rs').length > 0
}

function collectFilesWithExtension(directory, extension) {
  const files = []

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)

    if (isDirectory(path)) {
      files.push(...collectFilesWithExtension(path, extension))
    } else if (path.endsWith(extension)) {
      files.push(path)
    }
  }

  return files
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function isInsideRoot(path) {
  const normalizedRoot = root.endsWith(sep) ? root : §¤{root}¤{sep}§
  return path === root || path.startsWith(normalizedRoot)
}

function relativePath(path) {
  return relative(root, path).replaceAll(sep, '/')
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/u, ''))
  } catch (cause) {
    throw new Error(§Cannot parse ¤{relativePath(path)}§, {
      cause,
    })
  }
}

function addViolation(message) {
  violations.push(message)
}
`
    .replaceAll('§', '`')
    .replaceAll('¤{', '${')
}

function assertPostconditions(root) {
  const manifest = parseJson(
    readRequiredText(
      join(root, MANIFEST_PATH),
    ),
    MANIFEST_PATH,
  )

  if (manifest.version !== 3) {
    throw new Error(
      'scaffold manifest 未升级到版本 3',
    )
  }

  if (
    manifest.dependencyPolicy !==
    'explicit-package-and-crate'
  ) {
    throw new Error(
      'scaffold manifest 缺少精确依赖策略',
    )
  }

  for (const scaffold of manifest.scaffolds) {
    if (
      !Array.isArray(
        scaffold.allowedPackages,
      )
    ) {
      throw new Error(
        `${scaffold.path} 缺少 allowedPackages`,
      )
    }

    if (
      !Array.isArray(
        scaffold.allowedCrates,
      )
    ) {
      throw new Error(
        `${scaffold.path} 缺少 allowedCrates`,
      )
    }

    if (
      Object.hasOwn(
        scaffold,
        'allowedDependencies',
      ) ||
      Object.hasOwn(
        scaffold,
        'forbiddenDependencies',
      )
    ) {
      throw new Error(
        `${scaffold.path} 仍残留层级依赖字段`,
      )
    }
  }

  const architectureCheck =
    readRequiredText(
      join(
        root,
        ARCHITECTURE_CHECK_PATH,
      ),
    )

  if (
    !architectureCheck.includes(
      CHECK_IMPORT_LINE,
    )
  ) {
    throw new Error(
      '主架构测试未加载 scaffold 依赖检查器',
    )
  }

  const dependencyCheck =
    readRequiredText(
      join(
        root,
        DEPENDENCY_CHECK_PATH,
      ),
    )

  const requiredFragments = [
    "import * as ts from 'typescript'",
    'collectModuleSpecifiers',
    'allowedPackages',
    'allowedCrates',
    'collectCargoPathDependencies',
    'package.json dependency',
    'is imported but not declared as a runtime dependency',
  ]

  for (const fragment of requiredFragments) {
    if (!dependencyCheck.includes(fragment)) {
      throw new Error(
        `依赖检查器缺少：${fragment}`,
      )
    }
  }
}

function ensureTargetsAreClean(
  root,
  changes,
) {
  const existingPaths = changes
    .filter(
      (change) => change.existedBefore,
    )
    .map(
      (change) => change.relativePath,
    )

  const result = spawnSync(
    'git',
    [
      'status',
      '--porcelain',
      '--',
      ...existingPaths,
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
    if (!change.existedBefore) {
      continue
    }

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

function restoreBackup(
  root,
  backupRoot,
  changes,
) {
  for (const change of changes) {
    if (change.existedBefore) {
      copyFileSync(
        join(
          backupRoot,
          change.relativePath,
        ),
        change.absolutePath,
      )
    } else {
      rmSync(change.absolutePath, {
        force: true,
      })
    }
  }
}

function parseJson(source, label) {
  try {
    return JSON.parse(
      source.replace(/^\uFEFF/u, ''),
    )
  } catch (cause) {
    throw new Error(
      `无法解析 ${label}`,
      {
        cause,
      },
    )
  }
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
      stdio: 'inherit',
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
      `${label} 失败，退出码 ${String(result.status)}`,
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