import type { ReactNode } from 'react'

interface TextProps {
  as?: 'span' | 'p' | 'label' | 'h1' | 'h2' | 'h3' | 'h4'
  variant?: 'caption' | 'body' | 'body-strong' | 'heading' | 'display'
  truncate?: boolean
  children: ReactNode
}

export function Text({
  as: Component = 'span',
  variant = 'body',
  truncate = false,
  children,
}: TextProps) {
  return (
    <Component className={`hc-text hc-text--${variant}${truncate ? ' hc-text--truncate' : ''}`}>
      {children}
    </Component>
  )
}
