/** Browser-side multi-size ICO encoder (PNG payloads). */

function writeU16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true)
}

function writeU32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true)
}

export function encodeIco(pngs: { size: number; data: ArrayBuffer }[]): Blob {
  const count = pngs.length
  const headerSize = 6 + count * 16
  let dataOffset = headerSize
  const offsets: number[] = []
  let total = headerSize

  for (const png of pngs) {
    offsets.push(dataOffset)
    dataOffset += png.data.byteLength
    total += png.data.byteLength
  }

  const buffer = new ArrayBuffer(total)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  writeU16(view, 0, 0)
  writeU16(view, 2, 1)
  writeU16(view, 4, count)

  for (let i = 0; i < count; i++) {
    const entry = 6 + i * 16
    const size = pngs[i].size
    bytes[entry] = size >= 256 ? 0 : size
    bytes[entry + 1] = size >= 256 ? 0 : size
    bytes[entry + 2] = 0
    bytes[entry + 3] = 0
    writeU16(view, entry + 4, 1)
    writeU16(view, entry + 6, 32)
    writeU32(view, entry + 8, pngs[i].data.byteLength)
    writeU32(view, entry + 12, offsets[i])
  }

  for (let i = 0; i < count; i++) {
    bytes.set(new Uint8Array(pngs[i].data), offsets[i])
  }

  return new Blob([buffer], { type: 'application/octet-stream' })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Delay revoke so the browser can start the download
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/**
 * 将 Fabric toSVG 结果整理为「图标用」方图 SVG：
 * - viewBox / width / height 统一为容器边长（原点在容器左上）
 * - 透明占位 rect：避免 Finder / 资源管理器按内容 bbox 裁切导致看起来不居中
 * - clipPath：裁掉容器外溢出（描边等）
 */
export function finalizeIconSvg(fabricSvg: string, left: number, top: number, side: number): string {
  const s = roundExport(side)
  const l = roundExport(left)
  const t = roundExport(top)

  const defsMatch = fabricSvg.match(/<defs[^>]*>[\s\S]*?<\/defs>/i)
  const defsInner = defsMatch
    ? defsMatch[0].replace(/^<defs[^>]*>/i, '').replace(/<\/defs>$/i, '')
    : ''

  let body = fabricSvg
  if (defsMatch) body = body.replace(defsMatch[0], '')
  body = body
    .replace(/^[\s\S]*?<svg[^>]*>/i, '')
    .replace(/<\/svg>\s*$/i, '')
    .trim()

  const clipId = 'logo-frame'
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">`,
    '<defs>',
    defsInner.trim(),
    `<clipPath id="${clipId}"><rect x="0" y="0" width="${s}" height="${s}"/></clipPath>`,
    '</defs>',
    // 强制缩略图使用完整画板（opacity=0 仍计入 bbox，fill=none 在部分查看器会被忽略）
    `<rect width="${s}" height="${s}" fill="#ffffff" opacity="0"/>`,
    `<g clip-path="url(#${clipId})" transform="translate(${-l} ${-t})">`,
    body,
    '</g>',
    '</svg>',
    '',
  ].join('\n')
}

function roundExport(n: number) {
  return Number(n.toFixed(3))
}

/** 常见网站图标尺寸：浏览器标签 / ICO / Apple / Android·PWA */
export const EXPORT_SIZES = [
  16, // 浏览器标签、书签
  32, // 高清标签、任务栏
  48, // Windows 快捷方式 / ICO
  64, // 高清任务栏
  96, // Android 旧版
  128, // Chrome Web Store 等
  180, // Apple Touch Icon
  192, // Android / PWA
  256, // Windows / ICO 上限常用
  512, // PWA 启动图 / 商店
] as const
export type ExportSize = (typeof EXPORT_SIZES)[number]
