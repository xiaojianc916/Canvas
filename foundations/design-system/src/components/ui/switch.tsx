import { Switch as BaseSwitch } from '@base-ui/react/switch'
import {
  type ComponentPropsWithoutRef,
  forwardRef,
} from 'react'

import { cn } from '../../lib/utils'

export type SwitchProps =
  ComponentPropsWithoutRef<typeof BaseSwitch.Root>

/**
 * 通用开关组件。
 *
 * 保留 Base UI 默认的 span 结构，
 * 方便通过外层 Label 进行隐式关联。
 */
export const Switch = forwardRef<
  HTMLSpanElement,
  SwitchProps
>(function Switch(
  {
    className,
    children,
    ...props
  },
  forwardedRef,
) {
  return (
    <BaseSwitch.Root
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0',
        'cursor-pointer items-center rounded-full',
        'border-2 border-transparent',
        'shadow-sm outline-none',
        'transition-[background-color,box-shadow,border-color]',
        'focus-visible:ring-2',
        'focus-visible:ring-ring',
        'focus-visible:ring-offset-2',
        'focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed',
        'disabled:opacity-50',
        'data-[checked]:bg-primary',
        'data-[unchecked]:bg-input',
        'dark:data-[unchecked]:bg-input/80',
        className,
      )}
      ref={forwardedRef}
      {...props}
    >
      <BaseSwitch.Thumb
        className={cn(
          'pointer-events-none block size-4',
          'rounded-full bg-background',
          'shadow-lg ring-0',
          'transition-transform',
          'data-[checked]:translate-x-4',
          'data-[unchecked]:translate-x-0',
        )}
      />

      {children}
    </BaseSwitch.Root>
  )
})
