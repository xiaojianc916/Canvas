import type { Radians } from './angle'
import type { Point } from './point'

export type Vector2D = readonly [number, number]

export const Vector2D = {
  create(x: number, y: number): Vector2D {
    return [x, y]
  },
  fromPoints(a: Point, b: Point): Vector2D {
    return [b[0] - a[0], b[1] - a[1]]
  },
  zero(): Vector2D {
    return [0, 0]
  },
  unitX(): Vector2D {
    return [1, 0]
  },
  unitY(): Vector2D {
    return [0, 1]
  },
}

export function createVector(x: number, y: number): Vector2D {
  return [x, y]
}
export function vectorFromPoints(a: Point, b: Point): Vector2D {
  return Vector2D.fromPoints(a, b)
}

export function vectorAdd(a: Vector2D, b: Vector2D): Vector2D {
  return [a[0] + b[0], a[1] + b[1]]
}
export function vectorSub(a: Vector2D, b: Vector2D): Vector2D {
  return [a[0] - b[0], a[1] - b[1]]
}
export function vectorMul(a: Vector2D, s: number): Vector2D {
  return [a[0] * s, a[1] * s]
}
export function vectorDiv(a: Vector2D, s: number): Vector2D {
  return [a[0] / s, a[1] / s]
}
export function vectorNeg(a: Vector2D): Vector2D {
  return [-a[0], -a[1]]
}
export function vectorDot(a: Vector2D, b: Vector2D): number {
  return a[0] * b[0] + a[1] * b[1]
}
export function vectorCross(a: Vector2D, b: Vector2D): number {
  return a[0] * b[1] - a[1] * b[0]
}
export function vectorLength(v: Vector2D): number {
  return Math.hypot(v[0], v[1])
}
export function vectorLengthSq(v: Vector2D): number {
  return v[0] * v[0] + v[1] * v[1]
}
export function vectorNormalize(v: Vector2D): Vector2D {
  const len = vectorLength(v)
  return len === 0 ? [0, 0] : [v[0] / len, v[1] / len]
}
export function vectorAngle(v: Vector2D): Radians {
  return Math.atan2(v[1], v[0]) as Radians
}
export function vectorRotate(v: Vector2D, angle: Radians): Vector2D {
  const cos = Math.cos(angle),
    sin = Math.sin(angle)
  return [v[0] * cos - v[1] * sin, v[0] * sin + v[1] * cos]
}
export function vectorPerp(v: Vector2D): Vector2D {
  return [-v[1], v[0]]
}
export function vectorProject(a: Vector2D, b: Vector2D): Vector2D {
  const dot = vectorDot(a, b)
  const lenSq = vectorLengthSq(b)
  return lenSq === 0 ? [0, 0] : vectorMul(b, dot / lenSq)
}
export function vectorReflect(v: Vector2D, normal: Vector2D): Vector2D {
  const n = vectorNormalize(normal)
  return vectorSub(v, vectorMul(n, 2 * vectorDot(v, n)))
}
export function vectorLerp(a: Vector2D, b: Vector2D, t: number): Vector2D {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}
export function vectorEquals(a: Vector2D, b: Vector2D, eps = 1e-10): boolean {
  return Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps
}
export function vectorDistance(a: Vector2D, b: Vector2D): number {
  return vectorLength(vectorSub(a, b))
}
