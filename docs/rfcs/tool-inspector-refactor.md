# Tool Inspector Refactor

## Status

Phase 1 establishes the structural boundary for the contextual tool inspector.

This RFC does not declare all tool inspectors complete. Completion must be
verified by implementation, tests, and visual review.

## Product rule

The right sidebar follows the current editor context:

1. When a creation tool is active and no object is selected, show the defaults
   and behavior for that tool.
2. When the Select tool owns a selection, show the selected object's actual
   properties.
3. When multiple objects are selected, show common properties, mixed values,
   alignment, distribution, grouping, and ordering.
4. When a specialized editing state is active, such as path editing, cropping,
   or chart-series editing, show the controls for that editing state.
5. Data and interaction controls are object capabilities. They are not
   permanent global tabs.

## Ownership

- tldraw Editor and TLStore remain the source of truth.
- The inspector must derive selection and active-tool state directly from the
  Editor.
- The inspector must not introduce a second selection, tool, style, or history
  store.
- Document mutations must use Editor or Store transactions.
- Undo and redo remain owned by tldraw History.
- Feature-specific inspectors should be contributed by the owning feature.

## Target structure

```text
apps/desktop/src/presentation/workspace/inspector/
├── CanvasInspectorContent.tsx
├── ToolInspectorRouter.tsx
├── SelectionInspectorRouter.tsx
├── context/
│   ├── inspector-context.ts
│   └── use-inspector-context.ts
├── common/
│   ├── InspectorHeader.tsx
│   ├── InspectorSection.tsx
│   ├── MixedValue.tsx
│   ├── NumericField.tsx
│   ├── ColorControl.tsx
│   ├── StrokeControl.tsx
│   ├── TransformSection.tsx
│   └── ArrangementSection.tsx
├── tools/
│   ├── SelectToolInspector.tsx
│   ├── HandToolInspector.tsx
│   ├── ShapeToolInspector.tsx
│   ├── LineToolInspector.tsx
│   ├── ArrowToolInspector.tsx
│   ├── DrawToolInspector.tsx
│   ├── HighlightToolInspector.tsx
│   ├── EraserToolInspector.tsx
│   ├── TextToolInspector.tsx
│   ├── NoteToolInspector.tsx
│   └── FrameToolInspector.tsx
└── selections/
    ├── ShapeSelectionInspector.tsx
    ├── TextSelectionInspector.tsx
    ├── DrawSelectionInspector.tsx
    ├── ArrowSelectionInspector.tsx
    ├── ImageSelectionInspector.tsx
    └── MultiSelectionInspector.tsx
```

The scientific chart inspector should ultimately be owned by:

```text
features/scientific-plot/src/presentation/inspector/
├── ScientificChartToolInspector.tsx
├── ScientificChartSelectionInspector.tsx
├── ChartDataSection.tsx
├── ChartSeriesSection.tsx
├── ChartAxisSection.tsx
├── ChartLegendSection.tsx
├── ChartAnnotationSection.tsx
└── ChartExportSection.tsx
```

Workspace may host the contribution but must not own scientific-chart domain
rules.

## Phase 1

- Remove permanent Design, Data, and Interaction tabs.
- Keep InspectorHost responsible only for layout and scrolling.
- Extract the existing canvas inspector from WorkspaceContainer.
- Preserve existing behavior.
- Add an explicit module boundary for later decomposition.

## Phase 2

Split active-tool rendering into ToolInspectorRouter.

Initial tool mapping:

| Tool | Inspector |
| --- | --- |
| select | SelectToolInspector |
| hand | HandToolInspector |
| geo | ShapeToolInspector |
| line | LineToolInspector |
| arrow | ArrowToolInspector |
| draw | DrawToolInspector |
| highlight | HighlightToolInspector |
| eraser | EraserToolInspector |
| text | TextToolInspector |
| note | NoteToolInspector |
| frame | FrameToolInspector |
| scientific-chart | Feature contribution |

Each tool inspector must read and display the actual next-shape styles. Controls
must not use a permanent null value when the Editor already has a current
default.

## Phase 3

Split selected-object rendering into SelectionInspectorRouter.

Required selection contexts:

- no selection
- single shape
- multiple shapes of the same type
- mixed-type multiple selection
- locked selection
- text editing
- path or vertex editing
- crop editing
- chart editing

Mixed values must be represented explicitly rather than silently using the
first selected object's value.

## Phase 4

Replace primitive style controls with professional controls:

- exact numeric stroke width plus quick presets
- current color, custom picker, opacity, recent colors, and document colors
- graphical line-style previews
- graphical arrowhead previews
- transform fields for X, Y, width, height, and rotation
- stable alignment and distribution controls
- tool preset persistence
- accessible labels and keyboard operation

## Phase 5

Implement professional tool-specific controls.

### Freehand

- brush preset
- exact size
- opacity and flow
- smoothing mode
- stabilization
- pressure mapping
- tip angle and roundness
- stroke taper
- input-device state

### Arrow and connector

- straight, curved, orthogonal, and manual routing
- start and end arrowheads
- snapping and bindings
- obstacle avoidance
- corner radius
- label position
- automatic rerouting

### Frame

- paper, screen, presentation, and social presets
- exact dimensions
- clipping
- content movement
- padding and layout
- grid
- export region

### Scientific chart

- chart family and type
- data source
- field mapping
- series
- X and Y axes
- legend
- labels and tooltips
- annotations
- themes and palettes
- analysis
- accessibility
- export

## Validation

At the end of each phase, run:

```bash
pnpm exec biome check --write apps/desktop/src/presentation/workspace
pnpm exec biome check --write features/workspace/src/presentation/inspector
pnpm typecheck
pnpm test
```

Also perform visual review for:

- no clipped or overflowing inspector controls
- no duplicate headers
- stable scroll behavior
- narrow inspector width
- resized inspector width
- every active tool
- no selection
- single selection
- mixed multi-selection
- keyboard focus
- light and dark themes
