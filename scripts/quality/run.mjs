#!/usr/bin/env node
/**
 * Cross-platform quality command runner.
 *
 * Turbo can terminate concurrent Windows cmd.exe children after a task fails.
 * That termination is rendered as "^C / 终止批处理操作吗" even when the user
 * did not press Ctrl+C. This runner lets all tasks finish and aggregates only
 * their actual exit codes.
 */

import { spawn } from 'node:child_process'
import process from 'node:process'

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const cargo = process.platform === 'win32' ? 'cargo.exe' : 'cargo'

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      windowsHide: false,
    })

    child.once('error', (error) => {
      console.error(`无法启动 ${command}: ${error.message}`)
      resolve(1)
    })

    child.once('exit', (code, signal) => {
      if (signal) {
        console.error(`${command} 被信号 ${signal} 终止`)
        resolve(1)
        return
      }

      resolve(code ?? 1)
    })
  })
}

const mode = process.argv[2]

const commands =
  mode === 'typecheck'
    ? [
        {
          command: pnpm,
          args: ['exec', 'turbo', 'run', 'typecheck', '--continue=always'],
        },
      ]
    : mode === 'test'
      ? [
          {
            command: pnpm,
            args: ['exec', 'turbo', 'run', 'test', '--continue=always'],
          },
          {
            command: cargo,
            args: ['test', '--workspace', '--all-features'],
          },
        ]
      : mode === 'check'
        ? [
            {
              command: pnpm,
              args: ['exec', 'turbo', 'run', 'check', '--continue=always'],
            },
            {
              command: cargo,
              args: ['check', '--workspace', '--all-targets', '--all-features'],
            },
          ]
        : null

if (!commands) {
  console.error('用法: node scripts/quality/run.mjs <typecheck|test|check>')
  process.exitCode = 1
} else {
  let failed = false

  for (const { command, args } of commands) {
    console.log('')
    console.log(`>>> ${command} ${args.join(' ')}`)
    console.log('')

    const exitCode = await run(command, args)

    if (exitCode !== 0) {
      failed = true
    }
  }

  process.exitCode = failed ? 1 : 0
}
