import type { ReactNode } from 'react'

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
}

export function IconButton({ label, children, ...rest }: IconButtonProps) {
  return (
    <button aria-label={label} className="hc-icon-button" title={label} type="button" {...rest}>
      {children}
    </button>
  )
}
