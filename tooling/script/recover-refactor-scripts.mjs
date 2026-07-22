#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()
const APPLY =
  process.argv.includes('--apply')
const ALLOW_DIRTY =
  process.argv.includes('--allow-dirty')

const PUBLIC_API =
  'foundations/design-system/src/public-api.ts'

const GENERATED_FILES = {
  'foundations/design-system/src/components/ui/dropdown-menu.tsx':
    String.raw`import { Menu } from '@base-ui/react/menu'
import {
  forwardRef,
  type ComponentPropsWithoutRef,
} from 'react'
import { cn } from '../../lib/utils'

export const DropdownMenu =
  Menu.Root

export const DropdownMenuTrigger =
  forwardRef<
    HTMLButtonElement,
    ComponentPropsWithoutRef<
      typeof Menu.Trigger
    >
  >(function DropdownMenuTrigger(
    {
      className,
      ...props
    },
    ref,
  ) {
    return (
      <Menu.Trigger
        ref={ref}
        className={cn(
          'outline-none',
          'focus-visible:ring-2',
          'focus-visible:ring-ring',
          className,
        )}
        {...props}
      />
    )
  })

type DropdownMenuContentProps =
  ComponentPropsWithoutRef<
    typeof Menu.Popup
  > & {
    readonly sideOffset?: number

    readonly side?:
      ComponentPropsWithoutRef<
        typeof Menu.Positioner
      >['side']

    readonly align?:
      ComponentPropsWithoutRef<
        typeof Menu.Positioner
      >['align']
  }

export const DropdownMenuContent =
  forwardRef<
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
          side={side}
          sideOffset={sideOffset}
          className={[
            'z-[var(--ui-z-popover)]',
            'outline-none',
          ].join(' ')}
        >
          <Menu.Popup
            ref={ref}
            className={cn(
              'min-w-32 overflow-hidden',
              'rounded-md',
              'border border-divider',
              'bg-popover p-1',
              'text-popover-foreground',
              'shadow-xl outline-none',
              'origin-[var(--transform-origin)]',
              'transition-[transform,scale,opacity]',
              'data-[ending-style]:scale-95',
              'data-[ending-style]:opacity-0',
              'data-[starting-style]:scale-95',
              'data-[starting-style]:opacity-0',
              className,
            )}
            {...props}
          />
        </Menu.Positioner>
      </Menu.Portal>
    )
  })

export const DropdownMenuItem =
  forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<
      typeof Menu.Item
    >
  >(function DropdownMenuItem(
    {
      className,
      ...props
    },
    ref,
  ) {
    return (
      <Menu.Item
        ref={ref}
        className={cn(
          'relative flex min-h-9',
          'cursor-default select-none',
          'items-center rounded-sm',
          'px-2 py-1.5 text-sm',
          'outline-none',
          'transition-colors',
          'focus:bg-accent',
          'focus:text-accent-foreground',
          'data-[disabled]:pointer-events-none',
          'data-[disabled]:opacity-50',
          className,
        )}
        {...props}
      />
    )
  })

export const DropdownMenuGroup =
  Menu.Group

export const DropdownMenuLabel =
  forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<
      typeof Menu.GroupLabel
    >
  >(function DropdownMenuLabel(
    {
      className,
      ...props
    },
    ref,
  ) {
    return (
      <Menu.GroupLabel
        ref={ref}
        className={cn(
          'px-2 py-1.5',
          'text-sm font-semibold',
          className,
        )}
        {...props}
      />
    )
  })

export const DropdownMenuSeparator =
  forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<
      typeof Menu.Separator
    >
  >(function DropdownMenuSeparator(
    {
      className,
      ...props
    },
    ref,
  ) {
    return (
      <Menu.Separator
        ref={ref}
        className={cn(
          '-mx-1 my-1',
          'h-px bg-divider',
          className,
        )}
        {...props}
      />
    )
  })
`,

  'features/workspace/src/presentation/shell/ActivityRail.tsx':
    String.raw`import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@hybrid-canvas/design-system'
import {
  BookOpen,
  Boxes,
  ChartNoAxesCombined,
  CircleHelp,
  ExternalLink,
  Files,
  Grid2X2,
  Image,
  MessageCircle,
  Network,
  RefreshCcw,
  Search,
  Settings,
} from 'lucide-react'
import type {
  ComponentType,
} from 'react'

type NavigationIcon =
  ComponentType<{
    className?: string
    'aria-hidden'?:
      | boolean
      | 'true'
      | 'false'
  }>

export type CanvasNavigationItemId =
  | 'pages'
  | 'documents'
  | 'search'
  | 'layers'
  | 'relations'
  | 'data'
  | 'assets'
  | 'extensions'

export interface CanvasNavigationItem {
  readonly id:
    CanvasNavigationItemId
  readonly label: string
  readonly icon: NavigationIcon
}

export interface ActivityRailProps {
  readonly activeItemId?:
    CanvasNavigationItemId

  readonly items?:
    readonly CanvasNavigationItem[]

  readonly onItemActivate?:
    (
      itemId:
        CanvasNavigationItemId,
    ) => void

  readonly onSettingsOpen:
    () => void
}

const DEFAULT_NAVIGATION:
  readonly CanvasNavigationItem[] = [
    {
      id: 'pages',
      label: '画布',
      icon: Grid2X2,
    },
    {
      id: 'search',
      label: '搜索',
      icon: Search,
    },
    {
      id: 'relations',
      label: '关系',
      icon: Network,
    },
    {
      id: 'assets',
      label: '素材',
      icon: Image,
    },
    {
      id: 'extensions',
      label: '插件',
      icon: Boxes,
    },
    {
      id: 'data',
      label: '自动化',
      icon: ChartNoAxesCombined,
    },
    {
      id: 'documents',
      label: '恢复',
      icon: Files,
    },
  ]

export function ActivityRail({
  activeItemId = 'pages',
  items = DEFAULT_NAVIGATION,
  onItemActivate,
  onSettingsOpen,
}: ActivityRailProps) {
  return (
    <nav
      aria-label="主导航"
      className={[
        'flex h-full min-h-0',
        'flex-col items-center',
        'bg-sidebar py-2',
      ].join(' ')}
    >
      <div
        className={[
          'flex flex-col gap-1',
        ].join(' ')}
      >
        {items.map((item) => (
          <RailButton
            key={item.id}
            active={
              item.id ===
              activeItemId
            }
            icon={item.icon}
            label={item.label}
            onClick={() => {
              onItemActivate?.(
                item.id,
              )
            }}
          />
        ))}
      </div>

      <div className="flex-1" />

      <div className="flex flex-col gap-1">
        <RailButton
          icon={Settings}
          label="设置"
          onClick={
            onSettingsOpen
          }
        />

        <HelpMenu />
      </div>
    </nav>
  )
}

interface RailButtonProps {
  readonly label: string
  readonly icon: NavigationIcon
  readonly active?: boolean
  readonly onClick?: () => void
}

function RailButton({
  label,
  icon: Icon,
  active = false,
  onClick,
}: RailButtonProps) {
  const className = active
    ? [
        'relative size-9',
        'bg-sidebar-accent',
        'text-primary',
        'hover:bg-sidebar-accent',
      ].join(' ')
    : [
        'size-9',
        'text-muted-foreground',
        'hover:bg-sidebar-accent',
        'hover:text-foreground',
      ].join(' ')

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-current={
            active
              ? 'page'
              : undefined
          }
          aria-label={label}
          className={className}
          onClick={onClick}
          size="icon"
          type="button"
          variant="ghost"
        >
          {active ? (
            <span
              aria-hidden="true"
              className={[
                'absolute -left-2',
                'h-4 w-0.5',
                'rounded-r',
                'bg-primary',
              ].join(' ')}
            />
          ) : null}

          <Icon
            aria-hidden="true"
            className="size-4"
          />
        </Button>
      </TooltipTrigger>

      <TooltipContent side="right">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function HelpMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="帮助"
        className={[
          'grid size-9',
          'place-items-center',
          'rounded-md',
          'text-muted-foreground',
          'hover:bg-sidebar-accent',
          'hover:text-foreground',
          'data-[popup-open]:bg-sidebar-accent',
        ].join(' ')}
      >
        <CircleHelp
          aria-hidden="true"
          className="size-4"
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className={[
          'w-60 rounded-xl p-2',
        ].join(' ')}
        side="right"
        sideOffset={8}
      >
        <HelpItem
          external
          icon={BookOpen}
          label="文档"
        />

        <HelpItem
          external
          icon={RefreshCcw}
          label="更新日志"
        />

        <DropdownMenuSeparator />

        <HelpItem
          external
          icon={MessageCircle}
          label="Discord"
        />

        <HelpItem
          icon={MessageCircle}
          label="反馈"
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface HelpItemProps {
  readonly label: string
  readonly icon: NavigationIcon
  readonly external?: boolean
}

function HelpItem({
  label,
  icon: Icon,
  external = false,
}: HelpItemProps) {
  return (
    <DropdownMenuItem
      className={[
        'min-h-10 gap-3',
        'rounded-md',
      ].join(' ')}
    >
      <Icon
        aria-hidden="true"
        className={[
          'size-4',
          'text-muted-foreground',
        ].join(' ')}
      />

      <span className="flex-1">
        {label}
      </span>

      {external ? (
        <ExternalLink
          aria-hidden="true"
          className={[
            'size-3.5',
            'text-muted-foreground',
          ].join(' ')}
        />
      ) : null}
    </DropdownMenuItem>
  )
}
`,
}

function absolute(relativePath) {
  return path.join(
    ROOT,
    relativePath,
  )
}

function assertRepository() {
  const packageFile =
    absolute('package.json')

  if (!fs.existsSync(packageFile)) {
    throw new Error(
      '请在 Canvas 仓库根目录运行脚本。',
    )
  }

  const packageJson = JSON.parse(
    fs.readFileSync(
      packageFile,
      'utf8',
    ),
  )

  if (
    packageJson.name !==
    'hybrid-canvas'
  ) {
    throw new Error(
      '当前目录不是 hybrid-canvas 仓库。',
    )
  }

  const requiredFiles = [
    ...Object.keys(
      GENERATED_FILES,
    ),
    PUBLIC_API,
  ]

  for (
    const relativePath of
      requiredFiles
  ) {
    if (
      !fs.existsSync(
        absolute(relativePath),
      )
    ) {
      throw new Error(
        '缺少目标文件：' +
          relativePath,
      )
    }
  }

  if (ALLOW_DIRTY) {
    return
  }

  const status = execFileSync(
    'git',
    ['status', '--porcelain'],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  ).trim()

  if (status.length > 0) {
    throw new Error(
      'Git 工作区不干净。' +
        '请先提交，或显式使用 --allow-dirty。',
    )
  }
}

function buildChanges() {
  const changes =
    Object.entries(
      GENERATED_FILES,
    )
      .map(
        ([
          relativePath,
          nextContent,
        ]) => ({
          relativePath,
          nextContent,

          currentContent:
            fs.readFileSync(
              absolute(
                relativePath,
              ),
              'utf8',
            ),
        }),
      )
      .filter(
        (change) =>
          change.currentContent !==
          change.nextContent,
      )

  const publicApiCurrent =
    fs.readFileSync(
      absolute(PUBLIC_API),
      'utf8',
    )

  const separatorExport =
    "export { DropdownMenuSeparator } from './components/ui/dropdown-menu'"

  const publicApiNext =
    publicApiCurrent.includes(
      'DropdownMenuSeparator',
    )
      ? publicApiCurrent
      : [
          publicApiCurrent.trimEnd(),
          separatorExport,
          '',
        ].join('\n')

  if (
    publicApiNext !==
    publicApiCurrent
  ) {
    changes.push({
      relativePath: PUBLIC_API,
      currentContent:
        publicApiCurrent,
      nextContent:
        publicApiNext,
    })
  }

  return changes
}

function applyChanges(changes) {
  for (const change of changes) {
    fs.writeFileSync(
      absolute(
        change.relativePath,
      ),
      change.nextContent,
      'utf8',
    )
  }

  execFileSync(
    'git',
    ['diff', '--check'],
    {
      cwd: ROOT,
      stdio: 'inherit',
    },
  )
}

function printPlan(changes) {
  console.log(
    'Phase 4B 将修改 ' +
      changes.length +
      ' 个文件：',
  )

  for (const change of changes) {
    console.log(
      '- ' + change.relativePath,
    )
  }
}

function main() {
  assertRepository()

  const changes =
    buildChanges()

  if (changes.length === 0) {
    console.log(
      'Phase 4B 没有需要应用的修改。',
    )

    return
  }

  printPlan(changes)

  if (!APPLY) {
    console.log('')
    console.log(
      '当前为预检模式，没有写入文件。',
    )

    console.log(
      '应用命令：',
    )

    console.log(
      'node tooling/script/refactor-ui-phase-4b.mjs --apply',
    )

    return
  }

  applyChanges(changes)

  console.log('')
  console.log(
    'Phase 4B ActivityRail 和 DropdownMenu 重构已写入。',
  )

  console.log('')
  console.log('请执行：')
  console.log('pnpm format')
  console.log('pnpm lint')
  console.log('pnpm typecheck')
  console.log('pnpm test:architecture')
  console.log('pnpm test')
  console.log('pnpm build:desktop')

  console.log('')
  console.log(
    '放弃本阶段修改：',
  )

  console.log(
    'git restore -- ' +
      changes
        .map(
          (change) =>
            change.relativePath,
        )
        .join(' '),
  )
}

try {
  main()
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : error,
  )

  process.exitCode = 1
}