import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      aria-busy={loading}
      className={`hc-button hc-button--${variant} hc-button--${size}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <span aria-hidden className="hc-button__spinner" />}
      {children}
    </button>
  )
}
