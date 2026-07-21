import { invoke } from '@hybrid-canvas/desktop-ipc'
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
