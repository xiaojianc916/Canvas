import {
  readFile,
  writeFile,
} from 'node:fs/promises'

async function main() {
  const file =
    'apps/desktop/src-tauri/src/commands/diagnostics.rs'

  const next = `use tauri::AppHandle;

use crate::{
    diagnostics::{self, NativeCrashReport},
    error::IpcError,
};

type DiagnosticsCommandResult<T> = std::result::Result<T, IpcError>;

/// Returns and consumes the previous native process crash report.
///
/// The renderer receives a bounded DTO, not an arbitrary filesystem path or
/// unrestricted native error object.
#[tauri::command]
#[specta::specta]
pub fn diagnostics_take_previous_crash(
    app: AppHandle,
) -> DiagnosticsCommandResult<Option<NativeCrashReport>> {
    diagnostics::take_previous_crash_report(&app).map_err(Into::into)
}
`

  await writeFile(file, next, 'utf8')
  console.log(
    'Fixed diagnostics command to return IpcError for specta/IPC.',
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})