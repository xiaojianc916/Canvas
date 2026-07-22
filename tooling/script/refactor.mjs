#!/usr/bin/env node

/**
 * 将硬编码的 tldraw License Key 移出 editor/core。
 *
 * 使用：
 *   node tooling/script/refactor.mjs
 *   node tooling/script/refactor.mjs --write
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const SCRIPT_NAME =
  '004-externalize-tldraw-license'

const PATHS = {
  editorCanvas:
    'editor/core/src/react/EditorCanvas.tsx',
  editorContext:
    'editor/core/src/react/editor-context.tsx',
  reactPublicApi:
    'editor/core/src/react/public-api.ts',
  appShell:
    'apps/desktop/src/presentation/AppShell.tsx',
  application:
    'apps/desktop/src/bootstrap/application.ts',
  reactRoot:
    'apps/desktop/src/bootstrap/react-root.tsx',
  viteEnv:
    'apps/desktop/src/vite-env.d.ts',
  envExample:
    'apps/desktop/.env.example',
  envLocal:
    'apps/desktop/.env.local',
  gitignore:
    '.gitignore',
}

const argv = process.argv.slice(2)
const writeMode = argv.includes('--write')

main()

function main() {
  validateArguments()

  const root = findRepositoryRoot()

  validateRepository(root)

  const editorCanvasPath = join(
    root,
    PATHS.editorCanvas,
  )

  const originalEditorCanvas =
    readRequiredText(editorCanvasPath)

  if (isAlreadyComplete(root, originalEditorCanvas)) {
    console.log(
      '无需修改：tldraw License Key 已完成外部配置化。',
    )
    return
  }

  const licenseKey =
    extractLicenseKey(originalEditorCanvas)

  const changes = buildChanges(
    root,
    licenseKey,
  )

  const effectiveChanges = changes.filter(
    (change) =>
      change.original !== change.modified,
  )

  console.log(
    `\n模式：${writeMode ? 'WRITE' : 'DRY-RUN'}`,
  )
  console.log(`仓库：${root}`)

  console.log('\n计划修改：')

  for (const change of effectiveChanges) {
    console.log(`- ${change.relativePath}`)
  }

  console.log('\n变更摘要：')
  console.log(
    '- 删除 editor/core 中硬编码的许可证',
  )
  console.log(
    '- ApplicationRuntime 显式拥有许可证配置',
  )
  console.log(
    '- EditorProvider 负责向画布提供许可证',
  )
  console.log(
    '- 许可证迁移到被忽略的 .env.local',
  )
  console.log(
    '- 提交无敏感信息的 .env.example',
  )

  if (!writeMode) {
    console.log('\n当前为 dry-run，没有写入文件。')
    console.log(
      '执行：node tooling/script/refactor.mjs --write',
    )
    return
  }

  ensureTrackedTargetsAreClean(
    root,
    effectiveChanges,
  )

  const backupRoot = createBackup(
    root,
    effectiveChanges,
  )

  console.log(
    `\n备份目录：${relative(root, backupRoot)}`,
  )

  try {
    for (const change of effectiveChanges) {
      mkdirSync(
        dirname(change.absolutePath),
        {
          recursive: true,
        },
      )

      writeFileSync(
        change.absolutePath,
        change.modified,
        'utf8',
      )
    }

    ensureLocalEnvIsIgnored(root)

    const sourceFiles = effectiveChanges
      .map((change) => change.relativePath)
      .filter((path) =>
        /\.(?:ts|tsx)$/u.test(path),
      )

    if (sourceFiles.length > 0) {
      run(
        'pnpm',
        [
          'exec',
          'biome',
          'format',
          '--write',
          ...sourceFiles,
        ],
        {
          cwd: root,
          label: '格式化修改文件',
        },
      )
    }

    assertPostconditions(root)

    if (sourceFiles.length > 0) {
      run(
        'pnpm',
        [
          'exec',
          'biome',
          'check',
          ...sourceFiles,
        ],
        {
          cwd: root,
          label: 'Biome 检查',
        },
      )
    }

    run(
      'pnpm',
      ['test:architecture'],
      {
        cwd: root,
        label: '架构测试',
      },
    )

    run(
      'pnpm',
      [
        '--filter',
        '@hybrid-canvas/canvas',
        'typecheck',
      ],
      {
        cwd: root,
        label: 'Canvas 类型检查',
      },
    )

    run(
      'pnpm',
      [
        '--filter',
        '@hybrid-canvas/desktop',
        'typecheck',
      ],
      {
        cwd: root,
        label: 'Desktop 类型检查',
      },
    )

    run(
      'git',
      [
        'diff',
        '--check',
        '--',
        ...effectiveChanges
          .filter(
            (change) =>
              change.relativePath !==
              PATHS.envLocal,
          )
          .map(
            (change) =>
              change.relativePath,
          ),
      ],
      {
        cwd: root,
        label: 'Git diff 检查',
      },
    )

    console.log('\n修改完成。')
    console.log(
      'tldraw License Key 已从源码迁移到 apps/desktop/.env.local。',
    )
    console.log(
      '该本地配置文件已验证为 Git ignored。',
    )
    console.log(
      '由于许可证曾经进入 Git 历史，仍应在 tldraw 后台轮换旧许可证。',
    )
  } catch (error) {
    console.error(
      '\n修改或验证失败，正在恢复原文件……',
    )

    restoreBackup(
      root,
      backupRoot,
      effectiveChanges,
    )

    console.error(
      '已恢复到脚本执行前状态。',
    )

    throw error
  }
}

function validateArguments() {
  for (const argument of argv) {
    if (argument !== '--write') {
      throw new Error(`未知参数：${argument}`)
    }
  }
}

function findRepositoryRoot() {
  const result = spawnSync(
    'git',
    ['rev-parse', '--show-toplevel'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      windowsHide: true,
    },
  )

  if (result.error || result.status !== 0) {
    throw new Error(
      [
        '当前目录不在 Git 仓库中。',
        result.error?.message,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }

  return resolve(result.stdout.trim())
}

function validateRepository(root) {
  const packageJsonPath =
    join(root, 'package.json')

  const packageJson = JSON.parse(
    readRequiredText(packageJsonPath),
  )

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error(
      `仓库识别失败：${String(packageJson.name)}`,
    )
  }

  const requiredFiles = [
    PATHS.editorCanvas,
    PATHS.editorContext,
    PATHS.reactPublicApi,
    PATHS.appShell,
    PATHS.application,
    PATHS.reactRoot,
    PATHS.gitignore,
  ]

  for (const relativePath of requiredFiles) {
    if (
      !existsSync(join(root, relativePath))
    ) {
      throw new Error(
        `必要文件不存在：${relativePath}`,
      )
    }
  }
}

function extractLicenseKey(source) {
  const match = source.match(
    /const TLDRAW_LICENSE_KEY\s*=\s*\n\s*'([^']+)'/u,
  )

  if (!match?.[1]) {
    throw new Error(
      [
        '无法从 EditorCanvas.tsx 提取现有许可证。',
        '文件可能处于部分修改状态，脚本已停止。',
      ].join('\n'),
    )
  }

  return match[1]
}

function isAlreadyComplete(
  root,
  editorCanvas,
) {
  return (
    !editorCanvas.includes(
      'const TLDRAW_LICENSE_KEY',
    ) &&
    editorCanvas.includes(
      'useTldrawLicenseKey',
    ) &&
    existsSync(
      join(root, PATHS.viteEnv),
    ) &&
    existsSync(
      join(root, PATHS.envExample),
    )
  )
}

function buildChanges(root, licenseKey) {
  const changes = []

  addTransformedFile(
    changes,
    root,
    PATHS.editorCanvas,
    transformEditorCanvas,
  )

  addTransformedFile(
    changes,
    root,
    PATHS.editorContext,
    transformEditorContext,
  )

  addTransformedFile(
    changes,
    root,
    PATHS.reactPublicApi,
    transformReactPublicApi,
  )

  addTransformedFile(
    changes,
    root,
    PATHS.appShell,
    transformAppShell,
  )

  addTransformedFile(
    changes,
    root,
    PATHS.application,
    transformApplication,
  )

  addTransformedFile(
    changes,
    root,
    PATHS.reactRoot,
    transformReactRoot,
  )

  addGeneratedFile(
    changes,
    root,
    PATHS.viteEnv,
    createViteEnvDeclaration(),
  )

  addGeneratedFile(
    changes,
    root,
    PATHS.envExample,
    createEnvExample(
      readOptionalText(
        join(root, PATHS.envExample),
      ),
    ),
  )

  addGeneratedFile(
    changes,
    root,
    PATHS.envLocal,
    createLocalEnv(
      readOptionalText(
        join(root, PATHS.envLocal),
      ),
      licenseKey,
    ),
  )

  const gitignorePath = join(
    root,
    PATHS.gitignore,
  )

  addGeneratedFile(
    changes,
    root,
    PATHS.gitignore,
    ensureGitignoreRule(
      readRequiredText(gitignorePath),
    ),
  )

  return changes
}

function addTransformedFile(
  changes,
  root,
  relativePath,
  transform,
) {
  const absolutePath =
    join(root, relativePath)

  const original =
    readRequiredText(absolutePath)

  changes.push({
    relativePath,
    absolutePath,
    original,
    modified: transform(original),
    existedBefore: true,
  })
}

function addGeneratedFile(
  changes,
  root,
  relativePath,
  modified,
) {
  const absolutePath =
    join(root, relativePath)

  const existedBefore =
    existsSync(absolutePath)

  const original = existedBefore
    ? readRequiredText(absolutePath)
    : ''

  changes.push({
    relativePath,
    absolutePath,
    original,
    modified,
    existedBefore,
  })
}

function transformEditorCanvas(source) {
  const licenseBlockPattern =
    /const TLDRAW_LICENSE_KEY\s*=\s*\n\s*'[^']+'\n\n/u

  if (!licenseBlockPattern.test(source)) {
    throw new Error(
      `${PATHS.editorCanvas} 中找不到许可证常量`,
    )
  }

  let next = source.replace(
    licenseBlockPattern,
    '',
  )

  next = replaceExactlyOnce(
    next,
    "import { useBindEditorSession, useEditor } from './editor-context'",
    "import { useBindEditorSession, useEditor, useTldrawLicenseKey } from './editor-context'",
    'EditorCanvas context import',
  )

  next = replaceExactlyOnce(
    next,
    `export function EditorCanvas({ session, isActive = true, onSave }: EditorCanvasProps) {
  const [editor, setEditor] = useState<Editor | null>(null)`,
    `export function EditorCanvas({ session, isActive = true, onSave }: EditorCanvasProps) {
  const licenseKey = useTldrawLicenseKey()
  const [editor, setEditor] = useState<Editor | null>(null)`,
    'EditorCanvas license hook',
  )

  next = replaceExactlyOnce(
    next,
    '      licenseKey: TLDRAW_LICENSE_KEY,',
    '      licenseKey,',
    'Tldraw license prop',
  )

  next = replaceExactlyOnce(
    next,
    '  }, [store, registration, hasTools])',
    '  }, [store, registration, hasTools, licenseKey])',
    'EditorCanvas memo dependencies',
  )

  return next
}

function transformEditorContext(source) {
  let next = replaceExactlyOnce(
    source,
    `interface EditorContextValue {
  readonly editor: Editor | null
  readonly registration: ExtensionRegistration | null
}`,
    `interface EditorContextValue {
  readonly editor: Editor | null
  readonly registration: ExtensionRegistration | null
  readonly licenseKey: string
}`,
    'EditorContextValue',
  )

  next = replaceExactlyOnce(
    next,
    `const EditorCtx = createContext<EditorBindingContextValue | null>(null)

export function EditorProvider({ children }: { readonly children: ReactNode }) {`,
    `const EditorCtx = createContext<EditorBindingContextValue | null>(null)

export interface EditorProviderProps {
  readonly children: ReactNode
  readonly licenseKey: string
}

export function EditorProvider({ children, licenseKey }: EditorProviderProps) {`,
    'EditorProvider props',
  )

  next = replaceExactlyOnce(
    next,
    `    () => ({
      ...session,
      bindSession,
      unbindSession,
    }),
    [session, bindSession, unbindSession],`,
    `    () => ({
      ...session,
      licenseKey,
      bindSession,
      unbindSession,
    }),
    [session, licenseKey, bindSession, unbindSession],`,
    'EditorProvider context value',
  )

  next = replaceExactlyOnce(
    next,
    `export function useEditor(): Editor | null {
  return useContext(EditorCtx)?.editor ?? null
}

export function useExtensionRegistration()`,
    `export function useEditor(): Editor | null {
  return useContext(EditorCtx)?.editor ?? null
}

export function useTldrawLicenseKey(): string {
  const licenseKey = useContext(EditorCtx)?.licenseKey

  if (!licenseKey) {
    throw new Error('TLDRAW_LICENSE_KEY_NOT_CONFIGURED')
  }

  return licenseKey
}

export function useExtensionRegistration()`,
    'license hook',
  )

  return next
}

function transformReactPublicApi(source) {
  return replaceExactlyOnce(
    source,
    'export { EditorProvider, useEditor } from \'./editor-context\'',
    `export {
  EditorProvider,
  type EditorProviderProps,
  useEditor,
  useTldrawLicenseKey,
} from './editor-context'`,
    'react public API',
  )
}

function transformAppShell(source) {
  let next = replaceExactlyOnce(
    source,
    `  readonly settings: SettingsStore
}`,
    `  readonly settings: SettingsStore
  readonly tldrawLicenseKey: string
}`,
    'AppShellRuntime license',
  )

  next = replaceExactlyOnce(
    next,
    '    <EditorProvider>',
    '    <EditorProvider licenseKey={runtime.tldrawLicenseKey}>',
    'EditorProvider license prop',
  )

  return next
}

function transformApplication(source) {
  let next = replaceExactlyOnce(
    source,
    `export interface ApplicationRuntime {
  readonly workspace: WorkbenchSessionStore`,
    `export interface CreateApplicationRuntimeOptions {
  readonly tldrawLicenseKey: string
}

export interface ApplicationRuntime {
  readonly workspace: WorkbenchSessionStore`,
    'ApplicationRuntime options',
  )

  next = replaceExactlyOnce(
    next,
    `  readonly settings: SettingsStore
  readonly dispose: () => void`,
    `  readonly settings: SettingsStore
  readonly tldrawLicenseKey: string
  readonly dispose: () => void`,
    'ApplicationRuntime license field',
  )

  next = replaceExactlyOnce(
    next,
    `export function createApplicationRuntime(): ApplicationRuntime {`,
    `export function createApplicationRuntime({
  tldrawLicenseKey,
}: CreateApplicationRuntimeOptions): ApplicationRuntime {`,
    'createApplicationRuntime signature',
  )

  next = replaceExactlyOnce(
    next,
    `    mainWindow,
    settings,

    dispose()`,
    `    mainWindow,
    settings,
    tldrawLicenseKey,

    dispose()`,
    'ApplicationRuntime return value',
  )

  return next
}

function transformReactRoot(source) {
  let next = replaceExactlyOnce(
    source,
    '  const runtime = createApplicationRuntime()',
    `  const runtime = createApplicationRuntime({
    tldrawLicenseKey: readTldrawLicenseKey(),
  })`,
    'runtime configuration',
  )

  next += `

function readTldrawLicenseKey(): string {
  const licenseKey = import.meta.env.VITE_TLDRAW_LICENSE_KEY?.trim()

  if (!licenseKey) {
    throw new Error('VITE_TLDRAW_LICENSE_KEY_MISSING')
  }

  return licenseKey
}
`

  return next
}

function createViteEnvDeclaration() {
  return `interface ImportMetaEnv {
  readonly VITE_TLDRAW_LICENSE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
`
}

function createEnvExample(existing) {
  if (
    existing.includes(
      'VITE_TLDRAW_LICENSE_KEY=',
    )
  ) {
    return existing
  }

  return appendSection(
    existing,
    'VITE_TLDRAW_LICENSE_KEY=replace-with-your-tldraw-license-key',
  )
}

function createLocalEnv(
  existing,
  licenseKey,
) {
  if (
    existing.includes(
      'VITE_TLDRAW_LICENSE_KEY=',
    )
  ) {
    return existing
  }

  return appendSection(
    existing,
    `VITE_TLDRAW_LICENSE_KEY=${licenseKey}`,
  )
}

function ensureGitignoreRule(existing) {
  const ignoredPatterns = [
    '.env.local',
    '*.local',
    '.env.*',
  ]

  if (
    ignoredPatterns.some((pattern) =>
      existing
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .includes(pattern),
    )
  ) {
    return existing
  }

  return appendSection(
    existing,
    '/apps/desktop/.env.local',
  )
}

function appendSection(existing, line) {
  const normalized =
    existing.replace(/\s*$/u, '')

  return normalized
    ? `${normalized}\n\n${line}\n`
    : `${line}\n`
}

function ensureTrackedTargetsAreClean(
  root,
  changes,
) {
  const trackedPaths = changes
    .filter(
      (change) =>
        change.relativePath !==
        PATHS.envLocal,
    )
    .map(
      (change) =>
        change.relativePath,
    )

  const result = spawnSync(
    'git',
    [
      'status',
      '--porcelain',
      '--',
      ...trackedPaths,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    },
  )

  if (result.error || result.status !== 0) {
    throw new Error(
      '无法检查目标文件状态',
    )
  }

  if (result.stdout.trim()) {
    throw new Error(
      [
        '目标文件存在未提交修改，脚本拒绝覆盖：',
        result.stdout.trim(),
      ].join('\n'),
    )
  }
}

function createBackup(
  root,
  changes,
) {
  const timestamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')

  const backupRoot = join(
    root,
    '.refactor-backup',
    SCRIPT_NAME,
    timestamp,
  )

  const manifest = []

  for (const change of changes) {
    manifest.push({
      relativePath:
        change.relativePath,
      existedBefore:
        change.existedBefore,
    })

    if (!change.existedBefore) {
      continue
    }

    const destination = join(
      backupRoot,
      change.relativePath,
    )

    mkdirSync(
      dirname(destination),
      {
        recursive: true,
      },
    )

    copyFileSync(
      change.absolutePath,
      destination,
    )
  }

  mkdirSync(backupRoot, {
    recursive: true,
  })

  writeFileSync(
    join(backupRoot, 'manifest.json'),
    `${JSON.stringify(
      manifest,
      null,
      2,
    )}\n`,
    'utf8',
  )

  return backupRoot
}

function restoreBackup(
  root,
  backupRoot,
  changes,
) {
  for (const change of changes) {
    const backupPath = join(
      backupRoot,
      change.relativePath,
    )

    if (change.existedBefore) {
      copyFileSync(
        backupPath,
        change.absolutePath,
      )
    } else {
      rmSync(change.absolutePath, {
        force: true,
      })
    }
  }
}

function ensureLocalEnvIsIgnored(root) {
  const result = spawnSync(
    'git',
    [
      'check-ignore',
      '--quiet',
      '--',
      PATHS.envLocal,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    },
  )

  if (result.status !== 0) {
    throw new Error(
      `${PATHS.envLocal} 没有被 Git 忽略，拒绝继续`,
    )
  }

  const tracked = spawnSync(
    'git',
    [
      'ls-files',
      '--error-unmatch',
      PATHS.envLocal,
    ],
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    },
  )

  if (tracked.status === 0) {
    throw new Error(
      `${PATHS.envLocal} 已被 Git 跟踪，拒绝保存许可证`,
    )
  }
}

function assertPostconditions(root) {
  const editorCanvas = readRequiredText(
    join(root, PATHS.editorCanvas),
  )

  const editorContext = readRequiredText(
    join(root, PATHS.editorContext),
  )

  const application = readRequiredText(
    join(root, PATHS.application),
  )

  const appShell = readRequiredText(
    join(root, PATHS.appShell),
  )

  const reactRoot = readRequiredText(
    join(root, PATHS.reactRoot),
  )

  if (
    editorCanvas.includes(
      'const TLDRAW_LICENSE_KEY',
    )
  ) {
    throw new Error(
      'EditorCanvas 仍然包含硬编码许可证',
    )
  }

  const requiredFragments = [
    [
      editorCanvas,
      'useTldrawLicenseKey',
    ],
    [
      editorContext,
      'readonly licenseKey: string',
    ],
    [
      application,
      'readonly tldrawLicenseKey: string',
    ],
    [
      appShell,
      '<EditorProvider licenseKey={runtime.tldrawLicenseKey}>',
    ],
    [
      reactRoot,
      'import.meta.env.VITE_TLDRAW_LICENSE_KEY',
    ],
  ]

  for (const [source, fragment] of requiredFragments) {
    if (!source.includes(fragment)) {
      throw new Error(
        `修改后缺少预期代码：${fragment}`,
      )
    }
  }

  const envLocal = readRequiredText(
    join(root, PATHS.envLocal),
  )

  if (
    !envLocal.includes(
      'VITE_TLDRAW_LICENSE_KEY=',
    )
  ) {
    throw new Error(
      '.env.local 中缺少许可证配置',
    )
  }

  const envExample = readRequiredText(
    join(root, PATHS.envExample),
  )

  if (
    /tldraw-\d{4}-/u.test(envExample)
  ) {
    throw new Error(
      '.env.example 不得包含真实许可证',
    )
  }
}

function replaceExactlyOnce(
  source,
  oldText,
  newText,
  description,
) {
  const first = source.indexOf(oldText)
  const last = source.lastIndexOf(oldText)

  if (first < 0) {
    throw new Error(
      `找不到预期代码：${description}`,
    )
  }

  if (first !== last) {
    throw new Error(
      `预期代码出现多次：${description}`,
    )
  }

  return source.replace(
    oldText,
    newText,
  )
}

function readRequiredText(path) {
  if (!existsSync(path)) {
    throw new Error(
      `文件不存在：${path}`,
    )
  }

  return readFileSync(path, 'utf8')
}

function readOptionalText(path) {
  return existsSync(path)
    ? readFileSync(path, 'utf8')
    : ''
}

function run(
  command,
  commandArgs,
  {
    cwd,
    label,
  },
) {
  const invocation =
    createCommandInvocation(
      command,
      commandArgs,
    )

  console.log(`\n[${label}]`)
  console.log(
    `$ ${command} ${commandArgs.join(' ')}`,
  )

  const result = spawnSync(
    invocation.command,
    invocation.args,
    {
      cwd,
      encoding: 'utf8',
      stdio: 'inherit',
      shell: false,
      windowsHide: true,
    },
  )

  if (result.error) {
    throw new Error(
      `${label} 无法启动：${result.error.message}`,
    )
  }

  if (result.status !== 0) {
    throw new Error(
      `${label} 失败，退出码 ${String(result.status)}`,
    )
  }
}

function createCommandInvocation(
  command,
  commandArgs,
) {
  if (process.platform !== 'win32') {
    return {
      command,
      args: commandArgs,
    }
  }

  const commandsRequiringCmd =
    new Set([
      'corepack',
      'npm',
      'npx',
      'pnpm',
      'yarn',
    ])

  if (
    !commandsRequiringCmd.has(command)
  ) {
    return {
      command,
      args: commandArgs,
    }
  }

  const comspec =
    process.env.ComSpec ||
    process.env.COMSPEC ||
    'C:\\Windows\\System32\\cmd.exe'

  const commandLine = [
    quoteWindowsCommandArgument(command),
    ...commandArgs.map(
      quoteWindowsCommandArgument,
    ),
  ].join(' ')

  return {
    command: comspec,
    args: [
      '/d',
      '/s',
      '/c',
      commandLine,
    ],
  }
}

function quoteWindowsCommandArgument(
  value,
) {
  const text = String(value)

  if (/[\r\n&|<>^%!]/u.test(text)) {
    throw new Error(
      `命令参数包含不允许的字符：${text}`,
    )
  }

  if (text.length === 0) {
    return '""'
  }

  if (!/[\s"]/u.test(text)) {
    return text
  }

  return `"${text.replaceAll('"', '""')}"`
}