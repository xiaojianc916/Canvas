import { GeoShapeGeoStyle } from 'tldraw'
import {
  GEO_SHAPE_OPTIONS,
  ShapeInspectorSection,
  ShapeInspectorSelect,
} from '../common/InspectorPrimitives'
import {
  getCommonStringProp,
  SelectionArrangementSection,
  SelectionColorSection,
  SelectionFillSection,
  type SelectionInspectorProps,
  SelectionInspectorLayout,
  SelectionObjectActionsSection,
  SelectionStrokeSections,
} from './SelectionInspectorShared'

export function GeoSelectionInspector({ editor, shapes }: SelectionInspectorProps) {
  const commonGeo = getCommonStringProp(shapes, 'geo') ?? 'rectangle'

  const updateGeo = (geo: string) => {
    editor.setStyleForSelectedShapes(GeoShapeGeoStyle, geo as never)
  }

  const sharedProps = { editor, shapes }

  return (
    <SelectionInspectorLayout description="编辑形状几何、填充和描边。" title="形状">
      <ShapeInspectorSection title="形状类型">
        <ShapeInspectorSelect
          onChange={updateGeo}
          options={GEO_SHAPE_OPTIONS}
          type="形状"
          value={commonGeo}
        />
      </ShapeInspectorSection>

      <SelectionColorSection {...sharedProps} />
      <SelectionFillSection {...sharedProps} />
      <SelectionStrokeSections {...sharedProps} />
      <SelectionArrangementSection {...sharedProps} />
      <SelectionObjectActionsSection {...sharedProps} />
    </SelectionInspectorLayout>
  )
}
