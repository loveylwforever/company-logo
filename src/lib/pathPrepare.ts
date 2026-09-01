import { util } from 'fabric'
import {
  densifyPathCommands,
  pathCommandsToData,
  type DensifyOptions,
  type PathCmd,
} from './pathResample'

/**
 * 解析 SVG path → 简化为 M/L/C/Z → 按弧长/边长均匀补点。
 * 外形不变，只增加可编辑锚点。
 */
export function prepareEditablePathData(pathData: string, options?: DensifyOptions): string {
  const parsed = util.parsePath(pathData) as PathCmd[]
  const simple = util.makePathSimpler(parsed as never) as PathCmd[]
  const dense = densifyPathCommands(simple, options)
  return pathCommandsToData(dense)
}
