#!/usr/bin/env node

/**
 * P0-C.3 — Add the official Native-backed TLAssetStore adapter.
 *
 * Corrected:
 *   - creates the missing adapters/assets directory before writing
 *   - restores all files on failure
 *   - removes only an empty directory created by this script
 *
 * Required base:
 *   12c839f5a61fbfd86db92b12025e48b302db02a9
 *
 * Usage:
 *   node refactor.mjs --check
 *   node refactor.mjs --apply
 *   node refactor.mjs --apply D:/xiaojianc/hybrid-canvas
 */

import {
  access,
  mkdir,
  readFile,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
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
    '\nP0-C.3 TLAssetStore adapter failed:\n' +
      `Unknown option: ${unknownOptions.join(', ')}\n`,
  )
  process.exit(1)
}

if (rootArguments.length > 1) {
  console.error(
    '\nP0-C.3 TLAssetStore adapter failed:\n' +
      'Only one optional repository root is accepted.\n',
  )
  process.exit(1)
}

if (apply && check) {
  console.error(
    '\nP0-C.3 TLAssetStore adapter failed:\n' +
      'Use either --check or --apply, not both.\n',
  )
  process.exit(1)
}

if (!apply && !check) {
  console.error(
    '\nP0-C.3 TLAssetStore adapter failed:\n' +
      'Missing mode. Use --check or --apply.\n',
  )
  process.exit(1)
}

const root = resolve(rootArguments[0] ?? process.cwd())

const paths = {
  packageJson: join(root, 'package.json'),

  desktopRuntimePackage: join(
    root,
    'platforms/desktop-runtime/package.json',
  ),

  desktopRuntimePublicApi: join(
    root,
    'platforms/desktop-runtime/src/public-api.ts',
  ),

  assetAdapter: join(
    root,
    'platforms/desktop-runtime/src/adapters/assets/native-tl-asset-store.ts',
  ),

  assetProtocol: join(
    root,
    'apps/desktop/src-tauri/src/asset_protocol.rs',
  ),

  generatedBindings: join(
    root,
    'platforms/desktop-ipc/src/generated/ipc-bindings.ts',
  ),
}

const assetAdapterDirectory = dirname(paths.assetAdapter)

const assetAdapterSource = `import {
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

export interface NativeTLAssetStoreSession {
  readonly assets: TLAssetStore
  readonly sessionToken: string
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
  /*
   * Tauri maps custom protocols differently across WebViews:
   *
   * Windows / Android:
   *   http://hybrid-canvas-asset.localhost/asset/<session>/<asset>
   *
   * macOS / Linux:
   *   hybrid-canvas-asset://localhost/asset/<session>/<asset>
   */
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

export async function createNativeTLAssetStoreSession(): Promise<NativeTLAssetStoreSession> {
  const opened = await invokeAssetCommand(() =>
    commands.assetSessionOpen(),
  )

  const sessionToken = opened.sessionToken
  const assetTokens = new Map<TLAssetId, string>()

  let disposed = false
  let disposePromise: Promise<void> | null = null

  function assertActive(): void {
    if (disposed) {
      throw new Error('NATIVE_ASSET_SESSION_DISPOSED')
    }
  }

  const assets: TLAssetStore = {
    async upload(
      asset: TLAsset,
      file: File,
      abortSignal?: AbortSignal,
    ) {
      assertActive()
      throwIfAborted(abortSignal)

      const buffer = await file.arrayBuffer()

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
           * Session disposal remains the final bounded cleanup boundary.
           * Preserve the original validation or abort error.
           */
        })

        throw error
      }

      if (assetTokens.has(asset.id)) {
        await removeUploadedAsset(
          sessionToken,
          uploaded.assetToken,
        )

        throw new Error('NATIVE_ASSET_ID_ALREADY_UPLOADED')
      }

      assetTokens.set(asset.id, uploaded.assetToken)

      return {
        src: toWebviewAssetUrl(
          sessionToken,
          uploaded.assetToken,
        ),
        meta: {
          hybridCanvasAssetToken: uploaded.assetToken,
          hybridCanvasContentHash: uploaded.contentHash,
          hybridCanvasByteLength: uploaded.byteLength,
          hybridCanvasContentType: uploaded.contentType,
        },
      }
    },

    resolve(asset) {
      assertActive()

      const source = asset.props.src

      return typeof source === 'string' && source.length > 0
        ? source
        : null
    },

    async remove(assetIds: TLAssetId[]) {
      assertActive()

      const removals = assetIds.flatMap((assetId) => {
        const assetToken = assetTokens.get(assetId)

        if (!assetToken) {
          return []
        }

        return [
          removeUploadedAsset(
            sessionToken,
            assetToken,
          ).then(() => {
            assetTokens.delete(assetId)
          }),
        ]
      })

      await Promise.all(removals)
    },
  }

  return {
    assets,
    sessionToken,

    dispose() {
      if (disposePromise) {
        return disposePromise
      }

      disposed = true
      assetTokens.clear()

      const request: AssetSessionCloseRequest = {
        sessionToken,
      }

      disposePromise = invokeAssetCommand(() =>
        commands.assetSessionClose(request),
      )

      return disposePromise
    },
  }
}
`

function fail(message) {
  console.error(
    `\nP0-C.3 TLAssetStore adapter failed:\n${message}\n`,
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

function count(source, fragment) {
  return source.split(fragment).length - 1
}

function replaceOnce(
  source,
  oldText,
  newText,
  description,
) {
  const occurrences = count(source, oldText)

  if (occurrences !== 1) {
    throw new Error(
      [
        `Unexpected source count: ${description}`,
        'Expected: 1',
        `Actual: ${occurrences}`,
        'Refusing an ambiguous or partial modification.',
      ].join('\n'),
    )
  }

  return source.replace(oldText, newText)
}

function updateDesktopRuntimePackage(source) {
  const parsed = JSON.parse(
    source.replace(/^\uFEFF/, ''),
  )

  if (
    parsed.name !==
    '@hybrid-canvas/platforms-desktop-runtime'
  ) {
    throw new Error(
      'Unexpected desktop-runtime package name.',
    )
  }

  parsed.dependencies ??= {}

  if (
    parsed.dependencies.tldraw &&
    parsed.dependencies.tldraw !== 'catalog:'
  ) {
    throw new Error(
      'Unexpected existing desktop-runtime tldraw dependency.',
    )
  }

  parsed.dependencies.tldraw = 'catalog:'

  parsed.dependencies = Object.fromEntries(
    Object.entries(parsed.dependencies).sort(
      ([left], [right]) => left.localeCompare(right),
    ),
  )

  return `${JSON.stringify(parsed, null, 2)}\n`
}

function updatePublicApi(source) {
  const exportBlock = `export {
  createNativeTLAssetStoreSession,
  type NativeTLAssetStoreSession,
} from './adapters/assets/native-tl-asset-store'`

  if (source.includes(exportBlock)) {
    return source
  }

  return `${exportBlock}\n\n${source}`
}

function updateAssetProtocol(source) {
  const oldBranch = `        if host == "hybrid-canvas-asset.localhost" {
            if components.next() != Some(ASSET_PROTOCOL_HOST) {
                return Err(AssetProtocolError::InvalidToken);
            }
        } else if host != ASSET_PROTOCOL_HOST {
            return Err(AssetProtocolError::InvalidToken);
        }`

  const finalBranch = `        if host == "hybrid-canvas-asset.localhost"
            || host == "localhost"
        {
            if components.next() != Some(ASSET_PROTOCOL_HOST) {
                return Err(AssetProtocolError::InvalidToken);
            }
        } else if host != ASSET_PROTOCOL_HOST {
            return Err(AssetProtocolError::InvalidToken);
        }`

  if (source.includes(finalBranch)) {
    return source
  }

  return replaceOnce(
    source,
    oldBranch,
    finalBranch,
    'support Tauri localhost custom protocol form',
  )
}

function validateGeneratedBindings(source) {
  const fragments = [
    'async assetSessionOpen()',
    'async assetUpload(request: AssetUploadRequest)',
    'async assetRemove(request: AssetRemoveRequest)',
    'async assetSessionClose(request: AssetSessionCloseRequest)',
    'export type AssetRemoveRequest =',
    'export type AssetSessionCloseRequest =',
    'export type AssetSessionResult =',
    'export type AssetUploadRequest =',
    'export type AssetUploadResult =',
  ]

  for (const fragment of fragments) {
    if (!source.includes(fragment)) {
      throw new Error(
        `Generated asset IPC binding is missing: ${fragment}`,
      )
    }
  }
}

async function restoreFiles(originals) {
  const results = await Promise.allSettled(
    [...originals].map(([path, content]) =>
      writeFile(path, content, 'utf8'),
    ),
  )

  if (
    results.some((result) => result.status === 'rejected')
  ) {
    throw new Error(
      [
        'Rollback failed.',
        'Inspect these files immediately:',
        ...originals.keys(),
      ].join('\n'),
    )
  }
}

async function main() {
  for (const path of [
    paths.packageJson,
    paths.desktopRuntimePackage,
    paths.desktopRuntimePublicApi,
    paths.assetProtocol,
    paths.generatedBindings,
  ]) {
    if (!(await exists(path))) {
      throw new Error(`Required file was not found: ${path}`)
    }
  }

  const packageJson = JSON.parse(
    await readFile(paths.packageJson, 'utf8'),
  )

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error(
      `Unexpected package name: ${String(packageJson.name)}`,
    )
  }

  validateGeneratedBindings(
    await readFile(paths.generatedBindings, 'utf8'),
  )

  const adapterExisted = await exists(paths.assetAdapter)
  const adapterDirectoryExisted =
    await exists(assetAdapterDirectory)

  if (adapterExisted) {
    const existing = await readFile(
      paths.assetAdapter,
      'utf8',
    )

    if (existing !== assetAdapterSource) {
      throw new Error(
        'Native TLAssetStore adapter already exists with different content.',
      )
    }
  }

  const [
    packageOriginal,
    publicApiOriginal,
    protocolOriginal,
  ] = await Promise.all([
    readFile(paths.desktopRuntimePackage, 'utf8'),
    readFile(paths.desktopRuntimePublicApi, 'utf8'),
    readFile(paths.assetProtocol, 'utf8'),
  ])

  const originals = new Map([
    [paths.desktopRuntimePackage, packageOriginal],
    [paths.desktopRuntimePublicApi, publicApiOriginal],
    [paths.assetProtocol, protocolOriginal],
  ])

  const outputs = new Map([
    [paths.assetAdapter, assetAdapterSource],
    [
      paths.desktopRuntimePackage,
      updateDesktopRuntimePackage(packageOriginal),
    ],
    [
      paths.desktopRuntimePublicApi,
      updatePublicApi(publicApiOriginal),
    ],
    [
      paths.assetProtocol,
      updateAssetProtocol(protocolOriginal),
    ],
  ])

  const changed = [...outputs].filter(
    ([path, content]) =>
      path === paths.assetAdapter
        ? !adapterExisted
        : originals.get(path) !== content,
  )

  if (changed.length === 0) {
    console.log(
      'P0-C.3 Native TLAssetStore adapter is already applied.',
    )
    return
  }

  console.log('P0-C.3 TLAssetStore files:')

  for (const [path] of changed) {
    console.log(`- ${path.slice(root.length + 1)}`)
  }

  if (check) {
    console.log('')
    console.log('It will:')
    console.log(
      '- create the missing adapters/assets directory;',
    )
    console.log(
      '- implement the official TLAssetStore interface;',
    )
    console.log(
      '- upload and remove assets through Native IPC;',
    )
    console.log(
      '- resolve assets through the Tauri custom protocol;',
    )
    console.log(
      '- support Windows, macOS and Linux protocol forms;',
    )
    console.log(
      '- add no Blob URL or Data URL fallback;',
    )
    console.log('')
    console.log(
      'Run again with --apply to write the changes.',
    )
    return
  }

  try {
    await mkdir(assetAdapterDirectory, {
      recursive: true,
    })

    /*
     * Existing files are written only after every transformation has
     * succeeded in memory.
     */
    for (const [path, content] of outputs) {
      await writeFile(path, content, 'utf8')
    }
  } catch (error) {
    console.error(
      '\nApply failed. Restoring original files...',
    )

    await restoreFiles(originals)

    if (!adapterExisted) {
      await rm(paths.assetAdapter, {
        force: true,
      })
    }

    if (!adapterDirectoryExisted) {
      /*
       * rmdir succeeds only when the directory is empty. It will not delete
       * unrelated files that may have appeared concurrently.
       */
      await rmdir(assetAdapterDirectory).catch(() => {
        // Leave a non-empty directory intact.
      })
    }

    throw error
  }

  console.log('')
  console.log(
    'Applied P0-C.3 Native TLAssetStore adapter.',
  )
  console.log('')
  console.log('Required verification:')
  console.log('  pnpm install --lockfile-only')
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