export type ShapeKind =
  | 'circle'
  | 'rect'
  | 'rounded'
  | 'pill'
  | 'triangle'
  | 'diamond'
  | 'hexagon'
  | 'shield'
  | 'line'
  | 'oval'
  | 'star'
  | 'pentagon'
  | 'octagon'
  | 'ring'
  | 'cross'
  | 'banner'
  | 'arch'
  | 'parallelogram'
  | 'teardrop'
  | 'leaf'
  | 'blob'

export type ShapeMeta = {
  id: ShapeKind
  label: string
  /** 仅描边（如直线） */
  strokeOnly?: boolean
  /** 镂空用 evenodd */
  evenOdd?: boolean
  /** 支持属性面板调节圆角（直线转角类） */
  cornerRadius?: boolean
}

export const SHAPE_META: ShapeMeta[] = [
  { id: 'circle', label: '圆' },
  { id: 'oval', label: '椭圆' },
  { id: 'rect', label: '方', cornerRadius: true },
  { id: 'rounded', label: '圆角', cornerRadius: true },
  { id: 'pill', label: '胶囊', cornerRadius: true },
  { id: 'triangle', label: '三角', cornerRadius: true },
  { id: 'diamond', label: '菱形', cornerRadius: true },
  { id: 'pentagon', label: '五边', cornerRadius: true },
  { id: 'hexagon', label: '六边', cornerRadius: true },
  { id: 'octagon', label: '八角', cornerRadius: true },
  { id: 'star', label: '星形', cornerRadius: true },
  { id: 'shield', label: '盾牌', cornerRadius: true },
  { id: 'ring', label: '圆环', evenOdd: true },
  { id: 'cross', label: '十字', cornerRadius: true },
  { id: 'banner', label: '横幅', cornerRadius: true },
  { id: 'arch', label: '拱形', cornerRadius: true },
  { id: 'parallelogram', label: '斜方', cornerRadius: true },
  { id: 'teardrop', label: '水滴' },
  { id: 'leaf', label: '叶片' },
  { id: 'blob', label: '柔体' },
  { id: 'line', label: '直线', strokeOnly: true },
]

type Pt = { x: number; y: number }

export function getShapeMeta(kind: ShapeKind): ShapeMeta {
  return SHAPE_META.find((s) => s.id === kind) ?? SHAPE_META[0]
}

export function shapeSupportsCornerRadius(kind: string | undefined): boolean {
  if (!kind) return false
  return Boolean(getShapeMeta(kind as ShapeKind).cornerRadius)
}

/** 路径本地单位下的默认圆角 */
export function defaultCornerRadius(kind: ShapeKind, size: number): number {
  switch (kind) {
    case 'rounded':
      return Math.min(28, size / 2)
    case 'pill':
      return size / 2
    default:
      return 0
  }
}

function dist(a: Pt, b: Pt) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function normalize(v: Pt): Pt {
  const len = Math.hypot(v.x, v.y) || 1
  return { x: v.x / len, y: v.y / len }
}

function roundedRectPath(s: number, r: number): string {
  const rad = Math.max(0, Math.min(r, s / 2))
  if (rad <= 0) return `M 0 0 H ${s} V ${s} H 0 Z`
  return (
    `M ${rad} 0 H ${s - rad} ` +
    `A ${rad} ${rad} 0 0 1 ${s} ${rad} ` +
    `V ${s - rad} ` +
    `A ${rad} ${rad} 0 0 1 ${s - rad} ${s} ` +
    `H ${rad} ` +
    `A ${rad} ${rad} 0 0 1 0 ${s - rad} ` +
    `V ${rad} ` +
    `A ${rad} ${rad} 0 0 1 ${rad} 0 Z`
  )
}

/**
 * 折线转角圆角：在每个顶点沿两边内缩，用圆弧连接。
 * r=0 时退化为普通多边形。
 */
function roundedPolygonPath(points: Pt[], radius: number): string {
  const n = points.length
  if (n < 3) return ''
  if (radius <= 0) {
    return `M ${points.map((p) => `${p.x} ${p.y}`).join(' L ')} Z`
  }

  const parts: string[] = []
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]
    const curr = points[i]
    const next = points[(i + 1) % n]
    const lenIn = dist(prev, curr)
    const lenOut = dist(curr, next)
    if (lenIn < 1e-6 || lenOut < 1e-6) continue

    const vIn = normalize({ x: curr.x - prev.x, y: curr.y - prev.y })
    const vOut = normalize({ x: next.x - curr.x, y: next.y - curr.y })
    const cross = vIn.x * vOut.y - vIn.y * vOut.x
    const dot = Math.max(-1, Math.min(1, vIn.x * vOut.x + vIn.y * vOut.y))
    const turn = Math.atan2(cross, dot)
    const half = Math.abs(turn) / 2
    if (half < 1e-4 || half > Math.PI / 2 - 1e-4) {
      // 近似共线或极端尖角：退回尖点
      if (parts.length === 0) parts.push(`M ${curr.x} ${curr.y}`)
      else parts.push(`L ${curr.x} ${curr.y}`)
      continue
    }

    const offset = Math.min(radius / Math.tan(half), lenIn * 0.49, lenOut * 0.49)
    const rUse = offset * Math.tan(half)
    const p1 = { x: curr.x - vIn.x * offset, y: curr.y - vIn.y * offset }
    const p2 = { x: curr.x + vOut.x * offset, y: curr.y + vOut.y * offset }
    // CCW 多边形左转(cross>0)时，切角圆弧为顺时针(sweep=1)；y 向下同理
    const sweep = cross >= 0 ? 1 : 0

    if (parts.length === 0) parts.push(`M ${p1.x} ${p1.y}`)
    else parts.push(`L ${p1.x} ${p1.y}`)
    parts.push(`A ${rUse} ${rUse} 0 0 ${sweep} ${p2.x} ${p2.y}`)
  }
  parts.push('Z')
  return parts.join(' ')
}

function regularPolygonPoints(cx: number, cy: number, r: number, sides: number, rotation = -Math.PI / 2): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i * 2 * Math.PI) / sides
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return pts
}

function starPoints(cx: number, cy: number, outer: number, inner: number, points = 5): Pt[] {
  const pts: Pt[] = []
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = -Math.PI / 2 + (i * Math.PI) / points
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return pts
}

export function shapePath(kind: ShapeKind, size = 180, cornerRadius?: number): string {
  const s = size
  const c = s / 2
  const r = Math.max(0, cornerRadius ?? defaultCornerRadius(kind, s))

  switch (kind) {
    case 'circle':
      return `M ${c} 0 A ${c} ${c} 0 1 1 ${c} ${s} A ${c} ${c} 0 1 1 ${c} 0 Z`
    case 'oval': {
      const rx = s * 0.48
      const ry = s * 0.32
      return `M ${c} ${c - ry} A ${rx} ${ry} 0 1 1 ${c} ${c + ry} A ${rx} ${ry} 0 1 1 ${c} ${c - ry} Z`
    }
    case 'rect':
    case 'rounded':
    case 'pill':
      return roundedRectPath(s, r)
    case 'triangle':
      return roundedPolygonPath(
        [
          { x: c, y: 8 },
          { x: s - 8, y: s - 8 },
          { x: 8, y: s - 8 },
        ],
        r,
      )
    case 'diamond':
      return roundedPolygonPath(
        [
          { x: c, y: 4 },
          { x: s - 4, y: c },
          { x: c, y: s - 4 },
          { x: 4, y: c },
        ],
        r,
      )
    case 'pentagon':
      return roundedPolygonPath(regularPolygonPoints(c, c, s * 0.46, 5), r)
    case 'hexagon': {
      const w = s * 0.5
      const h = s * 0.866
      const ox = (s - w * 2) / 2 + w
      const oy = (s - h) / 2
      return roundedPolygonPath(
        [
          { x: ox, y: oy },
          { x: ox + w, y: oy + h * 0.25 },
          { x: ox + w, y: oy + h * 0.75 },
          { x: ox, y: oy + h },
          { x: ox - w, y: oy + h * 0.75 },
          { x: ox - w, y: oy + h * 0.25 },
        ],
        r,
      )
    }
    case 'octagon':
      return roundedPolygonPath(regularPolygonPoints(c, c, s * 0.46, 8, Math.PI / 8), r)
    case 'star':
      return roundedPolygonPath(starPoints(c, c, s * 0.46, s * 0.2), r)
    case 'shield':
      return roundedPolygonPath(
        [
          { x: c, y: 6 },
          { x: s - 14, y: 28 },
          { x: s - 14, y: s * 0.55 },
          { x: c, y: s - 6 },
          { x: 14, y: s * 0.55 },
          { x: 14, y: 28 },
        ],
        r,
      )
    case 'ring': {
      const ro = s * 0.46
      const ri = s * 0.28
      return (
        `M ${c} ${c - ro} A ${ro} ${ro} 0 1 1 ${c} ${c + ro} A ${ro} ${ro} 0 1 1 ${c} ${c - ro} Z ` +
        `M ${c} ${c - ri} A ${ri} ${ri} 0 1 0 ${c} ${c + ri} A ${ri} ${ri} 0 1 0 ${c} ${c - ri} Z`
      )
    }
    case 'cross': {
      const t = s * 0.18
      const a = c - t
      const b = c + t
      return roundedPolygonPath(
        [
          { x: a, y: 12 },
          { x: b, y: 12 },
          { x: b, y: a },
          { x: s - 12, y: a },
          { x: s - 12, y: b },
          { x: b, y: b },
          { x: b, y: s - 12 },
          { x: a, y: s - 12 },
          { x: a, y: b },
          { x: 12, y: b },
          { x: 12, y: a },
          { x: a, y: a },
        ],
        r,
      )
    }
    case 'banner': {
      const top = s * 0.28
      const bot = s * 0.72
      const notch = s * 0.12
      return roundedPolygonPath(
        [
          { x: 8, y: top },
          { x: s - 8, y: top },
          { x: s - 8 - notch, y: c },
          { x: s - 8, y: bot },
          { x: 8, y: bot },
          { x: 8 + notch, y: c },
        ],
        r,
      )
    }
    case 'arch': {
      // 顶部保持拱弧，仅对底边两尖角圆角
      const y = s * 0.72
      const x0 = 12
      const x1 = s - 12
      if (r <= 0) {
        return `M ${x0} ${y} L ${x0} ${c} A ${c - 12} ${c - 12} 0 0 1 ${x1} ${c} L ${x1} ${y} Z`
      }
      const rad = Math.min(r, (x1 - x0) / 2, (y - c) * 0.9, y * 0.45)
      return (
        `M ${x0 + rad} ${y} ` +
        `L ${x1 - rad} ${y} ` +
        `A ${rad} ${rad} 0 0 0 ${x1} ${y - rad} ` +
        `L ${x1} ${c} ` +
        `A ${c - 12} ${c - 12} 0 0 0 ${x0} ${c} ` +
        `L ${x0} ${y - rad} ` +
        `A ${rad} ${rad} 0 0 0 ${x0 + rad} ${y} Z`
      )
    }
    case 'parallelogram': {
      const skew = s * 0.22
      return roundedPolygonPath(
        [
          { x: skew, y: 16 },
          { x: s, y: 16 },
          { x: s - skew, y: s - 16 },
          { x: 0, y: s - 16 },
        ],
        r,
      )
    }
    case 'teardrop': {
      return `M ${c} 10 Q ${s - 16} ${c} ${c} ${s - 12} Q 16 ${c} ${c} 10 Z`
    }
    case 'leaf': {
      return (
        `M ${c} 10 ` +
        `Q ${s - 10} ${c * 0.7} ${c} ${s - 10} ` +
        `Q 10 ${c * 0.7} ${c} 10 Z`
      )
    }
    case 'blob': {
      return (
        `M ${c} ${s * 0.08} ` +
        `C ${s * 0.78} ${s * 0.08} ${s * 0.96} ${s * 0.32} ${s * 0.92} ${c} ` +
        `C ${s * 0.96} ${s * 0.72} ${s * 0.72} ${s * 0.96} ${c} ${s * 0.9} ` +
        `C ${s * 0.28} ${s * 0.96} ${s * 0.04} ${s * 0.7} ${s * 0.1} ${c} ` +
        `C ${s * 0.04} ${s * 0.3} ${s * 0.28} ${s * 0.08} ${c} ${s * 0.08} Z`
      )
    }
    case 'line':
      return `M 8 ${c} L ${s - 8} ${c}`
  }
}
