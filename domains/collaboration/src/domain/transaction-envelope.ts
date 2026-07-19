import type { ActorId } from './actor'

export interface TransactionEnvelope {
  readonly actorId: ActorId
  readonly clientSeq: number
  readonly domainCommandId: string
  readonly payload: unknown
  readonly vectorClock: Record<ActorId, number>
  readonly issuedAt: string
}
