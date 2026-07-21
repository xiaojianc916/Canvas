import {
  Button,
} from '@hybrid-canvas/design-system'
import type {
  AppSettings,
  SettingsStore,
  ThemeMode,
} from '@hybrid-canvas/settings'
import {
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'

export interface SettingsDialogProps {
  readonly open: boolean
  readonly store: SettingsStore
  readonly onOpenChange: (
    open: boolean,
  ) => void
}

type SettingsSection =
  | 'general'
  | 'canvas'
  | 'about'

const SETTINGS_SECTIONS = [
  {
    id: 'general',
    label: '常规',
  },
  {
    id: 'canvas',
    label: '画布',
  },
  {
    id: 'about',
    label: '关于',
  },
] as const

export function SettingsDialog({
  open,
  store,
  onOpenChange,
}: SettingsDialogProps) {
  const [
    activeSection,
    setActiveSection,
  ] = useState<SettingsSection>('general')

  const [
    draft,
    setDraft,
  ] = useState<AppSettings | null>(null)

  const [loading, setLoading] =
    useState(false)

  const [saving, setSaving] =
    useState(false)

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<string | null>(null)

  const titleId = useId()
  const descriptionId = useId()
  const dialogRef =
    useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    let disposed = false
    const previouslyFocused =
      document.activeElement

    setLoading(true)
    setErrorMessage(null)

    void store.load().then(
      (settings) => {
        if (!disposed) {
          setDraft(settings)
          setLoading(false)
          dialogRef.current?.focus()
        }
      },
      (cause: unknown) => {
        if (!disposed) {
          setLoading(false)
          setErrorMessage(
            getErrorMessage(cause),
          )
        }
      },
    )

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key === 'Escape' &&
        !saving
      ) {
        event.preventDefault()
        onOpenChange(false)
      }
    }

    document.addEventListener(
      'keydown',
      handleKeyDown,
    )

    return () => {
      disposed = true

      document.removeEventListener(
        'keydown',
        handleKeyDown,
      )

      if (
        previouslyFocused instanceof
        HTMLElement
      ) {
        previouslyFocused.focus()
      }
    }
  }, [onOpenChange, open, saving, store])

  if (!open) {
    return null
  }

  const save = () => {
    if (!draft || saving) {
      return
    }

    setSaving(true)
    setErrorMessage(null)

    void store.save(draft).then(
      () => {
        setSaving(false)
        onOpenChange(false)
      },
      (cause: unknown) => {
        setSaving(false)
        setErrorMessage(
          getErrorMessage(cause),
        )
      },
    )
  }

  const reset = () => {
    if (saving) {
      return
    }

    setSaving(true)
    setErrorMessage(null)

    void store.reset().then(
      (settings) => {
        setDraft(settings)
        setSaving(false)
      },
      (cause: unknown) => {
        setSaving(false)
        setErrorMessage(
          getErrorMessage(cause),
        )
      },
    )
  }

  return (
    <div
      className="fixed inset-0 z-100 grid place-items-center bg-black/45 p-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (
          event.target ===
            event.currentTarget &&
          !saving
        ) {
          onOpenChange(false)
        }
      }}
      role="presentation"
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="flex h-[min(680px,calc(100vh-48px))] w-[min(920px,calc(100vw-48px))] overflow-hidden rounded-xl border border-divider bg-background shadow-2xl outline-none"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <aside className="w-56 shrink-0 border-r border-divider bg-muted/30 p-4">
          <div className="mb-5 px-2">
            <h2
              className="text-base font-semibold"
              id={titleId}
            >
              设置
            </h2>

            <p
              className="mt-1 text-xs text-muted-foreground"
              id={descriptionId}
            >
              调整 Hybrid Canvas 的使用体验
            </p>
          </div>

          <nav
            aria-label="设置分类"
            className="space-y-1"
          >
            {SETTINGS_SECTIONS.map(
              (section) => (
                <button
                  aria-current={
                    activeSection ===
                    section.id
                      ? 'page'
                      : undefined
                  }
                  className={
                    activeSection ===
                    section.id
                      ? 'w-full rounded-md bg-accent px-3 py-2 text-left text-sm font-medium text-accent-foreground'
                      : 'w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground'
                  }
                  key={section.id}
                  onClick={() =>
                    setActiveSection(
                      section.id,
                    )
                  }
                  type="button"
                >
                  {section.label}
                </button>
              ),
            )}
          </nav>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-divider px-6">
            <h3 className="text-sm font-semibold">
              {
                SETTINGS_SECTIONS.find(
                  (section) =>
                    section.id ===
                    activeSection,
                )?.label
              }
            </h3>

            <Button
              aria-label="关闭设置"
              disabled={saving}
              onClick={() =>
                onOpenChange(false)
              }
              size="icon"
              type="button"
              variant="ghost"
            >
              ×
            </Button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {loading ? (
              <p className="text-sm text-muted-foreground">
                正在读取设置…
              </p>
            ) : null}

            {errorMessage ? (
              <p
                className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                role="alert"
              >
                {errorMessage}
              </p>
            ) : null}

            {!loading &&
            draft &&
            activeSection ===
              'general' ? (
              <GeneralSettings
                settings={draft}
                onChange={setDraft}
              />
            ) : null}

            {!loading &&
            draft &&
            activeSection ===
              'canvas' ? (
              <CanvasSettingsForm
                settings={draft}
                onChange={setDraft}
              />
            ) : null}

            {activeSection ===
            'about' ? (
              <AboutSettings />
            ) : null}
          </div>

          <footer className="flex h-16 shrink-0 items-center justify-between border-t border-divider px-6">
            <Button
              disabled={
                loading || saving
              }
              onClick={reset}
              type="button"
              variant="ghost"
            >
              恢复默认
            </Button>

            <div className="flex gap-2">
              <Button
                disabled={saving}
                onClick={() =>
                  onOpenChange(false)
                }
                type="button"
                variant="ghost"
              >
                取消
              </Button>

              <Button
                disabled={
                  loading ||
                  saving ||
                  !draft
                }
                onClick={save}
                type="button"
              >
                {saving
                  ? '正在保存…'
                  : '保存'}
              </Button>
            </div>
          </footer>
        </section>
      </div>
    </div>
  )
}

function GeneralSettings({
  settings,
  onChange,
}: {
  readonly settings: AppSettings
  readonly onChange: (
    settings: AppSettings,
  ) => void
}) {
  return (
    <div className="space-y-8">
      <SettingsGroup
        description="选择应用界面的颜色模式。"
        title="外观"
      >
        <select
          aria-label="颜色模式"
          className="h-9 w-56 rounded-md border border-divider bg-background px-3 text-sm"
          onChange={(event) =>
            onChange({
              ...settings,
              theme:
                event.target
                  .value as ThemeMode,
            })
          }
          value={settings.theme}
        >
          <option value="light">
            浅色
          </option>
          <option value="dark">
            深色
          </option>
          <option value="system">
            跟随系统
          </option>
        </select>
      </SettingsGroup>

      <SettingsGroup
        description="控制应用界面使用的语言。"
        title="语言"
      >
        <select
          aria-label="界面语言"
          className="h-9 w-56 rounded-md border border-divider bg-background px-3 text-sm"
          onChange={(event) =>
            onChange({
              ...settings,
              language:
                event.target.value,
            })
          }
          value={settings.language}
        >
          <option value="zh-CN">
            简体中文
          </option>
          <option value="en">
            English
          </option>
        </select>
      </SettingsGroup>

      <SettingsToggle
        checked={settings.autoSave}
        description="编辑画布时自动保存到当前文件。"
        label="自动保存"
        onChange={(checked) =>
          onChange({
            ...settings,
            autoSave: checked,
          })
        }
      />
    </div>
  )
}

function CanvasSettingsForm({
  settings,
  onChange,
}: {
  readonly settings: AppSettings
  readonly onChange: (
    settings: AppSettings,
  ) => void
}) {
  return (
    <div className="space-y-6">
      <SettingsToggle
        checked={
          settings.canvas.showGrid
        }
        description="在画布背景中显示辅助网格。"
        label="显示网格"
        onChange={(checked) =>
          onChange({
            ...settings,
            canvas: {
              ...settings.canvas,
              showGrid: checked,
            },
          })
        }
      />

      <SettingsToggle
        checked={
          settings.canvas.snapToGrid
        }
        description="移动图形时自动吸附到网格。"
        label="吸附到网格"
        onChange={(checked) =>
          onChange({
            ...settings,
            canvas: {
              ...settings.canvas,
              snapToGrid: checked,
            },
          })
        }
      />

      <SettingsGroup
        description="新建画布时使用的默认缩放比例。"
        title="默认缩放"
      >
        <select
          aria-label="默认缩放比例"
          className="h-9 w-40 rounded-md border border-divider bg-background px-3 text-sm"
          onChange={(event) =>
            onChange({
              ...settings,
              canvas: {
                ...settings.canvas,
                defaultZoom:
                  Number(
                    event.target.value,
                  ),
              },
            })
          }
          value={
            settings.canvas.defaultZoom
          }
        >
          <option value="1">100%</option>
          <option value="0.75">
            75%
          </option>
          <option value="0.5">
            50%
          </option>
        </select>
      </SettingsGroup>
    </div>
  )
}

function AboutSettings() {
  return (
    <div className="max-w-xl rounded-lg border border-divider p-5">
      <h4 className="text-base font-semibold">
        Hybrid Canvas
      </h4>

      <p className="mt-2 text-sm text-muted-foreground">
        基于 tldraw 的本地优先画布应用。
      </p>

      <dl className="mt-5 grid grid-cols-[100px_1fr] gap-y-2 text-sm">
        <dt className="text-muted-foreground">
          版本
        </dt>
        <dd>0.1.0</dd>

        <dt className="text-muted-foreground">
          设置存储
        </dt>
        <dd>Tauri Store</dd>
      </dl>
    </div>
  )
}

function SettingsGroup({
  children,
  description,
  title,
}: {
  readonly children:
    React.ReactNode
  readonly description: string
  readonly title: string
}) {
  return (
    <section>
      <h4 className="text-sm font-semibold">
        {title}
      </h4>

      <p className="mt-1 text-sm text-muted-foreground">
        {description}
      </p>

      <div className="mt-4">
        {children}
      </div>
    </section>
  )
}

function SettingsToggle({
  checked,
  description,
  label,
  onChange,
}: {
  readonly checked: boolean
  readonly description: string
  readonly label: string
  readonly onChange: (
    checked: boolean,
  ) => void
}) {
  return (
    <label className="flex items-center justify-between gap-5 border-b border-divider py-4 last:border-b-0">
      <span>
        <span className="block text-sm font-medium">
          {label}
        </span>

        <span className="mt-1 block text-xs text-muted-foreground">
          {description}
        </span>
      </span>

      <input
        checked={checked}
        className="size-4"
        onChange={(event) =>
          onChange(
            event.target.checked,
          )
        }
        type="checkbox"
      />
    </label>
  )
}

function getErrorMessage(
  cause: unknown,
): string {
  return cause instanceof Error
    ? cause.message
    : '设置操作失败'
}
