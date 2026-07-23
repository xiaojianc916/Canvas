import { error as reportError } from '@hybrid-canvas/foundations-observability'
import { DangerCircle, X } from '@mynaui/icons-react'
import { useEffect, useState } from 'react'

const EVENT_NAME = 'hybrid-canvas:ui-feedback'

const USER_MESSAGES: Readonly<Record<string, string>> = {
  'canvas save failed': '画布保存失败，请重试。',

  'canvas open failed': '无法打开画布，请检查文件后重试。',

  'canvas close request failed': '无法关闭画布，请重试。',

  'discard and close canvas failed': '无法放弃更改并关闭画布。',

  'main window minimize failed': '窗口最小化失败。',

  'main window maximize failed': '窗口最大化或还原失败。',

  'main window drag failed': '窗口拖动暂时不可用。',

  'settings load failed': '设置读取失败。',
}

interface UiNotice {
  readonly id: number
  readonly message: string
}

interface UiFeedbackEventDetail {
  readonly id: number
  readonly message: string
}

let nextNoticeId = 1

export function reportUiError(message: string, context: Record<string, unknown>): void {
  reportError(message, context)

  if (typeof window === 'undefined') {
    return
  }

  const detail: UiFeedbackEventDetail = {
    id: nextNoticeId,

    message: USER_MESSAGES[message] ?? '操作失败，请重试。',
  }

  nextNoticeId += 1

  window.dispatchEvent(
    new CustomEvent(EVENT_NAME, {
      detail,
    }),
  )
}

export function UiFeedbackRegion() {
  const [notices, setNotices] = useState<readonly UiNotice[]>([])

  useEffect(() => {
    const timers = new Set<number>()

    const handleFeedback = (event: Event) => {
      const notice = (event as CustomEvent<UiFeedbackEventDetail>).detail

      setNotices((current) =>
        [...current.filter((item) => item.message !== notice.message), notice].slice(-3),
      )

      const timer = window.setTimeout(() => {
        setNotices((current) => current.filter((item) => item.id !== notice.id))

        timers.delete(timer)
      }, 5500)

      timers.add(timer)
    }

    window.addEventListener(EVENT_NAME, handleFeedback)

    return () => {
      window.removeEventListener(EVENT_NAME, handleFeedback)

      for (const timer of timers) {
        window.clearTimeout(timer)
      }
    }
  }, [])

  const dismiss = (id: number) => {
    setNotices((current) => current.filter((item) => item.id !== id))
  }

  return (
    <div
      aria-live="polite"
      aria-relevant="additions"
      className={[
        'pointer-events-none',
        'fixed bottom-4 right-4',
        'z-[var(--ui-z-toast)]',
        'grid gap-2',
        'w-[min(380px,calc(100vw-32px))]',
      ].join(' ')}
    >
      {notices.map((notice) => (
        <div
          className={[
            'pointer-events-auto',
            'flex items-start gap-3',
            'rounded-lg border',
            'border-destructive/30',
            'bg-background p-3',
            'text-sm shadow-xl',
          ].join(' ')}
          key={notice.id}
          role="alert"
        >
          <DangerCircle
            aria-hidden="true"
            className={['mt-0.5 size-4', 'shrink-0', 'text-destructive'].join(' ')}
          />

          <span className={['min-w-0 flex-1', 'leading-5'].join(' ')}>{notice.message}</span>

          <button
            aria-label="关闭提示"
            className={[
              'grid size-7',
              'place-items-center',
              'rounded-md',
              'text-muted-foreground',
              'hover:bg-accent',
              'focus-visible:outline-none',
              'focus-visible:ring-2',
              'focus-visible:ring-ring',
            ].join(' ')}
            onClick={() => {
              dismiss(notice.id)
            }}
            type="button"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
