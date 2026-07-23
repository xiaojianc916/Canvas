#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'

const path = 'editor/persistence/native/src/atomic_write.rs'

let source = await readFile(path, 'utf8')

source = source.replaceAll(
  '#[cfg(unix)]\\nuse std::io::Write;',
  'use std::io::Write;',
)

source = source.replaceAll(
  '#[cfg(unix)]\nuse std::io::Write;',
  'use std::io::Write;',
)

source = source.replaceAll(
  '#[cfg(unix)]\\n#[cfg(unix)]',
  '#[cfg(unix)]',
)

source = source.replaceAll(
  '#[cfg(unix)]\n#[cfg(unix)]',
  '#[cfg(unix)]',
)

await writeFile(path, source, 'utf8')

console.log('atomic_write.rs 的非法字面量 \\\\n 已清除。')