export { EditorCanvas, type EditorCanvasProps } from './EditorCanvas'
export { CanvasToolbar, type CanvasToolbarProps } from './CanvasToolbar'
export { EditorProvider, useEditor } from './editor-context'
export {
  registerExtension,
  getExtensionRegistration,
  clearExtensions,
  type HybridCanvasExtension,
  type CustomRecordContribution,
  type ExtensionRegistration,
} from './extension-registry'
