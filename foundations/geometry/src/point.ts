export type Point = readonly [number, number]

export const Point = {
  create(x: number, y: number): Point {
    return [x, y]
  },
  from(obj: { x: number; y: number } | readonly [number, number]): Point {
    return 'x' in obj ? [obj.x, obj.y] : [obj[0], obj[1]]
  },
  zero(): Point {
    return [0, 0]
  },
  one(): Point {
    return [1, 1]
  },
}

export function createPoint(x: number, y: number): Point {
  return [x, y]
}

export function pointFrom(obj: { x: number; y: number } | readonly [number, number]): Point {
  return Point.from(obj)
}

export function pointAdd(a: Point, b: Point): Point {
  return [a[0] + b[0], a[1] + b[1]]
}

export function pointSub(a: Point, b: Point): Point {
  return [a[0] - b[0], a[1] - b[1]]
}

export function pointMul(a: Point, s: number): Point {
  return [a[0] * s, a[1] * s]
}

export function pointDiv(a: Point, s: number): Point {
  return [a[0] / s, a[1] / s]
}

export function pointNeg(a: Point): Point {
  return [-a[0], -a[1]]
}

export function pointLerp(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

export function pointDistance(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

export function pointDistanceSq(a: Point, b: Point): number {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  return dx * dx + dy * dy
}

export function pointEquals(a: Point, b: Point, eps = 1e-10): boolean {
  return Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps
}

export function pointRound(p: Point): Point {
  return [Math.round(p[0]), Math.round(p[1])]
}

export function pointFloor(p: Point): Point {
  return [Math.floor(p[0]), Math.floor(p[1])]
}

export function pointCeil(p: Point): Point {
  return [Math.ceil(p[0]), Math.ceil(p[1])]
}

export function pointAngle(from: Point, to: Point): number {
  return Math.atan2(to[1] - from[1], to[0] - from[0])
}

export function pointRotate(p: Point, angle: number, origin: Point = [0, 0]): Point {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = p[0] - origin[0]
  const dy = p[1] - origin[1]
  return [origin[0] + dx * cos - dy * sin, origin[1] + dx * sin + dy * cos]
}

export function pointTransform(p: Point, m: Readonly<DOMMatrix>): Point {
  return [m.a * p[0] + m.c * p[1] + m.e, m.b * p[0] + m.d * p[1] + m.f]
}

export function pointMin(a: Point, b: Point): Point {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1])]
}

export function pointMax(a: Point, b: Point): Point {
  return [Math.max(a[0], b[0]), Math.max(a[1], b[1])]
}

export function pointClamp(p: Point, min: Point, max: Point): Point {
  return [
    Math.max(min[0], Math.min(max[0], p[0])),
    Math.max(min[1], Math.min(max[1], p[1])),
  ]
}