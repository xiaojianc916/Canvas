export type Radians = number & { readonly __brand: 'Radians' }
export type Degrees = number & { readonly __brand: 'Degrees' }

export const Radians = {
  create(value: number): Radians {
    return value as Radians
  },
  fromDegrees(deg: Degrees): Radians {
    return ((deg * Math.PI) / 180) as Radians
  },
  fromTurns(turns: number): Radians {
    return (turns * 2 * Math.PI) as Radians
  },
  toDegrees(rad: Radians): Degrees {
    return ((rad * 180) / Math.PI) as Degrees
  },
  toTurns(rad: Radians): number {
    return rad / (2 * Math.PI)
  },
  normalize(rad: Radians): Radians {
    let r = rad % (2 * Math.PI)
    if (r < 0) r += 2 * Math.PI
    return r as Radians
  },
  normalizeHalf(rad: Radians): Radians {
    let r = rad % (2 * Math.PI)
    if (r < -Math.PI) r += 2 * Math.PI
    else if (r > Math.PI) r -= 2 * Math.PI
    return r as Radians
  },
  lerp(a: Radians, b: Radians, t: number): Radians {
    const diff = Radians.normalizeHalf(b - a)
    return Radians.normalize(a + diff * t) as Radians
  },
  add(a: Radians, b: Radians): Radians {
    return Radians.normalize(a + b)
  },
  sub(a: Radians, b: Radians): Radians {
    return Radians.normalize(a - b)
  },
  sin(rad: Radians): number {
    return Math.sin(rad)
  },
  cos(rad: Radians): number {
    return Math.cos(rad)
  },
  tan(rad: Radians): number {
    return Math.tan(rad)
  },
  asin(v: number): Radians {
    return Math.asin(v) as Radians
  },
  acos(v: number): Radians {
    return Math.acos(v) as Radians
  },
  atan(v: number): Radians {
    return Math.atan(v) as Radians
  },
  atan2(y: number, x: number): Radians {
    return Math.atan2(y, x) as Radians
  },
}

export const Degrees = {
  create(value: number): Degrees {
    return value as Degrees
  },
  fromRadians(rad: Radians): Degrees {
    return ((rad * 180) / Math.PI) as Degrees
  },
  toRadians(deg: Degrees): Radians {
    return Radians.fromDegrees(deg)
  },
}

export const TAU = (2 * Math.PI) as Radians
export const PI = Math.PI as Radians
export const HALF_PI = (Math.PI / 2) as Radians
export const QUARTER_PI = (Math.PI / 4) as Radians
