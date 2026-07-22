import { randomUUID } from 'node:crypto'
import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import {
  dirname,
  join,
  resolve,
} from 'node:path'

const root = resolve(process.cwd())
const apply = process.argv.includes('--apply')

const paths = {
  editorSession:
    'editor/core/src/runtime/editor-session.ts',
  editorCanvas:
    'editor/core/src/react/EditorCanvas.tsx',
}

assertRepository()

if (!apply) {
  console.log('将执行以下修改：')
  console.log(
    `PATCH  ${paths.editorSession}`,
  )
  console.log(
    `PATCH  ${paths.editorCanvas}`,
  )
  console.log('')
  console.log(
    '- 为 TLStore 注册 tldraw 默认 Shape',
  )
  console.log(
    '- 为 TLStore 注册 tldraw 默认 Binding',
  )
  console.log(
    '- 将自定义 Shape/Binding 传给 Tldraw',
  )
  console.log('')
  console.log(
    '使用 --apply 执行修改。',
  )
  process.exit(0)
}

patchEditorSession()
patchEditorCanvas()

console.log('')
console.log('修改完成。')
console.log('')
console.log('请执行：')
console.log(
  'pnpm exec biome format --write editor/core/src/runtime/editor-session.ts editor/core/src/react/EditorCanvas.tsx',
)
console.log(
  'pnpm --filter @hybrid-canvas/canvas typecheck',
)
console.log(
  'pnpm --filter @hybrid-canvas/desktop typecheck',
)
console.log('pnpm test:architecture')

function patchEditorSession() {
  const path = paths.editorSession
  let source = read(path)

  if (
    !source.includes(
      'defaultShapeUtils',
    )
  ) {
    const typeImport =
      "import type { Editor, TLEditorSnapshot, TLStore } from 'tldraw'"

    source = replaceOnce(
      source,
      typeImport,
      `import {
  defaultBindingUtils,
  defaultShapeUtils,
  type Editor,
  type TLEditorSnapshot,
  type TLStore,
} from 'tldraw'`,
      path,
      'tldraw 默认工具 import',
    )
  }

  if (
    !source.includes(
      '...defaultShapeUtils',
    )
  ) {
    source = replaceOnce(
      source,
      `  const store = createTLStore({
    shapeUtils: registration.shapeUtils,
    bindingUtils: registration.bindingUtils,
  })`,
      `  const store = createTLStore({
    shapeUtils: [
      ...defaultShapeUtils,
      ...registration.shapeUtils,
    ],
    bindingUtils: [
      ...defaultBindingUtils,
      ...registration.bindingUtils,
    ],
  })`,
      path,
      'TLStore Schema 注册',
    )
  }

  validateEditorSession(source, path)
  write(path, source)

  console.log(`PATCH  ${path}`)
}

function patchEditorCanvas() {
  const path = paths.editorCanvas
  let source = read(path)

  if (
    source.includes(
      'shapeUtils: registration.shapeUtils',
    )
  ) {
    console.log(
      `SKIP   ${path}（已经注册扩展工具）`,
    )
    return
  }

  source = replaceOnce(
    source,
    `    const base: TldrawProps = {
      hideUi: true,
      store,
      onMount: setEditor,
      options: { maxPages: 100 },
    }`,
    `    const base: TldrawProps = {
      hideUi: true,
      store,
      onMount: setEditor,
      options: { maxPages: 100 },
      shapeUtils: registration.shapeUtils,
      bindingUtils: registration.bindingUtils,
    }`,
    path,
    'Tldraw 扩展工具注册',
  )

  validateEditorCanvas(source, path)
  write(path, source)

  console.log(`PATCH  ${path}`)
}

function validateEditorSession(
  source,
  path,
) {
  const required = [
    'defaultShapeUtils',
    'defaultBindingUtils',
    '...defaultShapeUtils',
    '...registration.shapeUtils',
    '...defaultBindingUtils',
    '...registration.bindingUtils',
  ]

  for (const token of required) {
    if (!source.includes(token)) {
      throw new Error(
        `${path}: 修改结果缺少 ${token}`,
      )
    }
  }
}

function validateEditorCanvas(
  source,
  path,
) {
  const required = [
    'shapeUtils: registration.shapeUtils',
    'bindingUtils: registration.bindingUtils',
  ]

  for (const token of required) {
    if (!source.includes(token)) {
      throw new Error(
        `${path}: 修改结果缺少 ${token}`,
      )
    }
  }
}

function replaceOnce(
  source,
  oldSource,
  newSource,
  path,
  label,
) {
  const count =
    source.split(oldSource).length - 1

  if (count !== 1) {
    throw new Error(
      `${path}: ${label}匹配失败，预期 1 次，实际 ${count} 次。`,
    )
  }

  return source.replace(
    oldSource,
    newSource,
  )
}

function read(path) {
  return readFileSync(
    join(root, path),
    'utf8',
  )
}

function write(path, content) {
  const target =
    join(root, path)

  const temporary =
    join(
      dirname(target),
      `.${randomUUID()}.tmp`,
    )

  writeFileSync(
    temporary,
    content,
    'utf8',
  )

  renameSync(
    temporary,
    target,
  )
}

function assertRepository() {
  const packagePath =
    join(root, 'package.json')

  if (!existsSync(packagePath)) {
    throw new Error(
      '请在 hybrid-canvas 仓库根目录运行脚本。',
    )
  }

  const packageJson =
    JSON.parse(
      readFileSync(
        packagePath,
        'utf8',
      ),
    )

  if (
    packageJson.name !==
    'hybrid-canvas'
  ) {
    throw new Error(
      '当前目录不是 hybrid-canvas 仓库根目录。',
    )
  }

  for (
    const path of Object.values(paths)
  ) {
    if (
      !existsSync(
        join(root, path),
      )
    ) {
      throw new Error(
        `缺少目标文件：${path}`,
      )
    }
  }
}