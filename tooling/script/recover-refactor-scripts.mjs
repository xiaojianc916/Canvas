#!/usr/bin/env node

import {
  cp,
  mkdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const shouldWrite = process.argv.includes('--write')
const writes = new Map()

function absolute(relativePath) {
  return resolve(root, relativePath)
}

async function exists(relativePath) {
  try {
    await stat(absolute(relativePath))
    return true
  } catch {
    return false
  }
}

async function read(relativePath) {
  return readFile(absolute(relativePath), 'utf8')
}

function write(relativePath, content) {
  writes.set(relativePath, content)
}

async function edit(relativePath, transform) {
  const content = await read(relativePath)
  const updated = transform(content)

  if (updated === content) {
    throw new Error(`文件没有产生修改：${relativePath}`)
  }

  write(relativePath, updated)
}

async function updateJson(relativePath, transform) {
  const content = await read(relativePath)
  const hasBom = content.startsWith('\uFEFF')
  const json = JSON.parse(
    hasBom ? content.slice(1) : content,
  )

  const updated = transform(json) ?? json

  write(
    relativePath,
    `${hasBom ? '\uFEFF' : ''}${JSON.stringify(updated, null, 2)}\n`,
  )
}

async function assertPhase3Completed() {
  const appShellPath =
    'apps/desktop/src/presentation/AppShell.tsx'

  const workspaceContainerPath =
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx'

  const workspaceShellPath =
    'features/workspace/src/presentation/shell/WorkspaceShell.tsx'

  const canvasWorkflowPath =
    'apps/desktop/src/application/canvas/canvas-workflow.ts'

  const [
    appShell,
    workspaceContainer,
    workspaceShell,
    canvasWorkflow,
  ] = await Promise.all([
    read(appShellPath),
    read(workspaceContainerPath),
    read(workspaceShellPath),
    read(canvasWorkflowPath),
  ])

  const failures = []

  if (
    appShell.includes(
      '</EditorProvider>    </EditorProvider>',
    )
  ) {
    failures.push(
      `${appShellPath}: 仍存在重复 EditorProvider 闭合标签`,
    )
  }

  if (
    workspaceContainer.includes(
      '/>      }\n    />',
    )
  ) {
    failures.push(
      `${workspaceContainerPath}: 仍存在重复 WorkspaceShell JSX`,
    )
  }

  if (
    workspaceShell.includes(
      'const rail = (  const rail = (',
    )
  ) {
    failures.push(
      `${workspaceShellPath}: 仍存在重复 rail 声明`,
    )
  }

  if (
    !canvasWorkflow.includes(
      'Promise<CanvasCloseRequestResult>',
    )
  ) {
    failures.push(
      `${canvasWorkflowPath}: 关闭流程尚未下沉到 CanvasWorkflow`,
    )
  }

  if (
    !appShell.includes(
      `from '@hybrid-canvas/observability'`,
    )
  ) {
    failures.push(
      `${appShellPath}: observability 治理尚未落地`,
    )
  }

  if (
    !appShell.includes(
      `from '@hybrid-canvas/settings/react'`,
    )
  ) {
    failures.push(
      `${appShellPath}: Settings UI 仍未从 feature 入口导入`,
    )
  }

  if (failures.length > 0) {
    throw new Error(
      [
        'Phase 3 尚未完成，拒绝继续叠加 Phase 4。',
        '',
        ...failures.map(
          (failure) => `- ${failure}`,
        ),
        '',
        '请先执行：',
        'node scripts/refactor-architecture-phase3.mjs --write',
        'pnpm format',
        'pnpm lint',
        'pnpm typecheck',
      ].join('\n'),
    )
  }
}

function createImportGraphCheck() {
  write(
    'tests/architecture/check-import-graph.mjs',
    `#!/usr/bin/env node

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs'
import {
  dirname,
  extname,
  join,
  normalize,
  relative,
  resolve,
} from 'node:path'

const root = resolve(import.meta.dirname, '../..')

const workspaceRoots = [
  'apps',
  'editor',
  'features',
  'foundations',
  'platforms',
  'tooling',
]

const ignoredDirectories = new Set([
  '.git',
  '.refactor-backup',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'generated',
  'node_modules',
  'target',
  'test-results',
])

const sourceExtensions = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
]

const importPattern =
  /(?:import|export)\\s+(?:type\\s+)?(?:[^'"]*?\\sfrom\\s*)?['"]([^'"]+)['"]|import\\s*\\(\\s*['"]([^'"]+)['"]\\s*\\)/g

const packages = loadWorkspacePackages()
const packageByName = new Map(
  packages.map((pkg) => [
    pkg.manifest.name,
    pkg,
  ]),
)

const sourceFiles = collectSourceFiles()
const sourceFileSet = new Set(sourceFiles)
const fileGraph = new Map()
const packageGraph = new Map()

for (const pkg of packages) {
  packageGraph.set(pkg.manifest.name, new Set())

  const dependencyGroups = [
    pkg.manifest.dependencies,
    pkg.manifest.devDependencies,
    pkg.manifest.peerDependencies,
    pkg.manifest.optionalDependencies,
  ]

  for (const dependencies of dependencyGroups) {
    for (const dependencyName of Object.keys(
      dependencies ?? {},
    )) {
      if (packageByName.has(dependencyName)) {
        packageGraph
          .get(pkg.manifest.name)
          .add(dependencyName)
      }
    }
  }
}

for (const file of sourceFiles) {
  const imports = extractImports(
    readFileSync(file, 'utf8'),
  )

  const dependencies = new Set()

  for (const specifier of imports) {
    const resolvedFile = resolveImport(
      file,
      specifier,
    )

    if (resolvedFile) {
      dependencies.add(resolvedFile)
    }
  }

  fileGraph.set(file, dependencies)
}

const packageCycles = findCycles(packageGraph)
const fileCycles = findCycles(fileGraph)

const violations = []

for (const cycle of packageCycles) {
  violations.push(
    'Package cycle: ' +
      cycle.join(' -> '),
  )
}

for (const cycle of fileCycles) {
  violations.push(
    'Source cycle: ' +
      cycle
        .map((file) =>
          relative(root, file).replaceAll(
            '\\\\',
            '/',
          ),
        )
        .join(' -> '),
  )
}

if (violations.length > 0) {
  console.error(
    violations.join('\\n'),
  )
  process.exit(1)
}

console.log(
  \`Import graph OK: \${packages.length} packages, \${sourceFiles.length} source files\`,
)

function loadWorkspacePackages() {
  const result = []

  for (const workspaceRoot of workspaceRoots) {
    const absoluteRoot = join(
      root,
      workspaceRoot,
    )

    if (!existsSync(absoluteRoot)) {
      continue
    }

    for (const entry of readdirSync(
      absoluteRoot,
    )) {
      const packageRoot = join(
        absoluteRoot,
        entry,
      )

      if (
        !statSync(packageRoot).isDirectory()
      ) {
        continue
      }

      const manifestPath = join(
        packageRoot,
        'package.json',
      )

      if (!existsSync(manifestPath)) {
        continue
      }

      const manifest = JSON.parse(
        readFileSync(
          manifestPath,
          'utf8',
        ).replace(/^\\uFEFF/, ''),
      )

      if (!manifest.name) {
        continue
      }

      result.push({
        root: packageRoot,
        manifest,
      })
    }
  }

  return result
}

function collectSourceFiles() {
  const result = []

  for (const pkg of packages) {
    const sourceRoot = join(
      pkg.root,
      'src',
    )

    if (existsSync(sourceRoot)) {
      walk(sourceRoot, result)
    }
  }

  return result
}

function walk(directory, result) {
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) {
      continue
    }

    const path = join(directory, entry)
    const info = statSync(path)

    if (info.isDirectory()) {
      walk(path, result)
      continue
    }

    if (
      !sourceExtensions.includes(
        extname(path),
      )
    ) {
      continue
    }

    if (
      /\\.(?:test|spec)\\.[cm]?tsx?$/.test(
        path,
      )
    ) {
      continue
    }

    result.push(normalize(path))
  }
}

function extractImports(content) {
  const imports = []
  importPattern.lastIndex = 0

  let match

  while (
    (match = importPattern.exec(content))
  ) {
    const specifier =
      match[1] ?? match[2]

    if (specifier) {
      imports.push(specifier)
    }
  }

  return imports
}

function resolveImport(importer, specifier) {
  if (specifier.startsWith('.')) {
    return resolveSourcePath(
      resolve(
        dirname(importer),
        specifier,
      ),
    )
  }

  const matchingPackage = packages
    .filter((pkg) =>
      specifier === pkg.manifest.name ||
      specifier.startsWith(
        pkg.manifest.name + '/',
      ),
    )
    .sort(
      (left, right) =>
        right.manifest.name.length -
        left.manifest.name.length,
    )[0]

  if (!matchingPackage) {
    return null
  }

  const subpath =
    specifier ===
    matchingPackage.manifest.name
      ? '.'
      : '.' +
        specifier.slice(
          matchingPackage.manifest.name
            .length,
        )

  const exportTarget = getExportTarget(
    matchingPackage.manifest.exports,
    subpath,
  )

  if (exportTarget) {
    return resolveSourcePath(
      join(
        matchingPackage.root,
        exportTarget,
      ),
    )
  }

  return resolveSourcePath(
    join(
      matchingPackage.root,
      'src/public-api',
    ),
  )
}

function getExportTarget(exportsField, subpath) {
  if (!exportsField) {
    return null
  }

  if (
    typeof exportsField === 'string' &&
    subpath === '.'
  ) {
    return exportsField
  }

  const entry = exportsField[subpath]

  if (typeof entry === 'string') {
    return entry
  }

  if (
    entry &&
    typeof entry === 'object'
  ) {
    return (
      entry.default ??
      entry.import ??
      entry.types ??
      null
    )
  }

  return null
}

function resolveSourcePath(candidate) {
  const normalizedCandidate =
    candidate.replace(
      /\\.[cm]?[jt]sx?$/,
      '',
    )

  const candidates = [
    candidate,
    ...sourceExtensions.map(
      (extension) =>
        normalizedCandidate + extension,
    ),
    ...sourceExtensions.map(
      (extension) =>
        join(
          normalizedCandidate,
          'index' + extension,
        ),
    ),
  ]

  for (const path of candidates) {
    const normalizedPath = normalize(path)

    if (
      sourceFileSet.has(normalizedPath)
    ) {
      return normalizedPath
    }

    if (
      existsSync(normalizedPath) &&
      statSync(normalizedPath).isFile() &&
      sourceExtensions.includes(
        extname(normalizedPath),
      )
    ) {
      return normalizedPath
    }
  }

  return null
}

function findCycles(graph) {
  const cycles = []
  const state = new Map()
  const stack = []
  const stackIndex = new Map()
  const signatures = new Set()

  function visit(node) {
    const currentState = state.get(node)

    if (currentState === 'visited') {
      return
    }

    if (currentState === 'visiting') {
      const start =
        stackIndex.get(node)

      if (start === undefined) {
        return
      }

      const cycle = [
        ...stack.slice(start),
        node,
      ]

      const signature = canonicalizeCycle(
        cycle,
      )

      if (!signatures.has(signature)) {
        signatures.add(signature)
        cycles.push(cycle)
      }

      return
    }

    state.set(node, 'visiting')
    stackIndex.set(node, stack.length)
    stack.push(node)

    for (const dependency of graph.get(
      node,
    ) ?? []) {
      if (graph.has(dependency)) {
        visit(dependency)
      }
    }

    stack.pop()
    stackIndex.delete(node)
    state.set(node, 'visited')
  }

  for (const node of graph.keys()) {
    visit(node)
  }

  return cycles
}

function canonicalizeCycle(cycle) {
  const values = cycle.slice(0, -1)

  if (values.length === 0) {
    return ''
  }

  const rotations = values.map(
    (_, index) => [
      ...values.slice(index),
      ...values.slice(0, index),
    ].join('|'),
  )

  return rotations.sort()[0]
}
`,
  )
}

function createBundleReport() {
  write(
    'tests/performance/report-bundle.mjs',
    `#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  statSync,
} from 'node:fs'
import {
  dirname,
  join,
  relative,
  resolve,
} from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const manifestPath = join(
  root,
  'apps/desktop/dist/.vite/manifest.json',
)

if (!existsSync(manifestPath)) {
  console.error(
    'Vite manifest not found. Run pnpm build:desktop first.',
  )
  process.exit(1)
}

const manifest = JSON.parse(
  readFileSync(manifestPath, 'utf8'),
)

const distRoot = resolve(
  dirname(manifestPath),
  '..',
)

const assets = new Map()

for (const entry of Object.values(manifest)) {
  collect(entry.file, 'js')

  for (const cssFile of entry.css ?? []) {
    collect(cssFile, 'css')
  }

  for (const asset of entry.assets ?? []) {
    collect(asset, 'asset')
  }
}

const rows = [...assets.values()].sort(
  (left, right) =>
    right.bytes - left.bytes,
)

const totals = rows.reduce(
  (result, row) => {
    result[row.kind] ??= 0
    result[row.kind] += row.bytes
    result.total += row.bytes
    return result
  },
  { total: 0 },
)

console.log('')
console.log('Desktop bundle report')
console.log('=====================')
console.log('')

for (const row of rows) {
  console.log(
    \`\${formatBytes(row.bytes).padStart(10)}  \${row.kind.padEnd(5)}  \${row.path}\`,
  )
}

console.log('')
console.log(
  \`JavaScript: \${formatBytes(totals.js ?? 0)}\`,
)
console.log(
  \`CSS:        \${formatBytes(totals.css ?? 0)}\`,
)
console.log(
  \`Assets:     \${formatBytes(totals.asset ?? 0)}\`,
)
console.log(
  \`Total:      \${formatBytes(totals.total)}\`,
)
console.log('')

function collect(file, kind) {
  if (!file || assets.has(file)) {
    return
  }

  const absolutePath = join(
    distRoot,
    file,
  )

  if (!existsSync(absolutePath)) {
    return
  }

  assets.set(file, {
    path: relative(
      distRoot,
      absolutePath,
    ).replaceAll('\\\\', '/'),
    kind,
    bytes: statSync(
      absolutePath,
    ).size,
  })
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return \`\${bytes} B\`
  }

  if (bytes < 1024 * 1024) {
    return \`\${(
      bytes / 1024
    ).toFixed(1)} KiB\`
  }

  return \`\${(
    bytes /
    1024 /
    1024
  ).toFixed(2)} MiB\`
}
`,
  )
}

async function enableViteManifest() {
  await edit(
    'apps/desktop/vite.config.ts',
    (content) => {
      if (
        content.includes(
          'manifest: true',
        )
      ) {
        throw new Error(
          'Vite manifest 已经启用，请不要重复运行 Phase 4。',
        )
      }

      return content.replace(
        `  build: {
    target:`,
        `  build: {
    manifest: true,
    target:`,
      )
    },
  )
}

async function updateRootScripts() {
  await updateJson(
    'package.json',
    (json) => {
      json.scripts ??= {}

      json.scripts[
        'test:architecture'
      ] =
        'node tests/architecture/check.mjs && node tests/architecture/check-import-graph.mjs'

      json.scripts[
        'analyze:bundle'
      ] =
        'node tests/performance/report-bundle.mjs'

      return json
    },
  )
}

async function updateCi() {
  await edit(
    '.github/workflows/quality.yml',
    (content) => {
      if (
        content.includes(
          'Bundle report',
        )
      ) {
        throw new Error(
          'CI 已包含 Bundle report，请不要重复执行。',
        )
      }

      const oldBlock = `      - name: Build
        run: pnpm build
`

      const newBlock = `      - name: Build
        run: pnpm build

      - name: Bundle report
        run: pnpm analyze:bundle
`

      if (!content.includes(oldBlock)) {
        throw new Error(
          '找不到 CI Build 步骤。',
        )
      }

      return content.replace(
        oldBlock,
        newBlock,
      )
    },
  )
}

function createProgressDocument() {
  write(
    'docs/architecture/refactor-progress.md',
    `# Frontend Architecture Refactor Progress

## Scope

This refactor preserves:

- tldraw Editor and TLStore as the canonical canvas runtime
- the existing scaffold-first package strategy
- the current .draw file contract
- the editor extension model
- platform-independent editor and document packages

## Progress

| Phase | Status | Notes |
| --- | --- | --- |
| 0. Architecture review | Complete | Runtime and dependency model established |
| 1. Runtime correctness | Complete | External-store snapshots, listener cleanup and environment exposure |
| 2. UI boundaries | Complete after verification | Desktop chrome separated from Workspace; shared confirmation dialog |
| 3. Workflow and errors | Complete after verification | Close orchestration moved to CanvasWorkflow; observability added |
| 4. Dependency and performance baselines | In progress | Import graph and Vite bundle manifest |
| 5. Compatibility and release verification | Pending | File fixtures, native failure recovery and final performance budgets |

## Architectural invariants

1. TLStore records are the only persistent canvas source of truth.
2. Canvas document writes go through Editor or Store transactions.
3. Workspace does not expose Tauri or native-window semantics.
4. Presentation does not orchestrate document save promises.
5. Cross-package imports use package exports.
6. Reserved scaffolds remain registered in architecture.scaffolds.json.
7. Performance optimizations require a recorded baseline.

## Remaining work

- Establish .draw round-trip fixtures and corrupt-file cases.
- Verify atomic save and crash recovery in the Rust layer.
- Record initial bundle, startup and multi-canvas memory baselines.
- Add explicit performance budgets after the first stable baseline.
- Complete settings persistence wiring.
- Run desktop E2E coverage for title-bar drag, close and recovery paths.
`,
  )
}

async function createBackup() {
  const stamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')

  const backupRoot = absolute(
    `.refactor-backup/${stamp}`,
  )

  for (const relativePath of writes.keys()) {
    if (!(await exists(relativePath))) {
      continue
    }

    const backupPath = resolve(
      backupRoot,
      relativePath,
    )

    await mkdir(dirname(backupPath), {
      recursive: true,
    })

    await cp(
      absolute(relativePath),
      backupPath,
      { recursive: true },
    )
  }

  return backupRoot
}

async function applyWrites() {
  for (const [relativePath, content] of writes) {
    await mkdir(
      dirname(absolute(relativePath)),
      { recursive: true },
    )

    await writeFile(
      absolute(relativePath),
      content,
      'utf8',
    )
  }
}

function printPlan() {
  console.log('')
  console.log(
    shouldWrite
      ? 'Phase 4 修改计划：'
      : 'Phase 4 预览（尚未写入）：',
  )

  for (const relativePath of writes.keys()) {
    console.log(`  WRITE ${relativePath}`)
  }

  console.log('')
}

async function main() {
  await assertPhase3Completed()

  createImportGraphCheck()
  createBundleReport()
  await enableViteManifest()
  await updateRootScripts()
  await updateCi()
  createProgressDocument()

  printPlan()

  if (!shouldWrite) {
    console.log(
      'Phase 3 前置条件和 Phase 4 修改均已验证。',
    )
    console.log('')
    console.log('实际写入：')
    console.log('')
    console.log(
      '  node scripts/refactor-architecture-phase4.mjs --write',
    )
    console.log('')
    return
  }

  const backupRoot = await createBackup()
  await applyWrites()

  console.log(
    `备份目录：${relative(root, backupRoot)}`,
  )
  console.log('')
  console.log('必须执行：')
  console.log('')
  console.log('  pnpm format')
  console.log('  pnpm lint')
  console.log('  pnpm test:architecture')
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('  pnpm build:desktop')
  console.log('  pnpm analyze:bundle')
  console.log('')
}

main().catch((error) => {
  console.error('')
  console.error('Phase 4 执行失败。')
  console.error(error)
  process.exitCode = 1
})