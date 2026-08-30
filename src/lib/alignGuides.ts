import { Point, type Canvas, type FabricObject, type TMat2D } from 'fabric'
import { PathEditor } from './pathEditor'

/** 接近中心时显示黄线的容差（场景坐标） */
const SHOW_EPS = 5

function isSkippable(obj: FabricObject) {
  return PathEditor.isAnchorObject(obj) || obj.visible === false
}

type GuideLine = { orientation: 'v' | 'h'; position: number }

/**
 * 接近居中显示黄线；变换提交后（松开）严格对齐中心，再隐藏定位线。
 */
export class AlignGuideManager {
  private canvas: Canvas
  private guides: GuideLine[] = []
  private enabled = true
  private snapX: number | null = null
  private snapY: number | null = null
  private activeTarget: FabricObject | null = null
  /** 本次拖拽需要在 modified 时吸附 */
  private pendingSnap = false

  constructor(canvas: Canvas) {
    this.canvas = canvas
    canvas.on('object:moving', (e) => this.onMoving(e.target))
    // 变换提交后再吸附，避免被 Fabric 最后一次定位覆盖
    canvas.on('object:modified', (e) => this.onModified(e.target))
    canvas.on('mouse:up', () => {
      // 兜底：部分操作不触发 modified
      if (this.pendingSnap) {
        requestAnimationFrame(() => this.commitSnap())
      }
    })
    canvas.on('after:render', () => this.draw())
  }

  setEnabled(on: boolean) {
    this.enabled = on
    if (!on) this.clear()
  }

  clear() {
    this.activeTarget = null
    this.snapX = null
    this.snapY = null
    this.pendingSnap = false
    if (!this.guides.length) return
    this.guides = []
    this.canvas.contextTopDirty = true
    this.canvas.requestRenderAll()
  }

  private excludeSet(target: FabricObject): Set<FabricObject> {
    const set = new Set<FabricObject>()
    const kids = (target as FabricObject & { _objects?: FabricObject[] })._objects
    if (kids?.length) kids.forEach((o) => set.add(o))
    else set.add(target)
    return set
  }

  private collectCenters(exclude: Set<FabricObject>) {
    const vertical: number[] = []
    const horizontal: number[] = []

    const vpt = this.canvas.vptCoords
    if (vpt) {
      vertical.push((vpt.tl.x + vpt.br.x) / 2)
      horizontal.push((vpt.tl.y + vpt.br.y) / 2)
    }

    for (const obj of this.canvas.getObjects()) {
      if (exclude.has(obj) || isSkippable(obj)) continue
      const c = obj.getCenterPoint()
      vertical.push(c.x)
      horizontal.push(c.y)
    }
    return { vertical, horizontal }
  }

  private nearest(values: number[], value: number, eps: number): number | null {
    let best: number | null = null
    let bestDist = eps
    for (const v of values) {
      const d = Math.abs(v - value)
      if (d <= bestDist) {
        bestDist = d
        best = v
      }
    }
    return best
  }

  private onMoving(target: FabricObject | undefined) {
    if (!this.enabled || !target || isSkippable(target)) {
      this.guides = []
      this.snapX = null
      this.snapY = null
      this.activeTarget = null
      this.pendingSnap = false
      return
    }

    this.activeTarget = target
    const center = target.getCenterPoint()
    const { vertical, horizontal } = this.collectCenters(this.excludeSet(target))

    this.snapX = this.nearest(vertical, center.x, SHOW_EPS)
    this.snapY = this.nearest(horizontal, center.y, SHOW_EPS)
    this.pendingSnap = this.snapX !== null || this.snapY !== null

    const guides: GuideLine[] = []
    if (this.snapX !== null) guides.push({ orientation: 'v', position: this.snapX })
    if (this.snapY !== null) guides.push({ orientation: 'h', position: this.snapY })

    const changed =
      guides.length !== this.guides.length ||
      guides.some(
        (g, i) =>
          g.orientation !== this.guides[i]?.orientation || g.position !== this.guides[i]?.position,
      )
    this.guides = guides
    if (changed) {
      this.canvas.contextTopDirty = true
      this.canvas.requestRenderAll()
    }
  }

  private onModified(target: FabricObject | undefined) {
    if (!this.pendingSnap || !target || target !== this.activeTarget) {
      // 缩放/旋转等：清线
      if (!this.pendingSnap) this.clear()
      return
    }
    this.commitSnap()
  }

  private commitSnap() {
    if (!this.enabled || !this.pendingSnap) {
      this.clear()
      return
    }

    const target = this.activeTarget
    const sx = this.snapX
    const sy = this.snapY
    this.pendingSnap = false

    if (!target || (sx === null && sy === null)) {
      this.clear()
      return
    }

    const center = target.getCenterPoint()
    const next = new Point(sx !== null ? sx : center.x, sy !== null ? sy : center.y)
    target.setPositionByOrigin(next, 'center', 'center')
    target.setCoords()

    // 校验：若仍有偏差再补一次（路径/描边极端情况）
    const after = target.getCenterPoint()
    const fixX = sx !== null ? sx - after.x : 0
    const fixY = sy !== null ? sy - after.y : 0
    if (Math.abs(fixX) > 0.01 || Math.abs(fixY) > 0.01) {
      target.set({
        left: (target.left ?? 0) + fixX,
        top: (target.top ?? 0) + fixY,
      })
      target.setCoords()
    }

    this.guides = []
    this.snapX = null
    this.snapY = null
    this.activeTarget = null
    this.canvas.contextTopDirty = true
    this.canvas.requestRenderAll()
  }

  private draw() {
    if (!this.guides.length) return
    const canvas = this.canvas
    const ctx = canvas.getSelectionContext()
    if (!ctx) return

    const vpt = canvas.viewportTransform as TMat2D | undefined
    const zoom = canvas.getZoom()
    const coords = canvas.vptCoords
    if (!vpt || !coords) return

    ctx.save()
    ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5])
    ctx.strokeStyle = '#f5c518'
    ctx.lineWidth = 1.5 / zoom
    ctx.setLineDash([])
    ctx.beginPath()

    for (const g of this.guides) {
      if (g.orientation === 'v') {
        ctx.moveTo(g.position, coords.tl.y - 40)
        ctx.lineTo(g.position, coords.br.y + 40)
      } else {
        ctx.moveTo(coords.tl.x - 40, g.position)
        ctx.lineTo(coords.br.x + 40, g.position)
      }
    }
    ctx.stroke()
    ctx.restore()
  }
}
