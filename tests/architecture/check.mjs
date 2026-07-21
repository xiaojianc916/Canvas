#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const violations = []
const scaffoldManifestPath = join(root, 'architecture.scaffolds.json')
const scaffoldManifest = JSON.parse(readFileSync(scaffoldManifestPath, 'utf8'))

const ignoredDirectories = new Set([
  '.git',
  '.refactor-backup',
  '.turbo',
  'dist',
  'node_modules',
  'target',
])

const layerRules = [
  {
    source: 'foundations/',
    forbiddenPackages:
      /@hybrid-canvas\/(?:asset|canvas|document|desktop(?:-ipc)?|file|flowchart|freehand|import-export|platforms-desktop-runtime|plugin|scientific-plot|settings|workspace)(?:['"/])?/g,
    message: 'foundations 反向依赖上层包',
  },
  {
    source: 'editor/',
    forbiddenPackages: /@hybrid-canvas\/(?:desktop|platforms-desktop-runtime|workspace)(?:['"/])?/g,
    message: 'editor 依赖应用、平台或产品壳层',
  },
  {
    source: 'features/',
    forbiddenPackages:
      /@hybrid-canvas\/(?:desktop|desktop-ipc|platforms-desktop-runtime)(?:['"/])?/g,
    message: 'feature 直接依赖桌面平台',
  },
  {
    source: 'platforms/',
    forbiddenPackages: /@hybrid-canvas\/desktop(?=['"/])/g,
    message: 'platform 反向依赖应用入口',
  },
]

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (ignoredDirectories.has(name)) {
      continue
    }

    const path = join(dir, name)

    if (statSync(path).isDirectory()) {
      walk(path)
    } else {
      check(path)
    }
  }
}

function check(path) {
  if (!/\.(?:ts|tsx)$/.test(path)) {
    return
  }

  const rel = relative(root, path).replaceAll('\\', '/')
  const text = readFileSync(path, 'utf8')

  if (
    !rel.startsWith('editor/core/') &&
    /\bHybridCanvasExtension\b/.test(text) &&
    /from\s+['"]@hybrid-canvas\/canvas\/(?!extensions['"])[^'"]+['"]/.test(text)
  ) {
    violations.push(
      \`${rel}: HybridCanvasExtension 必须从 @hybrid-canvas/canvas/extensions 导入\`,
    )
  }
  const scaffold = scaffoldManifest.scaffolds.find((entry) => rel.startsWith(`${entry.path}/`))
  if (scaffold) {
    for (const forbidden of scaffold.forbiddenDependencies ?? []) {
      const packageName = {
        'apps/': 'desktop',
        'editor/': '(?:asset|canvas|document|file|plugin)',
        'features/':
          '(?:canvas-session|flowchart|freehand|import-export|scientific-plot|settings|workspace)',
        'foundations/': '(?:design-system|foundations-[a-z-]+)',
        'platforms/': '(?:desktop-ipc|platforms-desktop-runtime)',
      }[forbidden]
      if (packageName && new RegExp(`@hybrid-canvas/${packageName}(?:['"/])`).test(text)) {
        violations.push(
          `${rel}: scaffold ${scaffold.path} violates forbidden dependency ${forbidden}`,
        )
      }
    }
  }

  for (const rule of layerRules) {
    rule.forbiddenPackages.lastIndex = 0
    if (rel.startsWith(rule.source) && rule.forbiddenPackages.test(text)) {
      violations.push(`${rel}: ${rule.message}`)
    }
  }

  if (rel.startsWith('features/') && /@tauri-apps\//.test(text)) {
    violations.push(`${rel}: feature 直接依赖 Tauri SDK`)
  }

  if (
    rel.startsWith('editor/document/') &&
    /@hybrid-canvas\/(?:desktop|desktop-ipc|platforms-desktop-runtime)|@tauri-apps\//.test(text)
  ) {
    violations.push(`${rel}: Canvas application 必须保持平台无关`)
  }

  if (
    rel.startsWith('editor/document/src/application/') &&
    /\b(?:DrawFileCommands|FileDialog|ApplicationWindowManager|MainWindowController)\b/.test(text)
  ) {
    violations.push(`${rel}: Canvas application 依赖平台 adapter 类型，必须通过最小端口注入`)
  }

  if (rel === 'editor/core/src/public-api.ts' && /from '\.\/runtime\//.test(text)) {
    violations.push(`${rel}: editor core public-api 暴露 runtime 实现`)
  }

  if (rel === 'editor/core/src/public-api.ts' && /from '\.\/application\/model\//.test(text)) {
    violations.push(`${rel}: editor core public-api 直接暴露 model 内部实现`)
  }

  if (rel === 'editor/core/src/public-api.ts' && /from '\.\/react\/editor-context'/.test(text)) {
    violations.push(`${rel}: editor core public-api 不应绕过 react/public-api`)
  }

  if (
    rel === 'features/workspace/src/public-api.ts' &&
    /from '\.\/application\/(?:session|commands|model)\//.test(text)
  ) {
    violations.push(`${rel}: workspace public-api 暴露 application 内部实现`)
  }

  if (!rel.startsWith('editor/core/') && /createTLStore\s*\(/.test(text)) {
    violations.push(`${rel}: 非 editor/core 创建 TLStore`)
  }

  if (!rel.startsWith('editor/core/') && /\.store\.listen\s*\(/.test(text)) {
    violations.push(`${rel}: 非 editor/core 直接监听 TLStore，必须通过 EditorSession API`)
  }

  if (
    rel.startsWith('features/workspace/src/') &&
    /\b(?:DocumentId|DocumentSessionId|DocumentTabViewModel|ActiveDocumentViewModel|CreateDocumentRequest)\b/.test(
      text,
    )
  ) {
    violations.push(`${rel}: workspace 领域语言必须使用 Canvas，不得继续引入 Document 模型`)
  }

  if (
    rel !== 'editor/core/src/public-api.ts' &&
    /from\s+['"]@hybrid-canvas\/canvas['"]/.test(text)
  ) {
    violations.push(`${rel}: 必须选择 Canvas /application、/extensions 或 /react 入口`)
  }

  if (
    rel !== 'features/workspace/src/public-api.ts' &&
    /from\s+['"]@hybrid-canvas\/workspace['"]/.test(text)
  ) {
    violations.push(`${rel}: 必须选择 Workspace /contracts、/application 或 /react 入口`)
  }

  if (
    rel.startsWith('apps/desktop/src/presentation/') &&
    /from\s+['"]@hybrid-canvas\/(?:canvas|workspace)['"]/.test(text)
  ) {
    violations.push(`${rel}: presentation 必须使用 Canvas/Workspace 的 /react 或 /contracts 入口`)
  }

  if (/from\s+['"]@hybrid-canvas\/[^'"]+\/src\//.test(text)) {
    violations.push(`${rel}: 跨包 deep import，必须使用 package exports`)
  }

  if (
    /\/src\/contracts\//.test(rel) &&
    /from\s+['"][^'"]*\/(?:application|presentation|runtime)\//.test(text)
  ) {
    violations.push(`${rel}: contract 反向依赖实现层`)
  }

  if (/\/src\/application\//.test(rel) && /from\s+['"][^'"]*\/presentation\//.test(text)) {
    violations.push(`${rel}: application 反向依赖 presentation`)
  }

  if (
    rel.startsWith('apps/desktop/src/bootstrap/') &&
    /(?:parseDrawDocument|serializeDrawDocument|createTLStore)\s*\(/.test(text)
  ) {
    violations.push(`${rel}: composition root 承载文档或编辑器业务逻辑`)
  }

  if (
    rel.startsWith('apps/desktop/src/presentation/') &&
    /from\s+['"][^'"]*\/application\/canvas\//.test(text)
  ) {
    violations.push(
      \`${rel}: presentation 不得依赖 CanvasWorkflow application 实现\`,
    )
  }

  if (rel.startsWith('apps/desktop/src/presentation/') && /\bApplicationRuntime\b/.test(text)) {
    violations.push(`${rel}: presentation 不得依赖完整 ApplicationRuntime service locator`)
  }

  if (
    rel.startsWith('apps/desktop/src/presentation/') &&
    /from\s+['"][^'"]*\/application\/(?!termination\/application-termination-coordinator)/.test(
      text,
    )
  ) {
    violations.push(`${rel}: presentation deep import application 实现`)
  }

  if (
    /\/src\/presentation\//.test(rel) &&
    /create(?:WorkbenchSession|EditorSession|ApplicationRuntime)\s*\(/.test(text)
  ) {
    violations.push(`${rel}: presentation 创建 application/runtime 实例`)
  }

  if (/\/src\/presentation\//.test(rel) && /createContext\s*<[^>]*(?:Runtime|Service)/.test(text)) {
    violations.push(`${rel}: presentation 使用 Context 作为服务定位器`)
  }

  if (/from\s+['"]\.\.\/\.\.\/(?:apps|editor|features|foundations|platforms)\//.test(text)) {
    violations.push(`${rel}: 使用相对路径跨越顶层包边界`)
  }
}

validateScaffoldManifest()
walk(root)

function validateActiveArchitecture() {
  const documentPackage = join(root, 'editor/document/package.json')
  try {
    const manifest = JSON.parse(readFileSync(documentPackage, 'utf8'))
    if (manifest.name !== '@hybrid-canvas/document') {
      violations.push('editor/document must be published internally as @hybrid-canvas/document')
    }
    if (manifest.dependencies?.['@hybrid-canvas/workspace']) {
      violations.push('editor/document must not depend on product workspace')
    }
  } catch {
    violations.push('editor/document/package.json is missing or invalid')
  }
}

validateActiveArchitecture()

function validateScaffoldManifest() {
  if (![1, 2].includes(scaffoldManifest.version) || !Array.isArray(scaffoldManifest.scaffolds)) {
    violations.push('architecture.scaffolds.json: unsupported manifest format')
    return
  }
  const paths = new Set()
  for (const scaffold of scaffoldManifest.scaffolds) {
    if (!scaffold.path || paths.has(scaffold.path)) {
      violations.push(`architecture.scaffolds.json: invalid or duplicate path ${scaffold.path}`)
      continue
    }
    paths.add(scaffold.path)
    const absolutePath = join(root, scaffold.path)
    try {
      if (!statSync(absolutePath).isDirectory()) {
        violations.push(`${scaffold.path}: scaffold path is not a directory`)
      }
    } catch {
      violations.push(`${scaffold.path}: scaffold path does not exist`)
    }
    if (!scaffold.role || !scaffold.activationCondition) {
      violations.push(`${scaffold.path}: scaffold requires role and activationCondition`)
    }
    if (scaffoldManifest.version >= 2) {
      if (!scaffold.owner || !scaffold.removalCondition) {
        violations.push(`${scaffold.path}: scaffold requires owner and removalCondition`)
      }
      if (!Array.isArray(scaffold.allowedDependencies)) {
        violations.push(`${scaffold.path}: scaffold requires allowedDependencies`)
      }
    }
    if (!['reserved', 'partial', 'domain-only'].includes(scaffold.stage)) {
      violations.push(`${scaffold.path}: unknown scaffold stage ${scaffold.stage}`)
    }
    for (const dependency of scaffold.forbiddenDependencies ?? []) {
      if (!['apps/', 'editor/', 'features/', 'foundations/', 'platforms/'].includes(dependency)) {
        violations.push(`${scaffold.path}: invalid forbidden dependency ${dependency}`)
      }
    }
  }
}

if (violations.length) {
  console.error(violations.join('\n'))
  process.exit(1)
}
