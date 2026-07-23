#!/usr/bin/env node

/**
 * P0-C.6.3 — Adopt restored Native asset sessions.
 *
 * Required base:
 *   5676ea3789b3a426204f40a122ac99d1dcb84d98
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
  'P0-C.6.3 restored Native asset-session adoption'

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

  adapter: join(
    root,
    'platforms',
    'desktop-runtime',
    'src',
    'adapters',
    'assets',
    'native-tl-asset-store.ts',
  ),

  publicApi: join(
    root,
    'platforms',
    'desktop-runtime',
    'src',
    'public-api.ts',
  ),

  assetProtocol: join(
    root,
    'apps',
    'desktop',
    'src-tauri',
    'src',
    'asset_protocol.rs',
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
      `Unexpected source count: ${description}`,
      `Baseline count: ${baselineCount}`,
      `Final count: ${finalCount}`,
      'Expected one audited baseline or one final implementation.',
      'Refusing an ambiguous or partial modification.',
    ].join('\n'),
  )
}

const interfaceBaseline = `export interface NativeTLAssetStoreSession {
  readonly assets: TLAssetStore
  readonly dispose: () => Promise<void>
}`

const interfaceFinal = `export interface NativeAssetStoreSessionRestore {
  /**
   * Process-local capability returned by Native document restoration.
   *
   * This token is never persisted into the .draw container and must never be
   * interpreted as a filesystem path or archive entry.
   */
  readonly persistenceToken: string
}

export interface NativeTLAssetStoreSession {
  readonly assets: TLAssetStore

  /**
   * Returns the Native session capability after all queued asset operations
   * have settled. A document with no Native resources returns null without
   * opening an otherwise-unused session.
   */
  readonly getPersistenceToken: () => Promise<string | null>

  readonly dispose: () => Promise<void>
}`

const helperAnchor = `function toWebviewAssetUrl(
  sessionToken: string,
  assetToken: string,
): string {`

const helperFinal = `function validatePersistenceToken(
  token: string,
): void {
  if (
    token.length === 0 ||
    token.length > 128 ||
    !/^[A-Za-z0-9_-]+$/u.test(token)
  ) {
    throw new Error(
      'NATIVE_ASSET_PERSISTENCE_TOKEN_INVALID',
    )
  }
}

function persistedAssetToken(
  asset: TLAsset,
): string | null {
  const token =
    asset.meta?.hybridCanvasAssetToken

  if (
    typeof token !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(token)
  ) {
    return null
  }

  const contentHash =
    asset.meta?.hybridCanvasContentHash

  if (
    typeof contentHash !== 'string' ||
    contentHash !== token
  ) {
    return null
  }

  return token
}

${helperAnchor}`

const factoryBaseline = `export function createNativeTLAssetStoreSession(): NativeTLAssetStoreSession {
  const assetTokens = new Map<TLAssetId, string>()

  let openedSessionPromise:
    | Promise<OpenedNativeAssetSession>
    | null = null`

const factoryFinal = `export function createNativeTLAssetStoreSession(
  restore?: NativeAssetStoreSessionRestore,
): NativeTLAssetStoreSession {
  const assetTokens = new Map<TLAssetId, string>()

  const restoredSessionToken =
    restore?.persistenceToken ?? null

  if (restoredSessionToken) {
    validatePersistenceToken(
      restoredSessionToken,
    )
  }

  let openedSessionPromise:
    | Promise<OpenedNativeAssetSession>
    | null = restoredSessionToken
      ? Promise.resolve({
          sessionToken: restoredSessionToken,
        })
      : null`

const resolveBaseline = `    resolve(asset) {
      assertActive()

      const source = asset.props.src

      return typeof source === 'string' &&
        source.length > 0
        ? source
        : null
    },`

const resolveFinal = `    resolve(asset) {
      assertActive()

      /*
       * Persisted protocol URLs contain a process-local session token from the
       * process that wrote the file. They are never trusted after reopening.
       *
       * A restored document resolves its content-addressed asset identity
       * against the new Native session created by document_open.
       */
      if (restoredSessionToken) {
        const assetToken =
          persistedAssetToken(asset)

        if (!assetToken) {
          return null
        }

        assetTokens.set(asset.id, assetToken)

        return toWebviewAssetUrl(
          restoredSessionToken,
          assetToken,
        )
      }

      const source = asset.props.src

      return typeof source === 'string' &&
        source.length > 0
        ? source
        : null
    },`

const returnBaseline = `  return {
    assets,

    dispose() {`

const returnFinal = `  return {
    assets,

    async getPersistenceToken() {
      assertActive()

      /*
       * Wait for uploads and removals already accepted by this adapter. This
       * gives the document writer a stable Native resource snapshot boundary.
       */
      await operationTail

      assertActive()

      if (!openedSessionPromise) {
        return null
      }

      const { sessionToken } =
        await openedSessionPromise

      return sessionToken
    },

    dispose() {`

function updateAdapter(source) {
  let result = source

  result = replaceExact(
    result,
    interfaceBaseline,
    interfaceFinal,
    'extend Native asset session contract',
  )

  result = replaceExact(
    result,
    helperAnchor,
    helperFinal,
    'add persistence capability validation',
  )

  result = replaceExact(
    result,
    factoryBaseline,
    factoryFinal,
    'adopt an existing Native asset session',
  )

  result = replaceExact(
    result,
    resolveBaseline,
    resolveFinal,
    'resolve restored assets against the current session',
  )

  result = replaceExact(
    result,
    returnBaseline,
    returnFinal,
    'expose the Native persistence capability',
  )

  return result
}

function updatePublicApi(source) {
  const baseline = `export {
  createNativeTLAssetStoreSession,
  type NativeTLAssetStoreSession,
} from './adapters/assets/native-tl-asset-store'`

  const final = `export {
  createNativeTLAssetStoreSession,
  type NativeAssetStoreSessionRestore,
  type NativeTLAssetStoreSession,
} from './adapters/assets/native-tl-asset-store'`

  if (
    source.includes(final)
  ) {
    return source
  }

  if (!source.includes(baseline)) {
    /*
     * The export may use a different multiline arrangement. Restrict the
     * fallback to the exact existing type export instead of rewriting the
     * complete public API.
     */
    const typeBaseline =
      '  type NativeTLAssetStoreSession,'

    const typeFinal = `  type NativeAssetStoreSessionRestore,
  type NativeTLAssetStoreSession,`

    return replaceExact(
      source,
      typeBaseline,
      typeFinal,
      'export Native asset restoration contract',
    )
  }

  return source.replace(baseline, final)
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

function validateNativePrerequisite(source) {
  const required = [
    'pub fn restore_session(',
    'pub fn snapshot_session(',
    'Sha256::digest(asset.bytes.as_ref())',
    'Failure never publishes an empty or partially restored session.',
  ]

  for (const fragment of required) {
    if (!source.includes(fragment)) {
      throw new Error(
        `Native restore prerequisite is missing: ${fragment}`,
      )
    }
  }
}

function validateAdapterPrerequisites(source) {
  const required = [
    'interface OpenedNativeAssetSession',
    'readonly sessionToken: string',
    'const assetTokens = new Map<TLAssetId, string>()',
    'function requireOpenedSession()',
    'commands.assetSessionOpen()',
    'commands.assetSessionClose(request)',
    'hybridCanvasAssetToken:',
    'hybridCanvasContentHash:',
    'function toWebviewAssetUrl(',
  ]

  for (const fragment of required) {
    if (!source.includes(fragment)) {
      throw new Error(
        `Native TLAssetStore prerequisite is missing: ${fragment}`,
      )
    }
  }
}

function validateFinal(
  adapter,
  publicApi,
) {
  const requiredAdapter = [
    'export interface NativeAssetStoreSessionRestore',
    'readonly persistenceToken: string',
    'readonly getPersistenceToken: () => Promise<string | null>',
    'restore?: NativeAssetStoreSessionRestore',
    'validatePersistenceToken(',
    'const restoredSessionToken =',
    'Promise.resolve({',
    'persistedAssetToken(asset)',
    'contentHash !== token',
    'assetTokens.set(asset.id, assetToken)',
    'toWebviewAssetUrl(',
    'async getPersistenceToken()',
    'await operationTail',
    'if (!openedSessionPromise)',
  ]

  for (const fragment of requiredAdapter) {
    if (!adapter.includes(fragment)) {
      throw new Error(
        `Final Native TLAssetStore adapter is missing: ${fragment}`,
      )
    }
  }

  if (
    countOccurrences(
      adapter,
      'async getPersistenceToken()',
    ) !== 1
  ) {
    throw new Error(
      'Expected exactly one getPersistenceToken implementation.',
    )
  }

  if (
    countOccurrences(
      adapter,
      'restore?: NativeAssetStoreSessionRestore',
    ) !== 1
  ) {
    throw new Error(
      'Expected exactly one restored-session factory input.',
    )
  }

  for (const fragment of [
    'type NativeAssetStoreSessionRestore',
    'type NativeTLAssetStoreSession',
    'createNativeTLAssetStoreSession',
  ]) {
    if (!publicApi.includes(fragment)) {
      throw new Error(
        `Desktop runtime public API is missing: ${fragment}`,
      )
    }
  }

  const restoredResolveStart =
    adapter.indexOf(
      '      if (restoredSessionToken) {',
    )

  const sourceFallbackStart =
    adapter.indexOf(
      '      const source = asset.props.src',
      restoredResolveStart,
    )

  if (
    restoredResolveStart < 0 ||
    sourceFallbackStart <
      restoredResolveStart
  ) {
    throw new Error(
      'Restored assets are not resolved before the ordinary runtime URL path.',
    )
  }

  for (const forbidden of [
    'URL.createObjectURL',
    'URL.revokeObjectURL',
    'FileReader',
    'data:',
    'atob(',
    'btoa(',
    'crypto.randomUUID',
    'window.__TAURI__',
  ]) {
    if (adapter.includes(forbidden)) {
      throw new Error(
        `Unsupported asset fallback remains: ${forbidden}`,
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
      'Apply failed and one or more original files could not be restored.',
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
    adapterOriginal,
    publicApiOriginal,
    assetProtocol,
  ] = await Promise.all([
    readFile(paths.packageJson, 'utf8'),
    readFile(paths.adapter, 'utf8'),
    readFile(paths.publicApi, 'utf8'),
    readFile(paths.assetProtocol, 'utf8'),
  ])

  validateRepository(packageJson)
  validateNativePrerequisite(assetProtocol)

  validateAdapterPrerequisites(
    adapterOriginal,
  )

  const adapterFinal =
    updateAdapter(adapterOriginal)

  const publicApiFinal =
    updatePublicApi(publicApiOriginal)

  validateFinal(
    adapterFinal,
    publicApiFinal,
  )

  const originals = new Map([
    [paths.adapter, adapterOriginal],
    [paths.publicApi, publicApiOriginal],
  ])

  const outputs = new Map([
    [paths.adapter, adapterFinal],
    [paths.publicApi, publicApiFinal],
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
    '- let the official TLAssetStore adopt a Native-restored session;',
  )
  console.log(
    '- validate the opaque process-local persistence capability;',
  )
  console.log(
    '- rebuild restored protocol URLs from the current session and SHA-256;',
  )
  console.log(
    '- stop trusting stale session URLs stored by an earlier process;',
  )
  console.log(
    '- expose the settled Native persistence token to the document writer;',
  )
  console.log(
    '- preserve lazy Native session creation for asset-free documents;',
  )
  console.log(
    '- keep binary resource bytes outside the Renderer.',
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
      writtenAdapter,
      writtenPublicApi,
    ] = await Promise.all([
      readFile(paths.adapter, 'utf8'),
      readFile(paths.publicApi, 'utf8'),
    ])

    validateFinal(
      writtenAdapter,
      writtenPublicApi,
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