import {
  DefaultNavigationPanel,
  DefaultPageMenu,
  DefaultStylePanel,
  DefaultStylePanelContent,
  DefaultToolbar,
} from 'tldraw'
import { createPortal } from 'react-dom'

export interface TldrawOfficialUiProps {
  /**
   * EditorCanvas 右侧样式栏的 DOM 挂载点。
   *
   * React portal 会保留 tldraw React context，因此官方 StylePanel
   * 仍然直接读取 Editor、selection、shared styles 和 TLStore。
   */
  readonly stylePanelHost: HTMLElement | null
}

/**
 * Canvas 只负责重新布置 tldraw 官方 UI。
 *
 * 不复制工具定义、样式状态、selection 状态、快捷键或 shape 更新逻辑。
 */
export function TldrawOfficialUi({
  stylePanelHost,
}: TldrawOfficialUiProps) {
  return (
    <>
      <div className="hc-tldraw-page-menu">
        <DefaultPageMenu />
      </div>

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
              <DefaultStylePanelContent />
            </DefaultStylePanel>,
            stylePanelHost,
          )
        : null}
    </>
  )
}
