import {
  Canvas,
  FabricObject,
  Gradient,
  IText,
  Path,
  Point,
  Rect,
  Shadow,
  type FabricObjectProps,
} from 'fabric'
import { textToPathData, getFontOption, type FontOption } from './fonts'
import { shapePath, type ShapeKind, SHAPE_META, getShapeMeta } from './shapes'
import { HistoryStack, serializeCanvas } from './history'
import { PathEditor } from './pathEditor'
import {
  downloadBlob,
  dataUrlToArrayBuffer,
  encodeIco,
  type ExportSize,
} from './export'
import { getPalette, type Palette, DEFAULT_PALETTE_ID } from './palettes'
import { AlignGuideManager } from './alignGuides'

/** 持久化自定义元数据，保证撤销后容器仍可识别 */
FabricObject.customProperties = ['__uid', '__label', '__role', '__fontId']

/** 默认 Logo 容器边长 */
export const DEFAULT_CONTAINER_SIZE = 512
export const CONTAINER_PRESETS = [512, 256, 128] as const

const ROLE_CONTAINER = 'container'

export type LayerInfo = {
  id: string
  name: string
  type: string
  visible: boolean
  locked: boolean
  isContainer?: boolean
}

export type FillMode = 'solid' | 'linear' | 'radial'

export type SelectionProps = {
  fill: string
  stroke: string
  strokeWidth: number
  opacity: number
  width: number
  height: number
  fontSize?: number
  fontFamily?: string
  isText: boolean
  isPath: boolean
  isContainer: boolean
  pathEditing: boolean
  containerSize?: number
  fillMode: FillMode
  gradientColor1: string
  gradientColor2: string
  gradientAngle: number
  shadowEnabled: boolean
  shadowColor: string
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
}

type Listeners = {
  onSelectionChange: (props: SelectionProps | null) => void
  onLayersChange: (layers: LayerInfo[]) => void
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void
  onObjectCount: (count: number) => void
  onZoomChange?: (zoomPercent: number) => void
  onContextMenu?: (menu: ContextMenuState | null) => void
}

export type ContextMenuState = {
  x: number
  y: number
  pathEditing: boolean
  locked: boolean
}

type MetaObject = FabricObject & {
  __uid?: string
  __label?: string
  __role?: string
  __fontId?: string
}

function objId(obj: FabricObject): string {
  return (obj as MetaObject).__uid ?? ''
}

function ensureId(obj: FabricObject) {
  const o = obj as MetaObject
  if (!o.__uid) o.__uid = `o_${Math.random().toString(36).slice(2, 9)}`
}

export function isContainer(obj: FabricObject | null | undefined): boolean {
  return Boolean(obj && (obj as MetaObject).__role === ROLE_CONTAINER)
}

function isStrokeOnlyShape(obj: FabricObject): boolean {
  const label = (obj as MetaObject).__label
  return Boolean(label && getShapeMeta(label as ShapeKind).strokeOnly)
}

function isTextLike(obj: FabricObject): boolean {
  return obj instanceof IText || obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox'
}

function displayName(obj: FabricObject): string {
  if (isContainer(obj)) {
    const w = Math.round(obj.getScaledWidth())
    return `容器 ${w}`
  }
  if (obj instanceof IText) return obj.text?.slice(0, 12) || '文字'
  const custom = (obj as MetaObject).__label
  if (custom) {
    const meta = SHAPE_META.find((s) => s.id === custom)
    return meta?.label ?? custom
  }
  if (obj instanceof Path) return '路径'
  return obj.type || '对象'
}

function angleToLinearCoords(angleDeg: number) {
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

function createGradientFill(
  mode: 'linear' | 'radial',
  c1: string,
  c2: string,
  angle = 90,
) {
  if (mode === 'radial') {
    return new Gradient({
      type: 'radial',
      gradientUnits: 'percentage',
      coords: { x1: 0.5, y1: 0.5, r1: 0, x2: 0.5, y2: 0.5, r2: 0.65 },
      colorStops: [
        { offset: 0, color: c1 },
        { offset: 1, color: c2 },
      ],
    })
  }
  return new Gradient({
    type: 'linear',
    gradientUnits: 'percentage',
    coords: angleToLinearCoords(angle),
    colorStops: [
      { offset: 0, color: c1 },
      { offset: 1, color: c2 },
    ],
  })
}

function readStyleProps(obj: FabricObject): Pick<
  SelectionProps,
  | 'fill'
  | 'fillMode'
  | 'gradientColor1'
  | 'gradientColor2'
  | 'gradientAngle'
  | 'shadowEnabled'
  | 'shadowColor'
  | 'shadowBlur'
  | 'shadowOffsetX'
  | 'shadowOffsetY'
> {
  const fill = obj.fill
  let fillMode: FillMode = 'solid'
  let fillStr = '#000000'
  let gradientColor1 = '#0284c7'
  let gradientColor2 = '#7dd3fc'
  let gradientAngle = 90

  if (typeof fill === 'string') {
    fillStr = fill || '#000000'
  } else if (fill && typeof fill === 'object' && 'colorStops' in fill) {
    const g = fill as Gradient<'linear' | 'radial'>
    fillMode = g.type === 'radial' ? 'radial' : 'linear'
    const stops = [...(g.colorStops || [])].sort((a, b) => a.offset - b.offset)
    if (stops[0]?.color) gradientColor1 = String(stops[0].color)
    if (stops[stops.length - 1]?.color) gradientColor2 = String(stops[stops.length - 1].color)
    fillStr = gradientColor1
    if (g.type === 'linear' && g.coords) {
      const c = g.coords as { x1: number; y1: number; x2: number; y2: number }
      gradientAngle = Math.round((Math.atan2(c.y2 - c.y1, c.x2 - c.x1) * 180) / Math.PI)
      if (gradientAngle < 0) gradientAngle += 360
    }
  }

  const shadow = obj.shadow as Shadow | null | undefined
  return {
    fill: fillStr,
    fillMode,
    gradientColor1,
    gradientColor2,
    gradientAngle,
    shadowEnabled: Boolean(shadow && (shadow.blur > 0 || shadow.offsetX || shadow.offsetY)),
    shadowColor: normalizeShadowColor(shadow?.color),
    shadowBlur: shadow?.blur ?? 12,
    shadowOffsetX: shadow?.offsetX ?? 4,
    shadowOffsetY: shadow?.offsetY ?? 4,
  }
}

function normalizeShadowColor(color: unknown): string {
  if (typeof color !== 'string' || !color) return '#000000'
  if (color.startsWith('#') && color.length >= 7) return color.slice(0, 7)
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (m) {
    const hex = (n: string) => Number(n).toString(16).padStart(2, '0')
    return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`
  }
  return '#000000'
}

/** 容器半透明填充：#RRGGBB → #RRGGBB14 */
function containerFill(color: string) {
  return color.length === 7 ? `${color}14` : color
}

function selectionFields(
  obj: FabricObject,
): Pick<
  SelectionProps,
  | 'fill'
  | 'stroke'
  | 'strokeWidth'
  | 'opacity'
  | 'width'
  | 'height'
  | 'fillMode'
  | 'gradientColor1'
  | 'gradientColor2'
  | 'gradientAngle'
  | 'shadowEnabled'
  | 'shadowColor'
  | 'shadowBlur'
  | 'shadowOffsetX'
  | 'shadowOffsetY'
> {
  const style = readStyleProps(obj)
  if (isStrokeOnlyShape(obj) && typeof obj.stroke === 'string' && obj.stroke) {
    style.fill = obj.stroke
    style.fillMode = 'solid'
  }
  return {
    ...style,
    stroke: String(obj.stroke || 'transparent'),
    strokeWidth: obj.strokeWidth ?? 0,
    opacity: obj.opacity ?? 1,
    width: Math.max(1, Math.round(obj.getScaledWidth())),
    height: Math.max(1, Math.round(obj.getScaledHeight())),
  }
}

type ContainerClip = { left: number; top: number; side: number }

export class LogoController {
  canvas: Canvas | null = null
  history = new HistoryStack()
  pathEditor: PathEditor | null = null
  alignGuides: AlignGuideManager | null = null
  currentFontId = 'outfit'
  currentPaletteId = DEFAULT_PALETTE_ID
  currentShapeColor = getPalette(DEFAULT_PALETTE_ID).shape
  currentTextColor = getPalette(DEFAULT_PALETTE_ID).text
  currentAccentColor = getPalette(DEFAULT_PALETTE_ID).accent
  private listeners: Listeners | null = null
  private saveTimer: number | null = null
  private containerSeq = 0
  private isPanning = false
  private lastPan: { x: number; y: number } | null = null
  private rightDown: { x: number; y: number; target: FabricObject | null } | null = null
  private panUpHandler: ((e: MouseEvent) => void) | null = null
  private panMoveHandler: ((e: MouseEvent) => void) | null = null
  private static readonly PAN_THRESHOLD = 4

  mount(el: HTMLCanvasElement, listeners: Listeners) {
    this.listeners = listeners
    const canvas = new Canvas(el, {
      width: 800,
      height: 600,
      backgroundColor: '',
      preserveObjectStacking: true,
      selection: true,
      stopContextMenu: true,
      fireRightClick: true,
    })
    this.canvas = canvas
    this.pathEditor = new PathEditor(canvas)
    this.pathEditor.setOnChange(() => this.scheduleSave())
    this.alignGuides = new AlignGuideManager(canvas)

    canvas.on('selection:created', () => this.emitSelection())
    canvas.on('selection:updated', () => this.emitSelection())
    canvas.on('selection:cleared', () => this.emitSelection())
    canvas.on('object:modified', () => {
      this.scheduleSave()
      this.emitSelection()
    })
    canvas.on('object:scaling', () => this.emitSelection())
    canvas.on('object:added', (e) => {
      if (e.target && !PathEditor.isAnchorObject(e.target)) {
        ensureId(e.target)
        this.emitLayers()
        this.emitCount()
      }
    })
    canvas.on('object:removed', () => {
      this.emitLayers()
      this.emitCount()
    })

    this.bindZoom(canvas)
    this.bindRightButton(canvas)

    this.history.reset(serializeCanvas(canvas))
    this.emitAll()
    this.emitZoom()
    return canvas
  }

  private emitZoom() {
    const z = this.canvas?.getZoom() ?? 1
    this.listeners?.onZoomChange?.(Math.round(z * 100))
  }

  /** 滚轮缩放（以指针为中心） */
  private bindZoom(canvas: Canvas) {
    canvas.on('mouse:wheel', (opt) => {
      const e = opt.e as WheelEvent
      e.preventDefault()
      e.stopPropagation()

      let zoom = canvas.getZoom()
      // deltaY > 0 缩小
      zoom *= 0.999 ** e.deltaY
      zoom = Math.min(8, Math.max(0.1, zoom))

      const point = new Point(e.offsetX, e.offsetY)
      canvas.zoomToPoint(point, zoom)
      this.emitZoom()
    })
  }

  /** 相对当前比例缩放，默认绕视口中心 */
  zoomBy(factor: number) {
    const canvas = this.canvas
    if (!canvas) return
    const next = Math.min(8, Math.max(0.1, canvas.getZoom() * factor))
    const center = new Point(canvas.getWidth() / 2, canvas.getHeight() / 2)
    canvas.zoomToPoint(center, next)
    this.emitZoom()
  }

  zoomIn() {
    this.zoomBy(1.15)
  }

  zoomOut() {
    this.zoomBy(1 / 1.15)
  }

  /** 重置为 100%，视口回到原点 */
  resetZoom() {
    const canvas = this.canvas
    if (!canvas) return
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
    canvas.requestRenderAll()
    this.emitZoom()
  }

  /**
   * 右键：拖拽平移画布；点击对象弹出菜单。
   * 左键空白处留给 Fabric 原生框选，可多选后一起移动。
   */
  private bindRightButton(canvas: Canvas) {
    canvas.defaultCursor = 'default'

    canvas.on('mouse:down', (opt) => {
      const e = opt.e as MouseEvent
      if (e.button === 0) {
        this.listeners?.onContextMenu?.(null)
        return
      }
      if (e.button !== 2) return
      e.preventDefault()

      this.isPanning = false
      this.lastPan = { x: e.clientX, y: e.clientY }
      this.rightDown = { x: e.clientX, y: e.clientY, target: opt.target ?? null }

      this.panMoveHandler = (ev) => this.onRightDrag(ev)
      this.panUpHandler = () => this.onRightUp()
      window.addEventListener('mousemove', this.panMoveHandler)
      window.addEventListener('mouseup', this.panUpHandler)
    })
  }

  private onRightDrag(ev: MouseEvent) {
    const canvas = this.canvas
    const down = this.rightDown
    if (!canvas || !down || !this.lastPan) return

    if (!this.isPanning) {
      if (Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < LogoController.PAN_THRESHOLD) return
      this.isPanning = true
      this.listeners?.onContextMenu?.(null)
      this.alignGuides?.setEnabled(false)
      canvas.selection = false
      canvas.setCursor('grabbing')
      this.lastPan = { x: ev.clientX, y: ev.clientY }
      return
    }

    const dx = ev.clientX - this.lastPan.x
    const dy = ev.clientY - this.lastPan.y
    this.lastPan = { x: ev.clientX, y: ev.clientY }
    canvas.relativePan(new Point(dx, dy))
    canvas.setCursor('grabbing')
  }

  private onRightUp() {
    const down = this.rightDown
    const didPan = this.isPanning
    this.endRightButton()
    if (didPan || !down) return
    if (!down.target) {
      this.listeners?.onContextMenu?.(null)
      return
    }
    this.openContextMenu(down.target, down.x, down.y)
  }

  private openContextMenu(target: FabricObject, x: number, y: number) {
    const canvas = this.canvas
    if (!canvas) return

    const pathEditing = Boolean(this.pathEditor?.isEditing)
    let locked = false

    if (!PathEditor.isAnchorObject(target)) {
      const active = canvas.getActiveObjects()
      if (!active.some((o) => o === target)) {
        canvas.setActiveObject(target)
        canvas.requestRenderAll()
        this.emitSelection()
      }
      const obj = canvas.getActiveObject()
      locked = Boolean(obj && obj.lockMovementX && obj.lockMovementY)
    }

    this.listeners?.onContextMenu?.({ x, y, pathEditing, locked })
  }

  private endRightButton() {
    if (this.panMoveHandler) {
      window.removeEventListener('mousemove', this.panMoveHandler)
      this.panMoveHandler = null
    }
    if (this.panUpHandler) {
      window.removeEventListener('mouseup', this.panUpHandler)
      this.panUpHandler = null
    }
    const wasPanning = this.isPanning
    this.isPanning = false
    this.lastPan = null
    this.rightDown = null
    if (this.canvas && wasPanning) {
      this.canvas.selection = true
      this.canvas.setCursor(this.canvas.defaultCursor || 'default')
      this.alignGuides?.setEnabled(true)
      this.canvas.requestRenderAll()
    }
  }

  /** 自由画布：铺满中间区域，无固定方形限制 */
  resizeTo(width: number, height: number) {
    if (!this.canvas) return
    const w = Math.max(320, Math.floor(width))
    const h = Math.max(240, Math.floor(height))
    this.canvas.setDimensions({ width: w, height: h })
    this.canvas.calcOffset()
    this.canvas.requestRenderAll()
  }

  dispose() {
    this.endRightButton()
    this.alignGuides?.clear()
    this.alignGuides = null
    this.pathEditor?.clear()
    this.canvas?.dispose()
    this.canvas = null
    this.pathEditor = null
  }

  private contentObjects(): FabricObject[] {
    if (!this.canvas) return []
    return this.canvas.getObjects().filter((o) => !PathEditor.isAnchorObject(o))
  }

  private containerObjects(): Rect[] {
    return this.contentObjects().filter((o) => isContainer(o)) as Rect[]
  }

  private shapeObjects(): FabricObject[] {
    return this.contentObjects().filter((o) => !isTextLike(o) && !isContainer(o))
  }

  private textObjects(): FabricObject[] {
    return this.contentObjects().filter((o) => isTextLike(o))
  }

  /** 当前选中的容器（导出必需） */
  getSelectedContainer(): Rect | null {
    const obj = this.canvas?.getActiveObject()
    if (obj && isContainer(obj)) return obj as Rect
    const found = (this.canvas?.getActiveObjects() ?? []).find((o) => isContainer(o))
    return (found as Rect) || null
  }

  private emitAll() {
    this.emitSelection()
    this.emitLayers()
    this.emitCount()
    this.emitHistory()
  }

  private emitHistory() {
    this.listeners?.onHistoryChange(this.history.canUndo, this.history.canRedo)
  }

  private emitCount() {
    this.listeners?.onObjectCount(this.contentObjects().length)
  }

  private emitLayers() {
    const objs = this.contentObjects()
    const layers: LayerInfo[] = [...objs].reverse().map((o) => ({
      id: objId(o),
      name: displayName(o),
      type: isContainer(o) ? 'container' : o.type || 'object',
      visible: o.visible !== false,
      locked: Boolean(o.lockMovementX && o.lockMovementY),
      isContainer: isContainer(o),
    }))
    this.listeners?.onLayersChange(layers)
  }

  private emitSelection() {
    const canvas = this.canvas
    if (!canvas) {
      this.listeners?.onSelectionChange(null)
      return
    }
    if (this.pathEditor?.isEditing) {
      const path = this.pathEditor.activePath
      if (path) {
        this.listeners?.onSelectionChange({
          ...selectionFields(path),
          isText: false,
          isPath: true,
          isContainer: false,
          pathEditing: true,
        })
        return
      }
    }
    const obj = canvas.getActiveObject()
    if (!obj || PathEditor.isAnchorObject(obj) || obj.type === 'activeSelection') {
      this.listeners?.onSelectionChange(null)
      return
    }
    const container = isContainer(obj)
    const isText = isTextLike(obj)
    this.listeners?.onSelectionChange({
      ...selectionFields(obj),
      fontSize: isText && obj instanceof IText ? obj.fontSize : undefined,
      fontFamily: isText && obj instanceof IText ? obj.fontFamily : undefined,
      isText,
      isPath: obj instanceof Path && !isText && !container,
      isContainer: container,
      pathEditing: false,
      containerSize: container ? Math.round(obj.getScaledWidth()) : undefined,
    })
  }

  scheduleSave() {
    if (this.saveTimer) window.clearTimeout(this.saveTimer)
    this.saveTimer = window.setTimeout(() => this.saveHistory(), 280)
  }

  saveHistory() {
    if (!this.canvas) return
    const editing = this.pathEditor?.isEditing
    const path = this.pathEditor?.activePath
    if (editing) this.pathEditor?.clear()
    this.history.push(serializeCanvas(this.canvas))
    this.emitHistory()
    if (editing && path) {
      this.pathEditor?.start(path)
      this.emitSelection()
    }
  }

  async undo() {
    if (!this.canvas) return
    this.pathEditor?.clear()
    await this.history.undo(this.canvas)
    this.canvas.backgroundColor = ''
    this.canvas.requestRenderAll()
    this.emitAll()
  }

  async redo() {
    if (!this.canvas) return
    this.pathEditor?.clear()
    await this.history.redo(this.canvas)
    this.canvas.backgroundColor = ''
    this.canvas.requestRenderAll()
    this.emitAll()
  }

  clearAll() {
    if (!this.canvas) return
    this.pathEditor?.clear()
    this.canvas.clear()
    this.canvas.backgroundColor = ''
    this.containerSeq = 0
    this.canvas.requestRenderAll()
    this.saveHistory()
    this.emitAll()
  }

  /** 放置点：优先选中容器中心，否则视口中心 */
  private dropCenter(): { x: number; y: number; box?: { w: number; h: number } } {
    const canvas = this.canvas!
    const container = this.getSelectedContainer()
    if (container) {
      const b = container.getBoundingRect()
      return {
        x: b.left + b.width / 2,
        y: b.top + b.height / 2,
        box: { w: b.width, h: b.height },
      }
    }
    return { x: canvas.getWidth() / 2, y: canvas.getHeight() / 2 }
  }

  /** 添加可导出的 Logo 容器 */
  addContainer(size: number = DEFAULT_CONTAINER_SIZE) {
    if (!this.canvas) return
    this.pathEditor?.clear()
    this.containerSeq += 1
    const n = this.containerObjects().length
    const offset = (n % 5) * 36
    const rect = new Rect({
      left: 64 + offset,
      top: 64 + offset,
      width: size,
      height: size,
      fill: 'rgba(15, 110, 86, 0.06)',
      stroke: '#0f6e56',
      strokeWidth: 2,
      strokeDashArray: [8, 5],
      rx: 0,
      ry: 0,
      objectCaching: false,
      lockScalingFlip: true,
    })
    ;(rect as MetaObject).__role = ROLE_CONTAINER
    ;(rect as MetaObject).__label = `容器${this.containerSeq}`
    ensureId(rect)
    this.canvas.add(rect)
    this.canvas.sendObjectToBack(rect)
    this.canvas.setActiveObject(rect)
    this.canvas.requestRenderAll()
    this.saveHistory()
    this.emitAll()
  }

  addShape(kind: ShapeKind, fill?: string) {
    if (!this.canvas) return
    this.pathEditor?.clear()
    const drop = this.dropCenter()
    const shapeCount = this.shapeObjects().length
    const useAccent = shapeCount > 0 && !drop.box
    const color = fill || (useAccent ? this.currentAccentColor : this.currentShapeColor)
    const base = drop.box ? Math.min(drop.box.w, drop.box.h) * 0.82 : 220
    const scaleBoost = drop.box ? 1 : Math.max(0.55, 1 - Math.min(shapeCount, 4) * 0.1)
    const meta = getShapeMeta(kind)

    const path = new Path(shapePath(kind, base), {
      left: drop.x,
      top: drop.y,
      originX: 'center',
      originY: 'center',
      scaleX: scaleBoost,
      scaleY: meta.strokeOnly ? scaleBoost * 0.35 : scaleBoost,
      fill: meta.strokeOnly ? '' : color,
      stroke: meta.strokeOnly ? color : '',
      strokeWidth: meta.strokeOnly ? Math.max(10, base * 0.06) : 0,
      strokeLineCap: 'butt',
      fillRule: meta.evenOdd ? 'evenodd' : 'nonzero',
      objectCaching: false,
    })
    ;(path as MetaObject).__label = kind
    ensureId(path)
    this.canvas.add(path)
    this.canvas.setActiveObject(path)
    this.canvas.requestRenderAll()
    this.saveHistory()
    this.emitAll()
  }

  addText(text: string, font?: FontOption) {
    if (!this.canvas) return
    this.pathEditor?.clear()
    const f = font || getFontOption(this.currentFontId)
    const drop = this.dropCenter()
    const fontSize = drop.box ? Math.max(28, Math.min(drop.box.w, drop.box.h) * 0.22) : 72
    const itext = new IText(text || 'Logo', {
      left: drop.x,
      top: drop.y,
      originX: 'center',
      originY: 'center',
      fontFamily: f.cssFamily,
      fontSize,
      fill: this.currentTextColor,
      objectCaching: false,
    })
    ;(itext as MetaObject).__fontId = f.id
    ensureId(itext)
    this.canvas.add(itext)
    this.canvas.setActiveObject(itext)
    this.canvas.requestRenderAll()
    this.saveHistory()
    this.emitAll()
  }

  setCurrentFont(fontId: string) {
    this.currentFontId = fontId
    const opt = getFontOption(fontId)
    const obj = this.canvas?.getActiveObject()
    if (obj instanceof IText) {
      obj.set('fontFamily', opt.cssFamily)
      ;(obj as MetaObject).__fontId = fontId
      this.canvas?.requestRenderAll()
      this.scheduleSave()
      this.emitSelection()
      this.emitLayers()
    }
  }

  applyPalette(palette: Palette) {
    this.currentPaletteId = palette.id
    this.currentShapeColor = palette.shape
    this.currentTextColor = palette.text
    this.currentAccentColor = palette.accent

    const shapes = this.shapeObjects()
    if (palette.gradient) {
      const { mode, c1, c2, angle = 135 } = palette.gradient
      for (const o of shapes) {
        if (isStrokeOnlyShape(o)) {
          o.set({ fill: '', stroke: c1 })
        } else {
          o.set('fill', createGradientFill(mode, c1, c2, angle))
        }
      }
    } else {
      shapes.forEach((o, i) => {
        const color = i === 0 ? palette.shape : palette.accent
        if (isStrokeOnlyShape(o)) {
          o.set({ fill: '', stroke: color })
        } else {
          o.set('fill', color)
        }
      })
    }
    for (const o of this.textObjects()) {
      o.set('fill', palette.text)
    }
    if (this.canvas) {
      this.canvas.backgroundColor = ''
      this.canvas.requestRenderAll()
    }
    this.scheduleSave()
    this.emitSelection()
  }

  updateProps(partial: Partial<SelectionProps>) {
    const canvas = this.canvas
    const target = this.getEditTarget()
    if (!canvas || !target) return

    const patch: Partial<FabricObjectProps> = {}
    if (partial.fill !== undefined) {
      if (isContainer(target)) {
        patch.fill = containerFill(partial.fill)
      } else if (isStrokeOnlyShape(target)) {
        patch.stroke = partial.fill
        patch.fill = ''
        this.currentShapeColor = partial.fill
      } else {
        patch.fill = partial.fill
        if (isTextLike(target)) this.currentTextColor = partial.fill
        else this.currentShapeColor = partial.fill
      }
    }
    if (partial.stroke !== undefined) patch.stroke = partial.stroke
    if (partial.strokeWidth !== undefined) patch.strokeWidth = partial.strokeWidth
    if (partial.opacity !== undefined) patch.opacity = partial.opacity
    target.set(patch)

    if (partial.width !== undefined || partial.height !== undefined) {
      const baseW = Math.max(1, target.width ?? 1)
      const baseH = Math.max(1, target.height ?? 1)
      if (partial.width !== undefined) {
        target.set('scaleX', Math.max(1, partial.width) / baseW)
      }
      if (partial.height !== undefined) {
        target.set('scaleY', Math.max(1, partial.height) / baseH)
      }
      target.setCoords()
    }

    if (target instanceof IText) {
      if (partial.fontSize !== undefined) target.set('fontSize', partial.fontSize)
      if (partial.fontFamily !== undefined) target.set('fontFamily', partial.fontFamily)
    }

    canvas.requestRenderAll()
    this.scheduleSave()
    this.emitSelection()
    this.emitLayers()
  }

  private getEditTarget(): FabricObject | null {
    const canvas = this.canvas
    if (!canvas) return null
    if (this.pathEditor?.isEditing && this.pathEditor.activePath) return this.pathEditor.activePath
    const obj = canvas.getActiveObject()
    if (!obj || PathEditor.isAnchorObject(obj)) return null
    return obj
  }

  /** 纯色 / 线性渐变 / 径向渐变 */
  applyFillStyle(opts: {
    mode: FillMode
    color?: string
    color1?: string
    color2?: string
    angle?: number
  }) {
    const target = this.getEditTarget()
    if (!target || !this.canvas) return
    if (isContainer(target) && opts.mode !== 'solid') return

    if (opts.mode === 'solid') {
      const color = opts.color ?? opts.color1 ?? '#000000'
      if (isContainer(target)) {
        target.set('fill', containerFill(color))
      } else if (isStrokeOnlyShape(target)) {
        target.set({ fill: '', stroke: color })
        this.currentShapeColor = color
      } else {
        target.set('fill', color)
        if (isTextLike(target)) this.currentTextColor = color
        else this.currentShapeColor = color
      }
    } else if (isStrokeOnlyShape(target)) {
      // 直线不支持渐变填充，用起点色描边
      const color = opts.color1 ?? '#0284c7'
      target.set({ fill: '', stroke: color })
      this.currentShapeColor = color
    } else {
      const c1 = opts.color1 ?? '#0284c7'
      const c2 = opts.color2 ?? '#7dd3fc'
      target.set('fill', createGradientFill(opts.mode, c1, c2, opts.angle ?? 90))
      this.currentShapeColor = c1
    }

    this.canvas.requestRenderAll()
    this.scheduleSave()
    this.emitSelection()
  }

  /** 阴影 / 外发光（offset 为 0 时偏发光） */
  applyShadow(opts: {
    enabled: boolean
    color?: string
    blur?: number
    offsetX?: number
    offsetY?: number
  }) {
    const target = this.getEditTarget()
    if (!target || !this.canvas || isContainer(target)) return

    if (!opts.enabled) {
      target.set('shadow', null)
    } else {
      target.set(
        'shadow',
        new Shadow({
          color: opts.color ?? 'rgba(0,0,0,0.45)',
          blur: opts.blur ?? 12,
          offsetX: opts.offsetX ?? 4,
          offsetY: opts.offsetY ?? 4,
          affectStroke: false,
        }),
      )
    }

    this.canvas.requestRenderAll()
    this.scheduleSave()
    this.emitSelection()
  }

  async convertTextToPath() {
    const canvas = this.canvas
    if (!canvas) return
    const obj = canvas.getActiveObject()
    if (!(obj instanceof IText)) return

    const fontId = (obj as MetaObject).__fontId || this.currentFontId
    const fontSize = obj.fontSize || 72
    try {
      const { pathData } = await textToPathData(obj.text || ' ', fontId, fontSize)
      const path = new Path(pathData, {
        left: obj.left,
        top: obj.top,
        originX: obj.originX,
        originY: obj.originY,
        angle: obj.angle,
        scaleX: obj.scaleX,
        scaleY: obj.scaleY,
        fill: obj.fill,
        stroke: obj.stroke,
        strokeWidth: obj.strokeWidth,
        opacity: obj.opacity,
        objectCaching: false,
      })
      ;(path as MetaObject).__label = obj.text?.slice(0, 12) || '文字路径'
      ensureId(path)
      canvas.remove(obj)
      canvas.add(path)
      canvas.setActiveObject(path)
      canvas.requestRenderAll()
      this.saveHistory()
      this.startPathEdit()
    } catch (err) {
      console.error(err)
      window.alert('转为路径失败，请换一种字体再试')
    }
  }

  startPathEdit() {
    const canvas = this.canvas
    if (!canvas || !this.pathEditor) return
    const obj = canvas.getActiveObject()
    if (!(obj instanceof Path) || isContainer(obj)) return
    this.pathEditor.start(obj)
    this.emitSelection()
  }

  stopPathEdit() {
    const path = this.pathEditor?.activePath
    this.pathEditor?.clear()
    if (path && this.canvas) {
      path.set({ selectable: true, evented: true })
      this.canvas.setActiveObject(path)
      this.canvas.requestRenderAll()
    }
    this.saveHistory()
    this.emitSelection()
    this.emitLayers()
  }

  selectById(id: string) {
    const obj = this.contentObjects().find((o) => objId(o) === id)
    if (!obj || !this.canvas) return
    this.pathEditor?.clear()
    this.canvas.setActiveObject(obj)
    this.canvas.requestRenderAll()
    this.emitSelection()
    this.emitLayers()
  }

  getSelectedIds(): string[] {
    return (this.canvas?.getActiveObjects() ?? [])
      .filter((o) => !PathEditor.isAnchorObject(o))
      .map(objId)
  }

  bringForward() {
    this.reorder('forward')
  }

  sendBackward() {
    this.reorder('backward')
  }

  bringToFront() {
    this.reorder('front')
  }

  sendToBack() {
    this.reorder('back')
  }

  private reorder(action: 'forward' | 'backward' | 'front' | 'back') {
    const canvas = this.canvas
    const obj = canvas?.getActiveObject()
    if (!canvas || !obj || PathEditor.isAnchorObject(obj)) return
    if (action === 'forward') canvas.bringObjectForward(obj)
    else if (action === 'backward') canvas.sendObjectBackwards(obj)
    else if (action === 'front') canvas.bringObjectToFront(obj)
    else canvas.sendObjectToBack(obj)
    canvas.requestRenderAll()
    this.scheduleSave()
    this.emitLayers()
  }

  toggleLock() {
    const obj = this.canvas?.getActiveObject()
    if (!obj || PathEditor.isAnchorObject(obj)) return
    const locked = !(obj.lockMovementX && obj.lockMovementY)
    obj.set({
      lockMovementX: locked,
      lockMovementY: locked,
      lockScalingX: locked,
      lockScalingY: locked,
      lockRotation: locked,
      hasControls: !locked,
    })
    this.canvas?.requestRenderAll()
    this.scheduleSave()
    this.emitLayers()
  }

  deleteSelected() {
    const canvas = this.canvas
    if (!canvas) return
    if (this.pathEditor?.isEditing) {
      const path = this.pathEditor.activePath
      this.pathEditor.clear()
      if (path) canvas.remove(path)
      this.saveHistory()
      this.emitAll()
      return
    }
    const objs = canvas.getActiveObjects().filter((o) => !PathEditor.isAnchorObject(o))
    if (!objs.length) return
    canvas.discardActiveObject()
    for (const o of objs) canvas.remove(o)
    canvas.requestRenderAll()
    this.saveHistory()
    this.emitAll()
  }

  /** 容器内部可导出区域（不含虚线描边），场景坐标 */
  private containerClip(container: Rect): ContainerClip {
    container.setCoords()
    const strokeX = container.strokeUniform
      ? container.strokeWidth
      : container.strokeWidth * Math.abs(container.scaleX)
    const strokeY = container.strokeUniform
      ? container.strokeWidth
      : container.strokeWidth * Math.abs(container.scaleY)
    const box = container.getBoundingRect()
    const innerW = Math.max(1, box.width - strokeX)
    const innerH = Math.max(1, box.height - strokeY)
    const side = Math.min(innerW, innerH)
    return {
      left: box.left + strokeX / 2 + (innerW - side) / 2,
      top: box.top + strokeY / 2 + (innerH - side) / 2,
      side,
    }
  }

  /** 导出时隐藏容器框与锚点，刷新坐标，保证内容完整进画面 */
  private withExportContent<T>(container: Rect, fn: (clip: ContainerClip) => T): T {
    const canvas = this.canvas!
    const hidden: { obj: FabricObject; visible: boolean; exclude: boolean }[] = []
    const cacheRestore: { obj: FabricObject; caching: boolean }[] = []

    for (const obj of canvas.getObjects()) {
      if (isContainer(obj) || PathEditor.isAnchorObject(obj)) {
        hidden.push({
          obj,
          visible: obj.visible !== false,
          exclude: Boolean(obj.excludeFromExport),
        })
        obj.visible = false
        obj.excludeFromExport = true
        continue
      }
      obj.setCoords()
      obj.dirty = true
      if (obj.objectCaching) {
        cacheRestore.push({ obj, caching: true })
        obj.objectCaching = false
      }
    }
    container.setCoords()
    const clip = this.containerClip(container)
    canvas.requestRenderAll()
    try {
      return fn(clip)
    } finally {
      for (const { obj, visible, exclude } of hidden) {
        obj.visible = visible
        obj.excludeFromExport = exclude
      }
      for (const { obj, caching } of cacheRestore) obj.objectCaching = caching
    }
  }

  private async withCleanExport<T>(fn: () => Promise<T> | T): Promise<T> {
    const canvas = this.canvas
    if (!canvas) throw new Error('canvas missing')
    const editing = this.pathEditor?.isEditing
    const path = this.pathEditor?.activePath
    const active = canvas.getActiveObject()
    // Fabric toDataURL / toSVG 都会受 viewportTransform 影响；先回到 1:1
    const prevVpt = canvas.viewportTransform.slice() as [
      number,
      number,
      number,
      number,
      number,
      number,
    ]
    this.pathEditor?.clear()
    canvas.discardActiveObject()
    canvas.backgroundColor = ''
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0])
    this.alignGuides?.clear()
    canvas.requestRenderAll()
    try {
      return await fn()
    } finally {
      canvas.setViewportTransform(prevVpt)
      if (editing && path) this.pathEditor?.start(path)
      else if (active && canvas.getObjects().includes(active)) canvas.setActiveObject(active)
      canvas.requestRenderAll()
      this.emitSelection()
    }
  }

  private renderContainerPng(container: Rect, size: number): string {
    const canvas = this.canvas!
    const outSize = Math.max(1, Math.round(size))
    return this.withExportContent(container, ({ left, top, side }) =>
      canvas.toDataURL({
        format: 'png',
        left,
        top,
        width: side,
        height: side,
        multiplier: outSize / side,
        enableRetinaScaling: false,
      }),
    )
  }

  /**
   * 将 Fabric toSVG 结果归一到「容器 = 整张图」：
   * viewBox/width/height 均为容器边长，内容平移到原点。
   * （不把 clip-path 与 transform 写在同一元素上，避免裁切错位）
   */
  private normalizeContainerSvg(svg: string, left: number, top: number, side: number): string {
    const s = Number(side.toFixed(3))
    const l = Number(left.toFixed(3))
    const t = Number(top.toFixed(3))
    let out = svg
      .replace(/\swidth="[^"]*"/, ` width="${s}"`)
      .replace(/\sheight="[^"]*"/, ` height="${s}"`)
      .replace(/\sviewBox="[^"]*"/, ` viewBox="0 0 ${s} ${s}"`)
    if (out.includes('</defs>')) {
      out = out.replace(/<\/defs>\n?/, `</defs>\n<g transform="translate(${-l} ${-t})">\n`)
    } else {
      out = out.replace(/(<svg[^>]*>\n?)/, `$1<g transform="translate(${-l} ${-t})">\n`)
    }
    return out.replace(/<\/svg>\s*$/, '</g>\n</svg>\n')
  }

  private buildContainerSvg(container: Rect): string {
    return this.withExportContent(container, ({ left, top, side }) => {
      const canvas = this.canvas!
      const prevSvgVpt = canvas.svgViewportTransformation
      canvas.svgViewportTransformation = false
      try {
        // 先按容器区域裁切导出，再归一到 0,0，保证文件内无大画布留白
        const raw = canvas.toSVG({
          suppressPreamble: true,
          width: String(side),
          height: String(side),
          viewBox: { x: left, y: top, width: side, height: side },
        })
        return this.normalizeContainerSvg(raw, left, top, side)
      } finally {
        canvas.svgViewportTransformation = prevSvgVpt
      }
    })
  }

  private requireContainer(): Rect | null {
    const container = this.getSelectedContainer()
    if (!container) window.alert('请先选中一个 Logo 容器再导出')
    return container
  }

  async exportPng(sizes: ExportSize[]) {
    const target = this.requireContainer()
    if (!target) return
    await this.withCleanExport(async () => {
      for (const size of sizes) {
        const dataUrl = this.renderContainerPng(target, size)
        const blob = await (await fetch(dataUrl)).blob()
        downloadBlob(blob, `logo-${size}.png`)
      }
    })
  }

  async exportSvg() {
    const target = this.requireContainer()
    if (!target) return
    await this.withCleanExport(() => {
      downloadBlob(new Blob([this.buildContainerSvg(target)], { type: 'image/svg+xml' }), 'logo.svg')
    })
  }

  async exportIco(sizes: ExportSize[]) {
    const target = this.requireContainer()
    if (!target) return
    // ICO 目录对 >256 支持有限，大尺寸请用 PNG（180/192/512）
    const icoSizes = sizes.filter((s) => s <= 256)
    if (!icoSizes.length) {
      window.alert('ICO 请至少勾选一个 ≤256 的尺寸（推荐 16 / 32 / 48）')
      return
    }
    await this.withCleanExport(async () => {
      const pngs = icoSizes.map((size) => ({
        size,
        data: dataUrlToArrayBuffer(this.renderContainerPng(target, size)),
      }))
      downloadBlob(encodeIco(pngs), 'logo.ico')
    })
  }
}

export const controller = new LogoController()
