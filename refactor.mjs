#!/usr/bin/env node

import {
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

const contentPath = path.join(
  root,
  'editor/core/src/react/PropertiesInspectorContent.tsx',
)

const cssPath = path.join(
  root,
  'apps/desktop/src/app.css',
)

const CSS_MARKER =
  '/* hybrid-canvas:properties-sidebar-v4 */'

let source = normalize(
  await readFile(
    contentPath,
    'utf8',
  ),
)

source = addTooltipImport(source)
source = addCapabilityType(source)
source = addCapabilityState(source)
source = passCapabilities(source)
source = updateSelectionActions(source)
source = replaceActionButton(source)
source = wrapStyleButtons(source)
source = wrapColorButtons(source)
source = wrapOpacityButtons(source)

await write(
  contentPath,
  source,
)

await updateCss()

console.log('')
console.log(
  '右侧属性侧边栏第四阶段已完成。',
)
console.log('')
console.log('新增：')
console.log('  - 官方 Tooltip')
console.log('  - ShapeUtil 能力判断')
console.log('  - 锁定对象操作限制')
console.log('  - 只读模式操作限制')
console.log('  - Mixed 统一视觉')
console.log('')
console.log('验证：')
console.log('  pnpm format')
console.log('  pnpm lint')
console.log('  pnpm typecheck')
console.log('  pnpm test:architecture')
console.log('  pnpm build:desktop')
console.log('')

function addTooltipImport(input) {
  if (
    input.includes(
      'TldrawUiTooltip,',
    )
  ) {
    return input
  }

  const anchor = `  TldrawUiIcon,
  type TLDefaultColorStyle,`

  if (
    !input.includes(anchor)
  ) {
    throw new Error(
      '没有找到 TldrawUiIcon 导入。',
    )
  }

  return input.replace(
    anchor,
    `  TldrawUiIcon,
  TldrawUiTooltip,
  type TLDefaultColorStyle,`,
  )
}

function addCapabilityType(input) {
  if (
    input.includes(
      'interface SelectionCapabilities',
    )
  ) {
    return input
  }

  const marker =
    'export interface PropertiesInspectorContentProps'

  const index =
    input.indexOf(marker)

  if (index < 0) {
    throw new Error(
      '没有找到 PropertiesInspectorContentProps。',
    )
  }

  const type = `interface SelectionCapabilities {
  readonly canAlign: boolean
  readonly canDistribute: boolean
  readonly canReorder: boolean
  readonly canGroup: boolean
  readonly canUngroup: boolean
  readonly canRotate: boolean
  readonly canFrame: boolean
  readonly canDuplicate: boolean
  readonly canDelete: boolean
}

`

  return (
    input.slice(
      0,
      index,
    ) +
    type +
    input.slice(
      index,
    )
  )
}

function addCapabilityState(input) {
  if (
    input.includes(
      'right properties sidebar selection capabilities',
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
      '没有找到侧边栏返回内容。',
    )
  }

  const capabilityState = `  const selectionCapabilities =
    useValue<SelectionCapabilities>(
      'right properties sidebar selection capabilities',
      () => {
        const selected =
          editor.getSelectedShapes()

        const readonly =
          editor.getIsReadonly()

        const unlocked =
          selected.filter(
            (shape) =>
              !shape.isLocked,
          )

        const alignable =
          unlocked.filter(
            (shape) =>
              editor
                .getShapeUtil(shape)
                .canBeLaidOut(
                  shape,
                  {
                    type: 'align',
                    shapes: unlocked,
                  },
                ),
          )

        const distributable =
          unlocked.filter(
            (shape) =>
              editor
                .getShapeUtil(shape)
                .canBeLaidOut(
                  shape,
                  {
                    type: 'distribute',
                    shapes: unlocked,
                  },
                ),
          )

        const rotatable =
          unlocked.filter(
            (shape) =>
              !editor
                .getShapeUtil(shape)
                .hideRotateHandle(
                  shape,
                ),
          )

        const onlySelected =
          editor.getOnlySelectedShape()

        return {
          canAlign:
            !readonly &&
            alignable.length >= 2,

          canDistribute:
            !readonly &&
            distributable.length >= 3,

          canReorder:
            !readonly &&
            unlocked.length > 0,

          canGroup:
            !readonly &&
            unlocked.length >= 2,

          canUngroup:
            !readonly &&
            onlySelected?.type ===
              'group' &&
            !onlySelected.isLocked,

          canRotate:
            !readonly &&
            unlocked.length > 0 &&
            rotatable.length ===
              unlocked.length,

          canFrame:
            !readonly &&
            unlocked.length >= 2,

          canDuplicate:
            !readonly &&
            selected.length > 0,

          canDelete:
            !readonly &&
            unlocked.length > 0,
        }
      },
      [editor],
    )

`

  return input.replace(
    returnAnchor,
    capabilityState +
      returnAnchor,
  )
}

function passCapabilities(input) {
  if (
    input.includes(
      `capabilities={
            selectionCapabilities
          }`,
    )
  ) {
    return input
  }

  const anchor = `        <SelectionActions
          onlySelectedShapeType={`

  if (
    !input.includes(anchor)
  ) {
    throw new Error(
      '没有找到 SelectionActions。',
    )
  }

  return input.replace(
    anchor,
    `        <SelectionActions
          capabilities={
            selectionCapabilities
          }
          onlySelectedShapeType={`,
  )
}

function updateSelectionActions(input) {
  if (
    input.includes(
      'readonly capabilities:',
    )
  ) {
    return input
  }

  input = input.replace(
    `interface SelectionActionsProps {
  readonly selectedShapeCount: number`,
    `interface SelectionActionsProps {
  readonly capabilities:
    SelectionCapabilities
  readonly selectedShapeCount: number`,
  )

  input = input.replace(
    `function SelectionActions({
  selectedShapeCount,`,
    `function SelectionActions({
  capabilities,
  selectedShapeCount,`,
  )

  input = input.replace(
    `{selectedShapeCount >= 2 ? (
        <SidebarSection
          title="排列"`,
    `{capabilities.canAlign ? (
        <SidebarSection
          title="排列"`,
  )

  input = input.replace(
    `{selectedShapeCount >= 3 ? (`,
    `{capabilities.canDistribute ? (`,
  )

  input = input.replace(
    `      <SidebarSection
        title="层级"
      >
        <div className="hc-properties-sidebar__action-grid">`,
    `      {capabilities.canReorder ? (
        <SidebarSection
          title="层级"
        >
          <div className="hc-properties-sidebar__action-grid">`,
  )

  const layerEnd = `          <ActionButton
            actions={actions}
            id="send-to-back"
            label="置于底层"
          />
        </div>
      </SidebarSection>`

  if (
    !input.includes(layerEnd)
  ) {
    throw new Error(
      '没有找到层级操作区结尾。',
    )
  }

  input = input.replace(
    layerEnd,
    `          <ActionButton
            actions={actions}
            id="send-to-back"
            label="置于底层"
          />
          </div>
        </SidebarSection>
      ) : null}`,
  )

  input = input.replace(
    `{onlySelectedShapeType ===
          'group' ? (`,
    `{capabilities.canUngroup ? (`,
  )

  input = input.replace(
    `) : selectedShapeCount >=
            2 ? (`,
    `) : capabilities.canGroup ? (`,
  )

  input = input.replace(
    `{selectedShapeCount >= 2 ? (
            <ActionButton
              actions={actions}
              icon="tool-frame"`,
    `{capabilities.canFrame ? (
            <ActionButton
              actions={actions}
              icon="tool-frame"`,
  )

  const rotateButtons = `          <ActionButton
            actions={actions}
            id="rotate-ccw"
            label="逆时针旋转"
          />

          <ActionButton
            actions={actions}
            id="rotate-cw"
            label="顺时针旋转"
          />`

  if (
    !input.includes(
      rotateButtons,
    )
  ) {
    throw new Error(
      '没有找到旋转按钮。',
    )
  }

  input = input.replace(
    rotateButtons,
    `          {capabilities.canRotate ? (
            <>
              <ActionButton
                actions={actions}
                id="rotate-ccw"
                label="逆时针旋转"
              />

              <ActionButton
                actions={actions}
                id="rotate-cw"
                label="顺时针旋转"
              />
            </>
          ) : null}`,
  )

  const duplicateButton = `          <ActionButton
            actions={actions}
            id="duplicate"
            label="创建副本"
          />`

  input = input.replace(
    duplicateButton,
    `          {capabilities.canDuplicate ? (
            <ActionButton
              actions={actions}
              id="duplicate"
              label="创建副本"
            />
          ) : null}`,
  )

  const deleteButton = `          <ActionButton
            actions={actions}
            destructive
            id="delete"
            label="删除"
          />`

  input = input.replace(
    deleteButton,
    `          {capabilities.canDelete ? (
            <ActionButton
              actions={actions}
              destructive
              id="delete"
              label="删除"
            />
          ) : null}`,
  )

  return input
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
    <TldrawUiTooltip
      content={label}
      side="left"
      sideOffset={8}
    >
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
    </TldrawUiTooltip>
  )
}

function getToolTitle`,
  )
}

function wrapStyleButtons(input) {
  if (
    input.includes(
      `content={
                option.label
              }
              side="left"`,
    )
  ) {
    return input
  }

  const oldCode = `          return (
            <button
              aria-label={
                option.label
              }
              aria-pressed={
                active
              }
              className="hc-properties-sidebar__segment"
              key={
                option.value
              }
              onClick={() => {
                styleContext.onHistoryMark(
                  'change ' +
                    style.id,
                )

                styleContext.onValueChange(
                  style,
                  option.value,
                )
              }}
              title={
                option.label
              }
              type="button"
            >
              <TldrawUiIcon
                icon={
                  option.icon
                }
                label={
                  option.label
                }
              />
            </button>
          )`

  const newCode = `          return (
            <TldrawUiTooltip
              content={
                option.label
              }
              key={
                option.value
              }
              side="left"
              sideOffset={8}
            >
              <button
                aria-label={
                  option.label
                }
                aria-pressed={
                  active
                }
                className="hc-properties-sidebar__segment"
                onClick={() => {
                  styleContext.onHistoryMark(
                    'change ' +
                      style.id,
                  )

                  styleContext.onValueChange(
                    style,
                    option.value,
                  )
                }}
                type="button"
              >
                <TldrawUiIcon
                  icon={
                    option.icon
                  }
                  label={
                    option.label
                  }
                />
              </button>
            </TldrawUiTooltip>
          )`

  if (
    !input.includes(oldCode)
  ) {
    throw new Error(
      '没有找到 StyleControl 按钮。',
    )
  }

  return input.replace(
    oldCode,
    newCode,
  )
}

function wrapColorButtons(input) {
  if (
    input.includes(
      `content={label}
            key={item.value}
            side="left"`,
    )
  ) {
    return input
  }

  const oldCode = `        return (
          <button
            aria-label={label}
            aria-pressed={active}
            className="hc-properties-sidebar__color-button"
            key={item.value}
            onClick={() => {
              styleContext.onHistoryMark(
                'change color',
              )

              styleContext.onValueChange(
                DefaultColorStyle,
                colorValue,
              )
            }}
            style={{
              '--hc-swatch-color':
                getColorValue(
                  colors,
                  colorValue,
                  'solid',
                ),
            } as React.CSSProperties}
            title={label}
            type="button"
          >
            <TldrawUiIcon
              icon="color"
              label={label}
            />
          </button>
        )`

  const newCode = `        return (
          <TldrawUiTooltip
            content={label}
            key={item.value}
            side="left"
            sideOffset={8}
          >
            <button
              aria-label={label}
              aria-pressed={active}
              className="hc-properties-sidebar__color-button"
              onClick={() => {
                styleContext.onHistoryMark(
                  'change color',
                )

                styleContext.onValueChange(
                  DefaultColorStyle,
                  colorValue,
                )
              }}
              style={{
                '--hc-swatch-color':
                  getColorValue(
                    colors,
                    colorValue,
                    'solid',
                  ),
              } as React.CSSProperties}
              type="button"
            >
              <TldrawUiIcon
                icon="color"
                label={label}
              />
            </button>
          </TldrawUiTooltip>
        )`

  if (
    !input.includes(oldCode)
  ) {
    throw new Error(
      '没有找到颜色按钮。',
    )
  }

  return input.replace(
    oldCode,
    newCode,
  )
}

function wrapOpacityButtons(input) {
  if (
    input.includes(
      `content={
                '透明度 ' +
                option.label
              }`,
    )
  ) {
    return input
  }

  const oldCode = `          return (
            <button
              aria-label={
                '透明度 ' +
                option.label
              }
              aria-pressed={
                active
              }
              className="hc-properties-sidebar__opacity-option"
              key={
                option.value
              }
              onClick={() => {
                styleContext.onHistoryMark(
                  'change opacity',
                )

                styleContext.onOpacityChange(
                  option.value,
                )
              }}
              title={
                '透明度 ' +
                option.label
              }
              type="button"
            >
              {option.label}
            </button>
          )`

  const newCode = `          return (
            <TldrawUiTooltip
              content={
                '透明度 ' +
                option.label
              }
              key={
                option.value
              }
              side="left"
              sideOffset={8}
            >
              <button
                aria-label={
                  '透明度 ' +
                  option.label
                }
                aria-pressed={
                  active
                }
                className="hc-properties-sidebar__opacity-option"
                onClick={() => {
                  styleContext.onHistoryMark(
                    'change opacity',
                  )

                  styleContext.onOpacityChange(
                    option.value,
                  )
                }}
                type="button"
              >
                {option.label}
              </button>
            </TldrawUiTooltip>
          )`

  if (
    !input.includes(oldCode)
  ) {
    throw new Error(
      '没有找到透明度按钮。',
    )
  }

  return input.replace(
    oldCode,
    newCode,
  )
}

async function updateCss() {
  let css = normalize(
    await readFile(
      cssPath,
      'utf8',
    ),
  )

  const markerIndex =
    css.indexOf(
      CSS_MARKER,
    )

  if (markerIndex >= 0) {
    css = css
      .slice(
        0,
        markerIndex,
      )
      .trimEnd()
  }

  css += `

${CSS_MARKER}

/*
 * Mixed 值不伪装成普通未选中状态。
 */
.hc-properties-sidebar__segmented[data-mixed],
.hc-properties-sidebar__opacity[data-mixed] {
  border-style: dashed;
  border-color:
    color-mix(
      in oklab,
      var(--color-primary) 40%,
      transparent
    );
}

.hc-properties-sidebar__color-grid[data-mixed] {
  position: relative;
  padding: 5px;
  border: 1px dashed
    color-mix(
      in oklab,
      var(--color-primary) 40%,
      transparent
    );
  border-radius: 8px;
}

.hc-properties-sidebar__color-grid[data-mixed]::after {
  position: absolute;
  top: -7px;
  right: 6px;
  display: grid;
  width: 14px;
  height: 14px;
  place-items: center;
  border-radius: 4px;
  background: var(--color-sidebar);
  color:
    color-mix(
      in oklab,
      var(--color-foreground) 58%,
      transparent
    );
  content: "—";
  font-size: 11px;
  font-weight: 600;
}

/*
 * Tooltip 接管可见标签后，不依赖浏览器 title。
 */
.hc-properties-sidebar__action,
.hc-properties-sidebar__segment,
.hc-properties-sidebar__color-button,
.hc-properties-sidebar__opacity-option {
  -webkit-tap-highlight-color: transparent;
}
`

  await write(
    cssPath,
    css,
  )
}

async function write(
  filePath,
  content,
) {
  await writeFile(
    filePath,
    normalize(
      content,
    ).trimEnd() + '\n',
    'utf8',
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