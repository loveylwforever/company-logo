/**
 * 画布渐变手柄：线性自由起止 + 中点平移；径向中心/半径。
 */
import { Circle, Line, util, type Canvas, type FabricObject, type TMat2D } from 'fabric'
import {
  clampPct,
  createGradientFill,
  GRAD_PCT,
  parseObjectGradient,
  type ParsedGradient,
} from './fills'
import {
  isGradientOverlay,
  isOverlayObject,
  markOverlay,
  safeRemove,
  zoomStroke,
} from './overlay'

type GradRole = 'start' | 'end' | 'center' | 'radius' | 'move'
type GradMeta = { role: GradRole; target: FabricObject }
type GradMode = 'linear' | 'radial'
type Pt = { x: number; y: number }

function metaOf(obj: FabricObject): GradMeta | undefined {
  return (obj as FabricObject & { __gradMeta?: GradMeta }).__gradMeta
}

function localPctToCanvas(obj: FabricObject, px: number, py: number): Pt {
  const w = obj.width || 1
  const h = obj.height || 1
  const p = util.transformPoint({ x: px * w, y: py * h }, obj.calcTransformMatrix())
  return { x: p.x, y: p.y }
}

function canvasToLocalPct(obj: FabricObject, x: number, y: number): Pt {
  const inv = util.invertTransform(obj.calcTransformMatrix() as TMat2D)
  const p = util.transformPoint({ x, y }, inv)
  const w = obj.width || 1
  const h = obj.height || 1
  return {
    x: clampPct(p.x / w, GRAD_PCT.lo, GRAD_PCT.hi),
    y: clampPct(p.y / h, GRAD_PCT.lo, GRAD_PCT.hi),
  }
}

function unbindDrag(obj: FabricObject) {
  obj.off('moving')
  obj.off('mousedown')
  obj.off('mouseup')
  obj.off('modified')
}

export class GradientEditor {
  private canvas: Canvas
  private target: FabricObject | null = null
  private mode: GradMode | null = null
  private handles: Circle[] = []
  private line: Line | null = null
  private moveHandle: Circle | null = null
  private onChange: (() => void) | null = null
  private dragging = false
  private moveOrigin: { mx: number; my: number; a: Pt; b: Pt } | null = null

  constructor(canvas: Canvas) {
    this.canvas = canvas
  }

  get activeTarget() {
    return this.target
  }

  setOnChange(cb: (() => void) | null) {
    this.onChange = cb
  }

  owns(obj: FabricObject | null | undefined) {
    return Boolean(
      obj &&
        (this.handles.includes(obj as Circle) || obj === this.moveHandle || obj === this.line),
    )
  }

  clear() {
    this.target = null
    this.mode = null
    this.dragging = false
    this.moveOrigin = null
    this.removeControls()
    for (const o of [...this.canvas.getObjects()]) {
      if (isGradientOverlay(o)) safeRemove(this.canvas, o)
    }
    this.canvas.requestRenderAll()
  }

  sync(obj: FabricObject | null) {
    if (this.dragging) return
    if (!obj || isOverlayObject(obj) || obj.type === 'activeSelection' || !parseObjectGradient(obj)) {
      this.clear()
      return
    }
    const g = parseObjectGradient(obj)!
    if (this.target === obj && this.handles.length >= 2 && this.mode === g.mode) {
      this.layout()
      return
    }
    this.clear()
    this.target = obj
    this.mode = g.mode
    this.rebuild()
  }

  refresh() {
    if (this.target && !this.dragging) this.layout()
  }

  private removeControls() {
    for (const h of this.handles) {
      unbindDrag(h)
      safeRemove(this.canvas, h)
    }
    this.handles = []
    if (this.moveHandle) {
      unbindDrag(this.moveHandle)
      safeRemove(this.canvas, this.moveHandle)
      this.moveHandle = null
    }
    if (this.line) {
      safeRemove(this.canvas, this.line)
      this.line = null
    }
  }

  private bindEndpoint(handle: Circle) {
    handle.on('mousedown', () => {
      this.dragging = true
    })
    handle.on('mouseup', () => {
      this.dragging = false
      this.onChange?.()
    })
    handle.on('moving', () => this.onMoveEndpoint(handle))
    handle.on('modified', () => {
      this.dragging = false
      this.layout()
      this.onChange?.()
    })
  }

  private makeHandle(x: number, y: number, fill: string, role: GradRole) {
    if (!this.target) return null
    const { radius: r } = zoomStroke(this.canvas)
    const handle = new Circle({
      left: x,
      top: y,
      originX: 'center',
      originY: 'center',
      radius: r(role === 'radius' ? 3.5 : 4.5),
      fill,
      stroke: '#fff',
      strokeWidth: 1.75,
      hasControls: false,
      hasBorders: false,
      selectable: true,
      evented: true,
      hoverCursor: role === 'move' ? 'move' : 'grab',
      moveCursor: 'grabbing',
      objectCaching: false,
    })
    markOverlay(handle, { __gradMeta: { role, target: this.target } satisfies GradMeta })
    return handle
  }

  private makeGuide(a: Pt, b: Pt) {
    if (!this.target) return
    const line = new Line([a.x, a.y, b.x, b.y], {
      stroke: 'rgba(15, 110, 86, 0.75)',
      strokeWidth: 2,
      strokeDashArray: [6, 4],
      selectable: false,
      evented: false,
      objectCaching: false,
    })
    markOverlay(line, {
      __gradMeta: { role: 'start', target: this.target } satisfies GradMeta,
    })
    this.line = line
    this.canvas.add(line)

    if (this.mode !== 'linear') return

    const mid = this.makeHandle((a.x + b.x) / 2, (a.y + b.y) / 2, '#0f6e56', 'move')
    if (!mid) return
    mid.set({ radius: zoomStroke(this.canvas).radius(3.2) })
    mid.on('mousedown', () => {
      this.dragging = true
      const start = this.handleByRole('start')
      const end = this.handleByRole('end')
      this.moveOrigin = {
        mx: mid.left ?? 0,
        my: mid.top ?? 0,
        a: { x: start?.left ?? a.x, y: start?.top ?? a.y },
        b: { x: end?.left ?? b.x, y: end?.top ?? b.y },
      }
    })
    mid.on('moving', () => this.onMoveMid(mid))
    mid.on('mouseup', () => {
      this.dragging = false
      this.moveOrigin = null
      this.onChange?.()
    })
    mid.on('modified', () => {
      this.dragging = false
      this.moveOrigin = null
      this.layout()
      this.onChange?.()
    })
    this.moveHandle = mid
    this.canvas.add(mid)
  }

  private setPair(a: Pt, b: Pt, c1: string, c2: string, roles: [GradRole, GradRole]) {
    this.removeControls()
    this.makeGuide(a, b)
    const h1 = this.makeHandle(a.x, a.y, c1, roles[0])
    const h2 = this.makeHandle(b.x, b.y, c2, roles[1])
    if (!h1 || !h2) return
    this.bindEndpoint(h1)
    this.bindEndpoint(h2)
    this.handles = [h1, h2]
    this.canvas.add(h1, h2)
    this.canvas.bringObjectToFront(h1)
    this.canvas.bringObjectToFront(h2)
    if (this.moveHandle) this.canvas.bringObjectToFront(this.moveHandle)
  }

  private endpoints(g: ParsedGradient): [Pt, Pt] | null {
    if (!this.target) return null
    if (g.mode === 'linear') {
      return [localPctToCanvas(this.target, g.x1, g.y1), localPctToCanvas(this.target, g.x2, g.y2)]
    }
    return [
      localPctToCanvas(this.target, g.cx, g.cy),
      localPctToCanvas(this.target, g.cx + g.r, g.cy),
    ]
  }

  private rebuild() {
    if (!this.target) return
    const g = parseObjectGradient(this.target)
    const pts = g && this.endpoints(g)
    if (!g || !pts) return
    this.setPair(
      pts[0],
      pts[1],
      g.c1,
      g.c2,
      g.mode === 'linear' ? ['start', 'end'] : ['center', 'radius'],
    )
    this.canvas.requestRenderAll()
  }

  private handleByRole(role: GradRole) {
    return this.handles.find((h) => metaOf(h)?.role === role)
  }

  private applyLinear(a: Pt, b: Pt, c1: string, c2: string) {
    if (!this.target) return
    const p1 = canvasToLocalPct(this.target, a.x, a.y)
    const p2 = canvasToLocalPct(this.target, b.x, b.y)
    this.target.set(
      'fill',
      createGradientFill('linear', c1, c2, { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }),
    )
    this.line?.set({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
    this.line?.setCoords()
    this.moveHandle?.set({ left: (a.x + b.x) / 2, top: (a.y + b.y) / 2 })
    this.moveHandle?.setCoords()
    this.target.dirty = true
    this.canvas.requestRenderAll()
  }

  private onMoveMid(mid: Circle) {
    if (!this.target || !this.moveOrigin) return
    const g = parseObjectGradient(this.target)
    if (!g || g.mode !== 'linear') return
    const dx = (mid.left ?? 0) - this.moveOrigin.mx
    const dy = (mid.top ?? 0) - this.moveOrigin.my
    const a = { x: this.moveOrigin.a.x + dx, y: this.moveOrigin.a.y + dy }
    const b = { x: this.moveOrigin.b.x + dx, y: this.moveOrigin.b.y + dy }
    this.handleByRole('start')?.set({ left: a.x, top: a.y })
    this.handleByRole('end')?.set({ left: b.x, top: b.y })
    this.handleByRole('start')?.setCoords()
    this.handleByRole('end')?.setCoords()
    this.applyLinear(a, b, g.c1, g.c2)
  }

  private onMoveEndpoint(handle: Circle) {
    const meta = metaOf(handle)
    if (!meta || !this.target) return
    const g = parseObjectGradient(this.target)
    if (!g) return

    if (g.mode === 'linear') {
      const start = this.handleByRole('start')
      const end = this.handleByRole('end')
      if (!start || !end) return
      this.applyLinear(
        { x: start.left ?? 0, y: start.top ?? 0 },
        { x: end.left ?? 0, y: end.top ?? 0 },
        g.c1,
        g.c2,
      )
      return
    }

    const center = this.handleByRole('center')
    const radiusH = this.handleByRole('radius')
    if (!center || !radiusH) return

    const c = { x: center.left ?? 0, y: center.top ?? 0 }
    let edge = { x: radiusH.left ?? 0, y: radiusH.top ?? 0 }
    const pct = canvasToLocalPct(this.target, c.x, c.y)

    if (meta.role === 'center') {
      const edgePct = canvasToLocalPct(this.target, edge.x, edge.y)
      const keepR = Math.hypot(edgePct.x - pct.x, edgePct.y - pct.y) || g.r
      edge = localPctToCanvas(this.target, pct.x + keepR, pct.y)
      radiusH.set({ left: edge.x, top: edge.y })
      radiusH.setCoords()
      this.target.set(
        'fill',
        createGradientFill('radial', g.c1, g.c2, { cx: pct.x, cy: pct.y, r: keepR }),
      )
    } else {
      const edgePct = canvasToLocalPct(this.target, edge.x, edge.y)
      const r = Math.hypot(edgePct.x - pct.x, edgePct.y - pct.y) || 0.65
      this.target.set(
        'fill',
        createGradientFill('radial', g.c1, g.c2, { cx: pct.x, cy: pct.y, r }),
      )
    }
    this.line?.set({ x1: c.x, y1: c.y, x2: edge.x, y2: edge.y })
    this.line?.setCoords()
    this.target.dirty = true
    this.canvas.requestRenderAll()
  }

  private layout() {
    if (!this.target) return
    const obj = this.target
    const g = parseObjectGradient(obj)
    if (!g) {
      this.clear()
      return
    }
    if (g.mode !== this.mode || this.handles.length < 2) {
      this.clear()
      this.target = obj
      this.mode = g.mode
      this.rebuild()
      return
    }

    const pts = this.endpoints(g)
    if (!pts) return

    this.handles[0].set({ left: pts[0].x, top: pts[0].y, fill: g.c1 })
    this.handles[1].set({ left: pts[1].x, top: pts[1].y, fill: g.c2 })
    this.handles[0].setCoords()
    this.handles[1].setCoords()
    this.line?.set({ x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y })
    this.line?.setCoords()
    this.moveHandle?.set({
      left: (pts[0].x + pts[1].x) / 2,
      top: (pts[0].y + pts[1].y) / 2,
    })
    this.moveHandle?.setCoords()

    if (!this.line || (g.mode === 'linear' && !this.moveHandle)) {
      this.rebuild()
      return
    }
    this.canvas.requestRenderAll()
  }
}
