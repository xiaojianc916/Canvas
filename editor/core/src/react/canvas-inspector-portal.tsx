import {
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
