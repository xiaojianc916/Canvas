#!/usr/bin/env node

/**
 * P0-A — Separate persistable tldraw document state from local editor session
 * state.
 *
 * This refactor changes the document lifecycle boundary from:
 *
 *   captureDocument(): TLEditorSnapshot
 *
 * to:
 *
 *   captureDocument(): TLStoreSnapshot
 *
 * Dirty tracking and save checkpoints therefore contain only tldraw document
 * records. Camera, selection, current tool, viewport and other session state
 * are no longer accepted by the document lifecycle domain.
 *
 * The current v1 JSON writer still requires a complete TLEditorSnapshot. Until
 * the v2 DocumentCodec replaces it, CanvasDocumentService explicitly captures
 * a legacy full editor snapshot only at the v1 serialization boundary.
 *
 * Usage:
 *   node refactor-p0-document-session-boundary.mjs --check
 *   node refactor-p0-document-session-boundary.mjs --apply
 *   node refactor-p0-document-session-boundary.mjs --apply /path/to/Canvas
 */

import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const check = argv.includes('--check')
const rootArgument = argv.find((argument) => !argument.startsWith('--'))
const root = resolve(rootArgument ?? process.cwd())

if (apply && check) {
  fail('Use either --check or --apply, not both.')
}

if (!apply && !check) {
  fail('Missing mode. Use --check or --apply.')
}

const paths = {
  packageJson: join(root, 'package.json'),

  editorSession: join(
    root,
    'editor/core/src/runtime/editor-session.ts',
  ),

  editorDocumentPort: join(
    root,
    'editor/document/src/ports/editor-document-port.ts',
  ),

  documentCheckpoint: join(
    root,
    'editor/document/src/domain/document-checkpoint.ts',
  ),

  documentSession: join(
    root,
    'editor/document/src/domain/document-session.ts',
  ),

  canvasDocumentService: join(
    root,
    'editor/document/src/application/canvas-document-service.ts',
  ),

  canvasDocumentServiceTest: join(
    root,
    'tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts',
  ),

  documentSessionTest: join(
    root,
    'tests/cross-domain-contract/document-lifecycle/document-session.test.ts',
  ),

  adr: join(
    root,
    'docs/adr/ADR-004-document-session-persistence-boundary.md',
  ),
}

function fail(message) {
  console.error(
    `\nP0-A document/session boundary refactor failed:\n${message}\n`,
  )
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

function replaceExactlyOnce(
  source,
  oldText,
  newText,
  description,
) {
  const firstIndex = source.indexOf(oldText)

  if (firstIndex === -1) {
    throw new Error(
      [
        `Expected source fragment was not found: ${description}`,
        'The repository may differ from the audited version.',
        'Refusing fuzzy replacement.',
      ].join('\n'),
    )
  }

  const secondIndex = source.indexOf(
    oldText,
    firstIndex + oldText.length,
  )

  if (secondIndex !== -1) {
    throw new Error(
      `Expected exactly one source fragment: ${description}`,
    )
  }

  return (
    source.slice(0, firstIndex) +
    newText +
    source.slice(firstIndex + oldText.length)
  )
}

function replaceAllChecked(
  source,
  oldText,
  newText,
  expectedCount,
  description,
) {
  const parts = source.split(oldText)
  const count = parts.length - 1

  if (count !== expectedCount) {
    throw new Error(
      [
        `Unexpected replacement count for: ${description}`,
        `Expected: ${expectedCount}`,
        `Actual: ${count}`,
        'Refusing to modify an unaudited source version.',
      ].join('\n'),
    )
  }

  return parts.join(newText)
}

const canonicalDocumentCheckpoint = `import type { TLStoreSnapshot } from 'tldraw'

// Tests: tests/cross-domain-contract/document-lifecycle/document-session.test.ts

/**
 * Exact content-addressed identity of the persistable TLStore document.
 *
 * The canonical value is retained instead of using a non-cryptographic hash,
 * so dirty-state correctness cannot be affected by a hash collision.
 *
 * This boundary accepts only TLStoreSnapshot. Session state such as camera,
 * selection, active tool, current page and viewport cannot enter dirty tracking
 * by construction.
 */
export interface DocumentCheckpoint {
  readonly canonicalDocument: string
}

export function createDocumentCheckpoint(
  document: TLStoreSnapshot,
): DocumentCheckpoint {
  return {
    canonicalDocument: stableStringify(document),
  }
}

export function checkpointsEqual(
  left: DocumentCheckpoint,
  right: DocumentCheckpoint,
): boolean {
  return left.canonicalDocument === right.canonicalDocument
}

function stableStringify(value: unknown): string {
  if (value === null) {
    return 'null'
  }

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value)

    case 'number':
      return Number.isFinite(value) ? JSON.stringify(value) : 'null'

    case 'bigint':
      return JSON.stringify(value.toString())

    case 'undefined':
    case 'function':
    case 'symbol':
      return 'null'

    case 'object':
      break
  }

  if (Array.isArray(value)) {
    return '[' + value.map((item) => stableStringify(item)).join(',') + ']'
  }

  const record = value as Record<string, unknown>

  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort((left, right) => left.localeCompare(right))

  return (
    '{' +
    keys
      .map(
        (key) =>
          JSON.stringify(key) + ':' + stableStringify(record[key]),
      )
      .join(',') +
    '}'
  )
}
`

const canonicalEditorDocumentPort = `import type { TLStoreSnapshot } from 'tldraw'

// Contract tests: tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts

export type EditorDocumentEvent =
  | {
      readonly kind: 'ready'
    }
  | {
      readonly kind: 'changed'
    }

export interface EditorDocumentPort {
  /**
   * Returns the canonical persistable tldraw document snapshot.
   *
   * This contains document-scoped TLStore records only. Camera, selection,
   * current tool, viewport and other local session state are excluded by the
   * return type and must be persisted through a separate local-session port.
   */
  readonly captureDocument: () => TLStoreSnapshot

  /**
   * Emits ready exactly at the explicit editor attachment boundary.
   *
   * Changed events are emitted only after ready and only for user-originated
   * TLStore document transactions.
   */
  readonly subscribeDocumentEvents: (
    listener: (event: EditorDocumentEvent) => void,
  ) => () => void
}
`

const adrSource = `# ADR-004：tldraw Document 与本机 Session 持久化边界

- 状态：Accepted
- 日期：2026-07-23
- 决策者：Hybrid Canvas maintainers

## 背景

tldraw 的 \`TLEditorSnapshot\` 包含两个生命周期不同的部分：

- \`document\`：shape、page、binding、asset record 等画布文档；
- \`session\`：camera、selection、current tool、current page、viewport 等本机编辑状态。

现有 v1 JSON 文件将两者一起写入 \`.draw\`。同时，文档生命周期接口也接收完整
\`TLEditorSnapshot\`，使 session 状态在类型上可以进入 dirty tracking、保存 checkpoint
和文件格式边界。

虽然当前 checkpoint 实现只读取 \`snapshot.document\`，但这只是实现约定，不是类型约束。

## 决策

文档生命周期从本 ADR 起只接收：

\`\`\`ts
TLStoreSnapshot
\`\`\`

具体约束如下：

1. \`EditorDocumentPort.captureDocument()\` 返回 \`TLStoreSnapshot\`；
2. dirty tracking 只比较 document snapshot；
3. \`DocumentSession\` 不接收 \`TLEditorSnapshot\`；
4. session 变化不得产生文档 dirty 状态；
5. v2 \`.draw\` 只持久化 document snapshot；
6. 本机 session 必须通过独立的 local-session storage 保存；
7. local session 必须绑定 document fingerprint，避免恢复到错误文件；
8. v1 reader 可以读取旧 session，但必须将其视为一次性的本机 session seed；
9. v2 writer 不得重新写入 tldraw session state。

## v1 过渡边界

在 v2 DocumentCodec 切换前，现有 v1 writer 仍要求完整
\`TLEditorSnapshot\`。

因此允许在唯一的 v1 serialization boundary 临时执行：

\`\`\`ts
const document = editorDocument.captureDocument()
const legacySnapshot = editor.getSnapshot()
serializeDrawDocument(legacySnapshot)
\`\`\`

该兼容桥具有以下限制：

- 不能用于 dirty tracking；
- 不能进入 DocumentSession；
- 不能复制到新的 writer；
- v2 writer 落地时必须删除；
- 不得被声明为 v2 logical document contract。

## v2 logical document

v2 的逻辑文档至少包含：

\`\`\`ts
interface LogicalDrawDocumentV2 {
  readonly tldraw: TLStoreSnapshot
  readonly assets: readonly DrawAssetDescriptor[]
}
\`\`\`

真实二进制资源由 Native DocumentCodec 和 TLAssetStore 管理，不进入 snapshot JSON。

## 后果

正面影响：

- session 变化不再污染 dirty tracking；
- 文件内容与本机 UI 状态生命周期明确；
- v2 不需要伪造或持久化 session；
- DocumentSession 可以脱离已挂载 Editor 测试；
- 为后续 local-session storage 和 v2 DocumentCodec 建立稳定边界。

代价：

- v1 writer 暂时保留一个显式兼容桥；
- 需要后续实现 local-session storage；
- v1 reader 需要拆分 document 与 legacy session seed。

## 删除条件

完成以下条件后删除 v1 兼容桥：

- v2 DocumentCodec reader/writer 完整 roundtrip；
- TLAssetStore 已接入；
- v1 reader 可输出 canonical logical document；
- 所有新保存只走 v2 writer；
- local session 已独立持久化。
`

function updateEditorSession(source) {
  if (
    source.includes(
      'readonly captureDocument: () => TLStoreSnapshot',
    ) &&
    source.includes(
      'function captureDocument(): TLStoreSnapshot',
    ) &&
    source.includes('return store.getStoreSnapshot()')
  ) {
    return {
      content: source,
      changed: false,
    }
  }

  let next = replaceExactlyOnce(
    source,
    `  type TLEditorSnapshot,
  type TLStore,`,
    `  type TLEditorSnapshot,
  type TLStore,
  type TLStoreSnapshot,`,
    'import TLStoreSnapshot in EditorSession',
  )

  next = replaceExactlyOnce(
    next,
    `  readonly captureDocument: () => TLEditorSnapshot`,
    `  readonly captureDocument: () => TLStoreSnapshot`,
    'change EditorSession.captureDocument return type',
  )

  const oldCapture = `  function captureDocument(): TLEditorSnapshot {
    /*
     * A complete TLEditorSnapshot includes TLSessionStateSnapshot. tldraw
     * initializes session state through a live Editor, not a detached TLStore.
     *
     * Persistable capture is valid only after attachEditor() has established
     * the explicit mounted-editor readiness boundary.
     */
    return requireAttachedEditor().getSnapshot()
  }`

  const newCapture = `  function captureDocument(): TLStoreSnapshot {
    assertActive()

    /*
     * TLStore document records are the sole persistable canvas source of truth.
     * Session state belongs to the local editor instance and is deliberately
     * excluded from this boundary.
     */
    return store.getStoreSnapshot()
  }

  function captureLegacyEditorSnapshot(): TLEditorSnapshot {
    /*
     * Temporary v1 compatibility boundary. A complete TLEditorSnapshot needs
     * initialized tldraw session state and therefore requires an attached
     * Editor. The v2 writer must not use this method.
     */
    return requireAttachedEditor().getSnapshot()
  }`

  next = replaceExactlyOnce(
    next,
    oldCapture,
    newCapture,
    'separate document capture from legacy full editor capture',
  )

  next = replaceExactlyOnce(
    next,
    `    getSnapshot: captureDocument,
    captureDocument,`,
    `    getSnapshot: captureLegacyEditorSnapshot,
    captureDocument,`,
    'keep getSnapshot as the explicit v1 compatibility boundary',
  )

  return {
    content: next,
    changed: true,
  }
}

function updateDocumentSession(source) {
  if (
    source.includes(
      "import type { TLStoreSnapshot } from 'tldraw'",
    ) &&
    !source.includes('TLEditorSnapshot')
  ) {
    return {
      content: source,
      changed: false,
    }
  }

  let next = replaceExactlyOnce(
    source,
    `import type { TLEditorSnapshot } from 'tldraw'`,
    `import type { TLStoreSnapshot } from 'tldraw'`,
    'replace DocumentSession snapshot import',
  )

  next = replaceAllChecked(
    next,
    'snapshot: TLEditorSnapshot',
    'snapshot: TLStoreSnapshot',
    3,
    'change all DocumentSession inputs to TLStoreSnapshot',
  )

  return {
    content: next,
    changed: true,
  }
}

function updateCanvasDocumentService(source) {
  if (
    source.includes(
      'const documentSnapshot = owned.editorDocument.captureDocument()',
    ) &&
    source.includes(
      'const legacyEditorSnapshot = owned.editor.getSnapshot()',
    )
  ) {
    return {
      content: source,
      changed: false,
    }
  }

  const oldSaveBoundary = `    const snapshot = owned.editorDocument.captureDocument()
    const ticket = owned.document.beginSave(snapshot)

    emit()

    try {
      const content = serializeDrawDocument(snapshot)
      const currentDocumentId = owned.document.getDocumentId()`

  const newSaveBoundary = `    const documentSnapshot = owned.editorDocument.captureDocument()
    const ticket = owned.document.beginSave(documentSnapshot)

    emit()

    try {
      /*
       * Temporary v1 compatibility bridge.
       *
       * Dirty tracking and DocumentSession accept only TLStoreSnapshot. The
       * legacy v1 JSON writer still requires a complete TLEditorSnapshot, so
       * capture it only at this serialization boundary.
       *
       * Delete this call when the v2 document-only writer becomes canonical.
       */
      const legacyEditorSnapshot = owned.editor.getSnapshot()
      const content = serializeDrawDocument(legacyEditorSnapshot)
      const currentDocumentId = owned.document.getDocumentId()`

  return {
    content: replaceExactlyOnce(
      source,
      oldSaveBoundary,
      newSaveBoundary,
      'make v1 full snapshot capture an explicit compatibility bridge',
    ),
    changed: true,
  }
}

function updateCanvasDocumentServiceTest(source) {
  if (
    source.includes(
      'captureDocument() {\n      return currentSnapshot.document',
    )
  ) {
    return {
      content: source,
      changed: false,
    }
  }

  return {
    content: replaceExactlyOnce(
      source,
      `    captureDocument() {
      return currentSnapshot
    },`,
      `    captureDocument() {
      return currentSnapshot.document
    },`,
      'make CanvasDocumentService test port return document-only snapshot',
    ),
    changed: true,
  }
}

function updateDocumentSessionTest(source) {
  if (
    source.includes(
      "import type { TLStoreSnapshot } from 'tldraw'",
    ) &&
    source.includes(
      'function snapshot(documentValue: unknown): TLStoreSnapshot',
    )
  ) {
    return {
      content: source,
      changed: false,
    }
  }

  let next = replaceExactlyOnce(
    source,
    `import type { TLEditorSnapshot } from 'tldraw'`,
    `import type { TLStoreSnapshot } from 'tldraw'`,
    'replace document-session test snapshot import',
  )

  const oldFixture = `function snapshot(documentValue: unknown): TLEditorSnapshot {
  return {
    document: documentValue,
    session: {},
  } as unknown as TLEditorSnapshot
}`

  const newFixture = `function snapshot(documentValue: unknown): TLStoreSnapshot {
  /*
   * DocumentSession accepts only persistable TLStore document state. Tests no
   * longer manufacture an editor session snapshot.
   */
  return documentValue as TLStoreSnapshot
}`

  next = replaceExactlyOnce(
    next,
    oldFixture,
    newFixture,
    'replace fake TLEditorSnapshot document-session fixture',
  )

  return {
    content: next,
    changed: true,
  }
}

async function prepareCanonicalFile(path, canonicalContent, label) {
  if (!(await exists(path))) {
    return {
      content: canonicalContent,
      changed: true,
    }
  }

  const current = await readFile(path, 'utf8')

  if (current === canonicalContent) {
    return {
      content: current,
      changed: false,
    }
  }

  if (label === 'ADR') {
    throw new Error(
      [
        `ADR already exists with different content: ${path}`,
        'Refusing to overwrite an existing architecture decision.',
      ].join('\n'),
    )
  }

  return {
    content: canonicalContent,
    changed: true,
  }
}

async function main() {
  if (!(await exists(paths.packageJson))) {
    throw new Error(
      [
        `Canvas repository root was not found: ${root}`,
        'Run from the repository root or pass the root path.',
      ].join('\n'),
    )
  }

  const packageJson = JSON.parse(
    await readFile(paths.packageJson, 'utf8'),
  )

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error(
      `Unexpected repository package name: ${String(packageJson.name)}`,
    )
  }

  const requiredPaths = [
    paths.editorSession,
    paths.editorDocumentPort,
    paths.documentCheckpoint,
    paths.documentSession,
    paths.canvasDocumentService,
    paths.canvasDocumentServiceTest,
    paths.documentSessionTest,
  ]

  for (const path of requiredPaths) {
    if (!(await exists(path))) {
      throw new Error(`Required source file was not found: ${path}`)
    }
  }

  const [
    editorSessionSource,
    editorDocumentPortSource,
    documentCheckpointSource,
    documentSessionSource,
    canvasDocumentServiceSource,
    canvasDocumentServiceTestSource,
    documentSessionTestSource,
  ] = await Promise.all([
    readFile(paths.editorSession, 'utf8'),
    readFile(paths.editorDocumentPort, 'utf8'),
    readFile(paths.documentCheckpoint, 'utf8'),
    readFile(paths.documentSession, 'utf8'),
    readFile(paths.canvasDocumentService, 'utf8'),
    readFile(paths.canvasDocumentServiceTest, 'utf8'),
    readFile(paths.documentSessionTest, 'utf8'),
  ])

  const changes = {
    editorSession: updateEditorSession(editorSessionSource),

    editorDocumentPort: await prepareCanonicalFile(
      paths.editorDocumentPort,
      canonicalEditorDocumentPort,
      'EditorDocumentPort',
    ),

    documentCheckpoint: await prepareCanonicalFile(
      paths.documentCheckpoint,
      canonicalDocumentCheckpoint,
      'DocumentCheckpoint',
    ),

    documentSession: updateDocumentSession(documentSessionSource),

    canvasDocumentService: updateCanvasDocumentService(
      canvasDocumentServiceSource,
    ),

    canvasDocumentServiceTest: updateCanvasDocumentServiceTest(
      canvasDocumentServiceTestSource,
    ),

    documentSessionTest: updateDocumentSessionTest(
      documentSessionTestSource,
    ),

    adr: await prepareCanonicalFile(
      paths.adr,
      adrSource,
      'ADR',
    ),
  }

  const changedEntries = Object.entries(changes).filter(
    ([, change]) => change.changed,
  )

  if (changedEntries.length === 0) {
    console.log(
      'P0-A document/session persistence boundary is already applied.',
    )
    return
  }

  if (check) {
    console.log(
      'P0-A document/session boundary refactor is safe to apply.',
    )
    console.log('')
    console.log('It will:')
    console.log(
      '- make EditorDocumentPort return TLStoreSnapshot only;',
    )
    console.log(
      '- exclude session state from dirty tracking by type;',
    )
    console.log(
      '- keep full TLEditorSnapshot only at the temporary v1 writer boundary;',
    )
    console.log(
      '- update lifecycle fixtures to document-only snapshots;',
    )
    console.log(
      '- record the v2 document/session decision in ADR-004;',
    )
    console.log('')
    console.log('Files to change:')

    for (const [name] of changedEntries) {
      console.log(`- ${name}`)
    }

    console.log('')
    console.log('Run again with --apply to write the changes.')
    return
  }

  await mkdir(dirname(paths.adr), {
    recursive: true,
  })

  await Promise.all([
    changes.editorSession.changed
      ? writeFile(
          paths.editorSession,
          changes.editorSession.content,
          'utf8',
        )
      : Promise.resolve(),

    changes.editorDocumentPort.changed
      ? writeFile(
          paths.editorDocumentPort,
          changes.editorDocumentPort.content,
          'utf8',
        )
      : Promise.resolve(),

    changes.documentCheckpoint.changed
      ? writeFile(
          paths.documentCheckpoint,
          changes.documentCheckpoint.content,
          'utf8',
        )
      : Promise.resolve(),

    changes.documentSession.changed
      ? writeFile(
          paths.documentSession,
          changes.documentSession.content,
          'utf8',
        )
      : Promise.resolve(),

    changes.canvasDocumentService.changed
      ? writeFile(
          paths.canvasDocumentService,
          changes.canvasDocumentService.content,
          'utf8',
        )
      : Promise.resolve(),

    changes.canvasDocumentServiceTest.changed
      ? writeFile(
          paths.canvasDocumentServiceTest,
          changes.canvasDocumentServiceTest.content,
          'utf8',
        )
      : Promise.resolve(),

    changes.documentSessionTest.changed
      ? writeFile(
          paths.documentSessionTest,
          changes.documentSessionTest.content,
          'utf8',
        )
      : Promise.resolve(),

    changes.adr.changed
      ? writeFile(paths.adr, changes.adr.content, 'utf8')
      : Promise.resolve(),
  ])

  console.log(
    'Applied P0-A document/session persistence boundary.',
  )
  console.log('')
  console.log('The document lifecycle now accepts TLStoreSnapshot only.')
  console.log(
    'The complete TLEditorSnapshot remains only as a temporary v1 writer bridge.',
  )
  console.log('')
  console.log('Required verification:')
  console.log('  pnpm format')
  console.log(
    '  pnpm --filter @hybrid-canvas/canvas typecheck',
  )
  console.log(
    '  pnpm --filter @hybrid-canvas/document typecheck',
  )
  console.log(
    '  pnpm --filter @hybrid-canvas/test-cross-domain-contract typecheck',
  )
  console.log(
    '  pnpm --filter @hybrid-canvas/test-cross-domain-contract test',
  )
  console.log('  pnpm typecheck')
  console.log('  pnpm lint')
  console.log('  pnpm test')
}

main().catch((error) => {
  fail(
    error instanceof Error
      ? error.stack ?? error.message
      : String(error),
  )
})