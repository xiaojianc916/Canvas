import {
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
    parsed.protocol !== `${ASSET_PROTOCOL_SCHEME}:` ||
    parsed.hostname !== ASSET_PROTOCOL_HOST ||
    parsed.pathname !== `/${sessionToken}/${assetToken}` ||
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
    `/asset/${sessionToken}/${assetToken}`,
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
