#!/usr/bin/env node

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
  /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\sfrom\s*)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g

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
            '\\',
            '/',
          ),
        )
        .join(' -> '),
  )
}

if (violations.length > 0) {
  console.error(
    violations.join('\n'),
  )
  process.exit(1)
}

console.log(
  `Import graph OK: ${packages.length} packages, ${sourceFiles.length} source files`,
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
        ).replace(/^\uFEFF/, ''),
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
      /\.(?:test|spec)\.[cm]?tsx?$/.test(
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
      /\.[cm]?[jt]sx?$/,
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
