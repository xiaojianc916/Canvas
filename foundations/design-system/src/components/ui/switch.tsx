import { Switch } from '@base-ui/react/switch'
import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

const SwitchComponent = forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<typeof Switch.Root>
>(({ className, ...props }, ref) => (
  <Switch.Root
    className={cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-primary data-[unchecked]:bg-input',
      className,
    )}
    ref={ref}
    {...props}
  >
    <Switch.Thumb
      className={cn(
        'pointer-events-none block size-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[checked]:translate-x-4 data-[unchecked]:translate-x-0',
      )}
    />
  </Switch.Root>
))
SwitchComponent.displayName = 'Switch'

export { SwitchComponent as Switch }
