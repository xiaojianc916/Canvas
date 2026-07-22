#!/usr/bin/env node

/**
 * 将 tldraw 选区几何信息移动到画布状态栏
 *
 * 使用：
 *   保存为 scripts/move-geometry-to-statusbar.mjs
 *
 *   node scripts/move-geometry-to-statusbar.mjs
 *
 * 效果：
 *   - 从右侧属性面板删除“几何”区域
 *   - 状态栏实时显示：
 *     - 选中对象数量
 *     - X / Y
 *     - W / H
 *     - 单选对象旋转角度
 *   - 多选时显示整个选区的包围盒信息
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()

const workspaceContainerPath = resolve(
  root,
  'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
)

const statusBarHostPath = resolve(
  root,
  'features/workspace/src/presentation/status/StatusBarHost.tsx',
)

async function readText(path) {
  return readFile(path, 'utf8')
}

async function writeText(path, content) {
  await writeFile(path, content, 'utf8')
}

function replaceRequired(source, search, replacement, description) {
  const index = source.indexOf(search)

  if (index === -1) {
    throw new Error(`没有找到修改位置：${description}`)
  }

  return source.slice(0, index) + replacement + source.slice(index + search.length)
}

function insertBeforeRequired(source, marker, content, description) {
  const index = source.indexOf(marker)

  if (index === -1) {
    throw new Error(`没有找到插入位置：${description}`)
  }

  return source.slice(0, index) + content + '\n\n' + source.slice(index)
}

function ensureEditorImport(source) {
  if (source.includes("import { EditorSessionHost, useEditor } from '@hybrid-canvas/canvas/react'")) {
    return source
  }

  if (source.includes("import { EditorSessionHost } from '@hybrid-canvas/canvas/react'")) {
    return source.replace(
      "import { EditorSessionHost } from '@hybrid-canvas/canvas/react'",
      "import { EditorSessionHost, useEditor } from '@hybrid-canvas/canvas/react'",
    )
  }

  throw new Error('没有找到 @hybrid-canvas/canvas/react 导入')
}

function ensureUseValueImport(source) {
  if (
    source.includes("from 'tldraw'") &&
    /\buseValue\b/.test(
      source.slice(
        Math.max(0, source.lastIndexOf('import', source.indexOf("from 'tldraw'"))),
        source.indexOf("from 'tldraw'") + "from 'tldraw'".length,
      ),
    )
  ) {
    return source
  }

  const tldrawImportPattern = /import\s*\{([\s\S]*?)\}\s*from 'tldraw'/
  const existingImport = source.match(tldrawImportPattern)

  if (existingImport) {
    const importedItems = existingImport[1] ?? ''

    if (importedItems.includes('useValue')) {
      return source
    }

    return source.replace(
      tldrawImportPattern,
      (_fullMatch, items) => `import {${items}, useValue } from 'tldraw'`,
    )
  }

  const reactImportEnd = source.indexOf("from 'react'")

  if (reactImportEnd === -1) {
    throw new Error('没有找到 React 导入位置')
  }

  const lineEnd = source.indexOf('\n', reactImportEnd)

  return (
    source.slice(0, lineEnd + 1) +
    "import { useValue } from 'tldraw'\n" +
    source.slice(lineEnd + 1)
  )
}

function removeInspectorGeometrySection(source) {
  if (!source.includes('<InspectorSection title="几何">')) {
    console.warn('右侧栏中没有发现“几何”区域，跳过删除。')
    return source
  }

  const next = source.replace(
    /\n\s*<InspectorSection title="几何">[\s\S]*?<\/InspectorSection>\n/,
    '\n',
  )

  if (next === source) {
    throw new Error('发现“几何”区域，但未能安全删除')
  }

  return next
}

const statusComponent = String.raw`function CanvasSelectionGeometryStatus() {
  const editor = useEditor()

  const geometry = useValue(
    'canvas status selection geometry',
    () => {
      if (!editor) {
        return null
      }

      const selectedShapes = editor.getSelectedShapes()

      if (selectedShapes.length === 0) {
        return null
      }

      const bounds = editor.getSelectionPageBounds()

      if (!bounds) {
        return null
      }

      const firstShape = selectedShapes[0]

      const sharedRotation =
        firstShape &&
        selectedShapes.every(
          (shape) =>
            Math.abs(shape.rotation - firstShape.rotation) < 0.0001,
        )
          ? radiansToStatusDegrees(firstShape.rotation)
          : null

      return {
        count: selectedShapes.length,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        rotation: sharedRotation,
      }
    },
    [editor],
  )

  if (!geometry) {
    return null
  }

  return (
    <>
      <StatusDivider />

      <span className="shrink-0 font-medium text-foreground/80">
        {geometry.count === 1
          ? '已选择 1 个对象'
          : '已选择 ' + String(geometry.count) + ' 个对象'}
      </span>

      <StatusGeometryValue
        label="X"
        value={formatStatusNumber(geometry.x)}
      />

      <StatusGeometryValue
        label="Y"
        value={formatStatusNumber(geometry.y)}
      />

      <StatusGeometryValue
        label="W"
        value={formatStatusNumber(geometry.width)}
      />

      <StatusGeometryValue
        label="H"
        value={formatStatusNumber(geometry.height)}
      />

      {geometry.rotation !== null ? (
        <StatusGeometryValue
          label="R"
          suffix="°"
          value={formatStatusNumber(geometry.rotation)}
        />
      ) : null}
    </>
  )
}

interface StatusGeometryValueProps {
  readonly label: string
  readonly value: string
  readonly suffix?: string
}

function StatusGeometryValue({
  label,
  value,
  suffix,
}: StatusGeometryValueProps) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1"
      title={label + ': ' + value + (suffix ?? '')}
    >
      <span className="text-muted-foreground/70">{label}</span>
      <span className="min-w-8 rounded bg-background/70 px-1.5 py-0.5 text-right font-mono tabular-nums text-foreground/80">
        {value}
        {suffix}
      </span>
    </span>
  )
}

function StatusDivider() {
  return (
    <span
      aria-hidden="true"
      className="h-3 w-px shrink-0 bg-divider"
    />
  )
}

function radiansToStatusDegrees(value: number): number {
  return (value * 180) / Math.PI
}

function formatStatusNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0'
  }

  return String(Math.round(value * 10) / 10)
}`

async function updateWorkspaceContainer() {
  const original = await readText(workspaceContainerPath)

  let next = original

  next = ensureEditorImport(next)
  next = ensureUseValueImport(next)
  next = removeInspectorGeometrySection(next)

  const oldStatusLeft =
    'statusLeft={<CanvasStatusLeftContent hasActiveCanvas={workbench.activeCanvas !== null} />}'

  const newStatusLeft = `statusLeft={
        <>
          <CanvasStatusLeftContent
            hasActiveCanvas={workbench.activeCanvas !== null}
          />
          <CanvasSelectionGeometryStatus />
        </>
      }`

  if (!next.includes('<CanvasSelectionGeometryStatus />')) {
    next = replaceRequired(
      next,
      oldStatusLeft,
      newStatusLeft,
      'WorkspaceShell statusLeft',
    )
  }

  if (!next.includes('function CanvasSelectionGeometryStatus()')) {
    next = insertBeforeRequired(
      next,
      'function CanvasStatusLeftContent(',
      statusComponent,
      'CanvasStatusLeftContent',
    )
  }

  await writeText(workspaceContainerPath, next)
}

async function updateStatusBarLayout() {
  const original = await readText(statusBarHostPath)

  let next = original

  next = replaceRequired(
    next,
    '<div className="flex min-w-0 items-center gap-3">{left}</div>',
    `<div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {left}
      </div>`,
    '状态栏左侧内容容器',
  )

  next = replaceRequired(
    next,
    '{right ? <div className="flex shrink-0 items-center gap-3">{right}</div> : null}',
    `{right ? (
        <div className="ml-3 flex shrink-0 items-center gap-3">
          {right}
        </div>
      ) : null}`,
    '状态栏右侧内容容器',
  )

  await writeText(statusBarHostPath, next)
}

async function main() {
  console.log('正在将选区几何信息移动到画布状态栏……')

  await updateWorkspaceContainer()
  await updateStatusBarLayout()

  console.log('')
  console.log('修改完成：')
  console.log('  ✓ 删除右侧栏几何区域')
  console.log('  ✓ 状态栏显示选区数量')
  console.log('  ✓ 状态栏显示 X / Y / W / H')
  console.log('  ✓ 单选或同角度多选时显示旋转角度')
  console.log('  ✓ 多选时显示选区整体包围盒')
  console.log('')
  console.log('请执行：')
  console.log('  pnpm format')
  console.log('  pnpm typecheck')
  console.log('  pnpm test:architecture')
}

main().catch((error) => {
  console.error('')
  console.error('修改失败：')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})