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
            max-w-48 truncate px-1
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

            <AspectRatioLockButton
              disabled={
                !snapshot.canResize ||
                snapshot.hasForcedAspectRatio
              }
              forced={snapshot.hasForcedAspectRatio}
              locked={isAspectRatioLocked}
              onChange={setUserAspectRatioLocked}
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
  return (
    <span
      className="
        inline-flex h-6 shrink-0 items-center px-1.5
        text-foreground/65
      "
      title={
        count === 1
          ? '已选择 1 个对象'
          : '当前多选范围'
      }
    >
      {count === 1
        ? '1 个对象'
        : String(count) + ' 个对象'}
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
  const [draft, setDraft] = useState(
    formatStatusNumber(value),
  )

  const inputRef = useRef<HTMLInputElement>(null)
  const skipBlurCommitRef = useRef(false)

  useEffect(() => {
    setDraft(formatStatusNumber(value))

    if (!active) {
      return
    }

    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [active, value])

  const parseDraft = (): number | null => {
    const parsed = Number(draft)

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

  const commit = (): boolean => {
    const parsed = parseDraft()

    if (parsed === null) {
      setDraft(formatStatusNumber(value))
      return false
    }

    onCommit(field, parsed)
    return true
  }

  const finish = () => {
    commit()
    onActivate(null)
  }

  const cancel = () => {
    skipBlurCommitRef.current = true
    setDraft(formatStatusNumber(value))
    onActivate(null)
  }

  const handleBlur = (
    _event: FocusEvent<HTMLInputElement>,
  ) => {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false
      return
    }

    finish()
  }

  const handleKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      skipBlurCommitRef.current = true
      commit()
      onActivate(null)
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
      return
    }

    if (event.key === 'Tab') {
      event.preventDefault()
      skipBlurCommitRef.current = true
      commit()

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

      const current = parseDraft() ?? value
      const direction =
        event.key === 'ArrowUp' ? 1 : -1

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

  if (active && !disabled) {
    return (
      <span
        className="
          inline-flex h-6 shrink-0 items-center
          rounded-md bg-background
          ring-1 ring-primary/65
        "
      >
        <span
          className="
            pl-1.5 text-[10px]
            text-muted-foreground
          "
        >
          {label}
        </span>

        <input
          ref={inputRef}
          aria-label={'编辑 ' + label}
          className="
            h-6 w-16 border-0 bg-transparent px-1
            text-right font-mono text-[11px]
            tabular-nums text-foreground outline-none
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

        {suffix ? (
          <span
            className="
              pr-1.5 text-[10px]
              text-muted-foreground
            "
          >
            {suffix}
          </span>
        ) : null}
      </span>
    )
  }

  return (
    <button
      aria-label={
        disabled
          ? label + ' 不可编辑'
          : '编辑 ' + label
      }
      className={[
        'inline-flex h-6 shrink-0 items-center gap-1',
        'rounded-md px-1.5',
        'font-mono text-[11px] tabular-nums',
        'transition-colors',
        'focus-visible:outline-none',
        'focus-visible:ring-1',
        'focus-visible:ring-primary',
        disabled
          ? 'cursor-not-allowed opacity-45'
          : 'hover:bg-background/85',
      ].join(' ')}
      disabled={disabled}
      onClick={() => {
        onActivate(field)
      }}
      title={
        disabled
          ? label + ' 当前不可编辑'
          : '编辑 ' + label
      }
      type="button"
    >
      <span
        className="
          font-sans text-[10px]
          text-muted-foreground/75
        "
      >
        {label}
      </span>

      <span className="min-w-7 text-right text-foreground/85">
        {formatStatusNumber(value)}
        {suffix}
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
