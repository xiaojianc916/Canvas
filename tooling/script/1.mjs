#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

const root = resolve(process.cwd())
const target = resolve(
  root,
  'tooling/script/refactor.mjs',
)

if (!existsSync(target)) {
  throw new Error(
    '找不到 tooling/script/refactor.mjs',
  )
}

const original = readFileSync(
  target,
  'utf8',
)

const replacements = [
  {
    oldText:
      "delete activeTab.dataset['suppressHover']",
    newText:
      'delete activeTab.dataset[',
  },
  {
    oldText:
      "delete event.currentTarget.dataset['suppressHover']",
    newText:
      'delete event.currentTarget.dataset[',
  },
]

let updated = original

for (const replacement of replacements) {
  const count =
    updated.split(replacement.oldText).length - 1

  if (count !== 1) {
    if (
      updated.includes(
        replacement.newText,
      )
    ) {
      console.log(
        'SKIP   已修复断言：' +
          replacement.newText,
      )
      continue
    }

    throw new Error(
      '预期断言应出现一次，实际出现 ' +
        String(count) +
        ' 次：' +
        replacement.oldText,
    )
  }

  updated = updated.replace(
    replacement.oldText,
    replacement.newText,
  )

  console.log(
    'PATCH  ' +
      replacement.oldText,
  )
}

if (updated !== original) {
  const temporary =
    target +
    '.tmp-' +
    process.pid +
    '-' +
    Date.now()

  writeFileSync(
    temporary,
    updated
      .replaceAll('\r\n', '\n')
      .trimStart() + '\n',
    'utf8',
  )

  renameSync(
    temporary,
    target,
  )
}

console.log('')
console.log(
  'RUN    node tooling/script/refactor.mjs --apply',
)

execFileSync(
  process.execPath,
  [
    'tooling/script/refactor.mjs',
    '--apply',
  ],
  {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  },
)