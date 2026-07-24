import type {
  HybridCanvasInspectorSectionProps,
} from '@hybrid-canvas/canvas/extensions'
import {
  getColorStyleItems,
  getColorValue,
  TldrawUiIcon,
  TldrawUiTooltip,
  useValue,
} from 'tldraw'

import type {
  FlowNodeShape,
  FlowNodeType,
} from '../shapes/FlowNodeShapeUtil'

const nodeTypes:
  readonly {
    readonly value: FlowNodeType
    readonly label: string
  }[] = [
    {
      value: 'process',
      label: '处理',
    },
    {
      value: 'decision',
      label: '判断',
    },
    {
      value: 'start-end',
      label: '起止',
    },
    {
      value: 'input-output',
      label: '输入输出',
    },
  ]

export function FlowNodeInspectorSection({
  editor,
}: HybridCanvasInspectorSectionProps) {
  const state = useValue(
    'flow node inspector values',
    () => {
      const shapes =
        editor
          .getSelectedShapes()
          .filter(
            (
              shape,
            ): shape is FlowNodeShape =>
              shape.type === 'flow-node',
          )

      const first = shapes[0]

      const nodeType =
        first &&
        shapes.every(
          (shape) =>
            shape.props.nodeType ===
            first.props.nodeType,
        )
          ? first.props.nodeType
          : null

      const color =
        first &&
        shapes.every(
          (shape) =>
            shape.props.color ===
            first.props.color,
        )
          ? first.props.color
          : null

      return {
        shapes,
        nodeType,
        color,
        readonly:
          editor.getIsReadonly(),
      }
    },
    [editor],
  )

  if (
    state.shapes.length === 0
  ) {
    return null
  }

  const colors =
    editor
      .getCurrentTheme()
      .colors[
        editor.getColorMode()
      ]

  const colorItems =
    getColorStyleItems(colors)

  const updateNodeType = (
    nodeType: FlowNodeType,
  ) => {
    if (state.readonly) {
      return
    }

    editor.markHistoryStoppingPoint(
      'change flow node type',
    )

    editor.updateShapes(
      state.shapes.map(
        (shape) => ({
          id: shape.id,
          type: shape.type,
          props: {
            nodeType,
          },
        }),
      ),
    )
  }

  const updateColor = (
    color: string,
  ) => {
    if (state.readonly) {
      return
    }

    editor.markHistoryStoppingPoint(
      'change flow node color',
    )

    editor.updateShapes(
      state.shapes.map(
        (shape) => ({
          id: shape.id,
          type: shape.type,
          props: {
            color,
          },
        }),
      ),
    )
  }

  return (
    <section className="hc-properties-sidebar__section">
      <h2 className="hc-properties-sidebar__section-title">
        流程图
      </h2>

      <div className="hc-properties-sidebar__section-content">
        <div className="hc-properties-sidebar__field">
          <div className="hc-properties-sidebar__field-header">
            <span>节点类型</span>

            {state.nodeType === null ? (
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
              state.nodeType === null
                ? ''
                : undefined
            }
            role="group"
          >
            {nodeTypes.map(
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
                      state.nodeType ===
                      option.value
                    }
                    className="hc-properties-sidebar__segment"
                    disabled={state.readonly}
                    onClick={() => {
                      updateNodeType(
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

        <div className="hc-properties-sidebar__field">
          <div className="hc-properties-sidebar__field-header">
            <span>节点颜色</span>

            {state.color === null ? (
              <span
                aria-label="多个值"
                className="hc-properties-sidebar__mixed"
              >
                —
              </span>
            ) : null}
          </div>

          <div
            className="hc-properties-sidebar__color-grid"
            data-mixed={
              state.color === null
                ? ''
                : undefined
            }
            role="group"
          >
            {colorItems.map(
              (item) => {
                const color =
                  getColorValue(
                    colors,
                    item.value,
                    'solid',
                  )

                const active =
                  state.color === color

                return (
                  <TldrawUiTooltip
                    content={item.value}
                    key={item.value}
                    side="left"
                    sideOffset={8}
                  >
                    <button
                      aria-label={
                        '节点颜色 ' +
                        item.value
                      }
                      aria-pressed={active}
                      className="hc-properties-sidebar__color-button"
                      disabled={state.readonly}
                      onClick={() => {
                        updateColor(color)
                      }}
                      style={{
                        '--hc-swatch-color':
                          color,
                      } as React.CSSProperties}
                      type="button"
                    >
                      <TldrawUiIcon
                        icon="color"
                        label={
                          '节点颜色 ' +
                          item.value
                        }
                      />
                    </button>
                  </TldrawUiTooltip>
                )
              },
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
