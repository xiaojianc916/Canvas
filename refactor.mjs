#!/usr/bin/env node

/**
 * Properties Inspector 一次性架构重构
 *
 * 回滚：
 *   git restore .
 *   git clean -fd
 *
 * 本脚本不创建备份文件。
 */

import {
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

const paths = {
  packageJson: resolve('package.json'),

  extensionContract: resolve(
    'editor/core/src/contracts/extension-contract.ts',
  ),

  editorContext: resolve(
    'editor/core/src/react/editor-context.tsx',
  ),

  editorCanvas: resolve(
    'editor/core/src/react/EditorCanvas.tsx',
  ),

  editorReactPublicApi: resolve(
    'editor/core/src/react/public-api.ts',
  ),

  inspectorPortal: resolve(
    'editor/core/src/react/canvas-inspector-portal.tsx',
  ),

  workspaceContainer: resolve(
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  ),

  workspaceShell: resolve(
    'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
  ),

  shellContract: resolve(
    'features/workspace/src/contracts/shell-contract.ts',
  ),

  legacyInspectorDirectory: resolve(
    'apps/desktop/src/presentation/workspace/inspector',
  ),

  architectureTest: resolve(
    'tests/architecture/check-properties-inspector-architecture.mjs',
  ),

  obsoleteBackupDirectory: resolve(
    '.inspector-architecture-backup',
  ),
}

await main()

async function main() {
  await assertRepository()

  /*
   * Git 是唯一回滚机制。
   */
  await rm(
    paths.obsoleteBackupDirectory,
    {
      recursive: true,
      force: true,
    },
  )

  /*
   * 先迁移 Feature Extension API。
   *
   * toolInspectors 这个名字暗示“每个工具都有面板”。
   * creationInspectors 明确表示它只能扩展创作预设。
   */
  await migrateInspectorApiAcrossRepository()

  /*
   * 写入新的 Extension API。
   */
  await write(
    paths.extensionContract,
    createExtensionContract(),
  )

  /*
   * 建立 tldraw StylePanel -> Workspace Dock Portal。
   */
  await mkdir(
    path.dirname(paths.inspectorPortal),
    {
      recursive: true,
    },
  )

  await write(
    paths.inspectorPortal,
    createInspectorPortal(),
  )

  await transformEditorContext()
  await write(
    paths.editorCanvas,
    createEditorCanvas(),
  )
  await transformEditorReactPublicApi()

  /*
   * Workspace 只负责布局。
   */
  await transformWorkspaceContainer()
  await transformWorkspaceShell()
  await transformShellContract()

  /*
   * 删除旧 tool-first Inspector。
   */
  await rm(
    paths.legacyInspectorDirectory,
    {
      recursive: true,
      force: true,
    },
  )

  /*
   * 加入架构守卫。
   */
  await mkdir(
    path.dirname(paths.architectureTest),
    {
      recursive: true,
    },
  )

  await write(
    paths.architectureTest,
    createArchitectureTest(),
  )

  await transformPackageJson()
  await validateFinalRepository()
  printSummary()
}

async function migrateInspectorApiAcrossRepository() {
  const files = await collectSourceFiles(root)

  for (const filePath of files) {
    if (
      filePath.startsWith(
        paths.legacyInspectorDirectory + path.sep,
      )
    ) {
      continue
    }

    let source = normalize(
      await readFile(filePath, 'utf8'),
    )

    const original = source

    source = source
      .replaceAll(
        'HybridCanvasToolInspectorContribution',
        'HybridCanvasCreationInspectorContribution',
      )
      .replaceAll(
        'HybridCanvasToolInspectorProps',
        'HybridCanvasCreationInspectorProps',
      )
      .replaceAll(
        'toolInspectors',
        'creationInspectors',
      )

    if (source !== original) {
      await write(filePath, source)
    }
  }
}

function createExtensionContract() {
  return `import type { ComponentType } from 'react'
import type {
  Editor,
  TLAnyBindingUtilConstructor,
  TLAnyShapeUtilConstructor,
  TLStateNodeConstructor,
} from 'tldraw'

export const HYBRID_CANVAS_EXTENSION_API_VERSION = '2'

/**
 * 创作预设扩展。
 *
 * 这里只允许提供“下一对象”的额外创作参数。
 * 它不是通用 Tool Inspector，也不能为 select、hand、
 * eraser、laser 等被动或瞬时工具创建说明页面。
 */
export interface HybridCanvasCreationInspectorProps {
  readonly editor: Editor
}

export interface HybridCanvasCreationInspectorContribution {
  /**
   * 精确的 tldraw StateNode tool id。
   */
  readonly toolId: string

  /**
   * 稳定的 Feature owner id。
   */
  readonly owner: string

  /**
   * 高优先级覆盖低优先级。
   */
  readonly priority?: number

  readonly component: ComponentType<HybridCanvasCreationInspectorProps>
}

export interface HybridCanvasExtension {
  readonly id: string
  readonly version: string
  readonly apiVersion: string
  readonly shapeUtils?: readonly TLAnyShapeUtilConstructor[]
  readonly bindingUtils?: readonly TLAnyBindingUtilConstructor[]
  readonly tools?: readonly TLStateNodeConstructor[]
  readonly shapeLabels?: Readonly<Record<string, string>>

  /**
   * 仅用于真正会创建持久 Shape 的工具。
   *
   * selection-specific Inspector 将在确认具体属性内容后
   * 使用独立契约设计，不能复用这个入口。
   */
  readonly creationInspectors?: readonly HybridCanvasCreationInspectorContribution[]
}

export interface ExtensionRegistration {
  readonly extensions: readonly HybridCanvasExtension[]
  readonly shapeUtils: readonly TLAnyShapeUtilConstructor[]
  readonly bindingUtils: readonly TLAnyBindingUtilConstructor[]
  readonly tools: readonly TLStateNodeConstructor[]
  readonly shapeLabels: Readonly<Record<string, string>>
  readonly creationInspectors: readonly HybridCanvasCreationInspectorContribution[]
}

export function buildExtensionRegistration(
  input: readonly HybridCanvasExtension[] = [],
): ExtensionRegistration {
  const ids = new Set<string>()
  const shapeUtils: TLAnyShapeUtilConstructor[] = []
  const bindingUtils: TLAnyBindingUtilConstructor[] = []
  const tools: TLStateNodeConstructor[] = []
  const shapeLabels: Record<string, string> = {}
  const creationInspectors: HybridCanvasCreationInspectorContribution[] = []

  for (const extension of input) {
    if (!extension.id || ids.has(extension.id)) {
      throw new Error('EXTENSION_DUPLICATE_ID')
    }

    if (extension.apiVersion !== HYBRID_CANVAS_EXTENSION_API_VERSION) {
      throw new Error('EXTENSION_API_VERSION_MISMATCH')
    }

    ids.add(extension.id)
    shapeUtils.push(...(extension.shapeUtils ?? []))
    bindingUtils.push(...(extension.bindingUtils ?? []))
    tools.push(...(extension.tools ?? []))
    Object.assign(shapeLabels, extension.shapeLabels)

    for (const contribution of extension.creationInspectors ?? []) {
      validateCreationInspectorContribution(
        extension.id,
        contribution,
      )

      creationInspectors.push(contribution)
    }
  }

  return Object.freeze({
    extensions: Object.freeze([...input]),
    shapeUtils: Object.freeze(shapeUtils),
    bindingUtils: Object.freeze(bindingUtils),
    tools: Object.freeze(tools),
    shapeLabels: Object.freeze(shapeLabels),
    creationInspectors: Object.freeze(creationInspectors),
  })
}

function validateCreationInspectorContribution(
  extensionId: string,
  contribution: HybridCanvasCreationInspectorContribution,
): void {
  if (!contribution.toolId.trim()) {
    throw new Error(
      'EXTENSION_CREATION_INSPECTOR_TOOL_ID_REQUIRED:' +
        extensionId,
    )
  }

  if (!contribution.owner.trim()) {
    throw new Error(
      'EXTENSION_CREATION_INSPECTOR_OWNER_REQUIRED:' +
        extensionId,
    )
  }

  if (typeof contribution.component !== 'function') {
    throw new Error(
      'EXTENSION_CREATION_INSPECTOR_COMPONENT_REQUIRED:' +
        extensionId,
    )
  }

  if (
    contribution.priority !== undefined &&
    !Number.isFinite(contribution.priority)
  ) {
    throw new Error(
      'EXTENSION_CREATION_INSPECTOR_PRIORITY_INVALID:' +
        extensionId,
    )
  }
}
`
}

function createInspectorPortal() {
  return `import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  DefaultStylePanel,
  useRelevantStyles,
} from 'tldraw'

interface CanvasInspectorPortalContextValue {
  readonly host: HTMLElement | null
  readonly available: boolean
  readonly setHost: (host: HTMLElement | null) => void
  readonly publishAvailability: (
    owner: symbol,
    available: boolean,
  ) => void
  readonly releaseAvailability: (owner: symbol) => void
}

const CanvasInspectorPortalContext =
  createContext<CanvasInspectorPortalContextValue | null>(null)

export interface CanvasInspectorPortalProviderProps {
  readonly children: ReactNode
}

/**
 * tldraw StylePanel 与 Workspace Dock 之间唯一的 UI 桥。
 *
 * 这里只传递：
 * - Portal DOM host
 * - 是否存在实际 Inspector 内容
 *
 * 不传递：
 * - selected shapes
 * - current tool
 * - shared styles
 * - shape props
 *
 * 因此 Workspace 不会成为 Editor 状态的第二事实来源。
 */
export function CanvasInspectorPortalProvider({
  children,
}: CanvasInspectorPortalProviderProps) {
  const [host, setHostState] =
    useState<HTMLElement | null>(null)

  const [available, setAvailable] =
    useState(false)

  const publishers =
    useRef(new Map<symbol, boolean>())

  const setHost = useCallback(
    (nextHost: HTMLElement | null) => {
      setHostState(nextHost)
    },
    [],
  )

  const recomputeAvailability =
    useCallback(() => {
      setAvailable(
        Array.from(
          publishers.current.values(),
        ).some(Boolean),
      )
    }, [])

  const publishAvailability =
    useCallback(
      (
        owner: symbol,
        nextAvailable: boolean,
      ) => {
        publishers.current.set(
          owner,
          nextAvailable,
        )

        recomputeAvailability()
      },
      [recomputeAvailability],
    )

  const releaseAvailability =
    useCallback(
      (owner: symbol) => {
        publishers.current.delete(owner)
        recomputeAvailability()
      },
      [recomputeAvailability],
    )

  const value =
    useMemo<CanvasInspectorPortalContextValue>(
      () => ({
        host,
        available,
        setHost,
        publishAvailability,
        releaseAvailability,
      }),
      [
        host,
        available,
        setHost,
        publishAvailability,
        releaseAvailability,
      ],
    )

  return (
    <CanvasInspectorPortalContext.Provider
      value={value}
    >
      {children}
    </CanvasInspectorPortalContext.Provider>
  )
}

/**
 * Workspace 右栏中的 Portal 挂载点。
 *
 * Workspace 只渲染容器，不解析 Editor 状态。
 */
export function CanvasInspectorDock() {
  const context =
    useRequiredCanvasInspectorPortal()

  const setHost = context.setHost

  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      setHost(node)
    },
    [setHost],
  )

  return (
    <div
      className="hc-properties-inspector-dock min-h-0 min-w-0"
      data-properties-inspector-dock=""
      ref={ref}
    />
  )
}

export function useCanvasInspectorAvailability(): boolean {
  return useRequiredCanvasInspectorPortal()
    .available
}

export interface CanvasInspectorStylePanelProps {
  readonly active: boolean
}

/**
 * tldraw 官方 StylePanel slot。
 *
 * useRelevantStyles 是 Inspector 是否存在的官方依据：
 * - 有选区时：返回选区相关共享样式；
 * - 无选区且当前工具创建 Shape 时：返回下一 Shape 样式；
 * - 无相关样式时：返回 null。
 *
 * 当前阶段只渲染官方 DefaultStylePanel，
 * 不加入自定义对象属性、排列或 Feature 专属 Section。
 */
export function CanvasInspectorStylePanel({
  active,
}: CanvasInspectorStylePanelProps) {
  const context =
    useRequiredCanvasInspectorPortal()

  const styles = useRelevantStyles()

  const owner =
    useRef(Symbol('canvas-inspector-style-panel'))

  const available =
    active &&
    styles !== null

  useEffect(() => {
    const currentOwner = owner.current

    context.publishAvailability(
      currentOwner,
      available,
    )

    return () => {
      context.releaseAvailability(
        currentOwner,
      )
    }
  }, [
    available,
    context.publishAvailability,
    context.releaseAvailability,
  ])

  if (
    !active ||
    !styles ||
    !context.host
  ) {
    return null
  }

  /*
   * Portal 不会切断 React Context。
   * DefaultStylePanel 仍然处于 tldraw UI Provider 内，
   * 因而可以继续安全使用官方 hooks、actions、translations
   * 和 StylePanelContext。
   */
  return createPortal(
    <DefaultStylePanel
      isMobile={false}
      styles={styles}
    />,
    context.host,
  )
}

function useRequiredCanvasInspectorPortal(): CanvasInspectorPortalContextValue {
  const context =
    useContext(
      CanvasInspectorPortalContext,
    )

  if (!context) {
    throw new Error(
      'CANVAS_INSPECTOR_PORTAL_PROVIDER_MISSING',
    )
  }

  return context
}
`
}

async function transformEditorContext() {
  let source = normalize(
    await readFile(
      paths.editorContext,
      'utf8',
    ),
  )

  if (
    !source.includes(
      "from './canvas-inspector-portal'",
    )
  ) {
    const importAnchor =
      "import type { ExtensionRegistration } from '../contracts/public-api'\n"

    source = replaceRequired(
      source,
      importAnchor,
      `${importAnchor}import { CanvasInspectorPortalProvider } from './canvas-inspector-portal'\n`,
      'EditorProvider 添加 Inspector Portal Provider import',
    )
  }

  source = source.replace(
    /return <EditorCtx\.Provider value=\{value\}>\{children\}<\/EditorCtx\.Provider>/,
    `return (
    <EditorCtx.Provider value={value}>
      <CanvasInspectorPortalProvider>
        {children}
      </CanvasInspectorPortalProvider>
    </EditorCtx.Provider>
  )`,
  )

  if (
    !source.includes(
      '<CanvasInspectorPortalProvider>',
    )
  ) {
    throw new Error(
      '无法把 CanvasInspectorPortalProvider 加入 EditorProvider。',
    )
  }

  await write(
    paths.editorContext,
    source,
  )
}

function createEditorCanvas() {
  return `import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  DefaultToolbar,
  type Editor,
  type TLComponents,
  type TLUiActionsContextType,
  type TLUiOverrides,
  Tldraw,
  type TldrawProps,
} from 'tldraw'

import type { EditorSession } from '../runtime/editor-session'
import {
  CanvasInspectorStylePanel,
} from './canvas-inspector-portal'
import {
  useBindEditorSession,
  useTldrawLicenseKey,
} from './editor-context'

export const HYBRID_CANVAS_SAVE_ACTION_ID =
  'hybrid-canvas.save'

/**
 * tldraw 负责：
 * - Editor selection
 * - current tool
 * - relevant styles
 * - shared/mixed styles
 * - next-shape styles
 * - StylePanel React context
 *
 * Workspace 只负责：
 * - 右栏布局
 * - 展开/收起
 * - 响应式宽度
 */
function CanvasTopToolbar() {
  return (
    <div className="hc-canvas-top-toolbar">
      <DefaultToolbar />
    </div>
  )
}

const BASE_CANVAS_COMPONENTS: TLComponents = {
  PageMenu: null,
  Toolbar: null,
  TopPanel: CanvasTopToolbar,
}

export interface EditorCanvasProps {
  readonly session: EditorSession
  readonly isActive?: boolean
  readonly onSave?: () => void
}

export function EditorCanvas({
  session,
  isActive = true,
  onSave,
}: EditorCanvasProps) {
  const licenseKey =
    useTldrawLicenseKey()

  const [editor, setEditor] =
    useState<Editor | null>(null)

  const {
    registration,
    store,
  } = session

  useBindEditorSession(
    isActive ? editor : null,
    isActive ? registration : null,
  )

  const hasTools =
    registration.tools.length > 0

  const overrides =
    useMemo<TLUiOverrides>(
      () =>
        createCanvasUiOverrides(
          onSave,
        ),
      [onSave],
    )

  /*
   * 每个 Editor Session 都有自己的 StylePanel slot，
   * 但只有 active session 可以发布到 Workspace Dock。
   */
  const components =
    useMemo<TLComponents>(
      () => ({
        ...BASE_CANVAS_COMPONENTS,

        StylePanel:
          function WorkspacePropertiesInspector() {
            return (
              <CanvasInspectorStylePanel
                active={isActive}
              />
            )
          },
      }),
      [isActive],
    )

  const tldrawProps =
    useMemo((): TldrawProps => {
      const base: TldrawProps = {
        hideUi: false,
        licenseKey,
        store,
        onMount: setEditor,
        overrides,
        components,

        options: {
          maxPages: 100,
          actionShortcutsLocation:
            'toolbar',
        },

        shapeUtils:
          registration.shapeUtils,

        bindingUtils:
          registration.bindingUtils,
      }

      if (hasTools) {
        base.tools =
          registration.tools
      }

      return base
    }, [
      components,
      hasTools,
      licenseKey,
      overrides,
      registration,
      store,
    ])

  useEffect(() => {
    if (!editor) {
      return
    }

    if (isActive) {
      editor.setCameraOptions({
        ...editor.getCameraOptions(),
        wheelBehavior: 'zoom',
        zoomSpeed: 1,
      })

      editor.updateInstanceState({
        isGridMode: false,
        isToolLocked: true,
      })

      session.attachEditor(editor)

      return () =>
        session.detachEditor(editor)
    }

    session.detachEditor(editor)

    return undefined
  }, [
    editor,
    isActive,
    session,
  ])

  return (
    <div
      className="relative size-full overflow-hidden bg-canvas"
      data-document-id={
        session.documentId
      }
      data-session-id={
        session.sessionId
      }
    >
      <Tldraw {...tldrawProps} />
    </div>
  )
}

function createCanvasUiOverrides(
  onSave:
    | (() => void)
    | undefined,
): TLUiOverrides {
  return {
    actions(
      _editor,
      actions,
    ): TLUiActionsContextType {
      if (!onSave) {
        return actions
      }

      return {
        ...actions,

        [HYBRID_CANVAS_SAVE_ACTION_ID]: {
          id:
            HYBRID_CANVAS_SAVE_ACTION_ID,

          label: '保存',
          kbd: 'cmd+s,ctrl+s',

          onSelect() {
            onSave()
          },
        },
      }
    },
  }
}

export {
  useEditor,
} from './editor-context'
`
}

async function transformEditorReactPublicApi() {
  let source = normalize(
    await readFile(
      paths.editorReactPublicApi,
      'utf8',
    ),
  )

  if (
    !source.includes(
      "from './canvas-inspector-portal'",
    )
  ) {
    source += `
export {
  CanvasInspectorDock,
  CanvasInspectorPortalProvider,
  type CanvasInspectorPortalProviderProps,
  CanvasInspectorStylePanel,
  type CanvasInspectorStylePanelProps,
  useCanvasInspectorAvailability,
} from './canvas-inspector-portal'
`
  }

  await write(
    paths.editorReactPublicApi,
    source,
  )
}

async function transformWorkspaceContainer() {
  let source = normalize(
    await readFile(
      paths.workspaceContainer,
      'utf8',
    ),
  )

  source = source.replace(
    /import\s+\{\s*EditorSessionHost,\s*useEditor\s*\}\s+from\s+['"]@hybrid-canvas\/canvas\/react['"]/,
    `import {
  CanvasInspectorDock,
  EditorSessionHost,
  useCanvasInspectorAvailability,
  useEditor,
} from '@hybrid-canvas/canvas/react'`,
  )

  if (
    !source.includes(
      'useCanvasInspectorAvailability',
    )
  ) {
    throw new Error(
      '无法迁移 WorkspaceContainer canvas/react import。',
    )
  }

  source = source.replace(
    /^import\s+\{\s*useValue\s*\}\s+from\s+['"]tldraw['"]\s*\n/m,
    '',
  )

  source = source.replace(
    /^import .*CanvasInspectorContent.*\n/m,
    '',
  )

  source = source.replace(
    /^import .*ToolInspectorRegistry.*\n/m,
    '',
  )

  source = removeRangeIfPresent(
    source,
    '  const inspectorSelectionKey = useValue(\n',
    '  const workbench = useSyncExternalStore(\n',
  )

  source = removeRangeIfPresent(
    source,
    [
      '  /*',
      '   * Core Inspector 与 Feature Inspector 合并。',
    ].join('\n'),
    '  const pages = useSyncExternalStore(\n',
  )

  if (
    !source.includes(
      'const inspectorAvailable =',
    )
  ) {
    source = replaceRequired(
      source,
      `  const editor = useEditor()
`,
      `  const editor = useEditor()

  const inspectorAvailable =
    useCanvasInspectorAvailability()
`,
      'WorkspaceContainer 添加 Inspector availability',
    )
  }

  source = source.replace(
    /\s{6}inspector=\{\s*<CanvasInspectorContent[\s\S]*?\/>\s*\}\s*\n(?:\s{6}inspectorSelectionKey=\{inspectorSelectionKey\}\s*\n)?/,
    `      inspector={
        <CanvasInspectorDock />
      }
      inspectorAvailable={
        inspectorAvailable
      }
`,
  )

  source = source.replace(
    /\s{6}inspector=\{null\}\s*\n(?:\s{6}inspectorSelectionKey=\{inspectorSelectionKey\}\s*\n)?/,
    `      inspector={
        <CanvasInspectorDock />
      }
      inspectorAvailable={
        inspectorAvailable
      }
`,
  )

  source = source.replace(
    /^\s*inspectorSelectionKey=\{inspectorSelectionKey\}\s*\n/m,
    '',
  )

  if (
    !source.includes(
      '<CanvasInspectorDock />',
    )
  ) {
    throw new Error(
      'WorkspaceContainer 没有成功接入 CanvasInspectorDock。',
    )
  }

  await write(
    paths.workspaceContainer,
    source,
  )
}

async function transformWorkspaceShell() {
  let source = normalize(
    await readFile(
      paths.workspaceShell,
      'utf8',
    ),
  )

  source = source.replace(
    /^\s*const previousInspectorSelectionKeyRef = useRef\(inspectorSelectionKey \?\? ''\)\s*\n/m,
    '',
  )

  source = source.replace(
    /^\s*inspectorSelectionKey,\s*\n/m,
    '',
  )

  source = removeRangeIfPresent(
    source,
    [
      '  useEffect(() => {',
      '    const previousKey = previousInspectorSelectionKeyRef.current',
    ].join('\n'),
    '  const openSidebar = () => {\n',
  )

  if (
    !/^\s*inspectorAvailable,\s*$/m.test(
      source,
    )
  ) {
    source = replaceRequired(
      source,
      `  inspector,
`,
      `  inspector,
  inspectorAvailable,
`,
      'WorkspaceShell 添加 inspectorAvailable',
    )
  }

  /*
   * 默认允许显示。
   * 当内容第一次可用时直接出现；
   * 用户手动关闭后不会因 selection 改变而重新打开。
   */
  source = source.replace(
    /const \[isInspectorOpen, setInspectorOpen\] = useState\(false\)/,
    'const [isInspectorOpen, setInspectorOpen] = useState(true)',
  )

  source = source.replace(
    /const dockInspector =\s*inspector !== null && inspector !== undefined && isInspectorOpen && hasCanvas/,
    `const dockInspector =
    inspectorAvailable &&
    isInspectorOpen &&
    hasCanvas`,
  )

  source = source.replace(
    /const inspectorRegion = hasCanvas && inspector !== null && inspector !== undefined \? \(/,
    `const inspectorRegion =
    hasCanvas && inspectorAvailable ? (`,
  )

  if (
    !source.includes(
      'inspectorAvailable &&',
    )
  ) {
    throw new Error(
      'WorkspaceShell 没有成功切换到 availability 驱动。',
    )
  }

  await write(
    paths.workspaceShell,
    source,
  )
}

async function transformShellContract() {
  let source = normalize(
    await readFile(
      paths.shellContract,
      'utf8',
    ),
  )

  source = source.replace(
    /\s{2}\/\*\*\n\s{3}\* 当前编辑器选区标识。\n\s{3}\* 仅用于请求显示属性面板，不承载画布文档状态。\n\s{3}\*\/\n\s{2}readonly inspectorSelectionKey\?: string\n/,
    '',
  )

  source = source.replace(
    /^\s*readonly inspectorSelectionKey\?: string\s*\n/m,
    '',
  )

  if (
    !source.includes(
      'readonly inspectorAvailable: boolean',
    )
  ) {
    source = replaceRequired(
      source,
      `  readonly inspector: ReactNode
`,
      `  readonly inspector: ReactNode
  /**
   * 仅表示右栏是否有实际可渲染内容。
   *
   * 不包含 selection、tool、styles 或 Shape 数据。
   */
  readonly inspectorAvailable: boolean
`,
      'WorkspaceShellProps 添加 inspectorAvailable',
    )
  }

  await write(
    paths.shellContract,
    source,
  )
}

function createArchitectureTest() {
  return `#!/usr/bin/env node

import {
  readFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

const files = {
  editorCanvas: path.join(
    root,
    'editor/core/src/react/EditorCanvas.tsx',
  ),

  portal: path.join(
    root,
    'editor/core/src/react/canvas-inspector-portal.tsx',
  ),

  workspaceContainer: path.join(
    root,
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  ),

  workspaceShell: path.join(
    root,
    'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
  ),

  shellContract: path.join(
    root,
    'features/workspace/src/contracts/shell-contract.ts',
  ),

  extensionContract: path.join(
    root,
    'editor/core/src/contracts/extension-contract.ts',
  ),
}

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(
      async ([key, filePath]) => [
        key,
        await readFile(
          filePath,
          'utf8',
        ),
      ],
    ),
  ),
)

const violations = []

requirePattern(
  'EditorCanvas',
  sources.editorCanvas,
  /StylePanel:\\s*function WorkspacePropertiesInspector/,
  '必须通过 tldraw StylePanel slot 接入 Inspector',
)

requirePattern(
  'InspectorPortal',
  sources.portal,
  /useRelevantStyles\\s*\\(/,
  '必须使用 tldraw 官方 useRelevantStyles',
)

requirePattern(
  'InspectorPortal',
  sources.portal,
  /createPortal\\s*\\(/,
  '必须通过 Portal 渲染到 Workspace Dock',
)

requirePattern(
  'InspectorPortal',
  sources.portal,
  /<DefaultStylePanel/,
  '架构阶段必须使用官方 DefaultStylePanel 验证上下文',
)

const forbiddenWorkspacePatterns = [
  /getSelectedShapeIds\\s*\\(/,
  /getSelectedShapes\\s*\\(/,
  /getOnlySelectedShape\\s*\\(/,
  /getCurrentToolId\\s*\\(/,
  /getSharedStyles\\s*\\(/,
  /useRelevantStyles\\s*\\(/,
  /inspectorSelectionKey/,
  /CanvasInspectorContent/,
  /ToolInspectorRegistry/,
]

for (const pattern of forbiddenWorkspacePatterns) {
  forbidPattern(
    'WorkspaceContainer',
    sources.workspaceContainer,
    pattern,
    'Workspace 不得读取或路由 Editor Inspector 状态',
  )
}

requirePattern(
  'WorkspaceContainer',
  sources.workspaceContainer,
  /<CanvasInspectorDock\\s*\\/>/,
  'Workspace 必须只提供 Inspector Portal Dock',
)

requirePattern(
  'WorkspaceShell',
  sources.workspaceShell,
  /inspectorAvailable/,
  'Workspace 必须使用内容 availability 控制布局',
)

forbidPattern(
  'WorkspaceShell',
  sources.workspaceShell,
  /inspectorSelectionKey/,
  'Workspace 不得接收 selection key',
)

forbidPattern(
  'WorkspaceShellProps',
  sources.shellContract,
  /inspectorSelectionKey/,
  'Workspace contract 不得暴露 selection key',
)

requirePattern(
  'WorkspaceShellProps',
  sources.shellContract,
  /readonly inspectorAvailable: boolean/,
  'Workspace contract 必须只暴露 availability',
)

forbidPattern(
  'ExtensionContract',
  sources.extensionContract,
  /toolInspectors/,
  'Extension API 不得恢复 tool-first Inspector',
)

requirePattern(
  'ExtensionContract',
  sources.extensionContract,
  /creationInspectors/,
  'Extension API 必须使用 creation-specific contribution',
)

if (violations.length > 0) {
  console.error('')
  console.error(
    'Properties Inspector architecture: FAILED',
  )
  console.error('')

  for (const violation of violations) {
    console.error('- ' + violation)
  }

  console.error('')
  process.exitCode = 1
} else {
  console.log(
    'Properties Inspector architecture: OK',
  )
}

function requirePattern(
  owner,
  source,
  pattern,
  message,
) {
  if (!pattern.test(source)) {
    violations.push(
      owner + ': ' + message,
    )
  }
}

function forbidPattern(
  owner,
  source,
  pattern,
  message,
) {
  if (pattern.test(source)) {
    violations.push(
      owner + ': ' + message,
    )
  }
}
`
}

async function transformPackageJson() {
  const parsed = JSON.parse(
    await readFile(
      paths.packageJson,
      'utf8',
    ),
  )

  const current =
    parsed.scripts?.[
      'test:architecture'
    ]

  if (typeof current !== 'string') {
    throw new Error(
      'package.json 缺少 scripts.test:architecture。',
    )
  }

  const command =
    'node tests/architecture/check-properties-inspector-architecture.mjs'

  if (!current.includes(command)) {
    parsed.scripts[
      'test:architecture'
    ] = `${current} && ${command}`
  }

  await write(
    paths.packageJson,
    JSON.stringify(
      parsed,
      null,
      2,
    ),
  )
}

async function validateFinalRepository() {
  const files =
    await collectSourceFiles(root)

  const violations = []

  for (const filePath of files) {
    const source =
      await readFile(
        filePath,
        'utf8',
      )

    if (
      /\btoolInspectors\b/.test(
        source,
      )
    ) {
      violations.push(
        `${relative(filePath)} 仍然包含 toolInspectors`,
      )
    }

    if (
      /\bHybridCanvasToolInspector/.test(
        source,
      )
    ) {
      violations.push(
        `${relative(filePath)} 仍然包含旧 ToolInspector 类型`,
      )
    }
  }

  const workspaceContainer =
    await readFile(
      paths.workspaceContainer,
      'utf8',
    )

  const forbidden = [
    'getSelectedShapeIds(',
    'getSelectedShapes(',
    'getCurrentToolId(',
    'getSharedStyles(',
    'useRelevantStyles(',
    'inspectorSelectionKey',
    'CanvasInspectorContent',
    'ToolInspectorRegistry',
  ]

  for (const token of forbidden) {
    if (
      workspaceContainer.includes(
        token,
      )
    ) {
      violations.push(
        `WorkspaceContainer 仍然包含 ${token}`,
      )
    }
  }

  if (violations.length > 0) {
    throw new Error(
      [
        '最终架构验证失败：',
        '',
        ...violations.map(
          (item) => `- ${item}`,
        ),
      ].join('\n'),
    )
  }
}

async function collectSourceFiles(
  directory,
) {
  const result = []

  async function visit(current) {
    const entries =
      await readdir(
        current,
        {
          withFileTypes: true,
        },
      )

    for (const entry of entries) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === 'target' ||
        entry.name === 'dist' ||
        entry.name === '.turbo'
      ) {
        continue
      }

      const entryPath =
        path.join(
          current,
          entry.name,
        )

      if (entry.isDirectory()) {
        await visit(entryPath)
        continue
      }

      if (
        /\.(?:ts|tsx)$/.test(
          entry.name,
        )
      ) {
        result.push(entryPath)
      }
    }
  }

  await visit(directory)
  return result
}

function removeRangeIfPresent(
  source,
  startMarker,
  endMarker,
) {
  const start =
    source.indexOf(startMarker)

  if (start < 0) {
    return source
  }

  const end =
    source.indexOf(
      endMarker,
      start + startMarker.length,
    )

  if (end < 0) {
    throw new Error(
      [
        '找到删除区域起点，但没有找到终点。',
        '',
        `起点：${JSON.stringify(startMarker)}`,
        `终点：${JSON.stringify(endMarker)}`,
      ].join('\n'),
    )
  }

  return (
    source.slice(0, start) +
    source.slice(end)
  )
}

function replaceRequired(
  source,
  search,
  replacement,
  operation,
) {
  if (!source.includes(search)) {
    throw new Error(
      `无法安全执行：${operation}`,
    )
  }

  return source.replace(
    search,
    replacement,
  )
}

async function assertRepository() {
  await Promise.all([
    readFile(
      resolve('AGENTS.md'),
      'utf8',
    ),

    readFile(
      paths.packageJson,
      'utf8',
    ),

    readFile(
      paths.editorCanvas,
      'utf8',
    ),

    readFile(
      paths.editorContext,
      'utf8',
    ),

    readFile(
      paths.workspaceContainer,
      'utf8',
    ),

    readFile(
      paths.workspaceShell,
      'utf8',
    ),

    readFile(
      paths.shellContract,
      'utf8',
    ),
  ])
}

async function write(
  filePath,
  content,
) {
  await mkdir(
    path.dirname(filePath),
    {
      recursive: true,
    },
  )

  await writeFile(
    filePath,
    finish(content),
    'utf8',
  )
}

function resolve(relativePath) {
  return path.join(
    root,
    relativePath,
  )
}

function relative(filePath) {
  return path.relative(
    root,
    filePath,
  )
}

function normalize(source) {
  return source.replaceAll(
    '\r\n',
    '\n',
  )
}

function finish(source) {
  return (
    normalize(source).trimEnd() +
    '\n'
  )
}

function printSummary() {
  console.log('')
  console.log(
    'Properties Inspector 架构重构完成。',
  )
  console.log('')

  console.log('已完成：')
  console.log(
    '  - 删除旧 App-owned Inspector 目录',
  )
  console.log(
    '  - 删除 tool-first Inspector composition',
  )
  console.log(
    '  - toolInspectors 迁移为 creationInspectors',
  )
  console.log(
    '  - Extension API 升级为 v2',
  )
  console.log(
    '  - tldraw StylePanel 成为唯一入口',
  )
  console.log(
    '  - useRelevantStyles 成为官方相关性来源',
  )
  console.log(
    '  - 官方 DefaultStylePanel 通过 Portal 停靠到右栏',
  )
  console.log(
    '  - Workspace 只接收 inspectorAvailable',
  )
  console.log(
    '  - 多画布只允许 active Editor 发布 Inspector',
  )
  console.log(
    '  - 加入架构守卫测试',
  )

  console.log('')
  console.log(
    '没有创建备份文件，回滚请使用 Git。',
  )

  console.log('')
  console.log('接下来执行：')
  console.log('  pnpm format')
  console.log('  pnpm lint')
  console.log('  pnpm typecheck')
  console.log('  pnpm test:architecture')
  console.log('  pnpm test')
  console.log('  pnpm build:desktop')
  console.log('')
}