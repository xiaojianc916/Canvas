#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(parseRootArgument(process.argv.slice(2)))

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

  patchEditorCanvas()
  patchCanvasToolbar()

  console.log('已完成修复：')
  console.log('- EditorCanvas overlay pointer events')
  console.log('- CanvasZoomControl pointer events')
  console.log('- CanvasToolbar pointer events')
  console.log('- 更多菜单 pointer events')
  console.log('- select-all -> select-all-shapes')
  console.log('- tool/action 未注册时改为 warn，不再直接 throw')
}

function parseRootArgument(arguments_) {
  let rootArgument = '.'

  for (const argument of arguments_) {
    if (argument === '--apply') {
      continue
    }

    if (argument === '--help' || argument === '-h') {
      console.log(`
用法：
  node refactor.mjs
  node refactor.mjs --apply
  node refactor.mjs .
  node refactor.mjs --apply .
  node refactor.mjs D:\\xiaojianc\\hybrid-canvas
`)
      process.exit(0)
    }

    if (argument.startsWith('--')) {
      continue
    }

    rootArgument = argument
    break
  }

  return rootArgument
}

function patchEditorCanvas() {
  let source = readFileSync(editorCanvasPath, 'utf8')

  source = replaceFunction(
    source,
    'CanvasUiOverlay',
    `function CanvasUiOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <CanvasToolbar />
      <CanvasZoomControl />
    </div>
  )
}`,
  )

  source = replaceZoomControlContainer(source)

  writeFileSync(editorCanvasPath, source, 'utf8')
}

function replaceZoomControlContainer(source) {
  if (
    source.includes(
      'className="pointer-events-auto absolute bottom-3 right-3 flex h-8 items-center rounded-lg border bg-background/95 shadow-sm backdrop-blur-xl"',
    )
  ) {
    return source
  }

  const pattern =
    /className="[^"\n]*bottom-3[^"\n]*right-3[^"\n]*flex[^"\n]*h-8[^"\n]*items-center[^"\n]*rounded-lg[^"\n]*border[^"\n]*bg-background\/95[^"\n]*shadow-sm[^"\n]*backdrop-blur-xl"/

  const matches = [...source.matchAll(new RegExp(pattern.source, 'g'))]

  if (matches.length === 0) {
    throw new Error('找不到缩放控件容器 className')
  }

  if (matches.length > 1) {
    throw new Error('缩放控件容器 className 匹配不唯一')
  }

  return source.replace(
    pattern,
    'className="pointer-events-auto absolute bottom-3 right-3 flex h-8 items-center rounded-lg border bg-background/95 shadow-sm backdrop-blur-xl"',
  )
}

function patchCanvasToolbar() {
  let source = readFileSync(toolbarPath, 'utf8')

  source = replaceIfPresent(
    source,
    `'absolute left-1/2 top-3 z-20 flex max-w-[calc(100%-24px)]',`,
    `'pointer-events-auto absolute left-1/2 top-3 z-20 flex max-w-[calc(100%-24px)]',`,
  )

  source = replaceIfPresent(
    source,
    `'absolute right-0 top-[calc(100%+8px)] z-[var(--ui-z-popover)]',`,
    `'pointer-events-auto absolute right-0 top-[calc(100%+8px)] z-[var(--ui-z-popover)]',`,
  )

  source = replaceIfPresent(
    source,
    `onClick={() => execute('select-all')}`,
    `onClick={() => execute('select-all-shapes')}`,
  )

  source = replaceIfPresent(
    source,
    `if (!tool) {
      throw new Error('TLDRAW_TOOL_NOT_REGISTERED:' + toolId)
    }

    void tool.onSelect('toolbar')`,
    `if (!tool) {
      console.warn('TLDRAW_TOOL_NOT_REGISTERED:' + toolId)
      return
    }

    void tool.onSelect('toolbar')`,
  )

  source = replaceFunction(
    source,
    'invokeAction',
    `function invokeAction(
  actions: TLUiActionsContextType,
  actionId: string,
): void {
  const action = actions[actionId]

  if (!action) {
    console.warn('TLDRAW_ACTION_NOT_REGISTERED:' + actionId)
    return
  }

  void action.onSelect('toolbar')
}`,
  )

  writeFileSync(toolbarPath, source, 'utf8')
}

function replaceFunction(
  input,
  functionName,
  replacement,
) {
  const marker = `function ${functionName}(`
  const start = input.indexOf(marker)

  if (start < 0) {
    throw new Error('找不到函数：' + functionName)
  }

  const bodyStart = input.indexOf('{', start)

  if (bodyStart < 0) {
    throw new Error('找不到函数体起点：' + functionName)
  }

  let depth = 0
  let end = -1

  for (let index = bodyStart; index < input.length; index += 1) {
    const char = input[index]

    if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1

      if (depth === 0) {
        end = index + 1
        break
      }
    }
  }

  if (end < 0) {
    throw new Error('找不到函数体终点：' + functionName)
  }

  return input.slice(0, start) + replacement + input.slice(end)
}

function replaceIfPresent(
  input,
  oldText,
  newText,
) {
  const first = input.indexOf(oldText)

  if (first < 0) {
    return input
  }

  const second = input.indexOf(
    oldText,
    first + oldText.length,
  )

  if (second >= 0) {
    throw new Error('预期源码不唯一，无法安全替换')
  }

  return (
    input.slice(0, first) +
    newText +
    input.slice(first + oldText.length)
  )
}

function assertFile(path) {
  if (!existsSync(path)) {
    throw new Error('缺少文件：' + path)
  }
}