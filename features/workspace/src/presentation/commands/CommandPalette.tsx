import {
  Dialog,
  EmptyState,
  Input,
} from '@hybrid-canvas/design-system'
import {
  Command,
  Search,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type {
  CommandRegistry,
} from '../../application/public-api'
import type {
  RegisteredCommand,
} from '../../contracts/public-api'

export interface CommandPaletteProps {
  readonly open: boolean
  readonly registry: CommandRegistry
  readonly onOpenChange:
    (open: boolean) => void
}

export function CommandPalette({
  open,
  registry,
  onOpenChange,
}: CommandPaletteProps) {
  const [
    query,
    setQuery,
  ] = useState('')

  const [
    activeIndex,
    setActiveIndex,
  ] = useState(0)

  const inputRef =
    useRef<HTMLInputElement>(null)

  const commands =
    useSyncExternalStore(
      registry.subscribe,
      registry.getSnapshot,
      registry.getSnapshot,
    )

  const filteredCommands =
    useMemo(
      () =>
        filterCommands(
          commands,
          query,
        ),
      [
        commands,
        query,
      ],
    )

  const activeCommand =
    filteredCommands[activeIndex]

  useEffect(() => {
    if (!open) {
      return
    }

    setQuery('')
    setActiveIndex(0)

    const animationFrame =
      window.requestAnimationFrame(
        () => {
          inputRef.current?.focus()
        },
      )

    return () => {
      window.cancelAnimationFrame(
        animationFrame,
      )
    }
  }, [
    open,
  ])

  useEffect(() => {
    if (
      activeIndex <
      filteredCommands.length
    ) {
      return
    }

    setActiveIndex(
      Math.max(
        0,
        filteredCommands.length - 1,
      ),
    )
  }, [
    activeIndex,
    filteredCommands.length,
  ])

  const executeCommand = (
    command: RegisteredCommand,
  ) => {
    onOpenChange(false)

    void registry.execute(
      command.id,
    )
  }

  const moveActiveIndex = (
    direction: -1 | 1,
  ) => {
    if (
      filteredCommands.length === 0
    ) {
      setActiveIndex(0)
      return
    }

    setActiveIndex(
      (currentIndex) => {
        const nextIndex =
          currentIndex + direction

        if (nextIndex < 0) {
          return (
            filteredCommands.length - 1
          )
        }

        if (
          nextIndex >=
          filteredCommands.length
        ) {
          return 0
        }

        return nextIndex
      },
    )
  }

  return (
    <Dialog
      open={open}
      className="max-w-xl"
      description="搜索并执行工作区命令"
      onOpenChange={onOpenChange}
      title="命令面板"
    >
      <div
        className={[
          'flex items-center gap-2',
          'border-b',
          'border-divider',
          'px-4',
        ].join(' ')}
      >
        <Search
          aria-hidden="true"
          className={[
            'size-4',
            'text-muted-foreground',
          ].join(' ')}
        />

        <Input
          ref={inputRef}
          aria-activedescendant={
            activeCommand
              ? 'command-' +
                activeCommand.id
              : undefined
          }
          aria-autocomplete="list"
          aria-controls="command-palette-results"
          aria-expanded={open}
          aria-label="搜索命令"
          className={[
            'h-12 border-0',
            'px-0 shadow-none',
            'focus-visible:ring-0',
          ].join(' ')}
          onChange={(event) => {
            setQuery(
              event.target.value,
            )

            setActiveIndex(0)
          }}
          onKeyDown={(event) => {
            switch (event.key) {
              case 'ArrowDown':
                event.preventDefault()
                moveActiveIndex(1)
                break

              case 'ArrowUp':
                event.preventDefault()
                moveActiveIndex(-1)
                break

              case 'Home':
                event.preventDefault()
                setActiveIndex(0)
                break

              case 'End':
                event.preventDefault()

                setActiveIndex(
                  Math.max(
                    0,
                    filteredCommands.length -
                      1,
                  ),
                )
                break

              case 'Enter':
                if (!activeCommand) {
                  return
                }

                event.preventDefault()

                executeCommand(
                  activeCommand,
                )
                break
            }
          }}
          placeholder="输入命令名称…"
          role="combobox"
          value={query}
        />

        <kbd
          className={[
            'rounded border',
            'bg-muted',
            'px-1.5 py-0.5',
            'text-[10px]',
            'text-muted-foreground',
          ].join(' ')}
        >
          Esc
        </kbd>
      </div>

      <div
        id="command-palette-results"
        className={[
          'max-h-80',
          'overflow-y-auto',
          'p-2',
        ].join(' ')}
        role="listbox"
      >
        {filteredCommands.length >
        0 ? (
          filteredCommands.map(
            (
              command,
              index,
            ) => (
              <button
                key={command.id}
                id={
                  'command-' +
                  command.id
                }
                aria-selected={
                  index === activeIndex
                }
                className={[
                  'flex min-h-11',
                  'w-full items-center',
                  'gap-3 rounded-md',
                  'px-3 text-left',
                  'text-sm outline-none',
                  'hover:bg-accent',
                  'aria-selected:bg-accent',
                  'focus-visible:ring-2',
                  'focus-visible:ring-ring',
                ].join(' ')}
                onClick={() => {
                  executeCommand(
                    command,
                  )
                }}
                onFocus={() => {
                  setActiveIndex(index)
                }}
                onMouseEnter={() => {
                  setActiveIndex(index)
                }}
                role="option"
                type="button"
              >
                <Command
                  aria-hidden="true"
                  className={[
                    'size-4',
                    'text-muted-foreground',
                  ].join(' ')}
                />

                <span
                  className={[
                    'min-w-0 flex-1',
                    'truncate',
                  ].join(' ')}
                >
                  {command.label}
                </span>

                {command.category ? (
                  <span
                    className={[
                      'text-xs',
                      'text-muted-foreground',
                    ].join(' ')}
                  >
                    {command.category}
                  </span>
                ) : null}

                {command.shortcut ? (
                  <kbd
                    className={[
                      'text-xs',
                      'text-muted-foreground',
                    ].join(' ')}
                  >
                    {command.shortcut}
                  </kbd>
                ) : null}
              </button>
            ),
          )
        ) : (
          <EmptyState
            description="尝试输入其他命令名称或分类。"
            title="没有匹配的命令"
          />
        )}
      </div>
    </Dialog>
  )
}

function filterCommands(
  commands:
    readonly RegisteredCommand[],
  query: string,
): readonly RegisteredCommand[] {
  const normalizedQuery =
    query
      .trim()
      .toLocaleLowerCase()

  if (!normalizedQuery) {
    return commands
  }

  return commands.filter(
    (command) => {
      const searchableText = [
        command.category ?? '',
        command.label,
        command.id,
      ]
        .join(' ')
        .toLocaleLowerCase()

      return searchableText.includes(
        normalizedQuery,
      )
    },
  )
}
