#!/usr/bin/env node
/**
 * 将测试目录重构为仓库根目录下统一的 /tests 分类：
 *
 * tests/
 * ├── unit/
 * ├── integration/
 * ├── architecture/
 * ├── desktop-e2e/
 * ├── security/
 * └── release/
 *
 * 同时：
 * - 将原 cross-domain-contract 工作区提升为 tests 工作区；
 * - 修复 CanvasDocumentService 测试中忽略输入快照的低质量 fixture；
 * - 防止未来在 apps/editor/features/foundations/platforms 中散落 TS 测试文件。
 *
 * 用法：
 *   node scripts/refactor-tests.mjs
 */

import {
	access,
	mkdir,
	readFile,
	readdir,
	rename,
	rm,
	stat,
	writeFile,
} from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const testsRoot = join(root, 'tests')

const sourceRoots = ['apps', 'editor', 'features', 'foundations', 'platforms']
const ignoredDirectories = new Set([
	'.git',
	'.turbo',
	'build',
	'coverage',
	'dist',
	'node_modules',
	'target',
])

const testFilePattern = /\.(?:test|spec)\.[cm]?[jt]sx?$/

function repositoryPath(path) {
	return relative(root, path).replaceAll('\\', '/')
}

async function exists(path) {
	try {
		await access(path)
		return true
	} catch {
		return false
	}
}

async function ensureDirectory(path) {
	await mkdir(path, { recursive: true })
}

async function moveIfNeeded(from, to) {
	const sourceExists = await exists(from)
	const destinationExists = await exists(to)

	if (!sourceExists && destinationExists) {
		return
	}

	if (!sourceExists && !destinationExists) {
		throw new Error(`Expected source path does not exist: ${repositoryPath(from)}`)
	}

	if (sourceExists && destinationExists) {
		throw new Error(
			`Both source and destination exist; resolve manually:\n` +
				`  ${repositoryPath(from)}\n` +
				`  ${repositoryPath(to)}`,
		)
	}

	await ensureDirectory(dirname(to))
	await rename(from, to)

	console.log(`moved ${repositoryPath(from)} -> ${repositoryPath(to)}`)
}

async function removeIfEmpty(path) {
	if (!(await exists(path))) {
		return
	}

	const entries = await readdir(path)

	if (entries.length === 0) {
		await rm(path, { recursive: true })
		console.log(`removed empty directory ${repositoryPath(path)}`)
	}
}

async function findMisplacedTests(directory) {
	const misplaced = []

	async function walk(currentDirectory) {
		if (!(await exists(currentDirectory))) {
			return
		}

		for (const entry of await readdir(currentDirectory, {
			withFileTypes: true,
		})) {
			if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
				continue
			}

			const path = join(currentDirectory, entry.name)

			if (entry.isDirectory()) {
				await walk(path)
				continue
			}

			if (entry.isFile() && testFilePattern.test(entry.name)) {
				misplaced.push(repositoryPath(path))
			}
		}
	}

	await walk(directory)

	return misplaced
}

async function assertTestsAreCentralized() {
	const misplaced = []

	for (const sourceRoot of sourceRoots) {
		misplaced.push(...(await findMisplacedTests(join(root, sourceRoot))))
	}

	if (misplaced.length > 0) {
		throw new Error(
			[
				'Found TypeScript/JavaScript test files outside root /tests:',
				...misplaced.map((path) => `- ${path}`),
				'Move these tests to /tests and import only each package public API.',
			].join('\n'),
		)
	}
}

async function updateWorkspaceManifest() {
	const workspacePath = join(root, 'pnpm-workspace.yaml')
	const workspace = await readFile(workspacePath, 'utf8')

	if (workspace.includes('  - "tests/*"')) {
		const updated = workspace.replace('  - "tests/*"', '  - "tests"')
		await writeFile(workspacePath, updated)
		console.log('updated pnpm-workspace.yaml: tests/* -> tests')
	}
}

async function updateTestsPackage() {
	const packagePath = join(testsRoot, 'package.json')
	const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))

	const updated = {
		...packageJson,
		name: '@hybrid-canvas/tests',
		scripts: {
			check: 'tsc --project tsconfig.json --noEmit',
			typecheck: 'tsc --project tsconfig.json --noEmit',
			test: 'vitest run unit integration',
			'test:unit': 'vitest run unit',
			'test:integration': 'vitest run integration',
		},
	}

	await writeFile(packagePath, `${JSON.stringify(updated, null, 2)}\n`)
	console.log('updated tests/package.json')
}

async function replaceServiceFixture() {
	const path = join(
		testsRoot,
		'integration',
		'document-lifecycle',
		'canvas-document-service.test.ts',
	)

	let source = await readFile(path, 'utf8')

	const oldFixture = `function snapshot(documentValue: unknown): TLStoreSnapshot {
  void documentValue
  return validSnapshot()
}`

	const newFixture = `function snapshot(documentValue: Record<string, unknown>): TLStoreSnapshot {
  /*
   * Keep a valid tldraw snapshot as the base, then add serializable test
   * document state. The service only persists snapshots; this lets dirty/save
   * tests use genuinely different values instead of a fixture that silently
   * discards its input.
   */
  return {
    ...validSnapshot(),
    __testDocument: documentValue,
  } as unknown as TLStoreSnapshot
}`

	if (source.includes(oldFixture)) {
		source = source.replace(oldFixture, newFixture)

		source = source.replace(
			`const dirtySnapshot = {
      ...validSnapshot(),
      __testDocumentRevision: 'shape:1',
    } as unknown as TLStoreSnapshot`,
			`const dirtySnapshot = snapshot({
      revision: 'shape:1',
    })`,
		)

		await writeFile(path, source)
		console.log(
			'updated canvas-document-service.test.ts with a stateful snapshot fixture',
		)
	}
}

async function writeTestsReadme() {
	const readme = `# Tests

所有 TypeScript / JavaScript 测试必须位于仓库根目录的 \`tests/\` 下，
并且仅通过各包的公开 API（package export）访问被测代码。

## 目录约定

- \`unit/\`：单个模块或纯领域逻辑的快速测试。
- \`integration/\`：跨包协作、生命周期、持久化和 IPC 契约测试。
- \`architecture/\`：依赖方向、边界和公共 API 约束。
- \`desktop-e2e/\`：桌面端端到端与发布前手工验证材料。
- \`security/\`：安全边界、恶意输入和权限测试。
- \`release/\`：发布验证材料。

## 质量规则

- 测试名称描述长期行为或契约，不描述某一次修复或 Issue。
- 每个测试必须验证可观察结果、错误边界或不变量；禁止只验证 mock 调用而忽略结果。
- fixture 必须保留测试输入，禁止用 \`void input\` 丢弃参数后返回固定值。
- 失败、回滚、取消和恢复路径应与正常路径同等重要。
- 新增测试前先判断现有测试文件是否已覆盖同一长期契约；优先扩展现有测试，而不是创建一次性回归文件。

## 运行

\`\`\`bash
pnpm --filter @hybrid-canvas/tests test
pnpm --filter @hybrid-canvas/tests test:unit
pnpm --filter @hybrid-canvas/tests test:integration
pnpm test:architecture
pnpm test
\`\`\`
`

	await writeFile(join(testsRoot, 'README.md'), readme)
	console.log('rewrote tests/README.md')
}

async function main() {
	if (!(await exists(join(root, 'package.json')))) {
		throw new Error('Run this script from the repository root.')
	}

	/*
	 * 1. 把旧的“按历史命名”的 cross-domain-contract 工作区，转换成根 tests
	 *    工作区，测试本身按测试层级归类。
	 */
	await moveIfNeeded(
		join(testsRoot, 'cross-domain-contract', 'package.json'),
		join(testsRoot, 'package.json'),
	)
	await moveIfNeeded(
		join(testsRoot, 'cross-domain-contract', 'tsconfig.json'),
		join(testsRoot, 'tsconfig.json'),
	)

	await moveIfNeeded(
		join(testsRoot, 'cross-domain-contract', 'editor-session'),
		join(testsRoot, 'unit', 'editor-session'),
	)
	await moveIfNeeded(
		join(testsRoot, 'cross-domain-contract', 'document-lifecycle'),
		join(testsRoot, 'integration', 'document-lifecycle'),
	)

	/*
	 * 2. 删除旧目录及其仅描述旧分类的 README。
	 */
	await rm(join(testsRoot, 'cross-domain-contract', 'README.md'), {
		force: true,
	})
	await removeIfEmpty(join(testsRoot, 'cross-domain-contract'))

	/*
	 * 3. 把工作区与测试运行入口更新为新的根 tests 包。
	 */
	await updateWorkspaceManifest()
	await updateTestsPackage()

	/*
	 * 4. 清除已发现的“输入被丢弃”的 fixture，避免测试以固定快照掩盖状态问题。
	 */
	await replaceServiceFixture()
	await writeTestsReadme()

	/*
	 * 5. 拒绝未来将 JS/TS 测试散落到生产源目录。
	 *
	 * Rust 的 #[cfg(test)] 单元测试不在此规则内：它们由 Cargo 与 crate
	 * 私有实现共同编译，不能机械移动到 /tests 而不改变可见性和测试边界。
	 */
	await assertTestsAreCentralized()

	console.log('\nTest layout refactor completed successfully.')
}

main().catch((error) => {
	console.error(
		error instanceof Error
			? `Test layout refactor failed: ${error.message}`
			: error,
	)
	process.exitCode = 1
})