import {
  Canvas,
  FabricObject,
  Group,
  IText,
  Path,
  Point,
  Rect,
  Shadow,
  PencilBrush,
  CircleBrush,
  SprayBrush,
  BaseBrush,
  type FabricObjectProps,
} from 'fabric'
import { textToPathData, getFontOption, type FontOption, loadOpentypeFont, measureGlyphInk, fabricTextMetricsFromInk } from './fonts'
import {
  shapePath,
  type ShapeKind,
  SHAPE_META,
  getShapeMeta,
  shapeSupportsCornerRadius,
  defaultCornerRadius,
} from './shapes'
import { HistoryStack, serializeCanvas } from './history'
import { PathEditor } from './pathEditor'
import { GradientEditor } from './gradientEditor'
import {
  createGradientFill,
  optionsFromParsed,
  parseObjectGradient,
  rememberObjectGradient,
  resolveGradientForMode,
  type FillMode,
  type GradMemory,
} from './fills'
import { isOverlayObject } from './overlay'
import {
  downloadBlob,
  dataUrlToArrayBuffer,
  encodeIco,
  finalizeIconSvg,
  type ExportSize,
} from './export'
import { getPalette, type Palette, DEFAULT_PALETTE_ID } from './palettes'
import { AlignGuideManager } from './alignGuides'
import {
  clearAutoSave,
  packProject,
  parseProjectJson,
  projectFileName,
  readAutoSave,
  writeAutoSave,
  type LogoProject,
  type ProjectMetaInput,
} from './project'
import { prepareEditablePathData } from './pathPrepare'
import { densifyPathCommands, pathCommandsToData, type PathCmd } from './pathResample'

export type { FillMode } from './fills'

export type BrushType = 'hard' | 'soft' | 'marker' | 'airbrush' | 'charcoal' | 'watercolor' | 'splatter'

export type BrushSettings = {
  type: BrushType
  width: number
  color: string
  opacity: number
  /** 0-100: hardness/blur amount for applicable brushes */
  hardness: number
  lineCap: 'butt' | 'round' | 'square'
  lineJoin: 'miter' | 'round' | 'bevel'
}

export type DrawingState = {
  isDrawing: boolean
  isErasing: boolean
  settings: BrushSettings
}

/** 持久化自定义元数据，保证撤销后容器仍可识别 */
FabricObject.customProperties = [
  '__uid',
  '__label',
  '__role',
  '__fontId',
  '__cornerRadius',
  '__gradMemory',
  // 按实际字形收紧后的行高参数，撤销/恢复后仍贴合墨水盒
  '_fontSizeMult',
  '_fontSizeFraction',
]

/** 默认 Logo 容器边长 */
export const DEFAULT_CONTAINER_SIZE = 512
export const CONTAINER_PRESETS = [1024, 512, 256, 128] as const

const ROLE_CONTAINER = 'container'

export type LayerInfo = {
  id: string
  name: string
  type: string
  visible: boolean
  locked: boolean
  isContainer?: boolean
}

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
  /** 形状圆角（路径本地 px）；不支持时为 undefined */
  cornerRadius?: number
  supportsCornerRadius?: boolean
  /** 路径编辑：直线 / 曲线变形 */
  pathEditMode?: 'line' | 'curve'
  /** 当前线段弯曲弧度（曲线模式） */
  pathBend?: number
  pathBendMin?: number
  pathBendMax?: number
}

type Listeners = {
  onSelectionChange: (props: SelectionProps | null) => void
  onLayersChange: (layers: LayerInfo[]) => void
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void
  onObjectCount: (count: number) => void
  onZoomChange?: (zoomPercent: number) => void
  onContextMenu?: (menu: ContextMenuState | null) => void
  /** 导入/自动恢复工程后同步左侧 name / 字体 / 配色 */
  onProjectMeta?: (meta: ProjectMetaInput) => void
  onDrawingStateChange?: (state: DrawingState) => void
}

export type ContextMenuState = {
  x: number
  y: number
  pathEditing: boolean
  locked: boolean
  /** 右键目标是容器时不可自适应 */
  isContainer: boolean
}

type MetaObject = FabricObject & {
  __uid?: string
  __label?: string
  __role?: string
  __fontId?: string
  __cornerRadius?: number
  __gradMemory?: GradMemory
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
    if (custom.startsWith('组合')) return custom
    const meta = SHAPE_META.find((s) => s.id === custom)
    return meta?.label ?? custom
  }
  if (obj instanceof Group) return '组合'
  if (obj instanceof Path) return '路径'
  return obj.type || '对象'
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
  } else {
    const g = parseObjectGradient(obj)
    if (g) {
      fillMode = g.mode
      gradientColor1 = g.c1
      gradientColor2 = g.c2
      gradientAngle = g.angle || 90
      fillStr = g.c1
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
  gradientEditor: GradientEditor | null = null
  alignGuides: AlignGuideManager | null = null
  currentFontId = 'outfit'
  currentPaletteId = DEFAULT_PALETTE_ID
  currentShapeColor = getPalette(DEFAULT_PALETTE_ID).shape
  currentTextColor = getPalette(DEFAULT_PALETTE_ID).text
  currentAccentColor = getPalette(DEFAULT_PALETTE_ID).accent
  private listeners: Listeners | null = null
  private saveTimer: number | null = null
  private containerSeq = 0
  /** 递增世代号：避免 dispose/StrictMode 竞态把旧工程写回 */
  private lifecycleId = 0
  private projectMeta: ProjectMetaInput = {
    name: 'Logo',
    fontId: 'outfit',
    paletteId: DEFAULT_PALETTE_ID,
  }
  private isPanning = false
  private lastPan: { x: number; y: number } | null = null
  private rightDown: { x: number; y: number; target: FabricObject | null } | null = null
  private panUpHandler: ((e: MouseEvent) => void) | null = null
  private panMoveHandler: ((e: MouseEvent) => void) | null = null
  private static readonly PAN_THRESHOLD = 4
  private restoringProject = false
  private drawingState: DrawingState = {
    isDrawing: false,
    isErasing: false,
    settings: {
      type: 'hard',
      width: 4,
      color: '#000000',
      opacity: 1,
      hardness: 80,
      lineCap: 'round',
      lineJoin: 'round',
    },
  }
  private pathCounter = 0

  mount(el: HTMLCanvasElement, listeners: Listeners) {
    this.listeners = listeners
    const lifecycleId = ++this.lifecycleId
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
    this.pathEditor.setOnChange(() => {
      this.scheduleSave()
      this.emitSelection()
    })
    this.gradientEditor = new GradientEditor(canvas)
    this.gradientEditor.setOnChange(() => {
      const t = this.gradientEditor?.activeTarget
      if (t) rememberObjectGradient(t)
      this.scheduleSave()
      this.emitSelection()
    })
    this.alignGuides = new AlignGuideManager(canvas)

    const onSelect = () => {
      this.syncGradientEditor()
      this.emitSelection()
    }
    canvas.on('selection:created', onSelect)
    canvas.on('selection:updated', onSelect)
    canvas.on('selection:cleared', () => {
      this.gradientEditor?.clear()
      this.emitSelection()
    })

    const refreshGradIfContent = (target?: FabricObject) => {
      if (target && !isOverlayObject(target)) this.gradientEditor?.refresh()
    }
    canvas.on('object:modified', (e) => {
      refreshGradIfContent(e.target)
      if (e.target instanceof IText && !e.target.isEditing) {
        void this.tightenTextBounds(e.target)
      }
      this.scheduleSave()
      this.emitSelection()
    })
    canvas.on('object:scaling', (e) => {
      refreshGradIfContent(e.target)
      this.emitSelection()
    })
    canvas.on('object:rotating', (e) => refreshGradIfContent(e.target))
    canvas.on('object:moving', (e) => {
      if (e.target && e.target === this.gradientEditor?.activeTarget) {
        this.gradientEditor?.refresh()
      }
    })
    canvas.on('object:added', (e) => {
      if (e.target && !isOverlayObject(e.target)) {
        ensureId(e.target)
        this.emitLayers()
        this.emitCount()
      }
    })
    canvas.on('object:removed', (e) => {
      // 对象被删时立刻拆掉路径/渐变编辑，避免旧 path 引用残留
      if (e.target && this.pathEditor?.activePath === e.target) {
        this.pathEditor.clear()
      }
      if (e.target && this.gradientEditor?.activeTarget === e.target) {
        this.gradientEditor.clear()
      }
      this.emitLayers()
      this.emitCount()
    })

    this.bindZoom(canvas)
    this.bindRightButton(canvas)
    this.bindPreferActiveHit(canvas)

    canvas.on('text:changed', (opt) => {
      const t = opt.target
      // 编辑过程中不断收紧会跳动输入框，退出编辑或非编辑态变更时再收
      if (t instanceof IText && !t.isEditing) void this.tightenTextBounds(t)
    })

    this.history.reset(serializeCanvas(canvas))
    this.emitAll()
    this.emitZoom()
    void this.tryRestoreAutoSave(lifecycleId)
    return canvas
  }

  /** App 同步左侧面板的名称 / 字体 / 配色，供自动保存写入 meta */
  setProjectMeta(meta: Partial<ProjectMetaInput>) {
    this.projectMeta = {
      name: meta.name ?? this.projectMeta.name,
      fontId: meta.fontId ?? this.projectMeta.fontId,
      paletteId: meta.paletteId ?? this.projectMeta.paletteId,
    }
    if (meta.fontId) this.currentFontId = meta.fontId
    if (meta.paletteId) this.currentPaletteId = meta.paletteId
  }

  /**
   * 从图层面板选中被遮挡的对象后，仍应能拖拽该选中项。
   * Fabric 在 preserveObjectStacking=true 时命中最上对象，这里在指针落在
   * 当前选中对象上时优先它（叠加层手柄除外），渲染叠层顺序不变。
   */
  private bindPreferActiveHit(canvas: Canvas) {
    const original = canvas.findTarget.bind(canvas)
    canvas.findTarget = ((e) => {
      const active = canvas.getActiveObject()
      if (!active || active.type === 'activeSelection' || isOverlayObject(active)) {
        return original(e)
      }

      const stacked = original(e)
      if (!stacked.target || stacked.target === active || isOverlayObject(stacked.target)) {
        return stacked
      }

      const prev = canvas.preserveObjectStacking
      canvas.preserveObjectStacking = false
      try {
        const preferred = original(e)
        if (preferred.target === active) return preferred
      } finally {
        canvas.preserveObjectStacking = prev
      }
      return stacked
    }) as Canvas['findTarget']
  }

  private emitZoom() {
    const z = this.canvas?.getZoom() ?? 1
    this.pathEditor?.syncZoomMetrics()
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
    let containerTarget = isContainer(target)

    if (!isOverlayObject(target)) {
      const active = canvas.getActiveObjects()
      if (!active.some((o) => o === target)) {
        canvas.setActiveObject(target)
        canvas.requestRenderAll()
        this.emitSelection()
      }
      const obj = canvas.getActiveObject()
      locked = Boolean(obj && obj.lockMovementX && obj.lockMovementY)
      if (obj?.type === 'activeSelection') {
        const objs = canvas.getActiveObjects()
        containerTarget = objs.length > 0 && objs.every((o) => isContainer(o))
      } else {
        containerTarget = isContainer(obj)
      }
    }

    this.listeners?.onContextMenu?.({ x, y, pathEditing, locked, isContainer: containerTarget })
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
    this.lifecycleId++
    this.cancelScheduledSave()
    this.endRightButton()
    this.alignGuides?.clear()
    this.alignGuides = null
    this.gradientEditor?.clear()
    this.gradientEditor = null
    this.pathEditor?.clear()
    this.canvas?.dispose()
    this.canvas = null
    this.pathEditor = null
  }

  private syncGradientEditor() {
    if (!this.canvas || !this.gradientEditor) return
    if (this.pathEditor?.isEditing) {
      this.gradientEditor.clear()
      return
    }
    const obj = this.canvas.getActiveObject()
    if (obj && this.gradientEditor.owns(obj)) {
      // 拖着手柄时保持当前目标
      return
    }
    if (obj && isOverlayObject(obj)) {
      return
    }
    if (!obj || obj.type === 'activeSelection' || isContainer(obj) || isStrokeOnlyShape(obj)) {
      this.gradientEditor.clear()
      return
    }
    this.gradientEditor.sync(obj)
  }

  private contentObjects(): FabricObject[] {
    if (!this.canvas) return []
    return this.canvas.getObjects().filter((o) => !isOverlayObject(o))
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

  private buildSelectionProps(
    obj: FabricObject,
    extras: Partial<SelectionProps> & Pick<SelectionProps, 'isText' | 'isPath' | 'isContainer' | 'pathEditing'>,
  ): SelectionProps {
    const label = (obj as MetaObject).__label
    const supportsCorner =
      !extras.isContainer && !extras.isText && shapeSupportsCornerRadius(label)
    const localSize = Math.max(obj.width ?? 1, obj.height ?? 1)
    const scale = Math.min(Math.abs(obj.scaleX || 1), Math.abs(obj.scaleY || 1)) || 1
    const localR =
      (obj as MetaObject).__cornerRadius ??
      defaultCornerRadius((label || 'rect') as ShapeKind, localSize)
    return {
      ...selectionFields(obj),
      ...extras,
      fontSize: extras.isText && obj instanceof IText ? obj.fontSize : extras.fontSize,
      fontFamily: extras.isText && obj instanceof IText ? obj.fontFamily : extras.fontFamily,
      containerSize: extras.isContainer ? Math.round(obj.getScaledWidth()) : extras.containerSize,
      supportsCornerRadius: supportsCorner,
      cornerRadius: supportsCorner ? Math.round(localR * scale) : undefined,
    }
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
        const bend = this.pathEditor.bendSliderRange()
        this.listeners?.onSelectionChange(
          this.buildSelectionProps(path, {
            isText: false,
            isPath: true,
            isContainer: false,
            pathEditing: true,
            pathEditMode: this.pathEditor.editMode,
            pathBend: bend.value,
            pathBendMin: bend.min,
            pathBendMax: bend.max,
          }),
        )
        return
      }
    }
    const obj = canvas.getActiveObject()
    if (!obj || isOverlayObject(obj) || obj.type === 'activeSelection') {
      const gradTarget = this.gradientEditor?.activeTarget
      if (gradTarget && obj && this.gradientEditor?.owns(obj)) {
        this.listeners?.onSelectionChange(
          this.buildSelectionProps(gradTarget, {
            isText: false,
            isPath: gradTarget instanceof Path && !isTextLike(gradTarget),
            isContainer: false,
            pathEditing: false,
            fontSize: undefined,
            fontFamily: undefined,
          }),
        )
        return
      }
      this.listeners?.onSelectionChange(null)
      return
    }
    const container = isContainer(obj)
    const isText = isTextLike(obj)
    this.listeners?.onSelectionChange(
      this.buildSelectionProps(obj, {
        isText,
        isPath: obj instanceof Path && !isText && !container,
        isContainer: container,
        pathEditing: false,
      }),
    )
  }

  scheduleSave() {
    if (this.saveTimer) window.clearTimeout(this.saveTimer)
    this.saveTimer = window.setTimeout(() => this.saveHistory(), 280)
  }

  private cancelScheduledSave() {
    if (this.saveTimer) {
      window.clearTimeout(this.saveTimer)
      this.saveTimer = null
    }
  }

  /** 拆掉路径/渐变编辑态与锚点，避免删对象后旧引用复活 */
  private tearDownEditors() {
    this.pathEditor?.clear()
    this.gradientEditor?.clear()
    this.alignGuides?.clear()
    this.stripOverlayObjects()
    this.listeners?.onContextMenu?.(null)
  }

  saveHistory() {
    if (!this.canvas || this.restoringProject) return
    const editing = this.pathEditor?.isEditing
    const path = this.pathEditor?.activePath
    if (editing) this.pathEditor?.clear()
    const gradActive = this.gradientEditor?.activeTarget
    this.gradientEditor?.clear()
    this.alignGuides?.clear()
    this.stripOverlayObjects()

    const json = serializeCanvas(this.canvas)
    this.history.push(json)
    this.persistAutoSave(json)
    this.emitHistory()

    // 仅当 path 仍在画布上时才恢复编辑（防止删后防抖保存把旧 path 又 start 回来）
    if (editing && path && this.canvas.getObjects().includes(path)) {
      this.pathEditor?.start(path)
      this.emitSelection()
    } else if (gradActive && this.canvas.getObjects().includes(gradActive)) {
      this.canvas.setActiveObject(gradActive)
      this.syncGradientEditor()
      this.emitSelection()
    }
  }

  async undo() {
    if (!this.canvas) return
    this.pathEditor?.clear()
    await this.history.undo(this.canvas)
    this.canvas.backgroundColor = ''
    await this.tightenAllTexts()
    this.canvas.requestRenderAll()
    this.emitAll()
    this.persistAutoSave(serializeCanvas(this.canvas))
  }

  async redo() {
    if (!this.canvas) return
    this.pathEditor?.clear()
    await this.history.redo(this.canvas)
    this.canvas.backgroundColor = ''
    await this.tightenAllTexts()
    this.canvas.requestRenderAll()
    this.emitAll()
    this.persistAutoSave(serializeCanvas(this.canvas))
  }

  /** 兼容旧快照：对尚未收紧的 IText 补一次墨水盒测量 */
  private async tightenAllTexts() {
    const texts = this.textObjects().filter((o): o is IText => o instanceof IText)
    await Promise.all(texts.map((t) => this.tightenTextBounds(t)))
  }

  clearAll() {
    if (!this.canvas) return
    this.cancelScheduledSave()
    this.tearDownEditors()
    this.canvas.clear()
    this.canvas.backgroundColor = ''
    this.containerSeq = 0
    this.canvas.requestRenderAll()
    this.saveHistory()
    this.emitAll()
  }

  private stripOverlayObjects() {
    const canvas = this.canvas
    if (!canvas) return
    for (const obj of [...canvas.getObjects()]) {
      if (isOverlayObject(obj)) canvas.remove(obj)
    }
  }

  private buildProject(meta: ProjectMetaInput, canvasJson: Record<string, unknown>): LogoProject {
    const canvas = this.canvas!
    const vpt = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]
    return packProject({
      meta: {
        name: meta.name,
        fontId: meta.fontId,
        paletteId: meta.paletteId,
        containerSeq: this.containerSeq,
      },
      viewport: {
        zoom: canvas.getZoom(),
        vpt: Array.from(vpt),
      },
      canvas: canvasJson,
    })
  }

  private persistAutoSave(canvasJsonStr: string) {
    if (!this.canvas) return
    try {
      const canvasJson = JSON.parse(canvasJsonStr) as Record<string, unknown>
      const project = this.buildProject(
        {
          name: this.projectMeta.name,
          fontId: this.currentFontId,
          paletteId: this.currentPaletteId,
        },
        canvasJson,
      )
      writeAutoSave(project)
    } catch (err) {
      console.warn('autosave failed', err)
    }
  }

  /** 导出可再编辑的工程文件（.logo.json） */
  exportProject(meta?: ProjectMetaInput) {
    const canvas = this.canvas
    if (!canvas) return
    const m = meta ?? this.projectMeta
    this.setProjectMeta(m)

    const editing = this.pathEditor?.isEditing
    const path = this.pathEditor?.activePath
    const active = canvas.getActiveObject()
    this.pathEditor?.clear()
    this.gradientEditor?.clear()
    this.alignGuides?.clear()
    this.listeners?.onContextMenu?.(null)
    canvas.discardActiveObject()
    this.stripOverlayObjects()

    try {
      const json = serializeCanvas(canvas)
      const project = this.buildProject(m, JSON.parse(json) as Record<string, unknown>)
      downloadBlob(
        new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }),
        projectFileName(m.name),
      )
      writeAutoSave(project)
    } finally {
      if (editing && path && canvas.getObjects().includes(path)) {
        this.pathEditor?.start(path)
      } else if (active && canvas.getObjects().includes(active)) {
        canvas.setActiveObject(active)
      }
      canvas.requestRenderAll()
      this.emitSelection()
    }
  }

  /** 从用户选择的工程文件完整还原画布 */
  async importProjectFile(file: File): Promise<boolean> {
    try {
      const text = await file.text()
      const project = parseProjectJson(text)
      await this.loadProject(project)
      return true
    } catch (err) {
      console.error(err)
      window.alert(err instanceof Error ? err.message : '导入工程失败')
      return false
    }
  }

  async tryRestoreAutoSave(lifecycleId = this.lifecycleId): Promise<boolean> {
    if (!this.canvas || this.contentObjects().length > 0) return false
    const project = readAutoSave()
    if (!project) return false
    try {
      await this.loadProject(project, lifecycleId)
      return this.lifecycleId === lifecycleId
    } catch (err) {
      console.warn('restore autosave failed', err)
      if (this.lifecycleId === lifecycleId) clearAutoSave()
      return false
    }
  }

  async loadProject(project: LogoProject, lifecycleId = this.lifecycleId) {
    const canvas = this.canvas
    if (!canvas) return
    if (lifecycleId !== this.lifecycleId) return

    this.restoringProject = true
    this.cancelScheduledSave()
    try {
      this.tearDownEditors()
      canvas.discardActiveObject()

      await canvas.loadFromJSON(JSON.stringify(project.canvas))

      // StrictMode / dispose 后丢弃过期恢复，避免把旧 logo 写回缓存与画布
      if (lifecycleId !== this.lifecycleId || this.canvas !== canvas) return

      this.stripOverlayObjects()
      for (const obj of canvas.getObjects()) ensureId(obj)

      canvas.backgroundColor = ''
      this.containerSeq = Math.max(0, Math.floor(project.meta.containerSeq))
      this.currentFontId = project.meta.fontId
      this.currentPaletteId = project.meta.paletteId
      const palette = getPalette(project.meta.paletteId)
      this.currentShapeColor = palette.shape
      this.currentTextColor = palette.text
      this.currentAccentColor = palette.accent
      this.projectMeta = {
        name: project.meta.name,
        fontId: project.meta.fontId,
        paletteId: project.meta.paletteId,
      }

      const vpt = project.viewport.vpt
      if (vpt.length >= 6) {
        canvas.setViewportTransform([
          Number(vpt[0]) || 1,
          Number(vpt[1]) || 0,
          Number(vpt[2]) || 0,
          Number(vpt[3]) || 1,
          Number(vpt[4]) || 0,
          Number(vpt[5]) || 0,
        ])
      }

      await this.tightenAllTexts()
      if (lifecycleId !== this.lifecycleId || this.canvas !== canvas) return

      canvas.requestRenderAll()
      this.history.reset(serializeCanvas(canvas))
      this.emitAll()
      this.emitZoom()
      this.listeners?.onProjectMeta?.({
        name: project.meta.name,
        fontId: project.meta.fontId,
        paletteId: project.meta.paletteId,
      })
      writeAutoSave(project)
    } finally {
      if (lifecycleId === this.lifecycleId) this.restoringProject = false
    }
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
    this.exitDrawingMode()
    this.pathEditor?.clear()
    this.containerSeq += 1
    const n = this.containerObjects().length
    const offset = (n % 5) * 36
    const rect = new Rect({
      left: 64 + offset,
      top: 64 + offset,
      width: size,
      height: size,
      // Fabric 7 默认 origin 为 center；容器按左上角定位
      originX: 'left',
      originY: 'top',
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
    this.exitDrawingMode()
    this.pathEditor?.clear()
    const drop = this.dropCenter()
    const shapeCount = this.shapeObjects().length
    const useAccent = shapeCount > 0 && !drop.box
    const color = fill || (useAccent ? this.currentAccentColor : this.currentShapeColor)
    const base = drop.box ? Math.min(drop.box.w, drop.box.h) * 0.82 : 220
    const scaleBoost = drop.box ? 1 : Math.max(0.55, 1 - Math.min(shapeCount, 4) * 0.1)
    const meta = getShapeMeta(kind)

    const path = new Path(shapePath(kind, base, defaultCornerRadius(kind, base)), {
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
    if (meta.cornerRadius) {
      ;(path as MetaObject).__cornerRadius = defaultCornerRadius(kind, base)
    }
    ensureId(path)
    this.canvas.add(path)
    this.canvas.setActiveObject(path)
    this.canvas.requestRenderAll()
    this.saveHistory()
    this.emitAll()
  }

  addText(text: string, font?: FontOption) {
    if (!this.canvas) return
    this.exitDrawingMode()
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
      // 先用接近墨水盒的占位，异步测量后再精确收紧
      lineHeight: 1,
    })
    ;(itext as MetaObject).__fontId = f.id
    ensureId(itext)
    this.canvas.add(itext)
    this.canvas.setActiveObject(itext)
    this.canvas.requestRenderAll()
    void this.tightenTextBounds(itext).then(() => {
      this.saveHistory()
      this.emitAll()
    })
  }

  /**
   * 用 opentype 实测字形墨水盒，改写 Fabric 默认行高，去掉底部（及顶部）多余留白。
   * 无下行字母时不再按整字身预留空白；有 g/y 时则按真实下行扩展，避免裁切。
   */
  async tightenTextBounds(obj: IText) {
    const canvas = this.canvas
    if (!canvas || !obj || isOverlayObject(obj)) return
    const fontId = (obj as MetaObject).__fontId || this.currentFontId
    const fontSize = obj.fontSize || 72
    const content = obj.text || ' '
    try {
      const font = await loadOpentypeFont(getFontOption(fontId))
      const ink = measureGlyphInk(font, content, fontSize)
      const metrics = fabricTextMetricsFromInk(ink.y1, ink.y2, fontSize)
      const center = obj.getCenterPoint()
      obj.set({
        ...metrics,
        lineHeight: 1,
      })
      obj.initDimensions()
      obj.setPositionByOrigin(center, 'center', 'center')
      obj.setCoords()
      obj.dirty = true
      canvas.requestRenderAll()
      this.emitSelection()
    } catch (err) {
      console.warn('tightenTextBounds failed', err)
    }
  }

  setCurrentFont(fontId: string) {
    this.currentFontId = fontId
    this.projectMeta = { ...this.projectMeta, fontId }
    const opt = getFontOption(fontId)
    const obj = this.canvas?.getActiveObject()
    if (obj instanceof IText) {
      obj.set('fontFamily', opt.cssFamily)
      ;(obj as MetaObject).__fontId = fontId
      void this.tightenTextBounds(obj).then(() => {
        this.scheduleSave()
        this.emitSelection()
        this.emitLayers()
      })
    }
  }

  applyPalette(palette: Palette) {
    this.currentPaletteId = palette.id
    this.projectMeta = { ...this.projectMeta, paletteId: palette.id }
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
          // 套用配色时保留该对象已调过的几何（若有），只换色与模式
          const resolved = resolveGradientForMode(o, mode, { c1, c2 }, angle)
          o.set('fill', createGradientFill(mode, c1, c2, resolved))
          rememberObjectGradient(o)
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
      // 字号变化后按已有 mult 重算即可；仍跑一遍收紧，兼容尚未收紧的旧对象
      if (partial.fontSize !== undefined || partial.fontFamily !== undefined) {
        void this.tightenTextBounds(target)
      }
    }

    if (partial.cornerRadius !== undefined && target instanceof Path) {
      this.applyCornerRadius(target, partial.cornerRadius)
    }

    canvas.requestRenderAll()
    this.scheduleSave()
    this.emitSelection()
    this.emitLayers()
  }

  /** 按圆角重建矩形类形状路径，保持中心与缩放。radiusPx 为画布显示像素。 */
  private applyCornerRadius(target: Path, radiusPx: number) {
    const kind = (target as MetaObject).__label as ShapeKind | undefined
    if (!shapeSupportsCornerRadius(kind) || !kind) return
    const size = Math.max(target.width ?? 1, target.height ?? 1)
    const scale = Math.min(Math.abs(target.scaleX || 1), Math.abs(target.scaleY || 1)) || 1
    const localR = Math.max(0, Math.min(radiusPx / scale, size / 2))
    const center = target.getCenterPoint()
    target._setPath(shapePath(kind, size, localR), false)
    target.setPositionByOrigin(center, 'center', 'center')
    ;(target as MetaObject).__cornerRadius = localR
    target.setCoords()
    target.dirty = true
  }

  private getEditTarget(): FabricObject | null {
    const canvas = this.canvas
    if (!canvas) return null
    if (this.pathEditor?.isEditing && this.pathEditor.activePath) return this.pathEditor.activePath
    const obj = canvas.getActiveObject()
    if (obj && this.gradientEditor?.owns(obj) && this.gradientEditor.activeTarget) {
      return this.gradientEditor.activeTarget
    }
    if (!obj || isOverlayObject(obj)) return null
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
      rememberObjectGradient(target)
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
      this.gradientEditor?.clear()
    } else if (isStrokeOnlyShape(target)) {
      // 直线不支持渐变填充，用起点色描边
      const color = opts.color1 ?? '#0284c7'
      target.set({ fill: '', stroke: color })
      this.currentShapeColor = color
    } else {
      const c1 = opts.color1 ?? '#0284c7'
      const c2 = opts.color2 ?? '#7dd3fc'
      const current = parseObjectGradient(target)
      if (current?.mode === opts.mode) {
        target.set('fill', createGradientFill(opts.mode, c1, c2, optionsFromParsed(current)))
      } else {
        const options = resolveGradientForMode(target, opts.mode, { c1, c2 }, opts.angle ?? 90)
        target.set('fill', createGradientFill(opts.mode, c1, c2, options))
      }
      rememberObjectGradient(target)
      this.currentShapeColor = c1
    }

    this.canvas.requestRenderAll()
    this.scheduleSave()
    this.emitSelection()
    this.syncGradientEditor()
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
    // 取消未完成的防抖保存，并清掉编辑器，避免旧 path 引用串台
    this.cancelScheduledSave()
    this.tearDownEditors()

    try {
      const { pathData } = await textToPathData(obj.text || ' ', fontId, fontSize)
      if (!this.canvas || this.canvas !== canvas) return
      // 对象可能在 await 期间被删掉
      if (!canvas.getObjects().includes(obj)) return

      const editable = prepareEditablePathData(pathData)
      const path = new Path(editable, {
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
        // 文字复合轮廓（o/g 字腔）用 evenodd，避免绕向误差把右侧接缝拉空
        fillRule: 'evenodd',
        objectCaching: false,
      })
      // 深拷贝命令，切断与解析缓存/临时数组的任何共享引用
      const cmds = (path.path as unknown as PathCmd[]).map((c) => c.slice() as PathCmd)
      path._setPath(cmds as never, false)
      path.setDimensions()
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
    this.exitDrawingMode()
    const obj = canvas.getActiveObject()
    if (!(obj instanceof Path) || isContainer(obj)) return
    this.gradientEditor?.clear()
    // 形状/旧路径进入编辑时同样补点：长边可拖、圆弧更均匀（已够密则几乎不变）
    this.densifyActivePath(obj)
    this.pathEditor.start(obj)
    this.emitSelection()
  }

  /** 保持中心与外形，仅加密锚点（Fabric path 已是 M/L/C/Z） */
  private densifyActivePath(path: Path) {
    try {
      const cmds = path.path as unknown as PathCmd[] | undefined
      if (!cmds?.length) return
      const dense = densifyPathCommands(cmds.map((c) => c.slice() as PathCmd))
      const next = pathCommandsToData(dense)
      const prev = pathCommandsToData(cmds)
      if (next === prev) return
      const center = path.getCenterPoint()
      path._setPath(next, false)
      path.setDimensions()
      path.setPositionByOrigin(center, 'center', 'center')
      path.setCoords()
      path.dirty = true
    } catch (err) {
      console.warn('densify path failed', err)
    }
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
    this.syncGradientEditor()
  }

  setPathEditMode(mode: 'line' | 'curve') {
    this.pathEditor?.setMode(mode)
    this.emitSelection()
    this.scheduleSave()
  }

  setPathBend(amount: number) {
    this.pathEditor?.setBendAmount(amount)
    this.emitSelection()
    this.scheduleSave()
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
      .filter((o) => !isOverlayObject(o))
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
    if (!canvas || !obj || isOverlayObject(obj)) return
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
    if (!obj || isOverlayObject(obj)) return
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

  /**
   * 将选中文字/图形（或框选组）等比缩放到所属 Logo 容器内部，
   * 以较大边对齐容器内边，并居中放置。
   */
  fitToContainer() {
    const canvas = this.canvas
    if (!canvas || this.pathEditor?.isEditing) return

    const obj = canvas.getActiveObject()
    if (!obj || isOverlayObject(obj) || isContainer(obj)) {
      window.alert('请选中文字或形状后再自适应容器')
      return
    }
    if (obj.lockMovementX && obj.lockMovementY) {
      window.alert('对象已锁定，请先解锁')
      return
    }

    if (obj.type === 'activeSelection') {
      const parts = canvas.getActiveObjects().filter((o) => !isOverlayObject(o))
      if (!parts.length || parts.every((o) => isContainer(o))) {
        window.alert('请选中文字或形状后再自适应容器')
        return
      }
    }

    const container = this.resolveFitContainer(obj)
    if (!container) {
      window.alert('画布上没有可用的 Logo 容器，请先添加容器')
      return
    }

    const clip = this.containerClip(container)
    const cw = clip.side
    const ch = clip.side
    const cx = clip.left + clip.side / 2
    const cy = clip.top + clip.side / 2

    obj.setCoords()
    const ow = Math.max(1e-3, obj.getScaledWidth())
    const oh = Math.max(1e-3, obj.getScaledHeight())
    // 保持宽高比：较大边贴合容器内边（contain）
    const factor = Math.min(cw / ow, ch / oh)
    if (!Number.isFinite(factor) || factor <= 0) return

    obj.scaleX = (obj.scaleX || 1) * factor
    obj.scaleY = (obj.scaleY || 1) * factor
    obj.setPositionByOrigin(new Point(cx, cy), 'center', 'center')
    obj.setCoords()
    obj.dirty = true

    canvas.requestRenderAll()
    this.saveHistory()
    this.emitSelection()
    this.emitLayers()
  }

  /** 优先：对象中心所在容器 → 唯一容器 → 最近容器 */
  private resolveFitContainer(obj: FabricObject): Rect | null {
    const containers = this.containerObjects()
    if (!containers.length) return null

    obj.setCoords()
    const center = obj.getCenterPoint()

    const containing = containers.find((c) => {
      c.setCoords()
      const b = c.getBoundingRect()
      return (
        center.x >= b.left &&
        center.x <= b.left + b.width &&
        center.y >= b.top &&
        center.y <= b.top + b.height
      )
    })
    if (containing) return containing
    if (containers.length === 1) return containers[0]

    let best: Rect | null = null
    let bestDist = Infinity
    for (const c of containers) {
      const cc = c.getCenterPoint()
      const d = Math.hypot(cc.x - center.x, cc.y - center.y)
      if (d < bestDist) {
        bestDist = d
        best = c
      }
    }
    return best
  }

  deleteSelected() {
    const canvas = this.canvas
    if (!canvas) return

    this.cancelScheduledSave()

    if (this.pathEditor?.isEditing) {
      const path = this.pathEditor.activePath
      this.tearDownEditors()
      if (path && canvas.getObjects().includes(path)) canvas.remove(path)
      canvas.discardActiveObject()
      canvas.requestRenderAll()
      this.saveHistory()
      this.emitAll()
      return
    }

    const objs = canvas.getActiveObjects().filter((o) => !isOverlayObject(o))
    if (!objs.length) return

    // 删前提前拆编辑器，防止 object:removed / 防抖保存重启旧 path
    this.tearDownEditors()
    canvas.discardActiveObject()
    for (const o of objs) {
      if (canvas.getObjects().includes(o)) canvas.remove(o)
    }
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

    container.setCoords()
    const clip = this.containerClip(container)

    for (const obj of canvas.getObjects()) {
      if (isContainer(obj) || isOverlayObject(obj)) {
        hidden.push({
          obj,
          visible: obj.visible !== false,
          exclude: Boolean(obj.excludeFromExport),
        })
        obj.visible = false
        obj.excludeFromExport = true
        continue
      }
      // 容器外对象不进导出文件，避免缩略图按「全画布内容」算包围盒导致偏移
      if (!this.intersectsExportClip(obj, clip)) {
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

  private intersectsExportClip(obj: FabricObject, clip: ContainerClip): boolean {
    obj.setCoords()
    const b = obj.getBoundingRect()
    return !(
      b.left + b.width < clip.left ||
      b.top + b.height < clip.top ||
      b.left > clip.left + clip.side ||
      b.top > clip.top + clip.side
    )
  }

  /**
   * 导出前把 IText 临时换成 opentype 轮廓 Path。
   * 行业常规做法：图标 SVG 不依赖系统字体，避免 Finder 预览错位/裁切。
   */
  private async withOutlinedTexts<T>(fn: () => T | Promise<T>): Promise<T> {
    const canvas = this.canvas!
    const swaps: { text: IText; path: Path; index: number }[] = []

    const texts = canvas
      .getObjects()
      .filter((o): o is IText => o instanceof IText && !isOverlayObject(o) && o.visible !== false)

    // 先收紧选框到墨水盒，再转轮廓，保证与画布视觉中心一致
    await Promise.all(texts.map((t) => this.tightenTextBounds(t)))

    for (const text of texts) {
      const fontId = (text as MetaObject).__fontId || this.currentFontId
      const index = canvas.getObjects().indexOf(text)
      if (index < 0) continue
      try {
        const { pathData } = await textToPathData(text.text || ' ', fontId, text.fontSize || 72)
        const path = new Path(pathData, {
          left: text.left,
          top: text.top,
          originX: text.originX,
          originY: text.originY,
          angle: text.angle,
          scaleX: text.scaleX,
          scaleY: text.scaleY,
          flipX: text.flipX,
          flipY: text.flipY,
          fill: text.fill,
          stroke: text.stroke,
          strokeWidth: text.strokeWidth,
          strokeDashArray: text.strokeDashArray ?? undefined,
          strokeLineCap: text.strokeLineCap,
          strokeLineJoin: text.strokeLineJoin,
          opacity: text.opacity,
          shadow: text.shadow ?? undefined,
          objectCaching: false,
          selectable: false,
          evented: false,
        })
        canvas.remove(text)
        canvas.insertAt(index, path)
        swaps.push({ text, path, index })
      } catch (err) {
        console.warn('outline text for export failed', err)
      }
    }

    canvas.requestRenderAll()
    try {
      return await fn()
    } finally {
      for (const { text, path, index } of [...swaps].reverse()) {
        canvas.remove(path)
        const at = Math.min(index, canvas.getObjects().length)
        canvas.insertAt(at, text)
      }
      canvas.requestRenderAll()
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
      return await this.withOutlinedTexts(() => fn())
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

  private buildContainerSvg(container: Rect): string {
    return this.withExportContent(container, ({ left, top, side }) => {
      const canvas = this.canvas!
      const prevSvgVpt = canvas.svgViewportTransformation
      canvas.svgViewportTransformation = false
      try {
        const raw = canvas.toSVG({
          suppressPreamble: true,
          width: String(side),
          height: String(side),
          viewBox: { x: left, y: top, width: side, height: side },
        })
        return finalizeIconSvg(raw, left, top, side)
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
    // ICO 目录对 >256 支持有限，大尺寸请用 PNG（180/192/512/1024）
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

  /** 创建适合当前笔刷类型的 Fabric brush 实例 */
  private createBrush(settings: BrushSettings): BaseBrush {
    const canvas = this.canvas!
    let brush: BaseBrush

    switch (settings.type) {
      case 'soft': {
        // 软笔刷：使用 CircleBrush 实现柔和边缘
        const circleBrush = new CircleBrush(canvas)
        circleBrush.width = settings.width
        brush = circleBrush
        break
      }
      case 'airbrush':
      case 'splatter': {
        // 喷枪/喷溅：使用 SprayBrush
        const sprayBrush = new SprayBrush(canvas)
        sprayBrush.width = settings.width
        sprayBrush.density = settings.type === 'splatter' ? 15 : 20
        sprayBrush.dotWidth = settings.type === 'splatter' ? 3 : 1
        sprayBrush.randomOpacity = settings.type === 'splatter'
        brush = sprayBrush
        break
      }
      case 'charcoal': {
        // 炭笔：SprayBrush 配置为稀疏、大点
        const sprayBrush = new SprayBrush(canvas)
        sprayBrush.width = settings.width * 1.5
        sprayBrush.density = 8
        sprayBrush.dotWidth = 2
        sprayBrush.randomOpacity = true
        brush = sprayBrush
        break
      }
      case 'watercolor': {
        // 水彩：CircleBrush 配置为透明、重叠混合
        const circleBrush = new CircleBrush(canvas)
        circleBrush.width = settings.width * 2
        brush = circleBrush
        break
      }
      case 'marker':
      case 'hard':
      default: {
        // 硬笔/马克笔：使用 PencilBrush
        const pencilBrush = new PencilBrush(canvas)
        pencilBrush.width = settings.width
        pencilBrush.strokeLineCap = settings.type === 'marker' ? 'square' : settings.lineCap
        pencilBrush.strokeLineJoin = settings.lineJoin
        // 马克笔稍宽、半透明
        if (settings.type === 'marker') {
          pencilBrush.width = settings.width * 1.2
        }
        brush = pencilBrush
      }
    }

    // 统一应用颜色和透明度
    const opacity = settings.type === 'marker' ? Math.min(settings.opacity, 0.75) : 
                    settings.type === 'watercolor' ? Math.min(settings.opacity, 0.6) :
                    settings.opacity
    const rgba = this.hexToRgba(settings.color, opacity)
    brush.color = rgba

    return brush
  }

  private hexToRgba(hex: string, opacity: number): string {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${opacity})`
  }

  /** 进入自由绘制模式 */
  enterDrawingMode() {
    const canvas = this.canvas
    if (!canvas) return

    // 退出其他编辑模式
    this.pathEditor?.clear()
    this.gradientEditor?.clear()
    canvas.discardActiveObject()
    canvas.requestRenderAll()

    // 启用绘制模式
    canvas.isDrawingMode = true
    this.drawingState.isDrawing = true
    this.drawingState.isErasing = false

    // 创建并设置画笔
    canvas.freeDrawingBrush = this.createBrush(this.drawingState.settings)

    // 监听绘制完成事件
    const onPathCreated = (e: { path: Path }) => {
      this.pathCounter += 1
      const path = e.path as MetaObject
      path.__label = `手绘路径${this.pathCounter}`
      ensureId(path)
      this.scheduleSave()
      this.emitLayers()
      this.emitCount()
    }
    canvas.on('path:created', onPathCreated)

    this.emitDrawingState()
  }

  /** 退出自由绘制模式 */
  exitDrawingMode() {
    const canvas = this.canvas
    if (!canvas) return

    canvas.isDrawingMode = false
    this.drawingState.isDrawing = false
    this.drawingState.isErasing = false
    canvas.defaultCursor = 'default'
    canvas.hoverCursor = 'move'
    canvas.off('path:created')
    
    // 清理橡皮擦事件
    const handler = (canvas as any).__eraserHandler
    if (handler) {
      canvas.off('mouse:down', handler)
      delete (canvas as any).__eraserHandler
    }
    
    canvas.requestRenderAll()

    this.emitDrawingState()
  }

  /** 切换自由绘制模式 */
  toggleDrawingMode() {
    if (this.drawingState.isDrawing) {
      this.exitDrawingMode()
    } else {
      this.enterDrawingMode()
    }
  }

  /** 更新笔刷类型 */
  setBrushType(type: BrushType) {
    this.drawingState.settings.type = type
    if (this.drawingState.isDrawing && !this.drawingState.isErasing && this.canvas) {
      this.canvas.freeDrawingBrush = this.createBrush(this.drawingState.settings)
    }
    this.emitDrawingState()
  }

  /** 更新笔刷设置 */
  updateBrushSettings(partial: Partial<BrushSettings>) {
    this.drawingState.settings = { ...this.drawingState.settings, ...partial }
    if (this.drawingState.isDrawing && !this.drawingState.isErasing && this.canvas) {
      this.canvas.freeDrawingBrush = this.createBrush(this.drawingState.settings)
    }
    this.emitDrawingState()
  }

  /** 切换橡皮擦模式 */
  toggleEraser() {
    const canvas = this.canvas
    if (!canvas || !this.drawingState.isDrawing) return

    this.drawingState.isErasing = !this.drawingState.isErasing

    if (this.drawingState.isErasing) {
      // 橡皮擦模式：退出绘图模式，启用点击删除
      canvas.isDrawingMode = false
      canvas.defaultCursor = 'crosshair'
      canvas.hoverCursor = 'crosshair'
      
      // 监听点击事件删除对象
      const onEraserClick = (opt: { target?: FabricObject }) => {
        if (!opt.target || isOverlayObject(opt.target) || isContainer(opt.target)) return
        // 只擦除手绘路径
        const label = (opt.target as MetaObject).__label
        if (label && label.startsWith('手绘路径')) {
          canvas.remove(opt.target)
          this.scheduleSave()
          this.emitLayers()
          this.emitCount()
        }
      }
      canvas.on('mouse:down', onEraserClick)
      // 存储处理器以便后续清理
      ;(canvas as any).__eraserHandler = onEraserClick
    } else {
      // 恢复正常画笔模式
      canvas.isDrawingMode = true
      canvas.defaultCursor = 'default'
      canvas.hoverCursor = 'move'
      canvas.freeDrawingBrush = this.createBrush(this.drawingState.settings)
      
      // 移除橡皮擦事件
      const handler = (canvas as any).__eraserHandler
      if (handler) {
        canvas.off('mouse:down', handler)
        delete (canvas as any).__eraserHandler
      }
    }

    this.emitDrawingState()
  }

  /** 获取当前绘制状态 */
  getDrawingState(): DrawingState {
    return { ...this.drawingState, settings: { ...this.drawingState.settings } }
  }

  private emitDrawingState() {
    this.listeners?.onDrawingStateChange?.(this.getDrawingState())
  }
}

export const controller = new LogoController()
