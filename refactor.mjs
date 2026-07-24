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

source = addCapabilityTypes(source)
source = addCropState(source)
source = addCapabilityValues(source)
source = passCropState(source)
source = addCropButton(source)
source = guardLockAction(source)
source = addCropButtonComponent(source)

await writeFile(
  filePath,
  source.trimEnd() + '\n',
  'utf8',
)

console.log('')
console.log(
  '官方图片裁剪能力已接入右侧属性侧边栏。',
)
console.log('')
console.log('新增：')
console.log('  - 进入裁剪')
console.log('  - 完成裁剪')
console.log('  - 官方 crop 图标')
console.log('  - 官方 select.crop 状态')
console.log(
  '  - 媒体 assetId 下载判断',
)
console.log(
  '  - 只读模式锁定操作判断',
)
console.log('')
console.log('验证：')
console.log('  pnpm format')
console.log('  pnpm lint')
console.log('  pnpm typecheck')
console.log(
  '  pnpm test:architecture',
)
console.log('  pnpm build:desktop')
console.log('')

function addCapabilityTypes(
  input,
) {
  if (
    input.includes(
      'readonly canCropImage:',
    )
  ) {
    return input
  }

  input = replaceRequired(
    input,
    `  readonly canDownloadMedia: boolean
  readonly canReorder: boolean`,
    `  readonly canDownloadMedia: boolean
  readonly canCropImage: boolean
  readonly canToggleLock: boolean
  readonly canReorder: boolean`,
    'SelectionCapabilities',
  )

  return input
}

function addCropState(
  input,
) {
  if (
    input.includes(
      'right properties sidebar image crop state',
    )
  ) {
    return input
  }

  const anchor = `  const selectionLockState = useValue('right properties sidebar selection lock state', () => {`

  const state = `  const isCroppingImage = useValue(
    'right properties sidebar image crop state',
    () => editor.isIn('select.crop.'),
    [editor],
  )

`

  return replaceRequired(
    input,
    anchor,
    state + anchor,
    'crop state',
  )
}

function addCapabilityValues(
  input,
) {
  if (
    input.includes(
      'const onlySelectedHasMediaAsset',
    )
  ) {
    return input
  }

  const urlAnchor = `      const onlySelectedHasUrl =
        onlySelected !== null &&
        onlySelected !== undefined &&
        'url' in onlySelected.props &&
        typeof onlySelected.props.url === 'string'`

  const expandedState = `${urlAnchor}

      const onlySelectedHasMediaAsset =
        onlySelected !== null &&
        onlySelected !== undefined &&
        'assetId' in onlySelected.props &&
        onlySelected.props.assetId !== null &&
        onlySelected.props.assetId !== undefined`

  input = replaceRequired(
    input,
    urlAnchor,
    expandedState,
    'media asset state',
  )

  input = replaceRequired(
    input,
    `        canDownloadMedia: onlySelectedIsImage || onlySelectedIsVideo,

        canReorder:`,
    `        canDownloadMedia:
          (onlySelectedIsImage || onlySelectedIsVideo) &&
          onlySelectedHasMediaAsset,

        canCropImage:
          !readonly &&
          onlySelectedIsUnlocked &&
          onlySelectedIsImage,

        canToggleLock:
          !readonly &&
          selected.length > 0,

        canReorder:`,
    'capability result',
  )

  return input
}

function passCropState(
  input,
) {
  if (
    input.includes(
      'isCroppingImage={isCroppingImage}',
    )
  ) {
    return input
  }

  input = replaceRequired(
    input,
    `          capabilities={selectionCapabilities}
          onlySelectedShapeType={onlySelectedShapeType}`,
    `          capabilities={selectionCapabilities}
          isCroppingImage={isCroppingImage}
          onlySelectedShapeType={onlySelectedShapeType}`,
    'SelectionActions call',
  )

  input = replaceRequired(
    input,
    `interface SelectionActionsProps {
  readonly capabilities: SelectionCapabilities`,
    `interface SelectionActionsProps {
  readonly capabilities: SelectionCapabilities
  readonly isCroppingImage: boolean`,
    'SelectionActionsProps',
  )

  input = replaceRequired(
    input,
    `function SelectionActions({
  capabilities,
  selectedShapeCount,`,
    `function SelectionActions({
  capabilities,
  isCroppingImage,
  selectedShapeCount,`,
    'SelectionActions arguments',
  )

  return input
}

function addCropButton(
  input,
) {
  if (
    input.includes(
      '<CropImageButton',
    )
  ) {
    return input
  }

  const imageAnchor = `          {capabilities.canReplaceImage ||
          (onlySelectedShapeType === 'image' && capabilities.canDownloadMedia) ? (`

  const cropButton = `          {capabilities.canCropImage ? (
            <CropImageButton
              active={isCroppingImage}
            />
          ) : null}

`

  return replaceRequired(
    input,
    imageAnchor,
    cropButton +
      imageAnchor,
    'image actions',
  )
}

function guardLockAction(
  input,
) {
  if (
    input.includes(
      '{capabilities.canToggleLock ? (',
    )
  ) {
    return input
  }

  const lockBlock = `          <ActionButton
            actions={actions}
            icon={selectionLockState === 'locked' ? 'unlock' : 'lock'}
            id="toggle-lock"
            label={
              selectionLockState === 'locked'
                ? '解锁'
                : selectionLockState === 'mixed'
                  ? '统一锁定'
                  : '锁定'
            }
          />`

  const guardedLock = `          {capabilities.canToggleLock ? (
            <ActionButton
              actions={actions}
              icon={
                selectionLockState ===
                'locked'
                  ? 'unlock'
                  : 'lock'
              }
              id="toggle-lock"
              label={
                selectionLockState ===
                'locked'
                  ? '解锁'
                  : selectionLockState ===
                      'mixed'
                    ? '统一锁定'
                    : '锁定'
              }
            />
          ) : null}`

  return replaceRequired(
    input,
    lockBlock,
    guardedLock,
    'lock action',
  )
}

function addCropButtonComponent(
  input,
) {
  if (
    input.includes(
      'function CropImageButton(',
    )
  ) {
    return input
  }

  const anchor = `function ActionButton({`

  const component = `function CropImageButton({
  active,
}: {
  readonly active: boolean
}) {
  const editor = useEditor()

  const label =
    active
      ? '完成裁剪'
      : '裁剪图片'

  return (
    <TldrawUiTooltip
      content={label}
      side="left"
      sideOffset={8}
    >
      <button
        aria-label={label}
        aria-pressed={active}
        className="hc-properties-sidebar__action"
        onClick={() => {
          if (active) {
            editor.setCroppingShape(
              null,
            )

            editor.setCurrentTool(
              'select.idle',
            )

            return
          }

          editor.setCurrentTool(
            'select.crop.idle',
          )
        }}
        type="button"
      >
        <TldrawUiIcon
          icon={
            active
              ? 'check'
              : 'crop'
          }
          label={label}
        />
      </button>
    </TldrawUiTooltip>
  )
}

`

  return replaceRequired(
    input,
    anchor,
    component + anchor,
    'CropImageButton component',
  )
}

function replaceRequired(
  input,
  oldValue,
  newValue,
  owner,
) {
  if (
    !input.includes(oldValue)
  ) {
    throw new Error(
      '没有找到修改位置：' +
        owner,
    )
  }

  return input.replace(
    oldValue,
    newValue,
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