import {
  Circle,
  Line,
  Path,
  Shadow,
  util,
  type Canvas,
  type TMat2D,
} from 'fabric'
import { isGradientOverlay, isOverlayObject, markOverlay, safeRemove, zoomStroke } from './overlay'
import {
  bulgeFromHandles,
  chordNormal,
  cubicPoint,
  curveToLine,
  dist,
  handlesFromBulge,
  lerp,
  lineToCurve,
  pathHasCurves,
  pt,
  segmentStart,
  setCubicBulge,
  translateHandlesFromRefs,
  type PathCmd,
  type PathPointRef,
  type Pt,
} from './pathSegment'
import { autoCorrectPath } from './pathCorrection'

export type PathEditMode = 'line' | 'curve'

type AnchorMeta = {
  refs: PathPointRef[]
  path: Path
  role: 'anchor' | 'control' | 'bend'
  baseRadius: number
  cmdIndex?: number
}

type EditablePoint = {
  x: number
  y: number
  refs: PathPointRef[]
  role: 'anchor' | 'control' | 'bend'
  link?: Pt
  cmdIndex?: number
}

const PATH_UI = {
  accent: '#0f6e56',
  accentDeep: '#0b5a46',
  hollowFill: '#ffffff',
  hollowFillActive: '#e7f6f0',
  solidFill: '#0f6e56',
  solidFillActive: '#0b5a46',
  solidStroke: '#ffffff',
  bendFill: '#f5a524',
  bendFillActive: '#d4890f',
  bendStroke: '#ffffff',
  line: 'rgba(15, 110, 86, 0.9)',
  shadow: () =>
    new Shadow({
      color: 'rgba(0, 0, 0, 0.5)',
      blur: 3.5,
      offsetX: 0,
      offsetY: 1,
    }),
}

/** 屏幕像素尺寸（再除以 zoom） */
const HANDLE = { anchor: 5.6, control: 4.4, bend: 4.8, pad: 3.5, ring: 2.2, line: 1.85 }
/** 过短边不放弯曲点，避免零弦法向抖动 */
const MIN_BEND_LEN = 4

function handleMetrics(canvas: Canvas) {
  const { radius: r, zoom } = zoomStroke(canvas)
  return {
    rAnchor: r(HANDLE.anchor),
    rControl: r(HANDLE.control),
    rBend: r(HANDLE.bend),
    hitPad: r(HANDLE.pad),
    ring: Math.max(1.6, HANDLE.ring / zoom),
    lineW: Math.max(1.35, HANDLE.line / zoom),
  }
}

function collectEditablePoints(path: Path, mode: PathEditMode): EditablePoint[] {
  const commands = path.path as unknown as PathCmd[]
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
    link?: Pt,
  ) => {
    if (role === 'anchor') {
      const key = `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`
      const existing = points.find(
        (p) =>
          p.role === 'anchor' &&
          `${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}` === key,
      )
      if (existing) {
        existing.refs.push(ref)
        return
      }
    }
    points.push({ x, y, refs: [ref], role, link })
  }

  const pushBend = (p0: Pt, p3: Pt, cmdIndex: number, pos: Pt) => {
    if (mode !== 'curve' || dist(p0, p3) < MIN_BEND_LEN) return
    points.push({ x: pos.x, y: pos.y, refs: [], role: 'bend', cmdIndex })
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
      case 'L': {
        const p0 = { x: cx, y: cy }
        cx = Number(cmd[1])
        cy = Number(cmd[2])
        push(cx, cy, { cmdIndex: i, pointIndex: 1 }, 'anchor')
        pushBend(p0, { x: cx, y: cy }, i, lerp(p0, { x: cx, y: cy }, 0.5))
        break
      }
      case 'H':
        cx = Number(cmd[1])
        push(cx, cy, { cmdIndex: i, pointIndex: 1 }, 'anchor')
        break
      case 'V':
        cy = Number(cmd[1])
        push(cx, cy, { cmdIndex: i, pointIndex: 1 }, 'anchor')
        break
      case 'C': {
        const p0 = { x: cx, y: cy }
        const p1 = pt(cmd, 1)
        const p2 = pt(cmd, 3)
        const p3 = pt(cmd, 5)
        cx = p3.x
        cy = p3.y
        if (mode === 'curve') {
          push(p1.x, p1.y, { cmdIndex: i, pointIndex: 1 }, 'control', p0)
          push(p2.x, p2.y, { cmdIndex: i, pointIndex: 3 }, 'control', p3)
          pushBend(p0, p3, i, cubicPoint(p0, p1, p2, p3, 0.5))
        }
        push(cx, cy, { cmdIndex: i, pointIndex: 5 }, 'anchor')
        break
      }
      case 'Q': {
        const prev = { x: cx, y: cy }
        cx = Number(cmd[3])
        cy = Number(cmd[4])
        if (mode === 'curve') {
          push(Number(cmd[1]), Number(cmd[2]), { cmdIndex: i, pointIndex: 1 }, 'control', prev)
        }
        push(cx, cy, { cmdIndex: i, pointIndex: 3 }, 'anchor')
        break
      }
      case 'S': {
        cx = Number(cmd[3])
        cy = Number(cmd[4])
        if (mode === 'curve') {
          push(Number(cmd[1]), Number(cmd[2]), { cmdIndex: i, pointIndex: 1 }, 'control', {
            x: cx,
            y: cy,
          })
        }
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

/** 更新 path 并保持世界坐标中心，避免拖拽时整段漂移 */
function applyPathCommands(path: Path, commands: PathCmd[]) {
  const center = path.getCenterPoint()
  path._setPath(commands as never, false)
  path.setDimensions()
  path.setPositionByOrigin(center, 'center', 'center')
  path.setCoords()
  path.dirty = true
}

function detachHandleEvents(handle: Circle) {
  handle.off('moving')
  handle.off('modified')
  handle.off('mouseover')
  handle.off('mouseout')
  handle.off('mousedown')
}

export class PathEditor {
  private canvas: Canvas
  private target: Path | null = null
  private anchors: Circle[] = []
  private lines: Line[] = []
  private onChange: (() => void) | null = null
  private mode: PathEditMode = 'curve'
  private activeBendCmd = -1

  constructor(canvas: Canvas) {
    this.canvas = canvas
  }

  get activePath() {
    return this.target
  }

  get isEditing() {
    return this.target !== null
  }

  get editMode() {
    return this.mode
  }

  setOnChange(cb: (() => void) | null) {
    this.onChange = cb
  }

  setMode(mode: PathEditMode) {
    if (!this.target || this.mode === mode) {
      this.mode = mode
      return
    }
    const live = this.target.path as unknown as PathCmd[]
    const next = mode === 'curve' ? lineToCurve(live) : curveToLine(live)
    applyPathCommands(this.target, next)
    this.mode = mode
    this.activeBendCmd = mode === 'curve' ? next.findIndex((c) => String(c[0]) === 'C') : -1
    this.rebuildAnchors()
    this.onChange?.()
  }

  setBendAmount(bulge: number) {
    if (!this.target || this.mode !== 'curve') return
    const live = this.target.path as unknown as PathCmd[]
    const commands = live.map((c) => c.slice()) as PathCmd[]
    if (this.activeBendCmd < 0 || String(commands[this.activeBendCmd]?.[0]) !== 'C') {
      this.activeBendCmd = commands.findIndex((c) => String(c[0]) === 'C')
    }
    if (this.activeBendCmd < 0) return
    const cmd = commands[this.activeBendCmd]
    if (!cmd || String(cmd[0]) !== 'C') return
    setCubicBulge(commands, this.activeBendCmd, segmentStart(commands, this.activeBendCmd), bulge)
    applyPathCommands(this.target, commands)
    this.rebuildAnchors()
    this.onChange?.()
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

    this.stripHandles()
    this.activeBendCmd = -1

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
    const cmds = (path.path as unknown as PathCmd[]) || []
    this.mode = pathHasCurves(cmds) ? 'curve' : 'line'
    this.activeBendCmd = cmds.findIndex((c) => String(c[0]) === 'C')
    path.set({ selectable: false, evented: false, objectCaching: false })
    for (const o of this.canvas.getObjects()) {
      if (o !== path && !isOverlayObject(o)) o.set({ evented: false, selectable: false })
    }
    this.rebuildAnchors()
    this.canvas.discardActiveObject()
    this.canvas.requestRenderAll()
  }

  private stripHandles() {
    for (const a of this.anchors) {
      detachHandleEvents(a)
      safeRemove(this.canvas, a)
    }
    for (const l of this.lines) safeRemove(this.canvas, l)
    this.anchors = []
    this.lines = []
  }

  private rebuildAnchors() {
    if (!this.target) return
    this.stripHandles()

    const points = collectEditablePoints(this.target, this.mode)
    const anchors = points.filter((p) => p.role === 'anchor')
    const controls = points.filter((p) => p.role === 'control')
    const bends = points.filter((p) => p.role === 'bend')
    const showControls = this.mode === 'curve' && controls.length > 0 && controls.length <= 64
    const controlStep = !showControls ? 0 : controls.length > 36 ? 2 : 1
    const bendStep = bends.length > 40 ? 2 : 1
    const m = handleMetrics(this.canvas)

    const place = (ptEd: EditablePoint) => {
      if (!this.target) return
      const screen = localToCanvas(this.target, ptEd.x, ptEd.y)
      const role = ptEd.role
      const baseRadius = role === 'anchor' ? m.rAnchor : role === 'bend' ? m.rBend : m.rControl

      if (role === 'control' && ptEd.link) {
        const linkScreen = localToCanvas(this.target, ptEd.link.x, ptEd.link.y)
        const line = new Line([linkScreen.x, linkScreen.y, screen.x, screen.y], {
          stroke: PATH_UI.line,
          strokeWidth: m.lineW,
          selectable: false,
          evented: false,
          objectCaching: false,
          opacity: 0.92,
        })
        markOverlay(line)
        this.lines.push(line)
        this.canvas.add(line)
      }

      const fill =
        role === 'anchor' ? PATH_UI.solidFill : role === 'bend' ? PATH_UI.bendFill : PATH_UI.hollowFill
      const stroke = role === 'control' ? PATH_UI.accent : PATH_UI.solidStroke

      const handle = new Circle({
        left: screen.x,
        top: screen.y,
        originX: 'center',
        originY: 'center',
        radius: baseRadius,
        fill,
        stroke,
        strokeWidth: m.ring,
        paintFirst: 'stroke',
        shadow: PATH_UI.shadow(),
        padding: m.hitPad,
        hasControls: false,
        hasBorders: false,
        selectable: true,
        evented: true,
        hoverCursor: 'grab',
        moveCursor: 'grabbing',
        objectCaching: false,
        perPixelTargetFind: false,
      })
      markOverlay(handle, {
        __meta: {
          refs: ptEd.refs,
          path: this.target,
          role,
          baseRadius,
          cmdIndex: ptEd.cmdIndex,
        } satisfies AnchorMeta,
        data: { type: 'path-anchor' },
      })

      const applyState = (state: 'idle' | 'hover' | 'active') => {
        const scale = state === 'idle' ? 1 : state === 'hover' ? 1.16 : 1.28
        if (role === 'control') {
          handle.set({
            radius: baseRadius * scale,
            fill: state === 'active' ? PATH_UI.hollowFillActive : PATH_UI.hollowFill,
            stroke: state === 'active' ? PATH_UI.accentDeep : PATH_UI.accent,
            strokeWidth: m.ring * (state === 'idle' ? 1 : 1.12),
          })
        } else if (role === 'bend') {
          handle.set({
            radius: baseRadius * scale,
            fill: state === 'active' ? PATH_UI.bendFillActive : PATH_UI.bendFill,
            stroke: PATH_UI.bendStroke,
            strokeWidth: m.ring * (state === 'idle' ? 1 : 1.1),
          })
        } else {
          handle.set({
            radius: baseRadius * scale,
            fill: state === 'active' ? PATH_UI.solidFillActive : PATH_UI.solidFill,
            stroke: PATH_UI.solidStroke,
            strokeWidth: m.ring * (state === 'idle' ? 1 : 1.1),
          })
        }
        this.canvas.requestRenderAll()
      }

      handle.on('mouseover', () => {
        if (this.canvas.getActiveObject() === handle) return
        applyState('hover')
      })
      handle.on('mouseout', () => {
        if (this.canvas.getActiveObject() === handle) return
        applyState('idle')
      })
      handle.on('mousedown', () => applyState('active'))
      handle.on('moving', () => this.onHandleMove(handle))
      handle.on('modified', () => {
        this.rebuildAnchors()
        this.onChange?.()
      })

      this.anchors.push(handle)
      this.canvas.add(handle)
    }

    for (const p of anchors) place(p)
    for (let i = 0; i < bends.length; i += bendStep) place(bends[i])
    if (controlStep > 0) {
      for (let i = 0; i < controls.length; i += controlStep) place(controls[i])
    }
    for (const a of this.anchors) this.canvas.bringObjectToFront(a)
  }

  syncZoomMetrics() {
    if (!this.target || !this.anchors.length) return
    const m = handleMetrics(this.canvas)
    for (const a of this.anchors) {
      const meta = (a as Circle & { __meta?: AnchorMeta }).__meta
      if (!meta) continue
      const base =
        meta.role === 'control' ? m.rControl : meta.role === 'bend' ? m.rBend : m.rAnchor
      meta.baseRadius = base
      a.set({
        radius: base,
        strokeWidth: m.ring,
        padding: m.hitPad,
        stroke: meta.role === 'control' ? PATH_UI.accent : PATH_UI.solidStroke,
        fill:
          meta.role === 'control'
            ? PATH_UI.hollowFill
            : meta.role === 'bend'
              ? PATH_UI.bendFill
              : PATH_UI.solidFill,
      })
      a.setCoords()
    }
    for (const l of this.lines) {
      l.set({ strokeWidth: m.lineW, stroke: PATH_UI.line })
      l.setCoords()
    }
    this.canvas.requestRenderAll()
  }

  private onHandleMove(handle: Circle) {
    const meta = (handle as Circle & { __meta?: AnchorMeta }).__meta
    if (!meta || !this.target) return
    if (!this.canvas.getObjects().includes(this.target)) {
      this.clear()
      return
    }

    const local = canvasToLocal(this.target, handle.left ?? 0, handle.top ?? 0)
    const live = this.target.path as unknown as PathCmd[]
    const commands = live.map((cmd) => cmd.slice()) as PathCmd[]

    if (meta.role === 'bend' && meta.cmdIndex != null) {
      this.applyBendDrag(commands, meta.cmdIndex, local)
      this.commitAndResync(handle, commands, local)
      return
    }

    if (meta.role === 'anchor') {
      const ref0 = meta.refs[0]
      let oldX = local.x
      let oldY = local.y
      if (ref0) {
        const c = live[ref0.cmdIndex]
        if (c) {
          const op = String(c[0])
          if (op === 'H') {
            oldX = Number(c[1])
            oldY = local.y
          } else if (op === 'V') {
            oldX = local.x
            oldY = Number(c[1])
          } else {
            oldX = Number(c[ref0.pointIndex])
            oldY = Number(c[ref0.pointIndex + 1])
          }
        }
      }
      const dx = local.x - oldX
      const dy = local.y - oldY

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
      if (this.mode === 'curve') translateHandlesFromRefs(commands, meta.refs, dx, dy)
    } else {
      for (const ref of meta.refs) {
        const cmd = commands[ref.cmdIndex]
        if (!cmd) continue
        cmd[ref.pointIndex] = local.x
        cmd[ref.pointIndex + 1] = local.y
      }
    }

    this.commitAndResync(handle, commands, local)
  }

  /** 提交 path 后把拖拽柄吸回几何点，抵消 pathOffset 更新带来的光标漂移 */
  private commitAndResync(handle: Circle, commands: PathCmd[], local: Pt) {
    if (!this.target) return
    applyPathCommands(this.target, commands)
    const screen = localToCanvas(this.target, local.x, local.y)
    handle.set({ left: screen.x, top: screen.y })
    handle.setCoords()
    this.refreshOverlayGeometry(handle)
    this.canvas.requestRenderAll()
  }

  private applyBendDrag(commands: PathCmd[], cmdIndex: number, local: Pt) {
    let cmd = commands[cmdIndex]
    if (!cmd) return
    const p0 = segmentStart(commands, cmdIndex)

    if (String(cmd[0]) === 'L') {
      const p3 = pt(cmd, 1)
      if (dist(p0, p3) < MIN_BEND_LEN) return
      const [h1, h2] = handlesFromBulge(p0, p3, 0)
      commands[cmdIndex] = ['C', h1.x, h1.y, h2.x, h2.y, p3.x, p3.y]
      cmd = commands[cmdIndex]
      this.mode = 'curve'
    }

    if (String(cmd[0]) !== 'C') return
    const p3 = pt(cmd, 5)
    const chordLen = dist(p0, p3)
    if (chordLen < MIN_BEND_LEN) return
    const mid = lerp(p0, p3, 0.5)
    const n = chordNormal(p0, p3)
    const raw = (local.x - mid.x) * n.x + (local.y - mid.y) * n.y
    const bulge = Math.max(-chordLen, Math.min(chordLen, raw / 0.75))
    setCubicBulge(commands, cmdIndex, p0, bulge)
    this.activeBendCmd = cmdIndex
  }

  private refreshOverlayGeometry(skip?: Circle) {
    if (!this.target) return
    const points = collectEditablePoints(this.target, this.mode)
    const controls = points.filter((p) => p.role === 'control' && p.link)
    const bends = points.filter((p) => p.role === 'bend')
    const step = controls.length > 48 ? 2 : 1

    let lineIdx = 0
    for (let i = 0; i < controls.length && lineIdx < this.lines.length; i += step) {
      const p = controls[i]
      if (!p.link) continue
      const screen = localToCanvas(this.target, p.x, p.y)
      const linkScreen = localToCanvas(this.target, p.link.x, p.link.y)
      this.lines[lineIdx].set({
        x1: linkScreen.x,
        y1: linkScreen.y,
        x2: screen.x,
        y2: screen.y,
        stroke: PATH_UI.line,
      })
      this.lines[lineIdx].setCoords()
      lineIdx++
    }

    for (const a of this.anchors) {
      if (a === skip) continue
      const meta = (a as Circle & { __meta?: AnchorMeta }).__meta
      if (!meta || !this.target) continue
      if (meta.role === 'bend' && meta.cmdIndex != null) {
        const b = bends.find((x) => x.cmdIndex === meta.cmdIndex)
        if (!b) continue
        const screen = localToCanvas(this.target, b.x, b.y)
        a.set({ left: screen.x, top: screen.y })
        a.setCoords()
      } else if (meta.role === 'control' && meta.refs[0]) {
        const ref = meta.refs[0]
        const cmds = this.target.path as unknown as PathCmd[]
        const cmd = cmds[ref.cmdIndex]
        if (!cmd) continue
        const screen = localToCanvas(
          this.target,
          Number(cmd[ref.pointIndex]),
          Number(cmd[ref.pointIndex + 1]),
        )
        a.set({ left: screen.x, top: screen.y })
        a.setCoords()
      } else if (meta.role === 'anchor' && meta.refs[0]) {
        const ref = meta.refs[0]
        const cmds = this.target.path as unknown as PathCmd[]
        const cmd = cmds[ref.cmdIndex]
        if (!cmd) continue
        const op = String(cmd[0])
        let x = Number(cmd[ref.pointIndex])
        let y = Number(cmd[ref.pointIndex + 1])
        if (op === 'H') y = segmentStart(cmds, ref.cmdIndex).y
        if (op === 'V') {
          y = Number(cmd[1])
          x = segmentStart(cmds, ref.cmdIndex).x
        }
        const screen = localToCanvas(this.target, x, y)
        a.set({ left: screen.x, top: screen.y })
        a.setCoords()
      }
    }
  }

  bendSliderRange(): { min: number; max: number; value: number } {
    if (!this.target || this.mode !== 'curve') return { min: -40, max: 40, value: 0 }
    const cmds = this.target.path as unknown as PathCmd[]
    let idx = this.activeBendCmd
    if (idx < 0 || String(cmds[idx]?.[0]) !== 'C') {
      idx = cmds.findIndex((c) => String(c[0]) === 'C')
    }
    if (idx < 0) return { min: -40, max: 40, value: 0 }
    const cmd = cmds[idx]
    if (!cmd || String(cmd[0]) !== 'C') return { min: -40, max: 40, value: 0 }
    const p0 = segmentStart(cmds, idx)
    const p3 = pt(cmd, 5)
    const max = Math.max(20, Math.round(dist(p0, p3) * 0.85))
    const value = bulgeFromHandles(p0, pt(cmd, 1), pt(cmd, 3), p3)
    return { min: -max, max, value: Math.round(value * 10) / 10 }
  }

  /** 自动修正路径：拉直、对齐、网格吸附 */
  autoCorrect(options?: {
    straighten?: boolean
    snapToGrid?: boolean
    gridSize?: number
    alignAnchors?: boolean
    threshold?: number
  }) {
    if (!this.target) return
    const live = this.target.path as unknown as PathCmd[]
    const corrected = autoCorrectPath(live, options)
    applyPathCommands(this.target, corrected)
    this.rebuildAnchors()
    this.onChange?.()
  }
}
