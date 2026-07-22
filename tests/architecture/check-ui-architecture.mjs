#!/usr/bin/env node
/* biome-ignore-all lint/suspicious/noConsole: CLI scripts intentionally write command output. */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import * as tsModule from '@typescript/typescript6'

const ts = tsModule.default ?? tsModule

const ROOT = process.cwd()

const IGNORED_DIRECTORIES = new Set([
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
    .readdirSync(directory, {
      withFileTypes: true,
    })
    .flatMap((entry) => {
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) {
        return []
      }

      const entryPath = path.join(directory, entry.name)

      if (entry.isDirectory()) {
        return walk(entryPath)
      }

      return entry.isFile() ? [entryPath] : []
    })
}

function relative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/')
}

function addFailure(filePath, message) {
  failures.push(relative(filePath) + ': ' + message)
}

function getTagName(node, sourceFile) {
  if (ts.isJsxElement(node)) {
    return node.openingElement.tagName.getText(sourceFile)
  }

  if (ts.isJsxSelfClosingElement(node)) {
    return node.tagName.getText(sourceFile)
  }

  return undefined
}

function checkNestedButtons(sourceFile, filePath) {
  function visit(node, buttonDepth) {
    const tagName = getTagName(node, sourceFile)

    const nextButtonDepth = tagName === 'button' ? buttonDepth + 1 : buttonDepth

    if (tagName === 'button' && buttonDepth > 0) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))

      addFailure(filePath, ['嵌套 button，行 ', String(position.line + 1)].join(''))
    }

    ts.forEachChild(node, (child) => {
      visit(child, nextButtonDepth)
    })
  }

  visit(sourceFile, 0)
}

function checkParseDiagnostics(sourceFile, filePath) {
  for (const diagnostic of sourceFile.parseDiagnostics) {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')

    addFailure(filePath, 'TSX 解析失败：' + message)
  }
}

function checkHardcodedColors(content, filePath) {
  const normalizedPath = relative(filePath)

  const isApplicationUi =
    normalizedPath.startsWith('apps/') || normalizedPath.startsWith('features/')

  if (!isApplicationUi) {
    return
  }

  const hardcodedClassPattern = /\b(bg-white|text-black|border-black\/\d+)\b/

  if (hardcodedClassPattern.test(content)) {
    addFailure(filePath, '使用硬编码主题颜色')
  }
}

function checkFeatureDialogs(content, filePath) {
  const normalizedPath = relative(filePath)

  const isApplicationUi =
    normalizedPath.startsWith('apps/') || normalizedPath.startsWith('features/')

  if (!isApplicationUi) {
    return
  }

  const hasDialogRole = /role=["']dialog["']/.test(content)

  const hasFullScreenOverlay = /fixed[\s\S]{0,400}inset-0/.test(content)

  if (hasDialogRole && hasFullScreenOverlay) {
    addFailure(filePath, 'Feature 自行实现 Dialog Overlay')
  }
}

function checkInternalImports(content, filePath) {
  const internalImportPattern = /@hybrid-canvas\/design-system\/src\//

  if (internalImportPattern.test(content)) {
    addFailure(filePath, '跨包导入 Design System 内部路径')
  }

  const primitiveImportPattern = /design-system\/src\/primitives|\/primitives\//

  if (primitiveImportPattern.test(content)) {
    addFailure(filePath, '继续引用旧 primitives 目录')
  }
}

function checkClickableDivs(content, filePath) {
  const clickableDivPattern = /<div\b(?=[^>]*\bonClick=)(?![^>]*\brole=)(?![^>]*\btabIndex=)[^>]*>/g

  if (clickableDivPattern.test(content)) {
    addFailure(filePath, '可点击 div 缺少 role 或 tabIndex')
  }
}

function checkTsxFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')

  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )

  checkParseDiagnostics(sourceFile, filePath)

  checkNestedButtons(sourceFile, filePath)

  checkHardcodedColors(content, filePath)

  checkFeatureDialogs(content, filePath)

  checkInternalImports(content, filePath)

  checkClickableDivs(content, filePath)
}

function checkTokenFile() {
  const tokenFile = path.join(ROOT, 'foundations/design-system/src/styles/index.css')

  if (!fs.existsSync(tokenFile)) {
    failures.push('缺少 Design System Token 文件')

    return
  }

  const content = fs.readFileSync(tokenFile, 'utf8')

  for (const token of REQUIRED_TOKENS) {
    if (!content.includes(token)) {
      failures.push('Design System 缺少 Token：' + token)
    }
  }
}

const files = walk(ROOT)

for (const filePath of files) {
  if (filePath.endsWith('.tsx')) {
    checkTsxFile(filePath)
  }
}

checkTokenFile()

if (failures.length > 0) {
  console.error(failures.map((failure) => '- ' + failure).join('\n'))

  process.exitCode = 1
} else {
  console.log('UI architecture checks passed.')
}
