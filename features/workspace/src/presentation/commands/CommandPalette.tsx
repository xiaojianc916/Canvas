import { Input } from '@hybrid-canvas/design-system'
import { Command, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CommandRegistry } from '../../application/public-api'
import type { RegisteredCommand } from '../../contracts/public-api'

export interface CommandPaletteProps {
  readonly open: boolean
  readonly registry: CommandRegistry
  readonly onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, registry, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const commands = registry.getSnapshot()
  const filteredCommands = useMemo(() => filterCommands(commands, query), [commands, query])

  useEffect(() => {
    if (!open) {
      return
    }
    setQuery('')
    setActiveIndex(0)
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onOpenChange(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onOpenChange, open])

  if (!open) {
    return null
  }

  const execute = (command: RegisteredCommand) => {
    onOpenChange(false)
    void registry.execute(command.id)
  }

  return (
    <div
      aria-label="命令面板"
      aria-modal="true"
      className="fixed inset-0 z-100 grid place-items-start bg-black/20 px-4 pt-[14vh] backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onOpenChange(false)
        }
      }}
      role="dialog"
    >
      <section className="mx-auto w-full max-w-xl overflow-hidden rounded-xl border bg-background shadow-2xl">
        <header className="flex items-center gap-2 border-b px-3">
          <Search aria-hidden="true" className="size-4 text-muted-foreground" />
          <Input
            aria-controls="command-palette-results"
            aria-label="搜索命令"
            className="h-12 border-0 px-0 shadow-none focus-visible:ring-0"
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActiveIndex((index) => Math.min(index + 1, filteredCommands.length - 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActiveIndex((index) => Math.max(index - 1, 0))
              } else if (event.key === 'Enter') {
                const command = filteredCommands[activeIndex]
                if (command) {
                  execute(command)
                }
              }
            }}
            placeholder="输入命令名称…"
            ref={inputRef}
            value={query}
          />
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            Esc
          </kbd>
          <X aria-hidden="true" className="size-3.5 text-muted-foreground" />
        </header>
        <div className="max-h-80 overflow-y-auto p-1.5" id="command-palette-results" role="listbox">
          {filteredCommands.length ? (
            filteredCommands.map((command, index) => (
              <button
                aria-selected={index === activeIndex}
                className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm aria-selected:bg-accent"
                key={command.id}
                onClick={() => execute(command)}
                onMouseEnter={() => setActiveIndex(index)}
                role="option"
                type="button"
              >
                <Command aria-hidden="true" className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{command.label}</span>
                {command.category ? (
                  <span className="text-xs text-muted-foreground">{command.category}</span>
                ) : null}
                {command.shortcut ? (
                  <kbd className="text-xs text-muted-foreground">{command.shortcut}</kbd>
                ) : null}
              </button>
            ))
          ) : (
            <div className="grid h-28 place-items-center text-sm text-muted-foreground">
              没有匹配的命令
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function filterCommands(commands: readonly RegisteredCommand[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) {
    return commands
  }
  return commands.filter((command) =>
    `${command.category ?? ''} ${command.label} ${command.id}`
      .toLocaleLowerCase()
      .includes(normalizedQuery),
  )
}
