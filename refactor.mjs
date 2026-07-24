import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const filePath = path.join(
  process.cwd(),
  'editor/core/src/react/CanvasTransformStatus.tsx',
)

let source = await readFile(filePath, 'utf8')

source = source.replace(
  /className="[\s\S]*?max-w-48 truncate px-1[\s\S]*?font-medium text-foreground\/80[\s\S]*?"/m,
  `className="
            w-40 max-w-40 shrink-0 truncate px-1
            font-medium text-foreground/80
          "`,
)

source = replaceSection(
  source,
  'function SelectionCount(',
  '\ninterface TransformGroupProps',
  `function SelectionCount({
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
        inline-flex h-6 w-[68px] shrink-0 items-center
        overflow-hidden px-1.5 text-foreground/65
        tabular-nums whitespace-nowrap
      "
      title={
        count === 1
          ? '已选择 1 个对象'
          : '已选择 ' + String(count) + ' 个对象'
      }
    >
      <span className="block w-full truncate">
        {label}
      </span>
    </span>
  )
}
`,
)

source = replaceSection(
  source,
  'function InlineTransformField(',
  '\ninterface AspectRatioLockButtonProps',
  `function InlineTransformField({
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
          inline-grid h-6 w-[76px] shrink-0
          grid-cols-[14px_minmax(0,1fr)_10px]
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
            text-right font-mono text-[11px]
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
        'inline-grid h-6 w-[76px] shrink-0',
        'grid-cols-[14px_minmax(0,1fr)_10px]',
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
          block min-w-0 overflow-hidden
          text-ellipsis whitespace-nowrap
          text-right font-mono
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
`,
)

source = source.replace(
  `className="mx-1 h-3 w-px shrink-0 bg-divider"`,
  `className="mx-1 h-3 w-px shrink-0 bg-divider"`,
)

/*
 * 检查旧版突兀编辑样式是否仍然存在。
 */
const forbiddenFragments = [
  'ring-1 ring-primary/65',
  'bg-background\\n          ring-1',
  'onClick={() => {\\n        onActivate(field)',
]

const remainingFragments = forbiddenFragments.filter(
  (fragment) => source.includes(fragment),
)

if (remainingFragments.length > 0) {
  throw new Error(
    [
      '仍发现旧内联编辑样式：',
      ...remainingFragments.map(
        (fragment) => '- ' + fragment,
      ),
    ].join('\\n'),
  )
}

if (!source.includes('onBlur={handleBlur}')) {
  throw new Error(
    '失焦提交逻辑未正确写入。',
  )
}

if (!source.includes('onDoubleClick')) {
  throw new Error(
    '双击编辑逻辑未正确写入。',
  )
}

await writeFile(filePath, source, 'utf8')

console.log('')
console.log('Transform 内联编辑优化完成：')
console.log('- 编辑态取消边框、背景和高亮框')
console.log('- 编辑前后使用同一固定尺寸槽位')
console.log('- 双击进入编辑')
console.log('- 普通失焦提交修改')
console.log('- Enter 提交')
console.log('- Escape 取消')
console.log('- Tab 提交并切换字段')
console.log('- X/Y/W/H/R 使用固定宽度')
console.log('- 选中数量使用固定宽度')
console.log('- 画布标题使用固定宽度')
console.log('- 快速变化时不再推动后续信息')
console.log('')
console.log('请运行：')
console.log('  pnpm format')
console.log('  pnpm typecheck')
console.log('')

function replaceSection(
  source,
  startMarker,
  endMarker,
  replacement,
) {
  const startIndex = source.indexOf(startMarker)

  if (startIndex === -1) {
    throw new Error(
      '找不到开始标记：' + startMarker,
    )
  }

  const endIndex = source.indexOf(
    endMarker,
    startIndex,
  )

  if (endIndex === -1) {
    throw new Error(
      '找不到结束标记：' + endMarker,
    )
  }

  return (
    source.slice(0, startIndex) +
    replacement.trimEnd() +
    '\\n' +
    source.slice(endIndex)
  )
}