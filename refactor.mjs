#!/usr/bin/env node

import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

await rewriteExtensionContract()
await updatePublicExports()
await createFlowNodeSection()
await createScientificChartSection()
await registerFlowNodeSection()
await registerScientificChartSection()
await updateEditorCanvas()
await updateInspectorPortal()
await updatePropertiesContent()
await updateArchitectureTest()

console.log('')
console.log('Feature 属性 Section 已接入。')
console.log('')
console.log('新增：')
console.log('  - Inspector Section contribution API')
console.log('  - 流程图节点类型')
console.log('  - 流程图节点颜色')
console.log('  - 科学图表类型')
console.log('  - 科学图表坐标轴开关')
console.log('  - 科学图表网格线开关')
console.log('  - 科学图表图例开关')
console.log('  - 科学图表创建预设')
console.log('')
console.log('执行：')
console.log('  pnpm format')
console.log('  pnpm lint')
console.log('  pnpm typecheck')
console.log('  pnpm test:architecture')
console.log('  pnpm test')
console.log('  pnpm build:desktop')
console.log('')

async function rewriteExtensionContract() {
  const content = `import type { ComponentType } from 'react'
import type {
  Editor,
  TLAnyBindingUtilConstructor,
  TLAnyShapeUtilConstructor,
  TLStateNodeConstructor,
} from 'tldraw'

export const HYBRID_CANVAS_EXTENSION_API_VERSION = '3'

export type HybridCanvasInspectorSectionMode =
  | 'creation'
  | 'selection'

export interface HybridCanvasInspectorSectionProps {
  readonly editor: Editor
  readonly mode: HybridCanvasInspectorSectionMode
}

export interface HybridCanvasInspectorSectionContribution {
  readonly id: string
  readonly owner: string
  readonly priority?: number

  /**
   * 在没有选中对象，且当前工具匹配时显示。
   */
  readonly toolIds?: readonly string[]

  /**
   * 在选中对象全部属于这些类型时显示。
   */
  readonly shapeTypes?: readonly string[]

  /**
   * Component 只能贡献一个或多个属性 Section，
   * 不能覆盖整个右侧属性侧边栏。
   */
  readonly component:
    ComponentType<HybridCanvasInspectorSectionProps>
}

export interface HybridCanvasExtension {
  readonly id: string
  readonly version: string
  readonly apiVersion: string
  readonly shapeUtils?: readonly TLAnyShapeUtilConstructor[]
  readonly bindingUtils?: readonly TLAnyBindingUtilConstructor[]
  readonly tools?: readonly TLStateNodeConstructor[]
  readonly shapeLabels?: Readonly<Record<string, string>>
  readonly inspectorSections?:
    readonly HybridCanvasInspectorSectionContribution[]
}

export interface ExtensionRegistration {
  readonly extensions: readonly HybridCanvasExtension[]
  readonly shapeUtils: readonly TLAnyShapeUtilConstructor[]
  readonly bindingUtils: readonly TLAnyBindingUtilConstructor[]
  readonly tools: readonly TLStateNodeConstructor[]
  readonly shapeLabels: Readonly<Record<string, string>>
  readonly inspectorSections:
    readonly HybridCanvasInspectorSectionContribution[]
}

export function buildExtensionRegistration(
  input: readonly HybridCanvasExtension[] = [],
): ExtensionRegistration {
  const ids = new Set<string>()
  const sectionIds = new Set<string>()
  const shapeUtils: TLAnyShapeUtilConstructor[] = []
  const bindingUtils: TLAnyBindingUtilConstructor[] = []
  const tools: TLStateNodeConstructor[] = []
  const shapeLabels: Record<string, string> = {}
  const inspectorSections:
    HybridCanvasInspectorSectionContribution[] = []

  for (const extension of input) {
    if (
      !extension.id ||
      ids.has(extension.id)
    ) {
      throw new Error('EXTENSION_DUPLICATE_ID')
    }

    if (
      extension.apiVersion !==
      HYBRID_CANVAS_EXTENSION_API_VERSION
    ) {
      throw new Error(
        'EXTENSION_API_VERSION_MISMATCH',
      )
    }

    ids.add(extension.id)

    shapeUtils.push(
      ...(extension.shapeUtils ?? []),
    )

    bindingUtils.push(
      ...(extension.bindingUtils ?? []),
    )

    tools.push(
      ...(extension.tools ?? []),
    )

    Object.assign(
      shapeLabels,
      extension.shapeLabels,
    )

    for (
      const section of
      extension.inspectorSections ?? []
    ) {
      validateInspectorSection(
        extension.id,
        section,
        sectionIds,
      )

      inspectorSections.push(section)
    }
  }

  inspectorSections.sort(
    (left, right) =>
      (right.priority ?? 0) -
        (left.priority ?? 0) ||
      left.id.localeCompare(right.id),
  )

  return Object.freeze({
    extensions:
      Object.freeze([...input]),

    shapeUtils:
      Object.freeze(shapeUtils),

    bindingUtils:
      Object.freeze(bindingUtils),

    tools:
      Object.freeze(tools),

    shapeLabels:
      Object.freeze(shapeLabels),

    inspectorSections:
      Object.freeze(inspectorSections),
  })
}

function validateInspectorSection(
  extensionId: string,
  section: HybridCanvasInspectorSectionContribution,
  sectionIds: Set<string>,
): void {
  if (
    !section.id.trim() ||
    sectionIds.has(section.id)
  ) {
    throw new Error(
      'EXTENSION_INSPECTOR_SECTION_ID_INVALID:' +
        extensionId,
    )
  }

  if (!section.owner.trim()) {
    throw new Error(
      'EXTENSION_INSPECTOR_SECTION_OWNER_REQUIRED:' +
        extensionId,
    )
  }

  if (
    section.owner !== extensionId
  ) {
    throw new Error(
      'EXTENSION_INSPECTOR_SECTION_OWNER_MISMATCH:' +
        extensionId,
    )
  }

  if (
    typeof section.component !==
    'function'
  ) {
    throw new Error(
      'EXTENSION_INSPECTOR_SECTION_COMPONENT_REQUIRED:' +
        extensionId,
    )
  }

  const hasToolTargets =
    (section.toolIds?.length ?? 0) > 0

  const hasShapeTargets =
    (section.shapeTypes?.length ?? 0) > 0

  if (
    !hasToolTargets &&
    !hasShapeTargets
  ) {
    throw new Error(
      'EXTENSION_INSPECTOR_SECTION_TARGET_REQUIRED:' +
        extensionId,
    )
  }

  if (
    section.priority !== undefined &&
    !Number.isFinite(section.priority)
  ) {
    throw new Error(
      'EXTENSION_INSPECTOR_SECTION_PRIORITY_INVALID:' +
        extensionId,
    )
  }

  sectionIds.add(section.id)
}
`

  await write(
    'editor/core/src/contracts/extension-contract.ts',
    content,
  )
}

async function updatePublicExports() {
  for (
    const relativePath of [
      'editor/core/src/contracts/public-api.ts',
      'editor/core/src/extensions-public-api.ts',
    ]
  ) {
    await update(
      relativePath,
      (source) => {
        const anchor =
          '  type HybridCanvasExtension,'

        if (
          source.includes(
            'HybridCanvasInspectorSectionContribution',
          )
        ) {
          return source
        }

        return replaceRequired(
          source,
          anchor,
          `${anchor}
  type HybridCanvasInspectorSectionContribution,
  type HybridCanvasInspectorSectionMode,
  type HybridCanvasInspectorSectionProps,`,
          relativePath,
        )
      },
    )
  }
}

async function createFlowNodeSection() {
  const content = `import type {
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
`

  await write(
    'features/flowchart/src/presentation/FlowNodeInspectorSection.tsx',
    content,
  )
}

async function createScientificChartSection() {
  const content = `import type {
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
`

  await write(
    'features/scientific-plot/src/presentation/ScientificChartInspectorSection.tsx',
    content,
  )
}

async function registerFlowNodeSection() {
  await update(
    'features/flowchart/src/extension.ts',
    (source) => {
      if (
        source.includes(
          'FlowNodeInspectorSection',
        )
      ) {
        return source
      }

      source = source.replace(
        `import { FlowNodeShapeUtil } from './shapes/FlowNodeShapeUtil'`,
        `import { FlowNodeInspectorSection } from './presentation/FlowNodeInspectorSection'
import { FlowNodeShapeUtil } from './shapes/FlowNodeShapeUtil'`,
      )

      return source.replace(
        `  shapeLabels: {
    'flow-node': '流程图节点',
  },`,
        `  shapeLabels: {
    'flow-node': '流程图节点',
  },
  inspectorSections: [
    {
      id: 'flow-node-properties',
      owner: '@hybrid-canvas/flowchart',
      priority: 100,
      shapeTypes: ['flow-node'],
      component: FlowNodeInspectorSection,
    },
  ],`,
      )
    },
  )
}

async function registerScientificChartSection() {
  await update(
    'features/scientific-plot/src/extension.ts',
    (source) => {
      if (
        source.includes(
          'ScientificChartInspectorSection',
        )
      ) {
        return source
      }

      source = source.replace(
        `import { ScientificChartShapeUtil } from './shapes/ScientificChartShapeUtil'`,
        `import { ScientificChartInspectorSection } from './presentation/ScientificChartInspectorSection'
import { ScientificChartShapeUtil } from './shapes/ScientificChartShapeUtil'`,
      )

      return source.replace(
        `  shapeLabels: {
    'scientific-chart': '图表',
  },`,
        `  shapeLabels: {
    'scientific-chart': '图表',
  },
  inspectorSections: [
    {
      id: 'scientific-chart-properties',
      owner: '@hybrid-canvas/scientific-plot',
      priority: 100,
      toolIds: ['scientific-chart'],
      shapeTypes: ['scientific-chart'],
      component: ScientificChartInspectorSection,
    },
  ],`,
      )
    },
  )
}

async function updateEditorCanvas() {
  await update(
    'editor/core/src/react/EditorCanvas.tsx',
    (source) => {
      if (
        source.includes(
          'inspectorSections={',
        )
      ) {
        return source
      }

      source = replaceRequired(
        source,
        `<CanvasInspectorStylePanel
                active={isActive}
              />`,
        `<CanvasInspectorStylePanel
                active={isActive}
                inspectorSections={
                  registration.inspectorSections
                }
              />`,
        'EditorCanvas StylePanel',
      )

      return replaceRequired(
        source,
        `      [isActive],`,
        `      [
        isActive,
        registration.inspectorSections,
      ],`,
        'EditorCanvas components dependencies',
      )
    },
  )
}

async function updateInspectorPortal() {
  await update(
    'editor/core/src/react/canvas-inspector-portal.tsx',
    (source) => {
      if (
        source.includes(
          'matchingInspectorSections',
        )
      ) {
        return source
      }

      source = source.replace(
        `import { PropertiesInspectorContent } from './PropertiesInspectorContent'`,
        `import type {
  HybridCanvasInspectorSectionContribution,
  HybridCanvasInspectorSectionMode,
} from '../contracts/extension-contract'
import { PropertiesInspectorContent } from './PropertiesInspectorContent'`,
      )

      source = replaceRequired(
        source,
        `export interface CanvasInspectorStylePanelProps {
  readonly active: boolean
}`,
        `export interface CanvasInspectorStylePanelProps {
  readonly active: boolean
  readonly inspectorSections:
    readonly HybridCanvasInspectorSectionContribution[]
}`,
        'CanvasInspectorStylePanelProps',
      )

      source = replaceRequired(
        source,
        `export function CanvasInspectorStylePanel({
  active,
}: CanvasInspectorStylePanelProps) {`,
        `export function CanvasInspectorStylePanel({
  active,
  inspectorSections,
}: CanvasInspectorStylePanelProps) {`,
        'CanvasInspectorStylePanel arguments',
      )

      const ownerAnchor = `  const owner =
    useRef(
      Symbol(
        'canvas-inspector-style-panel',
      ),
    )`

      const sectionState = `${ownerAnchor}

  const inspectorTarget =
    useValue(
      'properties inspector extension target',
      () => {
        const selected =
          editor.getSelectedShapes()

        if (selected.length > 0) {
          return {
            mode:
              'selection' as const,
            toolId: null,
            shapeTypes:
              selected.map(
                (shape) =>
                  shape.type,
              ),
          }
        }

        return {
          mode:
            'creation' as const,
          toolId:
            editor.getCurrentToolId(),
          shapeTypes:
            [] as string[],
        }
      },
      [editor],
    )

  const matchingInspectorSections =
    useMemo(
      () =>
        inspectorSections.filter(
          (section) => {
            if (
              inspectorTarget.mode ===
              'creation'
            ) {
              return (
                inspectorTarget.toolId !==
                  null &&
                section.toolIds?.includes(
                  inspectorTarget.toolId,
                ) === true
              )
            }

            return (
              inspectorTarget.shapeTypes
                .length > 0 &&
              inspectorTarget.shapeTypes.every(
                (shapeType) =>
                  section.shapeTypes?.includes(
                    shapeType,
                  ) === true,
              )
            )
          },
        ),
      [
        inspectorSections,
        inspectorTarget,
      ],
    )

  const inspectorMode:
    HybridCanvasInspectorSectionMode =
    inspectorTarget.mode

  const extensionSections =
    matchingInspectorSections.map(
      (section) => {
        const Section =
          section.component

        return (
          <Section
            editor={editor}
            key={
              section.owner +
              ':' +
              section.id
            }
            mode={inspectorMode}
          />
        )
      },
    )`

      source = replaceRequired(
        source,
        ownerAnchor,
        sectionState,
        'Inspector portal owner',
      )

      source = replaceRequired(
        source,
        `      styles !== null ||
      selectedShapeCount > 0`,
        `      styles !== null ||
      selectedShapeCount > 0 ||
      matchingInspectorSections.length > 0`,
        'Inspector availability',
      )

      source = source.replaceAll(
        `          styles={styles}
        />`,
        `          extensionSections={
            extensionSections
          }
          styles={styles}
        />`,
      )

      source = source.replaceAll(
        `          styles={null}
        />`,
        `          extensionSections={
            extensionSections
          }
          styles={null}
        />`,
      )

      return source
    },
  )
}

async function updatePropertiesContent() {
  await update(
    'editor/core/src/react/PropertiesInspectorContent.tsx',
    (source) => {
      if (
        source.includes(
          'readonly extensionSections:',
        )
      ) {
        return source
      }

      source = replaceRequired(
        source,
        `  readonly selectedShapeCount: number
}`,
        `  readonly selectedShapeCount: number
  readonly extensionSections:
    readonly ReactNode[]
}`,
        'PropertiesInspectorContentProps',
      )

      source = replaceRequired(
        source,
        `export function PropertiesInspectorContent({
  styles,
  selectedShapeCount,
}: PropertiesInspectorContentProps) {`,
        `export function PropertiesInspectorContent({
  styles,
  selectedShapeCount,
  extensionSections,
}: PropertiesInspectorContentProps) {`,
        'PropertiesInspectorContent arguments',
      )

      return replaceRequired(
        source,
        `      {selectedShapeCount > 0 ? (
        <SelectionActions`,
        `      {extensionSections}

      {selectedShapeCount > 0 ? (
        <SelectionActions`,
        'PropertiesInspectorContent sections',
      )
    },
  )
}

async function updateArchitectureTest() {
  await update(
    'tests/architecture/check-properties-inspector-architecture.mjs',
    (source) => {
      if (
        source.includes(
          'Extension API 必须使用 Section contribution',
        )
      ) {
        return source
      }

      const anchor = `forbidPattern(
  'ExtensionContract',
  sources.extensionContract,
  /toolInspectors/,
  'Extension API 不得恢复 tool-first Inspector',
)
`

      return replaceRequired(
        source,
        anchor,
        `${anchor}
requirePattern(
  'ExtensionContract',
  sources.extensionContract,
  /inspectorSections/,
  'Extension API 必须使用 Section contribution',
)
`,
        'Architecture extension test',
      )
    },
  )
}

async function update(
  relativePath,
  transform,
) {
  const filePath =
    path.join(
      root,
      relativePath,
    )

  const previous =
    normalize(
      await readFile(
        filePath,
        'utf8',
      ),
    )

  const next =
    transform(previous)

  await writeFile(
    filePath,
    next.trimEnd() + '\n',
    'utf8',
  )
}

async function write(
  relativePath,
  content,
) {
  const filePath =
    path.join(
      root,
      relativePath,
    )

  await mkdir(
    path.dirname(filePath),
    {
      recursive: true,
    },
  )

  await writeFile(
    filePath,
    normalize(content).trimEnd() +
      '\n',
    'utf8',
  )
}

function replaceRequired(
  source,
  oldValue,
  newValue,
  owner,
) {
  if (
    !source.includes(oldValue)
  ) {
    throw new Error(
      '没有找到修改位置：' +
        owner,
    )
  }

  return source.replace(
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