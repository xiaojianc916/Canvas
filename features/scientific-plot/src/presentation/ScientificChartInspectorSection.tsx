import type {
  HybridCanvasInspectorSectionProps,
} from '@hybrid-canvas/canvas/extensions'
import {
  TldrawUiIcon,
  TldrawUiTooltip,
  useValue,
} from 'tldraw'

import type {
  ScientificChartShape,
} from '../shapes/ScientificChartShapeUtil'
import {
  type ScientificChartType,
  ScientificChartTypeStyle,
} from '../styles/chart-styles'

const chartTypes:
  readonly {
    readonly value: ScientificChartType
    readonly label: string
  }[] = [
    {
      value: 'line',
      label: '折线',
    },
    {
      value: 'bar',
      label: '柱状',
    },
    {
      value: 'area',
      label: '面积',
    },
    {
      value: 'scatter',
      label: '散点',
    },
  ]

export function ScientificChartInspectorSection({
  editor,
  mode,
}: HybridCanvasInspectorSectionProps) {
  const state = useValue(
    'scientific chart inspector values',
    () => {
      if (mode === 'creation') {
        return {
          shapes:
            [] as ScientificChartShape[],
          chartType:
            editor.getStyleForNextShape(
              ScientificChartTypeStyle,
            ),
          showAxes: null,
          showGrid: null,
          showLegend: null,
          readonly:
            editor.getIsReadonly(),
        }
      }

      const shapes =
        editor
          .getSelectedShapes()
          .filter(
            (
              shape,
            ): shape is ScientificChartShape =>
              shape.type ===
              'scientific-chart',
          )

      const first = shapes[0]

      return {
        shapes,

        chartType:
          sharedValue(
            shapes,
            (shape) =>
              shape.props.chartType,
          ),

        showAxes:
          sharedValue(
            shapes,
            (shape) =>
              shape.props.showAxes,
          ),

        showGrid:
          sharedValue(
            shapes,
            (shape) =>
              shape.props.showGrid,
          ),

        showLegend:
          sharedValue(
            shapes,
            (shape) =>
              shape.props.showLegend,
          ),

        readonly:
          editor.getIsReadonly(),
      }
    },
    [
      editor,
      mode,
    ],
  )

  if (
    mode === 'selection' &&
    state.shapes.length === 0
  ) {
    return null
  }

  const updateChartType = (
    chartType: ScientificChartType,
  ) => {
    if (state.readonly) {
      return
    }

    if (
      mode === 'creation'
    ) {
      editor.setStyleForNextShapes(
        ScientificChartTypeStyle,
        chartType,
      )

      return
    }

    editor.markHistoryStoppingPoint(
      'change scientific chart type',
    )

    editor.updateShapes(
      state.shapes.map(
        (shape) => ({
          id: shape.id,
          type: shape.type,
          props: {
            chartType,
          },
        }),
      ),
    )
  }

  const updateBoolean = (
    property:
      | 'showAxes'
      | 'showGrid'
      | 'showLegend',
    current:
      | boolean
      | null,
  ) => {
    if (
      state.readonly ||
      mode !== 'selection'
    ) {
      return
    }

    const next =
      current !== true

    editor.markHistoryStoppingPoint(
      'change scientific chart option',
    )

    editor.updateShapes(
      state.shapes.map(
        (shape) => ({
          id: shape.id,
          type: shape.type,
          props: {
            [property]: next,
          },
        }),
      ),
    )
  }

  return (
    <section className="hc-properties-sidebar__section">
      <h2 className="hc-properties-sidebar__section-title">
        图表
      </h2>

      <div className="hc-properties-sidebar__section-content">
        <div className="hc-properties-sidebar__field">
          <div className="hc-properties-sidebar__field-header">
            <span>图表类型</span>

            {state.chartType === null ? (
              <span
                aria-label="多个值"
                className="hc-properties-sidebar__mixed"
              >
                —
              </span>
            ) : null}
          </div>

          <div
            className="hc-properties-sidebar__segmented"
            data-mixed={
              state.chartType === null
                ? ''
                : undefined
            }
            role="group"
          >
            {chartTypes.map(
              (option) => (
                <TldrawUiTooltip
                  content={option.label}
                  key={option.value}
                  side="left"
                  sideOffset={8}
                >
                  <button
                    aria-label={option.label}
                    aria-pressed={
                      state.chartType ===
                      option.value
                    }
                    className="hc-properties-sidebar__segment"
                    disabled={state.readonly}
                    onClick={() => {
                      updateChartType(
                        option.value,
                      )
                    }}
                    type="button"
                  >
                    {option.label}
                  </button>
                </TldrawUiTooltip>
              ),
            )}
          </div>
        </div>

        {mode === 'selection' ? (
          <div className="hc-properties-sidebar__field">
            <div className="hc-properties-sidebar__field-header">
              <span>显示</span>
            </div>

            <div
              className="hc-properties-sidebar__segmented"
              role="group"
            >
              <ToggleButton
                active={state.showAxes}
                disabled={state.readonly}
                label="坐标轴"
                onClick={() => {
                  updateBoolean(
                    'showAxes',
                    state.showAxes,
                  )
                }}
              />

              <ToggleButton
                active={state.showGrid}
                disabled={state.readonly}
                label="网格线"
                onClick={() => {
                  updateBoolean(
                    'showGrid',
                    state.showGrid,
                  )
                }}
              />

              <ToggleButton
                active={state.showLegend}
                disabled={state.readonly}
                label="图例"
                onClick={() => {
                  updateBoolean(
                    'showLegend',
                    state.showLegend,
                  )
                }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function ToggleButton({
  label,
  active,
  disabled,
  onClick,
}: {
  readonly label: string
  readonly active:
    | boolean
    | null
  readonly disabled: boolean
  readonly onClick: () => void
}) {
  return (
    <TldrawUiTooltip
      content={label}
      side="left"
      sideOffset={8}
    >
      <button
        aria-label={label}
        aria-pressed={
          active === true
        }
        className="hc-properties-sidebar__segment"
        data-mixed={
          active === null
            ? ''
            : undefined
        }
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        <TldrawUiIcon
          icon={
            active === true
              ? 'check'
              : 'cross-2'
          }
          label={label}
        />
      </button>
    </TldrawUiTooltip>
  )
}

function sharedValue<
  TValue,
>(
  shapes:
    readonly ScientificChartShape[],
  select: (
    shape: ScientificChartShape,
  ) => TValue,
): TValue | null {
  const first = shapes[0]

  if (!first) {
    return null
  }

  const value =
    select(first)

  return shapes.every(
    (shape) =>
      select(shape) === value,
  )
    ? value
    : null
}
