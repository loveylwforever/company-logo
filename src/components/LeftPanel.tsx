import { useState } from 'react'
import { SHAPE_META, type ShapeKind } from '../lib/shapes'
import { FONT_GROUPS, fontsInGroup } from '../lib/fonts'
import {
  PALETTE_GROUPS,
  palettesInGroup,
  palettePreviewCss,
  type Palette,
} from '../lib/palettes'
import { controller, CONTAINER_PRESETS, type BrushType, type DrawingState, type LetterTemplate } from '../lib/controller'
import { AccordionSection } from './AccordionSection'

type Props = {
  name: string
  onNameChange: (v: string) => void
  fontId: string
  onFontChange: (id: string) => void
  paletteId: string
  onPaletteChange: (id: string) => void
  drawingState: DrawingState | null
}

type SectionId = 'name' | 'drawing' | 'container' | 'templates' | 'shapes' | 'fonts' | 'palettes'

const DEFAULT_OPEN: Record<SectionId, boolean> = {
  name: true,
  drawing: false,
  container: true,
  templates: true,
  shapes: true,
  fonts: true,
  palettes: true,
}

function ShapeIcon({ kind }: { kind: ShapeKind }) {
  const paths: Record<ShapeKind, string> = {
    circle: 'M12 2a10 10 0 1 0 0.01 0z',
    oval: 'M12 5a8 5.5 0 1 0 0.01 0z',
    rect: 'M4 4h16v16H4z',
    rounded: 'M7 4h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3z',
    pill: 'M8 4h8a8 8 0 0 1 0 16H8a8 8 0 0 1 0-16z',
    triangle: 'M12 4l10 16H2z',
    diamond: 'M12 2l10 10-10 10L2 12z',
    pentagon: 'M12 2l9 6.5-3.5 11h-11L3 8.5z',
    hexagon: 'M12 2l8 4.5v9L12 20l-8-4.5v-9z',
    octagon: 'M8 2h8l6 6v8l-6 6H8l-6-6V8z',
    star: 'M12 2l2.9 6.5L22 9.2l-5 4.6L18.8 22 12 18.2 5.2 22 7 13.8 2 9.2l7.1-.7z',
    shield: 'M12 2l8 3v7c0 5-3.5 8-8 10-4.5-2-8-5-8-10V5z',
    ring: 'M12 2a10 10 0 1 0 0.01 0zm0 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10z',
    cross: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
    banner: 'M3 7h18l-3 5 3 5H3l3-5z',
    arch: 'M4 18V12a8 8 0 0 1 16 0v6H4z',
    parallelogram: 'M7 5h14l-4 14H3z',
    teardrop: 'M12 2c6 8 8 11 8 14a8 8 0 1 1-16 0c0-3 2-6 8-14z',
    leaf: 'M12 3c7 4 9 10 7 15-5 2-10 1-14-3 1-5 5-10 7-12z',
    blob: 'M12 3c5 0 9 3 9 8s-3 9-9 10S3 16 3 11 7 3 12 3z',
    line: 'M3 12h18',
  }
  const strokeOnly = kind === 'line'
  const evenOdd = kind === 'ring'
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={strokeOnly ? 'stroke-icon' : undefined}>
      <path
        d={paths[kind]}
        fillRule={evenOdd ? 'evenodd' : undefined}
        fill={strokeOnly ? 'none' : undefined}
        stroke={strokeOnly ? 'currentColor' : undefined}
        strokeWidth={strokeOnly ? 2.5 : undefined}
        strokeLinecap={strokeOnly ? 'butt' : undefined}
      />
    </svg>
  )
}

const BRUSH_META: Array<{ type: BrushType; label: string; desc: string }> = [
  { type: 'hard', label: '硬笔', desc: '清晰锐利的线条' },
  { type: 'soft', label: '软笔刷', desc: '柔和边缘' },
  { type: 'marker', label: '马克笔', desc: '方头半透明' },
  { type: 'airbrush', label: '喷枪', desc: '细腻喷涂' },
  { type: 'charcoal', label: '炭笔', desc: '粗糙质感' },
  { type: 'watercolor', label: '水彩', desc: '透明重叠' },
  { type: 'splatter', label: '喷溅', desc: '随机飞溅' },
]

export function LeftPanel({
  name,
  onNameChange,
  fontId,
  onFontChange,
  paletteId,
  onPaletteChange,
  drawingState,
}: Props) {
  const [open, setOpen] = useState(DEFAULT_OPEN)
  const toggle = (id: SectionId) => {
    setOpen((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const isDrawing = drawingState?.isDrawing ?? false
  const settings = drawingState?.settings ?? {
    type: 'hard' as BrushType,
    width: 4,
    color: '#000000',
    opacity: 1,
    hardness: 80,
    lineCap: 'round' as const,
    lineJoin: 'round' as const,
  }

  return (
    <aside className="panel left">
      <AccordionSection
        title="名称"
        open={open.name}
        onToggle={() => toggle('name')}
      >
        <div className="row">
          <input
            className="grow"
            type="text"
            value={name}
            placeholder="输入 Logo 文字"
            onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') controller.addText(name)
            }}
          />
          <button className="primary" type="button" onClick={() => controller.addText(name)}>
            添加
          </button>
        </div>
      </AccordionSection>

      <AccordionSection
        title="自由绘制"
        open={open.drawing}
        onToggle={() => toggle('drawing')}
      >
        <div className="drawing-mode-section">
          <button
            type="button"
            className={`drawing-toggle${isDrawing ? ' active' : ''}`}
            onClick={() => controller.toggleDrawingMode()}
          >
            {isDrawing ? '● 绘制中 - 点击退出' : '开始自由绘制'}
          </button>

          {isDrawing && (
            <>
              <div className="brush-presets">
                <label className="field-label">笔刷类型</label>
                <div className="grid-2">
                  {BRUSH_META.map((b) => (
                    <button
                      key={b.type}
                      type="button"
                      className={`brush-preset-btn${settings.type === b.type ? ' active' : ''}`}
                      title={b.desc}
                      onClick={() => controller.setBrushType(b.type)}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="brush-controls">
                <div className="field">
                  <label>粗细: {settings.width}px</label>
                  <input
                    type="range"
                    min={1}
                    max={50}
                    step={1}
                    value={settings.width}
                    onChange={(e) => controller.updateBrushSettings({ width: Number(e.target.value) })}
                  />
                </div>

                <div className="field">
                  <label>颜色</label>
                  <input
                    type="color"
                    value={settings.color}
                    onChange={(e) => controller.updateBrushSettings({ color: e.target.value })}
                  />
                </div>

                <div className="field">
                  <label>不透明度: {Math.round(settings.opacity * 100)}%</label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.opacity}
                    onChange={(e) => controller.updateBrushSettings({ opacity: Number(e.target.value) })}
                  />
                </div>

                <div className="field">
                  <label>硬度: {settings.hardness}%</label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={settings.hardness}
                    onChange={(e) => controller.updateBrushSettings({ hardness: Number(e.target.value) })}
                  />
                </div>

                <div className="field">
                  <label>线条端点</label>
                  <div className="toolbar-group">
                    <button
                      type="button"
                      className={settings.lineCap === 'butt' ? 'active' : ''}
                      onClick={() => controller.updateBrushSettings({ lineCap: 'butt' })}
                      title="方形端点"
                    >
                      方
                    </button>
                    <button
                      type="button"
                      className={settings.lineCap === 'round' ? 'active' : ''}
                      onClick={() => controller.updateBrushSettings({ lineCap: 'round' })}
                      title="圆形端点"
                    >
                      圆
                    </button>
                    <button
                      type="button"
                      className={settings.lineCap === 'square' ? 'active' : ''}
                      onClick={() => controller.updateBrushSettings({ lineCap: 'square' })}
                      title="方形延伸"
                    >
                      延
                    </button>
                  </div>
                </div>

                <div className="field">
                  <label>线条连接</label>
                  <div className="toolbar-group">
                    <button
                      type="button"
                      className={settings.lineJoin === 'miter' ? 'active' : ''}
                      onClick={() => controller.updateBrushSettings({ lineJoin: 'miter' })}
                      title="尖角连接"
                    >
                      尖
                    </button>
                    <button
                      type="button"
                      className={settings.lineJoin === 'round' ? 'active' : ''}
                      onClick={() => controller.updateBrushSettings({ lineJoin: 'round' })}
                      title="圆角连接"
                    >
                      圆
                    </button>
                    <button
                      type="button"
                      className={settings.lineJoin === 'bevel' ? 'active' : ''}
                      onClick={() => controller.updateBrushSettings({ lineJoin: 'bevel' })}
                      title="斜角连接"
                    >
                      斜
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  className={`eraser-btn${drawingState?.isErasing ? ' active' : ''}`}
                  onClick={() => controller.toggleEraser()}
                >
                  {drawingState?.isErasing ? '● 橡皮擦中' : '橡皮擦'}
                </button>
              </div>
            </>
          )}
        </div>
        <p className="muted">
          {isDrawing
            ? '拖动鼠标自由绘制；选择不同笔刷体验多样质感；橡皮擦可擦除笔画'
            : '进入后可用多种笔刷自由涂鸦，绘制独特图形'}
        </p>
      </AccordionSection>

      <AccordionSection
        title="Logo 容器"
        open={open.container}
        onToggle={() => toggle('container')}
      >
        <div className="grid-2">
          {CONTAINER_PRESETS.map((size) => (
            <button
              key={size}
              type="button"
              className="primary"
              title={`添加 ${size}×${size} 导出容器`}
              onClick={() => controller.addContainer(size)}
            >
              {size}²
            </button>
          ))}
          <button type="button" title="添加默认 512 容器" onClick={() => controller.addContainer(512)}>
            + 容器
          </button>
        </div>
        <p className="muted">导出必须以选中的容器为准</p>
      </AccordionSection>

      <AccordionSection
        title="字母模板"
        open={open.templates}
        onToggle={() => toggle('templates')}
      >
        <div className="letter-templates-section">
          <p className="muted">根据名称字数推荐的商业级样式模板</p>
          <TemplateButtons text={name} />
        </div>
      </AccordionSection>

      <AccordionSection
        title="形状模板"
        open={open.shapes}
        onToggle={() => toggle('shapes')}
      >
        <div className="grid-4">
          {SHAPE_META.map((s) => (
            <button
              key={s.id}
              type="button"
              className="shape-btn"
              title={`添加${s.label}到画布`}
              onClick={() => controller.addShape(s.id)}
            >
              <ShapeIcon kind={s.id} />
              <span className="muted">{s.label}</span>
            </button>
          ))}
        </div>
        <p className="muted">可先自由涂鸦；选中容器时落入其中</p>
      </AccordionSection>

      <AccordionSection
        title="样式模板"
        open={open.fonts}
        onToggle={() => toggle('fonts')}
      >
        {FONT_GROUPS.map((group) => (
          <div key={group.id} className="font-group">
            <h3 className="palette-group-title">{group.label}</h3>
            <div className="grid-2">
              {fontsInGroup(group.id).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`font-btn${fontId === f.id ? ' active' : ''}`}
                  style={{ fontFamily: f.cssFamily }}
                  onClick={() => {
                    onFontChange(f.id)
                    controller.setCurrentFont(f.id)
                  }}
                >
                  {f.sample} {f.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </AccordionSection>

      <AccordionSection
        title="配色模板"
        open={open.palettes}
        onToggle={() => toggle('palettes')}
      >
        {PALETTE_GROUPS.map((group) => (
          <div key={group.id} className="palette-group">
            <h3 className="palette-group-title">{group.label}</h3>
            <div className="palette-list">
              {palettesInGroup(group.id).map((p) => (
                <PaletteButton
                  key={p.id}
                  palette={p}
                  active={paletteId === p.id}
                  onPick={() => {
                    onPaletteChange(p.id)
                    controller.applyPalette(p)
                  }}
                />
              ))}
            </div>
          </div>
        ))}
        <p className="muted">形状 · 文字 · 强调；渐变应用到形状</p>
      </AccordionSection>
    </aside>
  )
}

function PaletteButton({
  palette: p,
  active,
  onPick,
}: {
  palette: Palette
  active: boolean
  onPick: () => void
}) {
  const isGrad = Boolean(p.gradient)
  return (
    <button
      type="button"
      className={`palette${active ? ' active' : ''}`}
      title={
        isGrad
          ? `${p.name}：渐变 ${p.shape} → ${p.accent}`
          : `${p.name}：形状 ${p.shape} / 文字 ${p.text} / 强调 ${p.accent}`
      }
      onClick={onPick}
    >
      <span className="palette-name">{p.name}</span>
      <span className="palette-combo" aria-hidden>
        {isGrad ? (
          <>
            <span className="swatch swatch-grad" style={{ background: palettePreviewCss(p) }} />
            <span className="swatch" style={{ background: p.text }} />
          </>
        ) : (
          <>
            <span className="swatch" style={{ background: p.shape }} />
            <span className="swatch" style={{ background: p.text }} />
            <span className="swatch" style={{ background: p.accent }} />
          </>
        )}
      </span>
    </button>
  )
}

function TemplateButtons({ text }: { text: string }) {
  const [templates, setTemplates] = useState<LetterTemplate[]>([])
  
  // 更新推荐模板
  const updateTemplates = () => {
    const recommended = controller.getRecommendedTemplates(text || 'Logo')
    setTemplates(recommended)
  }
  
  // 首次加载和文本变化时更新
  useState(() => {
    updateTemplates()
  })
  
  if (templates.length === 0) {
    updateTemplates()
  }
  
  const letterCount = (text || 'Logo').trim().length
  const countLabel = 
    letterCount === 1 ? '单字母' :
    letterCount === 2 ? '双字母' :
    letterCount === 3 ? '三字母' : '多字母'
  
  return (
    <div className="template-list">
      <div className="template-count-label">{countLabel}模板（{templates.length}）</div>
      <div className="grid-2">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            className="template-btn"
            title={template.description}
            onClick={() => controller.addLetterTemplate(template.id, text)}
          >
            <span className="template-name">{template.name}</span>
            <span className="template-desc muted">{template.description}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
