#!/usr/bin/env node

import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()

const PATHS = Object.freeze({
  package: 'package.json',

  diagnostics:
    'apps/desktop/src-tauri/src/diagnostics/mod.rs',

  diagnosticsCommand:
    'apps/desktop/src-tauri/src/commands/diagnostics.rs',

  commandModules:
    'apps/desktop/src-tauri/src/commands/mod.rs',

  rustLib:
    'apps/desktop/src-tauri/src/lib.rs',

  rustApp:
    'apps/desktop/src-tauri/src/bootstrap/app.rs',

  bindingExporter:
    'apps/desktop/src-tauri/src/ipc/export_bindings.rs',

  desktopIpcPublicApi:
    'platforms/desktop-ipc/src/public-api.ts',

  nativeCrashAdapter:
    'platforms/desktop-runtime/src/adapters/native-crash-report.ts',

  desktopRuntimePublicApi:
    'platforms/desktop-runtime/src/public-api.ts',

  main:
    'apps/desktop/src/main.tsx',

  fatalIncident:
    'apps/desktop/src/fatal/fatal-incident.ts',

  architectureCheck:
    'tests/architecture/check-native-crash-recovery.mjs',
})

async function main() {
  await assertRepository()

  await createRustDiagnostics()
  await createDiagnosticsCommand()
  await registerRustModules()
  await registerNativeStartupHook()
  await registerGeneratedIpc()
  await exposeGeneratedIpc()
  await createNativeCrashAdapter()
  await exportNativeCrashAdapter()
  await extendFatalIncidentKind()
  await replaceRendererBootstrap()
  await createArchitectureCheck()
  await registerArchitectureCheck()

  console.log('')
  console.log(
    'Native crash recovery refactor applied.',
  )
  console.log('')
  console.log('Run in this exact order:')
  console.log('  pnpm generate:ipc')
  console.log('  pnpm format')
  console.log('  cargo fmt')
  console.log('  pnpm typecheck')
  console.log('  pnpm test:architecture')
  console.log('  cargo check --workspace --all-targets --all-features')
  console.log('  cargo test --workspace --all-features')
  console.log('')
  console.log(
    'The generated IPC file must be committed with the Rust DTO changes.',
  )
}

async function assertRepository() {
  const source = await readFile(
    resolvePath(PATHS.package),
    'utf8',
  )

  const packageJson = JSON.parse(source)

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error(
      'Run this script from the Hybrid Canvas repository root.',
    )
  }
}

async function createRustDiagnostics() {
  await writeText(
    PATHS.diagnostics,
    String.raw`
use std::{
    backtrace::Backtrace,
    fs::{self, File},
    io::Write,
    panic::PanicHookInfo,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

use crate::Result;

const CRASH_REPORT_FILE_NAME: &str = "last-native-crash.json";
const CRASH_REPORT_TEMP_FILE_NAME: &str = "last-native-crash.tmp";
const MAX_MESSAGE_LENGTH: usize = 8_192;
const MAX_BACKTRACE_LENGTH: usize = 64_000;
const MAX_LOCATION_LENGTH: usize = 4_096;

#[derive(Clone, Debug, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NativeCrashReport {
    pub incident_id: String,
    pub occurred_at: String,
    pub process: String,
    pub thread: String,
    pub message: String,
    pub location: Option<String>,
    pub backtrace: String,
    pub app_version: String,
    pub target_os: String,
    pub target_arch: String,
}

/// Installs the process-level panic recorder.
///
/// A Rust panic can terminate the native process before the WebView is able to
/// render anything. The panic hook therefore writes a local crash report that
/// is consumed on the next launch.
pub fn install(app: &AppHandle) -> Result<()> {
    let report_directory = app.path().app_log_dir()?;
    fs::create_dir_all(&report_directory)?;

    let app_version = app.package_info().version.to_string();
    let previous_hook = std::panic::take_hook();

    std::panic::set_hook(Box::new(move |panic_info| {
        let report = create_report(panic_info, &app_version);

        if let Err(error) = write_report_atomically(&report_directory, &report) {
            eprintln!(
                "[Hybrid Canvas] failed to persist native crash report: {error}"
            );
        }

        previous_hook(panic_info);
    }));

    Ok(())
}

/// Reads and consumes the previous crash report.
///
/// Reports are removed after a successful read so reloading the renderer does
/// not display the same historical crash indefinitely.
pub fn take_previous_crash_report(
    app: &AppHandle,
) -> Result<Option<NativeCrashReport>> {
    let report_path = crash_report_path(app)?;

    if !report_path.exists() {
        return Ok(None);
    }

    let source = match fs::read_to_string(&report_path) {
        Ok(source) => source,
        Err(error) => {
            log::error!(
                "failed to read native crash report: {}",
                error
            );

            let _ = fs::remove_file(&report_path);
            return Ok(None);
        }
    };

    let report = match serde_json::from_str::<NativeCrashReport>(&source) {
        Ok(report) => report,
        Err(error) => {
            log::error!(
                "invalid native crash report was discarded: {}",
                error
            );

            let _ = fs::remove_file(&report_path);
            return Ok(None);
        }
    };

    fs::remove_file(&report_path)?;

    Ok(Some(report))
}

fn create_report(
    panic_info: &PanicHookInfo<'_>,
    app_version: &str,
) -> NativeCrashReport {
    let current_thread = std::thread::current();

    let thread_name = current_thread
        .name()
        .unwrap_or("unnamed")
        .to_owned();

    let message = panic_payload_message(panic_info);

    let location = panic_info.location().map(|location| {
        truncate(
            format!(
                "{}:{}:{}",
                location.file(),
                location.line(),
                location.column()
            ),
            MAX_LOCATION_LENGTH,
        )
    });

    let backtrace = truncate(
        Backtrace::force_capture().to_string(),
        MAX_BACKTRACE_LENGTH,
    );

    NativeCrashReport {
        incident_id: format!("native-{}", Uuid::new_v4()),
        occurred_at: current_timestamp(),
        process: "hybrid-canvas-desktop".to_owned(),
        thread: truncate(thread_name, 256),
        message: truncate(message, MAX_MESSAGE_LENGTH),
        location,
        backtrace,
        app_version: app_version.to_owned(),
        target_os: std::env::consts::OS.to_owned(),
        target_arch: std::env::consts::ARCH.to_owned(),
    }
}

fn panic_payload_message(
    panic_info: &PanicHookInfo<'_>,
) -> String {
    if let Some(message) = panic_info.payload().downcast_ref::<&str>() {
        return (*message).to_owned();
    }

    if let Some(message) = panic_info.payload().downcast_ref::<String>() {
        return message.clone();
    }

    "Rust panic with a non-string payload".to_owned()
}

fn write_report_atomically(
    directory: &Path,
    report: &NativeCrashReport,
) -> std::io::Result<()> {
    fs::create_dir_all(directory)?;

    let target_path = directory.join(CRASH_REPORT_FILE_NAME);
    let temporary_path = directory.join(CRASH_REPORT_TEMP_FILE_NAME);

    let serialized = serde_json::to_vec_pretty(report)
        .map_err(std::io::Error::other)?;

    let mut file = File::create(&temporary_path)?;
    file.write_all(&serialized)?;
    file.sync_all()?;
    drop(file);

    if target_path.exists() {
        fs::remove_file(&target_path)?;
    }

    fs::rename(&temporary_path, &target_path)?;

    sync_directory(directory);

    Ok(())
}

fn sync_directory(directory: &Path) {
    #[cfg(unix)]
    {
        if let Ok(file) = File::open(directory) {
            let _ = file.sync_all();
        }
    }

    #[cfg(not(unix))]
    {
        let _ = directory;
    }
}

fn crash_report_path(
    app: &AppHandle,
) -> Result<PathBuf> {
    Ok(
        app.path()
            .app_log_dir()?
            .join(CRASH_REPORT_FILE_NAME),
    )
}

fn current_timestamp() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| {
            OffsetDateTime::now_utc()
                .unix_timestamp()
                .to_string()
        })
}

fn truncate(mut value: String, maximum_length: usize) -> String {
    if value.len() <= maximum_length {
        return value;
    }

    while !value.is_char_boundary(maximum_length.min(value.len())) {
        value.pop();
    }

    value.truncate(maximum_length);
    value.push_str("\n[Native diagnostic value truncated]");

    value
}

#[cfg(test)]
mod tests {
    use super::{truncate, MAX_MESSAGE_LENGTH};

    #[test]
    fn short_values_are_not_changed() {
        assert_eq!(truncate("panic".to_owned(), 32), "panic");
    }

    #[test]
    fn long_values_are_bounded() {
        let source = "a".repeat(MAX_MESSAGE_LENGTH + 100);
        let result = truncate(source, MAX_MESSAGE_LENGTH);

        assert!(result.len() < MAX_MESSAGE_LENGTH + 100);
        assert!(result.contains("truncated"));
    }

    #[test]
    fn unicode_truncation_preserves_utf8_boundaries() {
        let result = truncate("画布崩溃测试".to_owned(), 5);

        assert!(result.is_char_boundary(result.len()));
        assert!(result.contains("truncated"));
    }
}
`,
  )
}

async function createDiagnosticsCommand() {
  await writeText(
    PATHS.diagnosticsCommand,
    String.raw`
use tauri::AppHandle;

use crate::{
    diagnostics::{self, NativeCrashReport},
    Result,
};

/// Returns and consumes the previous native process crash report.
///
/// The renderer receives a bounded DTO, not an arbitrary filesystem path or
/// unrestricted native error object.
#[tauri::command]
#[specta::specta]
pub async fn diagnostics_take_previous_crash(
    app: AppHandle,
) -> Result<Option<NativeCrashReport>> {
    diagnostics::take_previous_crash_report(&app)
}
`,
  )
}

async function registerRustModules() {
  await transformFile(
    PATHS.commandModules,
    (source) => insertLineOnce(
      source,
      'pub mod diagnostics;',
      'pub mod document;',
    ),
  )

  await transformFile(
    PATHS.rustLib,
    (source) => insertLineOnce(
      source,
      'pub mod diagnostics;',
      'pub mod commands;',
    ),
  )
}

async function registerNativeStartupHook() {
  const replacement = String.raw`
use tauri::Wry;
use tauri_plugin_store::StoreExt;

use super::logging;
use crate::asset_protocol::{ASSET_PROTOCOL_SCHEME, AssetProtocolRegistry};
use crate::commands;
use crate::commands::document::DocumentRegistry;

pub fn build() -> tauri::Builder<Wry> {
    let asset_protocol = AssetProtocolRegistry::default();
    let protocol_registry = asset_protocol.clone();

    tauri::Builder::<Wry>::default()
        .manage(DocumentRegistry::default())
        .manage(asset_protocol)
        .register_uri_scheme_protocol(ASSET_PROTOCOL_SCHEME, move |_webview, request| {
            protocol_registry.response(&request)
        })
        .plugin(logging::plugin().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            app.store("settings.json")?;
            crate::diagnostics::install(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::asset::asset_session_open,
            commands::asset::asset_upload,
            commands::asset::asset_remove,
            commands::asset::asset_session_close,
            commands::diagnostics::diagnostics_take_previous_crash,
            commands::window::window_get,
            commands::window::window_list,
            commands::window::window_show,
            commands::window::window_focus,
            commands::window::window_close,
            commands::window::window_set_title,
            commands::window::window_save_state,
            commands::document::document_open,
            commands::document::document_save_as,
            commands::document::document_save,
            commands::document::document_close,
            commands::settings::settings_get,
            commands::settings::settings_set,
            commands::settings::settings_reset,
        ])
}
`

  await writeText(PATHS.rustApp, replacement)
}

async function registerGeneratedIpc() {
  await transformFile(
    PATHS.bindingExporter,
    (source) => {
      let next = source

      next = next.replace(
        /use crate::commands::\{\n/,
        [
          'use crate::{',
          '    commands::{',
        ].join('\n') + '\n',
      )

      if (!next.includes('diagnostics::diagnostics_take_previous_crash')) {
        next = next.replace(
          /(\s+settings::\{AppSettings, CanvasSettings, EditorSettings, ExportSettings, PrivacySettings\},\n)(\};)/,
          [
            '$1',
            '    },',
            '    diagnostics::NativeCrashReport,',
            '};',
          ].join('\n'),
        )
      }

      next = insertLineOnce(
        next,
        '            crate::commands::diagnostics::diagnostics_take_previous_crash,',
        '            crate::commands::document::document_open,',
      )

      next = insertLineOnce(
        next,
        '        .typ::<NativeCrashReport>()',
        '        .typ::<DocumentId>()',
      )

      return next
    },
  )
}

async function exposeGeneratedIpc() {
  await writeText(
    PATHS.desktopIpcPublicApi,
    String.raw`
export {
  type IpcError,
  IpcInvocationError,
  isIpcError,
} from './error'

export { invoke } from './invoke'

export {
  commands,
  type NativeCrashReport,
} from './generated/ipc-bindings'
`,
  )
}

async function createNativeCrashAdapter() {
  await writeText(
    PATHS.nativeCrashAdapter,
    String.raw`
import {
  commands,
  type NativeCrashReport,
} from '@hybrid-canvas/desktop-ipc'

export type { NativeCrashReport }

export async function takePreviousNativeCrashReport(): Promise<NativeCrashReport | null> {
  if (!isTauriRuntime()) {
    return null
  }

  return commands.diagnosticsTakePreviousCrash()
}

function isTauriRuntime(): boolean {
  return (
    typeof window !== 'undefined' &&
    '__TAURI_INTERNALS__' in window
  )
}
`,
  )
}

async function exportNativeCrashAdapter() {
  await transformFile(
    PATHS.desktopRuntimePublicApi,
    (source) => {
      if (
        source.includes(
          "from './adapters/native-crash-report'",
        )
      ) {
        return source
      }

      const addition = [
        '',
        'export {',
        '  type NativeCrashReport,',
        '  takePreviousNativeCrashReport,',
        "} from './adapters/native-crash-report'",
        '',
      ].join('\n')

      return source.trimEnd() + addition
    },
  )
}

async function extendFatalIncidentKind() {
  await transformFile(
    PATHS.fatalIncident,
    (source) => {
      if (source.includes("| 'native-crash'")) {
        return source
      }

      const marker = "  | 'webview'"

      if (!source.includes(marker)) {
        throw new Error(
          'Could not locate FatalIncidentKind.',
        )
      }

      return source.replace(
        marker,
        marker + "\n  | 'native-crash'",
      )
    },
  )
}

async function replaceRendererBootstrap() {
  await writeText(
    PATHS.main,
    String.raw`
import './app.css'

import {
  takePreviousNativeCrashReport,
  type NativeCrashReport,
} from '@hybrid-canvas/platforms-desktop-runtime'
import { installApplicationLifecycle } from './bootstrap/application-lifecycle'
import { mountReactApplication } from './bootstrap/react-root'
import { fatalIncidentController } from './fatal/fatal-controller'

void bootstrapApplication()

async function bootstrapApplication(): Promise<void> {
  const previousCrash =
    await readPreviousNativeCrashReport()

  if (previousCrash) {
    reportPreviousNativeCrash(previousCrash)
    return
  }

  const mounted = mountReactApplication(
    getApplicationRoot(),
  )

  installApplicationLifecycle(
    mounted.runtime,
    mounted,
  )
}

async function readPreviousNativeCrashReport(): Promise<NativeCrashReport | null> {
  try {
    return await takePreviousNativeCrashReport()
  } catch (error: unknown) {
    // Failure to inspect an old crash report must not prevent a healthy
    // application startup. The current failure remains visible in native logs.
    console.error(
      '[Hybrid Canvas] Failed to inspect previous native crash report',
      error,
    )

    return null
  }
}

function reportPreviousNativeCrash(
  report: NativeCrashReport,
): void {
  const error = new Error(report.message)

  error.name = 'NativeProcessCrash'
  error.stack = [
    report.message,
    '',
    'Native backtrace:',
    report.backtrace,
  ].join('\n')

  fatalIncidentController.report({
    error,
    kind: 'native-crash',
    phase: 'preflight',
    code: 'FATAL_PREVIOUS_NATIVE_PROCESS_CRASH',
    title: '应用上次运行时异常终止',
    source: report.location ?? undefined,
    recovery: 'reload',
    context: {
      nativeIncidentId: report.incidentId,
      nativeOccurredAt: report.occurredAt,
      nativeProcess: report.process,
      nativeThread: report.thread,
      appVersion: report.appVersion,
      targetOs: report.targetOs,
      targetArch: report.targetArch,
    },
  })
}

function getApplicationRoot(): HTMLElement {
  const root = document.getElementById('root')

  if (!root) {
    throw new Error(
      'Application root element "#root" was not found.',
    )
  }

  return root
}
`,
  )
}

async function createArchitectureCheck() {
  await writeText(
    PATHS.architectureCheck,
    String.raw`
#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
} from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const failures = []

const requiredFiles = [
  'apps/desktop/src-tauri/src/diagnostics/mod.rs',
  'apps/desktop/src-tauri/src/commands/diagnostics.rs',
  'platforms/desktop-runtime/src/adapters/native-crash-report.ts',
]

for (const relativePath of requiredFiles) {
  if (!existsSync(path.join(ROOT, relativePath))) {
    failures.push(
      'Missing native crash recovery file: ' +
        relativePath,
    )
  }
}

const app = read(
  'apps/desktop/src-tauri/src/bootstrap/app.rs',
)

const diagnostics = read(
  'apps/desktop/src-tauri/src/diagnostics/mod.rs',
)

const exporter = read(
  'apps/desktop/src-tauri/src/ipc/export_bindings.rs',
)

const renderer = read(
  'apps/desktop/src/main.tsx',
)

const fatalIncident = read(
  'apps/desktop/src/fatal/fatal-incident.ts',
)

requireText(
  app,
  'crate::diagnostics::install(app.handle())',
  'Native panic recorder is not installed during Tauri setup.',
)

requireText(
  app,
  'diagnostics_take_previous_crash',
  'Native crash IPC command is not registered.',
)

requireText(
  diagnostics,
  'std::panic::set_hook',
  'Native panic hook is missing.',
)

requireText(
  diagnostics,
  'write_report_atomically',
  'Native crash report is not written atomically.',
)

requireText(
  diagnostics,
  'file.sync_all()',
  'Native crash report is not flushed to disk.',
)

requireText(
  exporter,
  'diagnostics_take_previous_crash',
  'Native crash command is missing from generated IPC bindings.',
)

requireText(
  renderer,
  'takePreviousNativeCrashReport',
  'Renderer startup does not inspect the previous native crash.',
)

requireText(
  renderer,
  'FATAL_PREVIOUS_NATIVE_PROCESS_CRASH',
  'Previous native crashes are not mapped to the fatal controller.',
)

requireText(
  fatalIncident,
  "'native-crash'",
  'FatalIncidentKind does not include native-crash.',
)

if (failures.length > 0) {
  console.error(
    [
      'Native crash recovery architecture checks failed:',
      ...failures.map(
        (failure) => '- ' + failure,
      ),
    ].join('\n'),
  )

  process.exitCode = 1
} else {
  console.log(
    'Native crash recovery architecture checks passed.',
  )
}

function read(relativePath) {
  return readFileSync(
    path.join(ROOT, relativePath),
    'utf8',
  )
}

function requireText(
  source,
  expected,
  failure,
) {
  if (!source.includes(expected)) {
    failures.push(failure)
  }
}
`,
  )
}

async function registerArchitectureCheck() {
  await transformFile(
    PATHS.package,
    (source) => {
      const packageJson = JSON.parse(source)

      const command =
        'node tests/architecture/check-native-crash-recovery.mjs'

      const current =
        packageJson.scripts?.['test:architecture']

      if (typeof current !== 'string') {
        throw new Error(
          'package.json is missing test:architecture.',
        )
      }

      if (!current.includes(command)) {
        packageJson.scripts['test:architecture'] =
          current + ' && ' + command
      }

      return (
        JSON.stringify(packageJson, null, 2) +
        '\n'
      )
    },
  )
}

async function transformFile(
  relativePath,
  transform,
) {
  const absolutePath = resolvePath(relativePath)
  const source = await readFile(
    absolutePath,
    'utf8',
  )

  const nextSource = transform(source)

  if (nextSource === source) {
    console.log(
      relativePath + ': no changes required.',
    )
    return
  }

  await writeFile(
    absolutePath,
    normalizeContent(nextSource),
    'utf8',
  )

  console.log(relativePath + ': updated.')
}

function insertLineOnce(
  source,
  line,
  before,
) {
  if (source.includes(line)) {
    return source
  }

  if (!source.includes(before)) {
    throw new Error(
      'Insertion marker was not found: ' +
        before,
    )
  }

  return source.replace(
    before,
    line + '\n' + before,
  )
}

async function writeText(
  relativePath,
  content,
) {
  const absolutePath = resolvePath(relativePath)

  await mkdir(path.dirname(absolutePath), {
    recursive: true,
  })

  await writeFile(
    absolutePath,
    normalizeContent(content),
    'utf8',
  )

  console.log(relativePath + ': written.')
}

function normalizeContent(source) {
  return (
    source
      .replace(/^\n/, '')
      .replace(/\r\n/g, '\n')
      .trimEnd() + '\n'
  )
}

function resolvePath(relativePath) {
  return path.join(ROOT, relativePath)
}

main().catch((error) => {
  console.error('')
  console.error(
    'Native crash recovery refactor failed.',
  )
  console.error(
    error instanceof Error
      ? error.stack ?? error.message
      : error,
  )
  process.exitCode = 1
})