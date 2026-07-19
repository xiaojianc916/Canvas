import type { Result } from '@hybrid-canvas/foundations-kernel'

export type DocumentId = string & { readonly __brand: 'DocumentId' }
export type PageId = string & { readonly __brand: 'PageId' }
export type ElementId = string & { readonly __brand: 'ElementId' }

export interface Element {
  readonly id: ElementId
  readonly type: string
  readonly version: number
  readonly pageId: PageId
  readonly bounds: { x: number; y: number; width: number; height: number }
  readonly style: Record<string, unknown>
  readonly metadata: Record<string, unknown>
}

export interface Page {
  readonly id: PageId
  readonly name: string
  readonly elementIds: readonly ElementId[]
}

export interface Document {
  readonly id: DocumentId
  readonly version: number
  readonly title: string
  readonly pages: Record<PageId, Page>
  readonly elements: Record<ElementId, Element>
  readonly createdAt: string
  readonly modifiedAt: string
}

export interface DomainEvent {
  readonly type: string
  readonly commandId: string
  readonly appliedAt: string
}
