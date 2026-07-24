#!/usr/bin/env node

import { access, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { cwd } from 'node:process'

const root = cwd()

const packageJsonPath = path.join(root, 'package.json')
const workflowPath = path.join(root, '.github', 'workflows', 'quality.yml')

const oldWorkflowStep = `      - name: JavaScript tests
        run: pnpm turbo run test`

const newWorkflowStep = `      - name: JavaScript tests
        run: pnpm test:frontend`

async function ensureExists(filePath) {
  try {
    await access(filePath)
  } catch {
    throw new Error(`找不到文件：${filePath}`)
  }
}

async function updatePackageJson() {
  await ensureExists(packageJsonPath)

  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))

  if (!packageJson.scripts || typeof packageJson.scripts !== 'object') {
    throw new Error('package.json 中不存在 scripts 配置。')
  }

  const expectedCommand = 'node scripts/quality/run.mjs frontend-test'

  if (packageJson.scripts['test:frontend'] === expectedCommand) {
    console.log('跳过：package.json 的 test:frontend 已正确配置。')
    return false
  }

  packageJson.scripts['test:frontend'] = expectedCommand

  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')

  console.log('已更新：package.json')
  return true
}

async function updateWorkflow() {
  await ensureExists(workflowPath)

  const workflow = await readFile(workflowPath, 'utf8')

  if (workflow.includes(newWorkflowStep)) {
    console.log('跳过：quality.yml 已使用 pnpm test:frontend。')
    return false
  }

  if (!workflow.includes(oldWorkflowStep)) {
    throw new Error(
      [
        '未找到预期的 GitHub Actions 前端测试步骤。',
        '为避免错误修改，脚本已停止。',
        '',
        '预期内容：',
        oldWorkflowStep,
      ].join('\n'),
    )
  }

  await writeFile(
    workflowPath,
    workflow.replace(oldWorkflowStep, newWorkflowStep),
    'utf8',
  )

  console.log('已更新：.github/workflows/quality.yml')
  return true
}

async function main() {
  console.log(`仓库根目录：${root}\n`)

  const packageChanged = await updatePackageJson()
  const workflowChanged = await updateWorkflow()

  if (!packageChanged && !workflowChanged) {
    console.log('\n无需修改，质量检查入口已经是最新配置。')
    return
  }

  console.log('\n修改完成。请继续执行：')
  console.log('pnpm format')
  console.log('pnpm format:check')
  console.log('pnpm test:frontend')
}

main().catch((error) => {
  console.error('\n修改失败：')
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})