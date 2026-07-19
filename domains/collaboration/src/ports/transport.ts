import type { ActorId } from '../domain/actor'
import type { PresenceCursor } from '../domain/presence'
import type { TransactionEnvelope } from '../domain/transaction-envelope'

export interface CollaborationTransport {
  connect(roomId: string, actorId: ActorId): Promise<void>
  disconnect(): Promise<void>
  submit(envelope: TransactionEnvelope): Promise<void>
  onTransaction(handler: (envelope: TransactionEnvelope) => void): () => void
  onPresence(handler: (presence: PresenceCursor) => void): () => void
}
