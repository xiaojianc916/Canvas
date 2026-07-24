#!/usr/bin/env node

import {
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

const files = {
  portal: resolve(
    'editor/core/src/react/canvas-inspector-portal.tsx',
  ),

  content: resolve(
    'editor/core/src/react/PropertiesInspectorContent.tsx',
  ),

  publicApi: resolve(
    'editor/core/src/react/public-api.ts',
  ),

  workspace: resolve(
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  ),

  css: resolve(
    'apps/desktop/src/app.css',
  ),
}

const CSS_MARKER =
  '/* hybrid-canvas:properties-inspector-v1 */'

await assertRepository()

await write(
  files.content,
  createSidebarContent(),
)

await transformPortal()
await renameSidebarSurface()
await transformCss()

console.log('')
console.log(
  '右侧属性侧边栏已重构。',
)
console.log('')
console.log('执行：')
console.log('  pnpm format')
console.log('  pnpm lint')
console.log('  pnpm typecheck')
console.log('  pnpm test:architecture')
console.log('  pnpm build:desktop')
console.log('')

function createSidebarContent() {
  return `import {
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultFontStyle,
  DefaultSizeStyle,
  DefaultTextAlignStyle,
  getColorStyleItems,
  getColorValue,
  type ReadonlySharedStyleMap,
  type SharedStyle,
  type StyleProp,
  TldrawUiIcon,
  type TLDefaultColorStyle,
  type TLUiActionItem,
  type TLUiIconType,
  useActions,
  useEditor,
  useStylePanelContext,
  useValue,
} from 'tldraw'
import type {
  ReactNode,
} from 'react'

export interface PropertiesInspectorContentProps {
  readonly styles:
    | ReadonlySharedStyleMap
    | null
  readonly selectedShapeCount: number
}

interface StyleOption<
  TValue extends string,
> {
  readonly value: TValue
  readonly icon: TLUiIconType
  readonly label: string
}

const fillOptions = [
  {
    value: 'none',
    icon: 'fill-none',
    label: '无填充',
  },
  {
    value: 'semi',
    icon: 'fill-semi',
    label: '半透明',
  },
  {
    value: 'solid',
    icon: 'fill-solid',
    label: '实色',
  },
  {
    value: 'pattern',
    icon: 'fill-pattern',
    label: '图案',
  },
] as const

const dashOptions = [
  {
    value: 'draw',
    icon: 'dash-draw',
    label: '手绘',
  },
  {
    value: 'solid',
    icon: 'dash-solid',
    label: '实线',
  },
  {
    value: 'dashed',
    icon: 'dash-dashed',
    label: '虚线',
  },
  {
    value: 'dotted',
    icon: 'dash-dotted',
    label: '点线',
  },
] as const

const sizeOptions = [
  {
    value: 's',
    icon: 'size-small',
    label: '小',
  },
  {
    value: 'm',
    icon: 'size-medium',
    label: '中',
  },
  {
    value: 'l',
    icon: 'size-large',
    label: '大',
  },
  {
    value: 'xl',
    icon: 'size-extra-large',
    label: '特大',
  },
] as const

const fontOptions = [
  {
    value: 'draw',
    icon: 'font-draw',
    label: '手写',
  },
  {
    value: 'sans',
    icon: 'font-sans',
    label: '无衬线',
  },
  {
    value: 'serif',
    icon: 'font-serif',
    label: '衬线',
  },
  {
    value: 'mono',
    icon: 'font-mono',
    label: '等宽',
  },
] as const

const textAlignOptions = [
  {
    value: 'start',
    icon: 'text-align-left',
    label: '左对齐',
  },
  {
    value: 'middle',
    icon: 'text-align-center',
    label: '居中',
  },
  {
    value: 'end',
    icon: 'text-align-right',
    label: '右对齐',
  },
] as const

export function PropertiesInspectorContent({
  styles,
  selectedShapeCount,
}: PropertiesInspectorContentProps) {
  const editor = useEditor()

  const title =
    useValue(
      'right properties sidebar title',
      () => {
        const selected =
          editor.getSelectedShapes()

        if (selected.length > 1) {
          return (
            String(selected.length) +
            ' 个对象'
          )
        }

        if (selected.length === 1) {
          return getShapeTitle(
            selected[0]?.type,
          )
        }

        return getToolTitle(
          editor.getCurrentToolId(),
        )
      },
      [editor],
    )

  const onlySelectedShapeType =
    useValue(
      'right properties sidebar selected shape type',
      () =>
        editor
          .getOnlySelectedShape()
          ?.type ?? null,
      [editor],
    )

  return (
    <div className="hc-properties-sidebar__panel">
      <header className="hc-properties-sidebar__header">
        <span className="hc-properties-sidebar__title">
          {title}
        </span>
      </header>

      {styles ? (
        <StyleSections
          styles={styles}
        />
      ) : null}

      {selectedShapeCount > 0 ? (
        <SelectionActions
          onlySelectedShapeType={
            onlySelectedShapeType
          }
          selectedShapeCount={
            selectedShapeCount
          }
        />
      ) : null}
    </div>
  )
}

function StyleSections({
  styles,
}: {
  readonly styles:
    ReadonlySharedStyleMap
}) {
  const color =
    styles.get(
      DefaultColorStyle,
    )

  const fill =
    styles.get(
      DefaultFillStyle,
    )

  const dash =
    styles.get(
      DefaultDashStyle,
    )

  const size =
    styles.get(
      DefaultSizeStyle,
    )

  const font =
    styles.get(
      DefaultFontStyle,
    )

  const textAlign =
    styles.get(
      DefaultTextAlignStyle,
    )

  return (
    <>
      {color ? (
        <SidebarSection
          title="颜色"
        >
          <ColorControl
            value={color}
          />
        </SidebarSection>
      ) : null}

      {fill ||
      dash ||
      size ? (
        <SidebarSection
          title="样式"
        >
          {fill ? (
            <SidebarField
              mixed={
                fill.type === 'mixed'
              }
              title="填充"
            >
              <StyleControl
                options={fillOptions}
                style={DefaultFillStyle}
                value={fill}
              />
            </SidebarField>
          ) : null}

          {dash ? (
            <SidebarField
              mixed={
                dash.type === 'mixed'
              }
              title="线条"
            >
              <StyleControl
                options={dashOptions}
                style={DefaultDashStyle}
                value={dash}
              />
            </SidebarField>
          ) : null}

          {size ? (
            <SidebarField
              mixed={
                size.type === 'mixed'
              }
              title="粗细"
            >
              <StyleControl
                options={sizeOptions}
                style={DefaultSizeStyle}
                value={size}
              />
            </SidebarField>
          ) : null}
        </SidebarSection>
      ) : null}

      {font ||
      textAlign ? (
        <SidebarSection
          title="文本"
        >
          {font ? (
            <SidebarField
              mixed={
                font.type === 'mixed'
              }
              title="字体"
            >
              <StyleControl
                options={fontOptions}
                style={DefaultFontStyle}
                value={font}
              />
            </SidebarField>
          ) : null}

          {textAlign ? (
            <SidebarField
              mixed={
                textAlign.type ===
                'mixed'
              }
              title="对齐"
            >
              <StyleControl
                options={
                  textAlignOptions
                }
                style={
                  DefaultTextAlignStyle
                }
                value={textAlign}
              />
            </SidebarField>
          ) : null}
        </SidebarSection>
      ) : null}
    </>
  )
}

function ColorControl({
  value,
}: {
  readonly value:
    SharedStyle<TLDefaultColorStyle>
}) {
  const editor = useEditor()
  const styleContext =
    useStylePanelContext()

  const colors =
    useValue(
      'right properties sidebar colors',
      () =>
        editor
          .getCurrentTheme()
          .colors[
            editor.getColorMode()
          ],
      [editor],
    )

  const items =
    getColorStyleItems(
      colors,
    )

  return (
    <div
      aria-label="颜色"
      className="hc-properties-sidebar__color-grid"
      data-mixed={
        value.type === 'mixed'
          ? ''
          : undefined
      }
      role="group"
    >
      {items.map((item) => {
        const colorValue =
          item.value as TLDefaultColorStyle

        const active =
          value.type === 'shared' &&
          value.value === colorValue

        const label =
          '颜色 — ' +
          getColorLabel(
            colorValue,
          )

        return (
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
        )
      })}
    </div>
  )
}

interface StyleControlProps<
  TValue extends string,
> {
  readonly style:
    StyleProp<TValue>
  readonly value:
    SharedStyle<TValue>
  readonly options:
    readonly StyleOption<TValue>[]
}

function StyleControl<
  TValue extends string,
>({
  style,
  value,
  options,
}: StyleControlProps<TValue>) {
  const styleContext =
    useStylePanelContext()

  return (
    <div
      className="hc-properties-sidebar__segmented"
      data-mixed={
        value.type === 'mixed'
          ? ''
          : undefined
      }
      role="group"
    >
      {options.map(
        (option) => {
          const active =
            value.type ===
              'shared' &&
            value.value ===
              option.value

          return (
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
          )
        },
      )}
    </div>
  )
}

interface SidebarSectionProps {
  readonly title: string
  readonly children: ReactNode
}

function SidebarSection({
  title,
  children,
}: SidebarSectionProps) {
  return (
    <section className="hc-properties-sidebar__section">
      <h2 className="hc-properties-sidebar__section-title">
        {title}
      </h2>

      <div className="hc-properties-sidebar__section-content">
        {children}
      </div>
    </section>
  )
}

interface SidebarFieldProps {
  readonly title: string
  readonly mixed: boolean
  readonly children: ReactNode
}

function SidebarField({
  title,
  mixed,
  children,
}: SidebarFieldProps) {
  return (
    <div className="hc-properties-sidebar__field">
      <div className="hc-properties-sidebar__field-header">
        <span>
          {title}
        </span>

        {mixed ? (
          <span
            aria-label="多个值"
            className="hc-properties-sidebar__mixed"
            title="多个值"
          >
            —
          </span>
        ) : null}
      </div>

      {children}
    </div>
  )
}

interface SelectionActionsProps {
  readonly selectedShapeCount: number
  readonly onlySelectedShapeType:
    | string
    | null
}

function SelectionActions({
  selectedShapeCount,
  onlySelectedShapeType,
}: SelectionActionsProps) {
  const actions =
    useActions()

  return (
    <>
      {selectedShapeCount >= 2 ? (
        <SidebarSection
          title="排列"
        >
          <div className="hc-properties-sidebar__action-grid">
            <ActionButton
              actions={actions}
              id="align-left"
              label="左对齐"
            />

            <ActionButton
              actions={actions}
              id="align-center-horizontal"
              label="水平居中"
            />

            <ActionButton
              actions={actions}
              id="align-right"
              label="右对齐"
            />

            <ActionButton
              actions={actions}
              id="align-top"
              label="顶部对齐"
            />

            <ActionButton
              actions={actions}
              id="align-center-vertical"
              label="垂直居中"
            />

            <ActionButton
              actions={actions}
              id="align-bottom"
              label="底部对齐"
            />

            {selectedShapeCount >= 3 ? (
              <>
                <ActionButton
                  actions={actions}
                  id="distribute-horizontal"
                  label="水平分布"
                />

                <ActionButton
                  actions={actions}
                  id="distribute-vertical"
                  label="垂直分布"
                />
              </>
            ) : null}
          </div>
        </SidebarSection>
      ) : null}

      <SidebarSection
        title="对象"
      >
        <div className="hc-properties-sidebar__action-grid">
          {onlySelectedShapeType ===
          'group' ? (
            <ActionButton
              actions={actions}
              id="ungroup"
              label="取消编组"
            />
          ) : selectedShapeCount >=
            2 ? (
            <ActionButton
              actions={actions}
              id="group"
              label="编组"
            />
          ) : null}

          <ActionButton
            actions={actions}
            id="duplicate"
            label="创建副本"
          />

          <ActionButton
            actions={actions}
            destructive
            id="delete"
            label="删除"
          />
        </div>
      </SidebarSection>
    </>
  )
}

function ActionButton({
  actions,
  id,
  label,
  destructive = false,
}: {
  readonly actions:
    ReturnType<typeof useActions>
  readonly id: string
  readonly label: string
  readonly destructive?: boolean
}) {
  const item:
    | TLUiActionItem
    | undefined =
    actions[id]

  if (
    !item ||
    !item.icon
  ) {
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
      <TldrawUiIcon
        icon={item.icon}
        label={label}
      />
    </button>
  )
}

function getToolTitle(
  toolId: string,
): string {
  const titles:
    Record<string, string> = {
      draw: '画笔',
      geo: '形状',
      arrow: '箭头',
      text: '文本',
      note: '便签',
      line: '线条',
      highlight: '高亮',
    }

  return (
    titles[toolId] ??
    '属性'
  )
}

function getShapeTitle(
  shapeType:
    | string
    | undefined,
): string {
  const titles:
    Record<string, string> = {
      geo: '形状',
      draw: '画笔',
      arrow: '箭头',
      text: '文本',
      note: '便签',
      line: '线条',
      highlight: '高亮',
      frame: '画框',
      image: '图片',
      video: '视频',
      group: '编组',
    }

  return shapeType
    ? titles[shapeType] ??
        '对象'
    : '对象'
}

function getColorLabel(
  color: TLDefaultColorStyle,
): string {
  const labels:
    Partial<
      Record<
        TLDefaultColorStyle,
        string
      >
    > = {
      black: '黑色',
      grey: '灰色',
      violet: '紫色',
      blue: '蓝色',
      'light-blue': '浅蓝色',
      yellow: '黄色',
      orange: '橙色',
      green: '绿色',
      'light-green': '浅绿色',
      red: '红色',
      'light-red': '浅红色',
    }

  return (
    labels[color] ??
    color
  )
}
`
}

async function transformPortal() {
  let source = normalize(
    await readFile(
      files.portal,
      'utf8',
    ),
  )

  source = source.replace(
    'DefaultStylePanel,',
    'StylePanelContextProvider,',
  )

  source = source.replaceAll(
    'CanvasInspectorDock',
    'CanvasInspectorRightSidebar',
  )

  source = source.replaceAll(
    'hc-properties-inspector-dock',
    'hc-properties-sidebar',
  )

  source = source.replace(
    /<DefaultStylePanel\s+isMobile=\{false\}\s+styles=\{styles\}\s*>/,
    `<StylePanelContextProvider
        styles={styles}
      >`,
  )

  source = source.replace(
    '</DefaultStylePanel>',
    '</StylePanelContextProvider>',
  )

  if (
    source.includes(
      'DefaultStylePanel',
    )
  ) {
    throw new Error(
      'DefaultStylePanel 未完全移除。',
    )
  }

  if (
    !source.includes(
      'StylePanelContextProvider',
    )
  ) {
    throw new Error(
      'StylePanelContextProvider 未接入。',
    )
  }

  await write(
    files.portal,
    source,
  )
}

async function renameSidebarSurface() {
  for (
    const filePath of [
      files.publicApi,
      files.workspace,
    ]
  ) {
    let source = normalize(
      await readFile(
        filePath,
        'utf8',
      ),
    )

    source = source.replaceAll(
      'CanvasInspectorDock',
      'CanvasInspectorRightSidebar',
    )

    await write(
      filePath,
      source,
    )
  }
}

async function transformCss() {
  let source = normalize(
    await readFile(
      files.css,
      'utf8',
    ),
  )

  const markerIndex =
    source.indexOf(
      CSS_MARKER,
    )

  if (markerIndex >= 0) {
    source = source
      .slice(
        0,
        markerIndex,
      )
      .trimEnd()
  }

  source +=
    '\n\n' +
    createCss() +
    '\n'

  await write(
    files.css,
    source,
  )
}

function createCss() {
  return `${CSS_MARKER}

.hc-properties-inspector-host,
.hc-properties-sidebar {
  width: 100%;
  min-width: 0;
  min-height: 100%;
}

.hc-properties-sidebar__panel {
  width: 100%;
  min-width: 0;
  padding-bottom: 20px;
  color: var(--color-foreground);
  user-select: none;
}

.hc-properties-sidebar__header {
  display: flex;
  height: 42px;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid
    color-mix(
      in oklab,
      var(--color-foreground) 8%,
      transparent
    );
}

.hc-properties-sidebar__title {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 600;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hc-properties-sidebar__section {
  padding: 16px;
}

.hc-properties-sidebar__section
  + .hc-properties-sidebar__section {
  padding-top: 4px;
}

.hc-properties-sidebar__section-title {
  margin: 0 0 12px;
  color:
    color-mix(
      in oklab,
      var(--color-foreground) 62%,
      transparent
    );
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
}

.hc-properties-sidebar__section-content {
  display: grid;
  gap: 16px;
}

.hc-properties-sidebar__field {
  display: grid;
  gap: 7px;
}

.hc-properties-sidebar__field-header {
  display: flex;
  min-height: 16px;
  align-items: center;
  justify-content: space-between;
  color:
    color-mix(
      in oklab,
      var(--color-foreground) 58%,
      transparent
    );
  font-size: 11px;
  line-height: 16px;
}

.hc-properties-sidebar__mixed {
  font-size: 13px;
  font-weight: 600;
}

.hc-properties-sidebar__color-grid {
  display: grid;
  grid-template-columns:
    repeat(7, 24px);
  justify-content: space-between;
  gap: 8px 6px;
}

.hc-properties-sidebar__color-button {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--hc-swatch-color);
  cursor: pointer;
}

.hc-properties-sidebar__color-button
  .tlui-icon {
  width: 20px;
  height: 20px;
}

.hc-properties-sidebar__color-button:hover {
  background:
    color-mix(
      in oklab,
      currentColor 9%,
      transparent
    );
}

.hc-properties-sidebar__color-button[aria-pressed="true"] {
  border-color:
    color-mix(
      in oklab,
      var(--color-primary) 72%,
      transparent
    );
  background:
    color-mix(
      in oklab,
      var(--color-primary) 10%,
      transparent
    );
}

.hc-properties-sidebar__segmented {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  min-width: 0;
  padding: 2px;
  border: 1px solid
    color-mix(
      in oklab,
      var(--color-foreground) 9%,
      transparent
    );
  border-radius: 8px;
  background:
    color-mix(
      in oklab,
      var(--color-foreground) 3%,
      transparent
    );
}

.hc-properties-sidebar__segment {
  display: grid;
  min-width: 0;
  height: 32px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.hc-properties-sidebar__segment:hover {
  background:
    color-mix(
      in oklab,
      var(--color-foreground) 6%,
      transparent
    );
}

.hc-properties-sidebar__segment[aria-pressed="true"] {
  background: var(--color-surface);
  color: var(--color-primary);
  box-shadow:
    0 1px 2px
    rgb(0 0 0 / 8%);
}

.hc-properties-sidebar__segment
  .tlui-icon,
.hc-properties-sidebar__action
  .tlui-icon {
  width: 18px;
  height: 18px;
}

.hc-properties-sidebar__action-grid {
  display: grid;
  grid-template-columns:
    repeat(6, minmax(0, 1fr));
  gap: 4px;
}

.hc-properties-sidebar__action {
  display: grid;
  min-width: 0;
  height: 34px;
  place-items: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.hc-properties-sidebar__action:hover {
  border-color:
    color-mix(
      in oklab,
      var(--color-foreground) 7%,
      transparent
    );
  background:
    color-mix(
      in oklab,
      var(--color-foreground) 6%,
      transparent
    );
}

.hc-properties-sidebar__action--destructive {
  color: var(--color-destructive);
}

.hc-properties-sidebar__action--destructive:hover {
  background:
    color-mix(
      in oklab,
      var(--color-destructive) 9%,
      transparent
    );
}

.hc-properties-sidebar__color-button:focus-visible,
.hc-properties-sidebar__segment:focus-visible,
.hc-properties-sidebar__action:focus-visible {
  outline: 2px solid var(--color-ring);
  outline-offset: 1px;
}`
}

async function assertRepository() {
  await Promise.all([
    readFile(
      resolve('AGENTS.md'),
      'utf8',
    ),

    ...Object.values(
      files,
    ).map(
      (filePath) =>
        readFile(
          filePath,
          'utf8',
        ),
    ),
  ])
}

async function write(
  filePath,
  content,
) {
  await writeFile(
    filePath,
    finish(content),
    'utf8',
  )
}

function resolve(
  relativePath,
) {
  return path.join(
    root,
    relativePath,
  )
}

function normalize(
  source,
) {
  return source.replaceAll(
    '\r\n',
    '\n',
  )
}

function finish(
  source,
) {
  return (
    normalize(source).trimEnd() +
    '\n'
  )
}