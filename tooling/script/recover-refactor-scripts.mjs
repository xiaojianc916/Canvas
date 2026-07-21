#!/usr/bin/env node

import {
  cp,
  mkdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const shouldWrite = process.argv.includes('--write')
const writes = new Map()

function absolute(relativePath) {
  return resolve(root, relativePath)
}

async function exists(relativePath) {
  try {
    await stat(absolute(relativePath))
    return true
  } catch {
    return false
  }
}

async function read(relativePath) {
  return readFile(absolute(relativePath), 'utf8')
}

function write(relativePath, content) {
  writes.set(relativePath, content)
}

async function edit(relativePath, transform) {
  const content = await read(relativePath)
  const updated = transform(content)

  if (updated === content) {
    throw new Error(`文件没有产生修改：${relativePath}`)
  }

  write(relativePath, updated)
}

function replaceOnce(
  content,
  oldText,
  newText,
  description,
) {
  const firstIndex = content.indexOf(oldText)

  if (firstIndex < 0) {
    throw new Error(`找不到待修改内容：${description}`)
  }

  const secondIndex = content.indexOf(
    oldText,
    firstIndex + oldText.length,
  )

  if (secondIndex >= 0) {
    throw new Error(`待修改内容不唯一：${description}`)
  }

  return (
    content.slice(0, firstIndex) +
    newText +
    content.slice(firstIndex + oldText.length)
  )
}

async function assertPhase4Completed() {
  const requiredPaths = [
    'tests/architecture/check-import-graph.mjs',
    'tests/performance/report-bundle.mjs',
    'docs/architecture/refactor-progress.md',
    '.github/workflows/quality.yml',
  ]

  const failures = []

  for (const relativePath of requiredPaths) {
    if (!(await exists(relativePath))) {
      failures.push(`缺少 ${relativePath}`)
    }
  }

  const appShell = await read(
    'apps/desktop/src/presentation/AppShell.tsx',
  )

  const workspaceContainer = await read(
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  )

  if (
    appShell.includes(
      '</EditorProvider>    </EditorProvider>',
    )
  ) {
    failures.push('AppShell 仍存在重复闭合标签')
  }

  if (
    workspaceContainer.includes(
      '/>      }\n    />',
    )
  ) {
    failures.push(
      'WorkspaceContainer 仍存在重复 JSX',
    )
  }

  if (
    !appShell.includes(
      `from '@hybrid-canvas/observability'`,
    )
  ) {
    failures.push('Phase 3 observability 尚未落地')
  }

  if (failures.length > 0) {
    throw new Error(
      [
        'Phase 4 前置状态不满足：',
        ...failures.map(
          (failure) => `- ${failure}`,
        ),
      ].join('\n'),
    )
  }
}

function createSettingsDomain() {
  write(
    'features/settings/src/domain/settings.ts',
    `export type ThemeMode =
  | 'light'
  | 'dark'
  | 'system'

export interface CanvasSettings {
  readonly defaultZoom: number
  readonly showGrid: boolean
  readonly snapToGrid: boolean
  readonly gridSize: number
  readonly showRulers: boolean
  readonly infiniteCanvas: boolean
}

export interface EditorSettings {
  readonly fontFamily: string
  readonly fontSize: number
  readonly lineHeight: number
  readonly tabSize: number
  readonly insertSpaces: boolean
  readonly wordWrap: boolean
  readonly minimap: boolean
}

export interface ExportSettings {
  readonly defaultFormat: string
  readonly pngDpi: number
  readonly pdfQuality: number
  readonly includeMetadata: boolean
}

export interface PrivacySettings {
  readonly telemetry: boolean
  readonly crashReporting: boolean
  readonly updateCheck: boolean
}

export interface AppSettings {
  readonly theme: ThemeMode
  readonly language: string
  readonly autoSave: boolean
  readonly autoSaveIntervalMs: number
  readonly shortcuts: Readonly<
    Record<string, string>
  >
  readonly canvas: CanvasSettings
  readonly editor: EditorSettings
  readonly export: ExportSettings
  readonly privacy: PrivacySettings
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  theme: 'system',
  language: 'zh-CN',
  autoSave: true,
  autoSaveIntervalMs: 30_000,
  shortcuts: {},
  canvas: {
    defaultZoom: 1,
    showGrid: false,
    snapToGrid: false,
    gridSize: 20,
    showRulers: false,
    infiniteCanvas: true,
  },
  editor: {
    fontFamily:
      'JetBrains Mono, Consolas, monospace',
    fontSize: 14,
    lineHeight: 1.5,
    tabSize: 2,
    insertSpaces: true,
    wordWrap: true,
    minimap: false,
  },
  export: {
    defaultFormat: 'svg',
    pngDpi: 300,
    pdfQuality: 90,
    includeMetadata: true,
  },
  privacy: {
    telemetry: false,
    crashReporting: true,
    updateCheck: true,
  },
}
`,
  )

  write(
    'features/settings/src/ports/settings-store.ts',
    `import type { AppSettings } from '../domain/settings'

export interface SettingsStore {
  readonly load: () => Promise<AppSettings>
  readonly save: (
    settings: AppSettings,
  ) => Promise<void>
  readonly reset: () => Promise<AppSettings>
}
`,
  )

  write(
    'features/settings/src/public-api.ts',
    `export {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type CanvasSettings,
  type EditorSettings,
  type ExportSettings,
  type PrivacySettings,
  type ThemeMode,
} from './domain/settings'

export type {
  SettingsStore,
} from './ports/settings-store'
`,
  )
}

function createDesktopSettingsAdapter() {
  write(
    'platforms/desktop-runtime/src/adapters/settings/settings-store.ts',
    `import { invoke } from '@hybrid-canvas/desktop-ipc'
import type {
  AppSettings,
  SettingsStore,
  ThemeMode,
} from '@hybrid-canvas/settings'

interface AppSettingsDto {
  readonly theme: string
  readonly language: string
  readonly auto_save: boolean
  readonly auto_save_interval: number
  readonly shortcuts: Record<string, string>
  readonly canvas: {
    readonly default_zoom: number
    readonly show_grid: boolean
    readonly snap_to_grid: boolean
    readonly grid_size: number
    readonly show_rulers: boolean
    readonly infinite_canvas: boolean
  }
  readonly editor: {
    readonly font_family: string
    readonly font_size: number
    readonly line_height: number
    readonly tab_size: number
    readonly insert_spaces: boolean
    readonly word_wrap: boolean
    readonly minimap: boolean
  }
  readonly export: {
    readonly default_format: string
    readonly png_dpi: number
    readonly pdf_quality: number
    readonly include_metadata: boolean
  }
  readonly privacy: {
    readonly telemetry: boolean
    readonly crash_reporting: boolean
    readonly update_check: boolean
  }
}

export function createDesktopSettingsStore(): SettingsStore {
  return {
    async load() {
      const dto =
        await invoke<AppSettingsDto>(
          'settings_get',
        )

      return fromDto(dto)
    },

    save(settings) {
      return invoke<void>(
        'settings_set',
        {
          settings: toDto(settings),
        },
      )
    },

    async reset() {
      const dto =
        await invoke<AppSettingsDto>(
          'settings_reset',
        )

      return fromDto(dto)
    },
  }
}

function fromDto(
  dto: AppSettingsDto,
): AppSettings {
  return {
    theme: parseTheme(dto.theme),
    language: dto.language,
    autoSave: dto.auto_save,
    autoSaveIntervalMs:
      dto.auto_save_interval,
    shortcuts: dto.shortcuts,
    canvas: {
      defaultZoom:
        dto.canvas.default_zoom,
      showGrid:
        dto.canvas.show_grid,
      snapToGrid:
        dto.canvas.snap_to_grid,
      gridSize:
        dto.canvas.grid_size,
      showRulers:
        dto.canvas.show_rulers,
      infiniteCanvas:
        dto.canvas.infinite_canvas,
    },
    editor: {
      fontFamily:
        dto.editor.font_family,
      fontSize:
        dto.editor.font_size,
      lineHeight:
        dto.editor.line_height,
      tabSize:
        dto.editor.tab_size,
      insertSpaces:
        dto.editor.insert_spaces,
      wordWrap:
        dto.editor.word_wrap,
      minimap:
        dto.editor.minimap,
    },
    export: {
      defaultFormat:
        dto.export.default_format,
      pngDpi:
        dto.export.png_dpi,
      pdfQuality:
        dto.export.pdf_quality,
      includeMetadata:
        dto.export.include_metadata,
    },
    privacy: {
      telemetry:
        dto.privacy.telemetry,
      crashReporting:
        dto.privacy.crash_reporting,
      updateCheck:
        dto.privacy.update_check,
    },
  }
}

function toDto(
  settings: AppSettings,
): AppSettingsDto {
  return {
    theme: settings.theme,
    language: settings.language,
    auto_save: settings.autoSave,
    auto_save_interval:
      settings.autoSaveIntervalMs,
    shortcuts: { ...settings.shortcuts },
    canvas: {
      default_zoom:
        settings.canvas.defaultZoom,
      show_grid:
        settings.canvas.showGrid,
      snap_to_grid:
        settings.canvas.snapToGrid,
      grid_size:
        settings.canvas.gridSize,
      show_rulers:
        settings.canvas.showRulers,
      infinite_canvas:
        settings.canvas.infiniteCanvas,
    },
    editor: {
      font_family:
        settings.editor.fontFamily,
      font_size:
        settings.editor.fontSize,
      line_height:
        settings.editor.lineHeight,
      tab_size:
        settings.editor.tabSize,
      insert_spaces:
        settings.editor.insertSpaces,
      word_wrap:
        settings.editor.wordWrap,
      minimap:
        settings.editor.minimap,
    },
    export: {
      default_format:
        settings.export.defaultFormat,
      png_dpi:
        settings.export.pngDpi,
      pdf_quality:
        settings.export.pdfQuality,
      include_metadata:
        settings.export.includeMetadata,
    },
    privacy: {
      telemetry:
        settings.privacy.telemetry,
      crash_reporting:
        settings.privacy.crashReporting,
      update_check:
        settings.privacy.updateCheck,
    },
  }
}

function parseTheme(
  value: string,
): ThemeMode {
  switch (value) {
    case 'light':
    case 'dark':
    case 'system':
      return value
    default:
      return 'system'
  }
}
`,
  )
}

function createSettingsDialog() {
  write(
    'features/settings/src/presentation/SettingsDialog.tsx',
    `import {
  Button,
} from '@hybrid-canvas/design-system'
import type {
  AppSettings,
  SettingsStore,
  ThemeMode,
} from '@hybrid-canvas/settings'
import {
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'

export interface SettingsDialogProps {
  readonly open: boolean
  readonly store: SettingsStore
  readonly onOpenChange: (
    open: boolean,
  ) => void
}

type SettingsSection =
  | 'general'
  | 'canvas'
  | 'about'

const SETTINGS_SECTIONS = [
  {
    id: 'general',
    label: '常规',
  },
  {
    id: 'canvas',
    label: '画布',
  },
  {
    id: 'about',
    label: '关于',
  },
] as const

export function SettingsDialog({
  open,
  store,
  onOpenChange,
}: SettingsDialogProps) {
  const [
    activeSection,
    setActiveSection,
  ] = useState<SettingsSection>('general')

  const [
    draft,
    setDraft,
  ] = useState<AppSettings | null>(null)

  const [loading, setLoading] =
    useState(false)

  const [saving, setSaving] =
    useState(false)

  const [
    errorMessage,
    setErrorMessage,
  ] = useState<string | null>(null)

  const titleId = useId()
  const descriptionId = useId()
  const dialogRef =
    useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    let disposed = false
    const previouslyFocused =
      document.activeElement

    setLoading(true)
    setErrorMessage(null)

    void store.load().then(
      (settings) => {
        if (!disposed) {
          setDraft(settings)
          setLoading(false)
          dialogRef.current?.focus()
        }
      },
      (cause: unknown) => {
        if (!disposed) {
          setLoading(false)
          setErrorMessage(
            getErrorMessage(cause),
          )
        }
      },
    )

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key === 'Escape' &&
        !saving
      ) {
        event.preventDefault()
        onOpenChange(false)
      }
    }

    document.addEventListener(
      'keydown',
      handleKeyDown,
    )

    return () => {
      disposed = true

      document.removeEventListener(
        'keydown',
        handleKeyDown,
      )

      if (
        previouslyFocused instanceof
        HTMLElement
      ) {
        previouslyFocused.focus()
      }
    }
  }, [onOpenChange, open, saving, store])

  if (!open) {
    return null
  }

  const save = () => {
    if (!draft || saving) {
      return
    }

    setSaving(true)
    setErrorMessage(null)

    void store.save(draft).then(
      () => {
        setSaving(false)
        onOpenChange(false)
      },
      (cause: unknown) => {
        setSaving(false)
        setErrorMessage(
          getErrorMessage(cause),
        )
      },
    )
  }

  const reset = () => {
    if (saving) {
      return
    }

    setSaving(true)
    setErrorMessage(null)

    void store.reset().then(
      (settings) => {
        setDraft(settings)
        setSaving(false)
      },
      (cause: unknown) => {
        setSaving(false)
        setErrorMessage(
          getErrorMessage(cause),
        )
      },
    )
  }

  return (
    <div
      className="fixed inset-0 z-100 grid place-items-center bg-black/45 p-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (
          event.target ===
            event.currentTarget &&
          !saving
        ) {
          onOpenChange(false)
        }
      }}
      role="presentation"
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="flex h-[min(680px,calc(100vh-48px))] w-[min(920px,calc(100vw-48px))] overflow-hidden rounded-xl border border-divider bg-background shadow-2xl outline-none"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <aside className="w-56 shrink-0 border-r border-divider bg-muted/30 p-4">
          <div className="mb-5 px-2">
            <h2
              className="text-base font-semibold"
              id={titleId}
            >
              设置
            </h2>

            <p
              className="mt-1 text-xs text-muted-foreground"
              id={descriptionId}
            >
              调整 Hybrid Canvas 的使用体验
            </p>
          </div>

          <nav
            aria-label="设置分类"
            className="space-y-1"
          >
            {SETTINGS_SECTIONS.map(
              (section) => (
                <button
                  aria-current={
                    activeSection ===
                    section.id
                      ? 'page'
                      : undefined
                  }
                  className={
                    activeSection ===
                    section.id
                      ? 'w-full rounded-md bg-accent px-3 py-2 text-left text-sm font-medium text-accent-foreground'
                      : 'w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground'
                  }
                  key={section.id}
                  onClick={() =>
                    setActiveSection(
                      section.id,
                    )
                  }
                  type="button"
                >
                  {section.label}
                </button>
              ),
            )}
          </nav>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center justify-between border-b border-divider px-6">
            <h3 className="text-sm font-semibold">
              {
                SETTINGS_SECTIONS.find(
                  (section) =>
                    section.id ===
                    activeSection,
                )?.label
              }
            </h3>

            <Button
              aria-label="关闭设置"
              disabled={saving}
              onClick={() =>
                onOpenChange(false)
              }
              size="icon"
              type="button"
              variant="ghost"
            >
              ×
            </Button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {loading ? (
              <p className="text-sm text-muted-foreground">
                正在读取设置…
              </p>
            ) : null}

            {errorMessage ? (
              <p
                className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                role="alert"
              >
                {errorMessage}
              </p>
            ) : null}

            {!loading &&
            draft &&
            activeSection ===
              'general' ? (
              <GeneralSettings
                settings={draft}
                onChange={setDraft}
              />
            ) : null}

            {!loading &&
            draft &&
            activeSection ===
              'canvas' ? (
              <CanvasSettingsForm
                settings={draft}
                onChange={setDraft}
              />
            ) : null}

            {activeSection ===
            'about' ? (
              <AboutSettings />
            ) : null}
          </div>

          <footer className="flex h-16 shrink-0 items-center justify-between border-t border-divider px-6">
            <Button
              disabled={
                loading || saving
              }
              onClick={reset}
              type="button"
              variant="ghost"
            >
              恢复默认
            </Button>

            <div className="flex gap-2">
              <Button
                disabled={saving}
                onClick={() =>
                  onOpenChange(false)
                }
                type="button"
                variant="ghost"
              >
                取消
              </Button>

              <Button
                disabled={
                  loading ||
                  saving ||
                  !draft
                }
                onClick={save}
                type="button"
              >
                {saving
                  ? '正在保存…'
                  : '保存'}
              </Button>
            </div>
          </footer>
        </section>
      </div>
    </div>
  )
}

function GeneralSettings({
  settings,
  onChange,
}: {
  readonly settings: AppSettings
  readonly onChange: (
    settings: AppSettings,
  ) => void
}) {
  return (
    <div className="space-y-8">
      <SettingsGroup
        description="选择应用界面的颜色模式。"
        title="外观"
      >
        <select
          aria-label="颜色模式"
          className="h-9 w-56 rounded-md border border-divider bg-background px-3 text-sm"
          onChange={(event) =>
            onChange({
              ...settings,
              theme:
                event.target
                  .value as ThemeMode,
            })
          }
          value={settings.theme}
        >
          <option value="light">
            浅色
          </option>
          <option value="dark">
            深色
          </option>
          <option value="system">
            跟随系统
          </option>
        </select>
      </SettingsGroup>

      <SettingsGroup
        description="控制应用界面使用的语言。"
        title="语言"
      >
        <select
          aria-label="界面语言"
          className="h-9 w-56 rounded-md border border-divider bg-background px-3 text-sm"
          onChange={(event) =>
            onChange({
              ...settings,
              language:
                event.target.value,
            })
          }
          value={settings.language}
        >
          <option value="zh-CN">
            简体中文
          </option>
          <option value="en">
            English
          </option>
        </select>
      </SettingsGroup>

      <SettingsToggle
        checked={settings.autoSave}
        description="编辑画布时自动保存到当前文件。"
        label="自动保存"
        onChange={(checked) =>
          onChange({
            ...settings,
            autoSave: checked,
          })
        }
      />
    </div>
  )
}

function CanvasSettingsForm({
  settings,
  onChange,
}: {
  readonly settings: AppSettings
  readonly onChange: (
    settings: AppSettings,
  ) => void
}) {
  return (
    <div className="space-y-6">
      <SettingsToggle
        checked={
          settings.canvas.showGrid
        }
        description="在画布背景中显示辅助网格。"
        label="显示网格"
        onChange={(checked) =>
          onChange({
            ...settings,
            canvas: {
              ...settings.canvas,
              showGrid: checked,
            },
          })
        }
      />

      <SettingsToggle
        checked={
          settings.canvas.snapToGrid
        }
        description="移动图形时自动吸附到网格。"
        label="吸附到网格"
        onChange={(checked) =>
          onChange({
            ...settings,
            canvas: {
              ...settings.canvas,
              snapToGrid: checked,
            },
          })
        }
      />

      <SettingsGroup
        description="新建画布时使用的默认缩放比例。"
        title="默认缩放"
      >
        <select
          aria-label="默认缩放比例"
          className="h-9 w-40 rounded-md border border-divider bg-background px-3 text-sm"
          onChange={(event) =>
            onChange({
              ...settings,
              canvas: {
                ...settings.canvas,
                defaultZoom:
                  Number(
                    event.target.value,
                  ),
              },
            })
          }
          value={
            settings.canvas.defaultZoom
          }
        >
          <option value="1">100%</option>
          <option value="0.75">
            75%
          </option>
          <option value="0.5">
            50%
          </option>
        </select>
      </SettingsGroup>
    </div>
  )
}

function AboutSettings() {
  return (
    <div className="max-w-xl rounded-lg border border-divider p-5">
      <h4 className="text-base font-semibold">
        Hybrid Canvas
      </h4>

      <p className="mt-2 text-sm text-muted-foreground">
        基于 tldraw 的本地优先画布应用。
      </p>

      <dl className="mt-5 grid grid-cols-[100px_1fr] gap-y-2 text-sm">
        <dt className="text-muted-foreground">
          版本
        </dt>
        <dd>0.1.0</dd>

        <dt className="text-muted-foreground">
          设置存储
        </dt>
        <dd>Tauri Store</dd>
      </dl>
    </div>
  )
}

function SettingsGroup({
  children,
  description,
  title,
}: {
  readonly children:
    React.ReactNode
  readonly description: string
  readonly title: string
}) {
  return (
    <section>
      <h4 className="text-sm font-semibold">
        {title}
      </h4>

      <p className="mt-1 text-sm text-muted-foreground">
        {description}
      </p>

      <div className="mt-4">
        {children}
      </div>
    </section>
  )
}

function SettingsToggle({
  checked,
  description,
  label,
  onChange,
}: {
  readonly checked: boolean
  readonly description: string
  readonly label: string
  readonly onChange: (
    checked: boolean,
  ) => void
}) {
  return (
    <label className="flex items-center justify-between gap-5 border-b border-divider py-4 last:border-b-0">
      <span>
        <span className="block text-sm font-medium">
          {label}
        </span>

        <span className="mt-1 block text-xs text-muted-foreground">
          {description}
        </span>
      </span>

      <input
        checked={checked}
        className="size-4"
        onChange={(event) =>
          onChange(
            event.target.checked,
          )
        }
        type="checkbox"
      />
    </label>
  )
}

function getErrorMessage(
  cause: unknown,
): string {
  return cause instanceof Error
    ? cause.message
    : '设置操作失败'
}
`,
  )
}

async function wireApplicationRuntime() {
  await edit(
    'apps/desktop/src/bootstrap/application.ts',
    (content) => {
      let updated = content

      updated = replaceOnce(
        updated,
        `  createDrawFileCommands,
  createFileDialog,
  createMainWindowController,
  type MainWindowController,`,
        `  createDesktopSettingsStore,
  createDrawFileCommands,
  createFileDialog,
  createMainWindowController,
  type MainWindowController,
  type SettingsStore,`,
        '导入 Desktop SettingsStore',
      )

      updated = replaceOnce(
        updated,
        `  readonly mainWindow: MainWindowController
  readonly dispose: () => void`,
        `  readonly mainWindow: MainWindowController
  readonly settings: SettingsStore
  readonly dispose: () => void`,
        'ApplicationRuntime 暴露 SettingsStore',
      )

      updated = replaceOnce(
        updated,
        `  const mainWindow = createMainWindowController()
  const editorSessions = createEditorSessionRegistry()`,
        `  const mainWindow = createMainWindowController()
  const settings = createDesktopSettingsStore()
  const editorSessions = createEditorSessionRegistry()`,
        '创建 SettingsStore',
      )

      updated = replaceOnce(
        updated,
        `    termination,
    mainWindow,

    dispose()`,
        `    termination,
    mainWindow,
    settings,

    dispose()`,
        '返回 SettingsStore',
      )

      return updated
    },
  )

  await edit(
    'apps/desktop/src/presentation/AppShell.tsx',
    (content) => {
      let updated = content

      updated = replaceOnce(
        updated,
        `import { SettingsDialog } from '@hybrid-canvas/settings/react'`,
        `import type { SettingsStore } from '@hybrid-canvas/settings'
import { SettingsDialog } from '@hybrid-canvas/settings/react'`,
        '导入 SettingsStore 类型',
      )

      updated = replaceOnce(
        updated,
        `  readonly mainWindow: MainWindowController
}`,
        `  readonly mainWindow: MainWindowController
  readonly settings: SettingsStore
}`,
        'AppShellRuntime 增加 settings',
      )

      updated = replaceOnce(
        updated,
        `      <SettingsDialog
        onOpenChange={setSettingsOpen}
        open={isSettingsOpen}
      />`,
        `      <SettingsDialog
        onOpenChange={setSettingsOpen}
        open={isSettingsOpen}
        store={runtime.settings}
      />`,
        'SettingsDialog 注入 SettingsStore',
      )

      return updated
    },
  )
}

function addDrawFileTests() {
  write(
    'editor/persistence/src/application/snapshot-service.test.ts',
    `import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  createDrawFileHeader,
  parseDrawDocument,
  serializeDrawDocument,
} from './snapshot-service'

function createValidJson(): string {
  return JSON.stringify({
    header: createDrawFileHeader(
      '2026-01-01T00:00:00.000Z',
    ),
    content: {
      document: {},
      session: {},
    },
  })
}

describe('draw snapshot service', () => {
  it('parses and serializes a valid draw container', () => {
    const parsed = parseDrawDocument(
      createValidJson(),
    )

    const serialized =
      serializeDrawDocument(
        parsed.content,
      )

    const reparsed =
      parseDrawDocument(serialized)

    expect(reparsed.header.format).toBe(
      'hybrid-canvas/draw',
    )

    expect(reparsed.header.version).toBe(1)

    expect(reparsed.content).toEqual(
      parsed.content,
    )
  })

  it('rejects a future file version', () => {
    const json = JSON.stringify({
      header: {
        format: 'hybrid-canvas/draw',
        version: 999,
        createdAt:
          '2026-01-01T00:00:00.000Z',
      },
      content: {
        document: {},
        session: {},
      },
    })

    expect(() =>
      parseDrawDocument(json),
    ).toThrow('DRAW_FUTURE_VERSION')
  })

  it('rejects an invalid format identifier', () => {
    const json = JSON.stringify({
      header: {
        format: 'unknown/draw',
        version: 1,
        createdAt:
          '2026-01-01T00:00:00.000Z',
      },
      content: {},
    })

    expect(() =>
      parseDrawDocument(json),
    ).toThrow('DRAW_INVALID_HEADER')
  })

  it('rejects invalid creation timestamps', () => {
    const json = JSON.stringify({
      header: {
        format: 'hybrid-canvas/draw',
        version: 1,
        createdAt: 'not-a-date',
      },
      content: {},
    })

    expect(() =>
      parseDrawDocument(json),
    ).toThrow('DRAW_INVALID_CREATED_AT')
  })

  it('rejects excessive nesting', () => {
    let value = {}

    for (let index = 0; index < 140; index += 1) {
      value = { child: value }
    }

    const json = JSON.stringify({
      header: createDrawFileHeader(),
      content: value,
    })

    expect(() =>
      parseDrawDocument(json),
    ).toThrow('DRAW_DEPTH_EXCEEDED')
  })
})
`,
  )
}

async function addNativeFileSizeBoundary() {
  await edit(
    'apps/desktop/src-tauri/src/commands/file.rs',
    (content) => {
      let updated = content

      updated = replaceOnce(
        updated,
        `use tauri_plugin_store::StoreExt;

#[derive(Debug, Deserialize, Type)]`,
        `use tauri_plugin_store::StoreExt;

const MAX_DRAW_FILE_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Debug, Deserialize, Type)]`,
        '增加原生 draw 文件大小上限',
      )

      updated = replaceOnce(
        updated,
        `pub async fn file_save_draw(request: DrawSaveRequest) -> Result<()> {
    let path = PathBuf::from(&request.path);

    if let Some(parent) = path.parent() {`,
        `pub async fn file_save_draw(request: DrawSaveRequest) -> Result<()> {
    if request.content.len() as u64 > MAX_DRAW_FILE_BYTES {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "DRAW_FILE_TOO_LARGE",
        )
        .into());
    }

    let path = PathBuf::from(&request.path);

    if let Some(parent) = path.parent() {`,
        '保存前检查 draw 文件大小',
      )

      updated = replaceOnce(
        updated,
        `pub async fn file_read_draw(path: String) -> Result<DrawReadResult> {
    let content = std::fs::read_to_string(&path)?;
    Ok(DrawReadResult { content })
}`,
        `pub async fn file_read_draw(path: String) -> Result<DrawReadResult> {
    let metadata = std::fs::metadata(&path)?;

    if metadata.len() > MAX_DRAW_FILE_BYTES {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "DRAW_FILE_TOO_LARGE",
        )
        .into());
    }

    let content = std::fs::read_to_string(&path)?;
    Ok(DrawReadResult { content })
}`,
        '读取前检查 draw 文件大小',
      )

      updated = replaceOnce(
        updated,
        `pub async fn file_create_draw(path: String, content: String) -> Result<DrawReadResult> {
    let file_path = PathBuf::from(&path);`,
        `pub async fn file_create_draw(path: String, content: String) -> Result<DrawReadResult> {
    if content.len() as u64 > MAX_DRAW_FILE_BYTES {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "DRAW_FILE_TOO_LARGE",
        )
        .into());
    }

    let file_path = PathBuf::from(&path);`,
        '创建前检查 draw 文件大小',
      )

      return updated
    },
  )
}

async function alignRustSettingsDefaults() {
  await edit(
    'apps/desktop/src-tauri/src/commands/settings.rs',
    (content) =>
      replaceOnce(
        content,
        `            language: "en".into(),`,
        `            language: "zh-CN".into(),`,
        '统一 Rust 和前端默认语言',
      ),
  )
}

async function updateProgressDocument() {
  await edit(
    'docs/architecture/refactor-progress.md',
    (content) => {
      let updated = content

      updated = updated.replace(
        `| 4. Dependency and performance baselines | In progress | Import graph and Vite bundle manifest |`,
        `| 4. Dependency and performance baselines | Complete | Import graph and Vite bundle manifest |`,
      )

      updated = updated.replace(
        `| 5. Compatibility and release verification | Pending | File fixtures, native failure recovery and final performance budgets |`,
        `| 5. Compatibility and release verification | In progress | Settings IPC aligned, draw fixtures and native size boundaries added |`,
      )

      updated = updated.replace(
        `- Establish .draw round-trip fixtures and corrupt-file cases.
- Verify atomic save and crash recovery in the Rust layer.
- Record initial bundle, startup and multi-canvas memory baselines.
- Add explicit performance budgets after the first stable baseline.
- Complete settings persistence wiring.
- Run desktop E2E coverage for title-bar drag, close and recovery paths.`,
        `- Add path capability tokens so draw commands cannot receive arbitrary paths.
- Add crash-recovery integration tests around atomic_write.
- Record startup and multi-canvas memory baselines.
- Add explicit performance budgets after the first stable baseline.
- Run desktop E2E coverage for title-bar drag, close and recovery paths.`,
      )

      return updated
    },
  )
}

async function createBackup() {
  const stamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')

  const backupRoot = absolute(
    `.refactor-backup/${stamp}`,
  )

  for (const relativePath of writes.keys()) {
    if (!(await exists(relativePath))) {
      continue
    }

    const backupPath = resolve(
      backupRoot,
      relativePath,
    )

    await mkdir(dirname(backupPath), {
      recursive: true,
    })

    await cp(
      absolute(relativePath),
      backupPath,
      { recursive: true },
    )
  }

  return backupRoot
}

async function applyWrites() {
  for (const [relativePath, content] of writes) {
    await mkdir(
      dirname(absolute(relativePath)),
      { recursive: true },
    )

    await writeFile(
      absolute(relativePath),
      content,
      'utf8',
    )
  }
}

function printPlan() {
  console.log('')
  console.log(
    shouldWrite
      ? 'Phase 5 修改：'
      : 'Phase 5 预览（尚未写入）：',
  )

  for (const relativePath of writes.keys()) {
    console.log(`  WRITE ${relativePath}`)
  }

  console.log('')
}

async function main() {
  await assertPhase4Completed()

  createSettingsDomain()
  createDesktopSettingsAdapter()
  createSettingsDialog()
  await wireApplicationRuntime()
  addDrawFileTests()
  await addNativeFileSizeBoundary()
  await alignRustSettingsDefaults()
  await updateProgressDocument()

  printPlan()

  if (!shouldWrite) {
    console.log('Phase 5 前置检查通过。')
    console.log('')
    console.log('实际写入：')
    console.log('')
    console.log(
      '  node scripts/refactor-architecture-phase5.mjs --write',
    )
    console.log('')
    return
  }

  const backupRoot = await createBackup()
  await applyWrites()

  console.log(
    `备份目录：${relative(root, backupRoot)}`,
  )
  console.log('')
  console.log('必须执行：')
  console.log('')
  console.log('  pnpm install')
  console.log('  pnpm format')
  console.log('  pnpm lint')
  console.log('  pnpm test:architecture')
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('  cargo fmt --check')
  console.log('  cargo clippy --workspace --all-targets --all-features -- -D warnings')
  console.log('  cargo test --workspace --all-features')
  console.log('')
}

main().catch((error) => {
  console.error('')
  console.error('Phase 5 执行失败。')
  console.error(error)
  process.exitCode = 1
})