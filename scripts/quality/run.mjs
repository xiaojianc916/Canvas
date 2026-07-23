#!/usr/bin/env node
/**
 * Cross-platform quality runner.
 *
 * Runs Turbo through the Node.js entrypoint instead of spawning pnpm.cmd with
 * shell:true. This avoids Windows spawn EINVAL and Node DEP0190 warnings.
 */

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'

const turboCli = resolve(
  process.cwd(),
  'node_modules',
  'turbo',
  'bin',
  'turbo',
)

const cargo = process.platform === 'win32' ? 'cargo.exe' : 'cargo'

function execute(command, args) {
  return new Promise((resolveExitCode) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      windowsHide: false,
      shell: false,
    })

    child.once('error', (error) => {
      console.error(`Unable to start ${command}: ${error.message}`)
      resolveExitCode(1)
    })

    child.once('exit', (code, signal) => {
      if (signal !== null) {
        console.error(`${command} terminated by signal: ${signal}`)
        resolveExitCode(1)
        return
      }

      resolveExitCode(code ?? 1)
    })
  })
}

function turboTask(name) {
  return [
    process.execPath,
    [turboCli, 'run', name, '--continue=always'],
  ]
}

const mode = process.argv[2]

const tasks =
  mode === 'typecheck'
    ? [turboTask('typecheck')]
    : mode === 'test'
      ? [
          turboTask('test'),
          [cargo, ['test', '--workspace', '--all-features']],
        ]
      : mode === 'check'
        ? [
            turboTask('check'),
            [
              cargo,
              ['check', '--workspace', '--all-targets', '--all-features'],
            ],
          ]
        : null

if (!tasks) {
  console.error('Usage: node scripts/quality/run.mjs <typecheck|test|check>')
  process.exitCode = 1
} else {
  let failed = false

  for (const [command, args] of tasks) {
    console.log('')
    console.log(`>>> ${command} ${args.join(' ')}`)
    console.log('')

    if ((await execute(command, args)) !== 0) {
      failed = true
    }
  }

  process.exitCode = failed ? 1 : 0
}
