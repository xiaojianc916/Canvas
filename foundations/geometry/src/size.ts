export type Size = readonly [number, number]

export const Size = {
  create(w: number, h: number): Size {
    return [w, h]
  },
  from(obj: { width: number; height: number } | readonly [number, number]): Size {
    return 'width' in obj ? [obj.width, obj.height] : [obj[0], obj[1]]
  },
  zero(): Size {
    return [0, 0]
  },
  one(): Size {
    return [1, 1]
  },
}

export function createSize(w: number, h: number): Size {
  return [w, h]
}

export function sizeFrom(obj: { width: number; height: number } | readonly [number, number]): Size {
  return Size.from(obj)
}

export function sizeAdd(a: Size, b: Size): Size {
  return [a[0] + b[0], a[1] + b[1]]
}

export function sizeSub(a: Size, b: Size): Size {
  return [a[0] - b[0], a[1] - b[1]]
}

export function sizeMul(a: Size, s: number): Size {
  return [a[0] * s, a[1] * s]
}

export function sizeDiv(a: Size, s: number): Size {
  return [a[0] / s, a[1] / s]
}

export function sizeEquals(a: Size, b: Size, eps = 1e-10): boolean {
  return Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps
}

export function sizeArea(s: Size): number {
  return s[0] * s[1]
}

export function sizeAspectRatio(s: Size): number {
  return s[1] === 0 ? Number.POSITIVE_INFINITY : s[0] / s[1]
}

export function sizeFit(inner: Size, outer: Size): Size {
  const scale = Math.min(outer[0] / inner[0], outer[1] / inner[1])
  return [inner[0] * scale, inner[1] * scale]
}

export function sizeCover(inner: Size, outer: Size): Size {
  const scale = Math.max(outer[0] / inner[0], outer[1] / inner[1])
  return [inner[0] * scale, inner[1] * scale]
}

export function sizeContains(outer: Size, inner: Size): boolean {
  return inner[0] <= outer[0] && inner[1] <= outer[1]
}

export function sizeClamp(s: Size, min: Size, max: Size): Size {
  return [Math.max(min[0], Math.min(max[0], s[0])), Math.max(min[1], Math.min(max[1], s[1]))]
}

export function sizeRound(s: Size): Size {
  return [Math.round(s[0]), Math.round(s[1])]
}

export function sizeFloor(s: Size): Size {
  return [Math.floor(s[0]), Math.floor(s[1])]
}

export function sizeCeil(s: Size): Size {
  return [Math.ceil(s[0]), Math.ceil(s[1])]
}

export function sizeMin(a: Size, b: Size): Size {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1])]
}

export function sizeMax(a: Size, b: Size): Size {
  return [Math.max(a[0], b[0]), Math.max(a[1], b[1])]
}
