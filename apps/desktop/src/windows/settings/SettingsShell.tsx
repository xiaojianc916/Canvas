import { Button, Separator, Switch } from '@hybrid-canvas/design-system'
import { Database, Monitor, Palette, ShieldCheck, X } from 'lucide-react'
import { useEffect, useRef } from 'react'

export interface SettingsDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
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
      className="fixed inset-0 z-100 grid place-items-center bg-black/25 p-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onOpenChange(false)
      }}
      role="dialog"
    >
      <div className="flex h-[min(720px,88vh)] w-[min(980px,92vw)] overflow-hidden rounded-2xl border bg-background text-foreground shadow-2xl" ref={dialogRef}>
        <nav aria-label="设置分类" className="w-56 shrink-0 border-r bg-sidebar p-3">
          <div className="mb-5 flex items-center gap-2 px-2 py-1">
            <div className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">H</div>
            <div><h1 className="text-sm font-semibold">设置</h1><p className="text-[10px] text-muted-foreground">Hybrid Canvas</p></div>
          </div>
          <SettingsNavigationItem active icon={<Monitor className="size-4" />} label="外观与体验" />
          <SettingsNavigationItem icon={<Database className="size-4" />} label="文件与存储" />
          <SettingsNavigationItem icon={<Palette className="size-4" />} label="画布默认值" />
          <SettingsNavigationItem icon={<ShieldCheck className="size-4" />} label="隐私与安全" />
        </nav>
        <section className="min-w-0 flex-1 overflow-y-auto">
          <header className="sticky top-0 z-10 flex h-14 items-center border-b bg-background/95 px-6 backdrop-blur">
            <div><h2 className="text-sm font-semibold">外观与体验</h2><p className="text-[11px] text-muted-foreground">调整应用主题和工作区行为</p></div>
            <Button aria-label="关闭设置" className="ml-auto size-8" onClick={() => onOpenChange(false)} ref={closeButtonRef} size="icon" type="button" variant="ghost"><X className="size-4" /></Button>
          </header>
          <div className="mx-auto max-w-2xl space-y-8 p-6">
            <SettingsSection description="选择适合当前环境的界面外观。" title="外观">
              <SettingsRow description="自动跟随操作系统的浅色或深色设置。" label="跟随系统主题"><Switch defaultChecked /></SettingsRow>
              <Separator />
              <SettingsRow description="降低面板和弹出层的视觉动态效果。" label="减少动态效果"><Switch /></SettingsRow>
            </SettingsSection>
            <SettingsSection description="控制工作台在启动和编辑过程中的行为。" title="工作区">
              <SettingsRow description="重新打开上次退出时仍在编辑的文档。" label="恢复上次会话"><Switch defaultChecked /></SettingsRow>
              <Separator />
              <SettingsRow description="编辑过程中定期将文档写入本地文件。" label="自动保存"><Switch defaultChecked /></SettingsRow>
            </SettingsSection>
            <div className="rounded-xl border bg-muted/20 p-4 text-[11px] leading-5 text-muted-foreground">设置界面已收敛到主窗口模态层。具体选项将在领域设置端口接通后持久化。</div>
          </div>
        </section>
      </div>
    </div>
  )
}

function trapFocus(event: KeyboardEvent, container: HTMLElement | null) {
  if (!container) return
  const focusable = Array.from(container.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'))
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

function SettingsNavigationItem({ active = false, icon, label }: { readonly active?: boolean; readonly icon: React.ReactNode; readonly label: string }) {
  return <button aria-current={active ? 'page' : undefined} className={`mb-1 flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs ${active ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground'}`} type="button">{icon}<span>{label}</span></button>
}

function SettingsSection({ children, description, title }: { readonly children: React.ReactNode; readonly description: string; readonly title: string }) {
  return <section><header className="mb-3"><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-[11px] text-muted-foreground">{description}</p></header><div className="rounded-xl border bg-surface px-4">{children}</div></section>
}

function SettingsRow({ children, description, label }: { readonly children: React.ReactNode; readonly description: string; readonly label: string }) {
  return <div className="flex min-h-16 items-center gap-6 py-3"><div className="min-w-0 flex-1"><p className="text-xs font-medium">{label}</p><p className="mt-1 text-[11px] text-muted-foreground">{description}</p></div>{children}</div>
}
