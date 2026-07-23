import { GeoShapeGeoStyle, useValue } from 'tldraw'
import {
  GEO_SHAPE_OPTIONS,
  ShapeInspectorSection,
  ShapeInspectorSelect,
  ToolColorSection,
  ToolDashSection,
  ToolFillSection,
  ToolPanelHeader,
  ToolStrokeSizeSection,
} from '../common/InspectorPrimitives'
import type { ToolInspectorProps } from './types'

export function ShapeToolInspector({ editor }: ToolInspectorProps) {
  const currentGeo = useValue(
    'inspector next geo shape',
    () => editor.getStyleForNextShape(GeoShapeGeoStyle),
    [editor],
  )

  return (
    <ToolPanelHeader description="在画布中拖动创建形状；以下参数用于下一个新形状。" title="形状">
      <ShapeInspectorSection title="形状类型">
        <ShapeInspectorSelect
          onChange={(value) => editor.setStyleForNextShapes(GeoShapeGeoStyle, value as never)}
          options={GEO_SHAPE_OPTIONS}
          type="形状"
          value={currentGeo}
        />
      </ShapeInspectorSection>

      <ToolColorSection editor={editor} />
      <ToolFillSection editor={editor} />
      <ToolDashSection editor={editor} />
      <ToolStrokeSizeSection editor={editor} />
    </ToolPanelHeader>
  )
}
