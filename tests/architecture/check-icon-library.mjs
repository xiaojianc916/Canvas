#!/usr/bin/env node

import {
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

const root = resolve(process.cwd())

const allowedIconPackage = '@mynaui/icons-react'

const forbiddenExactPackages = new Set([
  'lucide-react',
  'react-icons',
  '@tabler/icons-react',
])

const forbiddenPackagePrefixes = [
  '@heroicons/',
]

const ignoredDirectories = new Set([
  '.git',
  '.turbo',
  '.vite',
  'coverage',
  'dist',
  'node_modules',
  'target',
])

const sourceExtensions = new Set([
  '.cjs',
  '.js',
  '.jsx',
  '.mjs',
  '.ts',
  '.tsx',
])

const violations = []

walk(root)

if (violations.length > 0) {
  console.error('检测到被禁止的产品图标库：')
  console.error('')

  for (const violation of violations) {
    console.error(
      '- ' +
        violation.file +
        ':' +
        String(violation.line) +
        ' -> ' +
        violation.packageName,
    )
  }

  console.error('')
  console.error(
    '产品 UI 只能直接使用 ' + allowedIconPackage + '。',
  )

  process.exit(1)
}

console.log('Icon library architecture check passed.')

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) {
      continue
    }

    const absolutePath = join(directory, entry)
    const stats = statSync(absolutePath)

    if (stats.isDirectory()) {
      walk(absolutePath)
      continue
    }

    if (entry === 'package.json') {
      inspectPackageJson(absolutePath)
      continue
    }

    if (sourceExtensions.has(extname(entry))) {
      inspectSourceFile(absolutePath)
    }
  }
}

function inspectPackageJson(file) {
  const json = parseJson(file)

  for (const sectionName of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    const section = json[sectionName]

    if (
      !section ||
      typeof section !== 'object' ||
      Array.isArray(section)
    ) {
      continue
    }

    for (const packageName of Object.keys(section)) {
      if (isForbiddenPackage(packageName)) {
        violations.push({
          file: relative(root, file),
          line: 1,
          packageName,
        })
      }
    }
  }
}

function inspectSourceFile(file) {
  const content = readFileSync(file, 'utf8')
  const lines = content.split(/\r?\n/)

  const importPatterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]

  for (const [lineIndex, line] of lines.entries()) {
    for (const pattern of importPatterns) {
      pattern.lastIndex = 0

      for (
        let match = pattern.exec(line);
        match;
        match = pattern.exec(line)
      ) {
        const packageName = match[1]

        if (isForbiddenPackage(packageName)) {
          violations.push({
            file: relative(root, file),
            line: lineIndex + 1,
            packageName,
          })
        }
      }
    }
  }
}

function isForbiddenPackage(packageName) {
  if (forbiddenExactPackages.has(packageName)) {
    return true
  }

  return forbiddenPackagePrefixes.some(
    (prefix) =>
      packageName === prefix.slice(0, -1) ||
      packageName.startsWith(prefix),
  )
}

function parseJson(file) {
  const content = readFileSync(file, 'utf8')
  const normalized =
    content.charCodeAt(0) === 0xfeff
      ? content.slice(1)
      : content

  try {
    return JSON.parse(normalized)
  } catch (error) {
    throw new Error(
      '无法解析 JSON：' +
        relative(root, file) +
        '\n' +
        String(error),
    )
  }
}
