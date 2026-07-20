import type { DialogHTMLAttributes, ReactNode } from 'react'

interface DialogProps extends DialogHTMLAttributes<HTMLDialogElement> {
  open: boolean
  title?: string
  children: ReactNode
  onClose?: () => void
}

export function Dialog({ open, title, children, onClose, ...rest }: DialogProps) {
  return (
    <dialog aria-modal="true" className="hc-dialog" open={open} {...rest}>
      <div className="hc-dialog__panel">
        {title && <header className="hc-dialog__header">{title}</header>}
        <div className="hc-dialog__body">{children}</div>
        {onClose && (
          <button aria-label="Close" className="hc-dialog__close" onClick={onClose} type="button">
            ×
          </button>
        )}
      </div>
    </dialog>
  )
}
