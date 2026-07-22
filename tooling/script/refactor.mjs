#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const root = resolve(process.cwd())
const apply = process.argv.includes('--apply')
const skipChecks = process.argv.includes('--skip-checks')

const paths = {
  tabs:
    'features/workspace/src/presentation/shell/WorkbenchTabs.tsx',
  styles:
    'features/workspace/src/presentation/shell/chrome-workbench-tabs.css',
}

const suppressionStart =
  '/* BEGIN DEACTIVATED TAB HOVER SUPPRESSION */'

const suppressionEnd =
  '/* END DEACTIVATED TAB HOVER SUPPRESSION */'

assertRepository()

if (!apply) {
  console.log('将直接修改标签 Hover 实现：')
  console.log('PATCH  ' + paths.tabs)
  console.log('PATCH  ' + paths.styles)
  console.log('')
  console.log('- 使用更浅的不透明纯色 Hover')
  console.log('- Hover 不显示边框')
  console.log('- 抑制标签失活后的 Hover 闪烁')
  console.log('- 鼠标离开后恢复正常 Hover')
  console.log('')
  console.log('使用 --apply 确认执行。')
  process.exit(0)
}

patchTabsComponent()
patchTabsStyles()

if (!skipChecks) {
  runChecks()
}

console.log('')
console.log('标签 Hover 颜色和切换闪烁已修复。')

function patchTabsComponent() {
  const absolutePath = join(
    root,
    paths.tabs,
  )

  const original = readFileSync(
    absolutePath,
    'utf8',
  )

  let updated = original

  updated = ensurePreviousActiveRef(
    updated,
  )

  updated = ensureHoverSuppressionEffect(
    updated,
  )

  updated = ensurePointerLeaveHandler(
    updated,
  )

  validateTabsComponent(updated)

  if (updated === original) {
    console.log(
      'SKIP   ' +
        paths.tabs +
        '（Hover 生命周期已经正确）',
    )
    return
  }

  atomicWrite(
    absolutePath,
    updated,
  )

  console.log('PATCH  ' + paths.tabs)
}

function ensurePreviousActiveRef(source) {
  if (
    source.includes(
      'previousActiveTabIdRef',
    )
  ) {
    return source
  }

  const anchor =
    'const activeTabId = tabs.find((tab) => tab.isActive)?.id'

  const count =
    source.split(anchor).length - 1

  if (count !== 1) {
    throw new Error(
      paths.tabs +
        ': activeTabId 应出现一次，实际出现 ' +
        String(count) +
        ' 次。',
    )
  }

  return source.replace(
    anchor,
    `${anchor}

  const previousActiveTabIdRef =
    useRef<WorkbenchTabId | undefined>(
      activeTabId,
    )`,
  )
}

function ensureHoverSuppressionEffect(
  source,
) {
  if (
    source.includes(
      "setAttribute('data-suppress-hover', 'true')",
    ) &&
    source.includes(
      "removeAttribute('data-suppress-hover')",
    )
  ) {
    return source
  }

  const scrollCall =
    'tabRefs.current.get(activeTabId)?.scrollIntoView'

  const scrollCallIndex =
    source.indexOf(scrollCall)

  if (scrollCallIndex < 0) {
    throw new Error(
      paths.tabs +
        ': 找不到活动标签 scrollIntoView。',
    )
  }

  const effectStart =
    source.lastIndexOf(
      '  useEffect(() => {',
      scrollCallIndex,
    )

  if (effectStart < 0) {
    throw new Error(
      paths.tabs +
        ': 找不到 scrollIntoView 所属 Effect。',
    )
  }

  const effect = String.raw`  useEffect(() => {
    const previousActiveTabId =
      previousActiveTabIdRef.current

    if (
      previousActiveTabId &&
      previousActiveTabId !== activeTabId
    ) {
      const previousActivation =
        tabRefs.current.get(
          previousActiveTabId,
        )

      const previousTab =
        previousActivation?.closest<HTMLElement>(
          '.chrome-workbench-tab',
        )

      /*
       * A browser may retain :hover on the element that just lost its
       * active appearance for one paint frame. Suppress that hover
       * until the pointer genuinely leaves the old tab.
       */
      if (previousTab?.matches(':hover')) {
        previousTab.setAttribute(
          'data-suppress-hover',
          'true',
        )
      }
    }

    if (activeTabId) {
      const activeActivation =
        tabRefs.current.get(activeTabId)

      const activeTab =
        activeActivation?.closest<HTMLElement>(
          '.chrome-workbench-tab',
        )

      activeTab?.removeAttribute(
        'data-suppress-hover',
      )
    }

    previousActiveTabIdRef.current =
      activeTabId
  }, [activeTabId])

`

  return (
    source.slice(0, effectStart) +
    effect +
    source.slice(effectStart)
  )
}

function ensurePointerLeaveHandler(
  source,
) {
  if (
    source.includes(
      "event.currentTarget.removeAttribute('data-suppress-hover')",
    )
  ) {
    return source
  }

  const anchor =
    '              onMouseDown={(event) => {'

  const count =
    source.split(anchor).length - 1

  if (count !== 1) {
    throw new Error(
      paths.tabs +
        ': 标签 onMouseDown 应出现一次，实际出现 ' +
        String(count) +
        ' 次。',
    )
  }

  return source.replace(
    anchor,
    `              onPointerLeave={(event) => {
                event.currentTarget.removeAttribute(
                  'data-suppress-hover',
                )
              }}
${anchor}`,
  )
}

function validateTabsComponent(source) {
  const required = [
    'previousActiveTabIdRef',
    "previousTab?.matches(':hover')",
    "previousTab.setAttribute(",
    "'data-suppress-hover'",
    "activeTab?.removeAttribute(",
    "event.currentTarget.removeAttribute(",
    'onPointerLeave={(event) => {',
  ]

  for (const token of required) {
    if (!source.includes(token)) {
      throw new Error(
        paths.tabs +
          ': Hover 生命周期缺少必要结构：' +
          token,
      )
    }
  }

  const effectCount =
    source.match(
      /previousActiveTabIdRef\.current\s*=\s*activeTabId/g,
    )?.length ?? 0

  if (effectCount !== 1) {
    throw new Error(
      paths.tabs +
        ': 失活标签 Effect 应出现一次，实际出现 ' +
        String(effectCount) +
        ' 次。',
    )
  }

  const leaveCount =
    source.match(
      /onPointerLeave=\{\(event\)\s*=>/g,
    )?.length ?? 0

  if (leaveCount !== 1) {
    throw new Error(
      paths.tabs +
        ': pointerleave 处理器应出现一次，实际出现 ' +
        String(leaveCount) +
        ' 次。',
    )
  }
}

function patchTabsStyles() {
  const absolutePath = join(
    root,
    paths.styles,
  )

  const original = readFileSync(
    absolutePath,
    'utf8',
  )

  let updated = original

  /*
   * Opaque light hover color:
   * both inputs are opaque, so the result is a solid color rather
   * than a transparent overlay.
   */
  updated = upsertCustomProperty(
    updated,
    '--chrome-tab-hover',
    `color-mix(
    in srgb,
    var(--color-foreground) 4%,
    var(--chrome-tab-strip) 96%
  )`,
    '--chrome-tab-strip',
  )

  /*
   * Keep existing geometry stable but make the hover border entirely
   * invisible. No border color is shown during hover.
   */
  updated = upsertCustomProperty(
    updated,
    '--chrome-tab-hover-border',
    'transparent',
    '--chrome-tab-hover',
  )

  updated = upsertSuppressionBlock(
    updated,
  )

  validateStyles(updated)

  if (updated === original) {
    console.log(
      'SKIP   ' +
        paths.styles +
        '（Hover 样式已经正确）',
    )
    return
  }

  atomicWrite(
    absolutePath,
    updated,
  )

  console.log('PATCH  ' + paths.styles)
}

function upsertCustomProperty(
  source,
  propertyName,
  propertyValue,
  insertAfterProperty,
) {
  const propertyStart =
    source.indexOf(propertyName + ':')

  if (propertyStart >= 0) {
    const propertyEnd =
      findCustomPropertyEnd(
        source,
        propertyStart,
      )

    const indentation =
      getLineIndentation(
        source,
        propertyStart,
      )

    const replacement =
      propertyName +
      ': ' +
      indentMultilineValue(
        propertyValue,
        indentation,
      ) +
      ';'

    return (
      source.slice(0, propertyStart) +
      replacement +
      source.slice(propertyEnd + 1)
    )
  }

  const insertStart =
    source.indexOf(
      insertAfterProperty + ':',
    )

  if (insertStart < 0) {
    throw new Error(
      paths.styles +
        ': 找不到属性插入位置 ' +
        insertAfterProperty,
    )
  }

  const insertEnd =
    findCustomPropertyEnd(
      source,
      insertStart,
    )

  const indentation =
    getLineIndentation(
      source,
      insertStart,
    )

  const declaration =
    '\n' +
    indentation +
    propertyName +
    ': ' +
    indentMultilineValue(
      propertyValue,
      indentation,
    ) +
    ';'

  return (
    source.slice(0, insertEnd + 1) +
    declaration +
    source.slice(insertEnd + 1)
  )
}

function findCustomPropertyEnd(
  source,
  start,
) {
  let parenthesisDepth = 0

  for (
    let index = start;
    index < source.length;
    index += 1
  ) {
    const character = source[index]

    if (character === '(') {
      parenthesisDepth += 1
      continue
    }

    if (character === ')') {
      parenthesisDepth -= 1
      continue
    }

    if (
      character === ';' &&
      parenthesisDepth === 0
    ) {
      return index
    }
  }

  throw new Error(
    paths.styles +
      ': CSS 自定义属性缺少结束分号。',
  )
}

function getLineIndentation(
  source,
  index,
) {
  const lineStart =
    source.lastIndexOf('\n', index) + 1

  return source
    .slice(lineStart, index)
    .match(/^\s*/)?.[0] ?? ''
}

function indentMultilineValue(
  value,
  indentation,
) {
  return value.replaceAll(
    '\n',
    '\n' + indentation,
  )
}

function upsertSuppressionBlock(source) {
  const block = String.raw`${suppressionStart}

/*
 * The old active tab may retain browser :hover for one paint frame
 * after activation moves to another tab. During that transient state,
 * show no hover fill and perform no background transition.
 */
.chrome-workbench-tab[
    data-suppress-hover="true"
  ]:not(
    [data-active="true"]
  )
  .chrome-workbench-tab__content,
.chrome-workbench-tab:hover[
    data-suppress-hover="true"
  ]:not(
    [data-active="true"]
  )
  .chrome-workbench-tab__content {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
  transition: none;
}

/*
 * The normal inactive hover is fill-only:
 * no visible border, shadow or gradient.
 */
.chrome-workbench-tab:hover:not(
    [data-active="true"]
  ):not(
    [data-suppress-hover="true"]
  )
  .chrome-workbench-tab__content {
  border-color: transparent;
  background: var(--chrome-tab-hover);
  box-shadow: none;
}

${suppressionEnd}`

  const start =
    source.indexOf(suppressionStart)

  const end =
    source.indexOf(suppressionEnd)

  if (start < 0 && end < 0) {
    return (
      source.trimEnd() +
      '\n\n' +
      block +
      '\n'
    )
  }

  if (
    start < 0 ||
    end < 0 ||
    end < start
  ) {
    throw new Error(
      paths.styles +
        ': Hover 抑制样式标记不完整。',
    )
  }

  return (
    source.slice(0, start) +
    block +
    source.slice(
      end + suppressionEnd.length,
    )
  )
}

function validateStyles(source) {
  const required = [
    '--chrome-tab-hover:',
    'var(--color-foreground) 4%',
    'var(--chrome-tab-strip) 96%',
    '--chrome-tab-hover-border: transparent;',
    suppressionStart,
    suppressionEnd,
    'data-suppress-hover="true"',
    'background: transparent;',
    'background: var(--chrome-tab-hover);',
    'border-color: transparent;',
    'box-shadow: none;',
  ]

  for (const token of required) {
    if (!source.includes(token)) {
      throw new Error(
        paths.styles +
          ': Hover 样式缺少必要结构：' +
          token,
      )
    }
  }

  const startCount =
    source.split(suppressionStart).length -
    1

  const endCount =
    source.split(suppressionEnd).length - 1

  if (
    startCount !== 1 ||
    endCount !== 1
  ) {
    throw new Error(
      paths.styles +
        ': Hover 抑制样式块数量异常。',
    )
  }
}

function runChecks() {
  run('pnpm', [
    'exec',
    'biome',
    'format',
    '--write',
    paths.tabs,
    paths.styles,
  ])

  run('pnpm', [
    '--filter',
    '@hybrid-canvas/workspace',
    'typecheck',
  ])

  run('pnpm', [
    '--filter',
    '@hybrid-canvas/workspace',
    'test',
  ])

  run('pnpm', [
    '--filter',
    '@hybrid-canvas/desktop',
    'typecheck',
  ])

  run('node', [
    'tests/architecture/check-ui-architecture.mjs',
  ])
}

function assertRepository() {
  const packagePath = join(
    root,
    'package.json',
  )

  if (!existsSync(packagePath)) {
    throw new Error(
      '请在 hybrid-canvas 仓库根目录执行脚本。',
    )
  }

  const manifest = JSON.parse(
    readFileSync(packagePath, 'utf8'),
  )

  if (manifest.name !== 'hybrid-canvas') {
    throw new Error(
      '当前目录不是 hybrid-canvas 仓库。',
    )
  }

  for (const path of Object.values(paths)) {
    if (!existsSync(join(root, path))) {
      throw new Error(
        '缺少目标文件：' + path,
      )
    }
  }
}

function atomicWrite(
  destination,
  content,
) {
  const temporary =
    destination +
    '.tmp-' +
    process.pid +
    '-' +
    Date.now()

  writeFileSync(
    temporary,
    normalize(content),
    'utf8',
  )

  renameSync(
    temporary,
    destination,
  )
}

function normalize(content) {
  return (
    content
      .replaceAll('\r\n', '\n')
      .trimStart() + '\n'
  )
}

function run(command, args) {
  console.log('')
  console.log(
    'RUN    ' +
      command +
      ' ' +
      args.join(' '),
  )

  const needsWindowsShell =
    process.platform === 'win32' &&
    command === 'pnpm'

  execFileSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: needsWindowsShell,
  })
}