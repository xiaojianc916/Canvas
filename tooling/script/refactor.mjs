// scripts/cleanup-unused-select-and-combobox-search.mjs

import {
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()

const paths = {
  combobox: resolve(
    root,
    'foundations/design-system/src/components/ui/combobox.tsx',
  ),
  select: resolve(
    root,
    'foundations/design-system/src/components/ui/select.tsx',
  ),
  publicApi: resolve(
    root,
    'foundations/design-system/src/public-api.ts',
  ),
  settingsDialog: resolve(
    root,
    'features/settings/src/presentation/SettingsDialog.tsx',
  ),
}

const ignoredDirectories = new Set([
  '.git',
  '.turbo',
  'dist',
  'node_modules',
  'target',
])

async function collectSourceFiles(directory, result = []) {
  const entries = await readdir(directory)

  for (const entry of entries) {
    if (ignoredDirectories.has(entry)) {
      continue
    }

    const path = resolve(directory, entry)
    const fileStat = await stat(path)

    if (fileStat.isDirectory()) {
      await collectSourceFiles(path, result)
      continue
    }

    if (
      path.endsWith('.ts') ||
      path.endsWith('.tsx') ||
      path.endsWith('.mts') ||
      path.endsWith('.mjs')
    ) {
      result.push(path)
    }
  }

  return result
}

function removeSection(source, startMarker, endMarker, description) {
  const startIndex = source.indexOf(startMarker)
  const endIndex = source.indexOf(endMarker)

  if (startIndex === -1) {
    console.log(`跳过：没有找到${description}。`)
    return source
  }

  if (endIndex === -1 || endIndex <= startIndex) {
    throw new Error(`无法确定${description}的结束位置。`)
  }

  return (
    source.slice(0, startIndex) +
    source.slice(endIndex)
  )
}

async function findUsages(files, pattern, excludedFiles) {
  const usages = []

  for (const file of files) {
    if (excludedFiles.has(file)) {
      continue
    }

    const source = await readFile(file, 'utf8')

    if (pattern.test(source)) {
      usages.push(relative(root, file))
    }
  }

  return usages
}

const sourceFiles = await collectSourceFiles(root)

const settingsSource = await readFile(paths.settingsDialog, 'utf8')

if (
  settingsSource.includes('<ComboboxInput') ||
  settingsSource.includes('<ComboboxEmpty')
) {
  throw new Error(
    '设置页中仍然存在 ComboboxInput 或 ComboboxEmpty，请先运行之前的删除脚本。',
  )
}

const comboboxSearchUsages = await findUsages(
  sourceFiles,
  /\bCombobox(?:Input|Empty)\b/,
  new Set([
    paths.combobox,
    paths.publicApi,
  ]),
)

let comboboxSource = await readFile(paths.combobox, 'utf8')
let publicApiSource = await readFile(paths.publicApi, 'utf8')

if (comboboxSearchUsages.length === 0) {
  comboboxSource = removeSection(
    comboboxSource,
    'export type ComboboxInputProps',
    'export type ComboboxEmptyProps',
    'ComboboxInput',
  )

  comboboxSource = removeSection(
    comboboxSource,
    'export type ComboboxEmptyProps',
    'export type ComboboxListProps',
    'ComboboxEmpty',
  )

  comboboxSource = comboboxSource.replace(
    `import { CheckIcon, ChevronsUpDownIcon, SearchIcon } from 'lucide-react'`,
    `import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react'`,
  )

  publicApiSource = publicApiSource
    .replace(`  ComboboxEmpty,\n`, '')
    .replace(`  type ComboboxEmptyProps,\n`, '')
    .replace(`  ComboboxInput,\n`, '')
    .replace(`  type ComboboxInputProps,\n`, '')

  await writeFile(paths.combobox, comboboxSource, 'utf8')

  console.log('已删除：ComboboxInput')
  console.log('已删除：ComboboxEmpty')
  console.log('已删除：SearchIcon 导入')
  console.log('已删除：对应的公共导出')
} else {
  console.log('未删除 ComboboxInput/ComboboxEmpty，以下文件仍在使用：')

  for (const usage of comboboxSearchUsages) {
    console.log(`- ${usage}`)
  }
}

const selectUsages = await findUsages(
  sourceFiles,
  /<Select(?:\s|>)/,
  new Set([
    paths.select,
    paths.publicApi,
  ]),
)

if (selectUsages.length === 0) {
  await rm(paths.select, {
    force: true,
  })

  publicApiSource = publicApiSource.replace(
    `export { Select, type SelectProps } from './components/ui/select'\n`,
    '',
  )

  console.log('已删除：原生 Select 组件')
  console.log('已删除：Select 公共导出')
} else {
  console.log('未删除 Select，以下文件仍在使用：')

  for (const usage of selectUsages) {
    console.log(`- ${usage}`)
  }
}

await writeFile(paths.publicApi, publicApiSource, 'utf8')

console.log('')
console.log('清理完成。接下来执行：')
console.log('pnpm format')
console.log('pnpm lint')
console.log('pnpm typecheck')