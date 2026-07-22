import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const apply = args.includes('--apply')

const allowedArguments = new Set(['--apply', '--allow-dirty'])

for (const argument of args) {
  if (!allowedArguments.has(argument)) {
    throw new Error(`未知参数：${argument}`)
  }
}

const filePath = resolve(
  process.cwd(),
  'apps/desktop/src/application/termination/application-termination-coordinator.test.ts',
)

const currentSource = await readFile(filePath, 'utf8')

const updatedSource = `import { describe, expect, it, vi } from 'vitest'

import { createApplicationTerminationCoordinator } from './application-termination-coordinator'

describe('ApplicationTerminationCoordinator', () => {
  it('dispatches the requested native termination intent', () => {
    const terminate = vi.fn()

    const coordinator = createApplicationTerminationCoordinator(
      {
        planApplicationClose: () => ({ kind: 'close-now' }),
        discardAllAndClose: vi.fn(),
      },
      { terminate },
    )

    coordinator.request('update-restart')

    expect(terminate).toHaveBeenCalledTimes(1)
    expect(terminate).toHaveBeenCalledWith('update-restart')
    expect(coordinator.getSnapshot()).toEqual({
      state: 'terminating',
      intent: 'update-restart',
    })
  })

  it('ignores additional requests after native termination begins', () => {
    const terminate = vi.fn()

    const coordinator = createApplicationTerminationCoordinator(
      {
        planApplicationClose: () => ({ kind: 'close-now' }),
        discardAllAndClose: vi.fn(),
      },
      { terminate },
    )

    coordinator.request('window-close')
    coordinator.request('application-exit')

    expect(terminate).toHaveBeenCalledTimes(1)
    expect(terminate).toHaveBeenCalledWith('window-close')
    expect(coordinator.getSnapshot()).toEqual({
      state: 'terminating',
      intent: 'window-close',
    })
  })

  it('does not cancel after native termination begins', () => {
    const terminate = vi.fn()

    const coordinator = createApplicationTerminationCoordinator(
      {
        planApplicationClose: () => ({ kind: 'close-now' }),
        discardAllAndClose: vi.fn(),
      },
      { terminate },
    )

    coordinator.request('window-close')
    coordinator.cancel()

    expect(terminate).toHaveBeenCalledTimes(1)
    expect(coordinator.getSnapshot()).toEqual({
      state: 'terminating',
      intent: 'window-close',
    })
  })
})
`

if (currentSource === updatedSource) {
  console.log('无需修改：终止协调器测试已经是最新版本。')
  process.exit(0)
}

console.log(`目标文件：${filePath}`)
console.log('将移除过时的失败重试测试，并匹配当前单向终止行为。')

if (!apply) {
  console.log('\n当前是预览模式，未写入文件。')
  console.log('添加 --apply 后执行实际修改。')
  process.exit(0)
}

await writeFile(filePath, updatedSource, 'utf8')

console.log('\n修改完成。')
console.log('请运行：')
console.log('pnpm --filter @hybrid-canvas/desktop typecheck')
console.log('pnpm --filter @hybrid-canvas/desktop test')
console.log('pnpm typecheck')