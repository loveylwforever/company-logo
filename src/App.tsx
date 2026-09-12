import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { LeftPanel } from './components/LeftPanel'
import { CanvasStage } from './components/CanvasStage'
import { RightPanel } from './components/RightPanel'
import { controller, type LayerInfo, type SelectionProps, type DrawingState } from './lib/controller'
import { DEFAULT_PALETTE_ID } from './lib/palettes'
import './styles/app.css'

import '@fontsource/outfit/700.css'
import '@fontsource/bebas-neue/400.css'
import '@fontsource/montserrat/700.css'
import '@fontsource/pacifico/400.css'
import '@fontsource/source-sans-3/600.css'
import '@fontsource/space-grotesk/700.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/oswald/700.css'
import '@fontsource/righteous/400.css'
import '@fontsource/anton/400.css'
import '@fontsource/comfortaa/700.css'
import '@fontsource/lobster/400.css'
import '@fontsource/rubik/700.css'
import '@fontsource/archivo-black/400.css'
import '@fontsource/dm-serif-display/400.css'
import '@fontsource/poppins/700.css'
import '@fontsource/raleway/700.css'
import '@fontsource/josefin-sans/700.css'
import '@fontsource/bangers/400.css'
import '@fontsource/zcool-kuaile/chinese-simplified-400.css'
import '@fontsource/ma-shan-zheng/chinese-simplified-400.css'

export default function App() {
  const [name, setName] = useState('Logo')
  const [fontId, setFontId] = useState('outfit')
  const [paletteId, setPaletteId] = useState(DEFAULT_PALETTE_ID)
  const [selection, setSelection] = useState<SelectionProps | null>(null)
  const [layers, setLayers] = useState<LayerInfo[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [objectCount, setObjectCount] = useState(0)
  const [drawingState, setDrawingState] = useState<DrawingState | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const onSelectionChange = useCallback((props: SelectionProps | null) => {
    setSelection(props)
    setSelectedIds(controller.getSelectedIds())
  }, [])

  const onLayersChange = useCallback((next: LayerInfo[]) => {
    setLayers(next)
    setSelectedIds(controller.getSelectedIds())
  }, [])

  const onHistoryChange = useCallback((u: boolean, r: boolean) => {
    setCanUndo(u)
    setCanRedo(r)
  }, [])

  const onObjectCount = useCallback((n: number) => setObjectCount(n), [])

  const onProjectMeta = useCallback((meta: { name: string; fontId: string; paletteId: string }) => {
    setName(meta.name)
    setFontId(meta.fontId)
    setPaletteId(meta.paletteId)
  }, [])

  const onDrawingStateChange = useCallback((state: DrawingState) => {
    setDrawingState(state)
  }, [])

  useEffect(() => {
    controller.setProjectMeta({ name, fontId, paletteId })
  }, [name, fontId, paletteId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) void controller.redo()
        else void controller.undo()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        void controller.redo()
        return
      }
      if (!typing && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault()
        controller.deleteSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const exportProject = () => {
    controller.exportProject({ name, fontId, paletteId })
  }

  const importProject = () => {
    fileInputRef.current?.click()
  }

  const onImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!window.confirm('导入将替换当前画布，未导出的修改会丢失。继续？')) return
    await controller.importProjectFile(file)
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>Logo 制作器</h1>
        <span className="muted">工程文件可备份 · 选中容器导出图标</span>
        <div className="spacer" />
        <div className="actions">
          <button type="button" disabled={!canUndo} onClick={() => void controller.undo()}>
            撤销
          </button>
          <button type="button" disabled={!canRedo} onClick={() => void controller.redo()}>
            重做
          </button>
          <button type="button" onClick={exportProject}>
            导出工程
          </button>
          <button type="button" onClick={importProject}>
            导入工程
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.logo.json,application/json"
            hidden
            onChange={(e) => void onImportFile(e)}
          />
          <button type="button" className="danger" onClick={() => controller.clearAll()}>
            清空
          </button>
        </div>
      </header>
      <div className="workspace">
        <LeftPanel
          name={name}
          onNameChange={setName}
          fontId={fontId}
          onFontChange={setFontId}
          paletteId={paletteId}
          onPaletteChange={setPaletteId}
          drawingState={drawingState}
        />
        <CanvasStage
          onSelectionChange={onSelectionChange}
          onLayersChange={onLayersChange}
          onHistoryChange={onHistoryChange}
          onObjectCount={onObjectCount}
          onProjectMeta={onProjectMeta}
          onDrawingStateChange={onDrawingStateChange}
          objectCount={objectCount}
        />
        <RightPanel selection={selection} layers={layers} selectedIds={selectedIds} />
      </div>
    </div>
  )
}
