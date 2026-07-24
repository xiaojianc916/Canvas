#!/usr/bin/env node

import {
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const filePath = path.join(
  process.cwd(),
  'editor/core/src/react/PropertiesInspectorContent.tsx',
)

let source = normalize(
  await readFile(
    filePath,
    'utf8',
  ),
)

source = extendCapabilitiesType(source)
source = extendCapabilitiesState(source)
source = addLinkAction(source)
source = updateFrameActions(source)
source = updateMediaActions(source)

await writeFile(
  filePath,
  source.trimEnd() + '\n',
  'utf8',
)

console.log('')
console.log(
  '右侧属性侧边栏上下文操作已补充。',
)
console.log('')
console.log('新增：')
console.log('  - 编辑链接')
console.log('  - Frame-like 官方判断')
console.log('  - 图片替换能力判断')
console.log('  - 视频替换能力判断')
console.log('  - 媒体下载能力判断')
console.log('')
console.log('验证：')
console.log('  pnpm format')
console.log('  pnpm lint')
console.log('  pnpm typecheck')
console.log('  pnpm test:architecture')
console.log('  pnpm build:desktop')
console.log('')

function extendCapabilitiesType(input) {
  if (
    input.includes(
      'readonly canEditLink:',
    )
  ) {
    return input
  }

  const anchor = `  readonly canEnableTextAutoSize: boolean
  readonly canReorder: boolean`

  if (
    !input.includes(anchor)
  ) {
    throw new Error(
      '没有找到 SelectionCapabilities 插入位置。',
    )
  }

  return input.replace(
    anchor,
    `  readonly canEnableTextAutoSize: boolean
  readonly canEditLink: boolean
  readonly canFitFrame: boolean
  readonly canRemoveFrame: boolean
  readonly canReplaceImage: boolean
  readonly canReplaceVideo: boolean
  readonly canDownloadMedia: boolean
  readonly canReorder: boolean`,
  )
}

function extendCapabilitiesState(input) {
  if (
    input.includes(
      'const onlySelectedIsFrameLike',
    )
  ) {
    return input
  }

  const onlySelectedAnchor = `        const onlySelected =
          editor.getOnlySelectedShape()`

  if (
    !input.includes(
      onlySelectedAnchor,
    )
  ) {
    throw new Error(
      '没有找到 onlySelected。',
    )
  }

  const contextState = `${onlySelectedAnchor}

        const onlySelectedIsFrameLike =
          onlySelected
            ? editor.isShapeFrameLike(
                onlySelected,
              )
            : false

        const onlySelectedIsImage =
          onlySelected
            ? editor.isShapeOfType(
                onlySelected,
                'image',
              )
            : false

        const onlySelectedIsVideo =
          onlySelected
            ? editor.isShapeOfType(
                onlySelected,
                'video',
              )
            : false

        const onlySelectedIsUnlocked =
          onlySelected !== null &&
          onlySelected !== undefined &&
          !onlySelected.isLocked

        const onlySelectedHasUrl =
          onlySelected !== null &&
          onlySelected !== undefined &&
          'url' in onlySelected.props &&
          typeof onlySelected.props.url ===
            'string'`

  input = input.replace(
    onlySelectedAnchor,
    contextState,
  )

  const returnAnchor = `          canEnableTextAutoSize,

          canReorder:`

  if (
    !input.includes(
      returnAnchor,
    )
  ) {
    throw new Error(
      '没有找到 capability 返回对象。',
    )
  }

  return input.replace(
    returnAnchor,
    `          canEnableTextAutoSize,

          canEditLink:
            !readonly &&
            onlySelectedIsUnlocked &&
            onlySelectedHasUrl,

          canFitFrame:
            !readonly &&
            onlySelectedIsUnlocked &&
            onlySelectedIsFrameLike,

          canRemoveFrame:
            !readonly &&
            onlySelectedIsUnlocked &&
            onlySelectedIsFrameLike,

          canReplaceImage:
            !readonly &&
            onlySelectedIsUnlocked &&
            onlySelectedIsImage,

          canReplaceVideo:
            !readonly &&
            onlySelectedIsUnlocked &&
            onlySelectedIsVideo,

          canDownloadMedia:
            onlySelectedIsImage ||
            onlySelectedIsVideo,

          canReorder:`,
  )
}

function addLinkAction(input) {
  if (
    input.includes(
      'label="编辑链接"',
    )
  ) {
    return input
  }

  const lockAnchor = `          <ActionButton
            actions={actions}
            icon={
              selectionLockState ===`

  if (
    !input.includes(
      lockAnchor,
    )
  ) {
    throw new Error(
      '没有找到锁定操作。',
    )
  }

  const linkAction = `          {capabilities.canEditLink ? (
            <ActionButton
              actions={actions}
              id="edit-link"
              label="编辑链接"
            />
          ) : null}

`

  return input.replace(
    lockAnchor,
    linkAction +
      lockAnchor,
  )
}

function updateFrameActions(input) {
  input = input.replace(
    `{onlySelectedShapeType ===
          'frame' ? (
            <>
              <ActionButton
                actions={actions}
                icon="corners"
                id="fit-frame-to-content"
                label="适应内容"
              />

              <ActionButton
                actions={actions}
                icon="cross-2"
                id="remove-frame"
                label="移除画框"
              />
            </>
          ) : null}`,
    `{capabilities.canFitFrame ||
          capabilities.canRemoveFrame ? (
            <>
              {capabilities.canFitFrame ? (
                <ActionButton
                  actions={actions}
                  icon="corners"
                  id="fit-frame-to-content"
                  label="适应内容"
                />
              ) : null}

              {capabilities.canRemoveFrame ? (
                <ActionButton
                  actions={actions}
                  icon="cross-2"
                  id="remove-frame"
                  label="移除画框"
                />
              ) : null}
            </>
          ) : null}`,
  )

  return input
}

function updateMediaActions(input) {
  const imageBlock = `          {onlySelectedShapeType ===
          'image' ? (
            <>
              <ActionButton
                actions={actions}
                id="image-replace"
                label="替换图片"
              />

              <ActionButton
                actions={actions}
                icon="download"
                id="download-original"
                label="下载原图"
              />
            </>
          ) : null}`

  const imageReplacement = `          {capabilities.canReplaceImage ||
          (
            onlySelectedShapeType ===
              'image' &&
            capabilities.canDownloadMedia
          ) ? (
            <>
              {capabilities.canReplaceImage ? (
                <ActionButton
                  actions={actions}
                  id="image-replace"
                  label="替换图片"
                />
              ) : null}

              {capabilities.canDownloadMedia ? (
                <ActionButton
                  actions={actions}
                  icon="download"
                  id="download-original"
                  label="下载原图"
                />
              ) : null}
            </>
          ) : null}`

  if (
    !input.includes(
      imageBlock,
    )
  ) {
    throw new Error(
      '没有找到图片操作区。',
    )
  }

  input = input.replace(
    imageBlock,
    imageReplacement,
  )

  const videoBlock = `          {onlySelectedShapeType ===
          'video' ? (
            <>
              <ActionButton
                actions={actions}
                id="video-replace"
                label="替换视频"
              />

              <ActionButton
                actions={actions}
                icon="download"
                id="download-original"
                label="下载原视频"
              />
            </>
          ) : null}`

  const videoReplacement = `          {capabilities.canReplaceVideo ||
          (
            onlySelectedShapeType ===
              'video' &&
            capabilities.canDownloadMedia
          ) ? (
            <>
              {capabilities.canReplaceVideo ? (
                <ActionButton
                  actions={actions}
                  id="video-replace"
                  label="替换视频"
                />
              ) : null}

              {capabilities.canDownloadMedia ? (
                <ActionButton
                  actions={actions}
                  icon="download"
                  id="download-original"
                  label="下载原视频"
                />
              ) : null}
            </>
          ) : null}`

  if (
    !input.includes(
      videoBlock,
    )
  ) {
    throw new Error(
      '没有找到视频操作区。',
    )
  }

  return input.replace(
    videoBlock,
    videoReplacement,
  )
}

function normalize(
  content,
) {
  return content.replaceAll(
    '\r\n',
    '\n',
  )
}