#!/usr/bin/env node

import {
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()

const oldFileDialogPath =
  'platforms/desktop-runtime/src/adapters/dialog/file-dialog.ts'

const oldFileDialogDirectory =
  'platforms/desktop-runtime/src/adapters/dialog'

const runtimePublicApiPath =
  'platforms/desktop-runtime/src/public-api.ts'

const ipcContractsDirectory =
  'apps/desktop/src-tauri/src/ipc/contracts'

const ipcModulePath =
  'apps/desktop/src-tauri/src/ipc/mod.rs'

const workflowPath =
  'apps/desktop/src/application/canvas/canvas-workflow.ts'

const workspaceContainerPath =
  'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx'

const appShellPath =
  'apps/desktop/src/presentation/AppShell.tsx'

const architectureCheckPath =
  'tests/architecture/check-canvas-lifecycle.mjs'

const forbiddenRuntimeTokens = [
  'createDrawFileCommands',
  'DrawFileCommands',
  'createFileDialog',
  'FileDialog',
  'file_open',
  'file_save',
  'requestClose',
  'discardAndClose',
  'discardAllAndClose',
  'CanvasCloseDecision',
  'CanvasCloseRequestResult',
  'pendingCloseSessionId',
]

const sourceRoots = [
  'apps/desktop/src',
  'apps/desktop/src-tauri/src',
  'editor',
  'features',
  'foundations',
  'platforms/desktop-runtime/src',
  'platforms/desktop-ipc/src',
]

const sourceExtensions = new Set([
  '.ts',
  '.tsx',
  '.rs',
])

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function write(path, content) {
  await writeFile(resolve(root, path), content, 'utf8')
}

async function read(path) {
  return readFile(resolve(root, path), 'utf8')
}

async function update(path, transform) {
  await write(path, transform(await read(path)))
}

async function removeIfPresent(path) {
  const absolute = resolve(root, path)

  if (await exists(absolute)) {
    await rm(absolute, {
      recursive: true,
      force: true,
    })
  }
}

async function collectSourceFiles(directory) {
  const absoluteDirectory = resolve(root, directory)

  if (!(await exists(absoluteDirectory))) {
    return []
  }

  const files = []
  const entries = await readdir(absoluteDirectory, {
    withFileTypes: true,
  })

  for (const entry of entries) {
    if (
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name === 'target' ||
      entry.name === '.turbo'
    ) {
      continue
    }

    const absolutePath = join(absoluteDirectory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(relative(root, absolutePath))))
      continue
    }

    if (entry.isFile() && sourceExtensions.has(extname(entry.name))) {
      files.push(absolutePath)
    }
  }

  return files
}

function pruneLegacyPermissions(value) {
  if (Array.isArray(value)) {
    return value
      .filter(
        (item) =>
          item !== 'file_open' &&
          item !== 'file_save' &&
          item !== 'allow-file-open' &&
          item !== 'allow-file-save',
      )
      .map(pruneLegacyPermissions)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        pruneLegacyPermissions(nestedValue),
      ]),
    )
  }

  return value
}

async function pruneCapabilityPermissions(directory) {
  const absoluteDirectory = resolve(root, directory)

  if (!(await exists(absoluteDirectory))) {
    return
  }

  const entries = await readdir(absoluteDirectory, {
    withFileTypes: true,
  })

  for (const entry of entries) {
    const absolutePath = join(absoluteDirectory, entry.name)

    if (entry.isDirectory()) {
      await pruneCapabilityPermissions(relative(root, absolutePath))
      continue
    }

    if (!entry.isFile() || extname(entry.name) !== '.json') {
      continue
    }

    const source = await readFile(absolutePath, 'utf8')
    const json = JSON.parse(source)

    await writeFile(
      absolutePath,
      `${JSON.stringify(pruneLegacyPermissions(json), null, 2)}\n`,
      'utf8',
    )
  }
}

await removeIfPresent(oldFileDialogPath)
await removeIfPresent(oldFileDialogDirectory)
await removeIfPresent(ipcContractsDirectory)

await update(runtimePublicApiPath, (source) =>
  source
    .replace(
      `export type { FileDialog } from './adapters/dialog/file-dialog'
export { createFileDialog } from './adapters/dialog/file-dialog'

`,
      '',
    )
    .replace(/\n{3,}/g, '\n\n'),
)

await update(ipcModulePath, (source) =>
  source
    .replace('pub mod contracts;\n', '')
    .replace(/\n{3,}/g, '\n\n'),
)

await update(workflowPath, (source) => {
  let next = source

  next = next.replace(
    `  readonly create: (title: string) => void`,
    `  readonly create: (title: string) => Promise<void>`,
  )

  next = next.replace(
    `  function create(title: string): void {
    const opened = documents.create(title)

    try {
      workspace.createCanvas(opened)
    } catch (error) {
      void documents.releaseCanvas(opened.sessionId, 'discard')
      throw error
    }
  }`,
    `  async function create(title: string): Promise<void> {
    const opened = documents.create(title)

    try {
      workspace.createCanvas(opened)
    } catch (workspaceError) {
      const release = await documents.releaseCanvas(
        opened.sessionId,
        'discard',
      )

      if (
        release.kind !== 'released' &&
        release.kind !== 'not-found'
      ) {
        throw new Error('CANVAS_CREATION_ROLLBACK_FAILED')
      }

      throw workspaceError
    }
  }`,
  )

  next = next.replace(
    `    } catch (error) {
      await documents.releaseCanvas(opened.sessionId, 'discard')
      throw error
    }
  }`,
    `    } catch (workspaceError) {
      const release = await documents.releaseCanvas(
        opened.sessionId,
        'discard',
      )

      if (
        release.kind !== 'released' &&
        release.kind !== 'not-found'
      ) {
        throw new Error('CANVAS_OPEN_ROLLBACK_FAILED')
      }

      throw workspaceError
    }
  }`,
  )

  return next
})

await update(workspaceContainerPath, (source) => {
  let next = source

  next = next.replace(
    `  readonly create: (title: string) => void`,
    `  readonly create: (title: string) => Promise<void>`,
  )

  next = next.replace(
    `        port.canvases.create(createUntitledCanvasTitle(existingTitles))`,
    `        void port.canvases
          .create(createUntitledCanvasTitle(existingTitles))
          .catch((cause: unknown) => {
            reportError('canvas create failed', {
              scope: 'workspace',
              operation: 'create-canvas',
              cause,
            })
          })`,
  )

  return next
})

await update(appShellPath, (source) => {
  let next = source

  next = next.replace(
    `  const createCanvasWithFeedback = useCallback(
    (title: string) => {
      try {
        runtime.canvases.create(title)
        setFailedCanvasTitle(null)
      } catch (cause) {
        reportDiagnosticError('canvas create failed', {
          scope: 'app-shell',
          operation: 'create-canvas',
          cause,
        })

        setFailedCanvasTitle(title)
      }
    },
    [runtime.canvases],
  )`,
    `  const createCanvasWithFeedback = useCallback(
    async (title: string): Promise<void> => {
      try {
        await runtime.canvases.create(title)
        setFailedCanvasTitle(null)
      } catch (cause) {
        reportDiagnosticError('canvas create failed', {
          scope: 'app-shell',
          operation: 'create-canvas',
          cause,
        })

        setFailedCanvasTitle(title)
      }
    },
    [runtime.canvases],
  )`,
  )

  next = next.replace(
    `  createCanvas: (title: string) => void,`,
    `  createCanvas: (title: string) => Promise<void>,`,
  )

  next = next.replace(
    `          createCanvas('未命名画布')`,
    `          void createCanvas('未命名画布')`,
  )

  return next
})

await pruneCapabilityPermissions('apps/desktop/src-tauri/capabilities')

const sourceFiles = (
  await Promise.all(sourceRoots.map(collectSourceFiles))
).flat()

const violations = []

for (const absolutePath of sourceFiles) {
  const repositoryPath = relative(root, absolutePath).replaceAll('\\', '/')
  const source = await readFile(absolutePath, 'utf8')

  for (const token of forbiddenRuntimeTokens) {
    if (source.includes(token)) {
      violations.push(`${repositoryPath}: legacy token remains: ${token}`)
    }
  }
}

const lifecycleArchitectureCheck = `#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import process from 'node:process'

const files = [
  'platforms/desktop-runtime/src/public-api.ts',
  'platforms/desktop-runtime/src/adapters/file/file-system.ts',
  'apps/desktop/src/application/canvas/canvas-workflow.ts',
  'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  'editor/document/src/application/canvas-document-service.ts',
  'apps/desktop/src-tauri/src/ipc/mod.rs',
]

const forbidden = [
  'createDrawFileCommands',
  'DrawFileCommands',
  'createFileDialog',
  'FileDialog',
  'file_open',
  'file_save',
  'requestClose',
  'discardAndClose',
  'discardAllAndClose',
  'CanvasCloseDecision',
  'CanvasCloseRequestResult',
  'pendingCloseSessionId',
  'void documents.releaseCanvas',
]

const sources = await Promise.all(
  files.map(async (path) => ({
    path,
    source: await readFile(path, 'utf8'),
  })),
)

const violations = []

for (const { path, source } of sources) {
  for (const token of forbidden) {
    if (source.includes(token)) {
      violations.push(path + ': forbidden legacy token ' + token)
    }
  }
}

const workflow = sources.find(
  ({ path }) =>
    path === 'apps/desktop/src/application/canvas/canvas-workflow.ts',
)?.source

if (!workflow?.includes('CanvasCloseSnapshot')) {
  violations.push('Canvas lifecycle coordinator snapshot is missing')
}

if (!workflow?.includes('closeCanvas')) {
  violations.push('Canvas lifecycle coordinator entry point is missing')
}

if (!workflow?.includes('await documents.releaseCanvas')) {
  violations.push('Canvas lifecycle rollback must await native release')
}

if (violations.length > 0) {
  console.error(
    'Canvas legacy protocol removal check failed:\\n' +
      violations.map((item) => '- ' + item).join('\\n'),
  )

  process.exitCode = 1
} else {
  console.log('Canvas legacy protocol removal check passed.')
}
`

await writeFile(
  resolve(root, architectureCheckPath),
  lifecycleArchitectureCheck,
  'utf8',
)

if (violations.length > 0) {
  console.error(
    'Legacy source remains after deletion:\\n' +
      violations.map((item) => '- ' + item).join('\\n'),
  )

  process.exitCode = 1
} else {
  console.log('Legacy path-based file protocol removed.')
}