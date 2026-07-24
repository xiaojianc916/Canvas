import type {
  FocusEvent,
  KeyboardEvent,
  ReactNode,
} from 'react'
import {
  useEffect,
  useRef,
  useState,
} from 'react'
import { useValue } from 'tldraw'

import { useEditor } from './editor-context'

type TransformFieldId =
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'rotation'

const TRANSFORM_FIELDS: readonly TransformFieldId[] = [
  'x',
  'y',
  'width',
  'height',
  'rotation',
]

const MINIMUM_SIZE = 0.01
const EPSILON = 0.000001

export interface CanvasTransformStatusProps {
  readonly canvasTitle: string | null
}

interface SelectionTransformSnapshot {
  readonly selectionKey: string
  readonly count: number
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly rotation: number
  readonly isReadonly: boolean
  readonly hasLockedShape: boolean
  readonly canMove: boolean
  readonly canResize: boolean
  readonly canRotate: boolean
  readonly hasForcedAspectRatio: boolean
}

export function CanvasTransformStatus({
  canvasTitle,
}: CanvasTransformStatusProps) {
  const editor = useEditor()

  const [activeField, setActiveField] =
    useState<TransformFieldId | null>(null)

  const [userAspectRatioLocked, setUserAspectRatioLocked] =
    useState(false)

  const snapshot = useValue(
    'canvas transform status',
    (): SelectionTransformSnapshot | null => {
      if (!editor) {
        return null
      }

      const selectedShapes = editor.getSelectedShapes()

      if (selectedShapes.length === 0) {
        return null
      }

      /*
       * resizeToBounds 使用页面轴对齐范围。
       *
       * 因此这里有意读取 getSelectionPageBounds，而不是把旋转后的
       * selection bounds 冒充成 resizeToBounds 的输入。
       */
      const bounds = editor.getSelectionPageBounds()

      if (!bounds) {
        return null
      }

      const isReadonly = editor.getIsReadonly()

      const hasLockedShape = selectedShapes.some(
        (shape) => shape.isLocked,
      )

      const canResize = selectedShapes.every((shape) => {
        const util = editor.getShapeUtil(shape)

        return (
          util.canResize(shape) &&
          util.canBeLaidOut(shape, {
            type: 'resize_to_bounds',
            shapes: selectedShapes,
          })
        )
      })

      const canRotate = selectedShapes.every((shape) => {
        const util = editor.getShapeUtil(shape)

        return !util.hideRotateHandle(shape)
      })

      const hasForcedAspectRatio = selectedShapes.some((shape) => {
        const util = editor.getShapeUtil(shape)

        return util.isAspectRatioLocked(shape)
      })

      return {
        selectionKey: editor.getSelectedShapeIds().join('|'),
        count: selectedShapes.length,
        x: bounds.x,
        y: bounds.y,
        width: bounds.w,
        height: bounds.h,
        rotation:
          normalizeDegrees(
            radiansToDegrees(editor.getSelectionRotation()),
          ),
        isReadonly,
        hasLockedShape,
        canMove: !isReadonly && !hasLockedShape,
        canResize:
          !isReadonly &&
          !hasLockedShape &&
          canResize,
        canRotate:
          !isReadonly &&
          !hasLockedShape &&
          canRotate,
        hasForcedAspectRatio,
      }
    },
    [editor],
  )

  useEffect(() => {
    setActiveField(null)
    setUserAspectRatioLocked(false)
  }, [snapshot?.selectionKey])

  if (!canvasTitle && !snapshot) {
    return null
  }

  const isAspectRatioLocked =
    snapshot?.hasForcedAspectRatio === true ||
    userAspectRatioLocked

  const commitTransform = (
    field: TransformFieldId,
    value: number,
  ) => {
    if (
      !editor ||
      !snapshot ||
      !Number.isFinite(value)
    ) {
      return
    }

    const selectedShapeIds = editor.getSelectedShapeIds()

    if (selectedShapeIds.length === 0) {
      return
    }

    if (field === 'rotation') {
      if (!snapshot.canRotate) {
        return
      }

      const currentRadians = editor.getSelectionRotation()
      const targetRadians = degreesToRadians(value)
      const delta = normalizeRadians(
        targetRadians - currentRadians,
      )

      if (Math.abs(delta) < EPSILON) {
        return
      }

      editor.markHistoryStoppingPoint(
        'edit selection rotation from status bar',
      )

      editor.rotateShapesBy(selectedShapeIds, delta)
      return
    }

    if (
      (field === 'x' || field === 'y') &&
      !snapshot.canMove
    ) {
      return
    }

    if (
      (field === 'width' || field === 'height') &&
      !snapshot.canResize
    ) {
      return
    }

    const bounds = editor.getSelectionPageBounds()

    if (!bounds) {
      return
    }

    let nextX = bounds.x
    let nextY = bounds.y
    let nextWidth = bounds.w
    let nextHeight = bounds.h

    switch (field) {
      case 'x': {
        nextX = value
        break
      }

      case 'y': {
        nextY = value
        break
      }

      case 'width': {
        nextWidth = Math.max(
          value,
          MINIMUM_SIZE,
        )

        if (
          isAspectRatioLocked &&
          bounds.w > EPSILON
        ) {
          nextHeight = Math.max(
            bounds.h * (nextWidth / bounds.w),
            MINIMUM_SIZE,
          )
        }

        break
      }

      case 'height': {
        nextHeight = Math.max(
          value,
          MINIMUM_SIZE,
        )

        if (
          isAspectRatioLocked &&
          bounds.h > EPSILON
        ) {
          nextWidth = Math.max(
            bounds.w * (nextHeight / bounds.h),
            MINIMUM_SIZE,
          )
        }

        break
      }

    }

    if (
      !Number.isFinite(nextX) ||
      !Number.isFinite(nextY) ||
      !Number.isFinite(nextWidth) ||
      !Number.isFinite(nextHeight)
    ) {
      return
    }

    if (
      approximatelyEqual(nextX, bounds.x) &&
      approximatelyEqual(nextY, bounds.y) &&
      approximatelyEqual(nextWidth, bounds.w) &&
      approximatelyEqual(nextHeight, bounds.h)
    ) {
      return
    }

    editor.markHistoryStoppingPoint(
      'edit selection bounds from status bar',
    )

    editor.resizeToBounds(selectedShapeIds, {
      x: nextX,
      y: nextY,
      w: nextWidth,
      h: nextHeight,
    })
  }

  const navigateField = (
    currentField: TransformFieldId,
    direction: 1 | -1,
  ) => {
    if (!snapshot) {
      return
    }

    const currentIndex =
      TRANSFORM_FIELDS.indexOf(currentField)

    if (currentIndex === -1) {
      return
    }

    for (
      let step = 1;
      step <= TRANSFORM_FIELDS.length;
      step += 1
    ) {
      const nextIndex =
        (
          currentIndex +
          direction * step +
          TRANSFORM_FIELDS.length
        ) % TRANSFORM_FIELDS.length

      const candidate = TRANSFORM_FIELDS[nextIndex]

      if (
        candidate &&
        isFieldEditable(candidate, snapshot)
      ) {
        setActiveField(candidate)
        return
      }
    }

    setActiveField(null)
  }

  return (
    <>
      {canvasTitle ? (
        <span
          className="
            w-[112px] max-w-[112px] shrink-0 truncate px-1
            font-medium text-foreground/80
          "
          title={canvasTitle}
        >
          {canvasTitle}
        </span>
      ) : null}

      {snapshot ? (
        <>
          {canvasTitle ? <StatusDivider /> : null}

          <SelectionCount count={snapshot.count} />

          <StatusDivider />

          <TransformGroup
            label="位置"
            title="页面坐标"
          >
            <InlineTransformField
              active={activeField === 'x'}
              disabled={!snapshot.canMove}
              field="x"
              label="X"
              onActivate={setActiveField}
              onCommit={commitTransform}
              onNavigate={navigateField}
              value={snapshot.x}
            />

            <InlineTransformField
              active={activeField === 'y'}
              disabled={!snapshot.canMove}
              field="y"
              label="Y"
              onActivate={setActiveField}
              onCommit={commitTransform}
              onNavigate={navigateField}
              value={snapshot.y}
            />
          </TransformGroup>

          <StatusDivider />

          <TransformGroup


            label="尺寸"
            title="页面轴对齐包围盒"
          >
            <InlineTransformField
              active={activeField === 'width'}
              disabled={!snapshot.canResize}
              field="width"
              label="W"
              minimum={MINIMUM_SIZE}
              onActivate={setActiveField}
              onCommit={commitTransform}
              onNavigate={navigateField}
              value={snapshot.width}
            />

            <InlineTransformField
              active={activeField === 'height'}
              disabled={!snapshot.canResize}
              field="height"
              label="H"
              minimum={MINIMUM_SIZE}
              onActivate={setActiveField}
              onCommit={commitTransform}
              onNavigate={navigateField}
              value={snapshot.height}
            />
          </TransformGroup>

          <StatusDivider />

          <TransformGroup
            label="旋转"
            title="选择旋转角度"
          >
            <InlineTransformField
              active={activeField === 'rotation'}
              disabled={!snapshot.canRotate}
              field="rotation"
              label="R"
              onActivate={setActiveField}
              onCommit={commitTransform}
              onNavigate={navigateField}
              suffix="°"
              value={snapshot.rotation}
            />
          </TransformGroup>

          {snapshot.isReadonly ? (
            <>
              <StatusDivider />

              <StatusState
                label="只读"
                title="当前画布为只读状态"
              />
            </>
          ) : snapshot.hasLockedShape ? (
            <>
              <StatusDivider />

              <StatusState
                label="已锁定"
                title="选择中包含锁定对象"
              />
            </>
          ) : null}

          <StatusDivider />

          <AspectRatioLockButton
            disabled={
              !snapshot.canResize ||
              snapshot.hasForcedAspectRatio
            }
            forced={snapshot.hasForcedAspectRatio}
            locked={isAspectRatioLocked}
            onChange={setUserAspectRatioLocked}
          />
        </>
      ) : null}
    </>
  )
}

function SelectionCount({
  count,
}: {
  readonly count: number
}) {
  const label =
    count === 1
      ? '1 个对象'
      : String(count) + ' 个对象'

  return (
    <span
      className="
        inline-flex h-6 w-[56px] shrink-0 items-center overflow-hidden px-1 text-foreground/65
        tabular-nums whitespace-nowrap
      "
      title={
        count === 1
          ? '已选择 1 个对象'
          : '已选择 ' + String(count) + ' 个对象'
      }
    >
      <span className="block w-full whitespace-nowrap">
        {label}
      </span>
    </span>
  )
}

interface TransformGroupProps {
  readonly children: ReactNode
  readonly label: string
  readonly title: string
}

function TransformGroup({
  children,
  label,
  title,
}: TransformGroupProps) {
  return (
    <div
      aria-label={label}
      className="
        inline-flex h-6 shrink-0 items-center gap-0.5
      "
      title={title}
    >

      {children}
    </div>
  )
}

interface InlineTransformFieldProps {
  readonly field: TransformFieldId
  readonly label: string
  readonly value: number
  readonly suffix?: string
  readonly minimum?: number
  readonly active: boolean
  readonly disabled: boolean
  readonly onActivate: (
    field: TransformFieldId | null,
  ) => void
  readonly onCommit: (
    field: TransformFieldId,
    value: number,
  ) => void
  readonly onNavigate: (
    field: TransformFieldId,
    direction: 1 | -1,
  ) => void
}

function InlineTransformField({
  field,
  label,
  value,
  suffix,
  minimum,
  active,
  disabled,
  onActivate,
  onCommit,
  onNavigate,
}: InlineTransformFieldProps) {
  const formattedValue = formatStatusNumber(value)

  const [draft, setDraft] =
    useState(formattedValue)

  const inputRef =
    useRef<HTMLInputElement>(null)

  /*
   * Enter / Tab 会先主动提交，然后输入框卸载并触发 blur。
   * 这个标记防止同一个值被提交两次。
   *
   * 普通鼠标失焦不会设置该标记，因此会正常提交。
   */
  const skipNextBlurRef = useRef(false)

  useEffect(() => {
    if (!active) {
      setDraft(formattedValue)
      return
    }

    skipNextBlurRef.current = false
    setDraft(formattedValue)

    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [active, formattedValue])

  const parseDraft = (): number | null => {
    /*
     * 允许用户输入前后空格，但不允许空字符串被当作 0。
     */
    const normalizedDraft = draft.trim()

    if (normalizedDraft.length === 0) {
      return null
    }

    const parsed = Number(normalizedDraft)

    if (
      !Number.isFinite(parsed) ||
      (
        minimum !== undefined &&
        parsed < minimum
      )
    ) {
      return null
    }

    return parsed
  }

  const commitDraft = (): boolean => {
    const parsed = parseDraft()

    if (parsed === null) {
      setDraft(formattedValue)
      return false
    }

    onCommit(field, parsed)
    return true
  }

  const finishWithCommit = () => {
    commitDraft()
    onActivate(null)
  }

  const cancelEditing = () => {
    skipNextBlurRef.current = true
    setDraft(formattedValue)
    onActivate(null)
  }

  const handleBlur = (
    _event: FocusEvent<HTMLInputElement>,
  ) => {
    if (skipNextBlurRef.current) {
      skipNextBlurRef.current = false
      return
    }

    /*
     * 普通失焦路径：
     * 编辑 1 为 2，再点击画布或其他控件，
     * 此处会提交 2，然后退出编辑状态。
     */
    finishWithCommit()
  }

  const handleKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault()

      skipNextBlurRef.current = true
      commitDraft()
      onActivate(null)
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      cancelEditing()
      return
    }

    if (event.key === 'Tab') {
      event.preventDefault()

      skipNextBlurRef.current = true
      commitDraft()

      onNavigate(
        field,
        event.shiftKey ? -1 : 1,
      )
      return
    }

    if (
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown'
    ) {
      event.preventDefault()

      const current =
        parseDraft() ?? value

      const direction =
        event.key === 'ArrowUp'
          ? 1
          : -1

      const increment = event.shiftKey
        ? 10
        : event.altKey
          ? 0.1
          : 1

      const nextValue =
        current + direction * increment

      if (
        minimum !== undefined &&
        nextValue < minimum
      ) {
        setDraft(
          formatStatusNumber(minimum),
        )
        return
      }

      setDraft(
        formatStatusNumber(nextValue),
      )
    }
  }

  /*
   * 编辑态和静态使用完全相同的：
   * - 宽度
   * - 高度
   * - Grid 列
   * - Padding
   *
   * 切换时只改变文本节点与 input，
   * 不改变任何外部几何尺寸。
   */
  if (active && !disabled) {
    return (
      <span
        className="
          inline-grid h-6 w-[88px] shrink-0
          grid-cols-[12px_minmax(0,1fr)_10px]
          items-center gap-1 rounded-md px-1.5
          text-[11px] tabular-nums
        "
      >
        <span
          className="
            font-sans text-[10px]
            text-muted-foreground/80
          "
        >
          {label}
        </span>

        <input
          ref={inputRef}
          aria-label={'编辑 ' + label}
          className="
            h-6 min-w-0 w-full appearance-none
            border-0 bg-transparent p-0
            text-left font-mono text-[11px]
            tabular-nums text-foreground
            outline-none ring-0
            [appearance:textfield]
            [&::-webkit-inner-spin-button]:appearance-none
            [&::-webkit-outer-spin-button]:appearance-none
          "
          inputMode="decimal"
          onBlur={handleBlur}
          onChange={(event) => {
            setDraft(event.currentTarget.value)
          }}
          onKeyDown={handleKeyDown}
          step="any"
          type="number"
          value={draft}
        />

        <span
          className="
            overflow-hidden text-left
            font-sans text-[10px]
            text-muted-foreground/75
          "
        >
          {suffix ?? ''}
        </span>
      </span>
    )
  }

  return (
    <button
      aria-label={
        disabled
          ? label + ' 不可编辑'
          : '双击编辑 ' + label
      }
      className={[
        'inline-grid h-6 w-[88px] shrink-0',
        'grid-cols-[12px_minmax(0,1fr)_10px]',
        'items-center gap-1 rounded-md px-1.5',
        'text-[11px] tabular-nums',
        'transition-colors',
        'focus-visible:outline-none',
        'focus-visible:ring-1',
        'focus-visible:ring-primary/60',
        disabled
          ? 'cursor-not-allowed opacity-45'
          : 'cursor-default hover:bg-background/55',
      ].join(' ')}
      disabled={disabled}
      onDoubleClick={() => {
        onActivate(field)
      }}
      title={
        disabled
          ? label + ' 当前不可编辑'
          : '双击编辑 ' + label
      }
      type="button"
    >
      <span
        className="
          font-sans text-[10px]
          text-muted-foreground/80
        "
      >
        {label}
      </span>

      <span
        className="
          block min-w-0 whitespace-nowrap
          text-left font-mono
          text-foreground/85
        "
        title={
          formattedValue +
          (suffix ?? '')
        }
      >
        {formattedValue}
      </span>

      <span
        className="
          overflow-hidden text-left
          font-sans text-[10px]
          text-muted-foreground/75
        "
      >
        {suffix ?? ''}
      </span>
    </button>
  )
}

interface AspectRatioLockButtonProps {
  readonly locked: boolean
  readonly forced: boolean
  readonly disabled: boolean
  readonly onChange: (locked: boolean) => void
}

function AspectRatioLockButton({
  locked,
  forced,
  disabled,
  onChange,
}: AspectRatioLockButtonProps) {
  const title = forced
    ? '对象类型要求保持宽高比'
    : locked
      ? '解除宽高比锁定'
      : '锁定宽高比'

  return (
    <button
      aria-label={title}
      aria-pressed={locked}
      className={[
        'inline-flex size-6 shrink-0',
        'items-center justify-center rounded-md',
        'transition-colors',
        'focus-visible:outline-none',
        'focus-visible:ring-1',
        'focus-visible:ring-primary',
        locked
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-background/85',
        disabled && !forced
          ? 'cursor-not-allowed opacity-45'
          : '',
        forced
          ? 'cursor-default text-primary'
          : '',
      ].join(' ')}
      disabled={disabled}
      onClick={() => {
        onChange(!locked)
      }}
      title={title}
      type="button"
    >
      <span
        aria-hidden="true"
        className="font-mono text-[9px] font-semibold tracking-[-0.08em]"
      >
        {locked ? 'W:H' : 'W/H'}
      </span>
    </button>
  )
}

interface StatusStateProps {
  readonly label: string
  readonly title: string
}

function StatusState({
  label,
  title,
}: StatusStateProps) {
  return (
    <span
      className="
        inline-flex h-6 shrink-0 items-center gap-1
        px-1 text-muted-foreground
      "
      title={title}
    >

      <span>{label}</span>
    </span>
  )
}

function StatusDivider() {
  return (
    <span
      aria-hidden="true"
      className="mx-1 h-3 w-px shrink-0 bg-divider"
    />
  )
}

function isFieldEditable(
  field: TransformFieldId,
  snapshot: SelectionTransformSnapshot,
): boolean {
  switch (field) {
    case 'x':
    case 'y':
      return snapshot.canMove

    case 'width':
    case 'height':
      return snapshot.canResize

    case 'rotation':
      return snapshot.canRotate
  }
}

function formatStatusNumber(
  value: number,
): string {
  if (!Number.isFinite(value)) {
    return '0'
  }

  const rounded =
    Math.round(value * 100) / 100

  return String(
    Object.is(rounded, -0)
      ? 0
      : rounded,
  )
}

function approximatelyEqual(
  first: number,
  second: number,
): boolean {
  return Math.abs(first - second) < EPSILON
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
  const fullTurn = 360

  let normalized =
    (
      (
        (degrees % fullTurn) +
        fullTurn
      ) %
      fullTurn
    )

  if (
    approximatelyEqual(
      normalized,
      fullTurn,
    ) ||
    Object.is(normalized, -0)
  ) {
    normalized = 0
  }

  return normalized
}

function normalizeRadians(
  radians: number,
): number {
  const fullTurn = Math.PI * 2

  let normalized =
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

  if (Object.is(normalized, -0)) {
    normalized = 0
  }

  return normalized
}
