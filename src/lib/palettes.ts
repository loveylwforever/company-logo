/** 形状底色 + 文字色 + 强调色；可选渐变填充 */

export type PaletteGroupId = 'popular' | 'guofeng' | 'gradient'

export type PaletteGradient = {
  mode: 'linear' | 'radial'
  c1: string
  c2: string
  angle?: number
}

export type Palette = {
  id: string
  name: string
  group: PaletteGroupId
  /** 形状/外框填充色（渐变时为起点色） */
  shape: string
  /** 叠在形状上的文字色 */
  text: string
  /** 多层叠加时次要形状色（渐变时为终点色） */
  accent: string
  gradient?: PaletteGradient
}

export const PALETTE_GROUPS: { id: PaletteGroupId; label: string }[] = [
  { id: 'popular', label: '流行' },
  { id: 'guofeng', label: '国风' },
  { id: 'gradient', label: '渐变' },
]

function textOn(shape: string): string {
  const hex = shape.replace('#', '')
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luma > 0.55 ? '#171717' : '#ffffff'
}

function make(
  id: string,
  name: string,
  group: PaletteGroupId,
  shape: string,
  accent: string,
  text?: string,
): Palette {
  return { id, name, group, shape, accent, text: text ?? textOn(shape) }
}

function makeGrad(
  id: string,
  name: string,
  c1: string,
  c2: string,
  opts?: { text?: string; mode?: 'linear' | 'radial'; angle?: number },
): Palette {
  return {
    id,
    name,
    group: 'gradient',
    shape: c1,
    accent: c2,
    text: opts?.text ?? textOn(c1),
    gradient: {
      mode: opts?.mode ?? 'linear',
      c1,
      c2,
      angle: opts?.angle ?? 135,
    },
  }
}

/** 流行（英文名） */
const POPULAR: Palette[] = [
  make('monochrome', 'Mono', 'popular', '#171717', '#525252'),
  make('ocean', 'Ocean', 'popular', '#0284c7', '#06b6d4'),
  make('sunset', 'Sunset', 'popular', '#e11d48', '#f97316'),
  make('forest', 'Forest', 'popular', '#166534', '#22c55e'),
  make('cyberpunk', 'Neon', 'popular', '#db2777', '#8b5cf6'),
  make('luxury-gold', 'Gold', 'popular', '#b45309', '#d97706'),
  make('minimal-earth', 'Earth', 'popular', '#78716c', '#a8a29e'),
  make('ocean-light', 'Sky', 'popular', '#7dd3fc', '#0284c7', '#0c4a6e'),
  make('gold-light', 'Honey', 'popular', '#fde68a', '#d97706', '#78350f'),
  make('nord', 'Nord', 'popular', '#5e81ac', '#88c0d0', '#eceff4'),
  make('coral', 'Coral', 'popular', '#f43f5e', '#fb7185'),
  make('indigo', 'Indigo', 'popular', '#4f46e5', '#818cf8'),
  make('berry', 'Berry', 'popular', '#9f1239', '#e11d48'),
  make('sage', 'Sage', 'popular', '#4d7c5a', '#86a789'),
  make('clay', 'Clay', 'popular', '#c2410c', '#ea580c'),
  make('midnight', 'Midnight', 'popular', '#1e293b', '#334155', '#f8fafc'),
  make('lavender', 'Lavender', 'popular', '#7c3aed', '#a78bfa'),
  make('mint', 'Mint', 'popular', '#0d9488', '#2dd4bf'),
  make('slate', 'Slate', 'popular', '#475569', '#94a3b8'),
  make('amber', 'Amber', 'popular', '#d97706', '#fbbf24'),
  make('tech', 'Tech', 'popular', '#0ea5e9', '#38bdf8'),
  make('wine', 'Wine', 'popular', '#7f1d1d', '#b91c1c'),
  make('peach', 'Peach', 'popular', '#fdba74', '#fb923c', '#9a3412'),
  make('graphite', 'Graphite', 'popular', '#27272a', '#71717a'),
]

/** 国风（中文名） */
const GUOFENG: Palette[] = [
  make('ink', '墨绿', 'guofeng', '#0f6e56', '#134e4a'),
  make('paper', '宣纸', 'guofeng', '#f5f4f1', '#a8a29e', '#1a1a18'),
  make('zhusha', '朱砂', 'guofeng', '#c23a2b', '#e85d4c'),
  make('dailan', '黛蓝', 'guofeng', '#1a3a5c', '#3d5a80'),
  make('xuanqing', '玄青', 'guofeng', '#1c1c1c', '#3f3f3f', '#f5f0e6'),
  make('xiangye', '缃叶', 'guofeng', '#c9a227', '#e2c15a', '#3d2e0a'),
  make('ouhe', '藕荷', 'guofeng', '#c9a0b0', '#e8c4d0', '#4a2c3a'),
  make('yuebai', '月白', 'guofeng', '#e8eef2', '#b8c5ce', '#2c3e4a'),
  make('zhuqing', '竹青', 'guofeng', '#3a6b4a', '#6b9b78'),
  make('yanzhi', '胭脂', 'guofeng', '#9e2a2b', '#c44546'),
  make('qiuxiang', '秋香', 'guofeng', '#8a7a3d', '#b5a45c', '#2a2410'),
  make('qinghua', '青花', 'guofeng', '#1e4d8c', '#5b8ec9', '#f7f4ef'),
  make('hupo', '琥珀', 'guofeng', '#b56b2a', '#d4924a'),
  make('songyan', '松烟', 'guofeng', '#2b2b2b', '#5a5a5a', '#e8e4dc'),
  make('haitang', '海棠', 'guofeng', '#d4567a', '#e88aa3'),
  make('dianlan', '靛蓝', 'guofeng', '#1a3d6e', '#2f5f9e'),
  make('chijin', '赤金', 'guofeng', '#a67c2d', '#c9a04a', '#1a1208'),
  make('qingci', '青瓷', 'guofeng', '#6a9a8b', '#9bc4b5', '#1e332c'),
  make('tanxiang', '檀香', 'guofeng', '#8b6914', '#a8842e'),
  make('shuanghua', '霜华', 'guofeng', '#dfe6ea', '#aeb8c0', '#2a333a'),
  make('yingfen', '樱粉', 'guofeng', '#e8a0b0', '#f0c0cc', '#5c2a38'),
  make('mocha', '抹茶', 'guofeng', '#4a6b3a', '#7a9a5a'),
  make('yanhui', '烟灰', 'guofeng', '#6e6a64', '#9a958e', '#f4f1ea'),
  make('cinnabar', '丹青', 'guofeng', '#8b1e1e', '#1a3a5c', '#f5f0e6'),
]

/** 渐变模板（含墨色双色渐变，参考 Grok ink 135° 体系） */
const GRADIENTS: Palette[] = [
  makeGrad('g-ink-black', '墨黑', '#585858', '#000000', { text: '#ffffff', angle: 225 }),
  makeGrad('g-ink-brown', '赭石', '#AE8968', '#855C36', { text: '#ffffff', angle: 225 }),
  makeGrad('g-ink-red', '朱红', '#FF5667', '#E02135', { text: '#ffffff', angle: 225 }),
  makeGrad('g-ink-orange', '橙焰', '#FF8838', '#E05B00', { text: '#ffffff', angle: 225 }),
  makeGrad('g-ink-yellow', '金盏', '#FFAF38', '#E08600', { text: '#1a1208', angle: 225 }),
  makeGrad('g-ink-green', '翠羽', '#1CCF82', '#009957', { text: '#ffffff', angle: 225 }),
  makeGrad('g-ink-cyan', '青碧', '#58D3C5', '#00A592', { text: '#134e4a', angle: 225 }),
  makeGrad('g-ink-blue', '霁蓝', '#459FFE', '#0E74E0', { text: '#ffffff', angle: 225 }),
  makeGrad('g-ink-violet', '藤紫', '#B792FE', '#804EE0', { text: '#ffffff', angle: 225 }),
  makeGrad('g-ink-magenta', '洋红', '#FF77BE', '#E02A88', { text: '#ffffff', angle: 225 }),
  makeGrad('g-ink-gray', '银灰', '#A6A6A6', '#696969', { text: '#171717', angle: 225 }),
  makeGrad('g-sunset', '暮霞', '#e11d48', '#f97316', { text: '#ffffff', angle: 135 }),
  makeGrad('g-ocean', '沧海', '#0284c7', '#06b6d4', { text: '#ffffff', angle: 120 }),
  makeGrad('g-aurora', '极光', '#8b5cf6', '#22d3ee', { text: '#ffffff', angle: 140 }),
  makeGrad('g-mango', '芒果', '#f59e0b', '#ef4444', { text: '#ffffff', angle: 125 }),
  makeGrad('g-forest', '翠微', '#166534', '#4ade80', { text: '#ffffff', angle: 150 }),
  makeGrad('g-lavender', '雾紫', '#7c3aed', '#f0abfc', { text: '#ffffff', angle: 130 }),
  makeGrad('g-ink', '墨韵', '#0f172a', '#334155', { text: '#f8fafc', angle: 160 }),
  makeGrad('g-gold', '流金', '#b45309', '#fde68a', { text: '#1a1208', angle: 135 }),
  makeGrad('g-sakura', '桃霞', '#fb7185', '#fda4af', { text: '#881337', angle: 120 }),
  makeGrad('g-qingci', '天青', '#0d9488', '#99f6e4', { text: '#134e4a', angle: 145 }),
  makeGrad('g-nord', '北境', '#5e81ac', '#eceff4', { text: '#2e3440', angle: 135 }),
  makeGrad('g-ember', '余烬', '#7f1d1d', '#f97316', { text: '#ffffff', angle: 125 }),
  makeGrad('g-radial-bloom', '花芯', '#db2777', '#fce7f3', {
    text: '#831843',
    mode: 'radial',
  }),
  makeGrad('g-radial-sun', '旭日', '#fbbf24', '#fef3c7', {
    text: '#78350f',
    mode: 'radial',
  }),
]

export const PALETTES: Palette[] = [...POPULAR, ...GUOFENG, ...GRADIENTS]

export const DEFAULT_PALETTE_ID = 'ocean'

export function getPalette(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]
}

export function palettesInGroup(group: PaletteGroupId): Palette[] {
  return PALETTES.filter((p) => p.group === group)
}

export function palettePreviewCss(p: Palette): string {
  if (!p.gradient) return p.shape
  if (p.gradient.mode === 'radial') {
    return `radial-gradient(circle at 35% 35%, ${p.gradient.c1}, ${p.gradient.c2})`
  }
  return `linear-gradient(${p.gradient.angle ?? 135}deg, ${p.gradient.c1}, ${p.gradient.c2})`
}
