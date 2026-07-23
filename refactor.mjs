#!/usr/bin/env node
/**
 * P1 — Settings IPC 收敛到 generated bindings（修正版）
 *
 * 根因修复：
 * tauri-specta 不能把 async fn 的内部 crate::error::Error 作为生成式 IPC
 * Result 错误类型。Settings command 必须和 document command 一样，公开返回：
 *
 *   Result<T, IpcError>
 *
 * 而不是：
 *
 *   Result<T, Error>
 *
 * 用法：
 *   node refactor.mjs --check
 *   node refactor.mjs --apply
 *   node refactor.mjs --apply D:\xiaojianc\hybrid-canvas
 */

import { access, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const rootArgument = argv.find((argument) => !argument.startsWith('--'))
const root = resolve(rootArgument ?? process.cwd())

const paths = {
  packageJson: join(root, 'package.json'),
  settingsRust: join(
    root,
    'apps/desktop/src-tauri/src/commands/settings.rs',
  ),
  exporterRust: join(
    root,
    'apps/desktop/src-tauri/src/ipc/export_bindings.rs',
  ),
  settingsAdapter: join(
    root,
    'platforms/desktop-runtime/src/adapters/settings/settings-store.ts',
  ),
  bindings: join(
    root,
    'platforms/desktop-ipc/src/generated/ipc-bindings.ts',
  ),
}

function fail(message) {
  console.error(`\nSettings IPC migration failed:\n${message}\n`)
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
    throw new Error(`No source change was produced: ${description}`)
  }

  return next
}

function assertGenerated(source, pattern, description) {
  if (!pattern.test(source)) {
    throw new Error(
      [
        `Generated IPC binding does not contain ${description}.`,
        'Do not hand-edit generated bindings; inspect the Rust export contract.',
      ].join('\n'),
    )
  }
}

function runCargoGenerateIpc() {
  const result = spawnSync(
    'cargo',
    [
      'run',
      '-p',
      'hybrid-canvas-desktop',
      '--bin',
      'export-ipc-bindings',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      shell: false,
      stdio: 'pipe',
    },
  )

  if (result.error) {
    throw new Error(
      [
        'Unable to start cargo.',
        result.error.message,
      ].join('\n'),
    )
  }

  if (result.status !== 0) {
    throw new Error(
      [
        'IPC generation command failed.',
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }
}

function settingsAdapterSource() {
  return `import {
  commands,
  type AppSettings as AppSettingsDto,
} from '@hybrid-canvas/desktop-ipc/generated/ipc-bindings'
import type { AppSettings, SettingsStore, ThemeMode } from '@hybrid-canvas/settings'

export function createDesktopSettingsStore(): SettingsStore {
  return {
    async load() {
      const dto = await commands.settingsGet()

      return fromDto(dto)
    },

    async save(settings) {
      await commands.settingsSet(toDto(settings))
    },

    async reset() {
      const dto = await commands.settingsReset()

      return fromDto(dto)
    },
  }
}

function fromDto(dto: AppSettingsDto): AppSettings {
  return {
    theme: parseTheme(dto.theme),
    language: dto.language,
    autoSave: dto.auto_save,
    autoSaveIntervalMs: dto.auto_save_interval,
    shortcuts: dto.shortcuts,
    canvas: {
      defaultZoom: dto.canvas.default_zoom,
      showGrid: dto.canvas.show_grid,
      snapToGrid: dto.canvas.snap_to_grid,
      gridSize: dto.canvas.grid_size,
      showRulers: dto.canvas.show_rulers,
      infiniteCanvas: dto.canvas.infinite_canvas,
    },
    editor: {
      fontFamily: dto.editor.font_family,
      fontSize: dto.editor.font_size,
      lineHeight: dto.editor.line_height,
      tabSize: dto.editor.tab_size,
      insertSpaces: dto.editor.insert_spaces,
      wordWrap: dto.editor.word_wrap,
      minimap: dto.editor.minimap,
    },
    export: {
      defaultFormat: dto.export.default_format,
      pngDpi: dto.export.png_dpi,
      pdfQuality: dto.export.pdf_quality,
      includeMetadata: dto.export.include_metadata,
    },
    privacy: {
      telemetry: dto.privacy.telemetry,
      crashReporting: dto.privacy.crash_reporting,
      updateCheck: dto.privacy.update_check,
    },
  }
}

function toDto(settings: AppSettings): AppSettingsDto {
  return {
    theme: settings.theme,
    language: settings.language,
    auto_save: settings.autoSave,
    auto_save_interval: settings.autoSaveIntervalMs,
    shortcuts: { ...settings.shortcuts },
    canvas: {
      default_zoom: settings.canvas.defaultZoom,
      show_grid: settings.canvas.showGrid,
      snap_to_grid: settings.canvas.snapToGrid,
      grid_size: settings.canvas.gridSize,
      show_rulers: settings.canvas.showRulers,
      infinite_canvas: settings.canvas.infiniteCanvas,
    },
    editor: {
      font_family: settings.editor.fontFamily,
      font_size: settings.editor.fontSize,
      line_height: settings.editor.lineHeight,
      tab_size: settings.editor.tabSize,
      insert_spaces: settings.editor.insertSpaces,
      word_wrap: settings.editor.wordWrap,
      minimap: settings.editor.minimap,
    },
    export: {
      default_format: settings.export.defaultFormat,
      png_dpi: settings.export.pngDpi,
      pdf_quality: settings.export.pdfQuality,
      include_metadata: settings.export.includeMetadata,
    },
    privacy: {
      telemetry: settings.privacy.telemetry,
      crash_reporting: settings.privacy.crashReporting,
      update_check: settings.privacy.updateCheck,
    },
  }
}

function parseTheme(value: string): ThemeMode {
  switch (value) {
    case 'light':
    case 'dark':
    case 'system':
      return value
    default:
      return 'system'
  }
}
`
}

function migrateSettingsRust(source) {
  let next = source

  next = replaceExactly(
    next,
    `use crate::error::{Error, Result};`,
    `use crate::error::{Error, IpcError, Result};`,
    'import IpcError',
  )

  next = replaceExactly(
    next,
    `use tauri_plugin_store::StoreExt;

`,
    `use tauri_plugin_store::StoreExt;

type SettingsCommandResult<T> = std::result::Result<T, IpcError>;

`,
    'declare SettingsCommandResult',
  )

  const oldGet = `#[command]
pub async fn settings_get(app: AppHandle) -> Result<AppSettings> {
    let store = app.store("settings.json")?;

    match store.get("settings") {
        None => Ok(AppSettings::default()),
        Some(value) => serde_json::from_value(value)
            .map_err(|error| Error::Validation(format!("invalid settings: {error}"))),
    }
}`

  const newGet = `#[command]
#[specta::specta]
pub async fn settings_get(
    app: AppHandle,
) -> SettingsCommandResult<AppSettings> {
    (|| -> Result<AppSettings> {
        let store = app.store("settings.json")?;

        match store.get("settings") {
            None => Ok(AppSettings::default()),
            Some(value) => serde_json::from_value(value)
                .map_err(|error| Error::Validation(format!("invalid settings: {error}"))),
        }
    })()
    .map_err(IpcError::from)
}`

  next = replaceExactly(
    next,
    oldGet,
    newGet,
    'convert settings_get to generated IPC result',
  )

  const oldSet = `#[command]
pub async fn settings_set(app: AppHandle, settings: AppSettings) -> Result<()> {
    let store = app.store("settings.json")?;
    store.set("settings", serde_json::to_value(&settings)?);
    store.save()?;
    Ok(())
}`

  const newSet = `#[command]
#[specta::specta]
pub async fn settings_set(
    app: AppHandle,
    settings: AppSettings,
) -> SettingsCommandResult<()> {
    (|| -> Result<()> {
        let store = app.store("settings.json")?;
        store.set("settings", serde_json::to_value(&settings)?);
        store.save()?;
        Ok(())
    })()
    .map_err(IpcError::from)
}`

  next = replaceExactly(
    next,
    oldSet,
    newSet,
    'convert settings_set to generated IPC result',
  )

  const oldReset = `#[command]
pub async fn settings_reset(app: AppHandle) -> Result<AppSettings> {
    let defaults = AppSettings::default();
    let store = app.store("settings.json")?;
    store.set("settings", serde_json::to_value(&defaults)?);
    store.save()?;
    Ok(defaults)
}`

  const newReset = `#[command]
#[specta::specta]
pub async fn settings_reset(
    app: AppHandle,
) -> SettingsCommandResult<AppSettings> {
    (|| -> Result<AppSettings> {
        let defaults = AppSettings::default();
        let store = app.store("settings.json")?;
        store.set("settings", serde_json::to_value(&defaults)?);
        store.save()?;
        Ok(defaults)
    })()
    .map_err(IpcError::from)
}`

  return replaceExactly(
    next,
    oldReset,
    newReset,
    'convert settings_reset to generated IPC result',
  )
}

function migrateExporterRust(source) {
  let next = source

  const oldImports = `use crate::commands::document::{
    DocumentCloseRequest, DocumentDescriptor, DocumentId, DocumentOpenResponse,
    DocumentOpenResult, DocumentSaveAsRequest, DocumentSaveAsResult,
    DocumentSaveRequest,
};`

  const newImports = `use crate::commands::{
    document::{
        DocumentCloseRequest, DocumentDescriptor, DocumentId, DocumentOpenResponse,
        DocumentOpenResult, DocumentSaveAsRequest, DocumentSaveAsResult,
        DocumentSaveRequest,
    },
    settings::{
        AppSettings, CanvasSettings, EditorSettings, ExportSettings, PrivacySettings,
    },
};`

  next = replaceExactly(
    next,
    oldImports,
    newImports,
    'import settings DTOs into IPC exporter',
  )

  next = replaceExactly(
    next,
    `            crate::commands::document::document_save,
            crate::commands::document::document_close,
        ])`,
    `            crate::commands::document::document_save,
            crate::commands::document::document_close,
            crate::commands::settings::settings_get,
            crate::commands::settings::settings_set,
            crate::commands::settings::settings_reset,
        ])`,
    'export settings commands',
  )

  return replaceExactly(
    next,
    `        .typ::<DocumentSaveAsResult>()
        .typ::<DocumentCloseRequest>()`,
    `        .typ::<DocumentSaveAsResult>()
        .typ::<DocumentCloseRequest>()
        .typ::<AppSettings>()
        .typ::<CanvasSettings>()
        .typ::<EditorSettings>()
        .typ::<ExportSettings>()
        .typ::<PrivacySettings>()`,
    'export settings DTOs',
  )
}

async function main() {
  if (!(await exists(paths.packageJson))) {
    fail(
      [
        `Repository root was not found: ${root}`,
        'Run in the repository root or pass the repository path as an argument.',
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

  const [settingsRust, exporterRust, settingsAdapter] = await Promise.all([
    readFile(paths.settingsRust, 'utf8'),
    readFile(paths.exporterRust, 'utf8'),
    readFile(paths.settingsAdapter, 'utf8'),
  ])

  if (
    settingsAdapter.includes(
      "from '@hybrid-canvas/desktop-ipc/generated/ipc-bindings'",
    )
  ) {
    console.log('Settings adapter already uses generated IPC bindings.')
    return
  }

  let nextSettingsRust
  let nextExporterRust

  try {
    nextSettingsRust = migrateSettingsRust(settingsRust)
    nextExporterRust = migrateExporterRust(exporterRust)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
    return
  }

  console.log('Settings IPC v2 migration plan is valid:')
  console.log('- Settings commands will expose Result<T, IpcError>.')
  console.log('- tauri-specta can export the async command contract.')
  console.log('- Desktop runtime will consume generated Settings DTOs.')
  console.log('- Generic invoke("settings_*") calls will be removed.')

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to write changes.')
    return
  }

  try {
    await writeFile(paths.settingsRust, nextSettingsRust, 'utf8')
    await writeFile(paths.exporterRust, nextExporterRust, 'utf8')

    try {
      runCargoGenerateIpc()
    } catch (error) {
      await Promise.all([
        writeFile(paths.settingsRust, settingsRust, 'utf8'),
        writeFile(paths.exporterRust, exporterRust, 'utf8'),
      ])

      throw new Error(
        [
          'IPC generation failed. Rust files were restored automatically.',
          error instanceof Error ? error.message : String(error),
        ].join('\n'),
      )
    }

    const bindings = await readFile(paths.bindings, 'utf8')

    assertGenerated(
      bindings,
      /async\s+settingsGet\s*\(\)\s*:\s*Promise<AppSettings>/,
      'commands.settingsGet(): Promise<AppSettings>',
    )

    assertGenerated(
      bindings,
      /async\s+settingsSet\s*\(\s*settings\s*:\s*AppSettings\s*\)/,
      'commands.settingsSet(settings: AppSettings)',
    )

    assertGenerated(
      bindings,
      /async\s+settingsReset\s*\(\)\s*:\s*Promise<AppSettings>/,
      'commands.settingsReset(): Promise<AppSettings>',
    )

    await writeFile(
      paths.settingsAdapter,
      settingsAdapterSource(),
      'utf8',
    )
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
    return
  }

  console.log('\nApplied Settings IPC v2 migration.')
  console.log('\nRun these commands next:')
  console.log('  cargo fmt --check')
  console.log('  cargo test --workspace --all-features')
  console.log('  cargo clippy --workspace --all-targets --all-features -- -D warnings')
  console.log('  pnpm check:ipc')
  console.log('  pnpm typecheck')
  console.log('  pnpm lint')
  console.log('  pnpm test:architecture')
  console.log('  pnpm test')
}

await main()