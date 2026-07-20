import { ScrollArea, Tabs, TabsContent, TabsList, TabsTrigger } from '@hybrid-canvas/design-system'
import type { ReactNode } from 'react'

export interface InspectorHostProps {
  readonly title?: string
  readonly children: ReactNode
}

export function InspectorHost({ title = '属性', children }: InspectorHostProps) {
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-sidebar">
      <header className="flex h-11 shrink-0 items-center border-b px-3">
        <span className="text-[12px] font-semibold">{title}</span>
      </header>
      <Tabs className="flex min-h-0 flex-1 flex-col" defaultValue="design">
        <TabsList className="grid h-10 w-full shrink-0 grid-cols-3 rounded-none border-b bg-transparent p-1.5">
          <TabsTrigger className="h-7 text-[11px] shadow-none" value="design">设计</TabsTrigger>
          <TabsTrigger className="h-7 text-[11px] shadow-none" value="data">数据</TabsTrigger>
          <TabsTrigger className="h-7 text-[11px] shadow-none" value="interaction">交互</TabsTrigger>
        </TabsList>
        <TabsContent className="mt-0 min-h-0 flex-1" value="design">
          <ScrollArea className="h-full"><div className="p-3">{children}</div></ScrollArea>
        </TabsContent>
        <TabsContent className="mt-0 min-h-0 flex-1" value="data">
          <InspectorPlaceholder description="选择支持数据绑定的对象后，可在这里配置字段和数据源。" />
        </TabsContent>
        <TabsContent className="mt-0 min-h-0 flex-1" value="interaction">
          <InspectorPlaceholder description="选择对象后，可在这里配置触发器、动作和页面导航。" />
        </TabsContent>
      </Tabs>
    </section>
  )
}

function InspectorPlaceholder({ description }: { readonly description: string }) {
  return (
    <div className="px-6 py-12 text-center text-[11px] leading-5 text-muted-foreground">
      {description}
    </div>
  )
}
