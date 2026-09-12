/**
 * 路径修正工具：自动拉直、对齐、圆弧平滑
 */
import type { PathCmd, Pt } from './pathSegment'
import { dist, pt, segmentStart } from './pathSegment'

/** 判断线段是否接近水平/垂直 */
export function isNearHorizontal(p0: Pt, p1: Pt, threshold = 8): boolean {
  return Math.abs(p1.y - p0.y) < threshold && Math.abs(p1.x - p0.x) > threshold
}

export function isNearVertical(p0: Pt, p1: Pt, threshold = 8): boolean {
  return Math.abs(p1.x - p0.x) < threshold && Math.abs(p1.y - p0.y) > threshold
}

/** 拉直接近水平/垂直的线段 */
export function straightenLine(p0: Pt, p1: Pt, threshold = 8): Pt {
  if (isNearHorizontal(p0, p1, threshold)) {
    return { x: p1.x, y: p0.y }
  }
  if (isNearVertical(p0, p1, threshold)) {
    return { x: p0.x, y: p1.y }
  }
  return p1
}

/** 对所有 L/M 命令应用自动拉直 */
export function autoStraightenPath(commands: PathCmd[], threshold = 8): PathCmd[] {
  const result: PathCmd[] = []
  
  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i]
    const op = String(cmd[0])
    
    if (op === 'L') {
      const p0 = segmentStart(commands, i)
      const p1 = pt(cmd, 1)
      const corrected = straightenLine(p0, p1, threshold)
      result.push(['L', corrected.x, corrected.y])
    } else if (op === 'H' || op === 'V') {
      // H/V 已经是水平/垂直，保持原样
      result.push([...cmd] as PathCmd)
    } else {
      result.push([...cmd] as PathCmd)
    }
  }
  
  return result
}

/** 检测并对齐锚点到附近的水平/垂直线 */
export function snapToGrid(commands: PathCmd[], gridSize = 10): PathCmd[] {
  const result: PathCmd[] = []
  
  const snap = (n: number) => Math.round(n / gridSize) * gridSize
  
  for (const cmd of commands) {
    const op = String(cmd[0])
    
    switch (op) {
      case 'M':
      case 'L':
        result.push([cmd[0], snap(Number(cmd[1])), snap(Number(cmd[2]))] as PathCmd)
        break
      case 'H':
        result.push([cmd[0], snap(Number(cmd[1]))] as PathCmd)
        break
      case 'V':
        result.push([cmd[0], snap(Number(cmd[1]))] as PathCmd)
        break
      case 'C':
        result.push([
          cmd[0],
          snap(Number(cmd[1])),
          snap(Number(cmd[2])),
          snap(Number(cmd[3])),
          snap(Number(cmd[4])),
          snap(Number(cmd[5])),
          snap(Number(cmd[6])),
        ] as PathCmd)
        break
      case 'Q':
        result.push([
          cmd[0],
          snap(Number(cmd[1])),
          snap(Number(cmd[2])),
          snap(Number(cmd[3])),
          snap(Number(cmd[4])),
        ] as PathCmd)
        break
      case 'S':
        result.push([
          cmd[0],
          snap(Number(cmd[1])),
          snap(Number(cmd[2])),
          snap(Number(cmd[3])),
          snap(Number(cmd[4])),
        ] as PathCmd)
        break
      case 'T':
        result.push([cmd[0], snap(Number(cmd[1])), snap(Number(cmd[2]))] as PathCmd)
        break
      default:
        result.push([...cmd] as PathCmd)
    }
  }
  
  return result
}

/** 平滑曲线：合并相邻的小角度转折为圆弧 */
export function smoothSharpCorners(commands: PathCmd[], _angleThreshold = 15): PathCmd[] {
  // 这个功能较复杂，当前版本先返回原样
  // 未来可以检测 L-L 转角，如果角度小，转换为 C 曲线
  return commands
}

/** 对齐锚点：将多个接近的锚点对齐到同一位置 */
export function alignNearbyAnchors(commands: PathCmd[], threshold = 5): PathCmd[] {
  const result: PathCmd[] = []
  const anchors: Array<{ x: number; y: number; indices: number[] }> = []
  
  // 收集所有锚点
  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i]
    const op = String(cmd[0])
    
    let x: number | undefined
    let y: number | undefined
    
    if (op === 'M' || op === 'L') {
      x = Number(cmd[1])
      y = Number(cmd[2])
    } else if (op === 'H') {
      x = Number(cmd[1])
      const prev = segmentStart(commands, i)
      y = prev.y
    } else if (op === 'V') {
      y = Number(cmd[1])
      const prev = segmentStart(commands, i)
      x = prev.x
    } else if (op === 'C') {
      x = Number(cmd[5])
      y = Number(cmd[6])
    } else if (op === 'Q' || op === 'S') {
      x = Number(cmd[3])
      y = Number(cmd[4])
    } else if (op === 'T') {
      x = Number(cmd[1])
      y = Number(cmd[2])
    }
    
    if (x !== undefined && y !== undefined) {
      // 查找附近的锚点组
      let found = false
      for (const group of anchors) {
        if (dist({ x, y }, { x: group.x, y: group.y }) < threshold) {
          group.indices.push(i)
          found = true
          break
        }
      }
      if (!found) {
        anchors.push({ x, y, indices: [i] })
      }
    }
  }
  
  // 对每组锚点取平均位置
  const aligned = new Map<number, Pt>()
  for (const group of anchors) {
    if (group.indices.length > 1) {
      const avgX = group.indices.reduce((sum, idx) => {
        const cmd = commands[idx]
        const op = String(cmd[0])
        if (op === 'M' || op === 'L') return sum + Number(cmd[1])
        if (op === 'H') return sum + Number(cmd[1])
        if (op === 'C') return sum + Number(cmd[5])
        if (op === 'Q' || op === 'S') return sum + Number(cmd[3])
        if (op === 'T') return sum + Number(cmd[1])
        return sum
      }, 0) / group.indices.length
      
      const avgY = group.indices.reduce((sum, idx) => {
        const cmd = commands[idx]
        const op = String(cmd[0])
        if (op === 'M' || op === 'L') return sum + Number(cmd[2])
        if (op === 'V') return sum + Number(cmd[1])
        if (op === 'C') return sum + Number(cmd[6])
        if (op === 'Q' || op === 'S') return sum + Number(cmd[4])
        if (op === 'T') return sum + Number(cmd[2])
        return sum
      }, 0) / group.indices.length
      
      for (const idx of group.indices) {
        aligned.set(idx, { x: avgX, y: avgY })
      }
    }
  }
  
  // 应用对齐
  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i]
    const op = String(cmd[0])
    const alignedPt = aligned.get(i)
    
    if (alignedPt && (op === 'M' || op === 'L')) {
      result.push([cmd[0], alignedPt.x, alignedPt.y] as PathCmd)
    } else if (alignedPt && op === 'H') {
      result.push(['H', alignedPt.x] as PathCmd)
    } else if (alignedPt && op === 'V') {
      result.push(['V', alignedPt.y] as PathCmd)
    } else if (alignedPt && op === 'C') {
      result.push([
        cmd[0],
        Number(cmd[1]),
        Number(cmd[2]),
        Number(cmd[3]),
        Number(cmd[4]),
        alignedPt.x,
        alignedPt.y,
      ] as PathCmd)
    } else if (alignedPt && (op === 'Q' || op === 'S')) {
      result.push([
        cmd[0],
        Number(cmd[1]),
        Number(cmd[2]),
        alignedPt.x,
        alignedPt.y,
      ] as PathCmd)
    } else if (alignedPt && op === 'T') {
      result.push([cmd[0], alignedPt.x, alignedPt.y] as PathCmd)
    } else {
      result.push([...cmd] as PathCmd)
    }
  }
  
  return result
}

/** 一键修正：组合拉直、网格吸附、锚点对齐 */
export function autoCorrectPath(
  commands: PathCmd[],
  options: {
    straighten?: boolean
    snapToGrid?: boolean
    gridSize?: number
    alignAnchors?: boolean
    threshold?: number
  } = {}
): PathCmd[] {
  let result = commands.map(c => [...c] as PathCmd)
  
  const {
    straighten = true,
    snapToGrid: snap = false,
    gridSize = 10,
    alignAnchors = true,
    threshold = 8,
  } = options
  
  if (straighten) {
    result = autoStraightenPath(result, threshold)
  }
  
  if (snap) {
    result = snapToGrid(result, gridSize)
  }
  
  if (alignAnchors) {
    result = alignNearbyAnchors(result, threshold)
  }
  
  return result
}
