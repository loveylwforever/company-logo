import type { Canvas as FabricCanvas } from 'fabric'

export type HistorySnapshot = string

export class HistoryStack {
  private undoStack: HistorySnapshot[] = []
  private redoStack: HistorySnapshot[] = []
  private locked = false

  get canUndo() {
    return this.undoStack.length > 1
  }

  get canRedo() {
    return this.redoStack.length > 0
  }

  reset(json: HistorySnapshot) {
    this.undoStack = [json]
    this.redoStack = []
  }

  push(json: HistorySnapshot) {
    if (this.locked) return
    const last = this.undoStack[this.undoStack.length - 1]
    if (last === json) return
    this.undoStack.push(json)
    if (this.undoStack.length > 40) this.undoStack.shift()
    this.redoStack = []
  }

  async undo(canvas: FabricCanvas) {
    if (!this.canUndo) return
    const current = this.undoStack.pop()!
    this.redoStack.push(current)
    const prev = this.undoStack[this.undoStack.length - 1]
    await this.restore(canvas, prev)
  }

  async redo(canvas: FabricCanvas) {
    if (!this.canRedo) return
    const next = this.redoStack.pop()!
    this.undoStack.push(next)
    await this.restore(canvas, next)
  }

  private async restore(canvas: FabricCanvas, json: HistorySnapshot) {
    this.locked = true
    try {
      await canvas.loadFromJSON(json)
      canvas.requestRenderAll()
    } finally {
      this.locked = false
    }
  }
}

export function serializeCanvas(canvas: FabricCanvas): HistorySnapshot {
  return JSON.stringify(canvas.toJSON())
}
