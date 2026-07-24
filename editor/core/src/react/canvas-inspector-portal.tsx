import {
  createContext,
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
  useRelevantStyles,
} from 'tldraw'

interface CanvasInspectorPortalContextValue {
  readonly host: HTMLElement | null
  readonly available: boolean
  readonly setHost: (host: HTMLElement | null) => void
  readonly publishAvailability: (
    owner: symbol,
    available: boolean,
  ) => void
  readonly releaseAvailability: (owner: symbol) => void
}

const CanvasInspectorPortalContext =
  createContext<CanvasInspectorPortalContextValue | null>(null)

export interface CanvasInspectorPortalProviderProps {
  readonly children: ReactNode
}

/**
 * tldraw StylePanel 与 Workspace Dock 之间唯一的 UI 桥。
 *
 * 这里只传递：
 * - Portal DOM host
 * - 是否存在实际 Inspector 内容
 *
 * 不传递：
 * - selected shapes
 * - current tool
 * - shared styles
 * - shape props
 *
 * 因此 Workspace 不会成为 Editor 状态的第二事实来源。
 */
export function CanvasInspectorPortalProvider({
  children,
}: CanvasInspectorPortalProviderProps) {
  const [host, setHostState] =
    useState<HTMLElement | null>(null)

  const [available, setAvailable] =
    useState(false)

  const publishers =
    useRef(new Map<symbol, boolean>())

  const setHost = useCallback(
    (nextHost: HTMLElement | null) => {
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
        publishers.current.delete(owner)
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

/**
 * Workspace 右栏中的 Portal 挂载点。
 *
 * Workspace 只渲染容器，不解析 Editor 状态。
 */
export function CanvasInspectorDock() {
  const context =
    useRequiredCanvasInspectorPortal()

  const setHost = context.setHost

  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      setHost(node)
    },
    [setHost],
  )

  return (
    <div
      className="hc-properties-inspector-dock min-h-0 min-w-0"
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

/**
 * tldraw 官方 StylePanel slot。
 *
 * useRelevantStyles 是 Inspector 是否存在的官方依据：
 * - 有选区时：返回选区相关共享样式；
 * - 无选区且当前工具创建 Shape 时：返回下一 Shape 样式；
 * - 无相关样式时：返回 null。
 *
 * 当前阶段只渲染官方 DefaultStylePanel，
 * 不加入自定义对象属性、排列或 Feature 专属 Section。
 */
export function CanvasInspectorStylePanel({
  active,
}: CanvasInspectorStylePanelProps) {
  const context =
    useRequiredCanvasInspectorPortal()

  const styles = useRelevantStyles()

  const owner =
    useRef(Symbol('canvas-inspector-style-panel'))

  const available =
    active &&
    styles !== null

  useEffect(() => {
    const currentOwner = owner.current

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
    !styles ||
    !context.host
  ) {
    return null
  }

  /*
   * Portal 不会切断 React Context。
   * DefaultStylePanel 仍然处于 tldraw UI Provider 内，
   * 因而可以继续安全使用官方 hooks、actions、translations
   * 和 StylePanelContext。
   */
  return createPortal(
    <DefaultStylePanel
      isMobile={false}
      styles={styles}
    />,
    context.host,
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
