#!/usr/bin/env node

/* biome-ignore-all lint/suspicious/noConsole: Migration CLI intentionally reports progress. */

import {
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { relative, resolve } from 'node:path'

const root = findRepositoryRoot(
  resolve(parseRootArgument(process.argv.slice(2))),
)

const changedFiles = new Map()

main().catch((error) => {
  console.error('')

  if (error instanceof Error) {
    console.error(error.stack ?? error.message)
  } else {
    console.error(error)
  }

  if (changedFiles.size > 0) {
    console.error('\n验证失败，正在恢复本次修改……')

    try {
      rollback()
      console.error('已恢复全部脚本修改。')
    } catch (rollbackError) {
      console.error('自动恢复失败：', rollbackError)
      console.error('请执行 git diff 并人工恢复。')
    }
  }

  process.exitCode = 1
})

async function main() {
  assertRepository()
  assertCleanWorktree()
  assertPreviousMigrationCompleted()

  console.log(`仓库：${root}`)
  console.log('迁移：tldraw Action / Tool / Shortcut 统一管线')
  console.log('')

  replaceEditorCanvas()
  migrateToolbarToTldrawActions()

  formatChangedFiles()
  verifySourceInvariants()
  verifyProject()

  console.log('\nAction 管线迁移完成。')
  console.log('\n修改文件：')

  for (const path of changedFiles.keys()) {
    console.log(`- ${relative(root, path)}`)
  }

  console.log(`
结果：

- 保留现有 Hybrid Canvas 工具栏视觉；
- 工具选择统一通过 tldraw useTools；
- 编辑操作统一通过 tldraw useActions；
- 保存成为正式 tldraw UI Action；
- Ctrl/Cmd+S 由 tldraw 快捷键系统注册；
- 删除 EditorCanvas 的 document keydown；
- 工具栏进入 InFrontOfTheCanvas；
- 不再在 tldraw Provider 外复制 Action 语义；
- 不增加 fallback 或新旧双轨。
`)
}

function parseRootArgument(arguments_) {
  let rootArgument = null

  for (const argument of arguments_) {
    if (argument === '--apply') {
      continue
    }

    if (
      argument === '--help' ||
      argument === '-h'
    ) {
      console.log(`
用法：

  node refactor-actions.mjs
  node refactor-actions.mjs --apply
  node refactor-actions.mjs "D:\\xiaojianc\\hybrid-canvas"
`)
      process.exit(0)
    }

    if (argument.startsWith('--')) {
      fail(`未知参数：${argument}`)
    }

    if (rootArgument !== null) {
      fail('只能指定一个项目目录。')
    }

    rootArgument = argument
  }

  return rootArgument ?? '.'
}

function findRepositoryRoot(startDirectory) {
  try {
    return resolve(
      execFileSync(
        'git',
        [
          '-C',
          startDirectory,
          'rev-parse',
          '--show-toplevel',
        ],
        {
          encoding: 'utf8',
          env: process.env,
          shell: process.platform === 'win32',
        },
      ).trim(),
    )
  } catch {
    fail(`无法从该目录找到 Git 仓库：${startDirectory}`)
  }
}

function assertRepository() {
  const required = [
    'package.json',
    'editor/core/src/react/EditorCanvas.tsx',
    'editor/core/src/react/CanvasToolbar.tsx',
    'features/flowchart/src/shapes/FlowNodeShapeUtil.tsx',
    'apps/desktop/src/bootstrap/application.ts',
  ]

  for (const item of required) {
    if (!existsSync(resolve(root, item))) {
      fail(`缺少必要文件：${item}`)
    }
  }

  const packageJson = JSON.parse(
    readFileSync(
      resolve(root, 'package.json'),
      'utf8',
    ),
  )

  if (packageJson.name !== 'hybrid-canvas') {
    fail(
      `目标项目不是 hybrid-canvas：${String(packageJson.name)}`,
    )
  }
}

function assertCleanWorktree() {
  const status = capture('git', [
    'status',
    '--porcelain',
    '--untracked-files=normal',
  ])

  if (status.trim()) {
    fail(
      [
        'Git 工作区不干净。',
        '请先提交上一个迁移，再执行本脚本。',
        '',
        status,
      ].join('\n'),
    )
  }
}

function assertPreviousMigrationCompleted() {
  const flowNode = read(
    resolve(
      root,
      'features/flowchart/src/shapes/FlowNodeShapeUtil.tsx',
    ),
  )

  const application = read(
    resolve(
      root,
      'apps/desktop/src/bootstrap/application.ts',
    ),
  )

  if (
    !flowNode.includes(
      'T.literalEnum(...FLOW_NODE_TYPES)',
    )
  ) {
    fail(
      [
        '上一个 P1 迁移尚未应用。',
        'FlowNode 仍未使用 T.literalEnum。',
        '请先执行前一个 refactor.mjs。',
      ].join('\n'),
    )
  }

  if (
    application.includes(
      'scientificPlotExtension',
    )
  ) {
    fail(
      [
        '上一个 P1 迁移尚未完成。',
        '科学图表原型仍注册在 production composition root。',
      ].join('\n'),
    )
  }
}

function replaceEditorCanvas() {
  const path = resolve(
    root,
    'editor/core/src/react/EditorCanvas.tsx',
  )

  const current = read(path)

  const expectedMarkers = [
    'document.addEventListener(\'keydown\', onKeyDown)',
    '<CanvasToolbar onSave={handleSave} />',
    'hideUi: true',
    'useBindEditorSession',
  ]

  for (const marker of expectedMarkers) {
    if (!current.includes(marker)) {
      fail(
        [
          'EditorCanvas 与迁移前置条件不一致。',
          `缺少标记：${marker}`,
        ].join('\n'),
      )
    }
  }

  const next = `import { Minus, Plus } from '@mynaui/icons-react'
import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  type Editor,
  type TLComponents,
  type TLUiActionsContextType,
  type TLUiOverrides,
  Tldraw,
  type TldrawProps,
  useActions,
  useEditor as useTldrawEditor,
  useValue,
} from 'tldraw'

import type { EditorSession } from '../runtime/editor-session'
import { CanvasToolbar } from './CanvasToolbar'
import {
  useBindEditorSession,
  useTldrawLicenseKey,
} from './editor-context'

export const HYBRID_CANVAS_SAVE_ACTION_ID =
  'hybrid-canvas.save'

const CANVAS_COMPONENTS: TLComponents = {
  InFrontOfTheCanvas: CanvasUiOverlay,
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
  const licenseKey = useTldrawLicenseKey()
  const [editor, setEditor] =
    useState<Editor | null>(null)

  const { registration, store } = session

  useBindEditorSession(
    isActive ? editor : null,
    isActive ? registration : null,
  )

  const hasTools =
    registration.tools.length > 0

  /*
   * Product actions enter through tldraw's official Action provider.
   * This makes toolbar invocation and keyboard invocation share one command.
   */
  const overrides = useMemo<TLUiOverrides>(
    () => createCanvasUiOverrides(onSave),
    [onSave],
  )

  const tldrawProps =
    useMemo((): TldrawProps => {
      const base: TldrawProps = {
        hideUi: true,
        licenseKey,
        store,
        onMount: setEditor,
        overrides,
        components: CANVAS_COMPONENTS,
        options: {
          maxPages: 100,
        },
        shapeUtils:
          registration.shapeUtils,
        bindingUtils:
          registration.bindingUtils,
      }

      if (hasTools) {
        base.tools = registration.tools
      }

      return base
    }, [
      store,
      registration,
      hasTools,
      licenseKey,
      overrides,
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
  }, [editor, isActive, session])

  return (
    <div
      className="relative size-full overflow-hidden bg-canvas"
      data-document-id={session.documentId}
      data-session-id={session.sessionId}
    >
      <Tldraw {...tldrawProps} />
    </div>
  )
}

function createCanvasUiOverrides(
  onSave: (() => void) | undefined,
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
          id: HYBRID_CANVAS_SAVE_ACTION_ID,
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

/*
 * This component is mounted by tldraw inside TldrawUiContextProvider.
 *
 * Even with hideUi enabled, tldraw keeps its Action, Tool, keyboard shortcut
 * and clipboard providers mounted while suppressing only the default visuals.
 */
function CanvasUiOverlay() {
  return (
    <>
      <CanvasToolbar />
      <CanvasZoomControl />
    </>
  )
}

function CanvasZoomControl() {
  const editor = useTldrawEditor()
  const actions = useActions()

  const zoomPercentage = useValue(
    'canvas zoom',
    () =>
      Math.round(
        editor.getZoomLevel() * 100,
      ),
    [editor],
  )

  return (
    <div className="absolute bottom-3 right-3 z-20 flex h-8 items-center rounded-lg border bg-background/95 shadow-sm backdrop-blur-xl">
      <button
        aria-label="缩小"
        className="grid size-8 place-items-center rounded-l-lg text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() =>
          invokeAction(
            actions,
            'zoom-out',
          )
        }
        type="button"
      >
        <Minus className="size-3.5" />
      </button>

      <button
        aria-label="重置缩放"
        className="h-8 min-w-12 border-x px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() =>
          invokeAction(
            actions,
            'zoom-to-100',
          )
        }
        type="button"
      >
        {zoomPercentage}%
      </button>

      <button
        aria-label="放大"
        className="grid size-8 place-items-center rounded-r-lg text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() =>
          invokeAction(
            actions,
            'zoom-in',
          )
        }
        type="button"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  )
}

function invokeAction(
  actions: TLUiActionsContextType,
  actionId: string,
): void {
  const action = actions[actionId]

  if (!action) {
    throw new Error(
      \`TLDRAW_ACTION_NOT_REGISTERED:\${actionId}\`,
    )
  }

  void action.onSelect('toolbar')
}

// Keep the application-level active-editor API available to external packages.
export { useEditor } from './editor-context'
`

  update(path, next)
}

function migrateToolbarToTldrawActions() {
  const path = resolve(
    root,
    'editor/core/src/react/CanvasToolbar.tsx',
  )

  let source = read(path)

  assertContains(
    source,
    'editor?.setCurrentTool(toolId)',
    '工具栏已经发生变化，找不到直接工具切换代码。',
  )

  assertContains(
    source,
    'editor?.undo()',
    '找不到旧 Undo 直接调用。',
  )

  assertContains(
    source,
    'document.addEventListener',
    '找不到工具栏菜单的 DOM listener。',
  )

  source = replaceExactlyOnce(
    source,
    `import { useValue } from 'tldraw'\n`,
    `import {
  type TLUiActionsContextType,
  useActions,
  useEditor,
  useTools,
  useValue,
} from 'tldraw'\n`,
    'tldraw UI hooks import',
  )

  source = replaceExactlyOnce(
    source,
    `import { useEditor } from './editor-context'\n`,
    '',
    'legacy external editor context import',
  )

  source = replaceExactlyOnce(
    source,
    `export interface CanvasToolbarProps {
  readonly onSave?: () => void
}

export function CanvasToolbar({ onSave }: CanvasToolbarProps) {
  const editor = useEditor()
`,
    `export function CanvasToolbar() {
  const editor = useEditor()
  const actions = useActions()
  const tools = useTools()
`,
    'CanvasToolbar provider inputs',
  )

  source = replaceExactlyOnce(
    source,
    `  const selectedIds = selectedShapes.map((shape) => shape.id)

  const activateTool = (toolId: CanvasToolId) => {
    editor?.setCurrentTool(toolId)
    setMoreOpen(false)
  }

  const toggleLock = () => {
    if (!editor || !hasSelection) {
      return
    }

    const shouldLock = !selectedShapes.every((shape) => shape.isLocked)

    editor.updateShapes(
      selectedShapes.map((shape) => ({
        id: shape.id,
        type: shape.type,
        isLocked: shouldLock,
      })) as never,
    )

    setMoreOpen(false)
  }

  const execute = (action: () => void) => {
    action()
    setMoreOpen(false)
  }
`,
    `  const activateTool = (
    toolId: CanvasToolId,
  ) => {
    const tool = tools[toolId]

    if (!tool) {
      throw new Error(
        \`TLDRAW_TOOL_NOT_REGISTERED:\${toolId}\`,
      )
    }

    void tool.onSelect('toolbar')
    setMoreOpen(false)
  }

  const execute = (
    actionId: string,
  ) => {
    invokeAction(actions, actionId)
    setMoreOpen(false)
  }

  const saveAction =
    actions['hybrid-canvas.save']
`,
    'official tool and action invocation',
  )

  const replacements = [
    [
      `onClick={() => editor?.undo()}`,
      `onClick={() => execute('undo')}`,
      'undo action',
    ],
    [
      `onClick={() => editor?.redo()}`,
      `onClick={() => execute('redo')}`,
      'redo action',
    ],
    [
      `onClick={() => execute(() => editor?.selectAll())}`,
      `onClick={() => execute('select-all')}`,
      'select-all action',
    ],
    [
      `onClick={() => execute(() => editor?.groupShapes(selectedIds))}`,
      `onClick={() => execute('group')}`,
      'group action',
    ],
    [
      `onClick={() => execute(() => editor?.ungroupShapes(selectedIds))}`,
      `onClick={() => execute('ungroup')}`,
      'ungroup action',
    ],
    [
      `onClick={toggleLock}`,
      `onClick={() => execute('toggle-lock')}`,
      'toggle-lock action',
    ],
    [
      `onClick={() => execute(() => editor?.bringToFront(selectedIds))}`,
      `onClick={() => execute('bring-to-front')}`,
      'bring-to-front action',
    ],
    [
      `onClick={() => execute(() => editor?.bringForward(selectedIds))}`,
      `onClick={() => execute('bring-forward')}`,
      'bring-forward action',
    ],
    [
      `onClick={() => execute(() => editor?.sendBackward(selectedIds))}`,
      `onClick={() => execute('send-backward')}`,
      'send-backward action',
    ],
    [
      `onClick={() => execute(() => editor?.sendToBack(selectedIds))}`,
      `onClick={() => execute('send-to-back')}`,
      'send-to-back action',
    ],
    [
      `onClick={() => execute(() => editor?.flipShapes(selectedIds, 'horizontal'))}`,
      `onClick={() => execute('flip-horizontal')}`,
      'flip-horizontal action',
    ],
    [
      `onClick={() => execute(() => editor?.flipShapes(selectedIds, 'vertical'))}`,
      `onClick={() => execute('flip-vertical')}`,
      'flip-vertical action',
    ],
    [
      `onClick={() => execute(() => editor?.zoomToSelection())}`,
      `onClick={() => execute('zoom-to-selection')}`,
      'zoom-to-selection action',
    ],
    [
      `onClick={() => execute(() => editor?.zoomToFit())}`,
      `onClick={() => execute('zoom-to-fit')}`,
      'zoom-to-fit action',
    ],
    [
      `onClick={() => execute(() => editor?.resetZoom())}`,
      `onClick={() => execute('zoom-to-100')}`,
      'zoom-to-100 action',
    ],
  ]

  for (const [
    oldText,
    newText,
    label,
  ] of replacements) {
    source = replaceExactlyOnce(
      source,
      oldText,
      newText,
      label,
    )
  }

  source = replaceExactlyOnce(
    source,
    `      {onSave ? (
        <>
          <Separator className="mx-1 h-5 shrink-0" orientation="vertical" />

          <ToolbarButton icon={Save} label="保存" onClick={onSave} shortcut="Ctrl+S" />
        </>
      ) : null}
`,
    `      {saveAction ? (
        <>
          <Separator
            className="mx-1 h-5 shrink-0"
            orientation="vertical"
          />

          <ToolbarButton
            icon={Save}
            label="保存"
            onClick={() =>
              void saveAction.onSelect(
                'toolbar',
              )
            }
            shortcut="Ctrl+S"
          />
        </>
      ) : null}
`,
    'save UI action',
  )

  source += `

function invokeAction(
  actions: TLUiActionsContextType,
  actionId: string,
): void {
  const action = actions[actionId]

  if (!action) {
    throw new Error(
      \`TLDRAW_ACTION_NOT_REGISTERED:\${actionId}\`,
    )
  }

  void action.onSelect('toolbar')
}
`

  update(path, source)
}

function verifySourceInvariants() {
  const editorCanvas = read(
    resolve(
      root,
      'editor/core/src/react/EditorCanvas.tsx',
    ),
  )

  const toolbar = read(
    resolve(
      root,
      'editor/core/src/react/CanvasToolbar.tsx',
    ),
  )

  const forbiddenEditorCanvas = [
    'document.addEventListener(\'keydown\'',
    '<CanvasToolbar onSave=',
    'editor.zoomOut()',
    'editor.zoomIn()',
    'editor.resetZoom()',
  ]

  for (const marker of forbiddenEditorCanvas) {
    if (editorCanvas.includes(marker)) {
      fail(
        `EditorCanvas 仍存在旧管线：${marker}`,
      )
    }
  }

  const requiredEditorCanvas = [
    'InFrontOfTheCanvas: CanvasUiOverlay',
    'createCanvasUiOverrides(onSave)',
    "kbd: 'cmd+s,ctrl+s'",
    "invokeAction(actions, 'zoom-out')",
    "invokeAction(actions, 'zoom-to-100')",
  ]

  for (const marker of requiredEditorCanvas) {
    if (!editorCanvas.includes(marker)) {
      fail(
        `EditorCanvas 缺少新管线：${marker}`,
      )
    }
  }

  const forbiddenToolbar = [
    'editor?.setCurrentTool(',
    'editor?.undo()',
    'editor?.redo()',
    'editor?.groupShapes(',
    'editor?.ungroupShapes(',
    'editor?.flipShapes(',
    'editor?.bringToFront(',
    'editor?.sendToBack(',
  ]

  for (const marker of forbiddenToolbar) {
    if (toolbar.includes(marker)) {
      fail(
        `CanvasToolbar 仍绕过官方 Action/Tool：${marker}`,
      )
    }
  }

  const requiredToolbar = [
    'useActions()',
    'useTools()',
    "execute('undo')",
    "execute('group')",
    "execute('toggle-lock')",
    "actions['hybrid-canvas.save']",
  ]

  for (const marker of requiredToolbar) {
    if (!toolbar.includes(marker)) {
      fail(
        `CanvasToolbar 缺少统一管线：${marker}`,
      )
    }
  }
}

function formatChangedFiles() {
  const paths = [...changedFiles.keys()].map(
    (path) => relative(root, path),
  )

  run('pnpm', [
    'exec',
    'biome',
    'format',
    '--write',
    ...paths,
  ])
}

function verifyProject() {
  run('pnpm', ['typecheck'])
  run('pnpm', ['lint'])
  run('pnpm', ['test'])
  run('pnpm', ['test:architecture'])
  run('pnpm', ['build:desktop'])
}

function read(path) {
  return readFileSync(path, 'utf8')
}

function update(path, content) {
  if (!changedFiles.has(path)) {
    changedFiles.set(path, read(path))
  }

  writeFileSync(path, content, 'utf8')

  console.log(
    `修改：${relative(root, path)}`,
  )
}

function replaceExactlyOnce(
  source,
  oldText,
  newText,
  label,
) {
  const first = source.indexOf(oldText)

  if (first < 0) {
    fail(`找不到预期源码：${label}`)
  }

  const second = source.indexOf(
    oldText,
    first + oldText.length,
  )

  if (second >= 0) {
    fail(`预期源码不唯一：${label}`)
  }

  return (
    source.slice(0, first) +
    newText +
    source.slice(first + oldText.length)
  )
}

function assertContains(
  source,
  marker,
  message,
) {
  if (!source.includes(marker)) {
    fail(message)
  }
}

function rollback() {
  const errors = []

  for (const [path, original] of changedFiles) {
    try {
      writeFileSync(path, original, 'utf8')
      console.error(
        `已恢复：${relative(root, path)}`,
      )
    } catch (error) {
      errors.push(error)
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      '部分文件恢复失败',
    )
  }
}

function run(command, arguments_) {
  console.log(
    `\n> ${command} ${arguments_.join(' ')}`,
  )

  execFileSync(command, arguments_, {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
}

function capture(command, arguments_) {
  return execFileSync(command, arguments_, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
}

function fail(message) {
  throw new Error(message)
}