#!/usr/bin/env node
/**
 * Fix generated Specta HashMap DTO compatibility.
 *
 * Generated IPC:
 *   shortcuts: Partial<{ [key: string]: string }>
 *
 * Domain contract:
 *   shortcuts: Readonly<Record<string, string>>
 *
 * The desktop adapter is the correct boundary to normalize optional generated
 * map entries into a strict domain record.
 *
 * Usage:
 *   node fix-settings-generated-shortcuts.mjs --check
 *   node fix-settings-generated-shortcuts.mjs --apply
 *   node fix-settings-generated-shortcuts.mjs --apply D:\xiaojianc\hybrid-canvas
 */

import { access, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const rootArgument = argv.find((argument) => !argument.startsWith('--'))
const root = resolve(rootArgument ?? process.cwd())

const relativePath =
  'platforms/desktop-runtime/src/adapters/settings/settings-store.ts'

const targetPath = join(root, relativePath)

const oldFragment = `    shortcuts: dto.shortcuts,`

const newFragment = `    shortcuts: normalizeShortcuts(dto.shortcuts),`

const insertionAnchor = `function toDto(settings: AppSettings): AppSettingsDto {`

const helper = `function normalizeShortcuts(
  shortcuts: Partial<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(shortcuts).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}

`

function fail(message) {
  console.error(`\nGenerated shortcuts DTO fix failed:\n${message}\n`)
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

async function main() {
  if (!(await exists(join(root, 'package.json')))) {
    fail(
      [
        `Repository root was not found: ${root}`,
        'Run from the Hybrid Canvas repository root or pass its path explicitly.',
      ].join('\n'),
    )
    return
  }

  if (!(await exists(targetPath))) {
    fail(`Target file was not found: ${relativePath}`)
    return
  }

  const source = await readFile(targetPath, 'utf8')

  if (source.includes(helper) && source.includes(newFragment)) {
    console.log(`Already fixed: ${relativePath}`)
    return
  }

  if (!source.includes(oldFragment)) {
    fail(
      [
        `Expected DTO assignment was not found: ${oldFragment}`,
        'The adapter may differ from the audited generated-IPC migration state.',
        'Refusing fuzzy replacement.',
      ].join('\n'),
    )
    return
  }

  if (!source.includes(insertionAnchor)) {
    fail(
      [
        `Expected helper insertion anchor was not found: ${insertionAnchor}`,
        'Refusing fuzzy replacement.',
      ].join('\n'),
    )
    return
  }

  let next = source.replace(oldFragment, newFragment)

  if (!next.includes(helper)) {
    next = next.replace(insertionAnchor, helper + insertionAnchor)
  }

  if (!apply) {
    console.log(`Safe to normalize generated shortcuts DTO: ${relativePath}`)
    console.log('Run again with --apply to write the change.')
    return
  }

  await writeFile(targetPath, next, 'utf8')

  console.log(`Applied generated shortcuts DTO normalization: ${relativePath}`)
  console.log('')
  console.log('Verify:')
  console.log('  pnpm typecheck')
  console.log('  pnpm lint')
  console.log('  pnpm test')
  console.log('  pnpm test:architecture')
}

await main()