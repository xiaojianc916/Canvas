import {
  DefaultNavigationPanel,
  DefaultToolbar,
} from 'tldraw'

export interface TldrawOfficialUiProps {}

/**
 * 只在画布中放置 tldraw 官方 Toolbar 和 NavigationPanel。
 *
 * 属性检查器由 Workspace 原生 CanvasInspectorContent 负责，
 * 不再把 DefaultStylePanel 强行嵌入画布。
 */
export function TldrawOfficialUi(
  _props: TldrawOfficialUiProps = {},
) {
  return (
    <>
      <div className="hc-tldraw-toolbar">
        {/*
         * 不设置 maxItems={64}。
         *
         * 使用官方默认：
         * - minItems=4
         * - maxItems=8
         * - minSizePx=310
         * - maxSizePx=470
         *
         * 多余工具进入官方 overflow，不再全部挤成一条。
         */}
        <DefaultToolbar />
      </div>

      <div className="hc-tldraw-navigation">
        <DefaultNavigationPanel />
      </div>
    </>
  )
}
