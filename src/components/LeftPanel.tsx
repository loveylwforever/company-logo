import { useState } from 'react'
import { SHAPE_META, type ShapeKind } from '../lib/shapes'
import { FONT_GROUPS, fontsInGroup } from '../lib/fonts'
import {
  PALETTE_GROUPS,
  palettesInGroup,
  palettePreviewCss,
  type Palette,
} from '../lib/palettes'
import { controller, CONTAINER_PRESETS } from '../lib/controller'
import { AccordionSection } from './AccordionSection'

type Props = {
  name: string
  onNameChange: (v: string) => void
  fontId: string
  onFontChange: (id: string) => void
  paletteId: string
  onPaletteChange: (id: string) => void
}

type SectionId = 'name' | 'container' | 'shapes' | 'fonts' | 'palettes'

const DEFAULT_OPEN: Record<SectionId, boolean> = {
  name: true,
  container: true,
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

export function LeftPanel({
  name,
  onNameChange,
  fontId,
  onFontChange,
  paletteId,
  onPaletteChange,
}: Props) {
  const [open, setOpen] = useState(DEFAULT_OPEN)
  const toggle = (id: SectionId) => {
    setOpen((prev) => ({ ...prev, [id]: !prev[id] }))
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
