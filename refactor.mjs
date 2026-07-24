import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const filePath = path.join(
  process.cwd(),
  'editor/core/src/react/CanvasTransformStatus.tsx',
)

let source = await readFile(filePath, 'utf8')

const before = source

/*
 * 修复上一版脚本错误插入的字面量：
 *
 * }\\n
 * interface ...
 *
 * 替换为真正的源码换行。
 */
source = source.replace(
  /\\n(?=\s*interface\s+)/g,
  '\n',
)

source = source.replace(
  /\\n(?=\s*(?:export\s+)?function\s+)/g,
  '\n',
)

/*
 * 防止连续运行上一版脚本后出现多个字面量换行。
 */
source = source.replace(
  /(?:\\n)+(?=\s*interface\s+)/g,
  '\n',
)

if (source === before) {
  console.log(
    '没有发现字面量换行，文件可能已经被其他操作修复。',
  )
} else {
  await writeFile(filePath, source, 'utf8')

  console.log(
    'CanvasTransformStatus.tsx 非法换行已修复。',
  )
}

/*
 * 修正上一版脚本生成器本身，避免再次执行时重新产生错误。
 */
const generatorPath = path.join(
  process.cwd(),
  'refine-transform-inline-edit-v12-3.mjs',
)

try {
  let generator = await readFile(
    generatorPath,
    'utf8',
  )

  /*
   * 在生成器源文件中：
   * '\\\\n' 会生成字面量反斜杠+n；
   * '\\n' 才会生成真正换行。
   */
  generator = generator.replace(
    `replacement.trimEnd() +
    '\\\\n' +
    source.slice(endIndex)`,
    `replacement.trimEnd() +
    '\\n' +
    source.slice(endIndex)`,
  )

  await writeFile(
    generatorPath,
    generator,
    'utf8',
  )

  console.log(
    'refine-transform-inline-edit-v12-3.mjs 生成器也已修复。',
  )
} catch {
  // 用户可能已经删除了临时重构脚本，不影响产品代码修复。
}

console.log('')
console.log('现在运行：')
console.log('  pnpm format')
console.log('  pnpm typecheck')
console.log('')