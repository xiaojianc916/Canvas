import {
  ArrowShapeArrowheadEndStyle,
  ArrowShapeArrowheadStartStyle,
  ArrowShapeKindStyle,
  DefaultColorStyle,
  DefaultDashStyle,
  DefaultFillStyle,
  DefaultFontStyle,
  DefaultHorizontalAlignStyle,
  DefaultSizeStyle,
  DefaultTextAlignStyle,
  DefaultVerticalAlignStyle,
  getColorStyleItems,
  getColorValue,
  LineShapeSplineStyle,
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

const horizontalAlignOptions = [
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

function OpacityControl({
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
      className={
        options.length > 4
          ? 'hc-properties-sidebar__segmented hc-properties-sidebar__segmented--grid'
          : 'hc-properties-sidebar__segmented'
      }
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
            id="rotate-ccw"
            label="逆时针旋转"
          />

          <ActionButton
            actions={actions}
            id="rotate-cw"
            label="顺时针旋转"
          />

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
      {typeof item.icon === 'string' ? (
        <TldrawUiIcon
          icon={item.icon as TLUiIconType}
          label={label}
        />
      ) : (
        item.icon
      )}
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
