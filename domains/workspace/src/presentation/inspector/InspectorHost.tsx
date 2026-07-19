import { ScrollArea, Tabs, TabsList, TabsTrigger } from '@hybrid-canvas/design-system'
import type { ReactNode } from 'react'

export interface InspectorHostProps {
  readonly title?: string
  readonly children: ReactNode
}

export function InspectorHost({ title = '属性', children }: InspectorHostProps) {
  return (
    <aside className="min-h-0 min-w-0 border-l bg-sidebar">
      <header className="flex h-11 items-center border-b px-3">
        <span className="text-[12px] font-medium">{title}</span>
      </header>
      <ScrollArea className="h-[calc(100%-2.75rem)]">
        <div className="p-3">
          <Tabs defaultValue="properties">
            <TabsList className="grid h-8 w-full grid-cols-2">
              <TabsTrigger className="text-[10px]" value="properties">
                属性
              </TabsTrigger>
              <TabsTrigger className="text-[10px]" value="interaction">
                交互
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="pt-3">{children}</div>
        </div>
      </ScrollArea>
    </aside>
  )
}
