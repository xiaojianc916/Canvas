// refactor-help-dropdown.mjs
// 放在仓库根目录运行：
// node refactor-help-dropdown.mjs

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const dropdownMenuPath = resolve(
  'foundations/design-system/src/components/ui/dropdown-menu.tsx',
)

const designSystemPublicApiPath = resolve(
  'foundations/design-system/src/public-api.ts',
)

const activityRailPath = resolve(
  'features/workspace/src/presentation/shell/ActivityRail.tsx',
)

/**
 * 通用 DropdownMenu 组件。
 *
 * 基于项目现有的 @base-ui/react/menu 实现，
 * 不额外引入 Radix UI，避免产生第二套基础组件体系。
 */
const dropdownMenuSource = `import { Menu } from '@base-ui/react/menu'
import { ChevronRight } from 'lucide-react'
import { type ComponentPropsWithoutRef, forwardRef } from 'react'
import { cn } from '../../lib/utils'

export const DropdownMenu = Menu.Root

export const DropdownMenuGroup = Menu.Group

export const DropdownMenuPortal = Menu.Portal

export const DropdownMenuSub = Menu.SubmenuRoot

export const DropdownMenuTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof Menu.Trigger>
>(function DropdownMenuTrigger({ className, ...props }, ref) {
  return (
    <Menu.Trigger
      className={cn(
        'outline-none',
        'focus-visible:ring-2',
        'focus-visible:ring-ring',
        'focus-visible:ring-offset-2',
        'disabled:pointer-events-none',
        'disabled:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  )
})

type DropdownMenuContentProps =
  ComponentPropsWithoutRef<typeof Menu.Popup> & {
    readonly sideOffset?: number
    readonly side?: ComponentPropsWithoutRef<
      typeof Menu.Positioner
    >['side']
    readonly align?: ComponentPropsWithoutRef<
      typeof Menu.Positioner
    >['align']
  }

const popupClassName = [
  'min-w-32 overflow-hidden',
  'rounded-md border border-divider',
  'bg-popover p-1',
  'text-popover-foreground',
  'shadow-md outline-none',
  'origin-[var(--transform-origin)]',
  'transition-[transform,scale,opacity]',
  'duration-150',
  'data-[starting-style]:scale-95',
  'data-[starting-style]:opacity-0',
  'data-[ending-style]:scale-95',
  'data-[ending-style]:opacity-0',
].join(' ')

export const DropdownMenuContent = forwardRef<
  HTMLDivElement,
  DropdownMenuContentProps
>(function DropdownMenuContent(
  {
    className,
    sideOffset = 6,
    side = 'bottom',
    align = 'start',
    ...props
  },
  ref,
) {
  return (
    <Menu.Portal>
      <Menu.Positioner
        align={align}
        className="z-[var(--ui-z-popover)] outline-none"
        side={side}
        sideOffset={sideOffset}
      >
        <Menu.Popup
          className={cn(popupClassName, className)}
          ref={ref}
          {...props}
        />
      </Menu.Positioner>
    </Menu.Portal>
  )
})

export const DropdownMenuItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Menu.Item>
>(function DropdownMenuItem({ className, ...props }, ref) {
  return (
    <Menu.Item
      className={cn(
        'relative flex min-h-9',
        'cursor-default select-none',
        'items-center gap-2',
        'rounded-sm px-2 py-1.5',
        'text-sm outline-none',
        'transition-colors',
        'focus:bg-accent',
        'focus:text-accent-foreground',
        'data-[highlighted]:bg-accent',
        'data-[highlighted]:text-accent-foreground',
        'data-[disabled]:pointer-events-none',
        'data-[disabled]:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    />
  )
})

export const DropdownMenuLabel = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Menu.GroupLabel>
>(function DropdownMenuLabel({ className, ...props }, ref) {
  return (
    <Menu.GroupLabel
      className={cn(
        'px-2 py-1.5',
        'text-sm font-semibold',
        'text-foreground',
        className,
      )}
      ref={ref}
      {...props}
    />
  )
})

export const DropdownMenuSeparator = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Menu.Separator>
>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return (
    <Menu.Separator
      className={cn(
        '-mx-1 my-1 h-px',
        'bg-divider',
        className,
      )}
      ref={ref}
      {...props}
    />
  )
})

export const DropdownMenuShortcut = forwardRef<
  HTMLSpanElement,
  ComponentPropsWithoutRef<'span'>
>(function DropdownMenuShortcut({ className, ...props }, ref) {
  return (
    <span
      className={cn(
        'ml-auto',
        'text-xs tracking-widest',
        'text-muted-foreground',
        className,
      )}
      ref={ref}
      {...props}
    />
  )
})

export const DropdownMenuSubTrigger = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Menu.SubmenuTrigger>
>(function DropdownMenuSubTrigger(
  { className, children, ...props },
  ref,
) {
  return (
    <Menu.SubmenuTrigger
      className={cn(
        'relative flex min-h-9',
        'cursor-default select-none',
        'items-center gap-2',
        'rounded-sm px-2 py-1.5',
        'text-sm outline-none',
        'transition-colors',
        'focus:bg-accent',
        'focus:text-accent-foreground',
        'data-[highlighted]:bg-accent',
        'data-[highlighted]:text-accent-foreground',
        'data-[popup-open]:bg-accent',
        'data-[disabled]:pointer-events-none',
        'data-[disabled]:opacity-50',
        className,
      )}
      ref={ref}
      {...props}
    >
      {children}

      <ChevronRight
        aria-hidden="true"
        className="ml-auto size-4 text-muted-foreground"
      />
    </Menu.SubmenuTrigger>
  )
})

type DropdownMenuSubContentProps =
  ComponentPropsWithoutRef<typeof Menu.Popup> & {
    readonly sideOffset?: number
    readonly side?: ComponentPropsWithoutRef<
      typeof Menu.Positioner
    >['side']
    readonly align?: ComponentPropsWithoutRef<
      typeof Menu.Positioner
    >['align']
  }

export const DropdownMenuSubContent = forwardRef<
  HTMLDivElement,
  DropdownMenuSubContentProps
>(function DropdownMenuSubContent(
  {
    className,
    sideOffset = 4,
    side = 'right',
    align = 'start',
    ...props
  },
  ref,
) {
  return (
    <Menu.Positioner
      align={align}
      className="z-[var(--ui-z-popover)] outline-none"
      side={side}
      sideOffset={sideOffset}
    >
      <Menu.Popup
        className={cn(popupClassName, className)}
        ref={ref}
        {...props}
      />
    </Menu.Positioner>
  )
})
`

const helpMenuSource = `function HelpMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="帮助"
        className={[
          'grid size-9 place-items-center',
          'rounded-md',
          'text-muted-foreground',
          'transition-colors',
          'hover:bg-sidebar-accent',
          'hover:text-foreground',
          'data-[popup-open]:bg-sidebar-accent',
          'data-[popup-open]:text-foreground',
        ].join(' ')}
      >
        <CircleHelp
          aria-hidden="true"
          className="size-4"
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="w-56"
        side="right"
        sideOffset={8}
      >
        <DropdownMenuLabel>
          帮助与支持
        </DropdownMenuLabel>

        <DropdownMenuGroup>
          <HelpMenuItem
            external
            icon={BookOpen}
            label="文档"
          />

          <HelpMenuItem
            external
            icon={RefreshCcw}
            label="更新日志"
          />
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <HelpMenuItem
            external
            icon={MessageCircle}
            label="Discord"
          />

          <HelpMenuItem
            icon={MessageCircle}
            label="反馈"
          />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface HelpMenuItemProps {
  readonly label: string
  readonly icon: NavigationIcon
  readonly external?: boolean
  readonly disabled?: boolean
  readonly onClick?: () => void
}

function HelpMenuItem({
  label,
  icon: Icon,
  external = false,
  disabled = false,
  onClick,
}: HelpMenuItemProps) {
  return (
    <DropdownMenuItem
      disabled={disabled}
      onClick={onClick}
    >
      <Icon
        aria-hidden="true"
        className="size-4 text-muted-foreground"
      />

      <span className="flex-1">
        {label}
      </span>

      {external ? (
        <DropdownMenuShortcut>
          <ExternalLink
            aria-hidden="true"
            className="size-3.5"
          />
        </DropdownMenuShortcut>
      ) : null}
    </DropdownMenuItem>
  )
}
`

async function updateDropdownMenu() {
  await writeFile(
    dropdownMenuPath,
    dropdownMenuSource,
    'utf8',
  )

  console.log('✅ 已更新通用 DropdownMenu 组件')
}

async function updatePublicApi() {
  let source = await readFile(
    designSystemPublicApiPath,
    'utf8',
  )

  const dropdownExportPattern =
    /export \{\s*DropdownMenu,[\s\S]*?\}\s*from '\.\/components\/ui\/dropdown-menu'/

  if (!dropdownExportPattern.test(source)) {
    throw new Error(
      '无法在 design-system public-api.ts 中找到 DropdownMenu 导出块。',
    )
  }

  source = source.replace(
    dropdownExportPattern,
    `export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu'`,
  )

  await writeFile(
    designSystemPublicApiPath,
    source,
    'utf8',
  )

  console.log('✅ 已更新 design-system 公共导出')
}

async function updateActivityRail() {
  let source = await readFile(activityRailPath, 'utf8')

  /*
   * 扩充设计系统组件导入。
   */
  if (!source.includes('DropdownMenuGroup,')) {
    source = source.replace(
      `  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,`,
      `  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,`,
    )
  }

  if (!source.includes('DropdownMenuGroup,')) {
    throw new Error(
      '无法更新 ActivityRail 的 DropdownMenu 导入。',
    )
  }

  /*
   * 从 HelpMenu 开始替换至文件末尾，
   * 彻底删除旧 HelpMenu 和 HelpItem 实现。
   */
  const oldHelpMenuPattern =
    /function HelpMenu\(\) \{[\s\S]*$/

  if (!oldHelpMenuPattern.test(source)) {
    throw new Error(
      '无法找到旧 HelpMenu 实现，文件结构可能已经改变。',
    )
  }

  source = source.replace(
    oldHelpMenuPattern,
    helpMenuSource,
  )

  await writeFile(activityRailPath, source, 'utf8')

  console.log('✅ 已替换帮助菜单 UI')
}

async function verifyResult() {
  const [
    dropdownSource,
    publicApiSource,
    activitySource,
  ] = await Promise.all([
    readFile(dropdownMenuPath, 'utf8'),
    readFile(designSystemPublicApiPath, 'utf8'),
    readFile(activityRailPath, 'utf8'),
  ])

  const requiredDropdownExports = [
    'DropdownMenuGroup',
    'DropdownMenuPortal',
    'DropdownMenuShortcut',
    'DropdownMenuSub',
    'DropdownMenuSubContent',
    'DropdownMenuSubTrigger',
  ]

  for (const name of requiredDropdownExports) {
    if (!dropdownSource.includes(name)) {
      throw new Error(
        `通用 DropdownMenu 缺少组件：${name}`,
      )
    }

    if (!publicApiSource.includes(name)) {
      throw new Error(
        `public-api.ts 缺少导出：${name}`,
      )
    }
  }

  const helpMenuCount = (
    activitySource.match(
      /function HelpMenu\(\)/g,
    ) ?? []
  ).length

  const helpMenuItemCount = (
    activitySource.match(
      /function HelpMenuItem\(/g,
    ) ?? []
  ).length

  if (helpMenuCount !== 1) {
    throw new Error(
      `HelpMenu 实现数量异常：${helpMenuCount}`,
    )
  }

  if (helpMenuItemCount !== 1) {
    throw new Error(
      `HelpMenuItem 实现数量异常：${helpMenuItemCount}`,
    )
  }

  if (activitySource.includes('function HelpItem(')) {
    throw new Error('仍然残留旧 HelpItem 实现。')
  }

  console.log('✅ 已确认没有旧帮助菜单实现残留')
}

async function main() {
  try {
    await updateDropdownMenu()
    await updatePublicApi()
    await updateActivityRail()
    await verifyResult()

    console.log('')
    console.log('🎉 帮助菜单重构完成')
    console.log('')
    console.log('请执行：')
    console.log('  pnpm format')
    console.log('  pnpm typecheck')
    console.log('  pnpm test:architecture')
    console.log('  pnpm build:desktop')
    console.log('  git diff --check')
  } catch (error) {
    console.error('❌ 重构失败')

    if (error instanceof Error) {
      console.error(error.message)
    } else {
      console.error(error)
    }

    process.exit(1)
  }
}

await main()