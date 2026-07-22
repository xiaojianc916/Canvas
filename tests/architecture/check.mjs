#!/usr/bin/env node
/* biome-ignore-all lint/suspicious/noConsole: CLI scripts intentionally write command output. */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const root = resolve(currentDirectory, '../..')

const violations = []

const ignoredDirectories = new Set([
  '.git',
  '.refactor-backup',
  '.turbo',
  'dist',
  'node_modules',
  'target',
])

const validScaffoldStages = new Set(['reserved', 'partial', 'domain-only'])

const validDependencyLayers = new Set([
  'apps/',
  'editor/',
  'features/',
  'foundations/',
  'platforms/',
])

const scaffoldPackagePatterns = {
  'apps/': 'desktop',
  'editor/': '(?:asset|canvas|document|file|plugin)',
  'features/':
    '(?:canvas-session|flowchart|freehand|import-export|scientific-plot|settings|workspace)',
  'foundations/': '(?:design-system|foundations-[a-z-]+)',
  'platforms/': '(?:desktop-ipc|platforms-desktop-runtime)',
}

const layerRules = [
  {
    source: 'foundations/',
    pattern:
      /@hybrid-canvas\/(?:asset|canvas|document|desktop(?:-ipc)?|file|flowchart|freehand|import-export|platforms-desktop-runtime|plugin|scientific-plot|settings|workspace)(?=['"/])/,
    message: 'foundations 反向依赖上层包',
  },
  {
    source: 'editor/',
    pattern: /@hybrid-canvas\/(?:desktop|platforms-desktop-runtime|workspace)(?=['"/])/,
    message: 'editor 依赖应用、平台或产品壳层',
  },
  {
    source: 'features/',
    pattern: /@hybrid-canvas\/(?:desktop|desktop-ipc|platforms-desktop-runtime)(?=['"/])/,
    message: 'feature 直接依赖桌面平台',
  },
  {
    source: 'platforms/',
    pattern: /@hybrid-canvas\/desktop(?=['"/])/,
    message: 'platform 反向依赖应用入口',
  },
]

const fileRules = [
  {
    appliesTo: (rel) => rel.startsWith('features/'),
    pattern: /@tauri-apps\//,
    message: 'feature 直接依赖 Tauri SDK',
  },
  {
    appliesTo: (rel) => rel.startsWith('editor/document/'),
    pattern: /(?:@hybrid-canvas\/(?:desktop|desktop-ipc|platforms-desktop-runtime)|@tauri-apps\/)/,
    message: 'Canvas application 必须保持平台无关',
  },
  {
    appliesTo: (rel) => rel.startsWith('editor/document/src/application/'),
    pattern: /\b(?:DrawFileCommands|FileDialog|ApplicationWindowManager|MainWindowController)\b/,
    message: 'Canvas application 依赖平台 adapter 类型，必须通过最小端口注入',
  },
  {
    appliesTo: (rel) => rel === 'editor/core/src/public-api.ts',
    pattern: /from\s+['"]\.\/runtime\//,
    message: 'editor core public-api 暴露 runtime 实现',
  },
  {
    appliesTo: (rel) => rel === 'editor/core/src/public-api.ts',
    pattern: /from\s+['"]\.\/application\/model\//,
    message: 'editor core public-api 直接暴露 model 内部实现',
  },
  {
    appliesTo: (rel) => rel === 'editor/core/src/public-api.ts',
    pattern: /from\s+['"]\.\/react\/editor-context['"]/,
    message: 'editor core public-api 不应绕过 react/public-api',
  },
  {
    appliesTo: (rel) => rel === 'features/workspace/src/public-api.ts',
    pattern: /from\s+['"]\.\/application\/(?:session|commands|model)\//,
    message: 'workspace public-api 暴露 application 内部实现',
  },
  {
    appliesTo: (rel) => !rel.startsWith('editor/core/'),
    pattern: /\bcreateTLStore\s*\(/,
    message: '非 editor/core 创建 TLStore',
  },
  {
    appliesTo: (rel) => !rel.startsWith('editor/core/'),
    pattern: /\.store\.listen\s*\(/,
    message: '非 editor/core 直接监听 TLStore，必须通过 EditorSession API',
  },
  {
    appliesTo: (rel) => rel.startsWith('features/workspace/src/'),
    pattern:
      /\b(?:DocumentId|DocumentSessionId|DocumentTabViewModel|ActiveDocumentViewModel|CreateDocumentRequest)\b/,
    message: 'workspace 领域语言必须使用 Canvas，不得继续引入 Document 模型',
  },
  {
    appliesTo: (rel) => rel !== 'editor/core/src/public-api.ts',
    pattern: /from\s+['"]@hybrid-canvas\/canvas['"]/,
    message: '必须选择 Canvas /application、/extensions 或 /react 入口',
  },
  {
    appliesTo: (rel) => rel !== 'features/workspace/src/public-api.ts',
    pattern: /from\s+['"]@hybrid-canvas\/workspace['"]/,
    message: '必须选择 Workspace /contracts、/application 或 /react 入口',
  },
  {
    appliesTo: (rel) => rel.startsWith('apps/desktop/src/presentation/'),
    pattern: /from\s+['"]@hybrid-canvas\/(?:canvas|workspace)['"]/,
    message: 'presentation 必须使用 Canvas/Workspace 的 /react 或 /contracts 入口',
  },
  {
    appliesTo: () => true,
    pattern: /from\s+['"]@hybrid-canvas\/[^'"]+\/src\//,
    message: '跨包 deep import，必须使用 package exports',
  },
  {
    appliesTo: (rel) => /\/src\/contracts\//.test(rel),
    pattern: /from\s+['"][^'"]*\/(?:application|presentation|runtime)\//,
    message: 'contract 反向依赖实现层',
  },
  {
    appliesTo: (rel) => /\/src\/application\//.test(rel),
    pattern: /from\s+['"][^'"]*\/presentation\//,
    message: 'application 反向依赖 presentation',
  },
  {
    appliesTo: (rel) => rel.startsWith('apps/desktop/src/bootstrap/'),
    pattern: /\b(?:parseDrawDocument|serializeDrawDocument|createTLStore)\s*\(/,
    message: 'composition root 承载文档或编辑器业务逻辑',
  },
  {
    appliesTo: (rel) => rel.startsWith('apps/desktop/src/presentation/'),
    pattern: /from\s+['"][^'"]*\/application\/canvas\//,
    message: 'presentation 不得依赖 CanvasWorkflow application 实现',
  },
  {
    appliesTo: (rel) => rel.startsWith('apps/desktop/src/presentation/'),
    pattern: /\bApplicationRuntime\b/,
    message: 'presentation 不得依赖完整 ApplicationRuntime service locator',
  },
  {
    appliesTo: (rel) => rel.startsWith('apps/desktop/src/presentation/'),
    pattern:
      /from\s+['"][^'"]*\/application\/(?!termination\/application-termination-coordinator(?:['"]|\/))/,
    message: 'presentation deep import application 实现',
  },
  {
    appliesTo: (rel) => /\/src\/presentation\//.test(rel),
    pattern: /\bcreate(?:WorkbenchSession|EditorSession|ApplicationRuntime)\s*\(/,
    message: 'presentation 创建 application/runtime 实例',
  },
  {
    appliesTo: (rel) => /\/src\/presentation\//.test(rel),
    pattern: /\bcreateContext\s*<[^>]*(?:Runtime|Service)[^>]*>/,
    message: 'presentation 使用 Context 作为服务定位器',
  },
  {
    appliesTo: () => true,
    pattern: /from\s+['"]\.\.\/\.\.\/(?:apps|editor|features|foundations|platforms)\//,
    message: '使用相对路径跨越顶层包边界',
  },
]

function addViolation(message) {
  violations.push(message)
}

function readJson(path, errorMessage) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    addViolation(`${errorMessage}: ${formatError(error)}`)
    return null
  }
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error)
}

function normalizeRelativePath(path) {
  return relative(root, path).replaceAll('\\', '/')
}

function isTypeScriptFile(path) {
  return /\.(?:ts|tsx)$/.test(path)
}

function validateScaffoldManifest(manifest) {
  if (!manifest || ![1, 2].includes(manifest.version) || !Array.isArray(manifest.scaffolds)) {
    addViolation('architecture.scaffolds.json: unsupported manifest format')
    return false
  }

  const paths = new Set()

  for (const scaffold of manifest.scaffolds) {
    if (
      typeof scaffold.path !== 'string' ||
      scaffold.path.length === 0 ||
      paths.has(scaffold.path)
    ) {
      addViolation(
        `architecture.scaffolds.json: invalid or duplicate path ${String(scaffold.path)}`,
      )
      continue
    }

    paths.add(scaffold.path)
    validateScaffold(scaffold, manifest.version)
  }

  return true
}

function validateScaffold(scaffold, manifestVersion) {
  const absolutePath = join(root, scaffold.path)

  try {
    if (!statSync(absolutePath).isDirectory()) {
      addViolation(`${scaffold.path}: scaffold path is not a directory`)
    }
  } catch {
    addViolation(`${scaffold.path}: scaffold path does not exist`)
  }

  if (!scaffold.role || !scaffold.activationCondition) {
    addViolation(`${scaffold.path}: scaffold requires role and activationCondition`)
  }

  if (manifestVersion >= 2) {
    if (!scaffold.owner || !scaffold.removalCondition) {
      addViolation(`${scaffold.path}: scaffold requires owner and removalCondition`)
    }

    if (!Array.isArray(scaffold.allowedDependencies)) {
      addViolation(`${scaffold.path}: scaffold requires allowedDependencies`)
    }
  }

  if (!validScaffoldStages.has(scaffold.stage)) {
    addViolation(`${scaffold.path}: unknown scaffold stage ${String(scaffold.stage)}`)
  }

  for (const dependency of scaffold.forbiddenDependencies ?? []) {
    if (!validDependencyLayers.has(dependency)) {
      addViolation(`${scaffold.path}: invalid forbidden dependency ${dependency}`)
    }
  }
}

function validateActiveArchitecture() {
  const packagePath = join(root, 'editor/document/package.json')

  const manifest = readJson(packagePath, 'editor/document/package.json is missing or invalid')

  if (!manifest) {
    return
  }

  if (manifest.name !== '@hybrid-canvas/document') {
    addViolation('editor/document must be published internally as @hybrid-canvas/document')
  }

  if (manifest.dependencies?.['@hybrid-canvas/workspace']) {
    addViolation('editor/document must not depend on product workspace')
  }
}

function validateExtensionImport(rel, text) {
  if (rel.startsWith('editor/core/') || !/\bHybridCanvasExtension\b/.test(text)) {
    return
  }

  const invalidExtensionImport = /from\s+['"]@hybrid-canvas\/canvas\/(?!extensions['"])[^'"]+['"]/

  if (invalidExtensionImport.test(text)) {
    addViolation(`${rel}: HybridCanvasExtension 必须从 @hybrid-canvas/canvas/extensions 导入`)
  }
}

function findMatchingScaffold(rel, manifest) {
  return manifest.scaffolds.find(
    (entry) =>
      typeof entry.path === 'string' && (rel === entry.path || rel.startsWith(`${entry.path}/`)),
  )
}

function validateScaffoldDependencies(rel, text, manifest) {
  const scaffold = findMatchingScaffold(rel, manifest)

  if (!scaffold) {
    return
  }

  for (const forbidden of scaffold.forbiddenDependencies ?? []) {
    const packagePattern = scaffoldPackagePatterns[forbidden]

    if (!packagePattern) {
      continue
    }

    const dependencyPattern = new RegExp(`@hybrid-canvas/${packagePattern}(?=['"/])`)

    if (dependencyPattern.test(text)) {
      addViolation(`${rel}: scaffold ${scaffold.path} violates forbidden dependency ${forbidden}`)
    }
  }
}

function validateLayerRules(rel, text) {
  for (const rule of layerRules) {
    if (rel.startsWith(rule.source) && rule.pattern.test(text)) {
      addViolation(`${rel}: ${rule.message}`)
    }
  }
}

function validateFileRules(rel, text) {
  for (const rule of fileRules) {
    if (rule.appliesTo(rel) && rule.pattern.test(text)) {
      addViolation(`${rel}: ${rule.message}`)
    }
  }
}

function checkFile(path, scaffoldManifest) {
  if (!isTypeScriptFile(path)) {
    return
  }

  const rel = normalizeRelativePath(path)

  let text

  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    addViolation(`${rel}: 无法读取文件：${formatError(error)}`)
    return
  }

  validateExtensionImport(rel, text)
  validateScaffoldDependencies(rel, text, scaffoldManifest)
  validateLayerRules(rel, text)
  validateFileRules(rel, text)
}

function walk(directory, scaffoldManifest) {
  let entries

  try {
    entries = readdirSync(directory, {
      withFileTypes: true,
    })
  } catch (error) {
    addViolation(`${normalizeRelativePath(directory)}: 无法读取目录：${formatError(error)}`)
    return
  }

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue
    }

    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      walk(path, scaffoldManifest)
      continue
    }

    if (entry.isFile()) {
      checkFile(path, scaffoldManifest)
    }
  }
}

function main() {
  const manifestPath = join(root, 'architecture.scaffolds.json')

  const scaffoldManifest = readJson(
    manifestPath,
    'architecture.scaffolds.json is missing or invalid',
  )

  if (!validateScaffoldManifest(scaffoldManifest)) {
    printViolationsAndExit()
    return
  }

  validateActiveArchitecture()
  walk(root, scaffoldManifest)
  printViolationsAndExit()
}

function printViolationsAndExit() {
  if (violations.length === 0) {
    return
  }

  console.error(violations.join('\n'))
  process.exitCode = 1
}

main()
