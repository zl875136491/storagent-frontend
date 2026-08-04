import { AxisBottom, AxisLeft } from "@visx/axis"
import { GridColumns, GridRows } from "@visx/grid"
import { Group } from "@visx/group"
import { ParentSize } from "@visx/responsive"
import { scaleBand, scaleLinear, scaleSqrt, scaleTime } from "@visx/scale"
import { useEffect, useId, useMemo, useState } from "react"
import type { WheelEvent } from "react"

import type { UsagePoint, UsageTotals } from "../../api/client"
import { formatBytes, formatChartTime, formatDateTime, parseBackendDate } from "../../lib/format"
import {
  compactTimelineData,
  type TimelineDatum,
  type UsageOperation,
  USAGE_OPERATIONS as OPERATIONS,
} from "./UsageChartData.ts"

type Dimension = "app" | "api_key"
type TimeDomain = [number, number]

export interface RegionUsageRow extends UsageTotals {
  region: string
  shownName: string
}

interface TimelineHover {
  point: TimelineDatum
  left: number
  top: number
  width: number
  height: number
}

interface RegionHover {
  row: RegionUsageRow
  operation: UsageOperation
  left: number
  top: number
  width: number
  height: number
}

const UPLOAD_COLOR = "#10b981"
const DOWNLOAD_COLOR = "#3b82f6"
const ENTITY_COLORS_LIGHT = [
  "#0f766e",
  "#2563eb",
  "#d97706",
  "#db2777",
  "#7c3aed",
  "#0891b2",
  "#65a30d",
  "#dc2626",
  "#4f46e5",
  "#ea580c",
]
const ENTITY_COLORS_DARK = [
  "#2dd4bf",
  "#60a5fa",
  "#fbbf24",
  "#f472b6",
  "#a78bfa",
  "#22d3ee",
  "#a3e635",
  "#f87171",
  "#818cf8",
  "#fb923c",
]
const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat("zh-CN", {
  notation: "compact",
  maximumFractionDigits: 1,
})
const TRAY_PATH = "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
const UPLOAD_PATH = "M17 8l-5-5-5 5M12 3v12"
const DOWNLOAD_PATH = "M7 10l5 5 5-5M12 15V3"

function useDarkTheme(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"))

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDark(document.documentElement.classList.contains("dark"))
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  return dark
}

function formatCompactNumber(value: number): string {
  return COMPACT_NUMBER_FORMATTER.format(value)
}

function entityLabel(point: UsagePoint, dimension: Dimension): string {
  if (dimension === "app") {
    const shownName = point.app_shown_name || point.app_name
    return shownName === point.app_name ? shownName : `${shownName} · ${point.app_name}`
  }
  return `${point.api_key_hint || point.api_key_id.slice(0, 12)} · ${point.app_shown_name || point.app_name}`
}

function entityKey(point: UsagePoint, dimension: Dimension): string {
  return dimension === "app" ? point.app_name : point.api_key_id
}

function OperationGlyph({
  cx,
  cy,
  side,
  color,
  outline,
  operation,
  onEnter,
  onLeave,
}: {
  cx: number
  cy: number
  side: number
  color: string
  outline: string
  operation: UsageOperation
  onEnter: () => void
  onLeave: () => void
}) {
  const scale = side / 24
  const operationPath = operation === "upload" ? UPLOAD_PATH : DOWNLOAD_PATH
  const transform = `translate(${cx - side / 2} ${cy - side / 2}) scale(${scale})`

  return (
    <g
      aria-hidden="true"
      className="cursor-pointer"
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      <rect
        x={cx - Math.max(side, 18) / 2}
        y={cy - Math.max(side, 18) / 2}
        width={Math.max(side, 18)}
        height={Math.max(side, 18)}
        fill="transparent"
      />
      <g
        transform={transform}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="none"
      >
        <path
          d={`${TRAY_PATH} ${operationPath}`}
          stroke={outline}
          strokeWidth={4.2}
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={`${TRAY_PATH} ${operationPath}`}
          stroke={color}
          strokeWidth={1.9}
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </g>
  )
}

function OperationIcon({ operation, color }: { operation: UsageOperation; color: string }) {
  const operationPath = operation === "upload" ? UPLOAD_PATH : DOWNLOAD_PATH
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d={`${TRAY_PATH} ${operationPath}`}
        stroke={color}
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function TimelineTooltip({ hover, dimension }: { hover: TimelineHover; dimension: Dimension }) {
  const operationLabel = hover.point.operation === "upload" ? "上传" : "下载"
  const flip = hover.left > hover.width - 260

  return (
    <div
      className="pointer-events-none absolute z-20 min-w-[15rem] rounded-md border border-border bg-popover px-3.5 py-3 text-[11px] text-popover-foreground shadow-xl"
      style={{
        left: hover.left + (flip ? -12 : 12),
        top: Math.max(8, Math.min(hover.height - 166, hover.top - 44)),
        transform: flip ? "translateX(-100%)" : undefined,
      }}
      role="status"
    >
      <div className="text-xs font-semibold">{hover.point.entityLabel}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">
        {hover.point.sourceCount > 1
          ? `${formatChartTime(hover.point.firstAt)} 至 ${formatChartTime(hover.point.lastAt)}`
          : formatChartTime(new Date(hover.point.timestamp))}
        {` · ${hover.point.region}`}
        {hover.point.sourceCount > 1 ? ` · 合并 ${hover.point.sourceCount.toLocaleString("zh-CN")} 个数据点` : ""}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-6">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <OperationIcon operation={hover.point.operation} color="currentColor" />
          {operationLabel}请求
        </span>
        <strong className="font-semibold">{hover.point.requests.toLocaleString("zh-CN")} 次</strong>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-6">
        <span className="text-muted-foreground">传输量</span>
        <strong className="font-semibold">{formatBytes(hover.point.bytes)}</strong>
      </div>
      <div className="my-2.5 h-px bg-border" />
      <div className="text-[10px] text-muted-foreground">
        {dimension === "app" ? "范围" : "APIKey"} · {hover.point.apiKeyHint}
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        发生于 {formatDateTime(hover.point.firstAt)} 至 {formatDateTime(hover.point.lastAt)}
      </div>
    </div>
  )
}

function TimelineSvg({
  data,
  width,
  height,
  colorByEntity,
  dark,
  fullDomain,
  zoomDomain,
  onZoom,
  onHover,
}: {
  data: TimelineDatum[]
  width: number
  height: number
  colorByEntity: Map<string, string>
  dark: boolean
  fullDomain: TimeDomain
  zoomDomain: TimeDomain | null
  onZoom: (domain: TimeDomain | null) => void
  onHover: (hover: TimelineHover | null) => void
}) {
  const clipId = useId().replaceAll(":", "")
  const compact = width < 640
  const margin = { top: 18, right: compact ? 12 : 24, bottom: 40, left: compact ? 46 : 56 }
  const innerWidth = Math.max(0, width - margin.left - margin.right)
  const innerHeight = Math.max(0, height - margin.top - margin.bottom)
  const visibleDomain = zoomDomain ?? fullDomain
  const visibleData = data.filter((point) => point.timestamp >= visibleDomain[0] && point.timestamp <= visibleDomain[1])
  const maxRequests = visibleData.reduce((maximum, point) => Math.max(maximum, point.requests), 1)
  const byteLogBounds = data.reduce((bounds, point) => {
    if (point.bytes <= 0) return bounds
    const value = Math.log1p(point.bytes)
    return {
      minimum: Math.min(bounds.minimum, value),
      maximum: Math.max(bounds.maximum, value),
    }
  }, { minimum: Number.POSITIVE_INFINITY, maximum: Number.NEGATIVE_INFINITY })
  const minByteLog = Number.isFinite(byteLogBounds.minimum) ? byteLogBounds.minimum : 0
  const maxByteLog = Number.isFinite(byteLogBounds.maximum) ? byteLogBounds.maximum : 0
  const x = scaleTime<number>({
    domain: [new Date(visibleDomain[0]), new Date(visibleDomain[1])],
    range: [0, innerWidth],
  })
  const y = scaleLinear<number>({ domain: [0, maxRequests * 1.08], range: [innerHeight, 0], nice: true })
  const glyphSide = scaleSqrt<number>({
    domain: [minByteLog, Math.max(minByteLog + 1, maxByteLog)],
    range: [12, compact ? 28 : 34],
    clamp: true,
  })
  const entityOffsetByKey = new Map([...colorByEntity.keys()].map((key, index) => {
    const angle = index * 2.399963229728653
    const radius = index === 0 ? 0 : Math.min(4, 1.25 + Math.sqrt(index) * 0.6)
    return [key, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }]
  }))
  const foreground = dark ? "#f4f4f5" : "#27272a"
  const muted = dark ? "#a1a1aa" : "#71717a"
  const grid = dark ? "rgba(113,113,122,.22)" : "rgba(113,113,122,.16)"
  const glyphOutline = dark ? "#18181b" : "#ffffff"

  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    if (innerWidth <= 0) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const pointerX = event.clientX - bounds.left - margin.left
    if (pointerX < 0 || pointerX > innerWidth) return
    event.preventDefault()

    const [fullStart, fullEnd] = fullDomain
    const [currentStart, currentEnd] = visibleDomain
    const fullSpan = Math.max(1, fullEnd - fullStart)
    const currentSpan = Math.max(1, currentEnd - currentStart)
    const factor = event.deltaY > 0 ? 1.18 : 0.82
    const nextSpan = Math.min(fullSpan, Math.max(fullSpan / 240, currentSpan * factor))
    const anchor = Math.max(0, Math.min(1, pointerX / innerWidth))
    const anchorTime = currentStart + currentSpan * anchor
    let nextStart = anchorTime - nextSpan * anchor
    let nextEnd = nextStart + nextSpan

    if (nextStart < fullStart) {
      nextStart = fullStart
      nextEnd = fullStart + nextSpan
    }
    if (nextEnd > fullEnd) {
      nextEnd = fullEnd
      nextStart = fullEnd - nextSpan
    }
    onHover(null)
    onZoom(nextSpan >= fullSpan * 0.995 ? null : [nextStart, nextEnd])
  }

  if (innerWidth <= 0 || innerHeight <= 0) return null

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label="上传与下载请求时序图，图标大小代表传输量"
      onWheel={handleWheel}
    >
      <defs>
        <clipPath id={clipId}>
          <rect width={innerWidth} height={innerHeight} />
        </clipPath>
      </defs>
      <Group left={margin.left} top={margin.top}>
        <GridRows scale={y} width={innerWidth} stroke={grid} strokeDasharray="3 5" numTicks={5} />
        <GridColumns scale={x} height={innerHeight} stroke={grid} strokeDasharray="3 5" numTicks={compact ? 4 : 7} />
        <g clipPath={`url(#${clipId})`}>
          {visibleData.map((point, index) => {
            const entityOffset = entityOffsetByKey.get(point.entityKey) ?? { x: 0, y: 0 }
            const operationOffset = point.operation === "upload" ? -2 : 2
            const cx = x(new Date(point.timestamp)) + entityOffset.x + operationOffset
            const cy = y(point.requests) + entityOffset.y
            const side = point.bytes <= 0
              ? 12
              : maxByteLog - minByteLog <= Number.EPSILON
                ? compact ? 20 : 22
                : glyphSide(Math.log1p(point.bytes))
            const hover = () => onHover({
              point,
              left: margin.left + cx,
              top: margin.top + cy,
              width,
              height,
            })
            return (
              <OperationGlyph
                key={`${point.id}-${index}`}
                cx={cx}
                cy={cy}
                side={side}
                color={colorByEntity.get(point.entityKey) ?? foreground}
                outline={glyphOutline}
                operation={point.operation}
                onEnter={hover}
                onLeave={() => onHover(null)}
              />
            )
          })}
        </g>
        <AxisLeft
          scale={y}
          numTicks={5}
          tickFormat={(value) => formatCompactNumber(Number(value))}
          stroke="transparent"
          tickStroke="transparent"
          tickLabelProps={() => ({ fill: muted, fontSize: 10, textAnchor: "end", dx: -6, dy: 3 })}
          label="请求次数"
          labelProps={{ fill: muted, fontSize: 10, textAnchor: "middle" }}
        />
        <AxisBottom
          top={innerHeight}
          scale={x}
          numTicks={compact ? 4 : 7}
          tickFormat={(value) => formatChartTime(value instanceof Date ? value : new Date(Number(value)))}
          stroke={grid}
          tickStroke="transparent"
          tickLabelProps={() => ({ fill: muted, fontSize: 10, textAnchor: "middle", dy: 4 })}
        />
      </Group>
    </svg>
  )
}

export function UsageScatterChart({ points, dimension }: { points: UsagePoint[]; dimension: Dimension }) {
  const dark = useDarkTheme()
  const [hover, setHover] = useState<TimelineHover | null>(null)
  const [zoomState, setZoomState] = useState<{ source: TimeDomain; domain: TimeDomain } | null>(null)
  const { data, entities, colorByEntity, fullDomain, aggregated } = useMemo(() => {
    const rows: TimelineDatum[] = []

    for (const point of points) {
      const timestamp = parseBackendDate(point.period_start)?.getTime()
      if (!timestamp) continue
      const key = entityKey(point, dimension)
      const label = entityLabel(point, dimension)
      for (const operation of OPERATIONS) {
        const requests = point[`${operation}_requests`]
        if (requests <= 0) continue
        rows.push({
          id: `${timestamp}:${key}:${operation}`,
          timestamp,
          requests,
          bytes: point[`${operation}_bytes`],
          entityKey: key,
          entityLabel: label,
          apiKeyHint: point.api_key_hint || point.api_key_id.slice(0, 12),
          region: point.region,
          firstAt: point.first_at,
          lastAt: point.last_at,
          operation,
          sourceCount: 1,
        })
      }
    }

    const compacted = compactTimelineData(rows)
    const entityLabels = new Map<string, string>()
    for (const row of compacted.data) entityLabels.set(row.entityKey, row.entityLabel)
    const sortedEntities = [...entityLabels.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "zh-CN") || a.key.localeCompare(b.key))
    const labelCounts = new Map<string, number>()
    for (const entity of sortedEntities) {
      labelCounts.set(entity.label, (labelCounts.get(entity.label) ?? 0) + 1)
    }
    const colors = dark ? ENTITY_COLORS_DARK : ENTITY_COLORS_LIGHT
    const entityColors = new Map(sortedEntities.map((entity, index) => [entity.key, colors[index % colors.length]]))
    const timeBounds = compacted.data.reduce((bounds, row) => ({
      start: Math.min(bounds.start, row.timestamp),
      end: Math.max(bounds.end, row.timestamp),
    }), { start: Number.POSITIVE_INFINITY, end: Number.NEGATIVE_INFINITY })
    const rawStart = Number.isFinite(timeBounds.start) ? timeBounds.start : 0
    const rawEnd = Number.isFinite(timeBounds.end) ? timeBounds.end : 3600000
    const fullDomain: TimeDomain = rawEnd <= rawStart
      ? [rawStart - 1800000, rawStart + 1800000]
      : [
          rawStart - Math.max((rawEnd - rawStart) * 0.02, 60000),
          rawEnd + Math.max((rawEnd - rawStart) * 0.02, 60000),
        ]

    return {
      data: compacted.data,
      entities: sortedEntities.map((entity) => ({
        ...entity,
        label: (labelCounts.get(entity.label) ?? 0) > 1
          ? `${entity.label} · ${entity.key.slice(0, 8)}`
          : entity.label,
      })),
      colorByEntity: entityColors,
      fullDomain,
      aggregated: compacted.aggregated,
    }
  }, [dark, dimension, points])

  const zoomDomain = zoomState
    && zoomState.source[0] === fullDomain[0]
    && zoomState.source[1] === fullDomain[1]
    ? zoomState.domain
    : null
  const visibleHover = hover && data.includes(hover.point) ? hover : null

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-2 px-2 pb-2 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-5">
        <div className="flex min-w-0 items-center gap-4 overflow-x-auto pb-1 sm:flex-1 sm:pb-0">
          {entities.map((entity) => (
            <span key={entity.key} className="inline-flex max-w-48 shrink-0 items-center gap-1.5" title={entity.label}>
              <i
                className="h-2.5 w-1 shrink-0 rounded-[1px]"
                style={{ backgroundColor: colorByEntity.get(entity.key) }}
                aria-hidden
              />
              <span className="truncate">{entity.label}</span>
            </span>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-3 whitespace-nowrap">
          <span className="inline-flex items-center gap-1"><OperationIcon operation="upload" color="currentColor" />上传</span>
          <span className="inline-flex items-center gap-1"><OperationIcon operation="download" color="currentColor" />下载</span>
          <span className="text-muted-foreground/75">图标大小 = 传输量</span>
        </div>
      </div>
      {aggregated ? (
        <div className="shrink-0 px-2 pb-1 text-[10px] text-amber-700 dark:text-amber-400">
          数据量较大，已合并相邻时段
        </div>
      ) : null}
      <div className="relative min-h-[18rem] flex-1 overflow-hidden">
        <ParentSize debounceTime={80}>
          {({ width, height }) => (
            <TimelineSvg
              data={data}
              width={width}
              height={height}
              colorByEntity={colorByEntity}
              dark={dark}
              fullDomain={fullDomain}
              zoomDomain={zoomDomain}
              onZoom={(domain) => setZoomState(domain ? { source: fullDomain, domain } : null)}
              onHover={setHover}
            />
          )}
        </ParentSize>
        {visibleHover ? <TimelineTooltip hover={visibleHover} dimension={dimension} /> : null}
        {zoomDomain ? (
          <button
            type="button"
            className="absolute right-2 bottom-9 rounded-md border border-border bg-background/90 px-2 py-1 text-[10px] text-muted-foreground shadow-sm transition-colors hover:text-foreground"
            onClick={() => setZoomState(null)}
          >
            重置时间范围
          </button>
        ) : null}
      </div>
    </div>
  )
}

function RegionTooltip({ hover, metric }: { hover: RegionHover; metric: "bytes" | "requests" }) {
  const flip = hover.left > hover.width - 230
  const valueFor = (operation: UsageOperation) => metric === "bytes"
    ? formatBytes(hover.row[`${operation}_bytes`])
    : `${hover.row[`${operation}_requests`].toLocaleString("zh-CN")} 次`

  return (
    <div
      className="pointer-events-none absolute z-20 min-w-[12.5rem] rounded-md border border-border bg-popover px-3.5 py-3 text-[11px] text-popover-foreground shadow-xl"
      style={{
        left: hover.left + (flip ? -12 : 12),
        top: Math.max(8, Math.min(hover.height - 128, hover.top - 36)),
        transform: flip ? "translateX(-100%)" : undefined,
      }}
      role="status"
    >
      <div className="text-xs font-semibold">{hover.row.shownName}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{hover.row.region}</div>
      {OPERATIONS.map((operation) => (
        <div
          key={operation}
          className={`mt-2 flex items-center justify-between gap-6 ${hover.operation === operation ? "text-foreground" : "text-muted-foreground"}`}
        >
          <span className="flex items-center gap-1.5">
            <OperationIcon operation={operation} color={operation === "upload" ? UPLOAD_COLOR : DOWNLOAD_COLOR} />
            {operation === "upload" ? "上传" : "下载"}
          </span>
          <strong className="font-semibold">{valueFor(operation)}</strong>
        </div>
      ))}
    </div>
  )
}

function RegionSvg({
  rows,
  width,
  height,
  metric,
  dark,
  onHover,
}: {
  rows: RegionUsageRow[]
  width: number
  height: number
  metric: "bytes" | "requests"
  dark: boolean
  onHover: (hover: RegionHover | null) => void
}) {
  const compact = width < 430
  const margin = { top: 10, right: 18, bottom: 38, left: compact ? 64 : 86 }
  const innerWidth = Math.max(0, width - margin.left - margin.right)
  const innerHeight = Math.max(0, height - margin.top - margin.bottom)
  const isBytes = metric === "bytes"
  const maximum = rows.reduce((currentMaximum, row) => OPERATIONS.reduce(
    (operationMaximum, operation) => Math.max(
      operationMaximum,
      isBytes ? row[`${operation}_bytes`] : row[`${operation}_requests`],
    ),
    currentMaximum,
  ), 1)
  const regionScale = scaleBand<string>({
    domain: rows.map((row) => row.shownName),
    range: [0, innerHeight],
    padding: 0.28,
  })
  const operationScale = scaleBand<UsageOperation>({
    domain: OPERATIONS,
    range: [0, regionScale.bandwidth()],
    padding: 0.16,
  })
  const valueScale = scaleLinear<number>({ domain: [0, maximum], range: [0, innerWidth], nice: true })
  const foreground = dark ? "#f4f4f5" : "#27272a"
  const muted = dark ? "#a1a1aa" : "#71717a"
  const grid = dark ? "rgba(113,113,122,.20)" : "rgba(113,113,122,.14)"

  if (innerWidth <= 0 || innerHeight <= 0) return null

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label={`区域${isBytes ? "数据传输量" : "请求次数"}横向条形图`}
    >
      <Group left={margin.left} top={margin.top}>
        <GridColumns scale={valueScale} height={innerHeight} stroke={grid} strokeDasharray="3 5" numTicks={compact ? 3 : 5} />
        {rows.flatMap((row) => OPERATIONS.map((operation) => {
          const raw = isBytes ? row[`${operation}_bytes`] : row[`${operation}_requests`]
          const x = valueScale(raw)
          const barHeight = Math.min(18, operationScale.bandwidth())
          const y = (regionScale(row.shownName) ?? 0)
            + (operationScale(operation) ?? 0)
            + Math.max(0, (operationScale.bandwidth() - barHeight) / 2)
          const color = operation === "upload" ? UPLOAD_COLOR : DOWNLOAD_COLOR
          const hover = () => onHover({
            row,
            operation,
            left: margin.left + x,
            top: margin.top + y + barHeight / 2,
            width,
            height,
          })
          return (
            <rect
              key={`${row.region}-${operation}`}
              x={0}
              y={y}
              width={Math.max(raw > 0 ? 1 : 0, x)}
              height={barHeight}
              rx={3}
              fill={color}
              fillOpacity={isBytes ? 0.88 : 0.68}
              className="cursor-pointer transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none"
              tabIndex={0}
              role="img"
              aria-label={`${row.shownName}${operation === "upload" ? "上传" : "下载"}${isBytes ? formatBytes(raw) : `${raw} 次`}`}
              onPointerEnter={hover}
              onPointerLeave={() => onHover(null)}
              onFocus={hover}
              onBlur={() => onHover(null)}
            />
          )
        }))}
        <AxisLeft
          scale={regionScale}
          stroke="transparent"
          tickStroke="transparent"
          tickFormat={(value) => {
            const label = String(value)
            const limit = compact ? 6 : 9
            return label.length > limit ? `${label.slice(0, limit)}…` : label
          }}
          tickLabelProps={() => ({ fill: foreground, fontSize: 10, textAnchor: "end", dx: -7, dy: 3 })}
        />
        <AxisBottom
          top={innerHeight}
          scale={valueScale}
          numTicks={compact ? 3 : 5}
          tickFormat={(value) => isBytes ? formatBytes(Number(value)) : formatCompactNumber(Number(value))}
          stroke="transparent"
          tickStroke="transparent"
          tickLabelProps={() => ({ fill: muted, fontSize: 10, textAnchor: "middle", dy: 4 })}
        />
      </Group>
    </svg>
  )
}

function RegionPanel({ rows, metric, dark }: { rows: RegionUsageRow[]; metric: "bytes" | "requests"; dark: boolean }) {
  const [hover, setHover] = useState<RegionHover | null>(null)

  return (
    <div className="relative flex min-h-[15rem] min-w-0 flex-col md:min-h-0">
      <div className="shrink-0 px-3 pt-1 text-[10px] font-medium text-muted-foreground">
        {metric === "bytes" ? "数据传输量" : "请求次数"}
      </div>
      <div className="relative min-h-0 flex-1">
        <ParentSize debounceTime={80}>
          {({ width, height }) => (
            <RegionSvg
              rows={rows}
              width={width}
              height={height}
              metric={metric}
              dark={dark}
              onHover={setHover}
            />
          )}
        </ParentSize>
        {hover ? <RegionTooltip hover={hover} metric={metric} /> : null}
      </div>
    </div>
  )
}

export function RegionUsageChart({ rows }: { rows: RegionUsageRow[] }) {
  const dark = useDarkTheme()

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-center gap-5 pb-2 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><OperationIcon operation="upload" color={UPLOAD_COLOR} />上传</span>
        <span className="inline-flex items-center gap-1.5"><OperationIcon operation="download" color={DOWNLOAD_COLOR} />下载</span>
        <span className="text-muted-foreground/75">条形长度 = 使用量</span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-2 divide-y divide-border/60 md:grid-cols-2 md:grid-rows-1 md:divide-x md:divide-y-0">
        <RegionPanel rows={rows} metric="bytes" dark={dark} />
        <RegionPanel rows={rows} metric="requests" dark={dark} />
      </div>
    </div>
  )
}
