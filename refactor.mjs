#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(process.argv[2] ?? '.')

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

  console.log('已修复：')
  console.log('- EditorCanvas overlay pointer events')
  console.log('- CanvasZoomControl pointer events')
  console.log('- CanvasToolbar pointer events')
  console.log('- 更多菜单 pointer events')
  console.log('- select-all -> select-all-shapes')
  console.log('- 保留 scientific-chart')
  console.log('- tool/action 未注册时不再 throw 打崩页面')
}

function patchEditorCanvas() {
  let source = readFileSync(editorCanvasPath, 'utf8')

  if (
    source.includes(
      'className="pointer-events-none absolute inset-0 z-20"',
    ) &&
    source.includes(
      'className="pointer-events-auto absolute bottom-3 right-3 flex h-8 items-center rounded-lg border bg-background/95 shadow-sm backdrop-blur-xl"',
    )
  ) {
    writeFileSync(editorCanvasPath, source, 'utf8')
    return
  }

  source = replaceExactlyOnce(
    source,
    `function CanvasUiOverlay() {
  return (
    <>
      <CanvasToolbar />
      <CanvasZoomControl />
    </>
  )
}
`,
    `function CanvasUiOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <CanvasToolbar />
      <CanvasZoomControl />
    </div>
  )
}
`,
    'CanvasUiOverlay',
  )

  source = replaceExactlyOnce(
    source,
    `    <div className="absolute bottom-3 right-3 z-20 flex h-8 items-center rounded-lg border bg-background/95 shadow-sm backdrop-blur-xl">`,
    `    <div className="pointer-events-auto absolute bottom-3 right-3 flex h-8 items-center rounded-lg border bg-background/95 shadow-sm backdrop-blur-xl">`,
    'CanvasZoomControl pointer events',
  )

  writeFileSync(editorCanvasPath, source, 'utf8')
}

function patchCanvasToolbar() {
  let source = readFileSync(toolbarPath, 'utf8')

  source = replaceIfPresent(
    source,
    `        'absolute left-1/2 top-3 z-20 flex max-w-[calc(100%-24px)]',`,
    `        'pointer-events-auto absolute left-1/2 top-3 z-20 flex max-w-[calc(100%-24px)]',`,
  )

  source = replaceIfPresent(
    source,
    `              'absolute right-0 top-[calc(100%+8px)] z-[var(--ui-z-popover)]',`,
    `              'pointer-events-auto absolute right-0 top-[calc(100%+8px)] z-[var(--ui-z-popover)]',`,
  )

  source = replaceIfPresent(
    source,
    `                onClick={() => execute('select-all')}`,
    `                onClick={() => execute('select-all-shapes')}`,
  )

  source = replaceIfPresent(
    source,
    `    if (!tool) {
      throw new Error('TLDRAW_TOOL_NOT_REGISTERED:' + toolId)
    }

    void tool.onSelect('toolbar')
`,
    `    if (!tool) {
      console.warn('TLDRAW_TOOL_NOT_REGISTERED:' + toolId)
      return
    }

    void tool.onSelect('toolbar')
`,
  )

  source = replaceIfPresent(
    source,
    `  if (!action) {
    throw new Error('TLDRAW_ACTION_NOT_REGISTERED:' + actionId)
  }

  void action.onSelect('toolbar')
`,
    `  if (!action) {
    console.warn('TLDRAW_ACTION_NOT_REGISTERED:' + actionId)
    return
  }

  void action.onSelect('toolbar')
`,
  )

  writeFileSync(toolbarPath, source, 'utf8')
}

function replaceExactlyOnce(
  input,
  oldText,
  newText,
  label,
) {
  const first = input.indexOf(oldText)

  if (first < 0) {
    throw new Error('找不到预期源码：' + label)
  }

  const second = input.indexOf(
    oldText,
    first + oldText.length,
  )

  if (second >= 0) {
    throw new Error('预期源码不唯一：' + label)
  }

  return (
    input.slice(0, first) +
    newText +
    input.slice(first + oldText.length)
  )
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
    throw new Error('预期源码不唯一，无法安全替换。')
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