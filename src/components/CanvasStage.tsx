import { useEffect, useRef, useState } from 'react'
import { controller, type ContextMenuState, type LayerInfo, type SelectionProps } from '../lib/controller'

type Props = {
  onSelectionChange: (props: SelectionProps | null) => void
  onLayersChange: (layers: LayerInfo[]) => void
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void
  onObjectCount: (count: number) => void
  objectCount: number
}

const MENU_W = 148
const MENU_H = 220

function clampMenuPos(x: number, y: number) {
  const left = Math.min(Math.max(8, x), window.innerWidth - MENU_W - 8)
  const top = Math.min(Math.max(8, y), window.innerHeight - MENU_H - 8)
  return { left, top }
}

export function CanvasStage({
  onSelectionChange,
  onLayersChange,
  onHistoryChange,
  onObjectCount,
  objectCount,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [zoomPercent, setZoomPercent] = useState(100)
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    controller.mount(canvasRef.current, {
      onSelectionChange,
      onLayersChange,
      onHistoryChange,
      onObjectCount,
      onZoomChange: setZoomPercent,
      onContextMenu: setCtxMenu,
    })

    const fit = () => {
      const wrap = wrapRef.current
      if (!wrap || !controller.canvas) return
      controller.resizeTo(wrap.clientWidth, wrap.clientHeight)
    }

    fit()
    const ro = new ResizeObserver(fit)
    if (wrapRef.current) ro.observe(wrapRef.current)

    return () => {
      ro.disconnect()
      controller.dispose()
    }
  }, [onSelectionChange, onLayersChange, onHistoryChange, onObjectCount])

  useEffect(() => {
    if (!ctxMenu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtxMenu(null)
    }
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return
      setCtxMenu(null)
    }
    window.addEventListener('keydown', onKey)
    // 下一帧再监听，避免同一右键事件立刻关掉菜单
    const t = window.setTimeout(() => {
      window.addEventListener('pointerdown', onPointer, true)
    }, 0)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer, true)
    }
  }, [ctxMenu])

  const runMenu = (action: () => void) => {
    action()
    setCtxMenu(null)
  }

  const menuPos = ctxMenu ? clampMenuPos(ctxMenu.x, ctxMenu.y) : null
  const layerDisabled = Boolean(ctxMenu?.pathEditing)

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <div className="canvas-stage">
        <canvas ref={canvasRef} />
      </div>
      <div className="zoom-bar" title="滚轮缩放 · 按钮调节">
        <button type="button" onClick={() => controller.zoomOut()} aria-label="缩小">
          −
        </button>
        <button type="button" className="zoom-label" onClick={() => controller.resetZoom()} title="重置缩放与平移">
          {zoomPercent}%
        </button>
        <button type="button" onClick={() => controller.zoomIn()} aria-label="放大">
          +
        </button>
      </div>
      {objectCount === 0 && (
        <div className="canvas-hint">
          左键框选 · 右键拖拽平移 · 右键菜单 · 滚轮缩放 · 导出前选中容器
        </div>
      )}
      {ctxMenu && menuPos && (
        <div
          ref={menuRef}
          className="ctx-menu"
          role="menu"
          style={{ left: menuPos.left, top: menuPos.top }}
        >
          <button
            type="button"
            role="menuitem"
            disabled={layerDisabled}
            onClick={() => runMenu(() => controller.bringToFront())}
          >
            置顶
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={layerDisabled}
            onClick={() => runMenu(() => controller.bringForward())}
          >
            上移一层
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={layerDisabled}
            onClick={() => runMenu(() => controller.sendBackward())}
          >
            下移一层
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={layerDisabled}
            onClick={() => runMenu(() => controller.sendToBack())}
          >
            置底
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={layerDisabled}
            onClick={() => runMenu(() => controller.toggleLock())}
          >
            {ctxMenu.locked ? '解锁' : '锁定'}
          </button>
          <div className="ctx-menu-sep" />
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => runMenu(() => controller.deleteSelected())}
          >
            删除
          </button>
        </div>
      )}
    </div>
  )
}
