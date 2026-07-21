import { Button, Separator, Switch } from '@hybrid-canvas/design-system'
import { Database, Grid2X2, Monitor, Palette, ShieldCheck, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export interface SettingsDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

type SettingsPage = 'appearance' | 'storage' | 'canvas' | 'privacy'

const PAGES: readonly {
  id: SettingsPage
  label: string
  icon: typeof Monitor
  description: string
}[] = [
  { id: 'appearance', label: '界面与交互', icon: Monitor, description: '调整应用窗口与工作区体验' },
  { id: 'storage', label: '文件与存储', icon: Database, description: '管理本地画布文件与保存方式' },
  { id: 'canvas', label: '画布默认值', icon: Palette, description: '设置新建无限画布的默认行为' },
  {
    id: 'privacy',
    label: '隐私与安全',
    icon: ShieldCheck,
    description: '控制本地数据和外部内容访问',
  },
]

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [activePage, setActivePage] = useState<SettingsPage>('appearance')
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const page = PAGES.find((item) => item.id === activePage) ?? PAGES[0]!

  useEffect(() => {
    if (!open) return
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButtonRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onOpenChange(false)
      }
      if (event.key === 'Tab') trapFocus(event, dialogRef.current)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus()
    }
  }, [onOpenChange, open])

  if (!open) return null

  return (
    <div
      aria-label="设置"
      aria-modal="true"
      className="fixed inset-0 z-100 grid place-items-center bg-black/10 p-6 backdrop-blur-[1px]"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onOpenChange(false)
      }}
      role="dialog"
    >
      <div
        className="flex h-[min(720px,88vh)] w-[min(960px,92vw)] overflow-hidden rounded-xl border bg-background text-foreground shadow-[0_18px_55px_rgba(20,20,18,0.16)]"
        ref={dialogRef}
      >
        <nav aria-label="设置分类" className="flex w-56 shrink-0 flex-col border-r bg-sidebar p-3">
          <div className="mb-5 px-2 pt-1">
            <h1 className="text-sm font-semibold">设置</h1>
            <p className="mt-1 text-[10px] text-muted-foreground">画布应用偏好设置</p>
          </div>
          <div className="space-y-1">
            {PAGES.map(({ id, icon: Icon, label }) => (
              <SettingsNavigationItem
                active={id === activePage}
                icon={<Icon className="size-4" />}
                key={id}
                label={label}
                onClick={() => setActivePage(id)}
              />
            ))}
          </div>
          <div className="mt-auto border-t border-divider px-2 pt-3 text-[10px] leading-4 text-muted-foreground">
            所有偏好均保存在此设备上。
            <br />
            Hybrid Canvas · 本地优先
          </div>
        </nav>
        <section className="min-w-0 flex-1 overflow-y-auto">
          <header className="sticky top-0 z-10 flex h-14 items-center border-b bg-background/95 px-6 backdrop-blur">
            <div>
              <h2 className="text-sm font-semibold">{page.label}</h2>
              <p className="text-[11px] text-muted-foreground">{page.description}</p>
            </div>
            <Button
              aria-label="关闭设置"
              className="ml-auto size-8"
              onClick={() => onOpenChange(false)}
              ref={closeButtonRef}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X className="size-4" />
            </Button>
          </header>
          <div className="mx-auto max-w-2xl space-y-7 p-6">
            <SettingsContent page={activePage} />
          </div>
        </section>
      </div>
    </div>
  )
}

function SettingsContent({ page }: { readonly page: SettingsPage }) {
  if (page === 'storage')
    return (
      <>
        <SettingsSection description="定义本地画布文件的保存节奏和打开方式。" title="本地文件">
          <SettingsRow description="编辑过程中持续将变更写入当前 .draw 文件。" label="自动保存">
            <Switch defaultChecked />
          </SettingsRow>
          <Separator />
          <SettingsRow description="启动应用时恢复上次仍处于打开状态的画布。" label="恢复上次会话">
            <Switch defaultChecked />
          </SettingsRow>
        </SettingsSection>
        <SettingsSection description="导出时使用独立副本，不影响当前画布。" title="导出">
          <SettingsRow description="导出 PNG、SVG 和 JSON 时包含画布背景。" label="默认包含背景">
            <Switch defaultChecked />
          </SettingsRow>
        </SettingsSection>
      </>
    )
  if (page === 'canvas')
    return (
      <>
        <SettingsSection description="这些选项将应用于之后新建的无限画布。" title="新建画布">
          <SettingsRow
            description="在空白区域显示低对比度点阵，帮助判断空间尺度。"
            label="显示点阵背景"
          >
            <Switch defaultChecked />
          </SettingsRow>
          <Separator />
          <SettingsRow description="新建画布时启用智能对齐和对象吸附。" label="启用对齐辅助">
            <Switch defaultChecked />
          </SettingsRow>
        </SettingsSection>
        <SettingsSection description="控制画布视图的默认导航方式。" title="导航">
          <SettingsRow
            description="使用触控板滚动或鼠标滚轮缩放时，以指针位置为中心。"
            label="以指针为中心缩放"
          >
            <Switch defaultChecked />
          </SettingsRow>
        </SettingsSection>
      </>
    )
  if (page === 'privacy')
    return (
      <>
        <SettingsSection
          description="Hybrid Canvas 默认在本地运行，不会自动上传画布内容。"
          title="本地数据"
        >
          <SettingsRow
            description="允许应用记住最近打开的文件路径，便于快速继续创作。"
            label="记录最近文件"
          >
            <Switch defaultChecked />
          </SettingsRow>
          <Separator />
          <SettingsRow description="在导入外部素材前显示安全确认。" label="导入内容前确认">
            <Switch defaultChecked />
          </SettingsRow>
        </SettingsSection>
        <SettingsSection description="外部内容仅会在你主动使用相关功能时访问。" title="外部资源">
          <SettingsRow description="允许画布加载你明确添加的远程图片资源。" label="加载远程图片">
            <Switch />
          </SettingsRow>
        </SettingsSection>
      </>
    )
  return (
    <>
      <SettingsSection description="让界面保持克制，将注意力放回无限画布。" title="外观">
        <SettingsRow description="界面颜色随系统浅色或深色模式自动调整。" label="跟随系统主题">
          <Switch defaultChecked />
        </SettingsRow>
        <Separator />
        <SettingsRow description="降低弹窗、面板和画布辅助元素的动画效果。" label="减少动态效果">
          <Switch />
        </SettingsRow>
        <Separator />
        <SettingsRow description="在紧凑屏幕上使用更小的间距和控件尺寸。" label="紧凑界面密度">
          <Switch />
        </SettingsRow>
      </SettingsSection>
      <SettingsSection description="控制工作区面板在创作时的行为。" title="工作区">
        <SettingsRow description="打开画布时自动显示左侧页面与图层面板。" label="默认展开侧边栏">
          <Switch defaultChecked />
        </SettingsRow>
        <Separator />
        <SettingsRow description="悬停在画布边缘时显示缩放与视图控制。" label="显示画布控制">
          <Switch defaultChecked />
        </SettingsRow>
      </SettingsSection>
      <div className="flex items-start gap-2 rounded-lg border border-divider bg-muted/20 p-3 text-[11px] leading-5 text-muted-foreground">
        <Grid2X2 className="mt-0.5 size-3.5 shrink-0" />
        设置将逐步接入应用配置存储；当前控件用于定义完整的原生画布应用设置界面。
      </div>
    </>
  )
}

function trapFocus(event: KeyboardEvent, container: HTMLElement | null) {
  if (!container) return
  const focusable = Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  )
  const first = focusable[0]
  const last = focusable.at(-1)
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}
function SettingsNavigationItem({
  active = false,
  icon,
  label,
  onClick,
}: {
  readonly active?: boolean
  readonly icon: React.ReactNode
  readonly label: string
  readonly onClick: () => void
}) {
  return (
    <button
      aria-current={active ? 'page' : undefined}
      className={`flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs ${active ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'}`}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
function SettingsSection({
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
      <header className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-[11px] text-muted-foreground">{description}</p>
      </header>
      <div className="rounded-lg border bg-surface px-4">{children}</div>
    </section>
  )
}
function SettingsRow({
  children,
  description,
  label,
}: {
  readonly children: React.ReactNode
  readonly description: string
  readonly label: string
}) {
  return (
    <div className="flex min-h-16 items-center gap-6 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{label}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )
}
