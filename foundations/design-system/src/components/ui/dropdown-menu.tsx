import { Menu } from '@base-ui/react/menu'
import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

const DropdownMenu = Menu.Root

const DropdownMenuTrigger = forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof Menu.Trigger>>(({ className, ...props }, ref) => (
  <Menu.Trigger className={cn('', className)} ref={ref} {...props} />
))
DropdownMenuTrigger.displayName = 'DropdownMenuTrigger'

const DropdownMenuContent = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof Menu.Popup> & { readonly sideOffset?: number }>(({ className, sideOffset = 4, ...props }, ref) => (
  <Menu.Portal>
    <Menu.Positioner sideOffset={sideOffset}>
      <Menu.Popup
        className={cn(
          'z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          className,
        )}
        ref={ref}
        {...props}
      />
    </Menu.Positioner>
  </Menu.Portal>
))
DropdownMenuContent.displayName = 'DropdownMenuContent'

const DropdownMenuItem = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof Menu.Item> & { readonly inset?: boolean }>(({ className, inset, ...props }, ref) => (
  <Menu.Item
    className={cn(
      'relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      inset && 'pl-8',
      className,
    )}
    ref={ref}
    {...props}
  />
))
DropdownMenuItem.displayName = 'DropdownMenuItem'

const DropdownMenuLabel = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof Menu.GroupLabel> & { readonly inset?: boolean }>(({ className, inset, ...props }, ref) => (
  <Menu.GroupLabel
    className={cn('px-2 py-1.5 text-sm font-semibold', inset && 'pl-8', className)}
    ref={ref}
    {...props}
  />
))
DropdownMenuLabel.displayName = 'DropdownMenuLabel'

const DropdownMenuSeparator = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof Menu.Separator>>(({ className, ...props }, ref) => (
  <Menu.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} ref={ref} {...props} />
))
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator'

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
}