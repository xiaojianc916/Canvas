import { motion, useReducedMotion } from 'motion/react'
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
  readonly disableLayoutAnimation?: boolean
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
  disableLayoutAnimation = false,
}: WorkspaceFrameProps) {
  const shouldReduceMotion = useReducedMotion()

  const transition =
    disableLayoutAnimation || shouldReduceMotion
      ? { duration: 0 }
      : {
          type: 'tween' as const,
          duration: 0.42,
          ease: [0.4, 0, 0.2, 1] as const,
        }

  return (
    <motion.div
      animate={{ gridTemplateColumns }}
      className="workspace-shell relative grid h-dvh w-full min-h-0 overflow-hidden bg-background text-foreground"
      initial={false}
      ref={rootRef}
      style={{
        gridTemplateRows,
        willChange: disableLayoutAnimation ? 'auto' : 'grid-template-columns',
      }}
      transition={transition}
    >
      {/* Layout ownership lives here so borders stay single-source and predictable. */}
      {chrome}
      {rail}
      {sidebar}
      {canvas}
      {inspector}
      {statusBar}
      {overlays}
    </motion.div>
  )
}
