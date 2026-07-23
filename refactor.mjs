#!/usr/bin/env node
/**
 * P1 — 删除未实现、未注册或永远拒绝的 Desktop Runtime 假能力（v2）。
 *
 * 与 v1 的差异：
 * - opener.rs 不是消费者，而是一个未注册且永远 PermissionDenied 的死 command；
 * - 本脚本会同时删除 opener.rs，并从 commands/mod.rs 移除 pub mod opener;
 *
 * 删除的假能力：
 * - createDesktopAssetStore / asset_*
 * - createDesktopPluginVerifier / plugin_verify
 * - createClipboard / clipboard_*
 * - createExternalOpener / opener_*
 *
 * 用法：
 *   node fix-p1-remove-fake-runtime-capabilities-v2.mjs --check
 *   node fix-p1-remove-fake-runtime-capabilities-v2.mjs --apply
 *   node fix-p1-remove-fake-runtime-capabilities-v2.mjs --apply D:\xiaojianc\hybrid-canvas
 */

import {
  access,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const rootArgument = argv.find((argument) => !argument.startsWith('--'))
const root = resolve(rootArgument ?? process.cwd())

const paths = {
  packageJson: join(root, 'package.json'),

  runtimePackageJson: join(
    root,
    'platforms/desktop-runtime/package.json',
  ),
  runtimePublicApi: join(
    root,
    'platforms/desktop-runtime/src/public-api.ts',
  ),
  assetAdapter: join(
    root,
    'platforms/desktop-runtime/src/adapters/asset/asset-store.ts',
  ),
  clipboardAdapter: join(
    root,
    'platforms/desktop-runtime/src/adapters/clipboard/clipboard.ts',
  ),
  openerAdapter: join(
    root,
    'platforms/desktop-runtime/src/adapters/opener/external-opener.ts',
  ),
  pluginAdapter: join(
    root,
    'platforms/desktop-runtime/src/adapters/plugin/plugin-verifier.ts',
  ),

  cargoToml: join(root, 'apps/desktop/src-tauri/Cargo.toml'),
  appBootstrap: join(
    root,
    'apps/desktop/src-tauri/src/bootstrap/app.rs',
  ),
  capability: join(
    root,
    'apps/desktop/src-tauri/capabilities/main-window.json',
  ),
  commandsModule: join(
    root,
    'apps/desktop/src-tauri/src/commands/mod.rs',
  ),
  openerCommand: join(
    root,
    'apps/desktop/src-tauri/src/commands/opener.rs',
  ),
}

const ignoredDefinitionFiles = new Set([
  relative(root, paths.runtimePublicApi).replaceAll('\\', '/'),
  relative(root, paths.assetAdapter).replaceAll('\\', '/'),
  relative(root, paths.clipboardAdapter).replaceAll('\\', '/'),
  relative(root, paths.openerAdapter).replaceAll('\\', '/'),
  relative(root, paths.pluginAdapter).replaceAll('\\', '/'),
  relative(root, paths.openerCommand).replaceAll('\\', '/'),
])

const forbiddenReferences = [
  'createDesktopAssetStore',
  'createDesktopPluginVerifier',
  'createClipboard',
  'createExternalOpener',
  'ExternalOpener',

  'asset_store',
  'asset_load',
  'asset_delete',
  'asset_list',

  'plugin_verify',

  'clipboard_read_text',
  'clipboard_write_text',

  'opener_open_external',
  'opener_show_in_folder',
]

function fail(message) {
  console.error(`\nFake runtime capability removal failed:\n${message}\n`)
  process.exitCode = 1
}

async function exists(path) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function replaceExactly(source, oldText, newText, description) {
  if (!source.includes(oldText)) {
    throw new Error(
      [
        `Expected source fragment was not found: ${description}`,
        'Refusing fuzzy replacement.',
      ].join('\n'),
    )
  }

  const next = source.replace(oldText, newText)

  if (next === source) {
    throw new Error(`Replacement made no change: ${description}`)
  }

  return next
}

async function listRepositorySourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    if (
      entry.name === '.git' ||
      entry.name === 'node_modules' ||
      entry.name === 'target' ||
      entry.name === 'dist' ||
      entry.name === 'coverage'
    ) {
      continue
    }

    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await listRepositorySourceFiles(path)))
      continue
    }

    if (
      entry.isFile() &&
      /\.(?:ts|tsx|mts|cts|rs|json)$/u.test(entry.name)
    ) {
      files.push(path)
    }
  }

  return files
}

async function assertNoActualConsumers() {
  const files = await listRepositorySourceFiles(root)
  const matches = []

  for (const path of files) {
    const repositoryPath = relative(root, path).replaceAll('\\', '/')

    // Ignore the public exports, adapters being deleted, and dead native
    // command declarations. They define the false surface, not consumers.
    if (ignoredDefinitionFiles.has(repositoryPath)) {
      continue
    }

    const content = await readFile(path, 'utf8')

    for (const symbol of forbiddenReferences) {
      if (content.includes(symbol)) {
        matches.push(`${repositoryPath}: ${symbol}`)
      }
    }
  }

  if (matches.length > 0) {
    throw new Error(
      [
        'Refusing to delete a capability with real remaining consumers:',
        ...matches.map((match) => `- ${match}`),
        '',
        'Migrate or remove every consumer first. Do not bypass this check.',
      ].join('\n'),
    )
  }
}

async function main() {
  if (!(await exists(paths.packageJson))) {
    fail(
      [
        `Repository root was not found: ${root}`,
        'Run in the Hybrid Canvas repository root or pass that path explicitly.',
      ].join('\n'),
    )
    return
  }

  for (const [name, path] of Object.entries(paths)) {
    if (name === 'packageJson') {
      continue
    }

    if (!(await exists(path))) {
      fail(`Required path does not exist: ${path}`)
      return
    }
  }

  try {
    await assertNoActualConsumers()

    const [
      runtimePackageJson,
      runtimePublicApi,
      cargoToml,
      appBootstrap,
      capability,
      commandsModule,
    ] = await Promise.all([
      readFile(paths.runtimePackageJson, 'utf8'),
      readFile(paths.runtimePublicApi, 'utf8'),
      readFile(paths.cargoToml, 'utf8'),
      readFile(paths.appBootstrap, 'utf8'),
      readFile(paths.capability, 'utf8'),
      readFile(paths.commandsModule, 'utf8'),
    ])

    const nextRuntimePackageJson = replaceExactly(
      replaceExactly(
        runtimePackageJson,
        `    "@hybrid-canvas/asset": "workspace:*",\n`,
        '',
        'remove unused asset dependency',
      ),
      `    "@hybrid-canvas/plugin": "workspace:*",\n`,
      '',
      'remove unused plugin dependency',
    )

    let nextRuntimePublicApi = runtimePublicApi

    for (const fragment of [
      `export { createDesktopAssetStore } from './adapters/asset/asset-store'\n\n`,
      `export { createClipboard } from './adapters/clipboard/clipboard'\n\n`,
      `export type { ExternalOpener } from './adapters/opener/external-opener'\nexport { createExternalOpener } from './adapters/opener/external-opener'\n\n`,
      `export { createDesktopPluginVerifier } from './adapters/plugin/plugin-verifier'\n\n`,
    ]) {
      nextRuntimePublicApi = replaceExactly(
        nextRuntimePublicApi,
        fragment,
        '',
        `remove false public export: ${fragment.trim()}`,
      )
    }

    const nextCargoToml = replaceExactly(
      cargoToml,
      `tauri-plugin-clipboard-manager.workspace = true\n`,
      '',
      'remove unused clipboard plugin dependency',
    )

    const nextAppBootstrap = replaceExactly(
      appBootstrap,
      `        .plugin(tauri_plugin_clipboard_manager::init())\n`,
      '',
      'remove unused clipboard plugin initialization',
    )

    const nextCapability = replaceExactly(
      capability,
      `    "clipboard-manager:default",\n`,
      '',
      'remove unused clipboard capability',
    )

    const nextCommandsModule = replaceExactly(
      commandsModule,
      `pub mod opener;\n`,
      '',
      'remove unregistered opener command module',
    )

    if (!apply) {
      console.log('Safe to remove unimplemented desktop runtime capabilities:')
      console.log('- Asset store adapter and package dependency')
      console.log('- Plugin verifier adapter and package dependency')
      console.log('- Clipboard adapter, plugin initialization, dependency, capability')
      console.log('- External opener adapter and dead native opener command module')
      console.log('')
      console.log('No actual consumers were found.')
      console.log('Run again with --apply to make the changes.')
      return
    }

    await Promise.all([
      writeFile(paths.runtimePackageJson, nextRuntimePackageJson, 'utf8'),
      writeFile(paths.runtimePublicApi, nextRuntimePublicApi, 'utf8'),
      writeFile(paths.cargoToml, nextCargoToml, 'utf8'),
      writeFile(paths.appBootstrap, nextAppBootstrap, 'utf8'),
      writeFile(paths.capability, nextCapability, 'utf8'),
      writeFile(paths.commandsModule, nextCommandsModule, 'utf8'),
    ])

    await Promise.all([
      rm(paths.assetAdapter),
      rm(paths.clipboardAdapter),
      rm(paths.openerAdapter),
      rm(paths.pluginAdapter),
      rm(paths.openerCommand),
    ])

    console.log('Removed false desktop runtime capability surface.')
    console.log('')
    console.log('Required verification:')
    console.log('  pnpm install --lockfile-only')
    console.log('  pnpm typecheck')
    console.log('  pnpm lint')
    console.log('  pnpm test:architecture')
    console.log('  pnpm test')
    console.log('  cargo fmt --check')
    console.log('  cargo check --workspace --all-targets')
    console.log('  cargo test --workspace --all-features')
    console.log('  cargo clippy --workspace --all-targets --all-features -- -D warnings')
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}

await main()