import { Button } from '@hybrid-canvas/design-system'
import { FilePlus2, FolderOpen } from 'lucide-react'

export interface NoDocumentSurfaceProps {
  readonly onCreateDocument: () => void
  readonly onOpenDocument: () => void
}

export function NoDocumentSurface({ onCreateDocument, onOpenDocument }: NoDocumentSurfaceProps) {
  return (
    <div className="grid h-full place-items-center bg-canvas px-8">
      <section className="w-full max-w-sm text-center">
        <div className="mx-auto grid size-11 place-items-center rounded-xl border bg-background shadow-sm">
          <FilePlus2 className="size-4 text-muted-foreground" />
        </div>
        <h1 className="mt-5 text-lg font-semibold tracking-tight">开始创作</h1>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          创建新的本地画板，或者打开已有的 .draw 文件。
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={onCreateDocument} size="sm" type="button">
            <FilePlus2 className="size-3.5" />
            新建画板
          </Button>
          <Button onClick={onOpenDocument} size="sm" type="button" variant="outline">
            <FolderOpen className="size-3.5" />
            打开文件
          </Button>
        </div>
      </section>
    </div>
  )
}
