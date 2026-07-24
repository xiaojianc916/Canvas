#!/usr/bin/env node

/**
 * Properties Inspector V1
 *
 * 内容：
 * - tldraw 官方 StylePanel 外观控件
 * - 官方 shared/mixed styles
 * - 官方对齐与分布 actions
 * - 官方编组、复制、删除 actions
 * - 官方图标
 *
 * 不包含：
 * - 描述小字
 * - 工具教程
 * - Transform 数值输入
 * - Shape 专属业务属性
 *
 * 不创建备份，回滚使用 Git。
 */

import {
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

const paths = {
  portal: resolve(
    'editor/core/src/react/canvas-inspector-portal.tsx',
  ),

  inspectorHost: resolve(
    'features/workspace/src/presentation/inspector/InspectorHost.tsx',
  ),

  appCss: resolve(
    'apps/desktop/src/app.css',
  ),
}

const CSS_MARKER =
  '/* hybrid-canvas:properties-inspector-v1 */'

await assertRepository()

await write(
  paths.portal,
  createInspectorPortal(),
)

await write(
  paths.inspectorHost,
  createInspectorHost(),
)

await updateAppCss()
printSummary()

function createInspectorPortal() {
  return `import {
  createContext,
  isValidElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  DefaultStylePanel,
  DefaultStylePanelContent,
  TldrawUiIcon,
  type TLUiActionItem,
  useActions,
  useEditor,
  useRelevantStyles,
  useValue,
} from 'tldraw'

interface CanvasInspectorPortalContextValue {
  readonly host: HTMLElement | null
  readonly available: boolean
  readonly setHost: (
    host: HTMLElement | null,
  ) => void
  readonly publishAvailability: (
    owner: symbol,
    available: boolean,
  ) => void
  readonly releaseAvailability: (
    owner: symbol,
  ) => void
}

const CanvasInspectorPortalContext =
  createContext<CanvasInspectorPortalContextValue | null>(
    null,
  )

export interface CanvasInspectorPortalProviderProps {
  readonly children: ReactNode
}

export function CanvasInspectorPortalProvider({
  children,
}: CanvasInspectorPortalProviderProps) {
  const [host, setHostState] =
    useState<HTMLElement | null>(null)

  const [available, setAvailable] =
    useState(false)

  const publishers =
    useRef(
      new Map<symbol, boolean>(),
    )

  const setHost = useCallback(
    (
      nextHost:
        | HTMLElement
        | null,
    ) => {
      setHostState(nextHost)
    },
    [],
  )

  const recomputeAvailability =
    useCallback(() => {
      setAvailable(
        Array.from(
          publishers.current.values(),
        ).some(Boolean),
      )
    }, [])

  const publishAvailability =
    useCallback(
      (
        owner: symbol,
        nextAvailable: boolean,
      ) => {
        publishers.current.set(
          owner,
          nextAvailable,
        )

        recomputeAvailability()
      },
      [recomputeAvailability],
    )

  const releaseAvailability =
    useCallback(
      (owner: symbol) => {
        publishers.current.delete(
          owner,
        )

        recomputeAvailability()
      },
      [recomputeAvailability],
    )

  const value =
    useMemo<CanvasInspectorPortalContextValue>(
      () => ({
        host,
        available,
        setHost,
        publishAvailability,
        releaseAvailability,
      }),
      [
        host,
        available,
        setHost,
        publishAvailability,
        releaseAvailability,
      ],
    )

  return (
    <CanvasInspectorPortalContext.Provider
      value={value}
    >
      {children}
    </CanvasInspectorPortalContext.Provider>
  )
}

export function CanvasInspectorDock() {
  const context =
    useRequiredCanvasInspectorPortal()

  const setHost =
    context.setHost

  const ref = useCallback(
    (
      node:
        | HTMLDivElement
        | null,
    ) => {
      setHost(node)
    },
    [setHost],
  )

  return (
    <div
      className="hc-properties-inspector-dock"
      data-properties-inspector-dock=""
      ref={ref}
    />
  )
}

export function useCanvasInspectorAvailability(): boolean {
  return useRequiredCanvasInspectorPortal()
    .available
}

export interface CanvasInspectorStylePanelProps {
  readonly active: boolean
}

export function CanvasInspectorStylePanel({
  active,
}: CanvasInspectorStylePanelProps) {
  const context =
    useRequiredCanvasInspectorPortal()

  const editor = useEditor()
  const styles =
    useRelevantStyles()

  const selectedShapeCount =
    useValue(
      'properties inspector selected shape count',
      () =>
        editor
          .getSelectedShapeIds()
          .length,
      [editor],
    )

  const owner =
    useRef(
      Symbol(
        'canvas-inspector-style-panel',
      ),
    )

  /*
   * useRelevantStyles() 决定官方样式内容。
   *
   * selectedShapeCount > 0 保证 Image、Frame、Group
   * 等没有普通 StyleProp 的对象仍可显示对象操作。
   */
  const available =
    active &&
    (
      styles !== null ||
      selectedShapeCount > 0
    )

  useEffect(() => {
    const currentOwner =
      owner.current

    context.publishAvailability(
      currentOwner,
      available,
    )

    return () => {
      context.releaseAvailability(
        currentOwner,
      )
    }
  }, [
    available,
    context.publishAvailability,
    context.releaseAvailability,
  ])

  if (
    !active ||
    !context.host ||
    !available
  ) {
    return null
  }

  return createPortal(
    styles ? (
      <DefaultStylePanel
        isMobile={false}
        styles={styles}
      >
        <DefaultStylePanelContent />

        {selectedShapeCount > 0 ? (
          <SelectionActionSections
            selectedShapeCount={
              selectedShapeCount
            }
          />
        ) : null}
      </DefaultStylePanel>
    ) : (
      <div
        className="tlui-style-panel tlui-style-panel__wrapper"
        data-testid="style.panel"
      >
        <SelectionActionSections
          selectedShapeCount={
            selectedShapeCount
          }
        />
      </div>
    ),
    context.host,
  )
}

interface SelectionActionSectionsProps {
  readonly selectedShapeCount: number
}

function SelectionActionSections({
  selectedShapeCount,
}: SelectionActionSectionsProps) {
  const actions =
    useActions()

  return (
    <>
      {selectedShapeCount >= 2 ? (
        <InspectorActionSection
          label="排列"
        >
          <InspectorActionButton
            action={
              actions[
                'align-left'
              ]
            }
            title="左对齐"
          />

          <InspectorActionButton
            action={
              actions[
                'align-center-horizontal'
              ]
            }
            title="水平居中"
          />

          <InspectorActionButton
            action={
              actions[
                'align-right'
              ]
            }
            title="右对齐"
          />

          <InspectorActionButton
            action={
              actions[
                'align-top'
              ]
            }
            title="顶部对齐"
          />

          <InspectorActionButton
            action={
              actions[
                'align-center-vertical'
              ]
            }
            title="垂直居中"
          />

          <InspectorActionButton
            action={
              actions[
                'align-bottom'
              ]
            }
            title="底部对齐"
          />

          {selectedShapeCount >= 3 ? (
            <>
              <InspectorActionButton
                action={
                  actions[
                    'distribute-horizontal'
                  ]
                }
                title="水平分布"
              />

              <InspectorActionButton
                action={
                  actions[
                    'distribute-vertical'
                  ]
                }
                title="垂直分布"
              />
            </>
          ) : null}
        </InspectorActionSection>
      ) : null}

      <InspectorActionSection
        label="对象"
      >
        <InspectorActionButton
          action={
            actions.group
          }
          title="编组或取消编组"
        />

        <InspectorActionButton
          action={
            actions.duplicate
          }
          title="创建副本"
        />

        <InspectorActionButton
          action={
            actions.delete
          }
          destructive
          title="删除"
        />
      </InspectorActionSection>
    </>
  )
}

interface InspectorActionSectionProps {
  readonly label: string
  readonly children: ReactNode
}

function InspectorActionSection({
  label,
  children,
}: InspectorActionSectionProps) {
  return (
    <section
      aria-label={label}
      className="hc-properties-inspector-section"
    >
      <div className="hc-properties-inspector-section__label">
        {label}
      </div>

      <div className="hc-properties-inspector-actions">
        {children}
      </div>
    </section>
  )
}

interface InspectorActionButtonProps {
  readonly action:
    | TLUiActionItem
    | undefined
  readonly title: string
  readonly destructive?: boolean
}

function InspectorActionButton({
  action,
  title,
  destructive = false,
}: InspectorActionButtonProps) {
  if (
    !action ||
    !action.icon
  ) {
    return null
  }

  const icon =
    typeof action.icon === 'string' ||
    isValidElement(action.icon)
      ? action.icon
      : 'question-mark-circle'

  return (
    <button
      aria-label={title}
      className={
        destructive
          ? 'hc-properties-inspector-action hc-properties-inspector-action--destructive'
          : 'hc-properties-inspector-action'
      }
      data-action-id={
        action.id
      }
      onClick={() => {
        void action.onSelect(
          'toolbar',
        )
      }}
      title={title}
      type="button"
    >
      <TldrawUiIcon
        icon={icon}
        label={title}
        small
      />
    </button>
  )
}

function useRequiredCanvasInspectorPortal(): CanvasInspectorPortalContextValue {
  const context =
    useContext(
      CanvasInspectorPortalContext,
    )

  if (!context) {
    throw new Error(
      'CANVAS_INSPECTOR_PORTAL_PROVIDER_MISSING',
    )
  }

  return context
}
`
}

function createInspectorHost() {
  return `import {
  ScrollArea,
} from '@hybrid-canvas/design-system'
import type {
  ReactNode,
} from 'react'

export interface InspectorHostProps {
  readonly children: ReactNode
}

/**
 * 只拥有右栏布局和滚动。
 *
 * Editor 状态、样式相关性和对象操作均由
 * tldraw StylePanel slot 提供。
 */
export function InspectorHost({
  children,
}: InspectorHostProps) {
  return (
    <aside
      aria-label="属性检查器"
      className="flex h-full min-h-0 min-w-0 flex-col border-l border-divider bg-sidebar"
    >
      <ScrollArea
        className="min-h-0 flex-1"
      >
        <div className="hc-properties-inspector-host">
          {children}
        </div>
      </ScrollArea>
    </aside>
  )
}
`
}

async function updateAppCss() {
  let source = normalize(
    await readFile(
      paths.appCss,
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
    createInspectorCss() +
    '\n'

  await write(
    paths.appCss,
    source,
  )
}

function createInspectorCss() {
  return `${CSS_MARKER}

/*
 * Workspace Dock 填满右栏。
 */
.hc-properties-inspector-host,
.hc-properties-inspector-dock {
  width: 100%;
  min-width: 0;
  min-height: 100%;
}

/*
 * Portal 后的官方 StylePanel 不再使用画布浮层定位。
 * 保留官方按钮、图例、选中态、颜色和控件布局。
 */
.hc-properties-inspector-dock
  .tlui-style-panel {
  position: relative;
  inset: auto;
  width: 100%;
  max-width: none;
  min-width: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  background: transparent;
}

/*
 * 不修改官方各个 picker 内部样式。
 * 仅确保官方 Section 使用右栏宽度。
 */
.hc-properties-inspector-dock
  .tlui-style-panel__section {
  width: 100%;
}

/*
 * 自定义扩展区域只使用必要标题，
 * 不显示描述性小字。
 */
.hc-properties-inspector-section {
  width: 100%;
  padding: 10px 8px;
  border-top: 1px solid
    var(
      --color-divider,
      rgba(0, 0, 0, 0.1)
    );
}

.hc-properties-inspector-section__label {
  margin: 0 0 6px;
  color: var(
    --color-text-3,
    rgba(0, 0, 0, 0.58)
  );
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
}

/*
 * 图标按钮与官方 StylePanel 的紧凑尺寸保持一致。
 */
.hc-properties-inspector-actions {
  display: grid;
  grid-template-columns:
    repeat(6, minmax(0, 1fr));
  gap: 4px;
}

.hc-properties-inspector-action {
  display: grid;
  width: 100%;
  min-width: 0;
  height: 32px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(
    --color-text-1,
    currentColor
  );
  cursor: pointer;
}

.hc-properties-inspector-action:hover {
  background: var(
    --color-low,
    rgba(0, 0, 0, 0.06)
  );
}

.hc-properties-inspector-action:focus-visible {
  outline: 2px solid
    var(
      --color-focus,
      var(--color-primary)
    );
  outline-offset: -2px;
}

.hc-properties-inspector-action--destructive {
  color: var(
    --color-destructive,
    #c62828
  );
}

.hc-properties-inspector-action--destructive:hover {
  background:
    color-mix(
      in oklab,
      var(
        --color-destructive,
        #c62828
      ) 10%,
      transparent
    );
}

/*
 * 官方图标尺寸，不引入第二套 SVG。
 */
.hc-properties-inspector-action
  .tlui-icon {
  width: 18px;
  height: 18px;
}`
}

async function assertRepository() {
  await Promise.all([
    readFile(
      resolve('AGENTS.md'),
      'utf8',
    ),

    readFile(
      paths.portal,
      'utf8',
    ),

    readFile(
      paths.inspectorHost,
      'utf8',
    ),

    readFile(
      paths.appCss,
      'utf8',
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

function resolve(relativePath) {
  return path.join(
    root,
    relativePath,
  )
}

function normalize(source) {
  return source.replaceAll(
    '\r\n',
    '\n',
  )
}

function finish(source) {
  return (
    normalize(source).trimEnd() +
    '\n'
  )
}

function printSummary() {
  console.log('')
  console.log(
    'Properties Inspector V1 已完成。',
  )
  console.log('')
  console.log('内容：')
  console.log(
    '  - 官方 StylePanel 图标和图例',
  )
  console.log(
    '  - 官方 shared/mixed styles',
  )
  console.log(
    '  - 官方对齐和分布 actions',
  )
  console.log(
    '  - 官方编组、复制、删除 actions',
  )
  console.log(
    '  - 无说明小字和工具教程',
  )
  console.log('')
  console.log('验证：')
  console.log('  pnpm format')
  console.log('  pnpm lint')
  console.log('  pnpm typecheck')
  console.log('  pnpm test:architecture')
  console.log('  pnpm test')
  console.log('  pnpm build:desktop')
  console.log('')
}