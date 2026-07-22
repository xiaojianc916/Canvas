// fix-sidebar-open-close.mjs
// 放在仓库根目录执行：
// node fix-sidebar-open-close.mjs

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const workspaceShellPath = resolve(
  'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
)

const oldCode = `        {mode !== 'narrow' ? (
          <div className="h-full min-h-0 overflow-hidden" style={{ width: sidebarWidth }}>
            {sidebarContent}
          </div>
        ) : null}

        {dockSidebar ? (
          <SidebarSplitter
            max={SIDEBAR_MAX}
            min={SIDEBAR_MIN}
            onCollapse={() => setSidebarOpen(false)}
            onResize={setSidebarWidth}
            onResizeEnd={() => setResizing(false)}
            onResizeStart={() => setResizing(true)}
            width={sidebarWidth}
          />
        ) : null}`

const newCode = `        {dockSidebar ? (
          <>
            <div
              className="h-full min-h-0 overflow-hidden"
              style={{ width: sidebarWidth }}
            >
              {sidebarContent}
            </div>

            <SidebarSplitter
              max={SIDEBAR_MAX}
              min={SIDEBAR_MIN}
              onCollapse={() => setSidebarOpen(false)}
              onResize={setSidebarWidth}
              onResizeEnd={() => setResizing(false)}
              onResizeStart={() => setResizing(true)}
              width={sidebarWidth}
            />
          </>
        ) : null}`

async function main() {
  const source = await readFile(
    workspaceShellPath,
    'utf8',
  )

  if (source.includes(newCode)) {
    console.log('✅ 侧边栏开关修复已经存在')
    return
  }

  if (!source.includes(oldCode)) {
    throw new Error(
      '没有找到旧侧边栏渲染结构，请检查 WorkspaceShell.tsx。',
    )
  }

  const nextSource = source.replace(
    oldCode,
    newCode,
  )

  await writeFile(
    workspaceShellPath,
    nextSource,
    'utf8',
  )

  const verificationSource = await readFile(
    workspaceShellPath,
    'utf8',
  )

  if (
    verificationSource.includes(
      "{mode !== 'narrow' ? (\n          <div className=\"h-full min-h-0 overflow-hidden\"",
    )
  ) {
    throw new Error(
      '旧的常驻侧边栏内容仍然存在。',
    )
  }

  if (
    !verificationSource.includes(
      '{dockSidebar ? (\n          <>',
    )
  ) {
    throw new Error(
      '新的条件渲染结构没有正确写入。',
    )
  }

  console.log('✅ 已修复侧边栏打开/关闭')
  console.log('✅ 关闭时会卸载侧边栏内容')
  console.log('✅ 关闭时会卸载拖拽分隔条')
  console.log('✅ 不再用隐藏内容覆盖画布')
}

main().catch((error) => {
  console.error('❌ 修复失败')

  if (error instanceof Error) {
    console.error(error.message)
  } else {
    console.error(error)
  }

  process.exit(1)
})