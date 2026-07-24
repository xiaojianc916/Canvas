import {
  readFile,
  writeFile,
} from 'node:fs/promises'

async function main() {
  await repairCargoToml()
  await repairDiagnosticsMod()
  await repairDiagnosticsCommand()
  console.log('Applied v7 UUID + specta sync command fixes.')
}

async function repairCargoToml() {
  const file = 'Cargo.toml'
  const source = await readFile(file, 'utf8')

  let next = source

  next = next.replace(
    'uuid = { version = "1.16.0", features = ["serde", "v4", "v7"] }',
    'uuid = { version = "1.16.0", features = ["serde", "v7"] }',
  )

  next = next.replace(
    'uuid = { version = "1.16.0", features = ["serde", "v4"] }',
    'uuid = { version = "1.16.0", features = ["serde", "v7"] }',
  )

  if (
    !next.includes(
      'uuid = { version = "1.16.0", features = ["serde", "v7"] }',
    )
  ) {
    throw new Error(
      'Could not confirm the uuid dependency line in Cargo.toml.',
    )
  }

  if (next !== source) {
    await writeFile(file, next, 'utf8')
    console.log('Updated Cargo.toml to use UUID v7 only.')
  } else {
    console.log('Cargo.toml already uses UUID v7 only.')
  }
}

async function repairDiagnosticsMod() {
  const file = 'apps/desktop/src-tauri/src/diagnostics/mod.rs'
  const source = await readFile(file, 'utf8')

  const next = source.replace(
    'Uuid::new_v4()',
    'Uuid::now_v7()',
  )

  if (!next.includes('Uuid::now_v7()')) {
    throw new Error(
      'Could not replace Uuid::new_v4() in diagnostics/mod.rs.',
    )
  }

  if (next !== source) {
    await writeFile(file, next, 'utf8')
    console.log('Updated native crash incident IDs to UUID v7.')
  } else {
    console.log('diagnostics/mod.rs already uses UUID v7.')
  }
}

async function repairDiagnosticsCommand() {
  const file = 'apps/desktop/src-tauri/src/commands/diagnostics.rs'
  const source = await readFile(file, 'utf8')

  const next = source.replace(
    'pub async fn diagnostics_take_previous_crash(',
    'pub fn diagnostics_take_previous_crash(',
  )

  if (
    !next.includes(
      'pub fn diagnostics_take_previous_crash(',
    )
  ) {
    throw new Error(
      'Could not convert diagnostics_take_previous_crash to a sync function.',
    )
  }

  if (next !== source) {
    await writeFile(file, next, 'utf8')
    console.log('Converted diagnostics_take_previous_crash to a sync command.')
  } else {
    console.log('diagnostics_take_previous_crash is already sync.')
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})