#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'

const root = process.cwd()
const args = new Set(process.argv.slice(2))
const skipVerify = args.has('--skip-verify')
const skipRust = args.has('--skip-rust')

const ignoredDirectories = new Set(['.git', '.turbo', 'coverage', 'dist', 'node_modules', 'target'])

main()

function main() {
  preflight()

  console.log('1/8 修复 Editor Extension 入口...')
  normalizeExtensionImports()

  console.log('2/8 修复 Presentation/Application 边界...')
  repairAppShellBoundary()

  console.log('3/8 修复 Document package 边界...')
  repairDocumentPackage()

  console.log('4/8 修复 Desktop package 依赖...')
  repairDesktopPackage()

  console.log('5/8 清除旧 Canvas Session 引用...')
  removeLegacyReferences()

  console.log('6/8 更新脚手架治理清单...')
  repairScaffoldManifest()

  console.log('7/8 增强架构检查...')
  repairArchitectureCheck()

  console.log('8/8 验证架构...')
  verifyStaticArchitecture()

  if (!skipVerify) {
    runValidation()
  }

  console.log('')
  console.log('架构重构修复完成。')
}

function preflight() {
  const requiredPaths = [
    'package.json',
    'pnpm-workspace.yaml',
    'tests/architecture/check.mjs',
    'architecture.scaffolds.json',
    'apps/desktop/package.json',
    'apps/desktop/src/presentation/AppShell.tsx',
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
    'editor/core/src/extensions-public-api.ts',
    'editor/document/package.json',
    'editor/document/tsconfig.json',
    'editor/document/src/public-api.ts',
    'editor/document/src/application/canvas-document-service.ts',
    'features/flowchart/src/extension.ts',
  ]

  for (const path of requiredPaths) {
    if (!existsSync(join(root, path))) {
      fail(`缺少必要文件：${path}`)
    }
  }

  if (existsSync(join(root, 'editor/document'))) {
    fail('仍存在 editor/document；当前脚本仅适用于已迁移到 editor/document 的 main 分支。')
  }
}

function normalizeExtensionImports() {
  forEachSourceFile((path) => {
    const relativePath = normalizePath(relative(root, path))

    if (relativePath.startsWith('editor/core/')) {
      return
    }

    const source = readFileSync(path, 'utf8')

    if (!source.includes('HybridCanvasExtension')) {
      return
    }

    let next = source

    next = next.replaceAll(
      "from '@hybrid-canvas/canvas/application'",
      "from '@hybrid-canvas/canvas/extensions'",
    )

    next = next.replaceAll(
      'from "@hybrid-canvas/canvas/application"',
      'from "@hybrid-canvas/canvas/extensions"',
    )

    next = next.replaceAll(
      "from '@hybrid-canvas/canvas/react'",
      "from '@hybrid-canvas/canvas/extensions'",
    )

    next = next.replaceAll(
      'from "@hybrid-canvas/canvas/react"',
      'from "@hybrid-canvas/canvas/extensions"',
    )

    if (next !== source) {
      writeFileSync(path, next, 'utf8')
      console.log(`  修复 ${relativePath}`)
    }
  })
}

function repairAppShellBoundary() {
  const path = 'apps/desktop/src/presentation/AppShell.tsx'

  let source = readText(path)

  source = source.replace(
    /^\s*import\s+type\s+\{\s*CanvasWorkflow\s*\}\s+from\s+['"]\.\.\/application\/canvas\/canvas-workflow['"]\s*\r?\n/m,
    '',
  )

  source = source.replace(
    /^\s*import\s+\{\s*CanvasWorkflow\s*\}\s+from\s+['"]\.\.\/application\/canvas\/canvas-workflow['"]\s*\r?\n/m,
    '',
  )

  source = source.replaceAll(
    'readonly canvases: CanvasWorkflow',
    'readonly canvases: WorkspaceCanvasUIPort',
  )

  if (!source.includes('type WorkspaceCanvasUIPort')) {
    const simpleImport = "import { WorkspaceContainer } from './workspace/WorkspaceContainer'"

    if (source.includes(simpleImport)) {
      source = source.replace(
        simpleImport,
        [
          'import {',
          '  type WorkspaceCanvasUIPort,',
          '  WorkspaceContainer,',
          "} from './workspace/WorkspaceContainer'",
        ].join('\n'),
      )
    } else {
      const workspaceImportPattern =
        /import\s+\{([\s\S]*?)\}\s+from\s+['"]\.\/workspace\/WorkspaceContainer['"]/

      const match = source.match(workspaceImportPattern)

      if (!match) {
        fail('无法定位 AppShell 的 WorkspaceContainer import。')
      }

      const members = match[1]
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)

      if (!members.some((value) => value.includes('WorkspaceCanvasUIPort'))) {
        members.unshift('type WorkspaceCanvasUIPort')
      }

      if (!members.includes('WorkspaceContainer')) {
        members.push('WorkspaceContainer')
      }

      source = source.replace(
        workspaceImportPattern,
        [
          'import {',
          ...members.map((member) => `  ${member},`),
          "} from './workspace/WorkspaceContainer'",
        ].join('\n'),
      )
    }
  }

  if (/from\s+['"]\.\.\/application\/canvas\//.test(source)) {
    fail('AppShell 仍直接依赖 application/canvas 实现。')
  }

  writeText(path, source)
}

function repairDocumentPackage() {
  updateJson('editor/document/package.json', (manifest) => {
    manifest.name = '@hybrid-canvas/document'
    manifest.private = true
    manifest.type = 'module'
    manifest.sideEffects = false

    manifest.exports = {
      '.': {
        types: './src/public-api.ts',
        default: './src/public-api.ts',
      },
    }

    manifest.scripts = {
      build: 'tsc --project tsconfig.json --noEmit',
      check: 'tsc --project tsconfig.json --noEmit',
      typecheck: 'tsc --project tsconfig.json --noEmit',
      test: 'vitest run',
      clean: 'rimraf .turbo *.tsbuildinfo',
    }

    manifest.dependencies ??= {}

    delete manifest.dependencies['@hybrid-canvas/workspace']
    delete manifest.dependencies['@hybrid-canvas/desktop']
    delete manifest.dependencies['@hybrid-canvas/platforms-desktop-runtime']
    delete manifest.dependencies['@tauri-apps/api']
    delete manifest.dependencies.react
    delete manifest.dependencies['react-dom']

    manifest.dependencies['@hybrid-canvas/canvas'] = 'workspace:*'
    manifest.dependencies['@hybrid-canvas/file'] = 'workspace:*'
    manifest.dependencies.tldraw = 'catalog:'

    manifest.dependencies = sortObject(manifest.dependencies)

    manifest.devDependencies ??= {}
    manifest.devDependencies.typescript = 'catalog:'
    manifest.devDependencies.vitest = 'catalog:'
    manifest.devDependencies = sortObject(manifest.devDependencies)

    return manifest
  })

  updateJson('editor/document/tsconfig.json', (config) => {
    config.extends = '../../tsconfig.base.json'
    config.compilerOptions ??= {}

    config.compilerOptions.tsBuildInfoFile = './node_modules/.cache/typescript/document.tsbuildinfo'

    config.compilerOptions.paths ??= {}

    delete config.compilerOptions.paths['@hybrid-canvas/workspace']

    config.compilerOptions.paths['@hybrid-canvas/canvas'] = ['../core/src/public-api.ts']

    config.compilerOptions.paths['@hybrid-canvas/canvas/application'] = [
      '../core/src/application/public-api.ts',
    ]

    config.compilerOptions.paths['@hybrid-canvas/canvas/extensions'] = [
      '../core/src/extensions-public-api.ts',
    ]

    config.compilerOptions.paths['@hybrid-canvas/file'] = ['../persistence/src/public-api.ts']

    config.include = ['src/**/*.ts']

    return config
  })

  const servicePath = 'editor/document/src/application/canvas-document-service.ts'

  let service = readText(servicePath)

  service = service.replaceAll(
    "from '@hybrid-canvas/canvas/application'",
    "from '@hybrid-canvas/canvas/application'",
  )

  service = service.replaceAll(
    "from '@hybrid-canvas/canvas/extensions'",
    "from '@hybrid-canvas/canvas/extensions'",
  )

  if (/@hybrid-canvas\/workspace/.test(service)) {
    fail(`${servicePath} 仍依赖 Workspace。`)
  }

  if (/@tauri-apps\//.test(service)) {
    fail(`${servicePath} 仍直接依赖 Tauri。`)
  }

  writeText(servicePath, service)
}

function repairDesktopPackage() {
  updateJson('apps/desktop/package.json', (manifest) => {
    manifest.dependencies ??= {}

    delete manifest.dependencies['@hybrid-canvas/document']

    manifest.dependencies['@hybrid-canvas/document'] = 'workspace:*'

    manifest.dependencies = sortObject(manifest.dependencies)

    return manifest
  })
}

function removeLegacyReferences() {
  const replacements = [
    ['@hybrid-canvas/document', '@hybrid-canvas/document'],
    ['editor/document', 'editor/document'],
  ]

  forEachRepositoryTextFile((path) => {
    const relativePath = normalizePath(relative(root, path))

    if (relativePath === 'tooling/script/refactor.mjs') {
      return
    }

    const source = readFileSync(path, 'utf8')
    let next = source

    for (const [oldValue, newValue] of replacements) {
      next = next.replaceAll(oldValue, newValue)
    }

    if (next !== source) {
      writeFileSync(path, next, 'utf8')
      console.log(`  修复 ${relativePath}`)
    }
  })
}

function repairScaffoldManifest() {
  updateJson('architecture.scaffolds.json', (manifest) => {
    manifest.version = 2

    manifest.policy = {
      purpose:
        'Reserved scaffolds are allowed only when ownership, activation and removal rules are explicit.',
      requiredFields: [
        'path',
        'stage',
        'role',
        'owner',
        'activationCondition',
        'removalCondition',
        'allowedDependencies',
        'forbiddenDependencies',
      ],
    }

    manifest.scaffolds = (manifest.scaffolds ?? []).map((scaffold) => ({
      ...scaffold,
      owner: scaffold.owner ?? inferScaffoldOwner(scaffold.path),
      removalCondition:
        scaffold.removalCondition ??
        'Remove this scaffold when its activation condition is no longer planned within two release milestones.',
      allowedDependencies: scaffold.allowedDependencies ?? inferAllowedDependencies(scaffold.path),
      forbiddenDependencies: scaffold.forbiddenDependencies ?? [],
    }))

    return manifest
  })
}

function repairArchitectureCheck() {
  const path = 'tests/architecture/check.mjs'

  let source = readText(path)

  source = source.replaceAll('editor/document/', 'editor/document/')

  source = source.replace(/\(\?:asset\|canvas\|desktop/, '(?:asset|canvas|document|desktop')

  source = source.replace(
    "'editor/': '(?:asset|canvas|file|plugin)'",
    "'editor/': '(?:asset|canvas|document|file|plugin)'",
  )

  const extensionRuleMessage = 'HybridCanvasExtension 必须从 @hybrid-canvas/canvas/extensions 导入'

  if (!source.includes(extensionRuleMessage)) {
    const marker = 'function check(path) {'

    if (!source.includes(marker)) {
      fail('无法定位 architecture check(path)。')
    }

    const insertionMarker = "  const text = readFileSync(path, 'utf8')"

    if (!source.includes(insertionMarker)) {
      fail('无法定位 architecture check 的源码读取位置。')
    }

    const rule = String.raw`

  if (
    !rel.startsWith('editor/core/') &&
    /\bHybridCanvasExtension\b/.test(text) &&
    /from\s+['"]@hybrid-canvas\/canvas\/(?!extensions['"])[^'"]+['"]/.test(text)
  ) {
    violations.push(
      \`${'${rel}'}: HybridCanvasExtension 必须从 @hybrid-canvas/canvas/extensions 导入\`,
    )
  }`

    source = source.replace(insertionMarker, `${insertionMarker}${rule}`)
  }

  const appBoundaryMessage = 'presentation 不得依赖 CanvasWorkflow application 实现'

  if (!source.includes(appBoundaryMessage)) {
    const insertionMarker =
      "  if (rel.startsWith('apps/desktop/src/presentation/') && /\\bApplicationRuntime\\b/.test(text)) {"

    if (source.includes(insertionMarker)) {
      const rule = String.raw`  if (
    rel.startsWith('apps/desktop/src/presentation/') &&
    /from\s+['"][^'"]*\/application\/canvas\//.test(text)
  ) {
    violations.push(
      \`${'${rel}'}: presentation 不得依赖 CanvasWorkflow application 实现\`,
    )
  }

`

      source = source.replace(insertionMarker, `${rule}${insertionMarker}`)
    }
  }

  source = source.replace(
    'if (scaffoldManifest.version !== 1 || !Array.isArray(scaffoldManifest.scaffolds)) {',
    'if (![1, 2].includes(scaffoldManifest.version) || !Array.isArray(scaffoldManifest.scaffolds)) {',
  )

  const scaffoldMarker = `    if (!scaffold.role || !scaffold.activationCondition) {
      violations.push(\`\${scaffold.path}: scaffold requires role and activationCondition\`)
    }`

  const scaffoldGovernanceMessage = 'scaffold requires owner and removalCondition'

  if (source.includes(scaffoldMarker) && !source.includes(scaffoldGovernanceMessage)) {
    source = source.replace(
      scaffoldMarker,
      `${scaffoldMarker}
    if (scaffoldManifest.version >= 2) {
      if (!scaffold.owner || !scaffold.removalCondition) {
        violations.push(
          \`\${scaffold.path}: scaffold requires owner and removalCondition\`,
        )
      }
      if (!Array.isArray(scaffold.allowedDependencies)) {
        violations.push(
          \`\${scaffold.path}: scaffold requires allowedDependencies\`,
        )
      }
    }`,
    )
  }

  writeText(path, source)
}

function verifyStaticArchitecture() {
  const violations = []

  const documentManifest = readJson('editor/document/package.json')

  const forbiddenDependencies = [
    '@hybrid-canvas/workspace',
    '@hybrid-canvas/desktop',
    '@hybrid-canvas/platforms-desktop-runtime',
    '@tauri-apps/api',
    'react',
    'react-dom',
  ]

  for (const dependency of forbiddenDependencies) {
    if (
      documentManifest.dependencies?.[dependency] ||
      documentManifest.peerDependencies?.[dependency]
    ) {
      violations.push(`editor/document 禁止依赖 ${dependency}`)
    }
  }

  walk(join(root, 'editor/document/src'), (path) => {
    if (!/\.(?:ts|tsx)$/.test(path)) {
      return
    }

    const source = readFileSync(path, 'utf8')

    const relativePath = normalizePath(relative(root, path))

    const rules = [
      [/@hybrid-canvas\/workspace/, '依赖 Workspace'],
      [/@hybrid-canvas\/platforms-desktop-runtime/, '依赖桌面平台'],
      [/@tauri-apps\//, '直接依赖 Tauri'],
      [/from\s+['"]react(?:\/[^'"]*)?['"]/, '依赖 React'],
    ]

    for (const [pattern, message] of rules) {
      if (pattern.test(source)) {
        violations.push(`${relativePath}: ${message}`)
      }
    }
  })

  forEachRepositoryTextFile((path) => {
    const relativePath = normalizePath(relative(root, path))

    if (relativePath === 'tooling/script/refactor.mjs') {
      return
    }

    const source = readFileSync(path, 'utf8')

    if (source.includes('@hybrid-canvas/document') || source.includes('editor/document')) {
      violations.push(`${relativePath}: 仍引用旧 CanvasSession`)
    }
  })

  if (violations.length > 0) {
    fail(['静态架构验证失败：', ...violations.map((item) => `- ${item}`)].join('\n'))
  }
}

function runValidation() {
  const commands = [
    'pnpm install --lockfile-only',
    'pnpm format',
    'pnpm test:architecture',
    'pnpm --filter @hybrid-canvas/canvas typecheck',
    'pnpm --filter @hybrid-canvas/document typecheck',
    'pnpm --filter @hybrid-canvas/flowchart typecheck',
    'pnpm --filter @hybrid-canvas/file typecheck',
    'pnpm --filter @hybrid-canvas/scientific-plot typecheck',
    'pnpm --filter @hybrid-canvas/workspace typecheck',
    'pnpm --filter @hybrid-canvas/desktop typecheck',
    'pnpm typecheck',
    'pnpm lint',
    'pnpm test',
    'pnpm build',
  ]

  if (!skipRust) {
    commands.push(
      'cargo fmt --check',
      'cargo clippy --workspace --all-targets --all-features -- -D warnings',
      'cargo test --workspace --all-features',
    )
  }

  for (const command of commands) {
    run(command)
  }
}

function forEachSourceFile(visitor) {
  const directories = ['apps', 'editor', 'features', 'foundations', 'platforms']

  for (const directory of directories) {
    const absolute = join(root, directory)

    if (!existsSync(absolute)) {
      continue
    }

    walk(absolute, (path) => {
      if (/\.(?:ts|tsx)$/.test(path)) {
        visitor(path)
      }
    })
  }
}

function forEachRepositoryTextFile(visitor) {
  const directories = [
    'apps',
    'editor',
    'features',
    'foundations',
    'platforms',
    'tests',
    'tooling',
    'docs',
  ]

  for (const directory of directories) {
    const absolute = join(root, directory)

    if (!existsSync(absolute)) {
      continue
    }

    walk(absolute, (path) => {
      if (/\.(?:ts|tsx|js|mjs|cjs|json|md|yaml|yml)$/.test(path)) {
        visitor(path)
      }
    })
  }
}

function walk(directory, visitor) {
  for (const name of readdirSync(directory)) {
    if (ignoredDirectories.has(name)) {
      continue
    }

    const path = join(directory, name)
    const stats = statSync(path)

    if (stats.isDirectory()) {
      walk(path, visitor)
    } else {
      visitor(path)
    }
  }
}

function inferScaffoldOwner(path) {
  if (path.startsWith('editor/')) {
    return 'editor'
  }

  if (path.startsWith('features/')) {
    return path.split('/').slice(0, 2).join('/')
  }

  if (path.startsWith('platforms/')) {
    return 'desktop-platform'
  }

  return 'architecture'
}

function inferAllowedDependencies(path) {
  if (path.startsWith('features/')) {
    return ['editor/', 'foundations/']
  }

  if (path.startsWith('editor/')) {
    return ['foundations/']
  }

  if (path.startsWith('platforms/')) {
    return ['editor/', 'foundations/']
  }

  return ['foundations/']
}

function updateJson(path, update) {
  const value = readJson(path)
  writeJson(path, update(value))
}

function readJson(path) {
  return JSON.parse(readText(path))
}

function writeJson(path, value) {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`)
}

function sortObject(value) {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  )
}

function readText(path) {
  return readFileSync(join(root, path), 'utf8')
}

function writeText(path, content) {
  const absolute = join(root, path)

  mkdirSync(dirname(absolute), {
    recursive: true,
  })

  writeFileSync(absolute, content, 'utf8')
}

function normalizePath(path) {
  return path.replaceAll('\\', '/')
}

function run(command) {
  console.log('')
  console.log(`> ${command}`)

  execSync(command, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  })
}

function fail(message) {
  console.error('')
  console.error(message)
  process.exit(1)
}
