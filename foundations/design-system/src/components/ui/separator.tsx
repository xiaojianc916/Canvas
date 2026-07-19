import * as SeparatorPrimitive from '@radix-ui/react-separator'
import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

const Separator = forwardRef<
  React.ComponentRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    className={cn(
      'shrink-0 bg-border',
      orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
      className,
    )}
    decorative={decorative}
    orientation={orientation}
    ref={ref}
    {...props}
  />
))
Separator.displayName = 'Separator'

export { Separator }
