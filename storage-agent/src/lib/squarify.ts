export interface SquarifyInput<T> {
  value: number
  data: T
}

export interface SquarifyRect<T> {
  x: number
  y: number
  width: number
  height: number
  data: T
}

function worstAspect(rowSum: number, rowMax: number, rowMin: number, side: number): number {
  if (rowSum <= 0 || side <= 0 || rowMin <= 0) return Number.POSITIVE_INFINITY
  const area = rowSum * rowSum
  const sideArea = side * side
  return Math.max((sideArea * rowMax) / area, area / (sideArea * rowMin))
}

function layoutRow<T>(
  row: Array<SquarifyInput<T>>,
  x: number,
  y: number,
  width: number,
  height: number,
  vertical: boolean,
): Array<SquarifyRect<T>> {
  const rowSum = row.reduce((sum, item) => sum + item.value, 0)
  if (rowSum <= 0) return []
  let cursor = vertical ? y : x
  return row.map((item) => {
    const share = item.value / rowSum
    if (vertical) {
      const itemHeight = height * share
      const rect = { x, y: cursor, width, height: itemHeight, data: item.data }
      cursor += itemHeight
      return rect
    }
    const itemWidth = width * share
    const rect = { x: cursor, y, width: itemWidth, height, data: item.data }
    cursor += itemWidth
    return rect
  })
}

function layout<T>(
  items: Array<SquarifyInput<T>>,
  x: number,
  y: number,
  width: number,
  height: number,
  remaining: number,
): Array<SquarifyRect<T>> {
  if (items.length === 0 || width <= 0 || height <= 0 || remaining <= 0) return []
  if (items.length === 1) {
    return [{ x, y, width, height, data: items[0].data }]
  }

  const vertical = width >= height
  const side = vertical ? height : width
  const row: Array<SquarifyInput<T>> = []
  let rowSum = 0
  let rowMax = 0
  let rowMin = Number.POSITIVE_INFINITY
  let taken = 0

  for (const item of items) {
    const nextSum = rowSum + item.value
    const nextMax = Math.max(rowMax, item.value)
    const nextMin = Math.min(rowMin, item.value)
    const currentWorst = row.length === 0
      ? Number.POSITIVE_INFINITY
      : worstAspect(rowSum, rowMax, rowMin, side)
    const nextWorst = worstAspect(nextSum, nextMax, nextMin, side)
    if (row.length === 0 || nextWorst <= currentWorst) {
      row.push(item)
      rowSum = nextSum
      rowMax = nextMax
      rowMin = nextMin
      taken += 1
      continue
    }
    break
  }

  const rowArea = (width * height) * (rowSum / remaining)
  const rest = items.slice(taken)
  const leftover = remaining - rowSum

  if (vertical) {
    const rowWidth = Math.min(width, rowArea / Math.max(height, 1))
    return [
      ...layoutRow(row, x, y, rowWidth, height, true),
      ...layout(rest, x + rowWidth, y, width - rowWidth, height, leftover),
    ]
  }
  const rowHeight = Math.min(height, rowArea / Math.max(width, 1))
  return [
    ...layoutRow(row, x, y, width, rowHeight, false),
    ...layout(rest, x, y + rowHeight, width, height - rowHeight, leftover),
  ]
}

function applyGap<T>(rects: Array<SquarifyRect<T>>, gap: number): Array<SquarifyRect<T>> {
  if (gap <= 0) return rects
  return rects.map((rect) => ({
    ...rect,
    x: rect.x + gap / 2,
    y: rect.y + gap / 2,
    width: Math.max(rect.width - gap, 0),
    height: Math.max(rect.height - gap, 0),
  }))
}

export function squarify<T>(
  items: Array<SquarifyInput<T>>,
  width: number,
  height: number,
  gap = 0,
): Array<SquarifyRect<T>> {
  const normalized = items
    .map((item) => ({ value: Math.max(item.value, 0), data: item.data }))
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value)
  const remaining = normalized.reduce((sum, item) => sum + item.value, 0)
  if (normalized.length === 0 || width <= 0 || height <= 0 || remaining <= 0) return []
  const area = width * height
  const scaled = normalized.map((item) => ({
    value: (item.value / remaining) * area,
    data: item.data,
  }))
  return applyGap(layout(scaled, 0, 0, width, height, area), gap)
}
