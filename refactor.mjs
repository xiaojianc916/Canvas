#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.argv[2] ?? '.')
const editorCanvasPath = resolve(
  root,
  'editor/core/src/react/EditorCanvas.tsx',
)
const toolbarPath = resolve(
  root,
  'editor/core/src/react/CanvasToolbar.tsx',
)

main()

function main() {
  assertFile(editorCanvasPath)
  assertFile(toolbarPath)

  rewriteEditorCanvas()
  rewriteCanvasToolbar()

  console.log('已完成：')
  console.log('- editor/core/src/react/EditorCanvas.tsx')
  console.log('- editor/core/src/react/CanvasToolbar.tsx')
  console.log('')
  console.log('这个脚本不跑 git 检查、不跑 baseline、不跑 pnpm。')
  console.log('现在自己看 git diff，然后再决定是否 format / test / commit。')
}

function rewriteEditorCanvas() {
  const next = [
    "import { Minus, Plus } from '@mynaui/icons-react'",
    "import {",
    "  useEffect,",
    "  useMemo,",
    "  useState,",
    "} from 'react'",
    "import {",
    "  type Editor,",
    "  type TLComponents,",
    "  type TLUiActionsContextType,",
    "  type TLUiOverrides,",
    "  Tldraw,",
    "  type TldrawProps,",
    "  useActions,",
    "  useEditor as useTldrawEditor,",
    "  useValue,",
    "} from 'tldraw'",
    '',
    "import type { EditorSession } from '../runtime/editor-session'",
    "import { CanvasToolbar } from './CanvasToolbar'",
    "import {",
    "  useBindEditorSession,",
    "  useTldrawLicenseKey,",
    "} from './editor-context'",
    '',
    'export const HYBRID_CANVAS_SAVE_ACTION_ID =',
    "  'hybrid-canvas.save'",
    '',
    'const CANVAS_COMPONENTS: TLComponents = {',
    '  InFrontOfTheCanvas: CanvasUiOverlay,',
    '}',
    '',
    'export interface EditorCanvasProps {',
    '  readonly session: EditorSession',
    '  readonly isActive?: boolean',
    '  readonly onSave?: () => void',
    '}',
    '',
    'export function EditorCanvas({',
    '  session,',
    '  isActive = true,',
    '  onSave,',
    '}: EditorCanvasProps) {',
    '  const licenseKey = useTldrawLicenseKey()',
    '  const [editor, setEditor] =',
    '    useState<Editor | null>(null)',
    '',
    '  const { registration, store } = session',
    '',
    '  useBindEditorSession(',
    '    isActive ? editor : null,',
    '    isActive ? registration : null,',
    '  )',
    '',
    '  const hasTools =',
    '    registration.tools.length > 0',
    '',
    '  const overrides = useMemo<TLUiOverrides>(',
    '    () => createCanvasUiOverrides(onSave),',
    '    [onSave],',
    '  )',
    '',
    '  const tldrawProps =',
    '    useMemo((): TldrawProps => {',
    '      const base: TldrawProps = {',
    '        hideUi: true,',
    '        licenseKey,',
    '        store,',
    '        onMount: setEditor,',
    '        overrides,',
    '        components: CANVAS_COMPONENTS,',
    '        options: {',
    '          maxPages: 100,',
    '        },',
    '        shapeUtils:',
    '          registration.shapeUtils,',
    '        bindingUtils:',
    '          registration.bindingUtils,',
    '      }',
    '',
    '      if (hasTools) {',
    '        base.tools = registration.tools',
    '      }',
    '',
    '      return base',
    '    }, [',
    '      store,',
    '      registration,',
    '      hasTools,',
    '      licenseKey,',
    '      overrides,',
    '    ])',
    '',
    '  useEffect(() => {',
    '    if (!editor) {',
    '      return',
    '    }',
    '',
    '    if (isActive) {',
    '      editor.setCameraOptions({',
    '        ...editor.getCameraOptions(),',
    "        wheelBehavior: 'zoom',",
    '        zoomSpeed: 1,',
    '      })',
    '',
    '      editor.updateInstanceState({',
    '        isGridMode: false,',
    '        isToolLocked: true,',
    '      })',
    '',
    '      session.attachEditor(editor)',
    '',
    '      return () =>',
    '        session.detachEditor(editor)',
    '    }',
    '',
    '    session.detachEditor(editor)',
    '',
    '    return undefined',
    '  }, [editor, isActive, session])',
    '',
    '  return (',
    '    <div',
    '      className="relative size-full overflow-hidden bg-canvas"',
    '      data-document-id={session.documentId}',
    '      data-session-id={session.sessionId}',
    '    >',
    '      <Tldraw {...tldrawProps} />',
    '    </div>',
    '  )',
    '}',
    '',
    'function createCanvasUiOverrides(',
    '  onSave: (() => void) | undefined,',
    '): TLUiOverrides {',
    '  return {',
    '    actions(',
    '      _editor,',
    '      actions,',
    '    ): TLUiActionsContextType {',
    '      if (!onSave) {',
    '        return actions',
    '      }',
    '',
    '      return {',
    '        ...actions,',
    '',
    '        [HYBRID_CANVAS_SAVE_ACTION_ID]: {',
    '          id: HYBRID_CANVAS_SAVE_ACTION_ID,',
    "          label: '保存',",
    "          kbd: 'cmd+s,ctrl+s',",
    '',
    '          onSelect() {',
    '            onSave()',
    '          },',
    '        },',
    '      }',
    '    },',
    '  }',
    '}',
    '',
    'function CanvasUiOverlay() {',
    '  return (',
    '    <>',
    '      <CanvasToolbar />',
    '      <CanvasZoomControl />',
    '    </>',
    '  )',
    '}',
    '',
    'function CanvasZoomControl() {',
    '  const editor = useTldrawEditor()',
    '  const actions = useActions()',
    '',
    '  const zoomPercentage = useValue(',
    "    'canvas zoom',",
    '    () =>',
    '      Math.round(',
    '        editor.getZoomLevel() * 100,',
    '      ),',
    '    [editor],',
    '  )',
    '',
    '  return (',
    '    <div className="absolute bottom-3 right-3 z-20 flex h-8 items-center rounded-lg border bg-background/95 shadow-sm backdrop-blur-xl">',
    '      <button',
    '        aria-label="缩小"',
    '        className="grid size-8 place-items-center rounded-l-lg text-muted-foreground hover:bg-accent hover:text-foreground"',
    '        onClick={() =>',
    "          invokeAction(actions, 'zoom-out')",
    '        }',
    '        type="button"',
    '      >',
    '        <Minus className="size-3.5" />',
    '      </button>',
    '',
    '      <button',
    '        aria-label="重置缩放"',
    '        className="h-8 min-w-12 border-x px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"',
    '        onClick={() =>',
    "          invokeAction(actions, 'zoom-to-100')",
    '        }',
    '        type="button"',
    '      >',
    '        {zoomPercentage}%',
    '      </button>',
    '',
    '      <button',
    '        aria-label="放大"',
    '        className="grid size-8 place-items-center rounded-r-lg text-muted-foreground hover:bg-accent hover:text-foreground"',
    '        onClick={() =>',
    "          invokeAction(actions, 'zoom-in')",
    '        }',
    '        type="button"',
    '      >',
    '        <Plus className="size-3.5" />',
    '      </button>',
    '    </div>',
    '  )',
    '}',
    '',
    'function invokeAction(',
    '  actions: TLUiActionsContextType,',
    '  actionId: string,',
    '): void {',
    '  const action = actions[actionId]',
    '',
    '  if (!action) {',
    "    throw new Error('TLDRAW_ACTION_NOT_REGISTERED:' + actionId)",
    '  }',
    '',
    "  void action.onSelect('toolbar')",
    '}',
    '',
    "export { useEditor } from './editor-context'",
    '',
  ].join('\n')

  writeFileSync(editorCanvasPath, next, 'utf8')
}

function rewriteCanvasToolbar() {
  let source = readFileSync(toolbarPath, 'utf8')

  assertContains(
    source,
    'editor?.setCurrentTool(toolId)',
    'CanvasToolbar.tsx 不是预期版本：缺少 setCurrentTool',
  )
  assertContains(
    source,
    'editor?.undo()',
    'CanvasToolbar.tsx 不是预期版本：缺少 undo',
  )
  assertContains(
    source,
    'editor?.redo()',
    'CanvasToolbar.tsx 不是预期版本：缺少 redo',
  )
  assertContains(
    source,
    'onSave',
    'CanvasToolbar.tsx 不是预期版本：缺少 onSave 结构',
  )

  source = replaceOneRegex(
    source,
    /import\s*\{\s*useValue\s*\}\s*from\s*['"]tldraw['"]\s*\n/,
    [
      'import {',
      '  type TLUiActionsContextType,',
      '  useActions,',
      '  useEditor,',
      '  useTools,',
      '  useValue,',
      "} from 'tldraw'",
      '',
    ].join('\n'),
    'tldraw import',
  )

  source = replaceOneRegex(
    source,
    /import\s*\{\s*useEditor\s*\}\s*from\s*['"]\.\/editor-context['"]\s*\n/,
    '',
    'legacy useEditor import',
  )

  source = replaceOneRegex(
    source,
    /export interface CanvasToolbarProps[\s\S]*?export function CanvasToolbar\(\s*\{\s*onSave\s*\}\s*:\s*CanvasToolbarProps\s*\)\s*\{\s*const editor = useEditor\(\)/,
    [
      'export function CanvasToolbar() {',
      '  const editor = useEditor()',
      '  const actions = useActions()',
      '  const tools = useTools()',
    ].join('\n'),
    'CanvasToolbar signature',
  )

  source = replaceOneRegex(
    source,
    /const selectedIds = selectedShapes\.map\(\(shape\) => shape\.id\)\s*[\r\n]+[\s\S]*?const execute = \(action: \(\) => void\) => \{\s*action\(\)\s*setMoreOpen\(false\)\s*\}/,
    [
      '  const activateTool = (',
      '    toolId: CanvasToolId,',
      '  ) => {',
      '    const tool = tools[toolId]',
      '',
      '    if (!tool) {',
      "      throw new Error('TLDRAW_TOOL_NOT_REGISTERED:' + toolId)",
      '    }',
      '',
      "    void tool.onSelect('toolbar')",
      '    setMoreOpen(false)',
      '  }',
      '',
      '  const execute = (',
      '    actionId: string,',
      '  ) => {',
      '    invokeAction(actions, actionId)',
      '    setMoreOpen(false)',
      '  }',
      '',
      '  const saveAction =',
      "    actions['hybrid-canvas.save']",
    ].join('\n'),
    'tool/action block',
  )

  source = replaceOneRegex(
    source,
    /onClick=\{\(\)\s*=>\s*editor\?\.undo\(\)\}/,
    "onClick={() => execute('undo')}",
    'undo handler',
  )

  source = replaceOneRegex(
    source,
    /onClick=\{\(\)\s*=>\s*editor\?\.redo\(\)\}/,
    "onClick={() => execute('redo')}",
    'redo handler',
  )

  source = replaceOneRegex(
    source,
    /onClick=\{\(\)\s*=>\s*execute\(\(\)\s*=>\s*editor\?\.selectAll\(\)\)\}/,
    "onClick={() => execute('select-all')}",
    'select-all handler',
  )

  source = replaceOneRegex(
    source,
    /onClick=\{\(\)\s*=>\s*execute\(\(\)\s*=>\s*editor\?\.groupShapes\(selectedIds\)\)\}/,
    "onClick={() => execute('group')}",
    'group handler',
  )

  source = replaceOneRegex(
    source,
    /onClick=\{\(\)\s*=>\s*execute\(\(\)\s*=>\s*editor\?\.ungroupShapes\(selectedIds\)\)\}/,
    "onClick={() => execute('ungroup')}",
    'ungroup handler',
  )

  source = replaceOneRegex(
    source,
    /onClick=\{toggleLock\}/,
    "onClick={() => execute('toggle-lock')}",
    'toggle-lock handler',
  )

  source = replaceOneRegex(
    source,
    /onClick=\{\(\)\s*=>\s*execute\(\(\)\s*=>\s*editor\?\.bringToFront\(selectedIds\)\)\}/,
    "onClick={() => execute('bring-to-front')}",
    'bring-to-front handler',
  )

  source = replaceOneRegex(
    source,
    /onClick=\{\(\)\s*=>\s*execute\(\(\)\s*=>\s*editor\?\.bringForward\(selectedIds\)\)\}/,
    "onClick={() => execute('bring-forward')}",
    'bring-forward handler',
  )

  source = replaceOneRegex(
    source,
    /onClick=\{\(\)\s*=>\s*execute\(\(\)\s*=>\s*editor\?\.sendBackward\(selectedIds\)\)\}/,
    "onClick={() => execute('send-backward')}",
    'send-backward handler',
  )

  source = replaceOneRegex(
    source,
    /onClick=\{\(\)\s*=>\s*execute\(\(\)\s*=>\s*editor\?\.sendToBack\(selectedIds\)\)\}/,
    "onClick={() => execute('send-to-back')}",
    'send-to-back handler',
  )

  source = replaceOneRegex(
    source,
    /onClick=\{\(\)\s*=>\s*execute\(\(\)\s*=>\s*editor\?\.flipShapes\(selectedIds,\s*'horizontal'\)\)\}/,
    "onClick={() => execute('flip-horizontal')}",
    'flip-horizontal handler',
  )

  source = replaceOneRegex(
    source,
    /onClick=\{\(\)\s*=>\s*execute\(\(\)\s*=>\s*editor\?\.flipShapes\(selectedIds,\s*'vertical'\)\)\}/,
    "onClick={() => execute('flip-vertical')}",
    'flip-vertical handler',
  )

  source = replaceOneRegex(
    source,
    /onClick=\{\(\)\s*=>\s*execute\(\(\)\s*=>\s*editor\?\.zoomToSelection\(\)\)\}/,
    "onClick={() => execute('zoom-to-selection')}",
    'zoom-to-selection handler',
  )

  source = replaceOneRegex(
    source,
    /onClick=\{\(\)\s*=>\s*execute\(\(\)\s*=>\s*editor\?\.zoomToFit\(\)\)\}/,
    "onClick={() => execute('zoom-to-fit')}",
    'zoom-to-fit handler',
  )

  source = replaceOneRegex(
    source,
    /onClick=\{\(\)\s*=>\s*execute\(\(\)\s*=>\s*editor\?\.resetZoom\(\)\)\}/,
    "onClick={() => execute('zoom-to-100')}",
    'zoom-to-100 handler',
  )

  source = replaceOneRegex(
    source,
    /\{onSave\s*\?\s*\([\s\S]*?<ToolbarButton\s+icon=\{Save\}\s+label="保存"\s+onClick=\{onSave\}\s+shortcut="Ctrl\+S"\s*\/>[\s\S]*?\)\s*:\s*null\s*\}/,
    [
      '{saveAction ? (',
      '  <>',
      '    <Separator',
      '      className="mx-1 h-5 shrink-0"',
      '      orientation="vertical"',
      '    />',
      '',
      '    <ToolbarButton',
      '      icon={Save}',
      '      label="保存"',
      '      onClick={() =>',
      "        void saveAction.onSelect('toolbar')",
      '      }',
      '      shortcut="Ctrl+S"',
      '    />',
      '  </>',
      ') : null}',
    ].join('\n'),
    'save button block',
  )

  if (!source.includes('function invokeAction(')) {
    source += [
      '',
      'function invokeAction(',
      '  actions: TLUiActionsContextType,',
      '  actionId: string,',
      '): void {',
      '  const action = actions[actionId]',
      '',
      '  if (!action) {',
      "    throw new Error('TLDRAW_ACTION_NOT_REGISTERED:' + actionId)",
      '  }',
      '',
      "  void action.onSelect('toolbar')",
      '}',
      '',
    ].join('\n')
  }

  writeFileSync(toolbarPath, source, 'utf8')
}

function replaceOneRegex(
  input,
  pattern,
  replacement,
  label,
) {
  const matches = [...input.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'))]

  if (matches.length === 0) {
    throw new Error('找不到预期源码：' + label)
  }

  if (matches.length > 1) {
    throw new Error('预期源码不唯一：' + label)
  }

  return input.replace(pattern, replacement)
}

function assertContains(
  input,
  text,
  message,
) {
  if (!input.includes(text)) {
    throw new Error(message)
  }
}

function assertFile(path) {
  if (!existsSync(path)) {
    throw new Error('缺少文件：' + path)
  }
}