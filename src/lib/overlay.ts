import type { Canvas, FabricObject } from 'fabric'

/** 画布临时控件（路径锚点 / 渐变手柄），不进导出与图层 */
export function isOverlayObject(obj: FabricObject | undefined | null): boolean {
  return Boolean(obj && (obj as FabricObject & { __anchor?: boolean }).__anchor)
}

export function isGradientOverlay(obj: FabricObject): boolean {
  return Boolean((obj as FabricObject & { __gradMeta?: unknown }).__gradMeta)
}

export function markOverlay<T extends FabricObject>(obj: T, extra?: Record<string, unknown>): T {
  const o = obj as T & { __anchor?: boolean; excludeFromExport?: boolean }
  o.__anchor = true
  o.excludeFromExport = true
  if (extra) Object.assign(obj, extra)
  return obj
}

export function safeRemove(canvas: Canvas, obj: FabricObject) {
  try {
    canvas.remove(obj)
  } catch {
    /* already gone */
  }
}

export function zoomStroke(canvas: Canvas, base = 1) {
  const zoom = Math.max(0.25, canvas.getZoom() || 1)
  return {
    zoom,
    radius: (r: number) => r / zoom,
    stroke: Math.max(0.75, base / zoom),
  }
}
