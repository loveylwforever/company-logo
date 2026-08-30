import { useState } from 'react'
import { controller, type LayerInfo, type SelectionProps } from '../lib/controller'
import { EXPORT_SIZES, type ExportSize } from '../lib/export'
import { AccordionSection } from './AccordionSection'

type Props = {
  selection: SelectionProps | null
  layers: LayerInfo[]
  selectedIds: string[]
}

type SectionId = 'props' | 'gradient' | 'shadow' | 'layers' | 'export'

const DEFAULT_OPEN: Record<SectionId, boolean> = {
  props: true,
  gradient: true,
  shadow: true,
  layers: true,
  export: true,
}

export function RightPanel({ selection, layers, selectedIds }: Props) {
  const [sizes, setSizes] = useState<ExportSize[]>([16, 32, 48, 180, 192, 512])
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(DEFAULT_OPEN)

  const toggle = (id: SectionId) => {
    setOpen((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const hasSelection = Boolean(selection)
  const canExport = Boolean(selection?.isContainer)
  const canStyle = hasSelection && !selection!.isContainer
  const sizeSet = new Set(sizes)

  const toggleSize = (s: ExportSize) => {
    setSizes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s].sort((a, b) => a - b)))
  }

  const runExport = async (fn: () => Promise<void>) => {
    if (!canExport) return
    if (!sizes.length && fn !== controller.exportSvg) return
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const s = selection
  const patchShadow = (partial: {
    enabled?: boolean
    color?: string
    blur?: number
    offsetX?: number
    offsetY?: number
  }) => {
    if (!s) return
    controller.applyShadow({
      enabled: partial.enabled ?? true,
      color: partial.color ?? s.shadowColor,
      blur: partial.blur ?? s.shadowBlur,
      offsetX: partial.offsetX ?? s.shadowOffsetX,
      offsetY: partial.offsetY ?? s.shadowOffsetY,
    })
  }
  const patchGrad = (partial: {
    mode?: SelectionProps['fillMode']
    color?: string
    color1?: string
    color2?: string
    angle?: number
  }) => {
    if (!s) return
    controller.applyFillStyle({
      mode: partial.mode ?? s.fillMode,
      color: partial.color,
      color1: partial.color1 ?? s.gradientColor1,
      color2: partial.color2 ?? s.gradientColor2,
      angle: partial.angle ?? s.gradientAngle,
    })
  }

  return (
    <aside className="panel right">
      <AccordionSection title="属性" open={open.props} onToggle={() => toggle('props')}>
        {!hasSelection || !s ? (
          <div className="empty-state">选中画布对象以编辑</div>
        ) : (
          <>
            {s.isContainer && (
              <p className="muted">已选中 Logo 容器（约 {s.containerSize}px）— 可导出</p>
            )}
            <div className="row">
              <div className="field grow">
                <label>填充</label>
                <input
                  type="color"
                  value={toColorInput(s.fillMode === 'solid' ? s.fill : s.gradientColor1)}
                  onChange={(e) => {
                    if (s.fillMode === 'solid' || s.isContainer) {
                      controller.updateProps({ fill: e.target.value })
                    } else {
                      patchGrad({ color1: e.target.value })
                    }
                  }}
                />
              </div>
              <div className="field grow">
                <label>描边</label>
                <input
                  type="color"
                  value={toColorInput(s.stroke === 'transparent' ? '#000000' : s.stroke)}
                  onChange={(e) => controller.updateProps({ stroke: e.target.value })}
                />
              </div>
            </div>
            <div className="row">
              <div className="field grow">
                <label>宽度</label>
                <DimInput
                  key={`w-${selectedIds.join(',')}`}
                  value={s.width}
                  min={8}
                  max={4096}
                  onCommit={(n) => controller.updateProps({ width: n })}
                />
              </div>
              <div className="field grow">
                <label>高度</label>
                <DimInput
                  key={`h-${selectedIds.join(',')}`}
                  value={s.height}
                  min={8}
                  max={4096}
                  onCommit={(n) => controller.updateProps({ height: n })}
                />
              </div>
            </div>
            <div className="row">
              <div className="field grow">
                <label>描边宽</label>
                <input
                  type="number"
                  min={0}
                  max={40}
                  value={s.strokeWidth}
                  onChange={(e) => controller.updateProps({ strokeWidth: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="field grow">
                <label>透明度</label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={Number(s.opacity.toFixed(2))}
                  onChange={(e) => controller.updateProps({ opacity: Number(e.target.value) })}
                />
              </div>
            </div>
            {s.isText && (
              <div className="field">
                <label>字号</label>
                <input
                  type="number"
                  min={12}
                  max={240}
                  value={s.fontSize ?? 72}
                  onChange={(e) => controller.updateProps({ fontSize: Number(e.target.value) || 72 })}
                />
              </div>
            )}
            <div className="toolbar-group">
              {s.isText && (
                <button type="button" className="primary" onClick={() => void controller.convertTextToPath()}>
                  转为路径
                </button>
              )}
              {s.isPath && !s.pathEditing && (
                <button type="button" className="primary" onClick={() => controller.startPathEdit()}>
                  编辑路径
                </button>
              )}
              {s.pathEditing && (
                <button type="button" className="primary" onClick={() => controller.stopPathEdit()}>
                  完成变形
                </button>
              )}
              <button type="button" className="danger" onClick={() => controller.deleteSelected()}>
                删除
              </button>
            </div>
            {s.pathEditing && (
              <p className="muted">拖拽绿色锚点变形；完成后点「完成变形」</p>
            )}
          </>
        )}
      </AccordionSection>

      {canStyle && s && (
        <>
          <AccordionSection title="渐变" open={open.gradient} onToggle={() => toggle('gradient')}>
            <div className="toolbar-group">
              <button
                type="button"
                className={s.fillMode === 'solid' ? 'active' : ''}
                onClick={() =>
                  patchGrad({
                    mode: 'solid',
                    color: s.fillMode === 'solid' ? s.fill : s.gradientColor1,
                  })
                }
              >
                纯色
              </button>
              <button
                type="button"
                className={s.fillMode === 'linear' ? 'active' : ''}
                onClick={() => patchGrad({ mode: 'linear' })}
              >
                线性
              </button>
              <button
                type="button"
                className={s.fillMode === 'radial' ? 'active' : ''}
                onClick={() => patchGrad({ mode: 'radial' })}
              >
                径向
              </button>
            </div>
            {s.fillMode !== 'solid' && (
              <>
                <div className="row">
                  <div className="field grow">
                    <label>色 1</label>
                    <input
                      type="color"
                      value={toColorInput(s.gradientColor1)}
                      onChange={(e) => patchGrad({ color1: e.target.value })}
                    />
                  </div>
                  <div className="field grow">
                    <label>色 2</label>
                    <input
                      type="color"
                      value={toColorInput(s.gradientColor2)}
                      onChange={(e) => patchGrad({ color2: e.target.value })}
                    />
                  </div>
                </div>
                {s.fillMode === 'linear' && (
                  <div className="field">
                    <label>角度 {s.gradientAngle}°</label>
                    <input
                      type="range"
                      min={0}
                      max={360}
                      value={s.gradientAngle}
                      onChange={(e) =>
                        patchGrad({ mode: 'linear', angle: Number(e.target.value) })
                      }
                    />
                  </div>
                )}
                <div
                  className="gradient-preview"
                  style={{
                    background:
                      s.fillMode === 'radial'
                        ? `radial-gradient(circle, ${s.gradientColor1}, ${s.gradientColor2})`
                        : `linear-gradient(${s.gradientAngle}deg, ${s.gradientColor1}, ${s.gradientColor2})`,
                  }}
                />
              </>
            )}
          </AccordionSection>

          <AccordionSection title="光影" open={open.shadow} onToggle={() => toggle('shadow')}>
            <label className="chip" style={{ width: '100%' }}>
              <input
                type="checkbox"
                checked={s.shadowEnabled}
                onChange={(e) => patchShadow({ enabled: e.target.checked })}
              />
              启用阴影 / 发光
            </label>
            {s.shadowEnabled && (
              <>
                <div className="row">
                  <div className="field grow">
                    <label>颜色</label>
                    <input
                      type="color"
                      value={toColorInput(s.shadowColor)}
                      onChange={(e) => patchShadow({ color: e.target.value })}
                    />
                  </div>
                  <div className="field grow">
                    <label>模糊</label>
                    <input
                      type="number"
                      min={0}
                      max={60}
                      value={s.shadowBlur}
                      onChange={(e) => patchShadow({ blur: Number(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="row">
                  <div className="field grow">
                    <label>偏移 X</label>
                    <input
                      type="number"
                      min={-40}
                      max={40}
                      value={s.shadowOffsetX}
                      onChange={(e) => patchShadow({ offsetX: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="field grow">
                    <label>偏移 Y</label>
                    <input
                      type="number"
                      min={-40}
                      max={40}
                      value={s.shadowOffsetY}
                      onChange={(e) => patchShadow({ offsetY: Number(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="toolbar-group">
                  <button
                    type="button"
                    onClick={() =>
                      patchShadow({ color: '#000000', blur: 14, offsetX: 4, offsetY: 6 })
                    }
                  >
                    投影
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      patchShadow({
                        color: s.fillMode === 'solid' ? s.fill : s.gradientColor1,
                        blur: 18,
                        offsetX: 0,
                        offsetY: 0,
                      })
                    }
                  >
                    外发光
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      patchShadow({ color: '#ffffff', blur: 10, offsetX: -2, offsetY: -2 })
                    }
                  >
                    高光
                  </button>
                </div>
              </>
            )}
          </AccordionSection>
        </>
      )}

      <AccordionSection title="图层" open={open.layers} onToggle={() => toggle('layers')}>
        <div className="toolbar-group">
          <button type="button" disabled={!hasSelection} onClick={() => controller.bringToFront()}>
            置顶
          </button>
          <button type="button" disabled={!hasSelection} onClick={() => controller.bringForward()}>
            上移
          </button>
          <button type="button" disabled={!hasSelection} onClick={() => controller.sendBackward()}>
            下移
          </button>
          <button type="button" disabled={!hasSelection} onClick={() => controller.sendToBack()}>
            置底
          </button>
          <button type="button" disabled={!hasSelection} onClick={() => controller.toggleLock()}>
            锁定
          </button>
        </div>
        <div className="layer-list">
          {layers.length === 0 ? (
            <div className="empty-state">暂无图层</div>
          ) : (
            layers.map((layer) => (
              <button
                key={layer.id}
                type="button"
                className={`layer-item${selectedIds.includes(layer.id) ? ' selected' : ''}${layer.isContainer ? ' container-layer' : ''}`}
                onClick={() => controller.selectById(layer.id)}
              >
                <span className="name">{layer.name}</span>
                <span className="muted">{layer.isContainer ? '导出框' : layer.type}</span>
              </button>
            ))
          )}
        </div>
      </AccordionSection>

      <AccordionSection title="导出" open={open.export} onToggle={() => toggle('export')}>
        <div className="export-sizes">
          {EXPORT_SIZES.map((size) => (
            <label key={size} className="chip" title={sizeHint(size)}>
              <input
                type="checkbox"
                checked={sizeSet.has(size)}
                onChange={() => toggleSize(size)}
              />
              {size}
            </label>
          ))}
        </div>
        <div className="toolbar-group">
          <button
            type="button"
            className="primary"
            disabled={busy || !canExport || !sizes.length}
            onClick={() => void runExport(() => controller.exportPng(sizes))}
          >
            PNG
          </button>
          <button
            type="button"
            disabled={busy || !canExport}
            onClick={() => void runExport(() => controller.exportSvg())}
          >
            SVG
          </button>
          <button
            type="button"
            disabled={busy || !canExport || !sizes.length}
            onClick={() => void runExport(() => controller.exportIco(sizes))}
          >
            ICO
          </button>
        </div>
        <p className="muted">
          {canExport
            ? 'PNG 按勾选尺寸导出；ICO 仅打包 ≤256；180=Apple，192/512=PWA'
            : '请先选中一个 Logo 容器，导出按钮才会可用'}
        </p>
      </AccordionSection>
    </aside>
  )
}

function DimInput({
  value,
  min,
  max,
  onCommit,
}: {
  value: number
  min: number
  max: number
  onCommit: (n: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? String(value)

  const commit = (raw: string) => {
    const n = Number(raw)
    const next = Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : min
    onCommit(next)
    setDraft(null)
  }

  return (
    <input
      type="number"
      min={min}
      max={max}
      value={shown}
      onFocus={() => setDraft(String(value))}
      onChange={(e) => {
        const raw = e.target.value
        setDraft(raw)
        // 输入过程中只同步合法完整数值，避免清空时被夹成最小值
        if (raw === '' || raw === '-' || raw.endsWith('.')) return
        const n = Number(raw)
        if (!Number.isFinite(n) || n < min || n > max) return
        onCommit(Math.round(n))
      }}
      onBlur={() => commit(draft ?? String(value))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        }
      }}
    />
  )
}

function toColorInput(value: string): string {
  if (!value || value === 'transparent') return '#000000'
  if (value.startsWith('rgba')) return '#0f6e56'
  if (value.startsWith('#')) {
    if (value.length >= 7) return value.slice(0, 7)
    if (value.length === 4) {
      return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
    }
  }
  return '#000000'
}

function sizeHint(size: ExportSize): string {
  const hints: Partial<Record<ExportSize, string>> = {
    16: '浏览器标签、书签',
    32: '高清标签、任务栏',
    48: 'Windows 快捷方式 / ICO',
    64: '高清任务栏',
    96: 'Android 旧版图标',
    128: '扩展 / 商店缩略图',
    180: 'Apple Touch Icon（添加到主屏幕）',
    192: 'Android / PWA 图标',
    256: 'Windows 大图标 / ICO',
    512: 'PWA 启动图 / 商店',
  }
  return `${size}×${size} · ${hints[size] ?? '网站图标'}`
}
