/**
 * 路径锚点重采样（保持 G0 连续）：
 * 1. Q → C，统一为三次贝塞尔
 * 2. 每个子路径强制 Z，并把终点吸附到起点（避免 o/g 接缝被拉空）
 * 3. 近圆轮廓改为等角圆（用户要的「等圆均匀分散」）
 * 4. 其余长直/长曲按段长补点
 */

export type PathCmd = (string | number)[]

export type DensifyOptions = {
  maxSegLen?: number
  maxSplits?: number
  /** 近圆判定：最大径向偏差 / 半径，默认 8% */
  circleTolerance?: number
  /** 等分圆锚点数（三次弧段数），默认 8 */
  circleSegments?: number
}

type Pt = { x: number; y: number }

function dist(a: Pt, b: Pt) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function splitCubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): [Pt[], Pt[]] {
  const p01 = lerp(p0, p1, t)
  const p12 = lerp(p1, p2, t)
  const p23 = lerp(p2, p3, t)
  const p012 = lerp(p01, p12, t)
  const p123 = lerp(p12, p23, t)
  const p0123 = lerp(p012, p123, t)
  return [
    [p0, p01, p012, p0123],
    [p0123, p123, p23, p3],
  ]
}

function cubicPoint(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t
  const tt = t * t
  const uu = u * u
  return {
    x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
    y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y,
  }
}

function quadToCubic(p0: Pt, p1: Pt, p2: Pt): Pt[] {
  return [
    p0,
    { x: p0.x + (2 / 3) * (p1.x - p0.x), y: p0.y + (2 / 3) * (p1.y - p0.y) },
    { x: p2.x + (2 / 3) * (p1.x - p2.x), y: p2.y + (2 / 3) * (p1.y - p2.y) },
    p2,
  ]
}

function cubicLengthTable(p0: Pt, p1: Pt, p2: Pt, p3: Pt, samples = 24) {
  const ts: number[] = [0]
  const cum: number[] = [0]
  let prev = p0
  let total = 0
  for (let i = 1; i <= samples; i++) {
    const t = i / samples
    const p = cubicPoint(p0, p1, p2, p3, t)
    total += dist(prev, p)
    ts.push(t)
    cum.push(total)
    prev = p
  }
  return { ts, cum, total }
}

function tAtArcLength(ts: number[], cum: number[], target: number): number {
  if (target <= 0) return 0
  const total = cum[cum.length - 1]
  if (target >= total) return 1
  let i = 1
  while (i < cum.length && cum[i] < target) i++
  const c0 = cum[i - 1]
  const c1 = cum[i]
  const t0 = ts[i - 1]
  const t1 = ts[i]
  const u = c1 === c0 ? 0 : (target - c0) / (c1 - c0)
  return t0 + (t1 - t0) * u
}

function splitCubicByArcLength(
  p0: Pt,
  p1: Pt,
  p2: Pt,
  p3: Pt,
  maxSegLen: number,
  maxSplits: number,
): Pt[][] {
  const table = cubicLengthTable(p0, p1, p2, p3)
  if (table.total <= maxSegLen * 1.08) return [[p0, p1, p2, p3]]
  const n = Math.min(maxSplits, Math.max(2, Math.ceil(table.total / maxSegLen)))
  if (n <= 1) return [[p0, p1, p2, p3]]

  const out: Pt[][] = []
  let rest: Pt[] = [p0, p1, p2, p3]
  let restTable = table
  for (let remain = n; remain > 1; remain--) {
    const pieceLen = restTable.total / remain
    const t = Math.min(0.999, Math.max(0.001, tAtArcLength(restTable.ts, restTable.cum, pieceLen)))
    const [left, right] = splitCubic(rest[0], rest[1], rest[2], rest[3], t)
    out.push(left)
    rest = right
    restTable = cubicLengthTable(rest[0], rest[1], rest[2], rest[3])
  }
  out.push(rest)
  return out
}

function splitLine(a: Pt, b: Pt, maxSegLen: number, maxSplits: number): Pt[] {
  const len = dist(a, b)
  if (len <= maxSegLen * 1.08) return [a, b]
  const n = Math.min(maxSplits, Math.max(2, Math.ceil(len / maxSegLen)))
  const pts: Pt[] = [a]
  for (let i = 1; i < n; i++) pts.push(lerp(a, b, i / n))
  pts.push(b)
  return pts
}

function cmdPoint(cmd: PathCmd, i: number): Pt {
  return { x: Number(cmd[i]), y: Number(cmd[i + 1]) }
}

function boundsOfCommands(commands: PathCmd[]): { w: number; h: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const add = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  for (const cmd of commands) {
    const op = String(cmd[0])
    if (op === 'M' || op === 'L') add(Number(cmd[1]), Number(cmd[2]))
    else if (op === 'C') {
      add(Number(cmd[1]), Number(cmd[2]))
      add(Number(cmd[3]), Number(cmd[4]))
      add(Number(cmd[5]), Number(cmd[6]))
    } else if (op === 'Q') {
      add(Number(cmd[1]), Number(cmd[2]))
      add(Number(cmd[3]), Number(cmd[4]))
    }
  }
  if (!Number.isFinite(minX)) return { w: 100, h: 100 }
  return { w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) }
}

export function inferMaxSegLen(commands: PathCmd[]): number {
  const { w, h } = boundsOfCommands(commands)
  const side = Math.max(w, h)
  return Math.min(64, Math.max(14, side * 0.18))
}

/** 采样轮廓折线（含曲线） */
function sampleContourPoints(contour: PathCmd[], stepsPerCubic = 8): Pt[] {
  const pts: Pt[] = []
  let cx = 0
  let cy = 0
  for (const cmd of contour) {
    const op = String(cmd[0])
    if (op === 'M') {
      cx = Number(cmd[1])
      cy = Number(cmd[2])
      pts.push({ x: cx, y: cy })
    } else if (op === 'L') {
      cx = Number(cmd[1])
      cy = Number(cmd[2])
      pts.push({ x: cx, y: cy })
    } else if (op === 'C') {
      const p0 = { x: cx, y: cy }
      const p1 = cmdPoint(cmd, 1)
      const p2 = cmdPoint(cmd, 3)
      const p3 = cmdPoint(cmd, 5)
      for (let i = 1; i <= stepsPerCubic; i++) {
        pts.push(cubicPoint(p0, p1, p2, p3, i / stepsPerCubic))
      }
      cx = p3.x
      cy = p3.y
    } else if (op === 'Q') {
      const p0 = { x: cx, y: cy }
      const p1 = cmdPoint(cmd, 1)
      const p2 = cmdPoint(cmd, 3)
      const cub = quadToCubic(p0, p1, p2)
      for (let i = 1; i <= stepsPerCubic; i++) {
        pts.push(cubicPoint(cub[0], cub[1], cub[2], cub[3], i / stepsPerCubic))
      }
      cx = p2.x
      cy = p2.y
    }
  }
  return pts
}

function signedArea(pts: Pt[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

function fitCircle(pts: Pt[]): { cx: number; cy: number; r: number; maxErr: number } | null {
  if (pts.length < 6) return null
  let sx = 0
  let sy = 0
  for (const p of pts) {
    sx += p.x
    sy += p.y
  }
  const cx = sx / pts.length
  const cy = sy / pts.length
  const rs = pts.map((p) => dist(p, { x: cx, y: cy }))
  const r = rs.reduce((a, b) => a + b, 0) / rs.length
  if (r < 2) return null
  let maxErr = 0
  for (const ri of rs) maxErr = Math.max(maxErr, Math.abs(ri - r) / r)
  return { cx, cy, r, maxErr }
}

/**
 * 圆弧的三次贝塞尔近似。
 * 手柄长度 k = r·(4/3)·tan(Δ/4)；切向取角增大方向 (-sin, cos)。
 * k 随 Δ 带符号，逆时针/顺时针都正确——不要再乘 sign(Δ)，否则逆时针会塌进圆心。
 */
function circularArcCubic(cx: number, cy: number, r: number, a0: number, a1: number): Pt[] {
  const alpha = a1 - a0
  const ax = Math.cos(a0)
  const ay = Math.sin(a0)
  const bx = Math.cos(a1)
  const by = Math.sin(a1)
  const k = (4 / 3) * Math.tan(alpha / 4) * r
  const p0 = { x: cx + r * ax, y: cy + r * ay }
  const p3 = { x: cx + r * bx, y: cy + r * by }
  const p1 = { x: p0.x - k * ay, y: p0.y + k * ax }
  const p2 = { x: p3.x + k * by, y: p3.y - k * bx }
  return [p0, p1, p2, p3]
}

function buildEvenCircle(
  cx: number,
  cy: number,
  r: number,
  segments: number,
  clockwise: boolean,
  startAngle: number,
): PathCmd[] {
  const n = Math.max(4, segments)
  const dir = clockwise ? 1 : -1
  const out: PathCmd[] = []
  let start: Pt | null = null
  for (let i = 0; i < n; i++) {
    const a0 = startAngle + dir * ((2 * Math.PI * i) / n)
    const a1 = startAngle + dir * ((2 * Math.PI * (i + 1)) / n)
    const [p0, p1, p2, p3] = circularArcCubic(cx, cy, r, a0, a1)
    if (i === 0) {
      start = p0
      out.push(['M', p0.x, p0.y])
    }
    // 末段终点强制回到 M，避免 θ+2π 浮点漂移在 3 点钟拉开接缝
    if (i === n - 1 && start) {
      out.push(['C', p1.x, p1.y, p2.x, p2.y, start.x, start.y])
    } else {
      out.push(['C', p1.x, p1.y, p2.x, p2.y, p3.x, p3.y])
    }
  }
  out.push(['Z'])
  return out
}

function snapLastEndpoint(cmds: PathCmd[], x: number, y: number) {
  for (let i = cmds.length - 1; i >= 0; i--) {
    const op = String(cmds[i][0])
    if (op === 'L') {
      cmds[i][1] = x
      cmds[i][2] = y
      return
    }
    if (op === 'C') {
      cmds[i][5] = x
      cmds[i][6] = y
      return
    }
    if (op === 'Q') {
      cmds[i][3] = x
      cmds[i][4] = y
      return
    }
    if (op === 'M') return
  }
}

/** Q→C，并给每个子路径补 Z + 终点吸附 */
export function normalizePathCommands(commands: PathCmd[]): PathCmd[] {
  const out: PathCmd[] = []
  let cx = 0
  let cy = 0
  let startX = 0
  let startY = 0
  let hasOpen = false

  const closeIfNeeded = () => {
    if (!hasOpen) return
    const gap = dist({ x: cx, y: cy }, { x: startX, y: startY })
    if (gap > 1e-4) snapLastEndpoint(out, startX, startY)
    out.push(['Z'])
    cx = startX
    cy = startY
    hasOpen = false
  }

  for (const cmd of commands) {
    const op = String(cmd[0])
    if (op === 'M') {
      closeIfNeeded()
      cx = Number(cmd[1])
      cy = Number(cmd[2])
      startX = cx
      startY = cy
      out.push(['M', cx, cy])
      hasOpen = true
      continue
    }
    if (op === 'L') {
      cx = Number(cmd[1])
      cy = Number(cmd[2])
      out.push(['L', cx, cy])
      continue
    }
    if (op === 'Q') {
      const p0 = { x: cx, y: cy }
      const p1 = cmdPoint(cmd, 1)
      const p2 = cmdPoint(cmd, 3)
      const c = quadToCubic(p0, p1, p2)
      out.push(['C', c[1].x, c[1].y, c[2].x, c[2].y, c[3].x, c[3].y])
      cx = p2.x
      cy = p2.y
      continue
    }
    if (op === 'C') {
      cx = Number(cmd[5])
      cy = Number(cmd[6])
      out.push(['C', Number(cmd[1]), Number(cmd[2]), Number(cmd[3]), Number(cmd[4]), cx, cy])
      continue
    }
    if (op === 'Z' || op === 'z') {
      if (hasOpen) {
        const gap = dist({ x: cx, y: cy }, { x: startX, y: startY })
        if (gap > 1e-4) snapLastEndpoint(out, startX, startY)
        out.push(['Z'])
        cx = startX
        cy = startY
        hasOpen = false
      }
      continue
    }
    out.push(cmd.slice() as PathCmd)
  }
  closeIfNeeded()
  return out
}

function densifyCubicContour(
  contour: PathCmd[],
  maxSegLen: number,
  maxSplits: number,
): PathCmd[] {
  const out: PathCmd[] = []
  let cx = 0
  let cy = 0
  let startX = 0
  let startY = 0

  for (const cmd of contour) {
    const op = String(cmd[0])
    if (op === 'M') {
      cx = Number(cmd[1])
      cy = Number(cmd[2])
      startX = cx
      startY = cy
      out.push(['M', cx, cy])
      continue
    }
    if (op === 'L') {
      const end = { x: Number(cmd[1]), y: Number(cmd[2]) }
      const pts = splitLine({ x: cx, y: cy }, end, maxSegLen, maxSplits)
      for (let i = 1; i < pts.length; i++) out.push(['L', pts[i].x, pts[i].y])
      cx = end.x
      cy = end.y
      continue
    }
    if (op === 'C') {
      const p0 = { x: cx, y: cy }
      const p1 = cmdPoint(cmd, 1)
      const p2 = cmdPoint(cmd, 3)
      const p3 = cmdPoint(cmd, 5)
      const parts = splitCubicByArcLength(p0, p1, p2, p3, maxSegLen, maxSplits)
      let from = p0
      for (const part of parts) {
        part[0] = from
        out.push(['C', part[1].x, part[1].y, part[2].x, part[2].y, part[3].x, part[3].y])
        from = part[3]
      }
      cx = p3.x
      cy = p3.y
      continue
    }
    if (op === 'Z' || op === 'z') {
      snapLastEndpoint(out, startX, startY)
      out.push(['Z'])
      cx = startX
      cy = startY
      continue
    }
    out.push(cmd.slice() as PathCmd)
  }
  return out
}

function splitIntoContours(commands: PathCmd[]): PathCmd[][] {
  const contours: PathCmd[][] = []
  let cur: PathCmd[] = []
  for (const cmd of commands) {
    const op = String(cmd[0])
    if (op === 'M') {
      if (cur.length) contours.push(cur)
      cur = [cmd.slice() as PathCmd]
    } else {
      cur.push(cmd.slice() as PathCmd)
    }
  }
  if (cur.length) contours.push(cur)
  return contours
}

/**
 * 主入口：归一化 → 近圆等分替换 → 其余补点
 */
export function densifyPathCommands(
  commands: PathCmd[],
  options: DensifyOptions = {},
): PathCmd[] {
  if (!commands.length) return commands
  const normalized = normalizePathCommands(commands)
  const maxSegLen = options.maxSegLen ?? inferMaxSegLen(normalized)
  const maxSplits = options.maxSplits ?? 6
  const circleTol = options.circleTolerance ?? 0.08
  const circleSegs = options.circleSegments ?? 8

  const out: PathCmd[] = []
  for (const contour of splitIntoContours(normalized)) {
    const samples = sampleContourPoints(contour)
    const area = signedArea(samples)
    const fit = fitCircle(samples)
    if (fit && fit.maxErr <= circleTol) {
      // 从原起点极角开始，保持绕向（字体外轮廓/字腔相反）
      const start = samples[0] ?? { x: fit.cx + fit.r, y: fit.cy }
      const startAngle = Math.atan2(start.y - fit.cy, start.x - fit.cx)
      const clockwise = area > 0 // canvas y 向下时，面积>0 多为顺时针视觉
      out.push(...buildEvenCircle(fit.cx, fit.cy, fit.r, circleSegs, clockwise, startAngle))
      continue
    }
    out.push(...densifyCubicContour(contour, maxSegLen, maxSplits))
  }
  return out
}

export function pathCommandsToData(commands: PathCmd[]): string {
  const snapped: PathCmd[] = []
  let cx = 0
  let cy = 0
  const q = (n: number) => Number(n.toFixed(4))

  for (const cmd of commands) {
    const op = String(cmd[0])
    if (op === 'Z' || op === 'z') {
      snapped.push(['Z'])
      continue
    }
    if (op === 'M') {
      cx = q(Number(cmd[1]))
      cy = q(Number(cmd[2]))
      snapped.push(['M', cx, cy])
      continue
    }
    if (op === 'L') {
      cx = q(Number(cmd[1]))
      cy = q(Number(cmd[2]))
      snapped.push(['L', cx, cy])
      continue
    }
    if (op === 'C') {
      const x1 = q(Number(cmd[1]))
      const y1 = q(Number(cmd[2]))
      const x2 = q(Number(cmd[3]))
      const y2 = q(Number(cmd[4]))
      cx = q(Number(cmd[5]))
      cy = q(Number(cmd[6]))
      snapped.push(['C', x1, y1, x2, y2, cx, cy])
      continue
    }
    if (op === 'Q') {
      const x1 = q(Number(cmd[1]))
      const y1 = q(Number(cmd[2]))
      cx = q(Number(cmd[3]))
      cy = q(Number(cmd[4]))
      snapped.push(['Q', x1, y1, cx, cy])
      continue
    }
    snapped.push(cmd.slice() as PathCmd)
  }

  return snapped
    .map((cmd) => {
      const op = String(cmd[0])
      if (op === 'Z' || op === 'z') return 'Z'
      return `${op} ${cmd.slice(1).join(' ')}`
    })
    .join(' ')
}
