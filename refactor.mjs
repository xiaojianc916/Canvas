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

let source = (
  await readFile(
    filePath,
    'utf8',
  )
).replaceAll(
  '\r\n',
  '\n',
)

source = updateImports(source)
source = addGeoOptions(source)
source = addGeoStyleState(source)
source = addGeoSection(source)
source = addSelectionState(source)
source = extendSelectionActions(source)
source = replaceActionButton(source)

await writeFile(
  filePath,
  source.trimEnd() + '\n',
  'utf8',
)

console.log('')
console.log(
  '右侧属性侧边栏第三阶段已完成。',
)
console.log('')
console.log('新增：')
console.log('  - 官方几何形状图例')
console.log('  - 锁定与解锁')
console.log('  - 创建画框')
console.log('  - 适应画框内容')
console.log('  - 移除画框')
console.log('  - 替换图片/视频')
console.log('  - 下载媒体原文件')
console.log('')
console.log('验证：')
console.log('  pnpm format')
console.log('  pnpm lint')
console.log('  pnpm typecheck')
console.log('  pnpm test:architecture')
console.log('  pnpm build:desktop')
console.log('')

function updateImports(input) {
  if (
    !input.includes(
      'defaultGeoTypeDefinitions',
    )
  ) {
    input = input.replace(
      `  DefaultVerticalAlignStyle,
  getColorStyleItems,`,
      `  DefaultVerticalAlignStyle,
  defaultGeoTypeDefinitions,
  GeoShapeGeoStyle,
  getColorStyleItems,`,
    )
  }

  if (
    !input.includes(
      'type TLGeoShape,',
    )
  ) {
    input = input.replace(
      `  type TLDefaultColorStyle,
  type TLUiActionItem,`,
      `  type TLDefaultColorStyle,
  type TLGeoShape,
  type TLUiActionItem,`,
    )
  }

  return input
}

function addGeoOptions(input) {
  if (
    input.includes(
      'const geoOptions',
    )
  ) {
    return input
  }

  const marker =
    'export function PropertiesInspectorContent'

  const index =
    input.indexOf(marker)

  if (index < 0) {
    throw new Error(
      '没有找到 PropertiesInspectorContent。',
    )
  }

  const content = `const geoLabels:
  Partial<
    Record<
      TLGeoShape['props']['geo'],
      string
    >
  > = {
    rectangle: '矩形',
    ellipse: '椭圆',
    triangle: '三角形',
    diamond: '菱形',
    star: '星形',
    pentagon: '五边形',
    hexagon: '六边形',
    octagon: '八边形',
    rhombus: '平行四边形',
    'rhombus-2': '反向平行四边形',
    oval: '椭圆框',
    trapezoid: '梯形',
    'arrow-left': '左箭头',
    'arrow-up': '上箭头',
    'arrow-down': '下箭头',
    'arrow-right': '右箭头',
    cloud: '云形',
    'x-box': '叉号框',
    'check-box': '勾选框',
    heart: '心形',
  }

const geoOptions:
  readonly StyleOption<
    TLGeoShape['props']['geo']
  >[] =
  Object.entries(
    defaultGeoTypeDefinitions,
  ).map(
    ([
      value,
      definition,
    ]) => ({
      value:
        value as TLGeoShape['props']['geo'],
      icon:
        definition.icon as TLUiIconType,
      label:
        geoLabels[
          value as TLGeoShape['props']['geo']
        ] ?? value,
    }),
  )

`

  return (
    input.slice(
      0,
      index,
    ) +
    content +
    input.slice(
      index,
    )
  )
}

function addGeoStyleState(input) {
  if (
    input.includes(
      `styles.get(
      GeoShapeGeoStyle`,
    )
  ) {
    return input
  }

  const anchor = `  const arrowKind =
    styles.get(
      ArrowShapeKindStyle,
    )`

  if (
    !input.includes(anchor)
  ) {
    throw new Error(
      '没有找到 ArrowShapeKindStyle 状态。',
    )
  }

  return input.replace(
    anchor,
    `  const geo =
    styles.get(
      GeoShapeGeoStyle,
    )

${anchor}`,
  )
}

function addGeoSection(input) {
  if (
    input.includes(
      'title="形状类型"',
    )
  ) {
    return input
  }

  const anchor = `      {hasArrow ? (
        <SidebarSection
          title="线条与箭头"
        >`

  if (
    !input.includes(anchor)
  ) {
    throw new Error(
      '没有找到线条与箭头区。',
    )
  }

  const section = `      {geo ? (
        <SidebarSection
          title="形状类型"
        >
          <SidebarField
            mixed={
              geo.type === 'mixed'
            }
            title="图形"
          >
            <StyleControl
              options={geoOptions}
              style={GeoShapeGeoStyle}
              value={geo}
            />
          </SidebarField>
        </SidebarSection>
      ) : null}

`

  return input.replace(
    anchor,
    section + anchor,
  )
}

function addSelectionState(input) {
  if (
    input.includes(
      'selectionLockState',
    )
  ) {
    return input
  }

  const returnAnchor = `  return (
    <div className="hc-properties-sidebar__panel">`

  if (
    !input.includes(returnAnchor)
  ) {
    throw new Error(
      '没有找到 Properties Inspector 返回内容。',
    )
  }

  input = input.replace(
    returnAnchor,
    `  const selectionLockState =
    useValue(
      'right properties sidebar selection lock state',
      () => {
        const selected =
          editor.getSelectedShapes()

        if (
          selected.length === 0
        ) {
          return 'unlocked'
        }

        const lockedCount =
          selected.filter(
            (shape) =>
              shape.isLocked,
          ).length

        if (
          lockedCount === 0
        ) {
          return 'unlocked'
        }

        if (
          lockedCount ===
          selected.length
        ) {
          return 'locked'
        }

        return 'mixed'
      },
      [editor],
    )

${returnAnchor}`,
  )

  const propsAnchor = `          onlySelectedShapeType={
            onlySelectedShapeType
          }
          selectedShapeCount={`

  if (
    !input.includes(propsAnchor)
  ) {
    throw new Error(
      '没有找到 SelectionActions 属性。',
    )
  }

  return input.replace(
    propsAnchor,
    `          onlySelectedShapeType={
            onlySelectedShapeType
          }
          selectionLockState={
            selectionLockState
          }
          selectedShapeCount={`,
  )
}

function extendSelectionActions(input) {
  if (
    input.includes(
      'readonly selectionLockState',
    )
  ) {
    return input
  }

  input = input.replace(
    `interface SelectionActionsProps {
  readonly selectedShapeCount: number
  readonly onlySelectedShapeType:
    | string
    | null
}`,
    `interface SelectionActionsProps {
  readonly selectedShapeCount: number
  readonly onlySelectedShapeType:
    | string
    | null
  readonly selectionLockState:
    | 'locked'
    | 'unlocked'
    | 'mixed'
}`,
  )

  input = input.replace(
    `function SelectionActions({
  selectedShapeCount,
  onlySelectedShapeType,
}: SelectionActionsProps)`,
    `function SelectionActions({
  selectedShapeCount,
  onlySelectedShapeType,
  selectionLockState,
}: SelectionActionsProps)`,
  )

  const objectGridAnchor = `        <div className="hc-properties-sidebar__action-grid">
          {onlySelectedShapeType ===`

  if (
    !input.includes(
      objectGridAnchor,
    )
  ) {
    throw new Error(
      '没有找到对象操作网格。',
    )
  }

  input = input.replace(
    objectGridAnchor,
    `        <div className="hc-properties-sidebar__action-grid">
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

          {onlySelectedShapeType ===`,
  )

  const rotateAnchor = `          <ActionButton
            actions={actions}
            id="rotate-ccw"
            label="逆时针旋转"
          />`

  if (
    !input.includes(
      rotateAnchor,
    )
  ) {
    throw new Error(
      '没有找到旋转操作。',
    )
  }

  const contextualActions = `          {selectedShapeCount >= 2 ? (
            <ActionButton
              actions={actions}
              icon="tool-frame"
              id="frame-selection"
              label="创建画框"
            />
          ) : null}

          {onlySelectedShapeType ===
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
          ) : null}

          {onlySelectedShapeType ===
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
          ) : null}

          {onlySelectedShapeType ===
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
          ) : null}

`

  return input.replace(
    rotateAnchor,
    contextualActions +
      rotateAnchor,
  )
}

function replaceActionButton(input) {
  const pattern =
    /function ActionButton\(\{[\s\S]*?\n\}\n\nfunction getToolTitle/

  if (
    !pattern.test(input)
  ) {
    throw new Error(
      '没有找到 ActionButton。',
    )
  }

  return input.replace(
    pattern,
    `function ActionButton({
  actions,
  id,
  label,
  icon,
  destructive = false,
}: {
  readonly actions:
    ReturnType<typeof useActions>
  readonly id: string
  readonly label: string
  readonly icon?: TLUiIconType
  readonly destructive?: boolean
}) {
  const item:
    | TLUiActionItem
    | undefined =
    actions[id]

  if (!item) {
    return null
  }

  const resolvedIcon =
    icon ?? item.icon

  if (!resolvedIcon) {
    return null
  }

  return (
    <button
      aria-label={label}
      className={
        destructive
          ? 'hc-properties-sidebar__action hc-properties-sidebar__action--destructive'
          : 'hc-properties-sidebar__action'
      }
      onClick={() => {
        void item.onSelect(
          'toolbar',
        )
      }}
      title={label}
      type="button"
    >
      {typeof resolvedIcon ===
      'string' ? (
        <TldrawUiIcon
          icon={
            resolvedIcon as TLUiIconType
          }
          label={label}
        />
      ) : (
        resolvedIcon
      )}
    </button>
  )
}

function getToolTitle`,
  )
}