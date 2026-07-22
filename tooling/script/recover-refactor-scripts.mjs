#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()

const APPLY =
  process.argv.includes('--apply')

const ALLOW_DIRTY =
  process.argv.includes('--allow-dirty')

const FILES = {
  appShell:
    'apps/desktop/src/presentation/AppShell.tsx',

  themeController:
    'foundations/design-system/src/theme-controller.ts',

  uiFeedback:
    'apps/desktop/src/presentation/ui/ui-feedback.tsx',
}

function absolute(relativePath) {
  return path.join(
    ROOT,
    relativePath,
  )
}

function read(relativePath) {
  const filePath =
    absolute(relativePath)

  if (!fs.existsSync(filePath)) {
    return null
  }

  return fs.readFileSync(
    filePath,
    'utf8',
  )
}

function assertRepository() {
  const packageFile =
    absolute('package.json')

  if (!fs.existsSync(packageFile)) {
    throw new Error(
      '请在 Canvas 仓库根目录运行脚本。',
    )
  }

  const packageJson = JSON.parse(
    fs.readFileSync(
      packageFile,
      'utf8',
    ),
  )

  if (
    packageJson.name !==
    'hybrid-canvas'
  ) {
    throw new Error(
      '当前目录不是 hybrid-canvas 仓库。',
    )
  }

  const requiredFiles = [
    FILES.appShell,
    FILES.themeController,
    FILES.uiFeedback,
  ]

  for (
    const relativePath of
      requiredFiles
  ) {
    if (
      !fs.existsSync(
        absolute(relativePath),
      )
    ) {
      throw new Error(
        '缺少前置阶段文件：' +
          relativePath,
      )
    }
  }

  if (ALLOW_DIRTY) {
    return
  }

  const status = execFileSync(
    'git',
    [
      'status',
      '--porcelain',
    ],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  ).trim()

  if (status.length > 0) {
    throw new Error(
      'Git 工作区不干净。' +
        '请先提交当前修改，' +
        '或显式使用 --allow-dirty。',
    )
  }
}

function escapeRegExp(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  )
}

function parseNamedImports(
  importBody,
) {
  return importBody
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
}

function addNamedImport(
  content,
  moduleName,
  importedName,
) {
  const importPattern =
    new RegExp(
      [
        'import\\s*\\{',
        '([^}]*)',
        '\\}\\s*from\\s*',
        '[\'"]',
        escapeRegExp(moduleName),
        '[\'"]',
      ].join(''),
    )

  const match =
    content.match(importPattern)

  if (!match) {
    throw new Error(
      '没有找到命名导入：' +
        moduleName,
    )
  }

  const importedNames =
    parseNamedImports(match[1])

  const alreadyImported =
    importedNames.some(
      (name) => {
        return (
          name === importedName ||
          name.startsWith(
            importedName + ' as ',
          )
        )
      },
    )

  if (alreadyImported) {
    return content
  }

  const nextImport = [
    'import {',
    '  ' + importedName + ',',
    ...importedNames.map(
      (name) =>
        '  ' + name + ',',
    ),
    "} from '" + moduleName + "'",
  ].join('\n')

  return content.replace(
    match[0],
    nextImport,
  )
}

function ensureUseEffectImport(
  content,
) {
  const reactImportPattern =
    /import\s*\{([^}]*)\}\s*from\s*['"]react['"]/

  const match =
    content.match(
      reactImportPattern,
    )

  if (!match) {
    return [
      "import { useEffect } from 'react'",
      content,
    ].join('\n')
  }

  const importedNames =
    parseNamedImports(match[1])

  const hasUseEffect =
    importedNames.some(
      (name) => {
        return (
          name === 'useEffect' ||
          name.startsWith(
            'useEffect as ',
          )
        )
      },
    )

  if (hasUseEffect) {
    return content
  }

  const nextImport = [
    'import {',
    '  useEffect,',
    ...importedNames.map(
      (name) =>
        '  ' + name + ',',
    ),
    "} from 'react'",
  ].join('\n')

  return content.replace(
    match[0],
    nextImport,
  )
}

function hasThemeInitialization(
  content,
) {
  const hasThemeApplication =
    /applyThemePreference\s*\(\s*settings\.theme\s*,?\s*\)/
      .test(content)

  const hasSettingsLoad =
    /runtime\.settings\.load\s*\(\s*\)/
      .test(content)

  return (
    hasThemeApplication &&
    hasSettingsLoad
  )
}

function findCommandHook(
  content,
) {
  const hookPattern =
    /useApplicationCommands\s*\(\s*runtime\s*,\s*toggleCommandPalette\s*,?\s*\)/g

  const matches =
    content.match(hookPattern) ?? []

  if (matches.length !== 1) {
    throw new Error(
      [
        'AppShell 中的 ',
        'useApplicationCommands(',
        'runtime, toggleCommandPalette',
        ') 预期匹配 1 次，',
        '实际匹配 ',
        String(matches.length),
        ' 次。',
      ].join(''),
    )
  }

  return matches[0]
}

function buildThemeEffect(
  hookCall,
) {
  return [
    hookCall,
    '',
    '  useEffect(() => {',
    '    let active = true',
    '',
    '    void runtime.settings.load().then(',
    '      (settings) => {',
    '        if (!active) {',
    '          return',
    '        }',
    '',
    '        applyThemePreference(',
    '          settings.theme,',
    '        )',
    '      },',
    '      (cause: unknown) => {',
    '        if (!active) {',
    '          return',
    '        }',
    '',
    '        reportError(',
    "          'settings load failed',",
    '          {',
    "            scope: 'app-shell',",
    "            operation: 'load-settings',",
    '            cause,',
    '          },',
    '        )',
    '      },',
    '    )',
    '',
    '    return () => {',
    '      active = false',
    '    }',
    '  }, [',
    '    runtime.settings,',
    '  ])',
  ].join('\n')
}

function transformAppShell(
  content,
) {
  let next = content

  next = addNamedImport(
    next,
    '@hybrid-canvas/design-system',
    'applyThemePreference',
  )

  next = ensureUseEffectImport(
    next,
  )

  if (
    hasThemeInitialization(next)
  ) {
    return next
  }

  const hookCall =
    findCommandHook(next)

  const replacement =
    buildThemeEffect(
      hookCall,
    )

  return next.replace(
    hookCall,
    replacement,
  )
}

function buildChanges() {
  const currentContent =
    read(FILES.appShell)

  if (currentContent === null) {
    throw new Error(
      '缺少目标文件：' +
        FILES.appShell,
    )
  }

  const nextContent =
    transformAppShell(
      currentContent,
    )

  if (
    currentContent ===
    nextContent
  ) {
    return []
  }

  return [
    {
      relativePath:
        FILES.appShell,

      currentContent,

      nextContent,
    },
  ]
}

function printPlan(changes) {
  console.log(
    '主题初始化重构将修改 ' +
      changes.length +
      ' 个文件：',
  )

  for (const change of changes) {
    console.log(
      '- ' +
        change.relativePath,
    )
  }

  console.log('')
  console.log(
    '修改内容：',
  )

  console.log(
    '- 从 Design System 导入 applyThemePreference',
  )

  console.log(
    '- 确保 AppShell 导入 useEffect',
  )

  console.log(
    '- 应用启动时读取 SettingsStore',
  )

  console.log(
    '- 应用 light、dark 或 system 主题',
  )

  console.log(
    '- 设置读取失败时调用 reportError',
  )

  console.log(
    '- 组件卸载后忽略异步返回结果',
  )
}

function applyChanges(changes) {
  for (const change of changes) {
    fs.writeFileSync(
      absolute(
        change.relativePath,
      ),
      change.nextContent,
      'utf8',
    )
  }

  execFileSync(
    'git',
    [
      'diff',
      '--check',
    ],
    {
      cwd: ROOT,
      stdio: 'inherit',
    },
  )
}

function main() {
  assertRepository()

  const changes =
    buildChanges()

  if (changes.length === 0) {
    console.log(
      '主题初始化已经完成，' +
        '没有需要应用的修改。',
    )

    return
  }

  printPlan(changes)

  if (!APPLY) {
    console.log('')
    console.log(
      '当前为预检模式，' +
        '没有写入文件。',
    )

    console.log('')
    console.log(
      '应用命令：',
    )

    console.log(
      'node tooling/script/recover-refactor-scripts.mjs --apply',
    )

    return
  }

  applyChanges(changes)

  console.log('')
  console.log(
    '主题初始化重构已写入。',
  )

  console.log('')
  console.log(
    '请依次执行：',
  )

  console.log(
    'pnpm format',
  )

  console.log(
    'pnpm lint',
  )

  console.log(
    'pnpm typecheck',
  )

  console.log(
    'pnpm test:architecture',
  )

  console.log(
    'pnpm test',
  )

  console.log(
    'pnpm build:desktop',
  )

  console.log('')
  console.log(
    '放弃本次未提交修改：',
  )

  console.log(
    'git restore -- ' +
      changes
        .map(
          (change) =>
            change.relativePath,
        )
        .join(' '),
  )
}

try {
  main()
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : error,
  )

  process.exitCode = 1
}