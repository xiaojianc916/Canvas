#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()
const APPLY = process.argv.includes('--apply')
const ROLLBACK = process.argv.includes('--rollback')
const ALLOW_DIRTY =
  process.argv.includes('--allow-dirty')

const TARGET_FILE =
  'features/settings/src/presentation/SettingsDialog.tsx'

const BACKUP_DIRECTORY = path.join(
  ROOT,
  '.canvas-ui-phase-2b-backup',
)

const BACKUP_FILE = path.join(
  BACKUP_DIRECTORY,
  TARGET_FILE,
)

const MANIFEST_FILE = path.join(
  BACKUP_DIRECTORY,
  'manifest.json',
)

function absolute(relativePath) {
  return path.join(ROOT, relativePath)
}

function assertRepository() {
  const packageFile = absolute(
    'package.json',
  )

  if (!fs.existsSync(packageFile)) {
    throw new Error(
      '请在 Canvas 仓库根目录运行脚本。',
    )
  }

  const packageJson = JSON.parse(
    fs.readFileSync(packageFile, 'utf8'),
  )

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error(
      '当前目录不是 hybrid-canvas 仓库。',
    )
  }

  const targetFile = absolute(
    TARGET_FILE,
  )

  if (!fs.existsSync(targetFile)) {
    throw new Error(
      '缺少目标文件：' + TARGET_FILE,
    )
  }

  if (ROLLBACK || ALLOW_DIRTY) {
    return
  }

  const status = execFileSync(
    'git',
    ['status', '--porcelain'],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  ).trim()

  if (status.length > 0) {
    throw new Error(
      '当前 Git 工作区存在未提交修改。' +
        '请先提交，或添加 --allow-dirty。',
    )
  }
}

const SETTINGS_DIALOG_SOURCE = String.raw`import {
  applyThemePreference,
  Button,
  Dialog,
  ErrorState,
  Field,
  LoadingState,
  Select,
  Switch,
} from '@hybrid-canvas/design-system'
import type {
  AppSettings,
  SettingsStore,
  ThemeMode,
} from '@hybrid-canvas/settings'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

type SettingsSection =
  | 'general'
  | 'canvas'
  | 'about'

type SettingsOperation =
  | 'load'
  | 'save'
  | 'reset'

type SettingsViewState =
  | {
      readonly status: 'idle'
    }
  | {
      readonly status: 'loading'
    }
  | {
      readonly status: 'ready'
      readonly draft: AppSettings
    }
  | {
      readonly status: 'saving'
      readonly operation:
        | 'save'
        | 'reset'
      readonly draft: AppSettings
    }
  | {
      readonly status: 'error'
      readonly operation: SettingsOperation
      readonly message: string
      readonly draft?: AppSettings
    }

interface SettingsSectionItem {
  readonly id: SettingsSection
  readonly label: string
}

const SECTIONS:
  readonly SettingsSectionItem[] = [
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
  ]

export interface SettingsDialogProps {
  readonly open: boolean
  readonly store: SettingsStore
  readonly onOpenChange:
    (open: boolean) => void
}

export function SettingsDialog({
  open,
  store,
  onOpenChange,
}: SettingsDialogProps) {
  const [
    section,
    setSection,
  ] = useState<SettingsSection>(
    'general',
  )

  const [
    state,
    setState,
  ] = useState<SettingsViewState>({
    status: 'idle',
  })

  const initialSettingsRef =
    useRef<AppSettings | null>(null)

  const requestIdRef =
    useRef(0)

  const loadSettings =
    useCallback(() => {
      const requestId =
        requestIdRef.current + 1

      requestIdRef.current =
        requestId

      setState({
        status: 'loading',
      })

      void store.load().then(
        (settings) => {
          if (
            requestIdRef.current !==
            requestId
          ) {
            return
          }

          initialSettingsRef.current =
            settings

          applyThemePreference(
            settings.theme,
          )

          setState({
            status: 'ready',
            draft: settings,
          })
        },
        (cause: unknown) => {
          if (
            requestIdRef.current !==
            requestId
          ) {
            return
          }

          setState({
            status: 'error',
            operation: 'load',
            message:
              getErrorMessage(cause),
          })
        },
      )
    }, [
      store,
    ])

  useEffect(() => {
    if (!open) {
      requestIdRef.current += 1
      return
    }

    setSection('general')
    loadSettings()

    return () => {
      requestIdRef.current += 1
    }
  }, [
    loadSettings,
    open,
  ])

  const draft =
    getDraft(state)

  const busy =
    state.status === 'saving'

  const updateDraft = (
    nextSettings: AppSettings,
  ) => {
    if (busy) {
      return
    }

    applyThemePreference(
      nextSettings.theme,
    )

    setState({
      status: 'ready',
      draft: nextSettings,
    })
  }

  const closeDialog = () => {
    if (busy) {
      return
    }

    const initialSettings =
      initialSettingsRef.current

    if (initialSettings) {
      applyThemePreference(
        initialSettings.theme,
      )
    }

    onOpenChange(false)
  }

  const saveSettings = () => {
    if (!draft || busy) {
      return
    }

    const settingsToSave = draft

    setState({
      status: 'saving',
      operation: 'save',
      draft: settingsToSave,
    })

    void store.save(
      settingsToSave,
    ).then(
      () => {
        initialSettingsRef.current =
          settingsToSave

        applyThemePreference(
          settingsToSave.theme,
        )

        setState({
          status: 'ready',
          draft: settingsToSave,
        })

        onOpenChange(false)
      },
      (cause: unknown) => {
        setState({
          status: 'error',
          operation: 'save',
          message:
            getErrorMessage(cause),
          draft: settingsToSave,
        })
      },
    )
  }

  const resetSettings = () => {
    if (!draft || busy) {
      return
    }

    const currentDraft = draft

    setState({
      status: 'saving',
      operation: 'reset',
      draft: currentDraft,
    })

    void store.reset().then(
      (resetSettingsValue) => {
        initialSettingsRef.current =
          resetSettingsValue

        applyThemePreference(
          resetSettingsValue.theme,
        )

        setState({
          status: 'ready',
          draft:
            resetSettingsValue,
        })
      },
      (cause: unknown) => {
        setState({
          status: 'error',
          operation: 'reset',
          message:
            getErrorMessage(cause),
          draft: currentDraft,
        })
      },
    )
  }

  const retryLastOperation = () => {
    if (
      state.status !== 'error'
    ) {
      return
    }

    if (
      state.operation === 'load'
    ) {
      loadSettings()
      return
    }

    if (
      state.operation === 'save'
    ) {
      saveSettings()
      return
    }

    resetSettings()
  }

  return (
    <Dialog
      open={open}
      busy={busy}
      className={[
        'h-[min(680px,calc(100dvh-2rem))]',
        'max-w-[920px]',
        'max-sm:h-dvh',
        'max-sm:max-h-dvh',
        'max-sm:rounded-none',
      ].join(' ')}
      closeOnOverlayClick={!busy}
      description="调整 Hybrid Canvas 的使用体验"
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          closeDialog()
        }
      }}
      title="设置"
      footer={
        <SettingsFooter
          busy={busy}
          canReset={Boolean(draft)}
          canSave={Boolean(draft)}
          operation={
            state.status === 'saving'
              ? state.operation
              : undefined
          }
          onCancel={closeDialog}
          onReset={resetSettings}
          onSave={saveSettings}
        />
      }
    >
      <div
        className={[
          'grid h-full min-h-0',
          'grid-cols-[224px_minmax(0,1fr)]',
          'max-sm:grid-cols-1',
          'max-sm:grid-rows-[auto_minmax(0,1fr)]',
        ].join(' ')}
      >
        <SettingsNavigation
          activeSection={section}
          onSectionChange={
            setSection
          }
        />

        <main
          className={[
            'min-h-0 overflow-y-auto',
            'p-6 max-sm:p-4',
          ].join(' ')}
        >
          {state.status === 'idle' ||
          state.status === 'loading' ? (
            <LoadingState
              label="正在读取设置…"
            />
          ) : null}

          {state.status === 'error' &&
          !state.draft ? (
            <ErrorState
              message={state.message}
              onRetry={
                retryLastOperation
              }
            />
          ) : null}

          {state.status === 'error' &&
          state.draft ? (
            <SettingsErrorBanner
              message={state.message}
              operation={
                state.operation
              }
              onRetry={
                retryLastOperation
              }
            />
          ) : null}

          {draft &&
          section === 'general' ? (
            <GeneralSettingsPanel
              settings={draft}
              onChange={updateDraft}
            />
          ) : null}

          {draft &&
          section === 'canvas' ? (
            <CanvasSettingsPanel
              settings={draft}
              onChange={updateDraft}
            />
          ) : null}

          {section === 'about' ? (
            <AboutSettingsPanel />
          ) : null}
        </main>
      </div>
    </Dialog>
  )
}

interface SettingsNavigationProps {
  readonly activeSection:
    SettingsSection
  readonly onSectionChange:
    (section: SettingsSection) => void
}

function SettingsNavigation({
  activeSection,
  onSectionChange,
}: SettingsNavigationProps) {
  return (
    <nav
      aria-label="设置分类"
      className={[
        'border-r border-divider',
        'bg-muted/30 p-4',
        'max-sm:flex',
        'max-sm:gap-1',
        'max-sm:overflow-x-auto',
        'max-sm:border-b',
        'max-sm:border-r-0',
        'max-sm:p-2',
      ].join(' ')}
    >
      {SECTIONS.map((item) => {
        const active =
          activeSection === item.id

        return (
          <button
            key={item.id}
            aria-current={
              active
                ? 'page'
                : undefined
            }
            className={[
              'w-full rounded-md',
              'px-3 py-2',
              'text-left text-sm',
              'outline-none',
              'focus-visible:ring-2',
              'focus-visible:ring-ring',
              'max-sm:w-auto',
              'max-sm:shrink-0',
              active
                ? 'bg-accent font-medium text-accent-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            ].join(' ')}
            onClick={() => {
              onSectionChange(
                item.id,
              )
            }}
            type="button"
          >
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}

interface SettingsPanelProps {
  readonly settings: AppSettings
  readonly onChange:
    (settings: AppSettings) => void
}

function GeneralSettingsPanel({
  settings,
  onChange,
}: SettingsPanelProps) {
  return (
    <section
      aria-labelledby="general-settings-title"
      className="grid max-w-xl gap-8"
    >
      <header>
        <h3
          id="general-settings-title"
          className="text-base font-semibold"
        >
          常规
        </h3>

        <p
          className={[
            'mt-1 text-sm',
            'text-muted-foreground',
          ].join(' ')}
        >
          调整应用外观、语言和保存行为。
        </p>
      </header>

      <Field
        label="外观"
        description="选择应用界面的颜色模式。"
      >
        {({
          inputId,
          describedBy,
        }) => (
          <Select
            id={inputId}
            aria-describedby={
              describedBy
            }
            value={settings.theme}
            onChange={(event) => {
              onChange({
                ...settings,
                theme:
                  event.target
                    .value as ThemeMode,
              })
            }}
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
          </Select>
        )}
      </Field>

      <Field
        label="语言"
        description="控制应用界面使用的语言。"
      >
        {({
          inputId,
          describedBy,
        }) => (
          <Select
            id={inputId}
            aria-describedby={
              describedBy
            }
            value={settings.language}
            onChange={(event) => {
              onChange({
                ...settings,
                language:
                  event.target.value as
                    AppSettings['language'],
              })
            }}
          >
            <option value="zh-CN">
              简体中文
            </option>

            <option value="en">
              English
            </option>
          </Select>
        )}
      </Field>

      <SettingsToggle
        checked={settings.autoSave}
        description="编辑画布时自动保存到当前文件。"
        label="自动保存"
        onChange={(checked) => {
          onChange({
            ...settings,
            autoSave: checked,
          })
        }}
      />
    </section>
  )
}

function CanvasSettingsPanel({
  settings,
  onChange,
}: SettingsPanelProps) {
  return (
    <section
      aria-labelledby="canvas-settings-title"
      className="grid max-w-xl gap-6"
    >
      <header>
        <h3
          id="canvas-settings-title"
          className="text-base font-semibold"
        >
          画布
        </h3>

        <p
          className={[
            'mt-1 text-sm',
            'text-muted-foreground',
          ].join(' ')}
        >
          调整网格、吸附和默认缩放。
        </p>
      </header>

      <SettingsToggle
        checked={
          settings.canvas.showGrid
        }
        description="在画布背景中显示辅助网格。"
        label="显示网格"
        onChange={(checked) => {
          onChange({
            ...settings,
            canvas: {
              ...settings.canvas,
              showGrid: checked,
            },
          })
        }}
      />

      <SettingsToggle
        checked={
          settings.canvas.snapToGrid
        }
        description="移动图形时自动吸附到网格。"
        label="吸附到网格"
        onChange={(checked) => {
          onChange({
            ...settings,
            canvas: {
              ...settings.canvas,
              snapToGrid: checked,
            },
          })
        }}
      />

      <Field
        label="默认缩放"
        description="新建画布时使用的默认缩放比例。"
      >
        {({
          inputId,
          describedBy,
        }) => (
          <Select
            id={inputId}
            aria-describedby={
              describedBy
            }
            value={
              settings.canvas.defaultZoom
            }
            onChange={(event) => {
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
            }}
          >
            <option value="1">
              100%
            </option>

            <option value="0.75">
              75%
            </option>

            <option value="0.5">
              50%
            </option>
          </Select>
        )}
      </Field>
    </section>
  )
}

interface SettingsToggleProps {
  readonly checked: boolean
  readonly label: string
  readonly description: string
  readonly onChange:
    (checked: boolean) => void
}

function SettingsToggle({
  checked,
  label,
  description,
  onChange,
}: SettingsToggleProps) {
  return (
    <div
      className={[
        'flex min-h-14',
        'items-center',
        'justify-between',
        'gap-5',
        'border-b',
        'border-divider',
        'py-3',
      ].join(' ')}
    >
      <div>
        <div className="text-sm font-medium">
          {label}
        </div>

        <p
          className={[
            'mt-1 text-xs',
            'leading-5',
            'text-muted-foreground',
          ].join(' ')}
        >
          {description}
        </p>
      </div>

      <Switch
        aria-label={label}
        checked={checked}
        onCheckedChange={onChange}
      />
    </div>
  )
}

function AboutSettingsPanel() {
  return (
    <section
      aria-labelledby="about-settings-title"
      className={[
        'max-w-xl rounded-lg',
        'border border-divider',
        'p-5',
      ].join(' ')}
    >
      <h3
        id="about-settings-title"
        className="text-base font-semibold"
      >
        Hybrid Canvas
      </h3>

      <p
        className={[
          'mt-2 text-sm',
          'text-muted-foreground',
        ].join(' ')}
      >
        基于 tldraw 的本地优先画布应用。
      </p>

      <dl
        className={[
          'mt-5 grid',
          'grid-cols-[100px_1fr]',
          'gap-y-2 text-sm',
        ].join(' ')}
      >
        <dt className="text-muted-foreground">
          版本
        </dt>

        <dd>0.1.0</dd>

        <dt className="text-muted-foreground">
          设置存储
        </dt>

        <dd>Tauri Store</dd>
      </dl>
    </section>
  )
}

interface SettingsFooterProps {
  readonly busy: boolean
  readonly canSave: boolean
  readonly canReset: boolean
  readonly operation?:
    | 'save'
    | 'reset'
  readonly onSave: () => void
  readonly onReset: () => void
  readonly onCancel: () => void
}

function SettingsFooter({
  busy,
  canSave,
  canReset,
  operation,
  onSave,
  onReset,
  onCancel,
}: SettingsFooterProps) {
  return (
    <div
      className={[
        'flex flex-wrap',
        'items-center',
        'justify-between',
        'gap-3',
      ].join(' ')}
    >
      <Button
        disabled={
          busy || !canReset
        }
        onClick={onReset}
        type="button"
        variant="ghost"
      >
        {busy &&
        operation === 'reset'
          ? '正在重置…'
          : '恢复默认'}
      </Button>

      <div className="flex gap-2">
        <Button
          disabled={busy}
          onClick={onCancel}
          type="button"
          variant="ghost"
        >
          取消
        </Button>

        <Button
          disabled={
            busy || !canSave
          }
          onClick={onSave}
          type="button"
        >
          {busy &&
          operation === 'save'
            ? '正在保存…'
            : '保存'}
        </Button>
      </div>
    </div>
  )
}

interface SettingsErrorBannerProps {
  readonly operation:
    SettingsOperation
  readonly message: string
  readonly onRetry: () => void
}

function SettingsErrorBanner({
  operation,
  message,
  onRetry,
}: SettingsErrorBannerProps) {
  return (
    <div
      className={[
        'mb-5 rounded-md',
        'border',
        'border-destructive/30',
        'bg-destructive/10',
        'p-3',
      ].join(' ')}
      role="alert"
    >
      <p
        className={[
          'text-sm',
          'text-destructive',
        ].join(' ')}
      >
        {getOperationLabel(
          operation,
        )}
        ：{message}
      </p>

      <Button
        className="mt-3"
        onClick={onRetry}
        size="sm"
        type="button"
        variant="outline"
      >
        重试
      </Button>
    </div>
  )
}

function getDraft(
  state: SettingsViewState,
): AppSettings | undefined {
  if ('draft' in state) {
    return state.draft
  }

  return undefined
}

function getOperationLabel(
  operation: SettingsOperation,
): string {
  if (operation === 'load') {
    return '读取设置失败'
  }

  if (operation === 'save') {
    return '保存设置失败'
  }

  return '重置设置失败'
}

function getErrorMessage(
  cause: unknown,
): string {
  if (
    cause instanceof Error &&
    cause.message.trim().length > 0
  ) {
    return cause.message
  }

  return '设置操作失败，请重试。'
}
`

function backupCurrentFile() {
  const sourceFile = absolute(
    TARGET_FILE,
  )

  fs.mkdirSync(
    path.dirname(BACKUP_FILE),
    {
      recursive: true,
    },
  )

  fs.copyFileSync(
    sourceFile,
    BACKUP_FILE,
  )

  fs.writeFileSync(
    MANIFEST_FILE,
    JSON.stringify(
      {
        createdAt:
          new Date().toISOString(),

        targetFile:
          TARGET_FILE,
      },
      null,
      2,
    ),
    'utf8',
  )
}

function applyRefactor() {
  if (fs.existsSync(BACKUP_DIRECTORY)) {
    throw new Error(
      'Phase 2B 备份目录已经存在。' +
        '请先回滚或删除该备份目录。',
    )
  }

  backupCurrentFile()

  fs.writeFileSync(
    absolute(TARGET_FILE),
    SETTINGS_DIALOG_SOURCE,
    'utf8',
  )

  console.log(
    'Phase 2B 已应用：' +
      TARGET_FILE,
  )
}

function rollbackRefactor() {
  if (
    !fs.existsSync(MANIFEST_FILE) ||
    !fs.existsSync(BACKUP_FILE)
  ) {
    throw new Error(
      '没有找到 Phase 2B 回滚文件。',
    )
  }

  fs.copyFileSync(
    BACKUP_FILE,
    absolute(TARGET_FILE),
  )

  fs.rmSync(
    BACKUP_DIRECTORY,
    {
      recursive: true,
      force: true,
    },
  )

  console.log(
    'Phase 2B 已回滚。',
  )
}

function printPlan() {
  const currentContent =
    fs.readFileSync(
      absolute(TARGET_FILE),
      'utf8',
    )

  if (
    currentContent ===
    SETTINGS_DIALOG_SOURCE
  ) {
    console.log(
      'SettingsDialog 已经是目标版本。',
    )

    return false
  }

  console.log(
    'Phase 2B 将重构：',
  )

  console.log(
    '- ' + TARGET_FILE,
  )

  console.log(
    '- 使用判别联合管理加载、保存和错误状态',
  )

  console.log(
    '- 支持主题实时预览和取消恢复',
  )

  console.log(
    '- 支持读取、保存和重置失败重试',
  )

  console.log(
    '- 使用统一 Dialog、Field、Select、Switch',
  )

  console.log(
    '- 增加窄屏全屏布局',
  )

  return true
}

function main() {
  assertRepository()

  if (ROLLBACK) {
    rollbackRefactor()
    return
  }

  const hasChanges =
    printPlan()

  if (!hasChanges) {
    return
  }

  if (!APPLY) {
    console.log('')
    console.log(
      '当前为预检模式，没有写入文件。',
    )

    console.log(
      '应用：node tooling/script/refactor-ui-phase-2b.mjs --apply --allow-dirty',
    )

    return
  }

  applyRefactor()

  console.log('')
  console.log('请执行：')
  console.log('pnpm format')
  console.log('pnpm lint')
  console.log('pnpm typecheck')
  console.log('pnpm test:architecture')
  console.log('pnpm test')
  console.log('pnpm build:desktop')
  console.log('')
  console.log('回滚：')
  console.log(
    'node tooling/script/refactor-ui-phase-2b.mjs --rollback --allow-dirty',
  )
}

try {
  main()
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : error,
  )

  process.exitCode = 1
}