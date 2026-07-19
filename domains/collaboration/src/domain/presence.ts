import type { ActorId } from './actor'

export interface PresenceCursor {
  readonly actorId: ActorId
  readonly pageId: string
  readonly x: number
  readonly y: number
  readonly color: string
  readonly label: string
  readonly lastSeenAt: string
}
