export {
  buildExtensionRegistration,
  type ExtensionRegistration,
  HYBRID_CANVAS_EXTENSION_API_VERSION,
  type HybridCanvasExtension,
} from '../contracts/public-api'
export { EditorCanvas, type EditorCanvasProps } from './EditorCanvas'
export {
  EditorSessionHost,
  type EditorSessionHostEntry,
  type EditorSessionHostProps,
} from './EditorSessionHost'
export {
  EditorProvider,
  type EditorProviderProps,
  useEditor,
  useTldrawLicenseKey,
} from './editor-context'

export {
  CanvasInspectorRightSidebar,
  CanvasInspectorPortalProvider,
  type CanvasInspectorPortalProviderProps,
  CanvasInspectorStylePanel,
  type CanvasInspectorStylePanelProps,
  useCanvasInspectorAvailability,
} from './canvas-inspector-portal'
