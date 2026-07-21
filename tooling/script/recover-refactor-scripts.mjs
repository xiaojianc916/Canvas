// tooling/script/restore-architecture-check.mjs

import {
  execFileSync,
  execSync,
} from 'node:child_process'
import {
  mkdirSync,
  writeFileSync,
} from 'node:fs'
import {
  dirname,
  join,
} from 'node:path'

const root = process.cwd()
const target = join(
  root,
  'tests/architecture/check.mjs',
)

try {
  const cleanSource = execFileSync(
    'git',
    [
      'show',
      'HEAD:tests/architecture/check.mjs',
    ],
    {
      cwd: root,
      encoding: 'utf8',
    },
  )

  mkdirSync(dirname(target), {
    recursive: true,
  })

  writeFileSync(
    target,
    cleanSource,
    'utf8',
  )

  execFileSync(
    process.execPath,
    ['--check', target],
    {
      cwd: root,
      stdio: 'inherit',
    },
  )

  execSync(
    'pnpm exec biome format --write tests/architecture/check.mjs',
    {
      cwd: root,
      stdio: 'inherit',
      shell: true,
    },
  )

  execFileSync(
    process.execPath,
    ['--check', target],
    {
      cwd: root,
      stdio: 'inherit',
    },
  )

  execSync(
    'pnpm test:architecture',
    {
      cwd: root,
      stdio: 'inherit',
      shell: true,
    },
  )

  console.log('')
  console.log(
    'tests/architecture/check.mjs 已恢复，语法和架构检查通过。',
  )
} catch (error) {
  console.error('')
  console.error(
    '恢复或验证失败；未继续修改其他文件。',
  )
  process.exit(
    typeof error?.status === 'number'
      ? error.status
      : 1,
  )
}