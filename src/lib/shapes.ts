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

export type ShapeMeta = {
  id: ShapeKind
  label: string
  /** 仅描边（如直线） */
  strokeOnly?: boolean
  /** 镂空用 evenodd */
  evenOdd?: boolean
}

export const SHAPE_META: ShapeMeta[] = [
  { id: 'circle', label: '圆' },
  { id: 'oval', label: '椭圆' },
  { id: 'rect', label: '方' },
  { id: 'rounded', label: '圆角' },
  { id: 'pill', label: '胶囊' },
  { id: 'triangle', label: '三角' },
  { id: 'diamond', label: '菱形' },
  { id: 'pentagon', label: '五边' },
  { id: 'hexagon', label: '六边' },
  { id: 'octagon', label: '八角' },
  { id: 'star', label: '星形' },
  { id: 'shield', label: '盾牌' },
  { id: 'ring', label: '圆环', evenOdd: true },
  { id: 'cross', label: '十字' },
  { id: 'banner', label: '横幅' },
  { id: 'arch', label: '拱形' },
  { id: 'parallelogram', label: '斜方' },
  { id: 'teardrop', label: '水滴' },
  { id: 'leaf', label: '叶片' },
  { id: 'line', label: '直线', strokeOnly: true },
]

export function getShapeMeta(kind: ShapeKind): ShapeMeta {
  return SHAPE_META.find((s) => s.id === kind) ?? SHAPE_META[0]
}

function regularPolygon(cx: number, cy: number, r: number, sides: number, rotation = -Math.PI / 2): string {
  const pts: string[] = []
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i * 2 * Math.PI) / sides
    pts.push(`${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`)
  }
  return `M ${pts.join(' L ')} Z`
}

function starPath(cx: number, cy: number, outer: number, inner: number, points = 5): string {
  const pts: string[] = []
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = -Math.PI / 2 + (i * Math.PI) / points
    pts.push(`${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`)
  }
  return `M ${pts.join(' L ')} Z`
}

export function shapePath(kind: ShapeKind, size = 180): string {
  const s = size
  const c = s / 2
  switch (kind) {
    case 'circle':
      return `M ${c} 0 A ${c} ${c} 0 1 1 ${c} ${s} A ${c} ${c} 0 1 1 ${c} 0 Z`
    case 'oval': {
      const rx = s * 0.48
      const ry = s * 0.32
      return `M ${c} ${c - ry} A ${rx} ${ry} 0 1 1 ${c} ${c + ry} A ${rx} ${ry} 0 1 1 ${c} ${c - ry} Z`
    }
    case 'rect':
      return `M 0 0 H ${s} V ${s} H 0 Z`
    case 'rounded': {
      const r = 28
      return `M ${r} 0 H ${s - r} Q ${s} 0 ${s} ${r} V ${s - r} Q ${s} ${s} ${s - r} ${s} H ${r} Q 0 ${s} 0 ${s - r} V ${r} Q 0 0 ${r} 0 Z`
    }
    case 'pill': {
      const r = s / 2
      return `M ${r} 0 H ${s - r} A ${r} ${r} 0 0 1 ${s - r} ${s} H ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`
    }
    case 'triangle':
      return `M ${c} 8 L ${s - 8} ${s - 8} L 8 ${s - 8} Z`
    case 'diamond':
      return `M ${c} 4 L ${s - 4} ${c} L ${c} ${s - 4} L 4 ${c} Z`
    case 'pentagon':
      return regularPolygon(c, c, s * 0.46, 5)
    case 'hexagon': {
      const w = s * 0.5
      const h = s * 0.866
      const ox = (s - w * 2) / 2 + w
      const oy = (s - h) / 2
      return `M ${ox} ${oy} L ${ox + w} ${oy + h * 0.25} L ${ox + w} ${oy + h * 0.75} L ${ox} ${oy + h} L ${ox - w} ${oy + h * 0.75} L ${ox - w} ${oy + h * 0.25} Z`
    }
    case 'octagon':
      return regularPolygon(c, c, s * 0.46, 8, Math.PI / 8)
    case 'star':
      return starPath(c, c, s * 0.46, s * 0.2)
    case 'shield':
      return `M ${c} 6 L ${s - 14} 28 V ${s * 0.55} Q ${c} ${s - 6} ${c} ${s - 6} Q ${c} ${s - 6} 14 ${s * 0.55} V 28 Z`
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
      return `M ${a} 12 H ${b} V ${a} H ${s - 12} V ${b} H ${b} V ${s - 12} H ${a} V ${b} H 12 V ${a} H ${a} Z`
    }
    case 'banner': {
      const top = s * 0.28
      const bot = s * 0.72
      const notch = s * 0.12
      return `M 8 ${top} H ${s - 8} L ${s - 8 - notch} ${c} L ${s - 8} ${bot} H 8 L ${8 + notch} ${c} Z`
    }
    case 'arch': {
      const y = s * 0.72
      return `M 12 ${y} L 12 ${c} A ${c - 12} ${c - 12} 0 0 1 ${s - 12} ${c} L ${s - 12} ${y} Z`
    }
    case 'parallelogram': {
      const skew = s * 0.22
      return `M ${skew} 16 L ${s} 16 L ${s - skew} ${s - 16} L 0 ${s - 16} Z`
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
    case 'line':
      return `M 8 ${c} L ${s - 8} ${c}`
  }
}
