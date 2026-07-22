#!/usr/bin/env node

/**
 * Canvas 工程审查第五阶段：依赖与 Tauri 插件清理
 *
 * 用法：
 *   node tooling/script/apply-engineering-review-phase5.mjs
 *   node tooling/script/apply-engineering-review-phase5.mjs --apply
 *
 * 行为：
 *   - 默认仅分析，不修改；
 *   - --apply 时删除可证明没有源码引用的候选直接依赖；
 *   - 不扫描或修改传递依赖；
 *   - 不删除 React、构建工具和可能由 JSX/配置隐式使用的依赖；
 *   - 生成 docs/generated/dependency-cleanup-report.md；
 *   - 任意验证失败时不会修改现有文件。
 */

import {
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const apply = process.argv.includes('--apply')

const stagedFiles = new Map()
const changes = []
const report = []

const ignoredDirectories = new Set([
  '.git',
  '.turbo',
  'node_modules',
  'target',
  'dist',
  'build',
  'coverage',
  'generated',
  'gen',
  'playwright-report',
  'test-results',
])

function absolutePath(relativePath) {
  return resolve(root, relativePath)
}

function repositoryPath(path) {
  return relative(root, path).replaceAll('\\', '/')
}

async function read(relativePath) {
  if (!stagedFiles.has(relativePath)) {
    stagedFiles.set(
      relativePath,
      await readFile(absolutePath(relativePath), 'utf8'),
    )
  }

  return stagedFiles.get(relativePath)
}

function stage(relativePath, content, description) {
  stagedFiles.set(relativePath, content)
  changes.push({ relativePath, description })
}

async function collectFiles(directory, predicate) {
  const result = []
  const entries = await readdir(directory, {
    withFileTypes: true,
  })

  for (const entry of entries) {
    if (
      entry.isDirectory() &&
      ignoredDirectories.has(entry.name)
    ) {
      continue
    }

    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      result.push(...(await collectFiles(path, predicate)))
      continue
    }

    if (entry.isFile() && predicate(path)) {
      result.push(path)
    }
  }

  return result
}

async function loadSourceCorpus(directory, extensions) {
  const paths = await collectFiles(
    directory,
    (path) => extensions.has(extname(path)),
  )

  const documents = []

  for (const path of paths) {
    documents.push({
      path: repositoryPath(path),
      content: await readFile(path, 'utf8'),
    })
  }

  return documents
}

function findReferences(documents, patterns) {
  const references = []

  for (const document of documents) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0

      if (pattern.test(document.content)) {
        references.push(document.path)
        break
      }
    }
  }

  return [...new Set(references)].sort()
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function assertRepository() {
  const packageJson = JSON.parse(await read('package.json'))

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error(
      `请在 Canvas 仓库根目录执行；当前项目为 ${String(
        packageJson.name,
      )}`,
    )
  }
}

async function inspectDesktopNpmDependencies() {
  const packagePath = 'apps/desktop/package.json'
  const packageJson = JSON.parse(await read(packagePath))

  const sourceDocuments = await loadSourceCorpus(
    absolutePath('apps/desktop'),
    new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.css', '.html']),
  )

  /*
   * 只处理能够通过显式模块字符串证明是否被使用的候选依赖。
   * React、React DOM、Vite、Tailwind 等可能通过 JSX 或配置隐式使用，
   * 不在自动删除范围内。
   */
  const candidates = [
    '@hybrid-canvas/file',
    '@hybrid-canvas/flowchart',
    '@hybrid-canvas/foundations-observability',
    '@tauri-apps/api',
    'lucide-react',
    'tldraw',
  ]

  const removed = []

  report.push('## Desktop npm 直接依赖')
  report.push('')
  report.push('| 依赖 | 引用位置 | 结论 |')
  report.push('|---|---|---|')

  for (const dependency of candidates) {
    if (!(dependency in (packageJson.dependencies ?? {}))) {
      report.push(
        `| \`${dependency}\` | — | 未声明，跳过 |`,
      )
      continue
    }

    const escaped = escapeRegex(dependency)
    const references = findReferences(sourceDocuments, [
      new RegExp(
        `(?:from\\s*|import\\s*\\(|require\\s*\\()\\s*['"]${escaped}(?:\\/[^'"]*)?['"]`,
        'g',
      ),
      new RegExp(`['"]${escaped}(?:\\/[^'"]*)?['"]`, 'g'),
    ])

    if (references.length > 0) {
      report.push(
        `| \`${dependency}\` | ${references
          .map((path) => `\`${path}\``)
          .join('<br>')} | 保留 |`,
      )
      continue
    }

    report.push(
      `| \`${dependency}\` | 未发现 | 删除候选 |`,
    )

    delete packageJson.dependencies[dependency]
    removed.push(dependency)
  }

  report.push('')

  if (removed.length > 0) {
    stage(
      packagePath,
      `${JSON.stringify(packageJson, null, 2)}\n`,
      `删除未引用的 desktop npm 依赖：${removed.join(', ')}`,
    )
  }

  return removed
}

function cargoDependencyPattern(name) {
  const escaped = escapeRegex(name)

  return new RegExp(
    `^[ \\t]*${escaped}(?:\\.workspace)?[ \\t]*=[^\\r\\n]*(?:\\r?\\n|$)`,
    'gm',
  )
}

async function inspectDesktopRustDependencies() {
  const cargoPath = 'apps/desktop/src-tauri/Cargo.toml'
  let cargo = await read(cargoPath)

  const rustDocuments = await loadSourceCorpus(
    absolutePath('apps/desktop/src-tauri'),
    new Set(['.rs']),
  )

  /*
   * 只清理 Tauri crate 中的直接候选依赖。
   *
   * dependency: Cargo 名称
   * rustName: Rust 源码中实际使用的 crate 名称
   */
  const candidates = [
    {
      dependency: 'tauri-plugin-os',
      rustName: 'tauri_plugin_os',
    },
    {
      dependency: 'tauri-plugin-updater',
      rustName: 'tauri_plugin_updater',
    },
    {
      dependency: 'tauri-plugin-process',
      rustName: 'tauri_plugin_process',
    },
    {
      dependency: 'tauri-plugin-shell',
      rustName: 'tauri_plugin_shell',
    },
    {
      dependency: 'tauri-plugin-notification',
      rustName: 'tauri_plugin_notification',
    },
    {
      dependency: 'tauri-plugin-global-shortcut',
      rustName: 'tauri_plugin_global_shortcut',
    },
    {
      dependency: 'tauri-plugin-window-state',
      rustName: 'tauri_plugin_window_state',
    },
    {
      dependency: 'tauri-plugin-clipboard-manager',
      rustName: 'tauri_plugin_clipboard_manager',
    },
    {
      dependency: 'tauri-plugin-fs',
      rustName: 'tauri_plugin_fs',
    },
    {
      dependency: 'tauri-plugin-opener',
      rustName: 'tauri_plugin_opener',
    },
  ]

  const removed = []

  report.push('## Tauri Rust 直接依赖')
  report.push('')
  report.push('| 依赖 | Rust 引用位置 | 结论 |')
  report.push('|---|---|---|')

  for (const candidate of candidates) {
    const declarationPattern = cargoDependencyPattern(
      candidate.dependency,
    )
    declarationPattern.lastIndex = 0

    if (!declarationPattern.test(cargo)) {
      report.push(
        `| \`${candidate.dependency}\` | — | 未声明，跳过 |`,
      )
      continue
    }

    const rustName = escapeRegex(candidate.rustName)
    const references = findReferences(rustDocuments, [
      new RegExp(`\\b${rustName}\\b`, 'g'),
    ])

    if (references.length > 0) {
      report.push(
        `| \`${candidate.dependency}\` | ${references
          .map((path) => `\`${path}\``)
          .join('<br>')} | 保留 |`,
      )
      continue
    }

    declarationPattern.lastIndex = 0
    cargo = cargo.replace(declarationPattern, '')
    removed.push(candidate.dependency)

    report.push(
      `| \`${candidate.dependency}\` | 未发现 | 删除候选 |`,
    )
  }

  report.push('')

  if (removed.length > 0) {
    stage(
      cargoPath,
      cargo,
      `删除未引用的 Tauri Rust 依赖：${removed.join(', ')}`,
    )
  }

  return removed
}

async function inspectPluginInitialization() {
  const appPath =
    'apps/desktop/src-tauri/src/bootstrap/app.rs'
  const cargoPath = 'apps/desktop/src-tauri/Cargo.toml'

  const app = await read(appPath)
  const cargo =
    stagedFiles.get(cargoPath) ?? (await read(cargoPath))

  const plugins = [
    {
      cargo: 'tauri-plugin-store',
      rust: 'tauri_plugin_store',
    },
    {
      cargo: 'tauri-plugin-dialog',
      rust: 'tauri_plugin_dialog',
    },
    {
      cargo: 'tauri-plugin-fs',
      rust: 'tauri_plugin_fs',
    },
    {
      cargo: 'tauri-plugin-opener',
      rust: 'tauri_plugin_opener',
    },
    {
      cargo: 'tauri-plugin-clipboard-manager',
      rust: 'tauri_plugin_clipboard_manager',
    },
    {
      cargo: 'tauri-plugin-shell',
      rust: 'tauri_plugin_shell',
    },
    {
      cargo: 'tauri-plugin-process',
      rust: 'tauri_plugin_process',
    },
    {
      cargo: 'tauri-plugin-global-shortcut',
      rust: 'tauri_plugin_global_shortcut',
    },
    {
      cargo: 'tauri-plugin-notification',
      rust: 'tauri_plugin_notification',
    },
    {
      cargo: 'tauri-plugin-window-state',
      rust: 'tauri_plugin_window_state',
    },
    {
      cargo: 'tauri-plugin-updater',
      rust: 'tauri_plugin_updater',
    },
    {
      cargo: 'tauri-plugin-os',
      rust: 'tauri_plugin_os',
    },
    {
      cargo: 'tauri-plugin-log',
      rust: 'tauri_plugin_log',
    },
  ]

  report.push('## Tauri 插件注册一致性')
  report.push('')
  report.push('| 插件 | Cargo 声明 | bootstrap 引用 | 结论 |')
  report.push('|---|---:|---:|---|')

  for (const plugin of plugins) {
    const declared = new RegExp(
      `^[ \\t]*${escapeRegex(plugin.cargo)}(?:\\.workspace)?[ \\t]*=`,
      'm',
    ).test(cargo)

    const referenced = new RegExp(
      `\\b${escapeRegex(plugin.rust)}\\b`,
    ).test(app)

    let conclusion = '一致'

    if (declared && !referenced) {
      conclusion =
        '未在 bootstrap 引用；确认是否由其他命令直接使用'
    } else if (!declared && referenced) {
      conclusion = '错误：源码引用但 Cargo 未声明'
    } else if (!declared && !referenced) {
      conclusion = '未使用'
    }

    report.push(
      `| \`${plugin.cargo}\` | ${declared ? '是' : '否'} | ${
        referenced ? '是' : '否'
      } | ${conclusion} |`,
    )
  }

  report.push('')
}

async function inspectSettingsContract() {
  const rustPath =
    'apps/desktop/src-tauri/src/commands/settings.rs'
  const rust = await read(rustPath)

  const tsFiles = await collectFiles(
    absolutePath('features/settings/src'),
    (path) =>
      ['.ts', '.tsx'].includes(extname(path)),
  )

  const tsDocuments = []

  for (const path of tsFiles) {
    tsDocuments.push({
      path: repositoryPath(path),
      content: await readFile(path, 'utf8'),
    })
  }

  const rustFields = [
    'theme',
    'language',
    'auto_save',
    'auto_save_interval',
    'shortcuts',
    'canvas',
    'editor',
    'export',
    'privacy',
  ]

  const expectedTsNames = new Map([
    ['theme', 'theme'],
    ['language', 'language'],
    ['auto_save', 'autoSave'],
    ['auto_save_interval', 'autoSaveInterval'],
    ['shortcuts', 'shortcuts'],
    ['canvas', 'canvas'],
    ['editor', 'editor'],
    ['export', 'export'],
    ['privacy', 'privacy'],
  ])

  report.push('## Settings IPC 契约')
  report.push('')
  report.push(
    '| Rust 字段 | TypeScript 预期字段 | Rust 存在 | TS 出现位置 |',
  )
  report.push('|---|---|---:|---|')

  for (const rustField of rustFields) {
    const tsField = expectedTsNames.get(rustField)
    const rustExists = new RegExp(
      `\\bpub\\s+${escapeRegex(rustField)}\\s*:`,
    ).test(rust)

    const tsReferences = findReferences(tsDocuments, [
      new RegExp(`\\b${escapeRegex(tsField)}\\b`, 'g'),
    ])

    report.push(
      `| \`${rustField}\` | \`${tsField}\` | ${
        rustExists ? '是' : '否'
      } | ${
        tsReferences.length > 0
          ? tsReferences
              .map((path) => `\`${path}\``)
              .join('<br>')
          : '未发现'
      } |`,
    )
  }

  report.push('')
  report.push(
    '> 此检查只能发现明显字段漂移。最终传输契约仍应以 Specta 生成文件为唯一来源。',
  )
  report.push('')
}

async function createDependencyReport() {
  const relativePath =
    'docs/generated/dependency-cleanup-report.md'

  const header = [
    '# Dependency cleanup report',
    '',
    `生成时间：${new Date().toISOString()}`,
    '',
    `执行模式：${apply ? 'apply' : 'analysis'}`,
    '',
    '本报告只分析直接依赖和显式源码引用，不根据依赖名称推断传递依赖是否可删除。',
    '',
  ]

  stage(
    relativePath,
    `${[...header, ...report].join('\n')}\n`,
    '生成依赖和契约清理报告',
  )
}

async function validateStagedChanges() {
  const desktopPackagePath = 'apps/desktop/package.json'
  const desktopCargoPath =
    'apps/desktop/src-tauri/Cargo.toml'

  const packageJson = JSON.parse(
    stagedFiles.get(desktopPackagePath) ??
      (await read(desktopPackagePath)),
  )

  if (!packageJson.dependencies.react) {
    throw new Error(
      '最终验证失败：desktop package 丢失 React 依赖。',
    )
  }

  if (!packageJson.dependencies['react-dom']) {
    throw new Error(
      '最终验证失败：desktop package 丢失 React DOM 依赖。',
    )
  }

  if (!packageJson.dependencies['@hybrid-canvas/canvas']) {
    throw new Error(
      '最终验证失败：desktop package 丢失 canvas 核心依赖。',
    )
  }

  const cargo =
    stagedFiles.get(desktopCargoPath) ??
    (await read(desktopCargoPath))

  const requiredCargoDependencies = [
    'tauri.workspace = true',
    'serde.workspace = true',
    'serde_json.workspace = true',
    'thiserror.workspace = true',
    'tauri-plugin-log.workspace = true',
    'tauri-plugin-store.workspace = true',
    'tauri-plugin-dialog.workspace = true',
  ]

  for (const dependency of requiredCargoDependencies) {
    if (!cargo.includes(dependency)) {
      throw new Error(
        `最终验证失败：Tauri Cargo.toml 缺少 ${dependency}`,
      )
    }
  }
}

async function writeChanges() {
  const changedPaths = [
    ...new Set(changes.map(({ relativePath }) => relativePath)),
  ]

  console.log(
    `${apply ? '准备应用' : '分析完成'}：涉及 ${
      changedPaths.length
    } 个文件。`,
  )

  for (const change of changes) {
    console.log(
      `- ${change.relativePath}: ${change.description}`,
    )
  }

  if (!apply) {
    console.log('')
    console.log('当前为分析模式，没有写入文件。')
    console.log('确认后执行：')
    console.log(
      '  node tooling\\script\\apply-engineering-review-phase5.mjs --apply',
    )
    return
  }

  for (const relativePath of changedPaths) {
    await mkdir(dirname(absolutePath(relativePath)), {
      recursive: true,
    })

    await writeFile(
      absolutePath(relativePath),
      stagedFiles.get(relativePath),
      'utf8',
    )
  }

  console.log('')
  console.log('第五阶段修改完成。请执行：')
  console.log('  pnpm install --lockfile-only')
  console.log('  cargo metadata --no-deps')
  console.log('  pnpm format')
  console.log('  cargo fmt --all')
  console.log('  pnpm typecheck')
  console.log('  pnpm test:architecture')
  console.log(
    '  cargo check --workspace --all-targets --all-features',
  )
  console.log(
    '  cargo clippy --workspace --all-targets --all-features -- -D warnings',
  )
  console.log('  cargo test --workspace --all-features')
  console.log('  pnpm verify:release')
}

async function main() {
  await assertRepository()
  await inspectDesktopNpmDependencies()
  await inspectDesktopRustDependencies()
  await inspectPluginInitialization()
  await inspectSettingsContract()
  await createDependencyReport()
  await validateStagedChanges()
  await writeChanges()
}

main().catch((error) => {
  console.error('')
  console.error(
    '第五阶段依赖清理失败；现有文件尚未修改。',
  )
  console.error(
    error instanceof Error ? error.stack : String(error),
  )
  process.exitCode = 1
})