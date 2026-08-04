import { parseBackendDate } from "../../lib/format.ts"

export type UsageOperation = "upload" | "download"

export interface TimelineDatum {
  id: string
  timestamp: number
  requests: number
  bytes: number
  entityKey: string
  entityLabel: string
  apiKeyHint: string
  region: string
  firstAt: string
  lastAt: string
  operation: UsageOperation
  sourceCount: number
}

export const USAGE_OPERATIONS: UsageOperation[] = ["upload", "download"]
export const MAX_TIMELINE_GLYPHS = 3000
const OVERFLOW_ENTITY_KEY = "\u0000usage-overflow-entities"

function pickDateBoundary(left: string, right: string, boundary: "first" | "last"): string {
  const leftTime = parseBackendDate(left)?.getTime()
  const rightTime = parseBackendDate(right)?.getTime()
  if (leftTime == null) return right
  if (rightTime == null) return left
  return boundary === "first"
    ? leftTime <= rightTime ? left : right
    : leftTime >= rightTime ? left : right
}

export function compactTimelineData(rows: TimelineDatum[]): { data: TimelineDatum[]; aggregated: boolean } {
  if (rows.length <= MAX_TIMELINE_GLYPHS) return { data: rows, aggregated: false }

  const entityKeySet = new Set<string>()
  for (const row of rows) entityKeySet.add(row.entityKey)
  const entityKeys = [...entityKeySet].sort((a, b) => a.localeCompare(b, "zh-CN"))
  const maxEntities = Math.max(1, Math.floor(MAX_TIMELINE_GLYPHS / USAGE_OPERATIONS.length))
  const retainedEntityCount = Math.max(0, maxEntities - 1)
  const overflowEntityKeys = entityKeys.length > maxEntities
    ? new Set(entityKeys.slice(retainedEntityCount))
    : null
  const overflowEntityCount = overflowEntityKeys?.size ?? 0
  const normalizedRows = overflowEntityKeys
    ? rows.map((row) => overflowEntityKeys.has(row.entityKey)
      ? {
          ...row,
          entityKey: OVERFLOW_ENTITY_KEY,
          entityLabel: `其他 ${overflowEntityCount.toLocaleString("zh-CN")} 个实体`,
          apiKeyHint: "多个实体汇总",
        }
      : row)
    : rows

  const comboKeys = new Set<string>()
  const bounds = normalizedRows.reduce((current, row) => {
    comboKeys.add(`${row.entityKey}\u0000${row.operation}`)
    return {
      start: Math.min(current.start, row.timestamp),
      end: Math.max(current.end, row.timestamp),
    }
  }, { start: Number.POSITIVE_INFINITY, end: Number.NEGATIVE_INFINITY })
  const timeBucketCount = Math.max(1, Math.floor(MAX_TIMELINE_GLYPHS / Math.max(comboKeys.size, 1)))
  const span = Math.max(1, bounds.end - bounds.start + 1)
  const bucketWidth = span / timeBucketCount
  const grouped = new Map<string, TimelineDatum>()

  for (const row of normalizedRows) {
    const bucketIndex = Math.min(
      timeBucketCount - 1,
      Math.floor((row.timestamp - bounds.start) / bucketWidth),
    )
    const bucketStart = Math.floor(bounds.start + bucketIndex * bucketWidth)
    const key = `${bucketIndex}\u0000${row.entityKey}\u0000${row.operation}`
    const current = grouped.get(key)
    if (!current) {
      grouped.set(key, {
        ...row,
        id: `${bucketStart}:${row.entityKey}:${row.operation}`,
        timestamp: bucketStart,
      })
      continue
    }
    grouped.set(key, {
      ...current,
      requests: current.requests + row.requests,
      bytes: current.bytes + row.bytes,
      region: current.region === row.region ? current.region : "跨区域汇总",
      firstAt: pickDateBoundary(current.firstAt, row.firstAt, "first"),
      lastAt: pickDateBoundary(current.lastAt, row.lastAt, "last"),
      sourceCount: current.sourceCount + row.sourceCount,
    })
  }

  const data = [...grouped.values()].sort((left, right) => (
    left.timestamp - right.timestamp
      || left.entityLabel.localeCompare(right.entityLabel, "zh-CN")
      || left.entityKey.localeCompare(right.entityKey, "zh-CN")
      || left.operation.localeCompare(right.operation)
  ))
  return { data, aggregated: data.length < rows.length }
}
