import {
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()

const paths = {
  transformGeometry: path.join(
    ROOT,
    'editor/core/src/react/selection-transform-geometry.ts',
  ),
  transformStatus: path.join(
    ROOT,
    'editor/core/src/react/CanvasTransformStatus.tsx',
  ),
  propertiesInspector: path.join(
    ROOT,
    'editor/core/src/react/PropertiesInspectorContent.tsx',
  ),
}

await writeTransformGeometry()
await updateTransformStatus()
await updatePropertiesInspector()

console.log('')
console.log('V13 重构完成：')
console.log('- 修正 Transform 页面空间与父级局部空间语义')
console.log('- 共同旋转选择使用旋转包围盒')
console.log('- 混合旋转禁用不明确的 W/H/R 绝对编辑')
console.log('- Resize 使用官方 ShapeUtil 与 resizeShape')
console.log('- Rotation 使用官方 rotateShapesBy')
console.log('- Transform 修改进入 Editor History')
console.log('- 增加 Embed / Bookmark 官方对象操作')
console.log('- 增加官方水平、垂直翻转')
console.log('- 多选能力改为全选一致，不再静默处理部分对象')
console.log('- mixed 值改用 tldraw 官方 mixed 图标')
console.log('')
console.log('请运行：')
console.log('  pnpm format')
console.log('  pnpm lint')
console.log('  pnpm typecheck')
console.log('  pnpm test:architecture')
console.log('')

async function writeTransformGeometry() {
  const source = `import {
  type Editor,
  kickoutOccludedShapes,
  type TLShape,
  type TLShapePartial,
  Vec,
} from 'tldraw'

export type SelectionTransformField =
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'rotation'

export interface SelectionTransformSnapshot {
  readonly selectionKey: string
  readonly count: number
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly rotation: number | null
  readonly isReadonly: boolean
  readonly hasLockedShape: boolean
  readonly hasMixedRotation: boolean
  readonly canMove: boolean
  readonly canResize: boolean
  readonly canRotate: boolean
  readonly hasForcedAspectRatio: boolean
}

interface DerivedSelectionGeometry {
  readonly snapshot: SelectionTransformSnapshot
  readonly shapes: readonly TLShape[]
  readonly bounds: {
    readonly x: number
    readonly y: number
    readonly w: number
    readonly h: number
    readonly point: {
      readonly x: number
      readonly y: number
    }
  }
  readonly sharedRotation: number | null
}

export interface CommitSelectionTransformOptions {
  readonly editor: Editor
  readonly field: SelectionTransformField
  readonly value: number
  readonly isAspectRatioLocked: boolean
}

const EPSILON = 0.000001
const MINIMUM_SIZE = 0.01

export function getSelectionTransformSnapshot(
  editor: Editor,
): SelectionTransformSnapshot | null {
  return deriveSelectionGeometry(editor)?.snapshot ?? null
}

export function commitSelectionTransform({
  editor,
  field,
  value,
  isAspectRatioLocked,
}: CommitSelectionTransformOptions): boolean {
  if (!Number.isFinite(value)) {
    return false
  }

  const geometry = deriveSelectionGeometry(editor)

  if (!geometry) {
    return false
  }

  switch (field) {
    case 'x':
    case 'y':
      return commitSelectionPosition(
        editor,
        geometry,
        field,
        value,
      )

    case 'width':
    case 'height':
      return commitSelectionSize(
        editor,
        geometry,
        field,
        value,
        isAspectRatioLocked,
      )

    case 'rotation':
      return commitSelectionRotation(
        editor,
        geometry,
        value,
      )
  }
}

function deriveSelectionGeometry(
  editor: Editor,
): DerivedSelectionGeometry | null {
  const shapes = editor.getSelectedShapes()

  if (shapes.length === 0) {
    return null
  }

  const pageBounds = editor.getSelectionPageBounds()

  if (!pageBounds) {
    return null
  }

  const rotations = shapes.map((shape) => {
    return (
      editor
        .getShapePageTransform(shape)
        ?.rotation() ?? 0
    )
  })

  const firstRotation =
    rotations[0] ?? 0

  const hasMixedRotation = rotations.some(
    (rotation) =>
      Math.abs(
        normalizeRadians(
          rotation - firstRotation,
        ),
      ) > EPSILON,
  )

  const sharedRotation = hasMixedRotation
    ? null
    : firstRotation

  /*
   * 只有具有共同页面旋转时，旋转包围盒才具有明确的
   * W/H 和左上角语义。
   *
   * 混合旋转时退回页面轴对齐包围盒，并禁用 W/H/R
   * 的绝对编辑，避免把 getSelectionRotation() 返回的
   * 0 错误解释为真实共同旋转。
   */
  const rotatedBounds = !hasMixedRotation
    ? editor.getSelectionRotatedPageBounds()
    : undefined

  const bounds =
    rotatedBounds ?? pageBounds

  const isReadonly =
    editor.getIsReadonly()

  const hasLockedShape =
    shapes.some((shape) => shape.isLocked)

  const allUnlocked =
    shapes.every((shape) => !shape.isLocked)

  const allResizable = shapes.every(
    (shape) => {
      const util =
        editor.getShapeUtil(shape)

      return (
        util.canResize(shape) &&
        util.canBeLaidOut(shape, {
          type: 'resize_to_bounds',
          shapes,
        })
      )
    },
  )

  const allRotatable = shapes.every(
    (shape) =>
      !editor
        .getShapeUtil(shape)
        .hideRotateHandle(shape),
  )

  const hasForcedAspectRatio =
    shapes.some((shape) =>
      editor
        .getShapeUtil(shape)
        .isAspectRatioLocked(shape),
    )

  const canMove =
    !isReadonly &&
    allUnlocked

  /*
   * 混合旋转选择没有唯一的局部 X/Y 轴。
   * 在实现完整的每对象矩阵编辑器之前，不允许用一个
   * W/H 数值对混合旋转对象进行非一致缩放。
   */
  const canResize =
    canMove &&
    !hasMixedRotation &&
    allResizable &&
    bounds.w > EPSILON &&
    bounds.h > EPSILON

  /*
   * rotateShapesBy 支持混合旋转的相对旋转，
   * 但底部 R 字段表达的是绝对角度。
   * 混合值没有唯一绝对角度，因此禁止编辑。
   */
  const canRotate =
    canMove &&
    !hasMixedRotation &&
    allRotatable

  return {
    shapes,
    bounds,
    sharedRotation,
    snapshot: {
      selectionKey: editor
        .getSelectedShapeIds()
        .join('|'),
      count: shapes.length,
      x: bounds.x,
      y: bounds.y,
      width: bounds.w,
      height: bounds.h,
      rotation: hasMixedRotation
        ? null
        : normalizeDegrees(
            radiansToDegrees(
              sharedRotation ?? 0,
            ),
          ),
      isReadonly,
      hasLockedShape,
      hasMixedRotation,
      canMove,
      canResize,
      canRotate,
      hasForcedAspectRatio,
    },
  }
}

function commitSelectionPosition(
  editor: Editor,
  geometry: DerivedSelectionGeometry,
  field: 'x' | 'y',
  value: number,
): boolean {
  if (!geometry.snapshot.canMove) {
    return false
  }

  const deltaPage = new Vec(
    field === 'x'
      ? value - geometry.bounds.x
      : 0,
    field === 'y'
      ? value - geometry.bounds.y
      : 0,
  )

  if (
    Math.abs(deltaPage.x) < EPSILON &&
    Math.abs(deltaPage.y) < EPSILON
  ) {
    return false
  }

  const updates: TLShapePartial[] =
    geometry.shapes.map((shape) => {
      /*
       * shape.x / shape.y 属于父级局部坐标。
       * 状态栏 X/Y 属于页面坐标。
       *
       * 当父级 Frame/Group 发生旋转时，必须把页面空间
       * delta 反向旋转到父级局部空间。
       */
      const localDelta =
        deltaPage.clone()

      const parent =
        editor.getShapeParent(shape)

      if (parent) {
        const parentTransform =
          editor.getShapePageTransform(parent)

        if (parentTransform) {
          localDelta.rot(
            -parentTransform.rotation(),
          )
        }
      }

      return {
        id: shape.id,
        type: shape.type,
        x: shape.x + localDelta.x,
        y: shape.y + localDelta.y,
      }
    })

  editor.markHistoryStoppingPoint(
    'edit selection position from status bar',
  )

  editor.run(() => {
    editor.updateShapes(updates)

    kickoutOccludedShapes(
      editor,
      geometry.shapes.map(
        (shape) => shape.id,
      ),
    )
  })

  return true
}

function commitSelectionSize(
  editor: Editor,
  geometry: DerivedSelectionGeometry,
  field: 'width' | 'height',
  value: number,
  isAspectRatioLocked: boolean,
): boolean {
  if (!geometry.snapshot.canResize) {
    return false
  }

  const targetValue =
    Math.max(value, MINIMUM_SIZE)

  const forcedRatio =
    geometry.snapshot
      .hasForcedAspectRatio

  const keepRatio =
    forcedRatio ||
    isAspectRatioLocked

  let scaleX = 1
  let scaleY = 1

  if (field === 'width') {
    scaleX =
      targetValue /
      geometry.bounds.w

    if (keepRatio) {
      scaleY = scaleX
    }
  } else {
    scaleY =
      targetValue /
      geometry.bounds.h

    if (keepRatio) {
      scaleX = scaleY
    }
  }

  if (
    !Number.isFinite(scaleX) ||
    !Number.isFinite(scaleY) ||
    scaleX <= 0 ||
    scaleY <= 0
  ) {
    return false
  }

  if (
    Math.abs(scaleX - 1) < EPSILON &&
    Math.abs(scaleY - 1) < EPSILON
  ) {
    return false
  }

  editor.markHistoryStoppingPoint(
    'edit selection size from status bar',
  )

  editor.run(() => {
    for (
      const shape of geometry.shapes
    ) {
      /*
       * resizeShape 是官方 ShapeUtil resize 入口：
       * - 调用 ShapeUtil resize 生命周期；
       * - 尊重父级坐标系；
       * - 尊重自定义 ShapeUtil；
       * - 避免直接猜测 props.w / props.h。
       *
       * scaleAxisRotation 使用选择共同页面旋转，
       * scaleOrigin 使用旋转包围盒左上角。
       */
      editor.resizeShape(
        shape.id,
        new Vec(scaleX, scaleY),
        {
          scaleOrigin:
            geometry.bounds.point,
          scaleAxisRotation:
            geometry.sharedRotation ?? 0,
          isAspectRatioLocked:
            keepRatio,
          mode: 'scale_shape',
        },
      )
    }

    kickoutOccludedShapes(
      editor,
      geometry.shapes.map(
        (shape) => shape.id,
      ),
    )
  })

  return true
}

function commitSelectionRotation(
  editor: Editor,
  geometry: DerivedSelectionGeometry,
  targetDegrees: number,
): boolean {
  if (
    !geometry.snapshot.canRotate ||
    geometry.snapshot.rotation === null
  ) {
    return false
  }

  const targetRadians =
    degreesToRadians(targetDegrees)

  const currentRadians =
    geometry.sharedRotation ?? 0

  const delta = normalizeRadians(
    targetRadians - currentRadians,
  )

  if (Math.abs(delta) < EPSILON) {
    return false
  }

  editor.markHistoryStoppingPoint(
    'edit selection rotation from status bar',
  )

  editor.run(() => {
    editor.rotateShapesBy(
      geometry.shapes.map(
        (shape) => shape.id,
      ),
      delta,
    )

    kickoutOccludedShapes(
      editor,
      geometry.shapes.map(
        (shape) => shape.id,
      ),
    )
  })

  return true
}

function radiansToDegrees(
  radians: number,
): number {
  return radians * 180 / Math.PI
}

function degreesToRadians(
  degrees: number,
): number {
  return degrees * Math.PI / 180
}

function normalizeDegrees(
  degrees: number,
): number {
  const normalized =
    (
      (
        degrees % 360
      ) +
      360
    ) %
    360

  return Math.abs(
    normalized - 360,
  ) < EPSILON
    ? 0
    : normalized
}

function normalizeRadians(
  radians: number,
): number {
  const fullTurn =
    Math.PI * 2

  const normalized =
    (
      (
        (
          radians + Math.PI
        ) %
        fullTurn
      ) +
      fullTurn
    ) %
      fullTurn -
    Math.PI

  return Object.is(normalized, -0)
    ? 0
    : normalized
}
`

  await writeFile(
    paths.transformGeometry,
    source,
    'utf8',
  )
}

async function updateTransformStatus() {
  let source = await readFile(
    paths.transformStatus,
    'utf8',
  )

  /*
   * 引入正式的 Transform 几何适配层。
   */
  if (
    !source.includes(
      "from './selection-transform-geometry'",
    )
  ) {
    const importAnchor =
      "import { useEditor } from './editor-context'"

    assertIncludes(
      source,
      importAnchor,
      'CanvasTransformStatus editor-context import',
    )

    source = source.replace(
      importAnchor,
      `${importAnchor}
import {
  commitSelectionTransform,
  getSelectionTransformSnapshot,
  type SelectionTransformField,
  type SelectionTransformSnapshot,
} from './selection-transform-geometry'`,
    )
  }

  /*
   * 使用 adapter 提供的字段类型。
   */
  source = source.replace(
    /type TransformFieldId\s*=\s*[\s\S]*?\n\nconst TRANSFORM_FIELDS/,
    `type TransformFieldId =
  SelectionTransformField

const TRANSFORM_FIELDS`,
  )

  /*
   * 删除旧的本地 snapshot interface。
   */
  source = source.replace(
    /\ninterface SelectionTransformSnapshot\s*\{[\s\S]*?\n\}\n\n(?=export function CanvasTransformStatus)/,
    '\n',
  )

  /*
   * 兼容早期名称 SelectionTransformSnapshot。
   */
  source = source.replace(
    /\ninterface SelectionGeometry\s*\{[\s\S]*?\n\}\n\n(?=export function CanvasTransformStatus)/,
    '\n',
  )

  /*
   * 替换 useValue 内部的旧几何推导。
   */
  source = replaceSection(
    source,
    '  const snapshot = useValue(',
    '\n\n  useEffect(',
    `  const snapshot = useValue(
    'canvas transform status',
    () => {
      if (!editor) {
        return null
      }

      return getSelectionTransformSnapshot(
        editor,
      )
    },
    [editor],
  )`,
  )

  /*
   * 替换旧 commitTransform。
   */
  source = replaceSection(
    source,
    '  const commitTransform = (',
    '\n\n  const navigateField =',
    `  const commitTransform = (
    field: TransformFieldId,
    value: number,
  ) => {
    if (!editor || !snapshot) {
      return
    }

    commitSelectionTransform({
      editor,
      field,
      value,
      isAspectRatioLocked,
    })
  }`,
  )

  /*
   * rotation mixed 时 value 为 null。
   */
  source = source.replace(
    'readonly value: number\n',
    'readonly value: number | null\n',
  )

  source = source.replace(
    'const formattedValue = formatStatusNumber(value)',
    'const formattedValue = formatStatusNumber(value)',
  )

  /*
   * ArrowUp / ArrowDown 在 mixed/null 情况下从 0 开始，
   * 但 mixed 字段本身会被 disabled，正常不会进入这里。
   */
  source = source.replace(
    'parseDraft() ?? value',
    'parseDraft() ?? value ?? 0',
  )

  source = source.replace(
    /function formatStatusNumber\(\s*value:\s*number,\s*\)/,
    `function formatStatusNumber(
  value: number | null,
)`,
  )

  source = source.replace(
    `  if (!Number.isFinite(value)) {
    return '0'
  }`,
    `  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return '—'
  }`,
  )

  /*
   * 混合旋转字段明确显示 mixed。
   */
  source = source.replace(
    `title="选择旋转角度"`,
    `title={
              snapshot.hasMixedRotation
                ? '多个旋转角度'
                : '选择旋转角度'
            }`,
  )

  if (
    source.includes(
      'editor.resizeToBounds',
    )
  ) {
    throw new Error(
      'CanvasTransformStatus 中仍存在旧 resizeToBounds 写入路径。',
    )
  }

  if (
    source.includes(
      'editor.rotateShapesBy',
    )
  ) {
    throw new Error(
      'CanvasTransformStatus 中仍存在绕过 adapter 的 rotation 写入。',
    )
  }

  await writeFile(
    paths.transformStatus,
    source,
    'utf8',
  )
}

async function updatePropertiesInspector() {
  let source = await readFile(
    paths.propertiesInspector,
    'utf8',
  )

  /*
   * 扩展对象专属 capability。
   */
  source = addInterfaceMembers(
    source,
    'interface SelectionCapabilities {',
    [
      '  readonly canFlip: boolean',
      '  readonly canOpenEmbedLink: boolean',
      '  readonly canConvertEmbedToBookmark: boolean',
      '  readonly canConvertBookmarkToEmbed: boolean',
    ],
  )

  const capabilityStart =
    source.indexOf(
      '  const selectionCapabilities =',
    )

  const capabilityEnd =
    source.indexOf(
      '\n\n  return (',
      capabilityStart,
    )

  if (
    capabilityStart === -1 ||
    capabilityEnd === -1
  ) {
    throw new Error(
      '找不到 SelectionCapabilities 推导区域。',
    )
  }

  const capabilitySource = `  const selectionCapabilities =
    useValue<SelectionCapabilities>(
      'right properties sidebar selection capabilities',
      () => {
        const selected =
          editor.getSelectedShapes()

        const readonly =
          editor.getIsReadonly()

        const hasSelection =
          selected.length > 0

        const allUnlocked =
          hasSelection &&
          selected.every(
            (shape) => !shape.isLocked,
          )

        /*
         * 多选操作采用 all-or-nothing。
         *
         * 不再过滤 locked 或 unsupported 对象后，
         * 静默地只处理选择中的一部分。
         */
        const everyCanLayout = (
          type:
            | 'align'
            | 'distribute'
            | 'stretch'
            | 'stack'
            | 'pack'
            | 'flip',
        ) =>
          allUnlocked &&
          selected.every((shape) =>
            editor
              .getShapeUtil(shape)
              .canBeLaidOut(shape, {
                type,
                shapes: selected,
              }),
          )

        const canAlign =
          !readonly &&
          selected.length >= 2 &&
          everyCanLayout('align')

        const canDistribute =
          !readonly &&
          selected.length >= 3 &&
          everyCanLayout('distribute')

        const canStretch =
          !readonly &&
          selected.length >= 2 &&
          everyCanLayout('stretch')

        const canStack =
          !readonly &&
          selected.length >= 2 &&
          everyCanLayout('stack')

        const canPack =
          !readonly &&
          selected.length >= 2 &&
          everyCanLayout('pack')

        const canFlip =
          !readonly &&
          hasSelection &&
          everyCanLayout('flip')

        const allRotatable =
          allUnlocked &&
          selected.every(
            (shape) =>
              !editor
                .getShapeUtil(shape)
                .hideRotateHandle(shape),
          )

        const canEnableTextAutoSize =
          !readonly &&
          allUnlocked &&
          selected.some(
            (shape) =>
              editor.isShapeOfType(
                shape,
                'text',
              ) &&
              shape.props.autoSize === false,
          )

        const onlySelected =
          editor.getOnlySelectedShape()

        const onlySelectedIsUnlocked =
          onlySelected !== null &&
          !onlySelected.isLocked

        const onlySelectedIsFrameLike =
          onlySelected
            ? editor.isShapeFrameLike(
                onlySelected,
              )
            : false

        const onlySelectedIsImage =
          onlySelected
            ? editor.isShapeOfType(
                onlySelected,
                'image',
              )
            : false

        const onlySelectedIsVideo =
          onlySelected
            ? editor.isShapeOfType(
                onlySelected,
                'video',
              )
            : false

        const onlySelectedIsEmbed =
          onlySelected
            ? editor.isShapeOfType(
                onlySelected,
                'embed',
              )
            : false

        const onlySelectedIsBookmark =
          onlySelected
            ? editor.isShapeOfType(
                onlySelected,
                'bookmark',
              )
            : false

        const onlySelectedHasUrl =
          onlySelected !== null &&
          'url' in onlySelected.props &&
          typeof onlySelected.props.url ===
            'string' &&
          onlySelected.props.url.length > 0

        const onlySelectedHasMediaAsset =
          onlySelected !== null &&
          'assetId' in onlySelected.props &&
          onlySelected.props.assetId !== null &&
          onlySelected.props.assetId !==
            undefined

        const canCropImage =
          !readonly &&
          onlySelectedIsUnlocked &&
          onlySelectedIsImage &&
          editor.canCropShape(onlySelected)

        return {
          canAlign,
          canDistribute,
          canStretch,
          canStack,
          canPack,
          canFlip,

          canArrange:
            canAlign ||
            canDistribute ||
            canStretch ||
            canStack ||
            canPack ||
            canFlip,

          canEnableTextAutoSize,

          canEditLink:
            !readonly &&
            onlySelectedIsUnlocked &&
            onlySelectedHasUrl,

          canOpenEmbedLink:
            onlySelectedIsEmbed &&
            onlySelectedHasUrl,

          canConvertEmbedToBookmark:
            !readonly &&
            onlySelectedIsUnlocked &&
            onlySelectedIsEmbed &&
            onlySelectedHasUrl,

          canConvertBookmarkToEmbed:
            !readonly &&
            onlySelectedIsUnlocked &&
            onlySelectedIsBookmark &&
            onlySelectedHasUrl,

          canFitFrame:
            !readonly &&
            onlySelectedIsUnlocked &&
            onlySelectedIsFrameLike,

          canRemoveFrame:
            !readonly &&
            onlySelectedIsUnlocked &&
            onlySelectedIsFrameLike,

          canReplaceImage:
            !readonly &&
            onlySelectedIsUnlocked &&
            onlySelectedIsImage,

          canReplaceVideo:
            !readonly &&
            onlySelectedIsUnlocked &&
            onlySelectedIsVideo,

          canDownloadMedia:
            (
              onlySelectedIsImage ||
              onlySelectedIsVideo
            ) &&
            onlySelectedHasMediaAsset,

          canCropImage,

          canToggleLock:
            !readonly &&
            hasSelection,

          canReorder:
            !readonly &&
            allUnlocked,

          canGroup:
            !readonly &&
            allUnlocked &&
            selected.length >= 2,

          canUngroup:
            !readonly &&
            onlySelectedIsUnlocked &&
            onlySelected?.type === 'group',

          canRotate:
            !readonly &&
            hasSelection &&
            allRotatable,

          canFrame:
            !readonly &&
            allUnlocked &&
            selected.length >= 2,

          canDuplicate:
            !readonly &&
            hasSelection,

          canDelete:
            !readonly &&
            allUnlocked,
        }
      },
      [editor],
    )`

  source =
    source.slice(0, capabilityStart) +
    capabilitySource +
    source.slice(capabilityEnd)

  /*
   * 排列区增加官方翻转 actions。
   */
  const arrangeAnchor = `            {capabilities.canPack ? (
              <ActionButton actions={actions} id="pack" label="紧凑排列" />
            ) : null}`

  assertIncludes(
    source,
    arrangeAnchor,
    '排列区 pack action',
  )

  source = source.replace(
    arrangeAnchor,
    `${arrangeAnchor}

            {capabilities.canFlip ? (
              <>
                <ActionButton
                  actions={actions}
                  icon="chevrons-ne"
                  id="flip-horizontal"
                  label="水平翻转"
                />

                <ActionButton
                  actions={actions}
                  icon="chevrons-sw"
                  id="flip-vertical"
                  label="垂直翻转"
                />
              </>
            ) : null}`,
  )

  /*
   * 对象区增加 Embed / Bookmark 官方动作。
   */
  const linkAnchor = `          {capabilities.canEditLink ? (
            <ActionButton actions={actions} id="edit-link" label="编辑链接" />
          ) : null}`

  assertIncludes(
    source,
    linkAnchor,
    '对象区 edit-link action',
  )

  source = source.replace(
    linkAnchor,
    `${linkAnchor}

          {capabilities.canOpenEmbedLink ? (
            <ActionButton
              actions={actions}
              icon="external-link"
              id="open-embed-link"
              label="打开嵌入链接"
            />
          ) : null}

          {capabilities.canConvertEmbedToBookmark ? (
            <ActionButton
              actions={actions}
              icon="bookmark"
              id="convert-to-bookmark"
              label="转换为书签"
            />
          ) : null}

          {capabilities.canConvertBookmarkToEmbed ? (
            <ActionButton
              actions={actions}
              icon="external-link"
              id="convert-to-embed"
              label="转换为嵌入"
            />
          ) : null}`,
  )

  /*
   * mixed 不再用普通破折号，改用 tldraw 官方 mixed 图标。
   */
  source = source.replace(
    `<span aria-label="多个值" className="hc-properties-sidebar__mixed" title="多个值">
            —
          </span>`,
    `<span
            aria-label="多个值"
            className="hc-properties-sidebar__mixed"
            title="多个值"
          >
            <TldrawUiIcon
              icon="mixed"
              label="多个值"
              small
            />
          </span>`,
  )

  /*
   * 补充官方对象标题。
   */
  source = source.replace(
    `    video: '视频',
    group: '编组',`,
    `    video: '视频',
    embed: '嵌入',
    bookmark: '书签',
    group: '编组',`,
  )

  /*
   * 防止二次执行产生重复项。
   */
  assertSingleOccurrence(
    source,
    'id="flip-horizontal"',
  )

  assertSingleOccurrence(
    source,
    'id="flip-vertical"',
  )

  assertSingleOccurrence(
    source,
    'id="open-embed-link"',
  )

  assertSingleOccurrence(
    source,
    'id="convert-to-bookmark"',
  )

  assertSingleOccurrence(
    source,
    'id="convert-to-embed"',
  )

  await writeFile(
    paths.propertiesInspector,
    source,
    'utf8',
  )
}

function replaceSection(
  source,
  startMarker,
  endMarker,
  replacement,
) {
  const startIndex =
    source.indexOf(startMarker)

  if (startIndex === -1) {
    throw new Error(
      '找不到开始标记：' +
        startMarker,
    )
  }

  const endIndex =
    source.indexOf(
      endMarker,
      startIndex,
    )

  if (endIndex === -1) {
    throw new Error(
      '找不到结束标记：' +
        endMarker,
    )
  }

  return (
    source.slice(0, startIndex) +
    replacement.trimEnd() +
    source.slice(endIndex)
  )
}

function addInterfaceMembers(
  source,
  interfaceMarker,
  members,
) {
  const markerIndex =
    source.indexOf(interfaceMarker)

  if (markerIndex === -1) {
    throw new Error(
      '找不到 interface：' +
        interfaceMarker,
    )
  }

  const closeIndex =
    source.indexOf(
      '\n}',
      markerIndex,
    )

  if (closeIndex === -1) {
    throw new Error(
      '找不到 interface 结束位置。',
    )
  }

  const missing = members.filter(
    (member) => !source.includes(member),
  )

  if (missing.length === 0) {
    return source
  }

  return (
    source.slice(0, closeIndex) +
    '\n' +
    missing.join('\n') +
    source.slice(closeIndex)
  )
}

function assertIncludes(
  source,
  fragment,
  description,
) {
  if (!source.includes(fragment)) {
    throw new Error(
      '找不到预期代码：' +
        description,
    )
  }
}

function assertSingleOccurrence(
  source,
  fragment,
) {
  const count =
    source.split(fragment).length - 1

  if (count !== 1) {
    throw new Error(
      fragment +
        ' 出现次数异常：' +
        String(count),
    )
  }
}