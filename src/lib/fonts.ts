import outfitWoff from '@fontsource/outfit/files/outfit-latin-700-normal.woff?url'
import bebasWoff from '@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff?url'
import montserratWoff from '@fontsource/montserrat/files/montserrat-latin-700-normal.woff?url'
import pacificoWoff from '@fontsource/pacifico/files/pacifico-latin-400-normal.woff?url'
import sourceSansWoff from '@fontsource/source-sans-3/files/source-sans-3-latin-600-normal.woff?url'
import spaceGroteskWoff from '@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff?url'
import playfairWoff from '@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff?url'
import oswaldWoff from '@fontsource/oswald/files/oswald-latin-700-normal.woff?url'
import righteousWoff from '@fontsource/righteous/files/righteous-latin-400-normal.woff?url'
import antonWoff from '@fontsource/anton/files/anton-latin-400-normal.woff?url'
import comfortaaWoff from '@fontsource/comfortaa/files/comfortaa-latin-700-normal.woff?url'
import lobsterWoff from '@fontsource/lobster/files/lobster-latin-400-normal.woff?url'
import rubikWoff from '@fontsource/rubik/files/rubik-latin-700-normal.woff?url'
import archivoBlackWoff from '@fontsource/archivo-black/files/archivo-black-latin-400-normal.woff?url'
import dmSerifWoff from '@fontsource/dm-serif-display/files/dm-serif-display-latin-400-normal.woff?url'
import poppinsWoff from '@fontsource/poppins/files/poppins-latin-700-normal.woff?url'
import ralewayWoff from '@fontsource/raleway/files/raleway-latin-700-normal.woff?url'
import josefinWoff from '@fontsource/josefin-sans/files/josefin-sans-latin-700-normal.woff?url'
import bangersWoff from '@fontsource/bangers/files/bangers-latin-400-normal.woff?url'
import kuaileWoff from '@fontsource/zcool-kuaile/files/zcool-kuaile-chinese-simplified-400-normal.woff?url'
import mashanWoff from '@fontsource/ma-shan-zheng/files/ma-shan-zheng-chinese-simplified-400-normal.woff?url'
import { parse as parseFont, Path as OpenPath } from 'opentype.js'
import type { Font } from 'opentype.js'

export type FontGroupId = 'latin' | 'chinese'

export type FontOption = {
  id: string
  label: string
  cssFamily: string
  fileUrl: string
  sample: string
  group: FontGroupId
}

export const FONT_GROUPS: { id: FontGroupId; label: string }[] = [
  { id: 'latin', label: '西文' },
  { id: 'chinese', label: '中文' },
]

export const FONT_OPTIONS: FontOption[] = [
  // 西文 · 无衬线 / 现代
  { id: 'outfit', label: 'Outfit', cssFamily: 'Outfit', fileUrl: outfitWoff, sample: 'Aa', group: 'latin' },
  { id: 'space', label: 'Space', cssFamily: 'Space Grotesk', fileUrl: spaceGroteskWoff, sample: 'Aa', group: 'latin' },
  { id: 'montserrat', label: 'Mont', cssFamily: 'Montserrat', fileUrl: montserratWoff, sample: 'Aa', group: 'latin' },
  { id: 'poppins', label: 'Poppins', cssFamily: 'Poppins', fileUrl: poppinsWoff, sample: 'Aa', group: 'latin' },
  { id: 'rubik', label: 'Rubik', cssFamily: 'Rubik', fileUrl: rubikWoff, sample: 'Aa', group: 'latin' },
  { id: 'raleway', label: 'Raleway', cssFamily: 'Raleway', fileUrl: ralewayWoff, sample: 'Aa', group: 'latin' },
  { id: 'josefin', label: 'Josefin', cssFamily: 'Josefin Sans', fileUrl: josefinWoff, sample: 'Aa', group: 'latin' },
  { id: 'source', label: 'Source', cssFamily: 'Source Sans 3', fileUrl: sourceSansWoff, sample: 'Aa', group: 'latin' },
  { id: 'comfortaa', label: 'Comfort', cssFamily: 'Comfortaa', fileUrl: comfortaaWoff, sample: 'Aa', group: 'latin' },
  // 西文 · 展示 / 标题
  { id: 'bebas', label: 'Bebas', cssFamily: 'Bebas Neue', fileUrl: bebasWoff, sample: 'Aa', group: 'latin' },
  { id: 'oswald', label: 'Oswald', cssFamily: 'Oswald', fileUrl: oswaldWoff, sample: 'Aa', group: 'latin' },
  { id: 'anton', label: 'Anton', cssFamily: 'Anton', fileUrl: antonWoff, sample: 'Aa', group: 'latin' },
  { id: 'archivo', label: 'Archivo', cssFamily: 'Archivo Black', fileUrl: archivoBlackWoff, sample: 'Aa', group: 'latin' },
  { id: 'righteous', label: 'Righteous', cssFamily: 'Righteous', fileUrl: righteousWoff, sample: 'Aa', group: 'latin' },
  { id: 'bangers', label: 'Bangers', cssFamily: 'Bangers', fileUrl: bangersWoff, sample: 'Aa', group: 'latin' },
  // 西文 · 衬线 / 手写
  { id: 'playfair', label: 'Playfair', cssFamily: 'Playfair Display', fileUrl: playfairWoff, sample: 'Aa', group: 'latin' },
  { id: 'dmserif', label: 'DM Serif', cssFamily: 'DM Serif Display', fileUrl: dmSerifWoff, sample: 'Aa', group: 'latin' },
  { id: 'pacifico', label: 'Pacifico', cssFamily: 'Pacifico', fileUrl: pacificoWoff, sample: 'Aa', group: 'latin' },
  { id: 'lobster', label: 'Lobster', cssFamily: 'Lobster', fileUrl: lobsterWoff, sample: 'Aa', group: 'latin' },
  // 中文
  {
    id: 'noto',
    label: '思源黑',
    cssFamily: 'Noto Sans SC',
    fileUrl: '/fonts/NotoSansSC-Regular.otf',
    sample: '中',
    group: 'chinese',
  },
  {
    id: 'xiaowei',
    label: '小薇',
    cssFamily: 'ZCOOL XiaoWei',
    fileUrl: '/fonts/ZCOOLXiaoWei-Regular.ttf',
    sample: '字',
    group: 'chinese',
  },
  {
    id: 'kuaile',
    label: '快乐',
    cssFamily: 'ZCOOL KuaiLe',
    fileUrl: kuaileWoff,
    sample: '乐',
    group: 'chinese',
  },
  {
    id: 'mashan',
    label: '马善政',
    cssFamily: 'Ma Shan Zheng',
    fileUrl: mashanWoff,
    sample: '书',
    group: 'chinese',
  },
]

export function fontsInGroup(group: FontGroupId): FontOption[] {
  return FONT_OPTIONS.filter((f) => f.group === group)
}

const cache = new Map<string, Promise<Font>>()

export function loadOpentypeFont(option: FontOption): Promise<Font> {
  const existing = cache.get(option.id)
  if (existing) return existing
  const promise = fetch(option.fileUrl)
    .then((r) => {
      if (!r.ok) throw new Error(`字体加载失败: ${option.label}`)
      return r.arrayBuffer()
    })
    .then((buf) => parseFont(buf))
  cache.set(option.id, promise)
  return promise
}

export function getFontOption(id: string): FontOption {
  return FONT_OPTIONS.find((f) => f.id === id) ?? FONT_OPTIONS[0]
}

/** Build glyph outlines without OpenType GSUB (avoids unsupported lookup throws). */
function layoutPath(font: Font, text: string, x: number, y: number, fontSize: number) {
  const path = new OpenPath()
  const scale = (1 / font.unitsPerEm) * fontSize
  let cursor = x
  for (const char of text) {
    const glyph = font.charToGlyph(char)
    path.extend(glyph.getPath(cursor, y, fontSize))
    cursor += (glyph.advanceWidth ?? 0) * scale
  }
  return path
}

/** 相对 baseline=0 的实际字形墨水盒（canvas 坐标，y 向下） */
export function measureGlyphInk(font: Font, text: string, fontSize: number) {
  const path = layoutPath(font, text || ' ', 0, 0, fontSize)
  const bbox = path.getBoundingBox()
  const width = Math.max(1, bbox.x2 - bbox.x1)
  const height = Math.max(1, bbox.y2 - bbox.y1)
  return {
    x1: bbox.x1,
    y1: bbox.y1,
    x2: bbox.x2,
    y2: bbox.y2,
    width,
    height,
  }
}

/**
 * 把 opentype 墨水盒换成 Fabric Text 的行高参数，使选框贴合实际字形。
 * Fabric 基线在局部坐标：height * (0.5 - _fontSizeFraction)
 */
export function fabricTextMetricsFromInk(y1: number, y2: number, fontSize: number) {
  const inkH = Math.max(1, y2 - y1)
  const fs = Math.max(1e-6, fontSize)
  return {
    _fontSizeMult: Math.max(0.35, Math.min(3, inkH / fs)),
    _fontSizeFraction: Math.max(-0.5, Math.min(1.5, y2 / inkH)),
  }
}

export async function textToPathData(
  text: string,
  fontId: string,
  fontSize: number,
): Promise<{ pathData: string; width: number; height: number }> {
  const option = getFontOption(fontId)
  const font = await loadOpentypeFont(option)
  const content = text || ' '
  const ink = measureGlyphInk(font, content, fontSize)
  const shifted = layoutPath(font, content, -ink.x1, -ink.y1, fontSize)
  // 原始字体轮廓锚点疏密不均；交给调用方 prepareEditablePathData 再补点
  return {
    pathData: shifted.toPathData(4),
    width: ink.width,
    height: ink.height,
  }
}
