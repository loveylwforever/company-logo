import { Shadow, Gradient } from 'fabric'

export type LetterCount = '1' | '2' | '3' | 'multi'

export type LetterTemplateStyle = 
  | 'gradient-bold'
  | 'shadow-3d'
  | 'neon-glow'
  | 'minimal-flat'
  | 'embossed'
  | 'duo-tone'

export type LetterTemplate = {
  id: string
  name: string
  letterCount: LetterCount
  style: LetterTemplateStyle
  description: string
  applyStyle: (
    text: string, 
    fontId: string, 
    baseColor: string, 
    accentColor: string
  ) => Promise<Partial<{
    fill: string | Gradient<'linear' | 'radial'>
    stroke: string
    strokeWidth: number
    paintFirst: 'fill' | 'stroke'
    shadow: Shadow | null
  }>>
}

/** 创建渐变加粗风格 */
async function gradientBoldStyle(
  _text: string, 
  _fontId: string, 
  baseColor: string, 
  accentColor: string
) {
  return {
    fill: new Gradient({
      type: 'linear',
      gradientUnits: 'percentage',
      coords: { x1: 0.5, y1: 0, x2: 0.5, y2: 1 },
      colorStops: [
        { offset: 0, color: baseColor },
        { offset: 1, color: accentColor },
      ],
    }),
    shadow: new Shadow({
      color: 'rgba(0, 0, 0, 0.3)',
      blur: 8,
      offsetX: 0,
      offsetY: 4,
    }),
    strokeWidth: 0,
  }
}

/** 创建3D阴影风格 */
async function shadow3DStyle(
  _text: string,
  _fontId: string, 
  baseColor: string,
  accentColor: string
) {
  return {
    fill: baseColor,
    stroke: accentColor,
    strokeWidth: 3,
    paintFirst: 'stroke' as const,
    shadow: new Shadow({
      color: 'rgba(0, 0, 0, 0.5)',
      blur: 12,
      offsetX: 6,
      offsetY: 6,
    }),
  }
}

/** 创建霓虹发光风格 */
async function neonGlowStyle(
  _text: string,
  _fontId: string,
  baseColor: string,
  accentColor: string
) {
  return {
    fill: baseColor,
    stroke: accentColor,
    strokeWidth: 2,
    shadow: new Shadow({
      color: accentColor,
      blur: 20,
      offsetX: 0,
      offsetY: 0,
    }),
  }
}

/** 创建扁平简约风格 */
async function minimalFlatStyle(
  _text: string,
  _fontId: string,
  baseColor: string,
  _accentColor: string
) {
  return {
    fill: baseColor,
    strokeWidth: 0,
    shadow: new Shadow({
      color: 'rgba(0, 0, 0, 0.15)',
      blur: 6,
      offsetX: 0,
      offsetY: 2,
    }),
  }
}

/** 创建浮雕风格 */
async function embossedStyle(
  _text: string,
  _fontId: string,
  baseColor: string,
  accentColor: string
) {
  return {
    fill: new Gradient({
      type: 'linear',
      gradientUnits: 'percentage',
      coords: { x1: 0, y1: 0.5, x2: 1, y2: 0.5 },
      colorStops: [
        { offset: 0, color: accentColor },
        { offset: 0.5, color: baseColor },
        { offset: 1, color: accentColor },
      ],
    }),
    shadow: new Shadow({
      color: 'rgba(255, 255, 255, 0.6)',
      blur: 2,
      offsetX: -1,
      offsetY: -1,
    }),
  }
}

/** 创建双色调风格 */
async function duoToneStyle(
  _text: string,
  _fontId: string,
  baseColor: string,
  accentColor: string
) {
  return {
    fill: new Gradient({
      type: 'linear',
      gradientUnits: 'percentage',
      coords: { x1: 0.3, y1: 0.3, x2: 0.7, y2: 0.7 },
      colorStops: [
        { offset: 0, color: baseColor },
        { offset: 1, color: accentColor },
      ],
    }),
    stroke: baseColor,
    strokeWidth: 1,
    shadow: new Shadow({
      color: accentColor + '80',
      blur: 15,
      offsetX: 4,
      offsetY: 4,
    }),
  }
}

/** 所有字母模板定义 */
export const LETTER_TEMPLATES: LetterTemplate[] = [
  // 单字母模板
  {
    id: 'single-gradient-bold',
    name: '渐变加粗',
    letterCount: '1',
    style: 'gradient-bold',
    description: '纵向渐变 + 阴影，适合单字母商标',
    applyStyle: gradientBoldStyle,
  },
  {
    id: 'single-shadow-3d',
    name: '3D立体',
    letterCount: '1',
    style: 'shadow-3d',
    description: '描边 + 深度阴影，突出单字母',
    applyStyle: shadow3DStyle,
  },
  {
    id: 'single-neon-glow',
    name: '霓虹发光',
    letterCount: '1',
    style: 'neon-glow',
    description: '发光描边，科技感单字母',
    applyStyle: neonGlowStyle,
  },
  {
    id: 'single-minimal-flat',
    name: '扁平简约',
    letterCount: '1',
    style: 'minimal-flat',
    description: '纯色 + 轻微阴影，现代简洁',
    applyStyle: minimalFlatStyle,
  },

  // 双字母模板
  {
    id: 'double-gradient-bold',
    name: '渐变加粗',
    letterCount: '2',
    style: 'gradient-bold',
    description: '双字母渐变组合',
    applyStyle: gradientBoldStyle,
  },
  {
    id: 'double-embossed',
    name: '浮雕质感',
    letterCount: '2',
    style: 'embossed',
    description: '立体浮雕效果',
    applyStyle: embossedStyle,
  },
  {
    id: 'double-duo-tone',
    name: '双色调',
    letterCount: '2',
    style: 'duo-tone',
    description: '对角渐变 + 彩色阴影',
    applyStyle: duoToneStyle,
  },
  {
    id: 'double-minimal-flat',
    name: '扁平简约',
    letterCount: '2',
    style: 'minimal-flat',
    description: '清爽双字母',
    applyStyle: minimalFlatStyle,
  },

  // 三字母模板
  {
    id: 'triple-gradient-bold',
    name: '渐变加粗',
    letterCount: '3',
    style: 'gradient-bold',
    description: '三字母渐变排列',
    applyStyle: gradientBoldStyle,
  },
  {
    id: 'triple-shadow-3d',
    name: '3D立体',
    letterCount: '3',
    style: 'shadow-3d',
    description: '立体三字母',
    applyStyle: shadow3DStyle,
  },
  {
    id: 'triple-neon-glow',
    name: '霓虹发光',
    letterCount: '3',
    style: 'neon-glow',
    description: '发光三字母',
    applyStyle: neonGlowStyle,
  },
  {
    id: 'triple-duo-tone',
    name: '双色调',
    letterCount: '3',
    style: 'duo-tone',
    description: '双色三字母',
    applyStyle: duoToneStyle,
  },

  // 多字母模板
  {
    id: 'multi-minimal-flat',
    name: '扁平简约',
    letterCount: 'multi',
    style: 'minimal-flat',
    description: '适合完整品牌名',
    applyStyle: minimalFlatStyle,
  },
  {
    id: 'multi-gradient-bold',
    name: '渐变加粗',
    letterCount: 'multi',
    style: 'gradient-bold',
    description: '渐变品牌字',
    applyStyle: gradientBoldStyle,
  },
  {
    id: 'multi-shadow-3d',
    name: '3D立体',
    letterCount: 'multi',
    style: 'shadow-3d',
    description: '立体品牌字',
    applyStyle: shadow3DStyle,
  },
  {
    id: 'multi-embossed',
    name: '浮雕质感',
    letterCount: 'multi',
    style: 'embossed',
    description: '浮雕品牌字',
    applyStyle: embossedStyle,
  },
]

/** 根据字数推荐模板 */
export function templatesForLetterCount(text: string): LetterTemplate[] {
  const len = text.trim().length
  let count: LetterCount
  if (len === 1) count = '1'
  else if (len === 2) count = '2'
  else if (len === 3) count = '3'
  else count = 'multi'
  
  return LETTER_TEMPLATES.filter(t => t.letterCount === count)
}

/** 获取模板 */
export function getTemplate(id: string): LetterTemplate | undefined {
  return LETTER_TEMPLATES.find(t => t.id === id)
}
