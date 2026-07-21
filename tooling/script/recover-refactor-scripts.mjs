#!/usr/bin/env node

import {
  cp,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import {
  dirname,
  relative,
  resolve,
} from 'node:path'
import process from 'node:process'

const root = process.cwd()
const writes = new Map()

function absolute(path) {
  return resolve(root, path)
}

async function read(path) {
  return readFile(
    absolute(path),
    'utf8',
  )
}

function write(path, content) {
  writes.set(path, content)
}

async function edit(path, transform) {
  const content = await read(path)
  const updated = transform(content)

  if (updated === content) {
    throw new Error(
      `文件未产生修改：${path}`,
    )
  }

  write(path, updated)
}

function replaceOnce(
  content,
  oldText,
  newText,
  description,
) {
  const index = content.indexOf(oldText)

  if (index < 0) {
    throw new Error(
      `找不到待修改内容：${description}`,
    )
  }

  if (
    content.indexOf(
      oldText,
      index + oldText.length,
    ) >= 0
  ) {
    throw new Error(
      `待修改内容不唯一：${description}`,
    )
  }

  return (
    content.slice(0, index) +
    newText +
    content.slice(
      index + oldText.length,
    )
  )
}

async function updateNativeWindowController() {
  await edit(
    'platforms/desktop-runtime/src/adapters/native-window.ts',
    (content) => {
      let updated = replaceOnce(
        content,
        `  forceClose(): Promise<void>`,
        `  forceClose(): void`,
        '将 forceClose 改成单向命令',
      )

      updated = replaceOnce(
        updated,
        `    async forceClose() {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().destroy()
    },`,
        `    forceClose() {
      // Application termination is intentionally fire-and-forget.
      // The renderer may be destroyed before an IPC response can return.
      void invoke<void>('window_destroy', {
        label: MAIN_WINDOW_LABEL,
      })
        .catch(async () => {
          // Native command dispatch failed before the window was destroyed.
          // Fall back to Tauri's direct window API.
          const { getCurrentWindow } =
            await import('@tauri-apps/api/window')

          await getCurrentWindow().destroy()
        })
        .catch(() => {
          // There is no useful renderer recovery UI for a failed process
          // termination. Do not surface an internal retry dialog.
        })
    },`,
        '改用 native destroy 和直接 API fallback',
      )

      return updated
    },
  )
}

async function addNativeDestroyCommand() {
  await edit(
    'apps/desktop/src-tauri/src/commands/window.rs',
    (content) =>
      replaceOnce(
        content,
        `#[command]
pub async fn window_minimize(app: AppHandle, label: String) -> Result<()> {`,
        `#[command]
pub async fn window_destroy(app: AppHandle, label: String) -> Result<()> {
    if let Some(window) = app.get_webview_window(&label) {
        // destroy bypasses CloseRequested. The application layer has already
        // completed dirty-document confirmation before invoking this command.
        window.destroy()?;
    }

    Ok(())
}

#[command]
pub async fn window_minimize(app: AppHandle, label: String) -> Result<()> {`,
        '新增 window_destroy command',
      ),
  )

  await edit(
    'apps/desktop/src-tauri/src/bootstrap/app.rs',
    (content) =>
      replaceOnce(
        content,
        `            commands::window::window_close,
            commands::window::window_minimize,`,
        `            commands::window::window_close,
            commands::window::window_destroy,
            commands::window::window_minimize,`,
        '注册 window_destroy command',
      ),
  )
}

async function addDestroyPermission() {
  const path =
    'apps/desktop/src-tauri/capabilities/main-window.json'

  const capability =
    JSON.parse(await read(path))

  if (
    !capability.permissions.includes(
      'core:window:allow-destroy',
    )
  ) {
    const closeIndex =
      capability.permissions.indexOf(
        'core:window:allow-close',
      )

    capability.permissions.splice(
      closeIndex >= 0
        ? closeIndex + 1
        : capability.permissions.length,
      0,
      'core:window:allow-destroy',
    )
  }

  write(
    path,
    `${JSON.stringify(
      capability,
      null,
      2,
    )}\n`,
  )
}

function replaceTerminationCoordinator() {
  write(
    'apps/desktop/src/application/termination/application-termination-coordinator.ts',
    `import type {
  ApplicationClosePlan,
  CanvasSessionId,
} from '@hybrid-canvas/document'

export type ApplicationTerminationIntent =
  | 'window-close'
  | 'update-restart'
  | 'application-exit'

export type ApplicationTerminationSnapshot =
  | {
      readonly state: 'idle'
    }
  | {
      readonly state:
        'confirmation-required'
      readonly intent:
        ApplicationTerminationIntent
      readonly sessionIds:
        readonly CanvasSessionId[]
    }
  | {
      readonly state:
        'waiting-for-saves'
      readonly intent:
        ApplicationTerminationIntent
    }
  | {
      readonly state: 'terminating'
      readonly intent:
        ApplicationTerminationIntent
    }

export interface ApplicationTerminator {
  /**
   * Dispatches a one-way native termination command.
   *
   * The renderer cannot reliably await an acknowledgement because the
   * renderer itself is destroyed by a successful termination.
   */
  readonly terminate: (
    intent: ApplicationTerminationIntent,
  ) => void
}

export interface ApplicationClosePort {
  readonly planApplicationClose:
    () => ApplicationClosePlan

  readonly discardAllAndClose: (
    sessionIds:
      readonly CanvasSessionId[],
  ) => void
}

export interface ApplicationTerminationCoordinator {
  readonly request: (
    intent: ApplicationTerminationIntent,
  ) => void

  readonly cancel: () => void
  readonly confirmDiscard: () => void

  readonly getSnapshot:
    () => ApplicationTerminationSnapshot

  readonly subscribe: (
    listener: () => void,
  ) => () => void

  readonly dispose: () => void
}

export function createApplicationTerminationCoordinator(
  canvases: ApplicationClosePort,
  terminator: ApplicationTerminator,
): ApplicationTerminationCoordinator {
  let snapshot:
    ApplicationTerminationSnapshot = {
      state: 'idle',
    }

  let generation = 0
  let disposed = false

  const listeners =
    new Set<() => void>()

  function emit(
    next:
      ApplicationTerminationSnapshot,
  ): void {
    snapshot = next

    for (const listener of listeners) {
      listener()
    }
  }

  function request(
    intent:
      ApplicationTerminationIntent,
  ): void {
    if (
      disposed ||
      snapshot.state === 'terminating'
    ) {
      return
    }

    evaluate(
      intent,
      canvases.planApplicationClose(),
    )
  }

  function beginTermination(
    intent:
      ApplicationTerminationIntent,
  ): void {
    generation += 1

    emit({
      state: 'terminating',
      intent,
    })

    // A successful native termination destroys this JavaScript context.
    // Therefore this operation must not be modeled as a Promise whose
    // rejection controls user-facing state.
    terminator.terminate(intent)
  }

  function evaluate(
    intent:
      ApplicationTerminationIntent,
    plan: ApplicationClosePlan,
  ): void {
    if (plan.kind === 'close-now') {
      beginTermination(intent)
      return
    }

    if (
      plan.kind ===
      'confirm-discard'
    ) {
      emit({
        state:
          'confirmation-required',
        intent,
        sessionIds:
          plan.sessionIds,
      })

      return
    }

    const currentGeneration =
      ++generation

    emit({
      state: 'waiting-for-saves',
      intent,
    })

    void Promise.allSettled(
      plan.operations,
    ).then(() => {
      if (
        !disposed &&
        currentGeneration ===
          generation
      ) {
        request(intent)
      }
    })
  }

  return {
    request,

    cancel() {
      if (
        snapshot.state ===
        'terminating'
      ) {
        return
      }

      generation += 1
      emit({ state: 'idle' })
    },

    confirmDiscard() {
      if (
        snapshot.state !==
        'confirmation-required'
      ) {
        return
      }

      const {
        intent,
        sessionIds,
      } = snapshot

      canvases.discardAllAndClose(
        sessionIds,
      )

      beginTermination(intent)
    },

    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },

    dispose() {
      disposed = true
      generation += 1
      listeners.clear()
    },
  }
}
`,
  )
}

async function removeFailureDialog() {
  await edit(
    'apps/desktop/src/presentation/AppShell.tsx',
    (content) =>
      replaceOnce(
        content,
        `
      <ConfirmationDialog
        cancelLabel="返回应用"
        confirmLabel="重试退出"
        description={
          termination.state ===
          'termination-failed'
            ? \`原生窗口未能完成退出：\${termination.message}\`
            : ''
        }
        onCancel={
          runtime.termination.cancel
        }
        onConfirm={
          runtime.termination.retry
        }
        open={
          termination.state ===
          'termination-failed'
        }
        title="应用退出失败"
      />
`,
        '',
        '删除退出失败重试弹窗',
      ),
  )
}

async function addRegressionGuard() {
  write(
    'tests/architecture/check-termination-ux.mjs',
    `#!/usr/bin/env node

import {
  readFileSync,
} from 'node:fs'
import {
  resolve,
} from 'node:path'

const root = resolve(
  import.meta.dirname,
  '../..',
)

const files = [
  'apps/desktop/src/presentation/AppShell.tsx',
  'apps/desktop/src/application/termination/application-termination-coordinator.ts',
]

const forbidden = [
  'termination-failed',
  'UNKNOWN_TERMINATION_ERROR',
  '重试退出',
  '应用退出失败',
]

const failures = []

for (const file of files) {
  const content = readFileSync(
    resolve(root, file),
    'utf8',
  )

  for (const term of forbidden) {
    if (content.includes(term)) {
      failures.push(
        \`\${file}: forbidden termination UX "\${term}"\`,
      )
    }
  }
}

if (failures.length > 0) {
  console.error(
    failures.join('\\n'),
  )
  process.exit(1)
}

console.log(
  'Termination UX architecture check passed.',
)
`,
  )

  await edit(
    'package.json',
    (content) => {
      const packageJson =
        JSON.parse(content)

      const current =
        packageJson.scripts[
          'test:architecture'
        ]

      if (
        !current.includes(
          'check-termination-ux.mjs',
        )
      ) {
        packageJson.scripts[
          'test:architecture'
        ] =
          `${current} && node tests/architecture/check-termination-ux.mjs`
      }

      return `${JSON.stringify(
        packageJson,
        null,
        2,
      )}\n`
    },
  )
}

async function backupFiles() {
  const stamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')

  const backupRoot = absolute(
    `.refactor-backup/${stamp}`,
  )

  for (const path of writes.keys()) {
    try {
      await read(path)
    } catch {
      continue
    }

    const target = resolve(
      backupRoot,
      path,
    )

    await mkdir(
      dirname(target),
      {
        recursive: true,
      },
    )

    await cp(
      absolute(path),
      target,
    )
  }

  return backupRoot
}

async function applyWrites() {
  for (
    const [path, content]
    of writes
  ) {
    await mkdir(
      dirname(absolute(path)),
      {
        recursive: true,
      },
    )

    await writeFile(
      absolute(path),
      content,
      'utf8',
    )
  }
}

async function main() {
  await updateNativeWindowController()
  await addNativeDestroyCommand()
  await addDestroyPermission()
  replaceTerminationCoordinator()
  await removeFailureDialog()
  await addRegressionGuard()

  const backupRoot =
    await backupFiles()

  await applyWrites()

  console.log('')
  console.log('已修复应用退出流程：')
  console.log(
    '- 使用 native window.destroy',
  )
  console.log(
    '- 增加 allow-destroy capability',
  )
  console.log(
    '- 删除 termination-failed 状态',
  )
  console.log(
    '- 删除 retry API',
  )
  console.log(
    '- 删除“应用退出失败/重试退出”弹窗',
  )
  console.log(
    '- 增加架构回归检查',
  )
  console.log('')
  console.log(
    `备份：${relative(root, backupRoot)}`,
  )
  console.log('')
}

main().catch((error) => {
  console.error('')
  console.error(
    '退出流程修复失败：',
  )
  console.error(error)
  process.exitCode = 1
})