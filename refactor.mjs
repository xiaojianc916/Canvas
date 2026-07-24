#!/usr/bin/env node

import {
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const filePath = path.join(
  process.cwd(),
  'editor/core/src/react/PropertiesInspectorContent.tsx',
)

let source = normalize(
  await readFile(
    filePath,
    'utf8',
  ),
)

source = extendCapabilitiesType(source)
source = extendCapabilitiesState(source)
source = extendArrangementSection(source)
source = addTextAutoSizeAction(source)

await writeFile(
  filePath,
  source.trimEnd() + '\n',
  'utf8',
)

console.log('')
console.log(
  '右侧属性侧边栏通用操作已补充。',
)
console.log('')
console.log('新增：')
console.log('  - 水平拉伸')
console.log('  - 垂直拉伸')
console.log('  - 水平堆叠')
console.log('  - 垂直堆叠')
console.log('  - 紧凑排列')
console.log('  - 恢复文本自动宽度')
console.log('')
console.log('验证：')
console.log('  pnpm format')
console.log('  pnpm lint')
console.log('  pnpm typecheck')
console.log('  pnpm test:architecture')
console.log('  pnpm build:desktop')
console.log('')

function extendCapabilitiesType(input) {
  if (
    input.includes(
      'readonly canStretch:',
    )
  ) {
    return input
  }

  const anchor = `  readonly canDistribute: boolean
  readonly canReorder: boolean`

  if (
    !input.includes(anchor)
  ) {
    throw new Error(
      '没有找到 SelectionCapabilities。',
    )
  }

  return input.replace(
    anchor,
    `  readonly canDistribute: boolean
  readonly canStretch: boolean
  readonly canStack: boolean
  readonly canPack: boolean
  readonly canArrange: boolean
  readonly canEnableTextAutoSize: boolean
  readonly canReorder: boolean`,
  )
}

function extendCapabilitiesState(input) {
  if (
    input.includes(
      'const stretchable =',
    )
  ) {
    return input
  }

  const rotatableAnchor = `        const rotatable =
          unlocked.filter(
            (shape) =>
              !editor
                .getShapeUtil(shape)
                .hideRotateHandle(
                  shape,
                ),
          )`

  if (
    !input.includes(
      rotatableAnchor,
    )
  ) {
    throw new Error(
      '没有找到 rotatable 能力计算。',
    )
  }

  const extraState = `${rotatableAnchor}

        const stretchable =
          unlocked.filter(
            (shape) =>
              editor
                .getShapeUtil(shape)
                .canBeLaidOut(
                  shape,
                  {
                    type: 'stretch',
                    shapes: unlocked,
                  },
                ),
          )

        const stackable =
          unlocked.filter(
            (shape) =>
              editor
                .getShapeUtil(shape)
                .canBeLaidOut(
                  shape,
                  {
                    type: 'stack',
                    shapes: unlocked,
                  },
                ),
          )

        const packable =
          unlocked.filter(
            (shape) =>
              editor
                .getShapeUtil(shape)
                .canBeLaidOut(
                  shape,
                  {
                    type: 'pack',
                    shapes: unlocked,
                  },
                ),
          )

        const canAlign =
          !readonly &&
          alignable.length >= 2

        const canDistribute =
          !readonly &&
          distributable.length >= 3

        const canStretch =
          !readonly &&
          unlocked.length >= 2 &&
          stretchable.length ===
            unlocked.length

        const canStack =
          !readonly &&
          unlocked.length >= 2 &&
          stackable.length ===
            unlocked.length

        const canPack =
          !readonly &&
          unlocked.length >= 2 &&
          packable.length ===
            unlocked.length

        const canEnableTextAutoSize =
          !readonly &&
          selected.some(
            (shape) =>
              editor.isShapeOfType(
                shape,
                'text',
              ) &&
              shape.props.autoSize ===
                false,
          )`

  input = input.replace(
    rotatableAnchor,
    extraState,
  )

  input = input.replace(
    `          canAlign:
            !readonly &&
            alignable.length >= 2,

          canDistribute:
            !readonly &&
            distributable.length >= 3,`,
    `          canAlign,

          canDistribute,

          canStretch,

          canStack,

          canPack,

          canArrange:
            canAlign ||
            canDistribute ||
            canStretch ||
            canStack ||
            canPack,

          canEnableTextAutoSize,`,
  )

  return input
}

function extendArrangementSection(input) {
  if (
    input.includes(
      'id="stretch-horizontal"',
    )
  ) {
    return input
  }

  input = input.replace(
    `{capabilities.canAlign ? (
        <SidebarSection
          title="排列"`,
    `{capabilities.canArrange ? (
        <SidebarSection
          title="排列"`,
  )

  const alignStart = `            <ActionButton
              actions={actions}
              id="align-left"
              label="左对齐"
            />`

  if (
    !input.includes(
      alignStart,
    )
  ) {
    throw new Error(
      '没有找到对齐操作。',
    )
  }

  input = input.replace(
    alignStart,
    `            {capabilities.canAlign ? (
              <>
                <ActionButton
                  actions={actions}
                  id="align-left"
                  label="左对齐"
                />`,
  )

  const alignEnd = `            <ActionButton
              actions={actions}
              id="align-bottom"
              label="底部对齐"
            />

            {capabilities.canDistribute ? (`

  if (
    !input.includes(
      alignEnd,
    )
  ) {
    throw new Error(
      '没有找到对齐操作结尾。',
    )
  }

  input = input.replace(
    alignEnd,
    `                <ActionButton
                  actions={actions}
                  id="align-bottom"
                  label="底部对齐"
                />
              </>
            ) : null}

            {capabilities.canDistribute ? (`,
  )

  const distributeEnd = `                <ActionButton
                  actions={actions}
                  id="distribute-vertical"
                  label="垂直分布"
                />
              </>
            ) : null}`

  if (
    !input.includes(
      distributeEnd,
    )
  ) {
    throw new Error(
      '没有找到分布操作结尾。',
    )
  }

  const additions = `${distributeEnd}

            {capabilities.canStretch ? (
              <>
                <ActionButton
                  actions={actions}
                  id="stretch-horizontal"
                  label="水平拉伸"
                />

                <ActionButton
                  actions={actions}
                  id="stretch-vertical"
                  label="垂直拉伸"
                />
              </>
            ) : null}

            {capabilities.canStack ? (
              <>
                <ActionButton
                  actions={actions}
                  id="stack-horizontal"
                  label="水平堆叠"
                />

                <ActionButton
                  actions={actions}
                  id="stack-vertical"
                  label="垂直堆叠"
                />
              </>
            ) : null}

            {capabilities.canPack ? (
              <ActionButton
                actions={actions}
                id="pack"
                label="紧凑排列"
              />
            ) : null}`

  return input.replace(
    distributeEnd,
    additions,
  )
}

function addTextAutoSizeAction(input) {
  if (
    input.includes(
      'label="恢复自动宽度"',
    )
  ) {
    return input
  }

  const rotateAnchor = `          {capabilities.canRotate ? (
            <>`

  if (
    !input.includes(
      rotateAnchor,
    )
  ) {
    throw new Error(
      '没有找到对象旋转操作。',
    )
  }

  const textAction = `          {capabilities.canEnableTextAutoSize ? (
            <ActionButton
              actions={actions}
              icon="toggle-on"
              id="toggle-auto-size"
              label="恢复自动宽度"
            />
          ) : null}

`

  return input.replace(
    rotateAnchor,
    textAction +
      rotateAnchor,
  )
}

function normalize(
  content,
) {
  return content.replaceAll(
    '\r\n',
    '\n',
  )
}