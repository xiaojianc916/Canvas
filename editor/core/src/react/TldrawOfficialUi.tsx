import {
  DefaultNavigationPanel,
  DefaultStylePanel,
  DefaultStylePanelContent,
  DefaultToolbar,
} from 'tldraw'
import { createPortal } from 'react-dom'

export interface TldrawOfficialUiProps {
  readonly stylePanelHost: HTMLElement | null
}

/**
 * tldraw 官方 UI 的 Canvas 布局适配层。
 *
 * Canvas 只重新安排 UI 位置，不复制：
 * - 工具注册表
 * - selection 状态
 * - 样式状态
 * - 快捷键
 * - Undo/Redo
 * - shape 写入逻辑
 */
export function TldrawOfficialUi({
  stylePanelHost,
}: TldrawOfficialUiProps) {
  return (
    <>
      <div className="hc-tldraw-toolbar">
        <DefaultToolbar
          maxItems={64}
          maxSizePx={1600}
          minItems={8}
          minSizePx={520}
          orientation="horizontal"
        />
      </div>

      <div className="hc-tldraw-navigation">
        <DefaultNavigationPanel />
      </div>

      {stylePanelHost
        ? createPortal(
            <DefaultStylePanel>
              {/*
               * DefaultStylePanelContent 内部包含官方：
               * - StylePanelColorPicker
               * - StylePanelOpacityPicker
               * - StylePanelFillPicker
               * - StylePanelDashPicker
               * - StylePanelSizePicker
               * - StylePanelFontPicker
               * - 文本和标签对齐
               * - Geo / Arrow / Spline 样式
               *
               * StylePanelColorPicker 的选项来自：
               * editor.getCurrentTheme().colors
               *
               * Canvas 不维护硬编码颜色数组。
               */}
              <DefaultStylePanelContent />
            </DefaultStylePanel>,
            stylePanelHost,
          )
        : null}
    </>
  )
}
