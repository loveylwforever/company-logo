import { Circle, Path, util, type Canvas, type FabricObject, type TMat2D } from 'fabric'

type PathPointRef = {
  cmdIndex: number
  pointIndex: number // index into command args that is x (y is +1)
}

type AnchorMeta = {
  refs: PathPointRef[]
  path: Path
}

const ANCHOR_TYPE = 'path-anchor'

function isAnchor(obj: FabricObject | undefined): boolean {
  return Boolean(obj && (obj as FabricObject & { __anchor?: boolean }).__anchor)
}

/** Collect absolute x/y pairs from fabric path commands for editing. */
function collectEditablePoints(path: Path): { x: number; y: number; refs: PathPointRef[] }[] {
  const commands = path.path as unknown as (string | number)[][]
  if (!commands?.length) return []

  const groups = new Map<string, { x: number; y: number; refs: PathPointRef[] }>()

  const add = (x: number, y: number, ref: PathPointRef) => {
    const key = `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`
    const existing = groups.get(key)
    if (existing) {
      existing.refs.push(ref)
    } else {
      groups.set(key, { x, y, refs: [ref] })
    }
  }

  let cx = 0
  let cy = 0
  let startX = 0
  let startY = 0

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i]
    const op = String(cmd[0])
    switch (op) {
      case 'M':
        cx = Number(cmd[1])
        cy = Number(cmd[2])
        startX = cx
        startY = cy
        add(cx, cy, { cmdIndex: i, pointIndex: 1 })
        break
      case 'L':
        cx = Number(cmd[1])
        cy = Number(cmd[2])
        add(cx, cy, { cmdIndex: i, pointIndex: 1 })
        break
      case 'H':
        cx = Number(cmd[1])
        add(cx, cy, { cmdIndex: i, pointIndex: 1 })
        break
      case 'V':
        cy = Number(cmd[1])
        add(cx, cy, { cmdIndex: i, pointIndex: 1 })
        break
      case 'C':
        add(Number(cmd[1]), Number(cmd[2]), { cmdIndex: i, pointIndex: 1 })
        add(Number(cmd[3]), Number(cmd[4]), { cmdIndex: i, pointIndex: 3 })
        cx = Number(cmd[5])
        cy = Number(cmd[6])
        add(cx, cy, { cmdIndex: i, pointIndex: 5 })
        break
      case 'Q':
        add(Number(cmd[1]), Number(cmd[2]), { cmdIndex: i, pointIndex: 1 })
        cx = Number(cmd[3])
        cy = Number(cmd[4])
        add(cx, cy, { cmdIndex: i, pointIndex: 3 })
        break
      case 'S':
        add(Number(cmd[1]), Number(cmd[2]), { cmdIndex: i, pointIndex: 1 })
        cx = Number(cmd[3])
        cy = Number(cmd[4])
        add(cx, cy, { cmdIndex: i, pointIndex: 3 })
        break
      case 'T':
        cx = Number(cmd[1])
        cy = Number(cmd[2])
        add(cx, cy, { cmdIndex: i, pointIndex: 1 })
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

  return [...groups.values()]
}

function localToCanvas(path: Path, x: number, y: number): { x: number; y: number } {
  const matrix = path.calcTransformMatrix()
  const p = util.transformPoint({ x, y }, matrix)
  return { x: p.x, y: p.y }
}

function canvasToLocal(path: Path, x: number, y: number): { x: number; y: number } {
  const inv = util.invertTransform(path.calcTransformMatrix() as TMat2D)
  const p = util.transformPoint({ x, y }, inv)
  return { x: p.x, y: p.y }
}

export class PathEditor {
  private canvas: Canvas
  private target: Path | null = null
  private anchors: Circle[] = []
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
    // 先清空 target，避免 remove 触发的 modified → rebuildAnchors 又把锚点建回来
    const hadTarget = this.target
    if (this.target) {
      this.target.set({ selectable: true, evented: true })
      this.target = null
    }

    const active = this.canvas.getActiveObject()
    if (active && isAnchor(active)) this.canvas.discardActiveObject()

    this.anchors = []
    for (const o of [...this.canvas.getObjects()]) {
      if (!isAnchor(o)) continue
      o.off('moving')
      o.off('modified')
      try {
        this.canvas.remove(o)
      } catch {
        /* ignore */
      }
    }

    if (hadTarget) {
      for (const o of this.canvas.getObjects()) {
        if (!isAnchor(o)) o.set({ evented: true, selectable: true })
      }
    }
    this.canvas.requestRenderAll()
  }

  start(path: Path) {
    this.clear()
    this.target = path
    path.set({ selectable: false, evented: false, objectCaching: false })
    for (const o of this.canvas.getObjects()) {
      if (o !== path && !isAnchor(o)) o.set({ evented: false, selectable: false })
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
      this.canvas.remove(a)
    }
    this.anchors = []
    if (!this.target) return

    const points = collectEditablePoints(this.target)
    // Cap anchors for usability on complex glyphs
    const step = points.length > 80 ? Math.ceil(points.length / 80) : 1

    for (let i = 0; i < points.length; i += step) {
      const pt = points[i]
      const screen = localToCanvas(this.target, pt.x, pt.y)
      const anchor = new Circle({
        left: screen.x,
        top: screen.y,
        originX: 'center',
        originY: 'center',
        radius: 5,
        fill: '#0f6e56',
        stroke: '#fff',
        strokeWidth: 1.5,
        hasControls: false,
        hasBorders: false,
        selectable: true,
        evented: true,
        hoverCursor: 'grab',
        moveCursor: 'grabbing',
        objectCaching: false,
        excludeFromExport: true,
      })
      ;(anchor as Circle & { __anchor: boolean; __meta: AnchorMeta }).__anchor = true
      ;(anchor as Circle & { __meta: AnchorMeta }).__meta = {
        refs: pt.refs,
        path: this.target,
      }
      ;(anchor as Circle & { data?: { type: string } }).data = { type: ANCHOR_TYPE }
      // 不进入撤销栈 / 导出
      ;(anchor as Circle & { excludeFromExport?: boolean }).excludeFromExport = true

      anchor.on('moving', () => this.onAnchorMove(anchor))
      anchor.on('modified', () => {
        this.rebuildAnchors()
        this.onChange?.()
      })

      this.anchors.push(anchor)
      this.canvas.add(anchor)
      this.canvas.bringObjectToFront(anchor)
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
      if (op === 'H') {
        cmd[ref.pointIndex] = local.x
      } else if (op === 'V') {
        cmd[ref.pointIndex] = local.y
      } else {
        cmd[ref.pointIndex] = local.x
        cmd[ref.pointIndex + 1] = local.y
      }
    }

    this.target._setPath(commands as never, false)
    this.target.setDimensions()
    this.target.setCoords()
    this.canvas.requestRenderAll()
  }

  /** Keep anchors glued when path is transformed outside edit (safety). */
  refresh() {
    if (this.target) this.rebuildAnchors()
  }

  static isAnchorObject(obj: FabricObject | undefined | null): boolean {
    return isAnchor(obj ?? undefined)
  }
}
