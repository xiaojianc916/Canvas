import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const root = resolve(process.cwd())
const apply = process.argv.includes('--apply')
const skipChecks = process.argv.includes('--skip-checks')

const paths = {
  editorContext:
    'editor/core/src/react/editor-context.tsx',
  appShell:
    'apps/desktop/src/presentation/AppShell.tsx',
}

assertRepository()

if (!apply) {
  console.log('将执行以下修改：')
  console.log(`PATCH  ${paths.editorContext}`)
  console.log(`PATCH  ${paths.appShell}`)
  console.log('')
  console.log('- 修复编辑器 Context 循环更新')
  console.log('- 修复新建画布后界面崩溃')
  console.log('- 新建失败时显示确认弹窗')
  console.log('- 弹窗提供“重试”和“取消”操作')
  console.log('')
  console.log(
    '使用 --apply 执行修改。',
  )
  process.exit(0)
}

patchEditorContext()
patchAppShell()

if (!skipChecks) {
  runChecks()
}

console.log('')
console.log('修改完成。')

function patchEditorContext() {
  const path = paths.editorContext
  const source = read(path)

  if (
    source.includes(
      'const bindSession = ctx?.bindSession',
    )
  ) {
    console.log(
      `SKIP   ${path}（已经修复）`,
    )
    return
  }

  const oldSource = `  const ctx = useContext(EditorCtx)
  const owner = useRef(Symbol('editor-session-owner'))

  useEffect(() => {
    if (!ctx) {
      return
    }
    const currentOwner = owner.current
    ctx.bindSession(currentOwner, editor, registration)
    return () => ctx.unbindSession(currentOwner)
  }, [editor, registration, ctx])`

  const newSource = `  const ctx = useContext(EditorCtx)
  const bindSession = ctx?.bindSession
  const unbindSession = ctx?.unbindSession
  const owner = useRef(Symbol('editor-session-owner'))

  useEffect(() => {
    if (!bindSession || !unbindSession || !editor || !registration) {
      return
    }

    const currentOwner = owner.current
    bindSession(
      currentOwner,
      editor,
      registration,
    )

    return () => {
      unbindSession(currentOwner)
    }
  }, [
    editor,
    registration,
    bindSession,
    unbindSession,
  ])`

  write(
    path,
    replaceExactOnce(
      source,
      oldSource,
      newSource,
      path,
      '编辑器 Session 绑定逻辑',
    ),
  )

  console.log(`PATCH  ${path}`)
}

function patchAppShell() {
  const path = paths.appShell
  let source = read(path)

  source = addDiagnosticImport(
    source,
    path,
  )

  source = addFailureState(
    source,
    path,
  )

  source = addCreateCanvasCallback(
    source,
    path,
  )

  source = updateApplicationCommandCall(
    source,
    path,
  )

  source = updateWorkspacePort(
    source,
    path,
  )

  source = addFailureDialog(
    source,
    path,
  )

  source = updateCommandHookSignature(
    source,
    path,
  )

  source = updateCreateCanvasCommand(
    source,
    path,
  )

  source = updateCommandHookDependencies(
    source,
    path,
  )

  validateAppShell(source, path)
  write(path, source)

  console.log(`PATCH  ${path}`)
}

function addDiagnosticImport(
  source,
  path,
) {
  const target =
    "import { error as reportDiagnosticError } from '@hybrid-canvas/foundations-observability'"

  if (source.includes(target)) {
    return source
  }

  const anchor =
    "import { applyThemePreference, ConfirmationDialog } from '@hybrid-canvas/design-system'"

  return replaceExactOnce(
    source,
    anchor,
    `${anchor}
${target}`,
    path,
    '诊断日志 import',
  )
}

function addFailureState(
  source,
  path,
) {
  if (
    source.includes(
      'const [failedCanvasTitle, setFailedCanvasTitle]',
    )
  ) {
    return source
  }

  const pattern =
    /  const \[isSettingsOpen,\s*setSettingsOpen\]\s*=\s*useState\(false\)/

  return replaceRegexOnce(
    source,
    pattern,
    (match) => `${match}

  const [
    failedCanvasTitle,
    setFailedCanvasTitle,
  ] = useState<string | null>(null)`,
    path,
    '新建画布失败状态',
  )
}

function addCreateCanvasCallback(
  source,
  path,
) {
  if (
    source.includes(
      'const createCanvasWithFeedback = useCallback(',
    )
  ) {
    return source
  }

  const anchor =
    '  const requestApplicationClose = useCallback('

  const callback = `  const createCanvasWithFeedback = useCallback(
    (title: string) => {
      try {
        runtime.canvases.create(title)
        setFailedCanvasTitle(null)
      } catch (cause) {
        reportDiagnosticError(
          'canvas create failed',
          {
            scope: 'app-shell',
            operation: 'create-canvas',
            cause,
          },
        )

        setFailedCanvasTitle(title)
      }
    },
    [runtime.canvases],
  )

`

  return insertBeforeOnce(
    source,
    anchor,
    callback,
    path,
    '新建画布错误处理函数',
  )
}

function updateApplicationCommandCall(
  source,
  path,
) {
  const pattern =
    /  useApplicationCommands\(\s*runtime,\s*toggleCommandPalette(?:,\s*createCanvasWithFeedback)?\s*\)/

  return replaceRegexOnce(
    source,
    pattern,
    () => `  useApplicationCommands(
    runtime,
    toggleCommandPalette,
    createCanvasWithFeedback,
  )`,
    path,
    '应用命令注册调用',
  )
}

function updateWorkspacePort(
  source,
  path,
) {
  if (
    !source.includes(
      'create: createCanvasWithFeedback',
    )
  ) {
    source = replaceExactOnce(
      source,
      '      canvases: runtime.canvases,',
      `      canvases: {
        ...runtime.canvases,
        create: createCanvasWithFeedback,
      },`,
      path,
      '工作区画布创建端口',
    )
  }

  const oldDependencies =
    '[runtime.canvases, runtime.workspace]'

  if (
    source.includes(oldDependencies)
  ) {
    source = replaceExactOnce(
      source,
      oldDependencies,
      `[
      createCanvasWithFeedback,
      runtime.canvases,
      runtime.workspace,
    ]`,
      path,
      '工作区端口依赖',
    )
  }

  return source
}

function addFailureDialog(
  source,
  path,
) {
  if (
    source.includes(
      'title="新建画布失败"',
    )
  ) {
    return source
  }

  const anchor =
    '      <UiFeedbackRegion />'

  const dialog = `${anchor}

      <ConfirmationDialog
        cancelLabel="取消"
        confirmLabel="重试"
        description="无法新建画布，请重试。"
        onCancel={() => {
          setFailedCanvasTitle(null)
        }}
        onConfirm={() => {
          if (!failedCanvasTitle) {
            return
          }

          createCanvasWithFeedback(
            failedCanvasTitle,
          )
        }}
        open={failedCanvasTitle !== null}
        title="新建画布失败"
      />`

  return replaceExactOnce(
    source,
    anchor,
    dialog,
    path,
    '新建画布失败确认弹窗',
  )
}

function updateCommandHookSignature(
  source,
  path,
) {
  if (
    source.includes(
      'createCanvas: (title: string) => void,',
    )
  ) {
    return source
  }

  const pattern =
    /function useApplicationCommands\(\s*runtime:\s*AppShellRuntime,\s*toggleCommandPalette:\s*\(\)\s*=>\s*void\s*\):\s*void\s*\{/

  return replaceRegexOnce(
    source,
    pattern,
    () => `function useApplicationCommands(
  runtime: AppShellRuntime,
  toggleCommandPalette: () => void,
  createCanvas: (title: string) => void,
): void {`,
    path,
    '应用命令 Hook 参数',
  )
}

function updateCreateCanvasCommand(
  source,
  path,
) {
  const commandId =
    "id: 'workspace.create-canvas'"

  const nextCommandId =
    "id: 'workspace.open-canvas'"

  const commandStart =
    source.indexOf(commandId)

  if (commandStart < 0) {
    throw new Error(
      `${path}: 找不到 ${commandId}`,
    )
  }

  const commandEnd =
    source.indexOf(
      nextCommandId,
      commandStart +
        commandId.length,
    )

  if (commandEnd < 0) {
    throw new Error(
      `${path}: 找不到 ${nextCommandId}`,
    )
  }

  const commandBlock =
    source.slice(
      commandStart,
      commandEnd,
    )

  if (
    commandBlock.includes(
      "createCanvas('未命名画布')",
    ) ||
    commandBlock.includes(
      'createCanvas("未命名画布")',
    )
  ) {
    return source
  }

  const executeIndex =
    commandBlock.indexOf('execute()')

  if (executeIndex < 0) {
    throw new Error(
      `${path}: 新建画布命令中找不到 execute()`,
    )
  }

  const bodyStart =
    commandBlock.indexOf(
      '{',
      executeIndex,
    )

  if (bodyStart < 0) {
    throw new Error(
      `${path}: 新建画布命令缺少函数体`,
    )
  }

  const bodyEnd =
    findMatchingBrace(
      commandBlock,
      bodyStart,
    )

  const runtimeCreateMatch =
    commandBlock
      .slice(bodyStart, bodyEnd + 1)
      .match(
        /runtime\.canvases\.create\(\s*(['"`])([^'"`]*)\1\s*\)/,
      )

  const title =
    runtimeCreateMatch?.[2] ??
    '未命名画布'

  const replacement = `execute() {
          createCanvas(${JSON.stringify(title)})
        }`

  const updatedBlock =
    commandBlock.slice(
      0,
      executeIndex,
    ) +
    replacement +
    commandBlock.slice(
      bodyEnd + 1,
    )

  return (
    source.slice(0, commandStart) +
    updatedBlock +
    source.slice(commandEnd)
  )
}

function updateCommandHookDependencies(
  source,
  path,
) {
  const functionStart =
    source.indexOf(
      'function useApplicationCommands(',
    )

  if (functionStart < 0) {
    throw new Error(
      `${path}: 找不到 useApplicationCommands`,
    )
  }

  const before =
    source.slice(0, functionStart)

  let functionSource =
    source.slice(functionStart)

  const pattern =
    /\},\s*\[\s*(?:createCanvas,\s*)?runtime,\s*toggleCommandPalette\s*\]\)/

  functionSource =
    replaceRegexOnce(
      functionSource,
      pattern,
      () => `}, [
    createCanvas,
    runtime,
    toggleCommandPalette,
  ])`,
      path,
      '应用命令 Hook 依赖',
    )

  return before + functionSource
}

function validateAppShell(
  source,
  path,
) {
  const required = [
    'reportDiagnosticError',
    'failedCanvasTitle',
    'createCanvasWithFeedback',
    'create: createCanvasWithFeedback',
    'title="新建画布失败"',
    'description="无法新建画布，请重试。"',
    'confirmLabel="重试"',
    'cancelLabel="取消"',
    "createCanvas('未命名画布')",
  ]

  for (const token of required) {
    if (!source.includes(token)) {
      throw new Error(
        `${path}: 修改结果缺少 ${token}`,
      )
    }
  }
}

function findMatchingBrace(
  source,
  start,
) {
  let depth = 0
  let quote = null
  let escaped = false

  for (
    let index = start;
    index < source.length;
    index += 1
  ) {
    const character =
      source[index]

    if (quote) {
      if (escaped) {
        escaped = false
      } else if (
        character === '\\'
      ) {
        escaped = true
      } else if (
        character === quote
      ) {
        quote = null
      }

      continue
    }

    if (
      character === "'" ||
      character === '"' ||
      character === '`'
    ) {
      quote = character
      continue
    }

    if (character === '{') {
      depth += 1
      continue
    }

    if (character === '}') {
      depth -= 1

      if (depth === 0) {
        return index
      }
    }
  }

  throw new Error(
    '无法确定函数体结束位置。',
  )
}

function replaceExactOnce(
  source,
  oldSource,
  newSource,
  path,
  label,
) {
  const count =
    source.split(oldSource).length - 1

  if (count !== 1) {
    throw new Error(
      `${path}: ${label}匹配失败，预期 1 次，实际 ${count} 次。`,
    )
  }

  return source.replace(
    oldSource,
    newSource,
  )
}

function replaceRegexOnce(
  source,
  pattern,
  replacement,
  path,
  label,
) {
  const matches = [
    ...source.matchAll(
      new RegExp(
        pattern.source,
        pattern.flags.includes('g')
          ? pattern.flags
          : `${pattern.flags}g`,
      ),
    ),
  ]

  if (matches.length !== 1) {
    throw new Error(
      `${path}: ${label}匹配失败，预期 1 次，实际 ${matches.length} 次。`,
    )
  }

  return source.replace(
    pattern,
    replacement,
  )
}

function insertBeforeOnce(
  source,
  anchor,
  insertion,
  path,
  label,
) {
  const count =
    source.split(anchor).length - 1

  if (count !== 1) {
    throw new Error(
      `${path}: ${label}锚点匹配失败，预期 1 次，实际 ${count} 次。`,
    )
  }

  return source.replace(
    anchor,
    insertion + anchor,
  )
}

function runChecks() {
  console.log('')
  console.log(
    '开始格式化并执行检查…',
  )

  run('pnpm', [
    'exec',
    'biome',
    'format',
    '--write',
    paths.editorContext,
    paths.appShell,
  ])

  run('pnpm', [
    '--filter',
    '@hybrid-canvas/canvas',
    'typecheck',
  ])

  run('pnpm', [
    '--filter',
    '@hybrid-canvas/desktop',
    'typecheck',
  ])

  run('pnpm', [
    'test:architecture',
  ])
}

function read(path) {
  return readFileSync(
    join(root, path),
    'utf8',
  )
}

function write(path, content) {
  const target =
    join(root, path)

  const temporary =
    join(
      dirname(target),
      `.${randomUUID()}.tmp`,
    )

  writeFileSync(
    temporary,
    content,
    'utf8',
  )

  renameSync(
    temporary,
    target,
  )
}

function run(command, args) {
  console.log(
    `RUN    ${command} ${args.join(' ')}`,
  )

  execFileSync(
    command,
    args,
    {
      cwd: root,
      stdio: 'inherit',
      shell:
        process.platform ===
        'win32',
    },
  )
}

function assertRepository() {
  const packagePath =
    join(root, 'package.json')

  if (
    !existsSync(packagePath)
  ) {
    throw new Error(
      '请在 Canvas 仓库根目录运行脚本。',
    )
  }

  const packageJson =
    JSON.parse(
      readFileSync(
        packagePath,
        'utf8',
      ),
    )

  if (
    packageJson.name !==
    'hybrid-canvas'
  ) {
    throw new Error(
      '当前目录不是 hybrid-canvas 仓库根目录。',
    )
  }

  for (
    const path of
    Object.values(paths)
  ) {
    if (
      !existsSync(
        join(root, path),
      )
    ) {
      throw new Error(
        `缺少目标文件：${path}`,
      )
    }
  }
}