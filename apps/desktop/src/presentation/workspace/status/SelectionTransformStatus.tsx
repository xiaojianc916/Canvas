import { type FocusEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { useEditor } from '@hybrid-canvas/canvas/react'
import { useValue } from 'tldraw'

type TransformFieldId = 'x' | 'y' | 'width' | 'height' | 'rotation'

const TRANSFORM_FIELDS: readonly TransformFieldId[] = ['x', 'y', 'width', 'height', 'rotation']

export interface SelectionTransformStatusProps {
  readonly canvasTitle: string | null
}

interface SelectionGeometry {
  readonly count: number
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly rotation: number
  readonly hasLockedShape: boolean
}

export function SelectionTransformStatus({ canvasTitle }: SelectionTransformStatusProps) {
  const editor = useEditor()
  const [activeField, setActiveField] = useState<TransformFieldId | null>(null)
  const [isAspectRatioLocked, setAspectRatioLocked] = useState(false)

  const geometry =
    useValue('canvas status editable selection geometry', (): SelectionGeometry | null => {
      if (!editor) {
        return null
      }

      const selectedShapes = editor.getSelectedShapes()

      if (selectedShapes.length === 0) {
        return null
      }

      const bounds = editor.getSelectionPageBounds()

      if (!bounds) {
        return null
      }

      return {
        count: selectedShapes.length,
        x: bounds.x,
        y: bounds.y,
        width: bounds.w,
        height: bounds.h,
        rotation: (editor.getSelectionRotation() * 180) / Math.PI,
        hasLockedShape: selectedShapes.some((shape) => shape.isLocked),
      }
    }, [editor])

  useEffect(() => {
    setActiveField(null)
  }, [geometry?.count])

  if (!canvasTitle && !geometry) {
    return null
  }

  const commitTransform = (field: TransformFieldId, value: number) => {
    if (!editor || !geometry || geometry.hasLockedShape || !Number.isFinite(value)) {
      return
    }

    const selectedShapeIds = editor.getSelectedShapeIds()

    if (selectedShapeIds.length === 0) {
      return
    }

    if (field === 'rotation') {
      const currentRadians = editor.getSelectionRotation()

      const targetRadians = (value * Math.PI) / 180

      const delta = normalizeRadians(targetRadians - currentRadians)

      if (Math.abs(delta) < 0.000001) {
        return
      }

      editor.markHistoryStoppingPoint('edit selection rotation from status bar')

      editor.rotateShapesBy(selectedShapeIds, delta)

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
      case 'x':
        nextX = value
        break

      case 'y':
        nextY = value
        break

      case 'width': {
        nextWidth = Math.max(value, 0.01)

        if (isAspectRatioLocked && bounds.w > 0) {
          nextHeight = Math.max(bounds.h * (nextWidth / bounds.w), 0.01)
        }

        break
      }

      case 'height': {
        nextHeight = Math.max(value, 0.01)

        if (isAspectRatioLocked && bounds.h > 0) {
          nextWidth = Math.max(bounds.w * (nextHeight / bounds.h), 0.01)
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

    editor.markHistoryStoppingPoint('edit selection bounds from status bar')

    editor.resizeToBounds(selectedShapeIds, {
      x: nextX,
      y: nextY,
      w: nextWidth,
      h: nextHeight,
    })
  }

  const navigateField = (currentField: TransformFieldId, direction: 1 | -1) => {
    const currentIndex = TRANSFORM_FIELDS.indexOf(currentField)

    if (currentIndex === -1) {
      return
    }

    const nextIndex = (currentIndex + direction + TRANSFORM_FIELDS.length) % TRANSFORM_FIELDS.length

    setActiveField(TRANSFORM_FIELDS[nextIndex] ?? null)
  }

  return (
    <>
      {canvasTitle ? (
        <span className="max-w-48 truncate font-medium text-foreground/80" title={canvasTitle}>
          {canvasTitle}
        </span>
      ) : null}

      {geometry ? (
        <>
          {canvasTitle ? <StatusDivider /> : null}

          <span
            className="shrink-0 text-foreground/70"
            title={geometry.count === 1 ? '已选择 1 个对象' : '显示整个多选范围'}
          >
            {geometry.count === 1 ? '已选择 1 个' : '已选择 ' + String(geometry.count) + ' 个'}
          </span>

          <InlineTransformField
            active={activeField === 'x'}
            disabled={geometry.hasLockedShape}
            field="x"
            label="X"
            onActivate={setActiveField}
            onCommit={commitTransform}
            onNavigate={navigateField}
            value={geometry.x}
          />

          <InlineTransformField
            active={activeField === 'y'}
            disabled={geometry.hasLockedShape}
            field="y"
            label="Y"
            onActivate={setActiveField}
            onCommit={commitTransform}
            onNavigate={navigateField}
            value={geometry.y}
          />

          <StatusDivider />

          <InlineTransformField
            active={activeField === 'width'}
            disabled={geometry.hasLockedShape}
            field="width"
            label="W"
            minimum={0.01}
            onActivate={setActiveField}
            onCommit={commitTransform}
            onNavigate={navigateField}
            value={geometry.width}
          />

          <AspectRatioLockButton
            disabled={geometry.hasLockedShape}
            locked={isAspectRatioLocked}
            onChange={setAspectRatioLocked}
          />

          <InlineTransformField
            active={activeField === 'height'}
            disabled={geometry.hasLockedShape}
            field="height"
            label="H"
            minimum={0.01}
            onActivate={setActiveField}
            onCommit={commitTransform}
            onNavigate={navigateField}
            value={geometry.height}
          />

          <StatusDivider />

          <InlineTransformField
            active={activeField === 'rotation'}
            disabled={geometry.hasLockedShape}
            field="rotation"
            label="R"
            onActivate={setActiveField}
            onCommit={commitTransform}
            onNavigate={navigateField}
            suffix="°"
            value={geometry.rotation}
          />

          {geometry.hasLockedShape ? (
            <span
              className="shrink-0 text-[10px] text-muted-foreground"
              title="选择中包含锁定对象，无法编辑变换"
            >
              已锁定
            </span>
          ) : null}
        </>
      ) : null}
    </>
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
  readonly onActivate: (field: TransformFieldId | null) => void
  readonly onCommit: (field: TransformFieldId, value: number) => void
  readonly onNavigate: (field: TransformFieldId, direction: 1 | -1) => void
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
  const [draft, setDraft] = useState(formatStatusNumber(value))

  const inputRef = useRef<HTMLInputElement>(null)

  const skipBlurCommitRef = useRef(false)

  useEffect(() => {
    if (!active) {
      setDraft(formatStatusNumber(value))
      return
    }

    setDraft(formatStatusNumber(value))

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

    if (!Number.isFinite(parsed) || (minimum !== undefined && parsed < minimum)) {
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

  const handleBlur = (_event: FocusEvent<HTMLInputElement>) => {
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false
      return
    }

    finish()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
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

      onNavigate(field, event.shiftKey ? -1 : 1)
      return
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()

      const current = parseDraft() ?? value

      const direction = event.key === 'ArrowUp' ? 1 : -1

      const increment = event.shiftKey ? 10 : event.altKey ? 0.1 : 1

      const nextValue = current + direction * increment

      if (minimum !== undefined && nextValue < minimum) {
        setDraft(formatStatusNumber(minimum))
        return
      }

      setDraft(formatStatusNumber(nextValue))
    }
  }

  if (active && !disabled) {
    return (
      <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded bg-background ring-1 ring-primary/60">
        <span className="pl-1.5 text-[10px] text-muted-foreground">{label}</span>

        <input
          ref={inputRef}
          aria-label={'编辑 ' + label}
          className="h-6 w-16 border-0 bg-transparent px-1 text-right font-mono text-[11px] tabular-nums text-foreground outline-none"
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

        {suffix ? <span className="pr-1.5 text-[10px] text-muted-foreground">{suffix}</span> : null}
      </span>
    )
  }

  return (
    <button
      aria-label={disabled ? label + '，对象已锁定' : '双击编辑 ' + label}
      className={
        'inline-flex h-6 shrink-0 items-center gap-1 rounded px-1.5 ' +
        'font-mono text-[11px] tabular-nums transition-colors ' +
        'focus-visible:outline-none focus-visible:ring-1 ' +
        'focus-visible:ring-primary ' +
        (disabled ? 'cursor-not-allowed opacity-55' : 'hover:bg-background/80')
      }
      disabled={disabled}
      onDoubleClick={() => {
        onActivate(field)
      }}
      title={disabled ? '选择中包含锁定对象' : '双击编辑 ' + label}
      type="button"
    >
      <span className="font-sans text-[10px] text-muted-foreground/70">{label}</span>

      <span className="min-w-7 text-right text-foreground/80">
        {formatStatusNumber(value)}
        {suffix}
      </span>
    </button>
  )
}

interface AspectRatioLockButtonProps {
  readonly locked: boolean
  readonly disabled: boolean
  readonly onChange: (locked: boolean) => void
}

function AspectRatioLockButton({ locked, disabled, onChange }: AspectRatioLockButtonProps) {
  return (
    <button
      aria-label={locked ? '解除宽高比锁定' : '锁定宽高比'}
      aria-pressed={locked}
      className={
        'inline-flex size-6 shrink-0 items-center justify-center rounded ' +
        'text-[11px] transition-colors focus-visible:outline-none ' +
        'focus-visible:ring-1 focus-visible:ring-primary ' +
        (locked ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-background/80') +
        (disabled ? ' cursor-not-allowed opacity-50' : '')
      }
      disabled={disabled}
      onClick={() => {
        onChange(!locked)
      }}
      title={locked ? '宽高比已锁定' : '锁定宽高比'}
      type="button"
    >
      <span aria-hidden="true">{locked ? '🔗' : '⛓'}</span>
    </button>
  )
}

function StatusDivider() {
  return <span aria-hidden="true" className="h-3 w-px shrink-0 bg-divider" />
}

function formatStatusNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0'
  }

  return String(Math.round(value * 100) / 100)
}

function normalizeRadians(radians: number): number {
  const fullTurn = Math.PI * 2

  let normalized = ((((radians + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI

  if (Object.is(normalized, -0)) {
    normalized = 0
  }

  return normalized
}
