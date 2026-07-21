import type { ReactNode } from 'react'

export interface WorkspaceFrameProps {
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
      className="workspace-shell relative grid h-dvh min-h-0 overflow-hidden bg-background text-foreground"
      style={{ gridTemplateColumns, gridTemplateRows }}
    >
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
