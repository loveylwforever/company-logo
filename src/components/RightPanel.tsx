import { useState } from 'react'
import { controller, type LayerInfo, type SelectionProps } from '../lib/controller'
import { EXPORT_SIZES, type ExportSize } from '../lib/export'
import { AccordionSection } from './AccordionSection'

type Props = {
  selection: SelectionProps | null
  layers: LayerInfo[]
  selectedIds: string[]
}

type SectionId = 'props' | 'path' | 'gradient' | 'shadow' | 'layers' | 'export'

const DEFAULT_OPEN: Record<SectionId, boolean> = {
  props: true,
  path: true,
  gradient: true,
  shadow: true,
  layers: true,
  export: true,
}

export function RightPanel({ selection, layers, selectedIds }: Props) {
  const [sizes, setSizes] = useState<ExportSize[]>([16, 32, 48, 180, 192, 512, 1024])
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(DEFAULT_OPEN)

  const toggle = (id: SectionId) => {
    setOpen((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const hasSelection = Boolean(selection)
  // 单击容器，或框选/多选里包含容器，均可导出（容器常置底，框选更易选中）
  const canExport =
    Boolean(selection?.isContainer) ||
    layers.some((l) => Boolean(l.isContainer) && selectedIds.includes(l.id))
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
            {s.supportsCornerRadius && (
              <div className="field">
                <label>圆角 (px)</label>
                <DimInput
                  key={`r-${selectedIds.join(',')}`}
                  value={s.cornerRadius ?? 0}
                  min={0}
                  max={Math.max(0, Math.floor(Math.min(s.width, s.height) / 2))}
                  onCommit={(n) => controller.updateProps({ cornerRadius: n })}
                />
              </div>
            )}
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
          </>
        )}
      </AccordionSection>

      {hasSelection && s && (s.isText || s.isPath || s.pathEditing) && (
        <AccordionSection title="路径变形" open={open.path} onToggle={() => toggle('path')}>
          <div className={`path-feature${s.pathEditing ? ' is-editing' : ''}`}>
            <div className="path-feature-top">
              <span className="path-feature-mark" aria-hidden>
                <svg viewBox="0 0 40 28" width="40" height="28" fill="none">
                  <path
                    d="M4 20 C10 6 16 6 22 14 C26 20 30 22 36 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <circle cx="4" cy="20" r="2.6" fill="currentColor" />
                  <circle cx="22" cy="14" r="2.6" fill="currentColor" />
                  <circle cx="36" cy="12" r="2.6" fill="#fff" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </span>
              <div className="path-feature-copy">
                <span className="path-feature-badge">{s.pathEditing ? '编辑中' : '特色能力'}</span>
                <strong className="path-feature-title">
                  {s.pathEditing ? '拖拽锚点自由变形' : s.isText ? '文字变矢量，随心塑形' : '锚点级路径雕塑'}
                </strong>
              </div>
            </div>
            <p className="path-feature-desc">
              {s.pathEditing
                ? s.pathEditMode === 'curve'
                  ? '实心点移锚点，空心点调切线，橙色点拉弧度。也可用下方滑条微调弯曲。'
                  : '直线模式：拖实心锚点折线变形。切到「曲线」后可拉弧度。'
                : s.isText
                  ? '先转为路径（自动均匀补点），再用锚点拉出专属字形轮廓——Logo 差异化的关键一步。'
                  : '进入编辑后拖动锚点与控制柄，精细调整轮廓，做出独一无二的标志形态。'}
            </p>
            {s.pathEditing && (
              <div className="path-edit-tools">
                <div className="toolbar-group path-mode-group">
                  <button
                    type="button"
                    className={s.pathEditMode === 'line' ? 'active' : ''}
                    onClick={() => controller.setPathEditMode('line')}
                  >
                    直线变形
                  </button>
                  <button
                    type="button"
                    className={s.pathEditMode !== 'line' ? 'active' : ''}
                    onClick={() => controller.setPathEditMode('curve')}
                  >
                    曲线变形
                  </button>
                </div>
                {s.pathEditMode !== 'line' && (
                  <label className="path-bend-label">
                    <span>弯曲弧度</span>
                    <input
                      type="range"
                      min={s.pathBendMin ?? -40}
                      max={s.pathBendMax ?? 40}
                      step={0.5}
                      value={s.pathBend ?? 0}
                      onChange={(e) => controller.setPathBend(Number(e.target.value))}
                    />
                    <em>{Math.round(s.pathBend ?? 0)}</em>
                  </label>
                )}
              </div>
            )}
            <div className="path-feature-actions">
              {s.isText && (
                <button
                  type="button"
                  className="path-feature-cta"
                  onClick={() => void controller.convertTextToPath()}
                >
                  转为路径并变形
                </button>
              )}
              {s.isPath && !s.pathEditing && (
                <button
                  type="button"
                  className="path-feature-cta"
                  onClick={() => controller.startPathEdit()}
                >
                  开始编辑路径
                </button>
              )}
              {s.pathEditing && (
                <button
                  type="button"
                  className="path-feature-cta is-done"
                  onClick={() => controller.stopPathEdit()}
                >
                  完成变形
                </button>
              )}
            </div>
          </div>
        </AccordionSection>
      )}

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
                title="直线方向渐变：两端可自由摆放"
                onClick={() => patchGrad({ mode: 'linear' })}
              >
                线性
              </button>
              <button
                type="button"
                className={s.fillMode === 'radial' ? 'active' : ''}
                title="从中心向外扩散的圆形渐变"
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
                <div
                  className="gradient-preview"
                  style={{
                    background:
                      s.fillMode === 'radial'
                        ? `radial-gradient(circle, ${s.gradientColor1}, ${s.gradientColor2})`
                        : `linear-gradient(${s.gradientAngle}deg, ${s.gradientColor1}, ${s.gradientColor2})`,
                  }}
                />
                <p className="muted">
                  {s.fillMode === 'linear'
                    ? `拖两端改方向与过渡；拖中点挪线。切换线性/径向会分别记住布局（${s.gradientAngle}°）`
                    : '拖中心点移焦点，拖外点改半径'}
                </p>
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
            ? '导出时文字会转成矢量轮廓（不依赖系统字体）；PNG 按勾选尺寸；ICO 仅打包 ≤256'
            : '请选中 Logo 容器（单击或框选包含即可），导出按钮才会可用'}
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
    1024: '高清商店图 / 大图导出',
  }
  return `${size}×${size} · ${hints[size] ?? '网站图标'}`
}
