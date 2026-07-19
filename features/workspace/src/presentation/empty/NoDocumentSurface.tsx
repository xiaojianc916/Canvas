import { Button } from '@hybrid-canvas/design-system'
import { FilePlus2, FolderOpen } from 'lucide-react'

export interface NoDocumentSurfaceProps {
  readonly onCreateDocument: () => void
  readonly onOpenDocument: () => void
}

export function NoDocumentSurface({ onCreateDocument, onOpenDocument }: NoDocumentSurfaceProps) {
  return (
    <section className="grid size-full place-items-center bg-surface">
      <div className="w-full max-w-sm px-6 text-center">
        <div className="mx-auto grid size-11 place-items-center rounded-xl border bg-background shadow-sm">
          <FilePlus2 className="size-5 text-muted-foreground" />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">开始创作</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          创建新的本地画板，或者打开已有的 .draw 文件。
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={onCreateDocument} type="button">
            <FilePlus2 className="size-4" />
            新建画板
          </Button>
          <Button onClick={onOpenDocument} type="button" variant="outline">
            <FolderOpen className="size-4" />
            打开文件
          </Button>
        </div>
      </div>
    </section>
  )
}
