#!/usr/bin/env node
/**
 * Windows-safe quality command orchestrator.
 *
 * Turbo's default cancellation behavior can terminate active pnpm.cmd child
 * processes after one package fails. On Windows this is rendered as "^C" and
 * "Terminate batch job (Y/N)" even when the user did not press Ctrl+C.
 *
 * --continue=always lets every package finish and this runner returns failure
 * only after collecting actual task exit codes.
 */

import { spawn } from 'node:child_process'
import process from 'node:process'

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const cargo = process.platform === 'win32' ? 'cargo.exe' : 'cargo'

function execute(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      windowsHide: false,
    })

    child.once('error', (error) => {
      console.error(`Unable to start ${command}: ${error.message}`)
      resolve(1)
    })

    child.once('exit', (code, signal) => {
      if (signal !== null) {
        console.error(`${command} terminated by signal: ${signal}`)
        resolve(1)
        return
      }

      resolve(code ?? 1)
    })
  })
}

const mode = process.argv[2]

const tasks =
  mode === 'typecheck'
    ? [
        [
          pnpm,
          ['exec', 'turbo', 'run', 'typecheck', '--continue=always'],
        ],
      ]
    : mode === 'test'
      ? [
          [
            pnpm,
            ['exec', 'turbo', 'run', 'test', '--continue=always'],
          ],
          [cargo, ['test', '--workspace', '--all-features']],
        ]
      : mode === 'check'
        ? [
            [
              pnpm,
              ['exec', 'turbo', 'run', 'check', '--continue=always'],
            ],
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
