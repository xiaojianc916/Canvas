import { v7 as uuidv7 } from 'uuid'

export type Brand<T, B> = T & { readonly __brand: B }

export type DocumentId = Brand<string, 'DocumentId'>
export type PageId = Brand<string, 'PageId'>
export type ElementId = Brand<string, 'ElementId'>
export type RelationId = Brand<string, 'RelationId'>
export type StyleId = Brand<string, 'StyleId'>
export type AssetId = Brand<string, 'AssetId'>
export type DatasetId = Brand<string, 'DatasetId'>
export type ChartSpecId = Brand<string, 'ChartSpecId'>
export type CommandId = Brand<string, 'CommandId'>
export type TransactionId = Brand<string, 'TransactionId'>
export type ActorId = Brand<string, 'ActorId'>
export type PluginId = Brand<string, 'PluginId'>
export type ExtensionId = Brand<string, 'ExtensionId'>
export type RevisionId = Brand<string, 'RevisionId'>
export type RequestId = Brand<string, 'RequestId'>
export type SessionId = Brand<string, 'SessionId'>
export type WindowId = Brand<string, 'WindowId'>

const brander = <T, B>(value: T): Brand<T, B> => value as Brand<T, B>

export function createDocumentId(): DocumentId {
  return brander(uuidv7())
}
export function createPageId(): PageId {
  return brander(uuidv7())
}
export function createElementId(): ElementId {
  return brander(uuidv7())
}
export function createRelationId(): RelationId {
  return brander(uuidv7())
}
export function createStyleId(): StyleId {
  return brander(uuidv7())
}
export function createAssetId(): AssetId {
  return brander(uuidv7())
}
export function createDatasetId(): DatasetId {
  return brander(uuidv7())
}
export function createChartSpecId(): ChartSpecId {
  return brander(uuidv7())
}
export function createCommandId(): CommandId {
  return brander(uuidv7())
}
export function createTransactionId(): TransactionId {
  return brander(uuidv7())
}
export function createActorId(): ActorId {
  return brander(uuidv7())
}
export function createPluginId(): PluginId {
  return brander(uuidv7())
}
export function createExtensionId(): ExtensionId {
  return brander(uuidv7())
}
export function createRevisionId(): RevisionId {
  return brander(uuidv7())
}
export function createRequestId(): RequestId {
  return brander(uuidv7())
}
export function createSessionId(): SessionId {
  return brander(uuidv7())
}
export function createWindowId(): WindowId {
  return brander(uuidv7())
}

export function parseDocumentId(value: string): DocumentId {
  return brander(value)
}
export function parsePageId(value: string): PageId {
  return brander(value)
}
export function parseElementId(value: string): ElementId {
  return brander(value)
}
export function parseRelationId(value: string): RelationId {
  return brander(value)
}
export function parseStyleId(value: string): StyleId {
  return brander(value)
}
export function parseAssetId(value: string): AssetId {
  return brander(value)
}
export function parseDatasetId(value: string): DatasetId {
  return brander(value)
}
export function parseChartSpecId(value: string): ChartSpecId {
  return brander(value)
}
export function parseCommandId(value: string): CommandId {
  return brander(value)
}
export function parseTransactionId(value: string): TransactionId {
  return brander(value)
}
export function parseActorId(value: string): ActorId {
  return brander(value)
}
export function parsePluginId(value: string): PluginId {
  return brander(value)
}
export function parseExtensionId(value: string): ExtensionId {
  return brander(value)
}
export function parseRevisionId(value: string): RevisionId {
  return brander(value)
}
export function parseRequestId(value: string): RequestId {
  return brander(value)
}
export function parseSessionId(value: string): SessionId {
  return brander(value)
}
export function parseWindowId(value: string): WindowId {
  return brander(value)
}

export type AnyId =
  | DocumentId
  | PageId
  | ElementId
  | RelationId
  | StyleId
  | AssetId
  | DatasetId
  | ChartSpecId
  | CommandId
  | TransactionId
  | ActorId
  | PluginId
  | ExtensionId
  | RevisionId
  | RequestId
  | SessionId
  | WindowId
