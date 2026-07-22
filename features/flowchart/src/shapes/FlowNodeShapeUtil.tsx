import { T } from '@tldraw/validate'
import type { ReactElement } from 'react'
import { Rectangle2d, ShapeUtil, type TLBaseShape, type TLIndicatorPath } from 'tldraw'

declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap {
    'flow-node': FlowNodeShapeProps
  }
}

export type FlowNodeType = 'process' | 'decision' | 'start-end' | 'input-output'

export interface FlowNodeShapeProps {
  label: string
  nodeType: FlowNodeType
  w: number
  h: number
  color: string
}

export type FlowNodeShape = TLBaseShape<'flow-node', FlowNodeShapeProps>

export class FlowNodeShapeUtil extends ShapeUtil<FlowNodeShape> {
  static override type = 'flow-node' as const

  static override props = {
    label: T.string,
    nodeType: T.string as T.Validator<FlowNodeType>,
    w: T.number,
    h: T.number,
    color: T.string,
  }

  getDefaultProps(): FlowNodeShape['props'] {
    return {
      label: '节点',
      nodeType: 'process',
      w: 160,
      h: 60,
      color: '#3b82f6',
    }
  }

  getGeometry(shape: FlowNodeShape): Rectangle2d {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  override component(shape: FlowNodeShape): ReactElement | null {
    const { label, nodeType, w, h, color } = shape.props

    const shapeStyle: React.CSSProperties =
      nodeType === 'decision'
        ? {
            clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
          }
        : nodeType === 'start-end'
          ? {
              borderRadius: `${h / 2}px`,
            }
          : nodeType === 'input-output'
            ? {
                clipPath: 'polygon(12% 0%, 88% 0%, 100% 50%, 88% 100%, 12% 100%, 0% 50%)',
              }
            : {
                borderRadius: '4px',
              }

    return (
      <div
        style={{
          width: w,
          height: h,
          backgroundColor: color,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
          fontSize: 13,
          fontWeight: 500,
          overflow: 'hidden',
          userSelect: 'none',
          ...shapeStyle,
        }}
      >
        {label}
      </div>
    )
  }

  override getIndicatorPath(shape: FlowNodeShape): TLIndicatorPath | undefined {
    const { w, h } = shape.props
    const path = new Path2D()
    path.rect(0, 0, w, h)
    return path
  }

  override toSvg(shape: FlowNodeShape): ReactElement | null {
    const { label, w, h, color } = shape.props

    return (
      <foreignObject height={h} width={w} x={0} y={0}>
        <div
          style={{
            width: w,
            height: h,
            backgroundColor: color,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'sans-serif',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {label}
        </div>
      </foreignObject>
    )
  }
}
