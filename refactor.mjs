#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const runnerPath = resolve('scripts/quality/run.mjs')

const runner = `#!/usr/bin/env node
/**
 * Cross-platform quality runner.
 *
 * Windows requires pnpm.cmd to run through cmd.exe. Running it directly through
 * child_process.spawn causes spawn EINVAL on recent Node.js versions.
 */

import { spawn } from 'node:child_process'
import process from 'node:process'

function execute(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      windowsHide: false,
      shell: options.shell ?? false,
    })

    child.once('error', (error) => {
      console.error(\`Unable to start \${command}: \${error.message}\`)
      resolve(1)
    })

    child.once('exit', (code, signal) => {
      if (signal !== null) {
        console.error(\`\${command} terminated by signal: \${signal}\`)
        resolve(1)
        return
      }

      resolve(code ?? 1)
    })
  })
}

const mode = process.argv[2]

const turboTask = (task) => ({
  command: 'pnpm',
  args: ['exec', 'turbo', 'run', task, '--continue=always'],
  shell: process.platform === 'win32',
})

const cargoTask = (args) => ({
  command: process.platform === 'win32' ? 'cargo.exe' : 'cargo',
  args,
  shell: false,
})

const tasks =
  mode === 'typecheck'
    ? [turboTask('typecheck')]
    : mode === 'test'
      ? [
          turboTask('test'),
          cargoTask(['test', '--workspace', '--all-features']),
        ]
      : mode === 'check'
        ? [
            turboTask('check'),
            cargoTask([
              'check',
              '--workspace',
              '--all-targets',
              '--all-features',
            ]),
          ]
        : null

if (!tasks) {
  console.error('Usage: node scripts/quality/run.mjs <typecheck|test|check>')
  process.exitCode = 1
} else {
  let failed = false

  for (const { command, args, shell } of tasks) {
    console.log('')
    console.log(\`>>> \${command} \${args.join(' ')}\`)
    console.log('')

    if ((await execute(command, args, { shell })) !== 0) {
      failed = true
    }
  }

  process.exitCode = failed ? 1 : 0
}
`

await mkdir(dirname(runnerPath), { recursive: true })
await writeFile(runnerPath, runner, 'utf8')

console.log('已修复 Windows 下 pnpm spawn EINVAL。')