#!/usr/bin/env node

import {
  cp,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()

const appPath = resolve(
  root,
  'apps/desktop/src-tauri/src/bootstrap/app.rs',
)

const commandsModPath = resolve(
  root,
  'apps/desktop/src-tauri/src/commands/mod.rs',
)

const openerPath = resolve(
  root,
  'apps/desktop/src-tauri/src/commands/opener.rs',
)

function replaceOnce(
  content,
  oldText,
  newText,
  description,
) {
  const firstIndex = content.indexOf(oldText)

  if (firstIndex < 0) {
    throw new Error(
      `找不到待修改内容：${description}`,
    )
  }

  const secondIndex = content.indexOf(
    oldText,
    firstIndex + oldText.length,
  )

  if (secondIndex >= 0) {
    throw new Error(
      `待修改内容不唯一：${description}`,
    )
  }

  return (
    content.slice(0, firstIndex) +
    newText +
    content.slice(
      firstIndex + oldText.length,
    )
  )
}

async function main() {
  const [
    appContent,
    commandsModContent,
    openerContent,
  ] = await Promise.all([
    readFile(appPath, 'utf8'),
    readFile(commandsModPath, 'utf8'),
    readFile(openerPath, 'utf8'),
  ])

  const hasAssetModule =
    commandsModContent.includes(
      'pub mod asset;',
    )

  if (hasAssetModule) {
    throw new Error(
      [
        'commands/mod.rs 已声明 asset module。',
        '请检查是否已经开始实现原生 Asset command，',
        '不要自动删除有效注册。',
      ].join('\n'),
    )
  }

  const assetHandlerBlock = `            commands::asset::asset_store,
            commands::asset::asset_load,
            commands::asset::asset_delete,
            commands::asset::asset_list,
`

  let nextAppContent = appContent

  if (
    nextAppContent.includes(
      assetHandlerBlock,
    )
  ) {
    nextAppContent = replaceOnce(
      nextAppContent,
      assetHandlerBlock,
      '',
      '删除尚未激活的 Asset command 注册',
    )
  } else {
    console.log(
      'Asset command 注册已经不存在，跳过 app.rs。',
    )
  }

  let nextOpenerContent = openerContent

  if (
    nextOpenerContent.includes(
      'if let Some(parent) = path.parent() {',
    )
  ) {
    nextOpenerContent =
      nextOpenerContent.replace(
        'if let Some(parent) = path.parent() {',
        'if let Some(_parent) = path.parent() {',
      )

    nextOpenerContent =
      nextOpenerContent.replace(
        '.arg(parent).spawn()?;',
        '.arg(_parent).spawn()?;',
      )
  } else {
    console.log(
      'opener.rs 的 parent 警告可能已经修复，跳过。',
    )
  }

  const backupRoot = resolve(
    root,
    '.refactor-backup',
    new Date()
      .toISOString()
      .replaceAll(':', '-')
      .replaceAll('.', '-'),
  )

  await Promise.all([
    backup(appPath, backupRoot),
    backup(commandsModPath, backupRoot),
    backup(openerPath, backupRoot),
  ])

  await Promise.all([
    writeFile(
      appPath,
      nextAppContent,
      'utf8',
    ),
    writeFile(
      openerPath,
      nextOpenerContent,
      'utf8',
    ),
  ])

  console.log('')
  console.log('已完成：')
  console.log(
    '- 删除不存在的 Asset Tauri command 注册',
  )
  console.log(
    '- 保留 Asset native 预留脚手架',
  )
  console.log(
    '- 修复 opener.rs 条件编译产生的 unused variable 警告',
  )
  console.log('')
  console.log('接下来执行：')
  console.log('')
  console.log(
    '  cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml',
  )
  console.log(
    '  cargo check --workspace --all-targets --all-features',
  )
  console.log('  pnpm tauri dev')
  console.log('')
}

async function backup(
  sourcePath,
  backupRoot,
) {
  const relativePath = sourcePath
    .slice(root.length + 1)

  const targetPath = resolve(
    backupRoot,
    relativePath,
  )

  await mkdir(dirname(targetPath), {
    recursive: true,
  })

  await cp(sourcePath, targetPath)
}

main().catch((error) => {
  console.error('')
  console.error(
    'Tauri command 注册修复失败：',
  )
  console.error(error)
  process.exitCode = 1
})