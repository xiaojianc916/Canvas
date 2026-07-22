#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()

const APPLY = process.argv.includes('--apply')

const ALLOW_DIRTY = process.argv.includes('--allow-dirty')

const FILES = {
  rootPackage: 'package.json',

  architectureCheck: 'tests/architecture/check-ui-architecture.mjs',

  primitives: 'foundations/design-system/src/primitives',
}

const ARCHITECTURE_CHECK_SOURCE = String.raw`#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'

const ROOT = process.cwd()

const IGNORED_DIRECTORIES =
  new Set([
    '.git',
    '.turbo',
    '.vscode',
    'dist',
    'node_modules',
    'target',
    'tooling',
  ])

const REQUIRED_TOKENS = [
  '--ui-background',
  '--ui-foreground',
  '--ui-primary',
  '--ui-primary-foreground',
  '--ui-muted',
  '--ui-muted-foreground',
  '--ui-accent',
  '--ui-accent-foreground',
  '--ui-destructive',
  '--ui-ring',
  '--ui-z-popover',
  '--ui-z-dialog',
  '--ui-z-toast',
  'prefers-reduced-motion',
]

const failures = []

function walk(directory) {
  return fs
    .readdirSync(
      directory,
      {
        withFileTypes: true,
      },
    )
    .flatMap((entry) => {
      if (
        entry.isDirectory() &&
        IGNORED_DIRECTORIES.has(
          entry.name,
        )
      ) {
        return []
      }

      const entryPath =
        path.join(
          directory,
          entry.name,
        )

      if (entry.isDirectory()) {
        return walk(entryPath)
      }

      return entry.isFile()
        ? [entryPath]
        : []
    })
}

function relative(filePath) {
  return path
    .relative(ROOT, filePath)
    .split(path.sep)
    .join('/')
}

function addFailure(
  filePath,
  message,
) {
  failures.push(
    relative(filePath) +
      ': ' +
      message,
  )
}

function getTagName(
  node,
  sourceFile,
) {
  if (ts.isJsxElement(node)) {
    return node.openingElement
      .tagName
      .getText(sourceFile)
  }

  if (
    ts.isJsxSelfClosingElement(
      node,
    )
  ) {
    return node.tagName.getText(
      sourceFile,
    )
  }

  return undefined
}

function checkNestedButtons(
  sourceFile,
  filePath,
) {
  function visit(
    node,
    buttonDepth,
  ) {
    const tagName =
      getTagName(
        node,
        sourceFile,
      )

    const nextButtonDepth =
      tagName === 'button'
        ? buttonDepth + 1
        : buttonDepth

    if (
      tagName === 'button' &&
      buttonDepth > 0
    ) {
      const position =
        sourceFile
          .getLineAndCharacterOfPosition(
            node.getStart(
              sourceFile,
            ),
          )

      addFailure(
        filePath,
        [
          '嵌套 button，行 ',
          String(
            position.line + 1,
          ),
        ].join(''),
      )
    }

    ts.forEachChild(
      node,
      (child) => {
        visit(
          child,
          nextButtonDepth,
        )
      },
    )
  }

  visit(sourceFile, 0)
}

function checkParseDiagnostics(
  sourceFile,
  filePath,
) {
  for (
    const diagnostic of
      sourceFile.parseDiagnostics
  ) {
    const message =
      ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        ' ',
      )

    addFailure(
      filePath,
      'TSX 解析失败：' +
        message,
    )
  }
}

function checkHardcodedColors(
  content,
  filePath,
) {
  const normalizedPath =
    relative(filePath)

  const isApplicationUi =
    normalizedPath.startsWith(
      'apps/',
    ) ||
    normalizedPath.startsWith(
      'features/',
    )

  if (!isApplicationUi) {
    return
  }

  const hardcodedClassPattern =
    /\b(bg-white|text-black|border-black\/\d+)\b/

  if (
    hardcodedClassPattern.test(
      content,
    )
  ) {
    addFailure(
      filePath,
      '使用硬编码主题颜色',
    )
  }
}

function checkFeatureDialogs(
  content,
  filePath,
) {
  const normalizedPath =
    relative(filePath)

  const isApplicationUi =
    normalizedPath.startsWith(
      'apps/',
    ) ||
    normalizedPath.startsWith(
      'features/',
    )

  if (!isApplicationUi) {
    return
  }

  const hasDialogRole =
    /role=["']dialog["']/
      .test(content)

  const hasFullScreenOverlay =
    /fixed[\s\S]{0,400}inset-0/
      .test(content)

  if (
    hasDialogRole &&
    hasFullScreenOverlay
  ) {
    addFailure(
      filePath,
      'Feature 自行实现 Dialog Overlay',
    )
  }
}

function checkInternalImports(
  content,
  filePath,
) {
  const internalImportPattern =
    /@hybrid-canvas\/design-system\/src\//

  if (
    internalImportPattern.test(
      content,
    )
  ) {
    addFailure(
      filePath,
      '跨包导入 Design System 内部路径',
    )
  }

  const primitiveImportPattern =
    /design-system\/src\/primitives|\/primitives\//

  if (
    primitiveImportPattern.test(
      content,
    )
  ) {
    addFailure(
      filePath,
      '继续引用旧 primitives 目录',
    )
  }
}

function checkClickableDivs(
  content,
  filePath,
) {
  const clickableDivPattern =
    /<div\b(?=[^>]*\bonClick=)(?![^>]*\brole=)(?![^>]*\btabIndex=)[^>]*>/g

  if (
    clickableDivPattern.test(
      content,
    )
  ) {
    addFailure(
      filePath,
      '可点击 div 缺少 role 或 tabIndex',
    )
  }
}

function checkTsxFile(filePath) {
  const content =
    fs.readFileSync(
      filePath,
      'utf8',
    )

  const sourceFile =
    ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )

  checkParseDiagnostics(
    sourceFile,
    filePath,
  )

  checkNestedButtons(
    sourceFile,
    filePath,
  )

  checkHardcodedColors(
    content,
    filePath,
  )

  checkFeatureDialogs(
    content,
    filePath,
  )

  checkInternalImports(
    content,
    filePath,
  )

  checkClickableDivs(
    content,
    filePath,
  )
}

function checkTokenFile() {
  const tokenFile =
    path.join(
      ROOT,
      'foundations/design-system/src/styles/index.css',
    )

  if (!fs.existsSync(tokenFile)) {
    failures.push(
      '缺少 Design System Token 文件',
    )

    return
  }

  const content =
    fs.readFileSync(
      tokenFile,
      'utf8',
    )

  for (
    const token of
      REQUIRED_TOKENS
  ) {
    if (
      !content.includes(token)
    ) {
      failures.push(
        'Design System 缺少 Token：' +
          token,
      )
    }
  }
}

const files = walk(ROOT)

for (const filePath of files) {
  if (
    filePath.endsWith('.tsx')
  ) {
    checkTsxFile(filePath)
  }
}

checkTokenFile()

if (failures.length > 0) {
  console.error(
    failures
      .map(
        (failure) =>
          '- ' + failure,
      )
      .join('\n'),
  )

  process.exitCode = 1
} else {
  console.log(
    'UI architecture checks passed.',
  )
}
`

function absolute(relativePath) {
  return path.join(ROOT, relativePath)
}

function assertRepository() {
  const packageFile = absolute(FILES.rootPackage)

  if (!fs.existsSync(packageFile)) {
    throw new Error('请在 Canvas 仓库根目录运行脚本。')
  }

  const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf8'))

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error('当前目录不是 hybrid-canvas 仓库。')
  }

  if (ALLOW_DIRTY) {
    return
  }

  const status = execFileSync('git', ['status', '--porcelain'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim()

  if (status.length > 0) {
    throw new Error('Git 工作区不干净。' + '请先提交，或显式使用 --allow-dirty。')
  }
}

function transformRootPackage(content) {
  const packageJson = JSON.parse(content)

  packageJson.scripts ??= {}

  const command = 'node tests/architecture/check-ui-architecture.mjs'

  const existing = packageJson.scripts['test:architecture']

  if (!existing) {
    packageJson.scripts['test:architecture'] = command
  } else if (!existing.includes(command)) {
    packageJson.scripts['test:architecture'] = existing + ' && ' + command
  }

  return JSON.stringify(packageJson, null, 2) + '\n'
}

function findPrimitiveReferences() {
  const sourceRoots = ['apps', 'features', 'foundations', 'platforms']

  const references = []

  function walkSources(directory) {
    if (!fs.existsSync(directory)) {
      return
    }

    const entries = fs.readdirSync(directory, {
      withFileTypes: true,
    })

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name)

      if (entry.isDirectory()) {
        if (entryPath === absolute(FILES.primitives)) {
          continue
        }

        walkSources(entryPath)
        continue
      }

      if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) {
        continue
      }

      const content = fs.readFileSync(entryPath, 'utf8')

      const primitivePattern = /design-system\/src\/primitives|\/primitives\//

      if (primitivePattern.test(content)) {
        references.push(path.relative(ROOT, entryPath).split(path.sep).join('/'))
      }
    }
  }

  for (const sourceRoot of sourceRoots) {
    walkSources(absolute(sourceRoot))
  }

  return references
}

function buildChanges() {
  const changes = []

  const architectureFile = absolute(FILES.architectureCheck)

  const currentArchitectureCheck = fs.existsSync(architectureFile)
    ? fs.readFileSync(architectureFile, 'utf8')
    : null

  if (currentArchitectureCheck !== ARCHITECTURE_CHECK_SOURCE) {
    changes.push({
      relativePath: FILES.architectureCheck,

      nextContent: ARCHITECTURE_CHECK_SOURCE,
    })
  }

  const packageContent = fs.readFileSync(absolute(FILES.rootPackage), 'utf8')

  const nextPackageContent = transformRootPackage(packageContent)

  if (packageContent !== nextPackageContent) {
    changes.push({
      relativePath: FILES.rootPackage,

      nextContent: nextPackageContent,
    })
  }

  const primitiveDirectory = absolute(FILES.primitives)

  const primitiveReferences = findPrimitiveReferences()

  const removePrimitives = fs.existsSync(primitiveDirectory) && primitiveReferences.length === 0

  return {
    changes,
    primitiveReferences,
    removePrimitives,
  }
}

function printPlan(plan) {
  console.log('Phase 6 清理计划：')

  for (const change of plan.changes) {
    console.log('- 写入 ' + change.relativePath)
  }

  if (plan.removePrimitives) {
    console.log('- 删除 ' + FILES.primitives)
  } else if (plan.primitiveReferences.length > 0) {
    console.log('- 暂不删除 primitives，仍有引用：')

    for (const reference of plan.primitiveReferences) {
      console.log('  - ' + reference)
    }
  }
}

function applyPlan(plan) {
  for (const change of plan.changes) {
    const filePath = absolute(change.relativePath)

    fs.mkdirSync(path.dirname(filePath), {
      recursive: true,
    })

    fs.writeFileSync(filePath, change.nextContent, 'utf8')
  }

  if (plan.removePrimitives) {
    fs.rmSync(absolute(FILES.primitives), {
      recursive: true,
      force: true,
    })
  }

  execFileSync('git', ['diff', '--check'], {
    cwd: ROOT,
    stdio: 'inherit',
  })
}

function main() {
  assertRepository()

  const plan = buildChanges()

  const hasChanges = plan.changes.length > 0 || plan.removePrimitives

  printPlan(plan)

  if (!hasChanges) {
    console.log('')
    console.log('Phase 6 没有需要应用的修改。')

    return
  }

  if (!APPLY) {
    console.log('')
    console.log('当前为预检模式，' + '没有写入文件。')

    console.log('')
    console.log('应用命令：')

    console.log('node tooling/script/refactor-ui-phase-6.mjs --apply')

    return
  }

  applyPlan(plan)

  console.log('')
  console.log('Phase 6 架构守卫和遗留清理已写入。')

  console.log('')
  console.log('请执行：')
  console.log('pnpm format')
  console.log('pnpm lint')
  console.log('pnpm typecheck')
  console.log('pnpm test:architecture')
  console.log('pnpm test')
  console.log('pnpm build:desktop')

  console.log('')
  console.log('放弃本阶段未提交修改：')

  const changedPaths = plan.changes.map((change) => change.relativePath)

  if (plan.removePrimitives) {
    changedPaths.push(FILES.primitives)
  }

  console.log('git restore -- ' + changedPaths.join(' '))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)

  process.exitCode = 1
}
