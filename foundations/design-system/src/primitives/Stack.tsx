import type { HTMLAttributes, ReactNode } from 'react'

interface StackProps extends HTMLAttributes<HTMLDivElement> {
  direction?: 'row' | 'column'
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  align?: 'start' | 'center' | 'end' | 'stretch'
  justify?: 'start' | 'center' | 'end' | 'between' | 'around'
  children: ReactNode
}

export function Stack({
  direction = 'column',
  gap = 'md',
  align = 'stretch',
  justify = 'start',
  children,
  ...rest
}: StackProps) {
  return (
    <div
      className={`hc-stack hc-stack--${direction} hc-stack--gap-${gap} hc-stack--align-${align} hc-stack--justify-${justify}`}
      {...rest}
    >
      {children}
    </div>
  )
}
