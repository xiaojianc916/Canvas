import { useEffect, useId, useRef, useState } from 'react'

export interface SettingsDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

type SettingsSection = 'general' | 'canvas' | 'about'

const SETTINGS_SECTIONS: readonly {
  readonly id: SettingsSection
  readonly label: string
  readonly description: string
}[] = [
  {
    id: 'general',
    label: '常规',
    description: '主题、语言和应用行为',
  },
  {
    id: 'canvas',
    label: '画布',
    description: '网格、吸附和画布显示',
  },
  {
    id: 'about',
    label: '关于',
    description: '应用版本和项目信息',
  },
]

export function SettingsDialog({
  open,
  onOpenChange,
}: SettingsDialogProps) {
  const [activeSection, setActiveSection] =
    useState<SettingsSection>('general')
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const previouslyFocused = document.activeElement

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onOpenChange(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    dialogRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', handleKeyDown)

      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus()
      }
    }
  }, [onOpenChange, open])

  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-100 grid place-items-center bg-black/45 p-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
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
            <h2 className="text-base font-semibold" id={titleId}>
              设置
            </h2>
            <p
              className="mt-1 text-xs text-muted-foreground"
              id={descriptionId}
            >
              调整 Hybrid Canvas 的使用体验
            </p>
          </div>

          <nav aria-label="设置分类" className="space-y-1">
            {SETTINGS_SECTIONS.map((section) => {
              const active = section.id === activeSection

              return (
                <button
                  aria-current={active ? 'page' : undefined}
                  className={[
                    'w-full rounded-md px-3 py-2 text-left transition-colors',
                    active
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  ].join(' ')}
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  type="button"
                >
                  <span className="block text-sm font-medium">
                    {section.label}
                  </span>
                  <span className="mt-0.5 block text-xs opacity-75">
                    {section.description}
                  </span>
                </button>
              )
            })}
          </nav>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-divider px-6">
            <div>
              <h3 className="text-sm font-semibold">
                {
                  SETTINGS_SECTIONS.find(
                    (section) => section.id === activeSection,
                  )?.label
                }
              </h3>
            </div>

            <button
              aria-label="关闭设置"
              className="grid size-8 place-items-center rounded-md text-xl leading-none text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => onOpenChange(false)}
              type="button"
            >
              ×
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {activeSection === 'general' ? <GeneralSettings /> : null}
            {activeSection === 'canvas' ? <CanvasSettings /> : null}
            {activeSection === 'about' ? <AboutSettings /> : null}
          </div>

          <footer className="flex h-16 shrink-0 items-center justify-end border-t border-divider px-6">
            <button
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              onClick={() => onOpenChange(false)}
              type="button"
            >
              完成
            </button>
          </footer>
        </section>
      </div>
    </div>
  )
}

function GeneralSettings() {
  return (
    <div className="space-y-8">
      <SettingsGroup
        description="选择应用界面使用的颜色模式。"
        title="外观"
      >
        <div
          aria-label="颜色模式"
          className="grid grid-cols-3 gap-3"
          role="group"
        >
          <AppearanceOption label="浅色" previewClassName="bg-white" />
          <AppearanceOption
            label="深色"
            previewClassName="bg-neutral-900"
          />
          <AppearanceOption
            label="跟随系统"
            previewClassName="bg-gradient-to-r from-white to-neutral-900"
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          外观持久化将在 SettingsStore 接入后启用。
        </p>
      </SettingsGroup>

      <SettingsGroup
        description="控制应用界面使用的语言。"
        title="语言"
      >
        <select
          aria-label="界面语言"
          className="h-9 w-56 rounded-md border border-divider bg-background px-3 text-sm"
          defaultValue="zh-CN"
          disabled
        >
          <option value="zh-CN">简体中文</option>
        </select>
      </SettingsGroup>
    </div>
  )
}

function CanvasSettings() {
  return (
    <div className="space-y-8">
      <SettingsGroup
        description="控制新画布的网格显示方式。"
        title="网格"
      >
        <SettingToggle
          description="在画布背景中显示辅助网格。"
          label="显示网格"
        />
        <SettingToggle
          description="移动图形时自动吸附到网格。"
          label="吸附到网格"
        />
      </SettingsGroup>

      <SettingsGroup
        description="新建或打开画布时使用的默认缩放比例。"
        title="默认缩放"
      >
        <select
          aria-label="默认缩放比例"
          className="h-9 w-40 rounded-md border border-divider bg-background px-3 text-sm"
          defaultValue="100"
          disabled
        >
          <option value="fit">适应窗口</option>
          <option value="100">100%</option>
          <option value="75">75%</option>
          <option value="50">50%</option>
        </select>
      </SettingsGroup>
    </div>
  )
}

function AboutSettings() {
  return (
    <div className="max-w-xl">
      <div className="rounded-lg border border-divider p-5">
        <h4 className="text-base font-semibold">Hybrid Canvas</h4>
        <p className="mt-2 text-sm text-muted-foreground">
          基于 tldraw 的本地优先画布应用。
        </p>
        <dl className="mt-5 grid grid-cols-[100px_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">版本</dt>
          <dd>0.1.0</dd>
          <dt className="text-muted-foreground">窗口模式</dt>
          <dd>单主窗口</dd>
          <dt className="text-muted-foreground">设置界面</dt>
          <dd>主窗口内模态弹窗</dd>
        </dl>
      </div>
    </div>
  )
}

function SettingsGroup({
  children,
  description,
  title,
}: {
  readonly children: React.ReactNode
  readonly description: string
  readonly title: string
}) {
  return (
    <section>
      <h4 className="text-sm font-semibold">{title}</h4>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function AppearanceOption({
  label,
  previewClassName,
}: {
  readonly label: string
  readonly previewClassName: string
}) {
  return (
    <button
      aria-disabled="true"
      className="rounded-lg border border-divider p-2 text-left opacity-70"
      disabled
      type="button"
    >
      <span
        className={[
          'block h-20 rounded-md border border-divider',
          previewClassName,
        ].join(' ')}
      />
      <span className="mt-2 block text-sm">{label}</span>
    </button>
  )
}

function SettingToggle({
  description,
  label,
}: {
  readonly description: string
  readonly label: string
}) {
  return (
    <label className="flex items-center justify-between gap-5 border-b border-divider py-4 last:border-b-0">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
      <input
        className="size-4"
        disabled
        type="checkbox"
      />
    </label>
  )
}
