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
  '/* hybrid-canvas:properties-sidebar-v2 */'

let source = normalize(
  await readFile(
    contentPath,
    'utf8',
  ),
)

source = updateImports(source)
source = insertOptions(source)
source = replaceStyleSections(source)
source = insertOpacityControl(source)
source = updateSegmentedLayout(source)
source = extendSelectionActions(source)

await write(
  contentPath,
  source,
)

await updateCss()

console.log('')
console.log(
  '右侧属性侧边栏第二阶段内容已添加。',
)
console.log('')
console.log('新增：')
console.log('  - 透明度')
console.log('  - 标签水平与垂直对齐')
console.log('  - 箭头类型和端点')
console.log('  - 线条曲率')
console.log('  - 对象层级')
console.log('  - 对象旋转')
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
    input.includes(
      'ArrowShapeArrowheadEndStyle',
    )
  ) {
    return input
  }

  return input.replace(
    `import {
  DefaultColorStyle,`,
    `import {
  ArrowShapeArrowheadEndStyle,
  ArrowShapeArrowheadStartStyle,
  ArrowShapeKindStyle,
  DefaultColorStyle,`,
  ).replace(
    `  DefaultFontStyle,
  DefaultSizeStyle,
  DefaultTextAlignStyle,`,
    `  DefaultFontStyle,
  DefaultHorizontalAlignStyle,
  DefaultSizeStyle,
  DefaultTextAlignStyle,
  DefaultVerticalAlignStyle,`,
  ).replace(
    `  getColorValue,
  type ReadonlySharedStyleMap,`,
    `  getColorValue,
  LineShapeSplineStyle,
  type ReadonlySharedStyleMap,`,
  )
}

function insertOptions(input) {
  if (
    input.includes(
      'const horizontalAlignOptions',
    )
  ) {
    return input
  }

  const marker =
    'export function PropertiesInspectorContent'

  const markerIndex =
    input.indexOf(marker)

  if (markerIndex < 0) {
    throw new Error(
      '没有找到 PropertiesInspectorContent。',
    )
  }

  const additions = `const horizontalAlignOptions = [
  {
    value: 'start',
    icon: 'horizontal-align-start',
    label: '左侧',
  },
  {
    value: 'middle',
    icon: 'horizontal-align-middle',
    label: '水平居中',
  },
  {
    value: 'end',
    icon: 'horizontal-align-end',
    label: '右侧',
  },
] as const

const verticalAlignOptions = [
  {
    value: 'start',
    icon: 'vertical-align-start',
    label: '顶部',
  },
  {
    value: 'middle',
    icon: 'vertical-align-middle',
    label: '垂直居中',
  },
  {
    value: 'end',
    icon: 'vertical-align-end',
    label: '底部',
  },
] as const

const arrowKindOptions = [
  {
    value: 'arc',
    icon: 'arrow-arc',
    label: '曲线箭头',
  },
  {
    value: 'elbow',
    icon: 'arrow-elbow',
    label: '折线箭头',
  },
] as const

const arrowheadOptions = [
  {
    value: 'none',
    icon: 'arrowhead-none',
    label: '无端点',
  },
  {
    value: 'arrow',
    icon: 'arrowhead-arrow',
    label: '箭头',
  },
  {
    value: 'triangle',
    icon: 'arrowhead-triangle',
    label: '三角形',
  },
  {
    value: 'square',
    icon: 'arrowhead-square',
    label: '方形',
  },
  {
    value: 'dot',
    icon: 'arrowhead-dot',
    label: '圆点',
  },
  {
    value: 'diamond',
    icon: 'arrowhead-diamond',
    label: '菱形',
  },
  {
    value: 'inverted',
    icon: 'arrowhead-triangle-inverted',
    label: '反向三角',
  },
  {
    value: 'bar',
    icon: 'arrowhead-bar',
    label: '端线',
  },
] as const

const splineOptions = [
  {
    value: 'line',
    icon: 'spline-line',
    label: '直线',
  },
  {
    value: 'cubic',
    icon: 'spline-cubic',
    label: '曲线',
  },
] as const

const opacityOptions = [
  {
    value: 0.1,
    label: '10%',
  },
  {
    value: 0.25,
    label: '25%',
  },
  {
    value: 0.5,
    label: '50%',
  },
  {
    value: 0.75,
    label: '75%',
  },
  {
    value: 1,
    label: '100%',
  },
] as const

`

  return (
    input.slice(
      0,
      markerIndex,
    ) +
    additions +
    input.slice(
      markerIndex,
    )
  )
}

function replaceStyleSections(input) {
  const pattern =
    /function StyleSections\(\{[\s\S]*?\n\}\n\nfunction ColorControl/

  if (
    !pattern.test(input)
  ) {
    throw new Error(
      '没有找到现有 StyleSections。',
    )
  }

  return input.replace(
    pattern,
    `function StyleSections({
  styles,
}: {
  readonly styles:
    ReadonlySharedStyleMap
}) {
  const editor = useEditor()

  const opacity =
    useValue(
      'right properties sidebar opacity',
      () =>
        editor.getSharedOpacity(),
      [editor],
    )

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

  const horizontalAlign =
    styles.get(
      DefaultHorizontalAlignStyle,
    )

  const verticalAlign =
    styles.get(
      DefaultVerticalAlignStyle,
    )

  const arrowKind =
    styles.get(
      ArrowShapeKindStyle,
    )

  const arrowheadStart =
    styles.get(
      ArrowShapeArrowheadStartStyle,
    )

  const arrowheadEnd =
    styles.get(
      ArrowShapeArrowheadEndStyle,
    )

  const spline =
    styles.get(
      LineShapeSplineStyle,
    )

  const hasAppearance =
    color !== undefined ||
    opacity !== undefined

  const hasCommonStyle =
    fill !== undefined ||
    dash !== undefined ||
    size !== undefined

  const hasText =
    font !== undefined ||
    textAlign !== undefined ||
    horizontalAlign !== undefined ||
    verticalAlign !== undefined

  const hasArrow =
    arrowKind !== undefined ||
    arrowheadStart !== undefined ||
    arrowheadEnd !== undefined ||
    spline !== undefined

  return (
    <>
      {hasAppearance ? (
        <SidebarSection
          title="外观"
        >
          {color ? (
            <SidebarField
              mixed={
                color.type === 'mixed'
              }
              title="颜色"
            >
              <ColorControl
                value={color}
              />
            </SidebarField>
          ) : null}

          {opacity ? (
            <SidebarField
              mixed={
                opacity.type === 'mixed'
              }
              title="透明度"
            >
              <OpacityControl
                value={opacity}
              />
            </SidebarField>
          ) : null}
        </SidebarSection>
      ) : null}

      {hasCommonStyle ? (
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

      {hasText ? (
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
              title="文本对齐"
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

          {horizontalAlign ? (
            <SidebarField
              mixed={
                horizontalAlign.type ===
                'mixed'
              }
              title="水平位置"
            >
              <StyleControl
                options={
                  horizontalAlignOptions
                }
                style={
                  DefaultHorizontalAlignStyle
                }
                value={
                  horizontalAlign
                }
              />
            </SidebarField>
          ) : null}

          {verticalAlign ? (
            <SidebarField
              mixed={
                verticalAlign.type ===
                'mixed'
              }
              title="垂直位置"
            >
              <StyleControl
                options={
                  verticalAlignOptions
                }
                style={
                  DefaultVerticalAlignStyle
                }
                value={
                  verticalAlign
                }
              />
            </SidebarField>
          ) : null}
        </SidebarSection>
      ) : null}

      {hasArrow ? (
        <SidebarSection
          title="线条与箭头"
        >
          {arrowKind ? (
            <SidebarField
              mixed={
                arrowKind.type === 'mixed'
              }
              title="类型"
            >
              <StyleControl
                options={
                  arrowKindOptions
                }
                style={
                  ArrowShapeKindStyle
                }
                value={arrowKind}
              />
            </SidebarField>
          ) : null}

          {spline ? (
            <SidebarField
              mixed={
                spline.type === 'mixed'
              }
              title="路径"
            >
              <StyleControl
                options={splineOptions}
                style={
                  LineShapeSplineStyle
                }
                value={spline}
              />
            </SidebarField>
          ) : null}

          {arrowheadStart ? (
            <SidebarField
              mixed={
                arrowheadStart.type ===
                'mixed'
              }
              title="起点"
            >
              <StyleControl
                options={
                  arrowheadOptions
                }
                style={
                  ArrowShapeArrowheadStartStyle
                }
                value={
                  arrowheadStart
                }
              />
            </SidebarField>
          ) : null}

          {arrowheadEnd ? (
            <SidebarField
              mixed={
                arrowheadEnd.type ===
                'mixed'
              }
              title="终点"
            >
              <StyleControl
                options={
                  arrowheadOptions
                }
                style={
                  ArrowShapeArrowheadEndStyle
                }
                value={
                  arrowheadEnd
                }
              />
            </SidebarField>
          ) : null}
        </SidebarSection>
      ) : null}
    </>
  )
}

function ColorControl`,
  )
}

function insertOpacityControl(input) {
  if (
    input.includes(
      'function OpacityControl',
    )
  ) {
    return input
  }

  const marker =
    'function ColorControl'

  const markerIndex =
    input.indexOf(marker)

  if (markerIndex < 0) {
    throw new Error(
      '没有找到 ColorControl。',
    )
  }

  const component = `function OpacityControl({
  value,
}: {
  readonly value:
    SharedStyle<number>
}) {
  const styleContext =
    useStylePanelContext()

  return (
    <div
      aria-label="透明度"
      className="hc-properties-sidebar__opacity"
      data-mixed={
        value.type === 'mixed'
          ? ''
          : undefined
      }
      role="group"
    >
      {opacityOptions.map(
        (option) => {
          const active =
            value.type ===
              'shared' &&
            value.value ===
              option.value

          return (
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
          )
        },
      )}
    </div>
  )
}

`

  return (
    input.slice(
      0,
      markerIndex,
    ) +
    component +
    input.slice(
      markerIndex,
    )
  )
}

function updateSegmentedLayout(input) {
  return input.replace(
    `className="hc-properties-sidebar__segmented"`,
    `className={
        options.length > 4
          ? 'hc-properties-sidebar__segmented hc-properties-sidebar__segmented--grid'
          : 'hc-properties-sidebar__segmented'
      }`,
  )
}

function extendSelectionActions(input) {
  if (
    input.includes(
      'title="层级"',
    )
  ) {
    return input
  }

  const objectSection = `      <SidebarSection
        title="对象"
      >`

  if (
    !input.includes(
      objectSection,
    )
  ) {
    throw new Error(
      '没有找到对象操作区。',
    )
  }

  const layerSection = `      <SidebarSection
        title="层级"
      >
        <div className="hc-properties-sidebar__action-grid">
          <ActionButton
            actions={actions}
            id="bring-to-front"
            label="置于顶层"
          />

          <ActionButton
            actions={actions}
            id="bring-forward"
            label="上移一层"
          />

          <ActionButton
            actions={actions}
            id="send-backward"
            label="下移一层"
          />

          <ActionButton
            actions={actions}
            id="send-to-back"
            label="置于底层"
          />
        </div>
      </SidebarSection>

`

  input = input.replace(
    objectSection,
    layerSection +
      objectSection,
  )

  const duplicateButton = `          <ActionButton
            actions={actions}
            id="duplicate"
            label="创建副本"
          />`

  if (
    !input.includes(
      duplicateButton,
    )
  ) {
    throw new Error(
      '没有找到创建副本按钮。',
    )
  }

  const rotationButtons = `          <ActionButton
            actions={actions}
            id="rotate-ccw"
            label="逆时针旋转"
          />

          <ActionButton
            actions={actions}
            id="rotate-cw"
            label="顺时针旋转"
          />

`

  return input.replace(
    duplicateButton,
    rotationButtons +
      duplicateButton,
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

.hc-properties-sidebar__opacity {
  display: grid;
  grid-template-columns:
    repeat(5, minmax(0, 1fr));
  gap: 3px;
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

.hc-properties-sidebar__opacity-option {
  min-width: 0;
  height: 30px;
  padding: 0 2px;
  overflow: hidden;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color:
    color-mix(
      in oklab,
      var(--color-foreground) 70%,
      transparent
    );
  font: inherit;
  font-size: 10px;
  line-height: 30px;
  text-overflow: clip;
  white-space: nowrap;
  cursor: pointer;
}

.hc-properties-sidebar__opacity-option:hover {
  background:
    color-mix(
      in oklab,
      var(--color-foreground) 6%,
      transparent
    );
}

.hc-properties-sidebar__opacity-option[aria-pressed="true"] {
  background: var(--color-surface);
  color: var(--color-primary);
  font-weight: 600;
  box-shadow:
    0 1px 2px rgb(0 0 0 / 8%);
}

.hc-properties-sidebar__segmented--grid {
  grid-template-columns:
    repeat(4, minmax(0, 1fr));
  grid-auto-flow: row;
  grid-auto-columns: auto;
  gap: 2px;
}

.hc-properties-sidebar__opacity-option:focus-visible {
  outline: 2px solid var(--color-ring);
  outline-offset: -2px;
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

function normalize(input) {
  return input.replaceAll(
    '\r\n',
    '\n',
  )
}