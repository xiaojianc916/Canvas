#!/usr/bin/env node

/**
 * P0-C.6.4 — Wire Native asset persistence through EditorSession ownership.
 *
 * Required base:
 *   42f35852886f1af4bd867a6d41478fd2f8fd41ce
 *
 * Usage:
 *   node refactor.mjs --check
 *   node refactor.mjs --apply
 *   node refactor.mjs --check D:\xiaojianc\hybrid-canvas
 *   node refactor.mjs --apply D:\xiaojianc\hybrid-canvas
 */

import {
  access,
  readFile,
  writeFile,
} from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const STEP_NAME =
  'P0-C.6.4 EditorSession asset persistence ownership'

function fail(message) {
  console.error(`\n${STEP_NAME} failed:\n${message}\n`)
  process.exit(1)
}

function parseArguments(argv) {
  let mode = null
  let rootArgument = null

  for (const argument of argv) {
    if (
      argument === '--check' ||
      argument === '--apply'
    ) {
      if (mode !== null) {
        fail(
          [
            'Exactly one execution mode is required.',
            `Received both "${mode}" and "${argument}".`,
          ].join('\n'),
        )
      }

      mode = argument
      continue
    }

    if (argument.startsWith('--')) {
      fail(`Unknown argument: ${argument}`)
    }

    if (rootArgument !== null) {
      fail(
        [
          'Only one repository path may be supplied.',
          `Unexpected argument: ${argument}`,
        ].join('\n'),
      )
    }

    rootArgument = argument
  }

  if (mode === null) {
    fail(
      [
        'Missing execution mode.',
        'Use either --check or --apply.',
      ].join('\n'),
    )
  }

  return {
    mode,
    root: resolve(
      rootArgument ?? process.cwd(),
    ),
  }
}

const { mode, root } = parseArguments(
  process.argv.slice(2),
)

const paths = {
  packageJson: join(root, 'package.json'),

  editorSession: join(
    root,
    'editor',
    'core',
    'src',
    'runtime',
    'editor-session.ts',
  ),

  publicApi: join(
    root,
    'editor',
    'core',
    'src',
    'application',
    'public-api.ts',
  ),

  registryTest: join(
    root,
    'tests',
    'cross-domain-contract',
    'document-lifecycle',
    'editor-session-registry.test.ts',
  ),

  nativeAdapter: join(
    root,
    'platforms',
    'desktop-runtime',
    'src',
    'adapters',
    'assets',
    'native-tl-asset-store.ts',
  ),
}

async function exists(path) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function countOccurrences(source, fragment) {
  if (fragment.length === 0) {
    throw new Error(
      'Cannot count an empty source fragment.',
    )
  }

  let count = 0
  let offset = 0

  while (true) {
    const index = source.indexOf(
      fragment,
      offset,
    )

    if (index < 0) {
      return count
    }

    count += 1
    offset = index + fragment.length
  }
}

function replaceExact(
  source,
  baseline,
  final,
  description,
) {
  const baselineCount =
    countOccurrences(source, baseline)

  const finalCount =
    countOccurrences(source, final)

  if (
    baselineCount === 1 &&
    finalCount === 0
  ) {
    return source.replace(baseline, final)
  }

  if (
    baselineCount === 0 &&
    finalCount === 1
  ) {
    return source
  }

  throw new Error(
    [
      `Unexpected source state: ${description}`,
      `Baseline count: ${baselineCount}`,
      `Final count: ${finalCount}`,
      'Expected one audited baseline or one final implementation.',
      'Refusing an ambiguous or partial modification.',
    ].join('\n'),
  )
}

const assetContractsBaseline = `export interface EditorAssetStoreSession {
  readonly assets: TLAssetStore
  readonly dispose: () => Promise<void>
}

export type EditorAssetStoreSessionFactory =
  () => EditorAssetStoreSession`

const assetContractsFinal = `/**
 * Process-local Native resource capability associated with an opened document.
 *
 * This value is an opaque lifecycle capability. It is never part of the .draw
 * format and must never be interpreted as a path, URL or archive entry.
 */
export interface EditorAssetStoreRestore {
  readonly persistenceToken: string
}

export interface EditorAssetStoreSession {
  readonly assets: TLAssetStore

  /**
   * Settles accepted asset operations and returns the Native resource-session
   * capability. Asset-free documents return null without allocating a session.
   */
  readonly getPersistenceToken: () => Promise<string | null>

  readonly dispose: () => Promise<void>
}

export type EditorAssetStoreSessionFactory = (
  restore?: EditorAssetStoreRestore,
) => EditorAssetStoreSession`

const createOptionsBaseline = `export interface CreateEditorSessionOptions {
  readonly sessionId: string
  readonly documentId: string
  readonly initialSnapshot?: TLEditorSnapshot
  readonly extensions?: readonly HybridCanvasExtension[]
}`

const createOptionsFinal = `export interface CreateEditorSessionOptions {
  readonly sessionId: string
  readonly documentId: string
  readonly initialSnapshot?: TLEditorSnapshot

  /**
   * Present only when Native has transactionally restored resources while
   * opening an existing v2 document.
   */
  readonly assetStoreRestore?: EditorAssetStoreRestore

  readonly extensions?: readonly HybridCanvasExtension[]
}`

const sessionInterfaceBaseline = `  readonly captureDocument: () => TLStoreSnapshot

  readonly subscribeDocumentEvents: (listener: (event: EditorDocumentEvent) => void) => () => void`

const sessionInterfaceFinal = `  readonly captureDocument: () => TLStoreSnapshot

  /**
   * Returns the settled Native resource capability for the same editor session
   * whose TLStoreSnapshot is being persisted.
   */
  readonly captureAssetPersistenceToken: () => Promise<string | null>

  readonly subscribeDocumentEvents: (listener: (event: EditorDocumentEvent) => void) => () => void`

const sessionReturnBaseline = `    getSnapshot: captureLegacyEditorSnapshot,
    captureDocument,

    subscribeDocumentEvents(listener) {`

const sessionReturnFinal = `    getSnapshot: captureLegacyEditorSnapshot,
    captureDocument,

    captureAssetPersistenceToken() {
      assertActive()
      return assetStoreSession.getPersistenceToken()
    },

    subscribeDocumentEvents(listener) {`

const factoryInvocationBaseline = `      const assetStoreSession = assetStoreFactory()`

const factoryInvocationFinal = `      const assetStoreSession = assetStoreFactory(
        options.assetStoreRestore,
      )`

function updateEditorSession(source) {
  let result = source

  result = replaceExact(
    result,
    assetContractsBaseline,
    assetContractsFinal,
    'define the EditorSession asset capability boundary',
  )

  result = replaceExact(
    result,
    createOptionsBaseline,
    createOptionsFinal,
    'accept a Native-restored asset session',
  )

  result = replaceExact(
    result,
    sessionInterfaceBaseline,
    sessionInterfaceFinal,
    'expose asset persistence capture',
  )

  result = replaceExact(
    result,
    sessionReturnBaseline,
    sessionReturnFinal,
    'delegate persistence capture to the owned asset session',
  )

  result = replaceExact(
    result,
    factoryInvocationBaseline,
    factoryInvocationFinal,
    'inject restoration into the asset factory',
  )

  return result
}

function updatePublicApi(source) {
  const baseline = `  type EditorAssetStoreSession,
  type EditorAssetStoreSessionFactory,`

  const final = `  type EditorAssetStoreRestore,
  type EditorAssetStoreSession,
  type EditorAssetStoreSessionFactory,`

  return replaceExact(
    source,
    baseline,
    final,
    'export the asset restoration contract',
  )
}

const firstHarnessBaseline = `  const factory: EditorAssetStoreSessionFactory = () => ({
    assets: {
      upload: vi.fn(),
    } as unknown as TLAssetStore,
    dispose,
  })`

const firstHarnessFinal = `  const getPersistenceToken = vi
    .fn()
    .mockResolvedValue(null)

  const factory: EditorAssetStoreSessionFactory = () => ({
    assets: {
      upload: vi.fn(),
    } as unknown as TLAssetStore,
    getPersistenceToken,
    dispose,
  })`

const secondHarnessBaseline = `    const registry = createEditorSessionRegistry(() => ({
      assets: {
        upload: vi.fn(),
      } as unknown as TLAssetStore,
      dispose,
    }))`

const secondHarnessFinal = `    const registry = createEditorSessionRegistry(() => ({
      assets: {
        upload: vi.fn(),
      } as unknown as TLAssetStore,
      getPersistenceToken: vi
        .fn()
        .mockResolvedValue(null),
      dispose,
    }))`

const finalTestAnchor = `  it('waits for owned asset disposal before close settles', async () => {`

const capabilityTest = `  it('binds restored resources and persistence capture to the same session', async () => {
    const persistenceToken =
      'restored-native-session'

    const getPersistenceToken = vi
      .fn()
      .mockResolvedValue(persistenceToken)

    const factory: EditorAssetStoreSessionFactory =
      vi.fn((restore) => ({
        assets: {
          upload: vi.fn(),
        } as unknown as TLAssetStore,
        getPersistenceToken,
        dispose: vi.fn().mockResolvedValue(undefined),
      }))

    const registry =
      createEditorSessionRegistry(factory)

    const session = await registry.create({
      sessionId: 'restored-editor-session',
      documentId: 'restored-document',
      assetStoreRestore: {
        persistenceToken,
      },
      extensions: [],
    })

    expect(factory).toHaveBeenCalledWith({
      persistenceToken,
    })

    await expect(
      session.captureAssetPersistenceToken(),
    ).resolves.toBe(persistenceToken)

    expect(getPersistenceToken)
      .toHaveBeenCalledTimes(1)

    await registry.close(session.sessionId)
  })

${finalTestAnchor}`

function updateRegistryTest(source) {
  let result = source

  result = replaceExact(
    result,
    firstHarnessBaseline,
    firstHarnessFinal,
    'add persistence capture to the primary asset harness',
  )

  result = replaceExact(
    result,
    secondHarnessBaseline,
    secondHarnessFinal,
    'add persistence capture to the disposal harness',
  )

  result = replaceExact(
    result,
    finalTestAnchor,
    capabilityTest,
    'test restored resource ownership',
  )

  return result
}

function validateRepository(packageJson) {
  let parsed

  try {
    parsed = JSON.parse(
      packageJson.replace(/^\uFEFF/u, ''),
    )
  } catch (error) {
    throw new Error(
      `Root package.json is invalid JSON: ${String(
        error,
      )}`,
    )
  }

  if (parsed.name !== 'hybrid-canvas') {
    throw new Error(
      `Unexpected package name: ${String(
        parsed.name,
      )}`,
    )
  }
}

function validateAdapter(source) {
  for (const fragment of [
    'export interface NativeAssetStoreSessionRestore',
    'readonly persistenceToken: string',
    'readonly getPersistenceToken: () => Promise<string | null>',
    'restore?: NativeAssetStoreSessionRestore',
    `asset.meta?.['hybridCanvasAssetToken']`,
    `asset.meta?.['hybridCanvasContentHash']`,
  ]) {
    if (!source.includes(fragment)) {
      throw new Error(
        `Native adapter prerequisite is missing: ${fragment}`,
      )
    }
  }
}

function validateFinal(
  editorSession,
  publicApi,
  registryTest,
) {
  const requiredSession = [
    'export interface EditorAssetStoreRestore',
    'readonly persistenceToken: string',
    'readonly getPersistenceToken: () => Promise<string | null>',
    'restore?: EditorAssetStoreRestore',
    'readonly assetStoreRestore?: EditorAssetStoreRestore',
    'readonly captureAssetPersistenceToken: () => Promise<string | null>',
    'return assetStoreSession.getPersistenceToken()',
    'options.assetStoreRestore',
  ]

  for (const fragment of requiredSession) {
    if (!editorSession.includes(fragment)) {
      throw new Error(
        `EditorSession persistence boundary is missing: ${fragment}`,
      )
    }
  }

  if (
    countOccurrences(
      editorSession,
      'captureAssetPersistenceToken()',
    ) !== 1
  ) {
    throw new Error(
      'Expected exactly one asset persistence capture implementation.',
    )
  }

  if (
    countOccurrences(
      editorSession,
      'assetStoreFactory(',
    ) !== 1
  ) {
    throw new Error(
      'Expected exactly one owned asset-store construction site.',
    )
  }

  if (
    !publicApi.includes(
      'type EditorAssetStoreRestore,',
    )
  ) {
    throw new Error(
      'Editor asset restore contract is not exported.',
    )
  }

  for (const fragment of [
    'binds restored resources and persistence capture to the same session',
    'assetStoreRestore: {',
    'session.captureAssetPersistenceToken()',
    'expect(factory).toHaveBeenCalledWith({',
  ]) {
    if (!registryTest.includes(fragment)) {
      throw new Error(
        `EditorSession contract test is missing: ${fragment}`,
      )
    }
  }

  for (const forbidden of [
    'assetSessionToken: any',
    'persistenceToken: any',
    '// @ts-ignore',
    '// @ts-expect-error',
    'URL.createObjectURL',
    'FileReader',
  ]) {
    if (
      editorSession.includes(forbidden) ||
      registryTest.includes(forbidden)
    ) {
      throw new Error(
        `Forbidden compatibility or suppression remains: ${forbidden}`,
      )
    }
  }
}

async function restoreFiles(originals) {
  const results = await Promise.allSettled(
    [...originals].map(
      ([path, content]) =>
        writeFile(path, content, 'utf8'),
    ),
  )

  const failures = results.filter(
    (result) =>
      result.status === 'rejected',
  )

  if (failures.length > 0) {
    throw new AggregateError(
      failures.map(
        (failure) => failure.reason,
      ),
      'Apply failed and original files could not all be restored.',
    )
  }
}

async function main() {
  for (const path of Object.values(paths)) {
    if (!(await exists(path))) {
      throw new Error(
        `Required file was not found: ${path}`,
      )
    }
  }

  const [
    packageJson,
    editorSessionOriginal,
    publicApiOriginal,
    registryTestOriginal,
    nativeAdapter,
  ] = await Promise.all([
    readFile(paths.packageJson, 'utf8'),
    readFile(paths.editorSession, 'utf8'),
    readFile(paths.publicApi, 'utf8'),
    readFile(paths.registryTest, 'utf8'),
    readFile(paths.nativeAdapter, 'utf8'),
  ])

  validateRepository(packageJson)
  validateAdapter(nativeAdapter)

  const editorSessionFinal =
    updateEditorSession(
      editorSessionOriginal,
    )

  const publicApiFinal =
    updatePublicApi(publicApiOriginal)

  const registryTestFinal =
    updateRegistryTest(
      registryTestOriginal,
    )

  validateFinal(
    editorSessionFinal,
    publicApiFinal,
    registryTestFinal,
  )

  const originals = new Map([
    [
      paths.editorSession,
      editorSessionOriginal,
    ],
    [paths.publicApi, publicApiOriginal],
    [
      paths.registryTest,
      registryTestOriginal,
    ],
  ])

  const outputs = new Map([
    [
      paths.editorSession,
      editorSessionFinal,
    ],
    [paths.publicApi, publicApiFinal],
    [
      paths.registryTest,
      registryTestFinal,
    ],
  ])

  const changed = [...outputs].filter(
    ([path, content]) =>
      originals.get(path) !== content,
  )

  if (changed.length === 0) {
    console.log(
      `${STEP_NAME} is already applied.`,
    )
    return
  }

  console.log(`${STEP_NAME} will update:`)

  for (const [path] of changed) {
    console.log(
      `- ${path.slice(root.length + 1)}`,
    )
  }

  console.log('')
  console.log('It will:')
  console.log(
    '- make EditorSession own the Native resource capability;',
  )
  console.log(
    '- inject restored resources into the official TLAssetStore factory;',
  )
  console.log(
    '- expose one settled persistence capture boundary;',
  )
  console.log(
    '- preserve lazy allocation for asset-free documents;',
  )
  console.log(
    '- keep session tokens out of the physical document format;',
  )
  console.log(
    '- add a cross-domain ownership contract test.',
  )

  if (mode === '--check') {
    console.log('')
    console.log(
      'Check completed. No files were written.',
    )
    console.log('')
    console.log('Apply with:')
    console.log('  node refactor.mjs --apply')
    return
  }

  try {
    for (const [path, content] of changed) {
      await writeFile(path, content, 'utf8')
    }

    const [
      writtenEditorSession,
      writtenPublicApi,
      writtenRegistryTest,
    ] = await Promise.all([
      readFile(paths.editorSession, 'utf8'),
      readFile(paths.publicApi, 'utf8'),
      readFile(paths.registryTest, 'utf8'),
    ])

    validateFinal(
      writtenEditorSession,
      writtenPublicApi,
      writtenRegistryTest,
    )
  } catch (error) {
    console.error(
      '\nApply failed. Restoring original files...',
    )

    await restoreFiles(originals)
    throw error
  }

  console.log('')
  console.log(`Applied ${STEP_NAME}.`)
  console.log('')
  console.log('Required verification:')
  console.log('  pnpm format')
  console.log('  pnpm lint')
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log(
    '  cargo check --workspace --all-targets',
  )
  console.log(
    '  cargo test --workspace --all-targets',
  )
  console.log('  pnpm tauri dev')
}

main().catch((error) => {
  fail(
    error instanceof Error
      ? error.stack ?? error.message
      : String(error),
  )
})