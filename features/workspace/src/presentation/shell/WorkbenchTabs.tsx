import {
  Boxes,
  ChartNoAxesCombined,
  FilePlus2,
  FileText,
  Files,
  Grid2X2,
  Image,
  Layers3,
  Network,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { type ComponentType, type DragEvent, type KeyboardEvent, useEffect, useRef } from 'react'

import type { WorkbenchTabId, WorkbenchTabViewModel } from '../../contracts/workbench-contract'

import './chrome-workbench-tabs.css'

export interface WorkbenchTabsProps {
  readonly tabs: readonly WorkbenchTabViewModel[]
  readonly onActivate: (tabId: WorkbenchTabId) => void
  readonly onClose: (tabId: WorkbenchTabId) => void
  readonly onMove: (tabId: WorkbenchTabId, targetIndex: number) => void
  readonly onCreate: () => void
}

type TabIcon = ComponentType<{
  readonly className?: string
  readonly 'aria-hidden'?: boolean | 'true' | 'false'
}>

export function WorkbenchTabs({ tabs, onActivate, onClose, onMove, onCreate }: WorkbenchTabsProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  const tabRefs = useRef(new Map<WorkbenchTabId, HTMLButtonElement>())

  const draggedTabIdRef = useRef<WorkbenchTabId | null>(null)

  const activeTabId = tabs.find((tab) => tab.isActive)?.id

  const previousActiveTabIdRef = useRef<WorkbenchTabId | undefined>(activeTabId)

  useEffect(() => {
    const previousActiveTabId = previousActiveTabIdRef.current

    if (previousActiveTabId && previousActiveTabId !== activeTabId) {
      const previousActivation = tabRefs.current.get(previousActiveTabId)

      const previousTab = previousActivation?.closest<HTMLElement>('.chrome-workbench-tab')

      /*
       * A browser may retain :hover on the element that just lost its
       * active appearance for one paint frame. Suppress that hover
       * until the pointer genuinely leaves the old tab.
       */
      if (previousTab?.matches(':hover')) {
        previousTab.setAttribute('data-suppress-hover', 'true')
      }
    }

    if (activeTabId) {
      const activeActivation = tabRefs.current.get(activeTabId)

      const activeTab = activeActivation?.closest<HTMLElement>('.chrome-workbench-tab')

      activeTab?.removeAttribute('data-suppress-hover')
    }

    previousActiveTabIdRef.current = activeTabId
  }, [activeTabId])

  useEffect(() => {
    if (!activeTabId) {
      return
    }

    tabRefs.current.get(activeTabId)?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    })
  }, [activeTabId])

  function handleKeyboard(event: KeyboardEvent<HTMLButtonElement>, tabId: WorkbenchTabId): void {
    const currentIndex = tabs.findIndex((tab) => tab.id === tabId)

    if (currentIndex < 0) {
      return
    }

    let targetIndex: number | null = null

    switch (event.key) {
      case 'ArrowLeft':
        targetIndex = (currentIndex - 1 + tabs.length) % tabs.length
        break

      case 'ArrowRight':
        targetIndex = (currentIndex + 1) % tabs.length
        break

      case 'Home':
        targetIndex = 0
        break

      case 'End':
        targetIndex = tabs.length - 1
        break

      case 'Delete': {
        const tab = tabs[currentIndex]

        if (tab?.canClose) {
          event.preventDefault()
          onClose(tab.id)
        }

        return
      }

      default:
        return
    }

    const target = tabs[targetIndex]

    if (!target) {
      return
    }

    event.preventDefault()
    onActivate(target.id)

    requestAnimationFrame(() => {
      tabRefs.current.get(target.id)?.focus()
    })
  }

  function handleDragStart(event: DragEvent<HTMLElement>, tab: WorkbenchTabViewModel): void {
    if (!tab.canClose) {
      event.preventDefault()
      return
    }

    draggedTabIdRef.current = tab.id

    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-hybrid-canvas-workbench-tab', tab.id)
  }

  function handleDrop(event: DragEvent<HTMLElement>, targetIndex: number): void {
    event.preventDefault()

    const draggedTabId =
      draggedTabIdRef.current ??
      event.dataTransfer.getData('application/x-hybrid-canvas-workbench-tab')

    draggedTabIdRef.current = null

    if (draggedTabId) {
      onMove(draggedTabId, targetIndex)
    }
  }

  return (
    <div className="chrome-workbench-tabs">
      <div
        aria-label="工作台标签页"
        className="chrome-workbench-tabs__scroller"
        onWheel={(event) => {
          const scroller = scrollerRef.current

          if (!scroller || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
            return
          }

          scroller.scrollLeft += event.deltaY
        }}
        ref={scrollerRef}
        role="tablist"
      >
        {tabs.map((tab, index) => {
          const Icon = resolveTabIcon(tab)

          return (
            <article
              className="chrome-workbench-tab"
              data-active={tab.isActive ? 'true' : 'false'}
              draggable={tab.canClose}
              key={tab.id}
              onDragEnd={() => {
                draggedTabIdRef.current = null
              }}
              onDragOver={(event) => {
                if (draggedTabIdRef.current) {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                }
              }}
              onDragStart={(event) => handleDragStart(event, tab)}
              onDrop={(event) => handleDrop(event, index)}
              onPointerLeave={(event) => {
                event.currentTarget.removeAttribute('data-suppress-hover')
              }}
              onMouseDown={(event) => {
                if (event.button === 1 && tab.canClose) {
                  event.preventDefault()
                  onClose(tab.id)
                }
              }}
            >
              <ChromeActiveTabShape />

              <span aria-hidden="true" className="chrome-workbench-tab__separator" />

              <div className="chrome-workbench-tab__content">
                <button
                  aria-controls={'workbench-panel-' + encodeDomId(tab.id)}
                  aria-selected={tab.isActive}
                  className="chrome-workbench-tab__activation"
                  id={'workbench-tab-' + encodeDomId(tab.id)}
                  onClick={() => onActivate(tab.id)}
                  onKeyDown={(event) => handleKeyboard(event, tab.id)}
                  ref={(node) => {
                    if (node) {
                      tabRefs.current.set(tab.id, node)
                    } else {
                      tabRefs.current.delete(tab.id)
                    }
                  }}
                  role="tab"
                  tabIndex={tab.isActive ? 0 : -1}
                  title={tab.title}
                  type="button"
                >
                  <Icon aria-hidden="true" className="chrome-workbench-tab__icon" />

                  <span className="chrome-workbench-tab__title">{tab.title}</span>
                </button>

                <TabEndAction model={tab} onClose={onClose} />
              </div>
            </article>
          )
        })}

        <button
          aria-label="新建画板"
          className="chrome-workbench-tabs__new-tab"
          onClick={onCreate}
          type="button"
        >
          <Plus aria-hidden="true" className="size-3.5" />
        </button>

        <div
          aria-hidden="true"
          className="chrome-workbench-tabs__drag-region"
          data-tauri-drag-region
        />
      </div>
    </div>
  )
}

function ChromeActiveTabShape() {
  return (
    <div aria-hidden="true" className="chrome-workbench-tab__active-shape">
      <svg
        className="chrome-workbench-tab__active-cap chrome-workbench-tab__active-cap--left"
        preserveAspectRatio="xMinYMin meet"
        viewBox="0 0 20 32"
      >
        <path
          className="chrome-workbench-tab__active-cap-fill"
          d="M0 32C5.5 32 9.5 28 9.5 23V10C9.5 5.6 13.1 2 17.5 2H20V32Z"
        />

        <path
          className="chrome-workbench-tab__active-cap-outline"
          d="M0 31.5C5.5 31.5 9.5 27.7 9.5 23V10C9.5 5.9 13.1 2.5 17.5 2.5H20"
        />
      </svg>

      <span className="chrome-workbench-tab__active-center" />

      <svg
        className="chrome-workbench-tab__active-cap chrome-workbench-tab__active-cap--right"
        preserveAspectRatio="xMinYMin meet"
        viewBox="0 0 20 32"
      >
        <path
          className="chrome-workbench-tab__active-cap-fill"
          d="M0 32C5.5 32 9.5 28 9.5 23V10C9.5 5.6 13.1 2 17.5 2H20V32Z"
        />

        <path
          className="chrome-workbench-tab__active-cap-outline"
          d="M0 31.5C5.5 31.5 9.5 27.7 9.5 23V10C9.5 5.9 13.1 2.5 17.5 2.5H20"
        />
      </svg>
    </div>
  )
}

function TabEndAction({
  model,
  onClose,
}: {
  readonly model: WorkbenchTabViewModel
  readonly onClose: (tabId: WorkbenchTabId) => void
}) {
  if (!model.canClose) {
    return null
  }

  const status = model.kind === 'canvas' ? model.status : undefined

  return (
    <div className="chrome-workbench-tab__end">
      {status && status !== 'clean' ? (
        <span
          aria-label={status === 'dirty' ? '未保存' : status === 'saving' ? '正在保存' : '保存失败'}
          className={'chrome-workbench-tab__status ' + 'chrome-workbench-tab__status--' + status}
        />
      ) : null}

      <button
        aria-label={'关闭 ' + model.title}
        className="chrome-workbench-tab__close"
        onClick={(event) => {
          event.stopPropagation()
          onClose(model.id)
        }}
        tabIndex={-1}
        type="button"
      >
        <X aria-hidden="true" className="size-3.5" />
      </button>
    </div>
  )
}

function resolveTabIcon(model: WorkbenchTabViewModel): TabIcon {
  if (model.kind === 'start') {
    return FilePlus2
  }

  if (model.kind === 'canvas') {
    return FileText
  }

  switch (model.surfaceId) {
    case 'pages':
      return Grid2X2
    case 'documents':
      return Files
    case 'search':
      return Search
    case 'layers':
      return Layers3
    case 'relations':
      return Network
    case 'data':
      return ChartNoAxesCombined
    case 'assets':
      return Image
    case 'extensions':
      return Boxes
  }
}

function encodeDomId(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9_-]/g, '-')
}
