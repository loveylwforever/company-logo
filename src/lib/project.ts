/** Versioned logo project document for file export/import and local autosave. */

export const PROJECT_FORMAT = 'company-logo-project' as const
export const PROJECT_VERSION = 1 as const
export const AUTOSAVE_KEY = 'company-logo:autosave:v1'

export type ProjectMeta = {
  name: string
  fontId: string
  paletteId: string
  containerSeq: number
}

export type ProjectViewport = {
  zoom: number
  vpt: number[]
}

export type LogoProject = {
  format: typeof PROJECT_FORMAT
  version: typeof PROJECT_VERSION
  exportedAt: string
  meta: ProjectMeta
  viewport: ProjectViewport
  /** Fabric canvas.toJSON() object */
  canvas: Record<string, unknown>
}

export type ProjectMetaInput = {
  name: string
  fontId: string
  paletteId: string
}

export function isLogoProject(value: unknown): value is LogoProject {
  if (!value || typeof value !== 'object') return false
  const p = value as Partial<LogoProject>
  if (p.format !== PROJECT_FORMAT) return false
  if (typeof p.version !== 'number' || p.version < 1 || p.version > PROJECT_VERSION) return false
  if (!p.meta || typeof p.meta !== 'object') return false
  if (typeof p.meta.name !== 'string') return false
  if (typeof p.meta.fontId !== 'string') return false
  if (typeof p.meta.paletteId !== 'string') return false
  if (typeof p.meta.containerSeq !== 'number' || !Number.isFinite(p.meta.containerSeq)) return false
  if (!p.viewport || typeof p.viewport !== 'object') return false
  if (typeof p.viewport.zoom !== 'number' || !Number.isFinite(p.viewport.zoom)) return false
  if (!Array.isArray(p.viewport.vpt) || p.viewport.vpt.length < 6) return false
  if (!p.canvas || typeof p.canvas !== 'object') return false
  return true
}

export function parseProjectJson(text: string): LogoProject {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('文件不是有效的 JSON')
  }
  if (!isLogoProject(data)) {
    throw new Error('不是本应用的工程文件，或版本不受支持')
  }
  return data
}

export function packProject(opts: {
  meta: ProjectMeta
  viewport: ProjectViewport
  canvas: Record<string, unknown>
}): LogoProject {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    exportedAt: new Date().toISOString(),
    meta: {
      name: opts.meta.name || 'Logo',
      fontId: opts.meta.fontId,
      paletteId: opts.meta.paletteId,
      containerSeq: Math.max(0, Math.floor(opts.meta.containerSeq)),
    },
    viewport: {
      zoom: opts.viewport.zoom,
      vpt: opts.viewport.vpt.slice(0, 6),
    },
    canvas: opts.canvas,
  }
}

export function projectFileName(name: string): string {
  const safe = (name || 'Logo')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 40) || 'Logo'
  const day = new Date().toISOString().slice(0, 10)
  return `logo-${safe}-${day}.logo.json`
}

export function readAutoSave(): LogoProject | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    if (!raw) return null
    return parseProjectJson(raw)
  } catch {
    return null
  }
}

export function writeAutoSave(project: LogoProject): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(project))
  } catch (err) {
    console.warn('autosave failed', err)
  }
}

export function clearAutoSave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY)
  } catch {
    /* ignore */
  }
}
