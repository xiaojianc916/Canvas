#!/usr/bin/env node

import {
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

const files = {
  editorCanvas: path.join(
    root,
    'editor/core/src/react/EditorCanvas.tsx',
  ),

  officialUi: path.join(
    root,
    'editor/core/src/react/TldrawOfficialUi.tsx',
  ),

  reactPublicApi: path.join(
    root,
    'editor/core/src/react/public-api.ts',
  ),

  appCss: path.join(
    root,
    'apps/desktop/src/app.css',
  ),
}

await writeFile(
  files.editorCanvas,
  createEditorCanvasSource(),
  'utf8',
)

await removeObsoleteOfficialUi()
await removeCustomToolbarCss()
await enableDefaultNavigationUi()

console.log('')
console.log('已恢复 tldraw 默认 UI 布局：')
console.log('  - 官方默认底部工具栏')
console.log('  - 官方 Quick Actions')
console.log('  - 官方 overflow 工具菜单')
console.log('  - 官方 NavigationPanel')
console.log('  - 隐藏 PageMenu')
console.log('  - 隐藏官方 StylePanel')
console.log('  - 保留 Canvas 原来的右侧 Inspector')
console.log('')
console.log('请执行：')
console.log('  pnpm typecheck')
console.log('  pnpm build:desktop')
console.log('')

async function removeObsoleteOfficialUi() {
  let publicApi = await readFile(
    files.reactPublicApi,
    'utf8',
  )

  publicApi = publicApi.replace(
    "export { TldrawOfficialUi } from './TldrawOfficialUi'\n",
    '',
  )

  publicApi = publicApi.replace(
    "export type { TldrawOfficialUiProps } from './TldrawOfficialUi'\n",
    '',
  )

  await writeFile(
    files.reactPublicApi,
    publicApi,
    'utf8',
  )

  await rm(files.officialUi, {
    force: true,
  })
}

async function removeCustomToolbarCss() {
  let css = await readFile(
    files.appCss,
    'utf8',
  )

  /*
   * 前面的脚本把所有 toolbar/sidebar CSS 都追加在文件末尾。
   * 从最早的标记开始删除，恢复 tldraw/tldraw.css 的默认布局。
   */
  const markers = [
    '/* hybrid-canvas:tldraw-official-ui */',
    '/* hybrid-canvas:toolbar-visible-items */',
  ]

  const indexes = markers
    .map((marker) => css.indexOf(marker))
    .filter((index) => index >= 0)

  if (indexes.length > 0) {
    css = css
      .slice(0, Math.min(...indexes))
      .trimEnd()
  }

  await writeFile(
    files.appCss,
    css + '\n',
    'utf8',
  )
}

async function enableDefaultNavigationUi() {
  let css = await readFile(
    files.appCss,
    'utf8',
  )

  /*
   * 原 CSS 把整个 navigation zone 隐藏了。
   * 删除这一项后，tldraw 默认缩放和 minimap 可以正常显示。
   */
  css = css.replace(
    `.tlui-help-menu,
.tlui-menu-zone,
.tlui-navigation-zone,
.tlui-debug-panel {
  display: none;
}`,
    `.tlui-help-menu,
.tlui-menu-zone,
.tlui-debug-panel {
  display: none;
}`,
  )

  await writeFile(
    files.appCss,
    css,
    'utf8',
  )
}

function createEditorCanvasSource() {
  return `import { useEffect, useMemo, useState } from 'react'
import {
  type Editor,
  type TLComponents,
  type TLUiActionsContextType,
  type TLUiOverrides,
  Tldraw,
  type TldrawProps,
} from 'tldraw'

import type { EditorSession } from '../runtime/editor-session'
import {
  useBindEditorSession,
  useTldrawLicenseKey,
} from './editor-context'

export const HYBRID_CANVAS_SAVE_ACTION_ID =
  'hybrid-canvas.save'

/**
 * 使用 tldraw 默认 UI，只替换产品已经有自己实现的区域。
 *
 * Toolbar 不覆盖，因此由 tldraw 自动渲染默认 Toolbar。
 * NavigationPanel、QuickActions、ActionsMenu 同样使用官方默认实现。
 *
 * PageMenu：
 * Canvas 已经有自己的页面与工作区管理，所以禁用。
 *
 * StylePanel：
 * Canvas 使用原来的 Workspace CanvasInspectorContent，
 * 避免同时出现两套右侧属性面板。
 */
const CANVAS_COMPONENTS: TLComponents = {
  PageMenu: null,
  StylePanel: null,
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

  const overrides = useMemo<TLUiOverrides>(
    () => createCanvasUiOverrides(onSave),
    [onSave],
  )

  const tldrawProps = useMemo((): TldrawProps => {
    const base: TldrawProps = {
      /*
       * 关键点：
       *
       * 不再 hideUi。
       * 让 tldraw 渲染完整的默认 UI 与默认布局。
       */
      hideUi: false,
      licenseKey,
      store,
      onMount: setEditor,
      overrides,
      components: CANVAS_COMPONENTS,
      options: {
        maxPages: 100,
      },
      shapeUtils: registration.shapeUtils,
      bindingUtils: registration.bindingUtils,
    }

    if (hasTools) {
      base.tools = registration.tools
    }

    return base
  }, [
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

export {
  useEditor,
} from './editor-context'
`
}