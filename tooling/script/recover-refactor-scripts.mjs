#!/usr/bin/env node

import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const shouldWrite = process.argv.includes('--write')
const changes = new Map()

function replaceOnce(content, oldText, newText, description) {
  const firstIndex = content.indexOf(oldText)

  if (firstIndex < 0) {
    throw new Error(`找不到待修改内容：${description}`)
  }

  const secondIndex = content.indexOf(oldText, firstIndex + oldText.length)

  if (secondIndex >= 0) {
    throw new Error(`待修改内容不唯一：${description}`)
  }

  return (
    content.slice(0, firstIndex) +
    newText +
    content.slice(firstIndex + oldText.length)
  )
}

async function edit(relativePath, transform) {
  const absolutePath = resolve(root, relativePath)
  const original = await readFile(absolutePath, 'utf8')
  const updated = transform(original)

  if (updated === original) {
    throw new Error(`文件没有产生修改：${relativePath}`)
  }

  changes.set(relativePath, {
    absolutePath,
    original,
    updated,
  })
}

async function editAppShell() {
  await edit(
    'apps/desktop/src/presentation/AppShell.tsx',
    (original) => {
      let content = original

      // app.css 已经导入 tldraw 样式，这里不再重复导入。
      content = replaceOnce(
        content,
        `import 'tldraw/tldraw.css'\n\n`,
        '',
        '删除 AppShell 中重复的 tldraw CSS 导入',
      )

      content = replaceOnce(
        content,
        `export interface AppShellProps {
  readonly runtime: AppShellRuntime
}

export function AppShell({ runtime }: AppShellProps) {`,
        `export interface AppShellProps {
  readonly runtime: AppShellRuntime
}

const GLOBAL_COMMAND_SHORTCUTS = [
  {
    key: 'k',
    commandId: 'application.toggle-command-palette',
    ctrlOrMeta: true,
  },
  {
    key: 'n',
    commandId: 'workspace.create-canvas',
    ctrlOrMeta: true,
  },
  {
    key: 'o',
    commandId: 'workspace.open-canvas',
    ctrlOrMeta: true,
  },
] as const

export function AppShell({ runtime }: AppShellProps) {`,
        '添加稳定的全局快捷键配置',
      )

      content = replaceOnce(
        content,
        `  useApplicationCommands(runtime, () => setCommandPaletteOpen((open) => !open))
  useGlobalCommandShortcuts(runtime.commands, [
    { key: 'k', commandId: 'application.toggle-command-palette', ctrlOrMeta: true },
    { key: 'n', commandId: 'workspace.create-canvas', ctrlOrMeta: true },
    { key: 'o', commandId: 'workspace.open-canvas', ctrlOrMeta: true },
  ])

  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), [])`,
        `  const toggleCommandPalette = useCallback(() => {
    setCommandPaletteOpen((open) => !open)
  }, [])

  useApplicationCommands(runtime, toggleCommandPalette)
  useGlobalCommandShortcuts(runtime.commands, GLOBAL_COMMAND_SHORTCUTS)

  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), [])`,
        '稳定命令注册和快捷键 Hook 的依赖',
      )

      content = replaceOnce(
        content,
        `  useEffect(() => {
    let unlisten: (() => void) | undefined
    void runtime.mainWindow.onCloseRequested(requestApplicationClose).then((dispose) => {
      unlisten = dispose
    })
    return () => unlisten?.()
  }, [requestApplicationClose, runtime.mainWindow])`,
        `  useMainWindowCloseRequest(runtime.mainWindow, requestApplicationClose)`,
        '替换存在异步清理竞态的窗口关闭监听',
      )

      content = replaceOnce(
        content,
        `function useApplicationCommands(runtime: AppShellRuntime, toggleCommandPalette: () => void): void {`,
        `function useMainWindowCloseRequest(
  mainWindow: MainWindowController,
  onCloseRequested: () => void,
): void {
  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined

    void mainWindow.onCloseRequested(onCloseRequested).then(
      (nextUnsubscribe) => {
        if (disposed) {
          nextUnsubscribe()
          return
        }

        unsubscribe = nextUnsubscribe
      },
      (error: unknown) => {
        if (!disposed) {
          console.error('Failed to register the main-window close listener.', error)
        }
      },
    )

    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [mainWindow, onCloseRequested])
}

function useApplicationCommands(runtime: AppShellRuntime, toggleCommandPalette: () => void): void {`,
        '添加可安全清理的窗口关闭监听 Hook',
      )

      return content
    },
  )
}

async function editCanvasDocumentService() {
  await edit(
    'editor/document/src/application/canvas-document-service.ts',
    (original) => {
      let content = original

      content = replaceOnce(
        content,
        `  readonly subscribe: (listener: () => void) => () => void
  readonly dispose: () => void`,
        `  /**
   * Monotonically increasing external-store snapshot.
   *
   * React consumers subscribe through subscribe() and read this value through
   * useSyncExternalStore(). The value changes whenever a public session
   * snapshot may have changed.
   */
  readonly getVersion: () => number
  readonly subscribe: (listener: () => void) => () => void
  readonly dispose: () => void`,
        '为 CanvasDocumentService 添加稳定版本快照',
      )

      content = replaceOnce(
        content,
        `  const sessions = new Map<CanvasSessionId, OwnedCanvasSession>()
  const listeners = new Set<() => void>()

  function emit(): void {
    for (const listener of listeners) {`,
        `  const sessions = new Map<CanvasSessionId, OwnedCanvasSession>()
  const listeners = new Set<() => void>()
  let version = 0

  function emit(): void {
    version += 1

    for (const listener of listeners) {`,
        '在文档状态变化时递增版本',
      )

      content = replaceOnce(
        content,
        `    getSessionSnapshot(sessionId) {
      const session = sessions.get(sessionId)

      if (!session) {
        return null
      }

      return {
        sessionId,
        persistence: toPersistenceState(session.state),
      }
    },

    subscribe(listener) {`,
        `    getSessionSnapshot(sessionId) {
      const session = sessions.get(sessionId)

      if (!session) {
        return null
      }

      return {
        sessionId,
        persistence: toPersistenceState(session.state),
      }
    },

    getVersion: () => version,

    subscribe(listener) {`,
        '暴露文档服务版本快照',
      )

      return content
    },
  )
}

async function editCanvasWorkflow() {
  await edit(
    'apps/desktop/src/application/canvas/canvas-workflow.ts',
    (original) => {
      let content = original

      content = replaceOnce(
        content,
        `  readonly getSessionSnapshot: (sessionId: CanvasSessionId) => CanvasSessionSnapshot | null
  readonly subscribe: (listener: () => void) => () => void`,
        `  readonly getSessionSnapshot: (sessionId: CanvasSessionId) => CanvasSessionSnapshot | null
  readonly getVersion: () => number
  readonly subscribe: (listener: () => void) => () => void`,
        '在 CanvasWorkflow 接口中暴露版本快照',
      )

      content = replaceOnce(
        content,
        `    getEditorSession: documents.getEditorSession,
    getSessionSnapshot: documents.getSessionSnapshot,
    subscribe: documents.subscribe,`,
        `    getEditorSession: documents.getEditorSession,
    getSessionSnapshot: documents.getSessionSnapshot,
    getVersion: documents.getVersion,
    subscribe: documents.subscribe,`,
        '从 CanvasWorkflow 转发文档服务版本',
      )

      return content
    },
  )
}

async function editWorkspaceContainer() {
  await edit(
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
    (original) => {
      let content = original

      content = replaceOnce(
        content,
        `  readonly getSessionSnapshot: (
    sessionId: CanvasSessionId,
  ) => import('@hybrid-canvas/document').CanvasSessionSnapshot | null
  readonly subscribe: (listener: () => void) => () => void`,
        `  readonly getSessionSnapshot: (
    sessionId: CanvasSessionId,
  ) => import('@hybrid-canvas/document').CanvasSessionSnapshot | null
  readonly getVersion: () => number
  readonly subscribe: (listener: () => void) => () => void`,
        '在 Workspace canvas UI port 中声明版本快照',
      )

      content = replaceOnce(
        content,
        `  useSyncExternalStore(
    port.canvases.subscribe,
    port.workspace.getSnapshot,
    port.workspace.getSnapshot,
  )`,
        `  useSyncExternalStore(
    port.canvases.subscribe,
    port.canvases.getVersion,
    port.canvases.getVersion,
  )`,
        '修复 Canvas store 使用错误 Workspace snapshot 的问题',
      )

      content = replaceOnce(
        content,
        `        if (decision.kind === 'wait-for-save') {
          void decision.operation.then(() => {
            const nextDecision = port.canvases.requestClose(sessionId)
            if (nextDecision.kind === 'confirm-discard') setPendingCloseSessionId(sessionId)
          })
        }`,
        `        if (decision.kind === 'wait-for-save') {
          const continueClose = () => {
            const nextDecision = port.canvases.requestClose(sessionId)

            if (nextDecision.kind === 'confirm-discard') {
              setPendingCloseSessionId(sessionId)
            }
          }

          // 保存成功和保存失败后都必须重新计算关闭决策。
          // 保存失败时文档状态会变为 failed，随后进入放弃更改确认流程。
          void decision.operation.then(continueClose, continueClose)
        }`,
        '处理保存失败时的关闭流程和 Promise rejection',
      )

      return content
    },
  )
}

async function editViteConfig() {
  await edit(
    'apps/desktop/vite.config.ts',
    (original) =>
      replaceOnce(
        original,
        `  envPrefix: ['VITE_', 'TAURI_'],`,
        `  // Do not expose the complete TAURI_* environment namespace to WebView code.
  // Build-time Tauri variables remain available here through process.env.
  envPrefix: ['VITE_'],`,
        '收窄 Vite 环境变量暴露范围',
      ),
  )
}

async function editWorkspaceShellCleanup() {
  await edit(
    'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
    (original) =>
      replaceOnce(
        original,
        `    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isResizingSidebar])`,
        `    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      document.body.style.removeProperty('cursor')
      document.body.style.removeProperty('user-select')
    }
  }, [isResizingSidebar])`,
        '在侧栏拖动 effect 卸载时恢复 body 样式',
      ),
  )
}

async function createBackup() {
  const stamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')

  const backupRoot = resolve(root, '.refactor-backup', stamp)

  for (const [relativePath, change] of changes) {
    const backupPath = resolve(backupRoot, relativePath)
    await mkdir(dirname(backupPath), { recursive: true })
    await cp(change.absolutePath, backupPath)
  }

  return backupRoot
}

async function applyChanges() {
  for (const change of changes.values()) {
    await writeFile(change.absolutePath, change.updated, 'utf8')
  }
}

function printPlan() {
  console.log('')
  console.log(
    shouldWrite
      ? 'Phase 1 重构修改：'
      : 'Phase 1 重构预览（尚未写入）：',
  )

  for (const relativePath of changes.keys()) {
    console.log(`  - ${relativePath}`)
  }

  console.log('')
}

async function main() {
  await editAppShell()
  await editCanvasDocumentService()
  await editCanvasWorkflow()
  await editWorkspaceContainer()
  await editViteConfig()
  await editWorkspaceShellCleanup()

  printPlan()

  if (!shouldWrite) {
    console.log('所有目标代码片段均已匹配。')
    console.log('执行以下命令实际写入：')
    console.log('')
    console.log('  node scripts/refactor-phase1.mjs --write')
    console.log('')
    return
  }

  const backupRoot = await createBackup()
  await applyChanges()

  console.log(`已写入 ${changes.size} 个文件。`)
  console.log(`备份目录：${relative(root, backupRoot)}`)
  console.log('')
  console.log('请继续执行：')
  console.log('')
  console.log('  pnpm format')
  console.log('  pnpm lint')
  console.log('  pnpm typecheck')
  console.log('  pnpm test:architecture')
  console.log('  pnpm test')
  console.log('')
}

main().catch((error) => {
  console.error('')
  console.error('重构脚本执行失败。没有执行后续写入步骤。')
  console.error(error)
  process.exitCode = 1
})