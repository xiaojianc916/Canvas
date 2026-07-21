import type { ReactNode, Ref } from 'react'

export interface WorkspaceFrameProps {
  readonly rootRef?: Ref<HTMLDivElement>
  readonly chrome: ReactNode
  readonly rail: ReactNode
  readonly sidebar: ReactNode
  readonly canvas: ReactNode
  readonly inspector: ReactNode
  readonly statusBar: ReactNode
  readonly overlays?: ReactNode
  readonly gridTemplateColumns: string
  readonly gridTemplateRows: string
}

export function WorkspaceFrame({
  rootRef,
  chrome,
  rail,
  sidebar,
  canvas,
  inspector,
  statusBar,
  overlays,
  gridTemplateColumns,
  gridTemplateRows,
}: WorkspaceFrameProps) {
  return (
    <div
      ref={rootRef}
      className="workspace-shell relative grid h-dvh w-full min-h-0 overflow-hidden bg-background text-foreground"
      style={{ gridTemplateColumns, gridTemplateRows }}
    >
      {/* Layout ownership lives here so borders stay single-source and predictable. */}
      {chrome}
      {rail}
      {sidebar}
      {canvas}
      {inspector}
      {statusBar}
      {overlays}
    </div>
  )
}
