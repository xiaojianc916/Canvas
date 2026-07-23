#!/usr/bin/env node

/**
 * P0-C.4 — Make Native TLAssetStore synchronously constructible and lazily opened.
 *
 * Corrected:
 *   - validates only the public NativeTLAssetStoreSession interface
 *   - permits sessionToken inside private OpenedNativeAssetSession
 *
 * Required base:
 *   2a892ab9e0e10bc8584bd063530feff19a3ab254
 *
 * Usage:
 *   node refactor.mjs --check
 *   node refactor.mjs --apply
 *   node refactor.mjs --apply D:/xiaojianc/hybrid-canvas
 */

import {
  access,
  readFile,
  writeFile,
} from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const check = argv.includes('--check')

const unknownOptions = argv.filter(
  (argument) =>
    argument.startsWith('--') &&
    argument !== '--apply' &&
    argument !== '--check',
)

const rootArguments = argv.filter(
  (argument) => !argument.startsWith('--'),
)

if (unknownOptions.length > 0) {
  console.error(
    '\nP0-C.4 lazy TLAssetStore refactor failed:\n' +
      `Unknown option: ${unknownOptions.join(', ')}\n`,
  )
  process.exit(1)
}

if (rootArguments.length > 1) {
  console.error(
    '\nP0-C.4 lazy TLAssetStore refactor failed:\n' +
      'Only one optional repository root is accepted.\n',
  )
  process.exit(1)
}

if (apply && check) {
  console.error(
    '\nP0-C.4 lazy TLAssetStore refactor failed:\n' +
      'Use either --check or --apply, not both.\n',
  )
  process.exit(1)
}

if (!apply && !check) {
  console.error(
    '\nP0-C.4 lazy TLAssetStore refactor failed:\n' +
      'Missing mode. Use --check or --apply.\n',
  )
  process.exit(1)
}

const root = resolve(rootArguments[0] ?? process.cwd())

const paths = {
  packageJson: join(root, 'package.json'),

  adapter: join(
    root,
    'platforms/desktop-runtime/src/adapters/assets/native-tl-asset-store.ts',
  ),

  runtimePackage: join(
    root,
    'platforms/desktop-runtime/package.json',
  ),

  publicApi: join(
    root,
    'platforms/desktop-runtime/src/public-api.ts',
  ),

  generatedBindings: join(
    root,
    'platforms/desktop-ipc/src/generated/ipc-bindings.ts',
  ),
}

const finalAdapterSource = `import {
  IpcInvocationError,
  isIpcError,
} from '@hybrid-canvas/desktop-ipc'
import {
  commands,
  type AssetRemoveRequest,
  type AssetSessionCloseRequest,
  type AssetUploadRequest,
  type AssetUploadResult,
} from '@hybrid-canvas/desktop-ipc/generated/ipc-bindings'
import { convertFileSrc } from '@tauri-apps/api/core'
import type {
  TLAsset,
  TLAssetId,
  TLAssetStore,
} from 'tldraw'

const ASSET_PROTOCOL_SCHEME = 'hybrid-canvas-asset'
const ASSET_PROTOCOL_HOST = 'asset'

interface OpenedNativeAssetSession {
  readonly sessionToken: string
}

export interface NativeTLAssetStoreSession {
  readonly assets: TLAssetStore
  readonly dispose: () => Promise<void>
}

async function invokeAssetCommand<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (isIpcError(error)) {
      throw new IpcInvocationError(error)
    }

    throw error
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return
  }

  throw new DOMException(
    'Asset upload was aborted.',
    'AbortError',
  )
}

function validateNativeSource(
  source: string,
  sessionToken: string,
  assetToken: string,
): void {
  let parsed: URL

  try {
    parsed = new URL(source)
  } catch {
    throw new Error('NATIVE_ASSET_SOURCE_INVALID')
  }

  if (
    parsed.protocol !== \`\${ASSET_PROTOCOL_SCHEME}:\` ||
    parsed.hostname !== ASSET_PROTOCOL_HOST ||
    parsed.pathname !== \`/\${sessionToken}/\${assetToken}\` ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new Error('NATIVE_ASSET_SOURCE_INVALID')
  }
}

function toWebviewAssetUrl(
  sessionToken: string,
  assetToken: string,
): string {
  return convertFileSrc(
    \`/asset/\${sessionToken}/\${assetToken}\`,
    ASSET_PROTOCOL_SCHEME,
  )
}

async function removeUploadedAsset(
  sessionToken: string,
  assetToken: string,
): Promise<void> {
  const request: AssetRemoveRequest = {
    sessionToken,
    assetToken,
  }

  await invokeAssetCommand(() =>
    commands.assetRemove(request),
  )
}

/**
 * Creates the official tldraw asset store synchronously.
 *
 * Native state is opened by the first upload rather than during application or
 * editor construction. This keeps createTLStore({ assets }) synchronous and
 * avoids creating unused Native sessions.
 */
export function createNativeTLAssetStoreSession(): NativeTLAssetStoreSession {
  const assetTokens = new Map<TLAssetId, string>()

  let openedSessionPromise:
    | Promise<OpenedNativeAssetSession>
    | null = null

  let operationTail: Promise<void> = Promise.resolve()
  let disposePromise: Promise<void> | null = null
  let disposed = false

  function assertActive(): void {
    if (disposed) {
      throw new Error('NATIVE_ASSET_SESSION_DISPOSED')
    }
  }

  function requireOpenedSession(): Promise<OpenedNativeAssetSession> {
    if (openedSessionPromise) {
      return openedSessionPromise
    }

    openedSessionPromise = invokeAssetCommand(async () => {
      const opened = await commands.assetSessionOpen()

      return {
        sessionToken: opened.sessionToken,
      }
    })

    return openedSessionPromise
  }

  function enqueue<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    const result = operationTail.then(operation)

    operationTail = result.then(
      () => undefined,
      () => undefined,
    )

    return result
  }

  const assets: TLAssetStore = {
    upload(
      asset: TLAsset,
      file: File,
      abortSignal?: AbortSignal,
    ) {
      assertActive()

      return enqueue(async () => {
        assertActive()
        throwIfAborted(abortSignal)

        const buffer = await file.arrayBuffer()

        throwIfAborted(abortSignal)

        if (assetTokens.has(asset.id)) {
          throw new Error(
            'NATIVE_ASSET_ID_ALREADY_UPLOADED',
          )
        }

        const { sessionToken } =
          await requireOpenedSession()

        throwIfAborted(abortSignal)

        const request: AssetUploadRequest = {
          sessionToken,
          contentType: file.type,
          bytes: Array.from(new Uint8Array(buffer)),
        }

        const uploaded: AssetUploadResult =
          await invokeAssetCommand(() =>
            commands.assetUpload(request),
          )

        try {
          validateNativeSource(
            uploaded.source,
            sessionToken,
            uploaded.assetToken,
          )

          throwIfAborted(abortSignal)
        } catch (error) {
          await removeUploadedAsset(
            sessionToken,
            uploaded.assetToken,
          ).catch(() => {
            /*
             * Preserve the original validation or abort failure. Session
             * disposal remains the final bounded cleanup operation.
             */
          })

          throw error
        }

        assetTokens.set(
          asset.id,
          uploaded.assetToken,
        )

        return {
          src: toWebviewAssetUrl(
            sessionToken,
            uploaded.assetToken,
          ),
          meta: {
            hybridCanvasAssetToken:
              uploaded.assetToken,
            hybridCanvasContentHash:
              uploaded.contentHash,
            hybridCanvasByteLength:
              uploaded.byteLength,
            hybridCanvasContentType:
              uploaded.contentType,
          },
        }
      })
    },

    resolve(asset) {
      assertActive()

      const source = asset.props.src

      return typeof source === 'string' &&
        source.length > 0
        ? source
        : null
    },

    remove(assetIds: TLAssetId[]) {
      assertActive()

      return enqueue(async () => {
        assertActive()

        if (assetIds.length === 0) {
          return
        }

        const removals = assetIds.flatMap(
          (assetId) => {
            const assetToken =
              assetTokens.get(assetId)

            return assetToken
              ? [{ assetId, assetToken }]
              : []
          },
        )

        if (removals.length === 0) {
          return
        }

        const { sessionToken } =
          await requireOpenedSession()

        for (const {
          assetId,
          assetToken,
        } of removals) {
          await removeUploadedAsset(
            sessionToken,
            assetToken,
          )

          assetTokens.delete(assetId)
        }
      })
    },
  }

  return {
    assets,

    dispose() {
      if (disposePromise) {
        return disposePromise
      }

      disposed = true

      disposePromise = enqueue(async () => {
        const sessionPromise =
          openedSessionPromise

        assetTokens.clear()

        if (!sessionPromise) {
          return
        }

        const { sessionToken } =
          await sessionPromise

        const request: AssetSessionCloseRequest = {
          sessionToken,
        }

        await invokeAssetCommand(() =>
          commands.assetSessionClose(request),
        )
      })

      return disposePromise
    },
  }
}
`

function fail(message) {
  console.error(
    `\nP0-C.4 lazy TLAssetStore refactor failed:\n${message}\n`,
  )
  process.exit(1)
}

async function exists(path) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function extractInterface(
  source,
  interfaceName,
) {
  const marker = `export interface ${interfaceName} {`
  const start = source.indexOf(marker)

  if (start < 0) {
    throw new Error(
      `Exported interface was not found: ${interfaceName}`,
    )
  }

  const end = source.indexOf('\n}', start)

  if (end < 0) {
    throw new Error(
      `Exported interface is not closed: ${interfaceName}`,
    )
  }

  return source.slice(start, end + 2)
}

function validateBaseline(source) {
  const requiredFragments = [
    'export async function createNativeTLAssetStoreSession()',
    'export interface NativeTLAssetStoreSession {',
    'readonly sessionToken: string',
    'const opened = await invokeAssetCommand(() =>',
    'commands.assetSessionOpen()',
    'const assets: TLAssetStore = {',
  ]

  for (const fragment of requiredFragments) {
    if (!source.includes(fragment)) {
      throw new Error(
        `Expected P0-C.3 adapter fragment was not found: ${fragment}`,
      )
    }
  }
}

function validateFinal(source) {
  const requiredFragments = [
    'interface OpenedNativeAssetSession {',
    'readonly sessionToken: string',
    'export function createNativeTLAssetStoreSession()',
    'function requireOpenedSession()',
    'function enqueue<T>(',
    'let operationTail: Promise<void>',
    'if (!sessionPromise) {',
    'commands.assetSessionClose(request)',
  ]

  for (const fragment of requiredFragments) {
    if (!source.includes(fragment)) {
      throw new Error(
        `Final lazy adapter is missing: ${fragment}`,
      )
    }
  }

  if (
    source.includes(
      'export async function createNativeTLAssetStoreSession()',
    )
  ) {
    throw new Error(
      'The public TLAssetStore factory is still asynchronous.',
    )
  }

  const publicSessionInterface = extractInterface(
    source,
    'NativeTLAssetStoreSession',
  )

  if (
    publicSessionInterface.includes(
      'readonly sessionToken:',
    )
  ) {
    throw new Error(
      'The public NativeTLAssetStoreSession still exposes sessionToken.',
    )
  }

  if (
    !publicSessionInterface.includes(
      'readonly assets: TLAssetStore',
    ) ||
    !publicSessionInterface.includes(
      'readonly dispose: () => Promise<void>',
    )
  ) {
    throw new Error(
      'The public NativeTLAssetStoreSession contract is incomplete.',
    )
  }

  const privateSessionStart = source.indexOf(
    'interface OpenedNativeAssetSession {',
  )

  if (privateSessionStart < 0) {
    throw new Error(
      'Private Native asset session type was not found.',
    )
  }

  const privateSessionEnd = source.indexOf(
    '\n}',
    privateSessionStart,
  )

  const privateSessionInterface = source.slice(
    privateSessionStart,
    privateSessionEnd + 2,
  )

  if (
    !privateSessionInterface.includes(
      'readonly sessionToken: string',
    )
  ) {
    throw new Error(
      'Private Native session token ownership is missing.',
    )
  }
}

function validateDependencies(
  packageSource,
  publicApiSource,
  bindingsSource,
) {
  const runtimePackage = JSON.parse(packageSource)

  if (
    runtimePackage.dependencies?.tldraw !==
    'catalog:'
  ) {
    throw new Error(
      'desktop-runtime is missing its tldraw dependency.',
    )
  }

  if (
    !publicApiSource.includes(
      'createNativeTLAssetStoreSession,',
    )
  ) {
    throw new Error(
      'desktop-runtime does not export the TLAssetStore factory.',
    )
  }

  for (const fragment of [
    'async assetSessionOpen()',
    'async assetUpload(request: AssetUploadRequest)',
    'async assetRemove(request: AssetRemoveRequest)',
    'async assetSessionClose(request: AssetSessionCloseRequest)',
  ]) {
    if (!bindingsSource.includes(fragment)) {
      throw new Error(
        `Generated asset binding is missing: ${fragment}`,
      )
    }
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

  const packageJson = JSON.parse(
    await readFile(paths.packageJson, 'utf8'),
  )

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error(
      `Unexpected package name: ${String(
        packageJson.name,
      )}`,
    )
  }

  const [
    adapterOriginal,
    runtimePackage,
    publicApi,
    generatedBindings,
  ] = await Promise.all([
    readFile(paths.adapter, 'utf8'),
    readFile(paths.runtimePackage, 'utf8'),
    readFile(paths.publicApi, 'utf8'),
    readFile(paths.generatedBindings, 'utf8'),
  ])

  validateDependencies(
    runtimePackage,
    publicApi,
    generatedBindings,
  )

  validateFinal(finalAdapterSource)

  if (adapterOriginal === finalAdapterSource) {
    console.log(
      'P0-C.4 lazy Native TLAssetStore is already applied.',
    )
    return
  }

  validateBaseline(adapterOriginal)

  console.log('P0-C.4 will update:')
  console.log(
    '- platforms/desktop-runtime/src/adapters/assets/native-tl-asset-store.ts',
  )

  if (check) {
    console.log('')
    console.log('It will:')
    console.log(
      '- make TLAssetStore construction synchronous;',
    )
    console.log(
      '- open the Native session only on first upload;',
    )
    console.log(
      '- serialize upload, remove and disposal;',
    )
    console.log(
      '- wait for active operations before closing;',
    )
    console.log(
      '- expose no Native session token publicly;',
    )
    console.log(
      '- preserve the custom protocol without fallback;',
    )
    console.log('')
    console.log(
      'Run again with --apply to write the change.',
    )
    return
  }

  try {
    await writeFile(
      paths.adapter,
      finalAdapterSource,
      'utf8',
    )
  } catch (error) {
    await writeFile(
      paths.adapter,
      adapterOriginal,
      'utf8',
    )

    throw error
  }

  console.log('')
  console.log(
    'Applied P0-C.4 lazy Native TLAssetStore lifecycle.',
  )
  console.log('')
  console.log('Required verification:')
  console.log('  pnpm format')
  console.log('  pnpm lint')
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('  pnpm check:ipc')
  console.log('  cargo fmt --all')
  console.log(
    '  cargo check --workspace --all-targets --all-features',
  )
  console.log(
    '  cargo test --workspace --all-targets --all-features',
  )
  console.log(
    '  cargo clippy --workspace --all-targets --all-features -- -D warnings',
  )
}

main().catch((error) => {
  fail(
    error instanceof Error
      ? error.stack ?? error.message
      : String(error),
  )
})