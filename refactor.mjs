#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(parseRootArgument(process.argv.slice(2)))

const workspaceShellPath = resolve(
  root,
  'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
)

main()

function main() {
  assertFile(workspaceShellPath)

  let source = readFileSync(workspaceShellPath, 'utf8')

  source = replaceExactlyOnce(
    source,
    `  const dockSidebar = mode !== 'narrow' && isSidebarOpen
  const dockInspector = mode === 'wide' && isInspectorOpen && hasCanvas
`,
    `  const dockSidebar = mode !== 'narrow' && isSidebarOpen
  const dockInspector = isInspectorOpen && hasCanvas
`,
    'dockInspector layout rule',
  )

  source = replaceExactlyOnce(
    source,
    `    if (mode === 'compact') {
      setInspectorOpen(false)
    }

    if (mode === 'narrow') {
      setSidebarOpen(false)
      setInspectorOpen(false)
    }
`,
    `    if (mode === 'narrow') {
      setSidebarOpen(false)
    }
`,
    'resize auto-close inspector effect',
  )

  source = replaceSection(
    source,
    `  const inspectorRegion = hasCanvas ? (`,
    `  const status = hasCanvas ? (`,
    `  const inspectorRegion = hasCanvas ? (
    <>
      <aside
        aria-hidden={!dockInspector}
        aria-label="属性检查器"
        className="relative row-[2/-1] min-h-0 min-w-0 overflow-visible"
        style={{
          gridColumn: 4,
          pointerEvents: dockInspector ? 'auto' : 'none',
        }}
      >
        {dockInspector ? (
          <div
            className="absolute inset-y-0 right-0 overflow-visible"
            style={{ width: INSPECTOR_WIDTH }}
          >
            <div className="relative h-full">
              <Button
                aria-label="收起属性面板"
                className="absolute -left-8 top-3 z-30 size-7 rounded-r-none"
                onClick={() => setInspectorOpen(false)}
                size="icon"
                type="button"
                variant="outline"
              >
                <PanelRightClose aria-hidden="true" className="size-3.5" />
              </Button>

              {inspectorContent}
            </div>
          </div>
        ) : null}
      </aside>

      {!dockInspector ? (
        <Button
          aria-expanded={false}
          aria-label="展开属性面板"
          className="fixed right-0 top-[calc(var(--chrome-height)+12px)] z-30 rounded-r-none"
          onClick={() => {
            if (mode !== 'wide') {
              setSidebarOpen(false)
            }

            setInspectorOpen(true)
          }}
          size="icon"
          type="button"
          variant="outline"
        >
          <PanelRightOpen aria-hidden="true" className="size-4" />
        </Button>
      ) : null}
    </>
  ) : null

`,
    'inspector region',
  )

  writeFileSync(workspaceShellPath, source, 'utf8')

  console.log('已改成统一的纯右侧侧边栏设计：')
  console.log('- 去掉非 wide 模式下的右侧遮罩/抽屉')
  console.log('- inspector 不再因 resize 自动关闭')
  console.log('- inspector 统一为 docked sidebar')
  console.log('- 左侧 sidebar 逻辑未改')
  console.log('')
  console.log('已修改文件：')
  console.log('- features/workspace/src/presentation/shell/WorkspaceShell.tsx')
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

function replaceSection(
  input,
  startMarker,
  endMarker,
  replacement,
  label,
) {
  const start = input.indexOf(startMarker)

  if (start < 0) {
    throw new Error('找不到区段起点：' + label)
  }

  const end = input.indexOf(endMarker, start)

  if (end < 0) {
    throw new Error('找不到区段终点：' + label)
  }

  return (
    input.slice(0, start) +
    replacement +
    input.slice(end)
  )
}

function assertFile(path) {
  if (!existsSync(path)) {
    throw new Error('缺少文件：' + path)
  }
}