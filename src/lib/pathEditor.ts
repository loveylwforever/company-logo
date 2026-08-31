import { Circle, Line, Path, util, type Canvas, type FabricObject, type TMat2D } from 'fabric'
import { isGradientOverlay, isOverlayObject, markOverlay, safeRemove, zoomStroke } from './overlay'

type PathPointRef = {
  cmdIndex: number
  pointIndex: number
}

type AnchorMeta = {
  refs: PathPointRef[]
  path: Path
  role: 'anchor' | 'control'
}

type EditablePoint = {
  x: number
  y: number
  refs: PathPointRef[]
  role: 'anchor' | 'control'
  link?: { x: number; y: number }
}

function collectEditablePoints(path: Path): EditablePoint[] {
  const commands = path.path as unknown as (string | number)[][]
  if (!commands?.length) return []

  const points: EditablePoint[] = []
  let cx = 0
  let cy = 0
  let startX = 0
  let startY = 0

  const push = (
    x: number,
    y: number,
    ref: PathPointRef,
    role: 'anchor' | 'control',
    link?: { x: number; y: number },
  ) => {
    if (role === 'anchor') {
      const key = `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`
      const existing = points.find(
        (p) => p.role === 'anchor' && `${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}` === key,
      )
      if (existing) {
        existing.refs.push(ref)
        return
      }
    }
    points.push({ x, y, refs: [ref], role, link })
  }

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i]
    const op = String(cmd[0])
    switch (op) {
      case 'M':
        cx = Number(cmd[1])
        cy = Number(cmd[2])
        startX = cx
        startY = cy
        push(cx, cy, { cmdIndex: i, pointIndex: 1 }, 'anchor')
        break
      case 'L':
        cx = Number(cmd[1])
        cy = Number(cmd[2])
        push(cx, cy, { cmdIndex: i, pointIndex: 1 }, 'anchor')
        break
      case 'H':
        cx = Number(cmd[1])
        push(cx, cy, { cmdIndex: i, pointIndex: 1 }, 'anchor')
        break
      case 'V':
        cy = Number(cmd[1])
        push(cx, cy, { cmdIndex: i, pointIndex: 1 }, 'anchor')
        break
      case 'C': {
        const prev = { x: cx, y: cy }
        cx = Number(cmd[5])
        cy = Number(cmd[6])
        push(Number(cmd[1]), Number(cmd[2]), { cmdIndex: i, pointIndex: 1 }, 'control', prev)
        push(Number(cmd[3]), Number(cmd[4]), { cmdIndex: i, pointIndex: 3 }, 'control', { x: cx, y: cy })
        push(cx, cy, { cmdIndex: i, pointIndex: 5 }, 'anchor')
        break
      }
      case 'Q': {
        const prev = { x: cx, y: cy }
        cx = Number(cmd[3])
        cy = Number(cmd[4])
        push(Number(cmd[1]), Number(cmd[2]), { cmdIndex: i, pointIndex: 1 }, 'control', prev)
        push(cx, cy, { cmdIndex: i, pointIndex: 3 }, 'anchor')
        break
      }
      case 'S': {
        cx = Number(cmd[3])
        cy = Number(cmd[4])
        push(Number(cmd[1]), Number(cmd[2]), { cmdIndex: i, pointIndex: 1 }, 'control', { x: cx, y: cy })
        push(cx, cy, { cmdIndex: i, pointIndex: 3 }, 'anchor')
        break
      }
      case 'T':
        cx = Number(cmd[1])
        cy = Number(cmd[2])
        push(cx, cy, { cmdIndex: i, pointIndex: 1 }, 'anchor')
        break
      case 'Z':
      case 'z':
        cx = startX
        cy = startY
        break
      default:
        break
    }
  }

  return points
}

function pathOffsetOf(path: Path) {
  const o = path.pathOffset
  return { x: o?.x ?? 0, y: o?.y ?? 0 }
}

function localToCanvas(path: Path, x: number, y: number) {
  const off = pathOffsetOf(path)
  const p = util.transformPoint({ x: x - off.x, y: y - off.y }, path.calcTransformMatrix())
  return { x: p.x, y: p.y }
}

function canvasToLocal(path: Path, x: number, y: number) {
  const off = pathOffsetOf(path)
  const inv = util.invertTransform(path.calcTransformMatrix() as TMat2D)
  const p = util.transformPoint({ x, y }, inv)
  return { x: p.x + off.x, y: p.y + off.y }
}

export class PathEditor {
  private canvas: Canvas
  private target: Path | null = null
  private anchors: Circle[] = []
  private lines: Line[] = []
  private onChange: (() => void) | null = null

  constructor(canvas: Canvas) {
    this.canvas = canvas
  }

  get activePath() {
    return this.target
  }

  get isEditing() {
    return this.target !== null
  }

  setOnChange(cb: (() => void) | null) {
    this.onChange = cb
  }

  clear() {
    const hadTarget = this.target
    if (this.target) {
      this.target.set({ selectable: true, evented: true })
      this.target = null
    }

    const active = this.canvas.getActiveObject()
    if (active && isOverlayObject(active) && !isGradientOverlay(active)) {
      this.canvas.discardActiveObject()
    }

    for (const a of this.anchors) {
      a.off('moving')
      a.off('modified')
      safeRemove(this.canvas, a)
    }
    for (const l of this.lines) safeRemove(this.canvas, l)
    this.anchors = []
    this.lines = []

    // 清扫残留路径锚点（不含渐变手柄）
    for (const o of [...this.canvas.getObjects()]) {
      if (!isOverlayObject(o) || isGradientOverlay(o)) continue
      safeRemove(this.canvas, o)
    }

    if (hadTarget) {
      for (const o of this.canvas.getObjects()) {
        if (!isOverlayObject(o)) o.set({ evented: true, selectable: true })
      }
    }
    this.canvas.requestRenderAll()
  }

  start(path: Path) {
    this.clear()
    this.target = path
    path.set({ selectable: false, evented: false, objectCaching: false })
    for (const o of this.canvas.getObjects()) {
      if (o !== path && !isOverlayObject(o)) o.set({ evented: false, selectable: false })
    }
    this.rebuildAnchors()
    this.canvas.discardActiveObject()
    this.canvas.requestRenderAll()
  }

  private rebuildAnchors() {
    if (!this.target) return
    for (const a of this.anchors) {
      a.off('moving')
      a.off('modified')
      safeRemove(this.canvas, a)
    }
    for (const l of this.lines) safeRemove(this.canvas, l)
    this.anchors = []
    this.lines = []

    const points = collectEditablePoints(this.target)
    const anchors = points.filter((p) => p.role === 'anchor')
    const controls = points.filter((p) => p.role === 'control')
    const showControls = controls.length <= 48
    const controlStep = showControls ? (controls.length > 36 ? 2 : 1) : 0
    const { radius: r, stroke } = zoomStroke(this.canvas)
    const rAnchor = r(3)
    const rControl = r(2.25)

    const place = (pt: EditablePoint) => {
      if (!this.target) return
      const screen = localToCanvas(this.target, pt.x, pt.y)
      const isControl = pt.role === 'control'

      if (isControl && pt.link) {
        const linkScreen = localToCanvas(this.target, pt.link.x, pt.link.y)
        const line = new Line([linkScreen.x, linkScreen.y, screen.x, screen.y], {
          stroke: 'rgba(15, 110, 86, 0.4)',
          strokeWidth: stroke,
          selectable: false,
          evented: false,
          objectCaching: false,
        })
        markOverlay(line)
        this.lines.push(line)
        this.canvas.add(line)
      }

      const anchor = new Circle({
        left: screen.x,
        top: screen.y,
        originX: 'center',
        originY: 'center',
        radius: isControl ? rControl : rAnchor,
        fill: isControl ? '#fff' : '#0f6e56',
        stroke: isControl ? '#0f6e56' : '#fff',
        strokeWidth: stroke,
        hasControls: false,
        hasBorders: false,
        selectable: true,
        evented: true,
        hoverCursor: 'grab',
        moveCursor: 'grabbing',
        objectCaching: false,
      })
      markOverlay(anchor, {
        __meta: { refs: pt.refs, path: this.target, role: pt.role } satisfies AnchorMeta,
        data: { type: 'path-anchor' },
      })

      anchor.on('moving', () => this.onAnchorMove(anchor))
      anchor.on('modified', () => {
        this.rebuildAnchors()
        this.onChange?.()
      })

      this.anchors.push(anchor)
      this.canvas.add(anchor)
      this.canvas.bringObjectToFront(anchor)
    }

    for (const pt of anchors) place(pt)
    if (controlStep > 0) {
      for (let i = 0; i < controls.length; i += controlStep) place(controls[i])
    }
  }

  private onAnchorMove(anchor: Circle) {
    const meta = (anchor as Circle & { __meta?: AnchorMeta }).__meta
    if (!meta || !this.target) return

    const local = canvasToLocal(this.target, anchor.left ?? 0, anchor.top ?? 0)
    const commands = this.target.path as unknown as (string | number)[][]

    for (const ref of meta.refs) {
      const cmd = commands[ref.cmdIndex]
      if (!cmd) continue
      const op = String(cmd[0])
      if (op === 'H') cmd[ref.pointIndex] = local.x
      else if (op === 'V') cmd[ref.pointIndex] = local.y
      else {
        cmd[ref.pointIndex] = local.x
        cmd[ref.pointIndex + 1] = local.y
      }
    }

    const center = this.target.getCenterPoint()
    this.target._setPath(commands as never, false)
    this.target.setDimensions()
    this.target.setPositionByOrigin(center, 'center', 'center')
    this.target.setCoords()

    this.refreshControlLines()
    this.canvas.requestRenderAll()
  }

  private refreshControlLines() {
    if (!this.target || !this.lines.length) return
    const points = collectEditablePoints(this.target).filter((p) => p.role === 'control' && p.link)
    const step = points.length > 48 ? 2 : 1
    let lineIdx = 0
    for (let i = 0; i < points.length && lineIdx < this.lines.length; i += step) {
      const pt = points[i]
      if (!pt.link) continue
      const screen = localToCanvas(this.target, pt.x, pt.y)
      const linkScreen = localToCanvas(this.target, pt.link.x, pt.link.y)
      this.lines[lineIdx].set({
        x1: linkScreen.x,
        y1: linkScreen.y,
        x2: screen.x,
        y2: screen.y,
      })
      this.lines[lineIdx].setCoords()
      lineIdx++
    }
  }

  refresh() {
    if (this.target) this.rebuildAnchors()
  }

  static isAnchorObject(obj: FabricObject | undefined | null): boolean {
    return isOverlayObject(obj)
  }
}
