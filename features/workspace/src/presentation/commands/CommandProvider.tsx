'use client'

import { createContext, type ReactNode, useCallback, useContext, useState } from 'react'
import type { UICommand } from '../../application/commands/ui-command'

interface InternalCommand extends UICommand {
  action: () => void | Promise<void>
  icon?: React.ReactNode
}

interface CommandContextType {
  commands: Map<string, InternalCommand>
  registerCommand: (command: InternalCommand) => () => void
  executeCommand: (id: string) => void
  getCommand: (id: string) => InternalCommand | undefined
}

const CommandContext = createContext<CommandContextType | undefined>(undefined)

export function CommandProvider({ children }: { children: ReactNode }) {
  const [commands] = useState(() => new Map<string, InternalCommand>())

  const registerCommand = useCallback(
    (command: InternalCommand) => {
      commands.set(command.id, command)
      return () => commands.delete(command.id)
    },
    [commands],
  )

  const executeCommand = useCallback(
    (id: string) => {
      const command = commands.get(id)
      if (command) {
        command.action()
      }
    },
    [commands],
  )

  const getCommand = useCallback(
    (id: string) => {
      return commands.get(id)
    },
    [commands],
  )

  return (
    <CommandContext.Provider value={{ commands, registerCommand, executeCommand, getCommand }}>
      {children}
    </CommandContext.Provider>
  )
}

export function useCommands() {
  const context = useContext(CommandContext)
  if (!context) throw new Error('useCommands must be used within a CommandProvider')
  return context
}
