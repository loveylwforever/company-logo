/** 路径线段：直线 ↔ 曲线，以及对称弧度（弯曲） */

import type { PathCmd } from './pathResample'

export type { PathCmd }
export type Pt = { x: number; y: number }
export type PathPointRef = { cmdIndex: number; pointIndex: number }

export function pt(cmd: PathCmd, i: number): Pt {
  return { x: Number(cmd[i]), y: Number(cmd[i + 1]) }
}

export function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

export function dist(a: Pt, b: Pt) {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** 弦的左侧单位法向（画布 y 向下） */
export function chordNormal(a: Pt, b: Pt): Pt {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  return { x: -dy / len, y: dx / len }
}

/** 对称三次：两端点 + 弧度（沿法向偏移）→ 控制点 */
export function handlesFromBulge(p0: Pt, p3: Pt, bulge: number): [Pt, Pt] {
  const n = chordNormal(p0, p3)
  const a = lerp(p0, p3, 1 / 3)
  const b = lerp(p0, p3, 2 / 3)
  return [
    { x: a.x + n.x * bulge, y: a.y + n.y * bulge },
    { x: b.x + n.x * bulge, y: b.y + n.y * bulge },
  ]
}

/** 从现有控制点估对称弧度（投影到法向） */
export function bulgeFromHandles(p0: Pt, p1: Pt, p2: Pt, p3: Pt): number {
  const n = chordNormal(p0, p3)
  const a = lerp(p0, p3, 1 / 3)
  const b = lerp(p0, p3, 2 / 3)
  const b1 = (p1.x - a.x) * n.x + (p1.y - a.y) * n.y
  const b2 = (p2.x - b.x) * n.x + (p2.y - b.y) * n.y
  return (b1 + b2) / 2
}

export function cubicPoint(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  }
}

export function setCubicBulge(commands: PathCmd[], cmdIndex: number, p0: Pt, bulge: number) {
  const cmd = commands[cmdIndex]
  if (!cmd || String(cmd[0]) !== 'C') return
  const p3 = pt(cmd, 5)
  const [p1, p2] = handlesFromBulge(p0, p3, bulge)
  cmd[1] = p1.x
  cmd[2] = p1.y
  cmd[3] = p2.x
  cmd[4] = p2.y
}

/** 直线 → 近乎平直的三次（可再弯） */
export function lineToCurve(commands: PathCmd[]): PathCmd[] {
  const out: PathCmd[] = []
  let cx = 0
  let cy = 0
  for (const cmd of commands) {
    const op = String(cmd[0])
    if (op === 'M') {
      cx = Number(cmd[1])
      cy = Number(cmd[2])
      out.push(['M', cx, cy])
      continue
    }
    if (op === 'L') {
      const p0 = { x: cx, y: cy }
      const p3 = { x: Number(cmd[1]), y: Number(cmd[2]) }
      const [p1, p2] = handlesFromBulge(p0, p3, 0)
      out.push(['C', p1.x, p1.y, p2.x, p2.y, p3.x, p3.y])
      cx = p3.x
      cy = p3.y
      continue
    }
    if (op === 'C') {
      cx = Number(cmd[5])
      cy = Number(cmd[6])
      out.push(cmd.slice() as PathCmd)
      continue
    }
    if (op === 'Z' || op === 'z') {
      out.push(['Z'])
      continue
    }
    if (op === 'Q') {
      cx = Number(cmd[3])
      cy = Number(cmd[4])
    } else if (op === 'H') {
      cx = Number(cmd[1])
    } else if (op === 'V') {
      cy = Number(cmd[1])
    }
    out.push(cmd.slice() as PathCmd)
  }
  return out
}

/** 曲线 → 直线（丢掉控制柄） */
export function curveToLine(commands: PathCmd[]): PathCmd[] {
  const out: PathCmd[] = []
  let cx = 0
  let cy = 0
  for (const cmd of commands) {
    const op = String(cmd[0])
    if (op === 'M') {
      cx = Number(cmd[1])
      cy = Number(cmd[2])
      out.push(['M', cx, cy])
      continue
    }
    if (op === 'C') {
      cx = Number(cmd[5])
      cy = Number(cmd[6])
      out.push(['L', cx, cy])
      continue
    }
    if (op === 'Q') {
      cx = Number(cmd[3])
      cy = Number(cmd[4])
      out.push(['L', cx, cy])
      continue
    }
    if (op === 'L') {
      cx = Number(cmd[1])
      cy = Number(cmd[2])
      out.push(['L', cx, cy])
      continue
    }
    if (op === 'Z' || op === 'z') {
      out.push(['Z'])
      continue
    }
    if (op === 'H') {
      cx = Number(cmd[1])
      out.push(['L', cx, cy])
      continue
    }
    if (op === 'V') {
      cy = Number(cmd[1])
      out.push(['L', cx, cy])
      continue
    }
    out.push(cmd.slice() as PathCmd)
  }
  return out
}

export function pathHasCurves(commands: PathCmd[]): boolean {
  return commands.some((c) => {
    const op = String(c[0])
    return op === 'C' || op === 'Q' || op === 'S'
  })
}

function nudgeOutgoingHandle(commands: PathCmd[], fromIndex: number, dx: number, dy: number) {
  for (let i = fromIndex + 1; i < commands.length; i++) {
    const op = String(commands[i][0])
    if (op === 'M' || op === 'Z' || op === 'z') return
    if (op === 'C' || op === 'Q' || op === 'S') {
      commands[i][1] = Number(commands[i][1]) + dx
      commands[i][2] = Number(commands[i][2]) + dy
      return
    }
  }
}

/**
 * 按锚点 refs 平移贴附手柄（保持相对偏移）。
 * 须在端点坐标已写入 commands 之后调用。
 */
export function translateHandlesFromRefs(
  commands: PathCmd[],
  refs: PathPointRef[],
  dx: number,
  dy: number,
) {
  if ((dx === 0 && dy === 0) || !refs.length) return
  for (const ref of refs) {
    const cmd = commands[ref.cmdIndex]
    if (!cmd) continue
    const op = String(cmd[0])
    if (op === 'C' && ref.pointIndex === 5) {
      cmd[3] = Number(cmd[3]) + dx
      cmd[4] = Number(cmd[4]) + dy
      nudgeOutgoingHandle(commands, ref.cmdIndex, dx, dy)
    } else if (op === 'Q' && ref.pointIndex === 3) {
      cmd[1] = Number(cmd[1]) + dx
      cmd[2] = Number(cmd[2]) + dy
      nudgeOutgoingHandle(commands, ref.cmdIndex, dx, dy)
    } else if (op === 'M' || op === 'L' || op === 'T') {
      nudgeOutgoingHandle(commands, ref.cmdIndex, dx, dy)
    }
  }
}

/** 前进到某命令之前的当前笔位置 */
export function segmentStart(commands: PathCmd[], cmdIndex: number): Pt {
  let cx = 0
  let cy = 0
  let startX = 0
  let startY = 0
  for (let i = 0; i < cmdIndex; i++) {
    const cmd = commands[i]
    const op = String(cmd[0])
    if (op === 'M') {
      cx = Number(cmd[1])
      cy = Number(cmd[2])
      startX = cx
      startY = cy
    } else if (op === 'L' || op === 'T') {
      cx = Number(cmd[1])
      cy = Number(cmd[2])
    } else if (op === 'C') {
      cx = Number(cmd[5])
      cy = Number(cmd[6])
    } else if (op === 'Q' || op === 'S') {
      cx = Number(cmd[3])
      cy = Number(cmd[4])
    } else if (op === 'H') cx = Number(cmd[1])
    else if (op === 'V') cy = Number(cmd[1])
    else if (op === 'Z' || op === 'z') {
      cx = startX
      cy = startY
    }
  }
  return { x: cx, y: cy }
}
