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
  GeoShapeGeoStyle,
  isDefined,
  isValidElement,
  LineShapeSplineStyle,
  type ReadonlySharedStyleMap,
  StylePanelArrowheadPicker,
  StylePanelArrowKindPicker,
  StylePanelColorPicker,
  StylePanelDashPicker,
  StylePanelFillPicker,
  StylePanelFontPicker,
  StylePanelGeoShapePicker,
  StylePanelLabelAlignPicker,
  StylePanelOpacityPicker,
  StylePanelSizePicker,
  StylePanelSplinePicker,
  StylePanelTextAlignPicker,
  TldrawUiIcon,
  type TLUiActionItem,
  useActions,
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

/**
 * 专门为停靠式右栏设计的 Properties Inspector。
 *
 * 官方能力负责：
 * - shared / mixed styles
 * - StyleProp 写入
 * - next-shape styles
 * - History
 * - Actions
 * - 图标
 *
 * 本组件负责：
 * - 分区
 * - 密度
 * - 排列
 * - 显隐
 */
export function PropertiesInspectorContent({
  styles,
  selectedShapeCount,
}: PropertiesInspectorContentProps) {
  const hasSelection =
    selectedShapeCount > 0

  const hasAppearance =
    styles !== null &&
    (
      hasStyle(
        styles,
        DefaultColorStyle,
      ) ||
      hasSelection
    )

  const hasStrokeAndFill =
    styles !== null &&
    hasAnyStyle(
      styles,
      [
        DefaultFillStyle,
        DefaultDashStyle,
        DefaultSizeStyle,
      ],
    )

  const hasText =
    styles !== null &&
    hasAnyStyle(
      styles,
      [
        DefaultFontStyle,
        DefaultTextAlignStyle,
        DefaultHorizontalAlignStyle,
        DefaultVerticalAlignStyle,
      ],
    )

  const hasShape =
    styles !== null &&
    hasAnyStyle(
      styles,
      [
        GeoShapeGeoStyle,
        ArrowShapeKindStyle,
        ArrowShapeArrowheadStartStyle,
        ArrowShapeArrowheadEndStyle,
        LineShapeSplineStyle,
      ],
    )

  return (
    <div className="hc-properties-panel">
      {hasAppearance ? (
        <InspectorSection
          title="外观"
        >
          <div className="hc-properties-panel__stack">
            {hasStyle(
              styles,
              DefaultColorStyle,
            ) ? (
              <StylePanelColorPicker />
            ) : null}

            {hasSelection ? (
              <StylePanelOpacityPicker />
            ) : null}
          </div>
        </InspectorSection>
      ) : null}

      {hasStrokeAndFill ? (
        <InspectorSection
          title="样式"
        >
          <div className="hc-properties-panel__stack">
            {hasStyle(
              styles,
              DefaultFillStyle,
            ) ? (
              <StylePanelFillPicker />
            ) : null}

            {hasStyle(
              styles,
              DefaultDashStyle,
            ) ? (
              <StylePanelDashPicker />
            ) : null}

            {hasStyle(
              styles,
              DefaultSizeStyle,
            ) ? (
              <StylePanelSizePicker />
            ) : null}
          </div>
        </InspectorSection>
      ) : null}

      {hasText ? (
        <InspectorSection
          title="文本"
        >
          <div className="hc-properties-panel__stack">
            {hasStyle(
              styles,
              DefaultFontStyle,
            ) ? (
              <StylePanelFontPicker />
            ) : null}

            {hasStyle(
              styles,
              DefaultTextAlignStyle,
            ) ? (
              <StylePanelTextAlignPicker />
            ) : null}

            {hasStyle(
              styles,
              DefaultHorizontalAlignStyle,
            ) ? (
              <StylePanelLabelAlignPicker />
            ) : null}
          </div>
        </InspectorSection>
      ) : null}

      {hasShape ? (
        <InspectorSection
          title="形状"
        >
          <div className="hc-properties-panel__stack">
            {hasStyle(
              styles,
              GeoShapeGeoStyle,
            ) ? (
              <StylePanelGeoShapePicker />
            ) : null}

            {hasStyle(
              styles,
              ArrowShapeKindStyle,
            ) ? (
              <StylePanelArrowKindPicker />
            ) : null}

            {hasStyle(
              styles,
              ArrowShapeArrowheadStartStyle,
            ) &&
            hasStyle(
              styles,
              ArrowShapeArrowheadEndStyle,
            ) ? (
              <StylePanelArrowheadPicker />
            ) : null}

            {hasStyle(
              styles,
              LineShapeSplineStyle,
            ) ? (
              <StylePanelSplinePicker />
            ) : null}
          </div>
        </InspectorSection>
      ) : null}

      {hasSelection ? (
        <SelectionActions
          selectedShapeCount={
            selectedShapeCount
          }
        />
      ) : null}
    </div>
  )
}

interface InspectorSectionProps {
  readonly title: string
  readonly children: ReactNode
}

function InspectorSection({
  title,
  children,
}: InspectorSectionProps) {
  return (
    <section
      aria-label={title}
      className="hc-properties-panel__section"
    >
      <h2 className="hc-properties-panel__heading">
        {title}
      </h2>

      <div className="hc-properties-panel__content">
        {children}
      </div>
    </section>
  )
}

interface SelectionActionsProps {
  readonly selectedShapeCount: number
}

function SelectionActions({
  selectedShapeCount,
}: SelectionActionsProps) {
  const actions =
    useActions()

  const alignActions =
    selectedShapeCount >= 2
      ? [
          action(
            actions,
            'align-left',
            '左对齐',
          ),

          action(
            actions,
            'align-center-horizontal',
            '水平居中',
          ),

          action(
            actions,
            'align-right',
            '右对齐',
          ),

          action(
            actions,
            'align-top',
            '顶部对齐',
          ),

          action(
            actions,
            'align-center-vertical',
            '垂直居中',
          ),

          action(
            actions,
            'align-bottom',
            '底部对齐',
          ),
        ]
      : []

  const distributeActions =
    selectedShapeCount >= 3
      ? [
          action(
            actions,
            'distribute-horizontal',
            '水平分布',
          ),

          action(
            actions,
            'distribute-vertical',
            '垂直分布',
          ),
        ]
      : []

  const arrangementActions = [
    ...alignActions,
    ...distributeActions,
  ].filter(isDefined)

  const objectActions = [
    action(
      actions,
      'group',
      '编组或取消编组',
    ),

    action(
      actions,
      'duplicate',
      '创建副本',
    ),

    action(
      actions,
      'delete',
      '删除',
      true,
    ),
  ].filter(isDefined)

  return (
    <>
      {arrangementActions.length >
      0 ? (
        <InspectorSection
          title="排列"
        >
          <ActionGrid
            actions={
              arrangementActions
            }
          />
        </InspectorSection>
      ) : null}

      <InspectorSection
        title="对象"
      >
        <ActionGrid
          actions={objectActions}
        />
      </InspectorSection>
    </>
  )
}

interface InspectorAction {
  readonly item: TLUiActionItem
  readonly title: string
  readonly destructive: boolean
}

function action(
  actions: ReturnType<
    typeof useActions
  >,
  id: string,
  title: string,
  destructive = false,
): InspectorAction | null {
  const item =
    actions[id]

  if (
    !item ||
    !item.icon
  ) {
    return null
  }

  return {
    item,
    title,
    destructive,
  }
}

function ActionGrid({
  actions,
}: {
  readonly actions:
    readonly InspectorAction[]
}) {
  return (
    <div className="hc-properties-panel__action-grid">
      {actions.map(
        ({
          item,
          title,
          destructive,
        }) => {
          const icon =
            typeof item.icon ===
              'string' ||
            isValidElement(
              item.icon,
            )
              ? item.icon
              : 'question-mark-circle'

          return (
            <button
              aria-label={title}
              className={
                destructive
                  ? 'hc-properties-panel__icon-button hc-properties-panel__icon-button--destructive'
                  : 'hc-properties-panel__icon-button'
              }
              key={item.id}
              onClick={() => {
                void item.onSelect(
                  'toolbar',
                )
              }}
              title={title}
              type="button"
            >
              <TldrawUiIcon
                icon={icon}
                label={title}
              />
            </button>
          )
        },
      )}
    </div>
  )
}

function hasStyle(
  styles:
    | ReadonlySharedStyleMap
    | null,
  style: Parameters<
    ReadonlySharedStyleMap['get']
  >[0],
): boolean {
  return (
    styles?.get(style) !==
    undefined
  )
}

function hasAnyStyle(
  styles:
    | ReadonlySharedStyleMap
    | null,
  styleProps: readonly Parameters<
    ReadonlySharedStyleMap['get']
  >[0][],
): boolean {
  return styleProps.some(
    (style) =>
      hasStyle(
        styles,
        style,
      ),
  )
}
