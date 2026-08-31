import { Gradient, type FabricObject } from 'fabric'

export type FillMode = 'solid' | 'linear' | 'radial'

export type LinearCoords = { x1: number; y1: number; x2: number; y2: number }

export type ParsedGradient = {
  mode: 'linear' | 'radial'
  c1: string
  c2: string
  angle: number
  x1: number
  y1: number
  x2: number
  y2: number
  cx: number
  cy: number
  r: number
}

export type GradientFillOptions = {
  angle?: number
  x1?: number
  y1?: number
  x2?: number
  y2?: number
  cx?: number
  cy?: number
  r?: number
}

export type LinearGradMemory = LinearCoords & { c1: string; c2: string }
export type RadialGradMemory = { c1: string; c2: string; cx: number; cy: number; r: number }
export type GradMemory = { linear?: LinearGradMemory; radial?: RadialGradMemory }

type GradMemoryHost = FabricObject & { __gradMemory?: GradMemory }

const PCT_LO = -0.25
const PCT_HI = 1.25

export function angleToLinearCoords(angleDeg: number): LinearCoords {
  const rad = (angleDeg * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return {
    x1: 0.5 - cos * 0.5,
    y1: 0.5 - sin * 0.5,
    x2: 0.5 + cos * 0.5,
    y2: 0.5 + sin * 0.5,
  }
}

export function clampPct(n: number, lo = PCT_LO, hi = PCT_HI) {
  return Math.min(hi, Math.max(lo, n))
}

function angleOf(c: LinearCoords) {
  let angle = Math.round((Math.atan2(c.y2 - c.y1, c.x2 - c.x1) * 180) / Math.PI)
  if (angle < 0) angle += 360
  return angle
}

function colorStops(g: Gradient<'linear' | 'radial'>) {
  const stops = [...(g.colorStops || [])].sort((a, b) => a.offset - b.offset)
  return {
    c1: String(stops[0]?.color ?? '#0284c7'),
    c2: String(stops[stops.length - 1]?.color ?? '#7dd3fc'),
  }
}

export function createGradientFill(
  mode: 'linear' | 'radial',
  c1: string,
  c2: string,
  options: GradientFillOptions = {},
) {
  const stops = [
    { offset: 0, color: c1 },
    { offset: 1, color: c2 },
  ]
  if (mode === 'radial') {
    const cx = clampPct(options.cx ?? 0.5, 0, 1)
    const cy = clampPct(options.cy ?? 0.5, 0, 1)
    const r = Math.min(1.2, Math.max(0.08, options.r ?? 0.65))
    return new Gradient({
      type: 'radial',
      gradientUnits: 'percentage',
      coords: { x1: cx, y1: cy, r1: 0, x2: cx, y2: cy, r2: r },
      colorStops: stops,
    })
  }

  const hasFree =
    options.x1 != null && options.y1 != null && options.x2 != null && options.y2 != null
  const coords = hasFree
    ? {
        x1: clampPct(options.x1!),
        y1: clampPct(options.y1!),
        x2: clampPct(options.x2!),
        y2: clampPct(options.y2!),
      }
    : angleToLinearCoords(options.angle ?? 90)

  return new Gradient({
    type: 'linear',
    gradientUnits: 'percentage',
    coords,
    colorStops: stops,
  })
}

/** 从对象 fill 解析渐变；非渐变返回 null */
export function parseObjectGradient(obj: FabricObject): ParsedGradient | null {
  const fill = obj.fill
  if (!fill || typeof fill !== 'object' || !('colorStops' in fill)) return null
  const g = fill as Gradient<'linear' | 'radial'>
  const { c1, c2 } = colorStops(g)

  if (g.type === 'radial') {
    const coords = g.coords as { x1?: number; y1?: number; r2?: number }
    return {
      mode: 'radial',
      c1,
      c2,
      angle: 0,
      x1: 0,
      y1: 0.5,
      x2: 1,
      y2: 0.5,
      cx: coords.x1 ?? 0.5,
      cy: coords.y1 ?? 0.5,
      r: coords.r2 ?? 0.65,
    }
  }

  const c = g.coords as LinearCoords
  const linear = {
    x1: c.x1 ?? 0,
    y1: c.y1 ?? 0.5,
    x2: c.x2 ?? 1,
    y2: c.y2 ?? 0.5,
  }
  return {
    mode: 'linear',
    c1,
    c2,
    angle: angleOf(linear),
    ...linear,
    cx: 0.5,
    cy: 0.5,
    r: 0.65,
  }
}

/** 当前几何 → createGradientFill options（同模式改色时用） */
export function optionsFromParsed(g: ParsedGradient): GradientFillOptions {
  return g.mode === 'linear'
    ? { x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2 }
    : { cx: g.cx, cy: g.cy, r: g.r }
}

export function getGradMemory(obj: FabricObject): GradMemory {
  const host = obj as GradMemoryHost
  if (!host.__gradMemory) host.__gradMemory = {}
  return host.__gradMemory
}

/** 把当前 fill 写入对应模式记忆槽 */
export function rememberObjectGradient(obj: FabricObject) {
  const g = parseObjectGradient(obj)
  if (!g) return
  const mem = getGradMemory(obj)
  if (g.mode === 'linear') {
    mem.linear = { c1: g.c1, c2: g.c2, x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2 }
  } else {
    mem.radial = { c1: g.c1, c2: g.c2, cx: g.cx, cy: g.cy, r: g.r }
  }
}

/**
 * 切换模式：先记住当前，再恢复目标模式几何；颜色用面板当前值。
 * 无记忆时从上一种渐变推导合理默认。
 */
export function resolveGradientForMode(
  obj: FabricObject,
  mode: 'linear' | 'radial',
  _colors: { c1: string; c2: string },
  fallbackAngle = 90,
): GradientFillOptions {
  const prev = parseObjectGradient(obj)
  rememberObjectGradient(obj)
  const mem = getGradMemory(obj)

  if (mode === 'linear') {
    if (mem.linear) {
      const { x1, y1, x2, y2 } = mem.linear
      return { x1, y1, x2, y2 }
    }
    if (prev?.mode === 'radial') {
      const half = Math.max(0.2, prev.r * 0.7)
      return { x1: prev.cx - half, y1: prev.cy, x2: prev.cx + half, y2: prev.cy }
    }
    return { angle: fallbackAngle }
  }

  if (mem.radial) {
    const { cx, cy, r } = mem.radial
    return { cx, cy, r }
  }
  if (prev?.mode === 'linear') {
    return {
      cx: (prev.x1 + prev.x2) / 2,
      cy: (prev.y1 + prev.y2) / 2,
      r: Math.max(0.2, Math.hypot(prev.x2 - prev.x1, prev.y2 - prev.y1) / 2),
    }
  }
  return { cx: 0.5, cy: 0.5, r: 0.65 }
}

// 供编辑器与 fills 共用的百分比范围
export const GRAD_PCT = { lo: PCT_LO, hi: PCT_HI } as const
