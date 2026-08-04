import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as echarts from "echarts"
import { zhCN } from "date-fns/locale"
import {
  CalendarDays,
  ChartScatter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MapPin,
  RefreshCw,
  TriangleAlert,
} from "lucide-react"
import type { DateRange } from "react-day-picker"
import { Navigate } from "react-router-dom"

import {
  fetchUsageAcrossRegionsApi,
  fetchUsageOptionsApi,
  type UsageEventItem,
  type UsageOptionsResponse,
  type UsagePoint,
  type UsageQueryResponse,
  type UsageRegionFailure,
  type UsageTotals,
} from "../../api/client"
import { showErrorToast } from "../../api/toast"
import { useAuth } from "../../auth/AuthContext"
import { Button } from "../../components/ui/button"
import { Calendar } from "../../components/ui/calendar"
import { Input } from "../../components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table"
import { formatBytes, formatChartTime, formatDateTime, parseBackendDate } from "../../lib/format"
import { cn } from "../../lib/utils"

type Dimension = "app" | "api_key"
type ViewMode = "chart" | "table"
type Interval = "hour" | "day"
type UsagePanel = "timeline" | "region"

const EMPTY_TOTALS: UsageTotals = {
  upload_requests: 0,
  upload_bytes: 0,
  download_requests: 0,
  download_bytes: 0,
}
const EVENT_PAGE_SIZE = 50
const DAY_MS = 86400000
const SELECT_CLASS =
  "h-9 min-w-0 rounded-md border border-input bg-background px-3 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"

function toShanghaiInput(date: Date): string {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16)
}

function shanghaiInputToIso(value: string): string | null {
  if (!value) return null
  const date = new Date(`${value}:00+08:00`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function inputDayToDate(value: string): Date | undefined {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number)
  if (!year || !month || !day) return undefined
  return new Date(year, month - 1, day, 12)
}

function dateToInputDay(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function replaceInputDay(value: string, date: Date, time: string): string {
  return `${dateToInputDay(date)}T${time || value.slice(11, 16) || "00:00"}`
}

function replaceInputTime(value: string, time: string): string {
  if (!time) return value
  return `${value.slice(0, 10)}T${time}`
}

function displayInputTime(value: string): string {
  return value ? value.replace("T", " ") : "请选择"
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

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

function useChart(): {
  containerRef: React.RefObject<HTMLDivElement | null>
  chartRef: React.MutableRefObject<echarts.EChartsType | null>
} {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<echarts.EChartsType | null>(null)
  useEffect(() => {
    if (!containerRef.current) return
    const chart = echarts.init(containerRef.current)
    chartRef.current = chart
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(containerRef.current)
    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [])
  return { containerRef, chartRef }
}

type UsageOperation = "upload" | "download"
type ScatterValue = [number, number, number, string, string, string, string, string, UsageOperation, string]

interface EntityScatterGroup {
  key: string
  label: string
  upload: ScatterValue[]
  download: ScatterValue[]
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

function formatCompactNumber(value: number): string {
  return COMPACT_NUMBER_FORMATTER.format(value)
}

function tooltipMetricRow(label: string, value: string, color?: string): string {
  const marker = color
    ? `<span style="display:inline-block;width:7px;height:7px;margin-right:7px;border-radius:50%;background:${color}"></span>`
    : ""
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:7px"><span style="color:var(--usage-tooltip-muted)">${marker}${escapeHtml(label)}</span><strong style="font-weight:600">${escapeHtml(value)}</strong></div>`
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

function aggregateChartPoints(points: UsagePoint[], dimension: Dimension): UsagePoint[] {
  const grouped = new Map<string, UsagePoint>()
  for (const point of points) {
    const entity = dimension === "app" ? point.app_name : point.api_key_id
    const key = `${point.period_start}\u0000${entity}`
    const current = grouped.get(key)
    if (!current) {
      grouped.set(key, {
        ...point,
        api_key_hint: dimension === "app" ? "APP 维度汇总" : point.api_key_hint,
      })
      continue
    }
    const firstAt = (parseBackendDate(current.first_at)?.getTime() ?? 0)
      <= (parseBackendDate(point.first_at)?.getTime() ?? 0)
      ? current.first_at
      : point.first_at
    const lastAt = (parseBackendDate(current.last_at)?.getTime() ?? 0)
      >= (parseBackendDate(point.last_at)?.getTime() ?? 0)
      ? current.last_at
      : point.last_at
    grouped.set(key, {
      ...current,
      region: current.region === point.region ? current.region : "跨区域汇总",
      first_at: firstAt,
      last_at: lastAt,
      upload_requests: current.upload_requests + point.upload_requests,
      upload_bytes: current.upload_bytes + point.upload_bytes,
      download_requests: current.download_requests + point.download_requests,
      download_bytes: current.download_bytes + point.download_bytes,
    })
  }
  return [...grouped.values()]
}

function UsageScatterChart({ points, dimension }: { points: UsagePoint[]; dimension: Dimension }) {
  const { containerRef, chartRef } = useChart()
  const dark = useDarkTheme()

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const foreground = dark ? "#f4f4f5" : "#27272a"
    const muted = dark ? "#a1a1aa" : "#71717a"
    const grid = dark ? "rgba(113,113,122,.22)" : "rgba(113,113,122,.16)"
    const fontFamily = getComputedStyle(document.body).fontFamily || "sans-serif"
    const groupMap = new Map<string, EntityScatterGroup>()
    let scatterPointCount = 0

    for (const point of points) {
      const timestamp = parseBackendDate(point.period_start)?.getTime()
      if (!timestamp) continue
      const key = entityKey(point, dimension)
      const label = entityLabel(point, dimension)
      const group = groupMap.get(key) ?? { key, label, upload: [], download: [] }
      for (const operation of ["upload", "download"] as const) {
        const requests = point[`${operation}_requests`]
        if (requests <= 0) continue
        const bytes = point[`${operation}_bytes`]
        group[operation].push([
          timestamp,
          requests,
          bytes,
          label,
          point.api_key_hint || point.api_key_id.slice(0, 12),
          point.region,
          point.first_at,
          point.last_at,
          operation,
          key,
        ])
        scatterPointCount += 1
      }
      groupMap.set(key, group)
    }

    const groups = [...groupMap.values()]
      .filter((group) => group.upload.length > 0 || group.download.length > 0)
      .sort((a, b) => a.label.localeCompare(b.label, "zh-CN") || a.key.localeCompare(b.key))
    const labelCounts = new Map<string, number>()
    for (const group of groups) {
      labelCounts.set(group.label, (labelCounts.get(group.label) ?? 0) + 1)
    }
    const seriesNameByKey = new Map(groups.map((group) => [
      group.key,
      (labelCounts.get(group.label) ?? 0) > 1
        ? `${group.label} · ${group.key.slice(0, 8)}`
        : group.label,
    ]))
    let minByteLog = Number.POSITIVE_INFINITY
    let maxByteLog = Number.NEGATIVE_INFINITY
    for (const group of groups) {
      for (const operation of ["upload", "download"] as const) {
        for (const value of group[operation]) {
          if (value[2] <= 0) continue
          const byteLog = Math.log1p(value[2])
          if (byteLog < minByteLog) minByteLog = byteLog
          if (byteLog > maxByteLog) maxByteLog = byteLog
        }
      }
    }
    const hasPositiveBytes = Number.isFinite(minByteLog) && Number.isFinite(maxByteLog)
    if (!hasPositiveBytes) {
      minByteLog = 0
      maxByteLog = 0
    }
    const byteLogRange = maxByteLog - minByteLog
    const symbolSize = (rawValue: unknown) => {
      const bytes = Number((rawValue as ScatterValue)[2] ?? 0)
      if (bytes <= 0) return 9
      if (byteLogRange <= Number.EPSILON) return 20
      const normalized = (Math.log1p(bytes) - minByteLog) / byteLogRange
      return 10 + Math.max(0, Math.min(1, normalized)) * 25
    }

    const entityColors = dark ? ENTITY_COLORS_DARK : ENTITY_COLORS_LIGHT
    const colorByEntity = new Map<string, string>()
    const series = groups.flatMap((group, groupIndex) => {
      const color = entityColors[groupIndex % entityColors.length]
      const offsetRadius = groupIndex === 0
        ? 0
        : Math.min(5, 1.5 + Math.sqrt(groupIndex) * 0.75)
      const offsetAngle = groupIndex * 2.399963229728653
      const entityOffsetX = Math.cos(offsetAngle) * offsetRadius
      const entityOffsetY = Math.sin(offsetAngle) * offsetRadius
      colorByEntity.set(group.key, color)
      return (["upload", "download"] as const)
        .filter((operation) => group[operation].length > 0)
        .map((operation) => ({
          id: `${group.key}:${operation}`,
          name: seriesNameByKey.get(group.key) ?? group.label,
          type: "scatter" as const,
          symbol: operation === "upload" ? "circle" : "diamond",
          symbolOffset: [
            entityOffsetX + (operation === "upload" ? -2 : 2),
            entityOffsetY,
          ],
          data: group[operation],
          symbolSize,
          itemStyle: {
            color,
            opacity: 0.76,
            borderColor: dark ? "#18181b" : "#ffffff",
            borderWidth: 1.5,
            shadowBlur: scatterPointCount <= 2000 ? 9 : 0,
            shadowColor: color,
          },
          progressive: 1000,
          progressiveThreshold: 3000,
          emphasis: {
            scale: 1.16,
            focus: "self" as const,
            itemStyle: { opacity: 1, borderWidth: 2, shadowBlur: scatterPointCount <= 2000 ? 14 : 0 },
          },
        }))
    })

    const legendData = groups.map((group) => ({
      name: seriesNameByKey.get(group.key) ?? group.label,
      icon: "roundRect",
      itemStyle: {
        color: colorByEntity.get(group.key),
      },
    }))

    const colorForValue = (value: ScatterValue): string => {
      return colorByEntity.get(value[9]) ?? foreground
    }

    const option: echarts.EChartsOption = {
      animation: scatterPointCount <= 3000,
      animationDuration: 420,
      animationEasing: "cubicOut",
      aria: {
        enabled: true,
        description: "上传与下载请求时序散点图，纵轴表示请求次数，气泡面积表示传输量。",
      },
      textStyle: { fontFamily },
      grid: { left: 18, right: 28, top: 56, bottom: 64, containLabel: true },
      legend: {
        type: "scroll",
        top: 8,
        left: 10,
        right: 205,
        itemWidth: 10,
        itemHeight: 8,
        itemGap: 16,
        textStyle: { color: foreground, fontSize: 11 },
        pageTextStyle: { color: muted, fontSize: 10 },
        pageIconColor: foreground,
        pageIconInactiveColor: dark ? "#52525b" : "#d4d4d8",
        data: legendData,
      },
      tooltip: {
        trigger: "item",
        confine: true,
        extraCssText: `--usage-tooltip-muted:${muted};box-shadow:0 12px 32px rgba(0,0,0,.18);border-radius:6px;padding:12px 14px;`,
        borderWidth: 1,
        backgroundColor: dark ? "rgba(24,24,27,.96)" : "rgba(255,255,255,.98)",
        borderColor: dark ? "#3f3f46" : "#e4e4e7",
        textStyle: { color: foreground, fontSize: 11, lineHeight: 17 },
        formatter: (params: echarts.TooltipComponentFormatterCallbackParams) => {
          const item = (Array.isArray(params) ? params[0] : params) as echarts.DefaultLabelFormatterCallbackParams
          const value = item.value as unknown as ScatterValue
          const operation = value[8] === "upload" ? "上传" : "下载"
          const color = colorForValue(value)
          return [
            `<div style="min-width:236px"><div style="font-size:12px;font-weight:600">${escapeHtml(value[3])}</div>`,
            `<div style="margin-top:2px;color:var(--usage-tooltip-muted);font-size:10px">${escapeHtml(formatChartTime(new Date(value[0])))} · ${escapeHtml(value[5])}</div>`,
            tooltipMetricRow(`${operation}请求`, `${Number(value[1]).toLocaleString("zh-CN")} 次`, color),
            tooltipMetricRow("传输量", formatBytes(Number(value[2]))),
            `<div style="height:1px;margin:10px 0 7px;background:${dark ? "#3f3f46" : "#e4e4e7"}"></div>`,
            `<div style="color:var(--usage-tooltip-muted);font-size:10px">${dimension === "app" ? "范围" : "APIKey"} · ${escapeHtml(value[4])}</div>`,
            `<div style="margin-top:3px;color:var(--usage-tooltip-muted);font-size:10px">发生于 ${escapeHtml(formatDateTime(value[6]))} 至 ${escapeHtml(formatDateTime(value[7]))}</div></div>`,
          ].join("")
        },
      },
      xAxis: {
        type: "time",
        boundaryGap: ["2%", "2%"],
        axisPointer: {
          show: true,
          snap: false,
          lineStyle: { color: dark ? "#71717a" : "#a1a1aa", type: "dashed" },
          label: {
            show: true,
            color: dark ? "#18181b" : "#ffffff",
            backgroundColor: dark ? "#d4d4d8" : "#3f3f46",
            formatter: (params) => formatChartTime(new Date(Number(params.value))),
          },
        },
        axisLabel: {
          color: muted,
          fontSize: 10,
          hideOverlap: true,
          margin: 12,
          formatter: (value: number) => formatChartTime(new Date(value)),
        },
        axisLine: { lineStyle: { color: grid } },
        axisTick: { show: false },
        splitLine: { show: true, lineStyle: { color: grid, type: "dashed" } },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        name: "请求次数",
        nameGap: 18,
        nameTextStyle: { color: muted, fontSize: 10, align: "left" },
        axisLabel: { color: muted, fontSize: 10, formatter: (value: number) => formatCompactNumber(value) },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: grid, type: "dashed" } },
      },
      dataZoom: [
        { type: "inside", xAxisIndex: 0, filterMode: "filter", zoomOnMouseWheel: true },
        {
          type: "slider",
          xAxisIndex: 0,
          filterMode: "filter",
          height: 18,
          bottom: 14,
          borderColor: "transparent",
          backgroundColor: dark ? "rgba(63,63,70,.28)" : "rgba(228,228,231,.55)",
          fillerColor: dark ? "rgba(113,113,122,.28)" : "rgba(113,113,122,.15)",
          dataBackground: {
            lineStyle: { color: dark ? "#71717a" : "#a1a1aa", opacity: 0.45 },
            areaStyle: { color: dark ? "#52525b" : "#d4d4d8", opacity: 0.18 },
          },
          selectedDataBackground: {
            lineStyle: { color: DOWNLOAD_COLOR, opacity: 0.65 },
            areaStyle: { color: DOWNLOAD_COLOR, opacity: 0.12 },
          },
          handleStyle: { color: dark ? "#a1a1aa" : "#71717a", borderColor: "transparent" },
          moveHandleStyle: { color: dark ? "#a1a1aa" : "#71717a", opacity: 0.55 },
          textStyle: { color: muted, fontSize: 9 },
        },
      ],
      series,
      media: [{
        query: { maxWidth: 639 },
        option: {
          grid: { left: 14, right: 20, top: 78, bottom: 64, containLabel: true },
          legend: { left: 8, right: 8, top: 6 },
        },
      }],
    }
    chart.setOption(option, true)
  }, [chartRef, dark, dimension, points])

  return (
    <div className="relative h-full min-h-0 w-full flex-1">
      <div ref={containerRef} className="h-full min-h-0 w-full" />
      <div className="pointer-events-none absolute top-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground sm:top-[11px] sm:right-[18px] sm:left-auto sm:translate-x-0">
        ● 上传&nbsp;&nbsp;◆ 下载&nbsp;&nbsp;·&nbsp;&nbsp;大小 = 传输量
      </div>
    </div>
  )
}

interface RegionRow extends UsageTotals {
  region: string
  shownName: string
}

function RegionUsageChart({ rows }: { rows: RegionRow[] }) {
  const { containerRef, chartRef } = useChart()
  const dark = useDarkTheme()
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const foreground = dark ? "#f4f4f5" : "#27272a"
    const muted = dark ? "#a1a1aa" : "#71717a"
    const grid = dark ? "rgba(113,113,122,.22)" : "rgba(113,113,122,.16)"
    const fontFamily = getComputedStyle(document.body).fontFamily || "sans-serif"
    const option: echarts.EChartsOption = {
      animationDuration: 420,
      animationEasing: "cubicOut",
      aria: {
        enabled: true,
        description: "各区域上传与下载用量对比图，左侧为数据传输量，右侧为请求次数。",
      },
      textStyle: { fontFamily },
      title: [
        { text: "数据传输量", left: "9%", top: 42, textStyle: { color: muted, fontSize: 10, fontWeight: 400 } },
        { text: "请求次数", left: "56%", top: 42, textStyle: { color: muted, fontSize: 10, fontWeight: 400 } },
      ],
      grid: [
        { left: 20, right: "53%", top: 72, bottom: 30, containLabel: true },
        { left: "53%", right: 24, top: 72, bottom: 30, containLabel: true },
      ],
      legend: {
        top: 7,
        left: "center",
        itemWidth: 10,
        itemHeight: 8,
        itemGap: 20,
        textStyle: { color: foreground, fontSize: 11 },
        data: [
          { name: "上传", icon: "roundRect" },
          { name: "下载", icon: "roundRect" },
        ],
      },
      tooltip: {
        trigger: "axis",
        confine: true,
        axisPointer: { type: "shadow", shadowStyle: { color: dark ? "rgba(113,113,122,.10)" : "rgba(113,113,122,.08)" } },
        extraCssText: `--usage-tooltip-muted:${muted};box-shadow:0 12px 32px rgba(0,0,0,.18);border-radius:6px;padding:12px 14px;`,
        borderWidth: 1,
        backgroundColor: dark ? "rgba(24,24,27,.96)" : "rgba(255,255,255,.98)",
        borderColor: dark ? "#3f3f46" : "#e4e4e7",
        textStyle: { color: foreground, fontSize: 11 },
        formatter: (params: echarts.TooltipComponentFormatterCallbackParams) => {
          const items = (Array.isArray(params) ? params : [params]) as echarts.DefaultLabelFormatterCallbackParams[]
          const title = escapeHtml(String(items[0]?.name || ""))
          const lines = items.map((item) => {
            const operation = String(item.seriesName || "")
            const isRequest = Number(item.seriesIndex) >= 2
            const name = `${operation}${isRequest ? "请求" : "传输量"}`
            const raw = Array.isArray(item.value) ? item.value[1] : item.value
            const display = isRequest
              ? `${Number(raw).toLocaleString("zh-CN")} 次`
              : formatBytes(Number(raw))
            const color = operation === "上传" ? UPLOAD_COLOR : DOWNLOAD_COLOR
            return tooltipMetricRow(name, display, color)
          })
          return [`<div style="min-width:190px;font-size:12px;font-weight:600">${title}</div>`, ...lines].join("")
        },
      },
      xAxis: [
        {
          type: "value",
          gridIndex: 0,
          axisLabel: { color: muted, fontSize: 10, hideOverlap: true, formatter: (value: number) => formatBytes(value) },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: grid, type: "dashed" } },
        },
        {
          type: "value",
          gridIndex: 1,
          minInterval: 1,
          axisLabel: { color: muted, fontSize: 10, hideOverlap: true, formatter: (value: number) => formatCompactNumber(value) },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: grid, type: "dashed" } },
        },
      ],
      yAxis: [
        {
          type: "category",
          gridIndex: 0,
          inverse: true,
          data: rows.map((row) => row.shownName),
          axisLabel: { color: foreground, fontSize: 10, width: 76, overflow: "truncate", margin: 10 },
          axisLine: { show: false },
          axisTick: { show: false },
        },
        {
          type: "category",
          gridIndex: 1,
          inverse: true,
          data: rows.map((row) => row.shownName),
          axisLabel: { show: false, color: foreground, fontSize: 10, width: 76, overflow: "truncate", margin: 10 },
          axisLine: { show: false },
          axisTick: { show: false },
        },
      ],
      series: [
        {
          name: "上传",
          type: "bar",
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: rows.map((row) => row.upload_bytes),
          barMaxWidth: 16,
          barGap: "28%",
          itemStyle: { color: UPLOAD_COLOR, borderRadius: [0, 3, 3, 0] },
          emphasis: { itemStyle: { color: dark ? "#34d399" : "#059669" } },
        },
        {
          name: "下载",
          type: "bar",
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: rows.map((row) => row.download_bytes),
          barMaxWidth: 16,
          itemStyle: { color: DOWNLOAD_COLOR, borderRadius: [0, 3, 3, 0] },
          emphasis: { itemStyle: { color: dark ? "#60a5fa" : "#2563eb" } },
        },
        {
          name: "上传",
          type: "bar",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: rows.map((row) => row.upload_requests),
          barMaxWidth: 16,
          barGap: "28%",
          itemStyle: { color: dark ? "rgba(52,211,153,.68)" : "rgba(16,185,129,.72)", borderRadius: [0, 3, 3, 0] },
          emphasis: { itemStyle: { color: dark ? "#34d399" : "#059669" } },
        },
        {
          name: "下载",
          type: "bar",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: rows.map((row) => row.download_requests),
          barMaxWidth: 16,
          itemStyle: { color: dark ? "rgba(96,165,250,.68)" : "rgba(59,130,246,.72)", borderRadius: [0, 3, 3, 0] },
          emphasis: { itemStyle: { color: dark ? "#60a5fa" : "#2563eb" } },
        },
      ],
      media: [{
        query: { maxWidth: 720 },
        option: {
          title: [
            { text: "数据传输量", left: 82, top: 42, textStyle: { color: muted, fontSize: 10, fontWeight: 400 } },
            { text: "请求次数", left: 82, top: "54%", textStyle: { color: muted, fontSize: 10, fontWeight: 400 } },
          ],
          grid: [
            { left: 16, right: 20, top: 70, height: "31%", containLabel: true },
            { left: 16, right: 20, top: "62%", bottom: 22, containLabel: true },
          ],
          yAxis: [
            {},
            { axisLabel: { show: true, color: foreground, fontSize: 10, width: 76, overflow: "truncate", margin: 10 } },
          ],
        },
      }],
    }
    chart.setOption(option, true)
  }, [chartRef, dark, rows])
  return <div ref={containerRef} className="h-full min-h-0 w-full flex-1" />
}

function Segment<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div className="inline-flex h-9 rounded-md bg-muted p-0.5" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={cn(
            "rounded-[5px] px-3 text-xs text-muted-foreground transition-colors",
            value === option.value && "bg-background font-medium text-foreground shadow-sm",
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

const RANGE_PRESETS = [
  { id: "today", label: "今天", days: 0 },
  { id: "24h", label: "过去 24 小时", days: 1 },
  { id: "7d", label: "过去 7 天", days: 7 },
  { id: "30d", label: "过去 30 天", days: 30 },
  { id: "90d", label: "过去 90 天", days: 90 },
] as const

function useTwoMonthCalendar(): boolean {
  const [enabled, setEnabled] = useState(() => window.matchMedia("(min-width: 768px)").matches)

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)")
    const update = () => setEnabled(media.matches)
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  return enabled
}

function DateTimeRangePicker({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  onPresetSelect,
}: {
  startValue: string
  endValue: string
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
  onPresetSelect: (days: number) => void
}) {
  const [open, setOpen] = useState(false)
  const initialRange = useMemo<DateRange>(() => ({
    from: inputDayToDate(startValue),
    to: inputDayToDate(endValue),
  }), [endValue, startValue])
  const [draftRange, setDraftRange] = useState<DateRange>(initialRange)
  const showTwoMonths = useTwoMonthCalendar()

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setDraftRange(initialRange)
    setOpen(nextOpen)
  }

  const applyPreset = (days: number) => {
    const now = new Date()
    const end = toShanghaiInput(now)
    const start = days === 0
      ? `${end.slice(0, 10)}T00:00`
      : toShanghaiInput(new Date(now.getTime() - days * DAY_MS))
    onStartChange(start)
    onEndChange(end)
    onPresetSelect(days)
    setOpen(false)
  }

  const handleRangeSelect = (range: DateRange | undefined) => {
    if (!range?.from) return
    setDraftRange(range)
    if (!range.to) return

    const nowInput = toShanghaiInput(new Date())
    const endDay = dateToInputDay(range.to)
    onStartChange(replaceInputDay(startValue, range.from, "00:00"))
    onEndChange(replaceInputDay(endValue, range.to, endDay === nowInput.slice(0, 10) ? nowInput.slice(11, 16) : "23:59"))
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-9 w-full min-w-0 justify-start gap-2 rounded-md px-3 font-normal"
          aria-label="选择统计时间范围"
        >
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-left text-xs">
            {displayInputTime(startValue)} 至 {displayInputTime(endValue)}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={16}
        className="max-h-[var(--radix-popover-content-available-height)] w-[calc(100vw-2rem)] max-w-[47rem] overflow-x-hidden overflow-y-auto overscroll-contain p-0 md:w-auto"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex flex-col md:flex-row">
          <div className="border-b border-border p-3 md:w-36 md:shrink-0 md:border-r md:border-b-0">
            <div className="mb-2 px-2 text-[10px] font-medium text-muted-foreground">常用时间段</div>
            <div className="grid grid-cols-2 gap-1 md:grid-cols-1">
              {RANGE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="rounded-md px-2 py-2 text-left text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  onClick={() => applyPreset(preset.days)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-0">
            <Calendar
              mode="range"
              max={90}
              selected={draftRange}
              defaultMonth={draftRange.from}
              numberOfMonths={showTwoMonths ? 2 : 1}
              locale={zhCN}
              labels={{
                labelNext: () => "下个月",
                labelPrevious: () => "上个月",
              }}
              onSelect={handleRangeSelect}
            />
            <div className="grid grid-cols-2 gap-3 border-t border-border p-3">
              <label className="text-[10px] text-muted-foreground">
                <span className="mb-1.5 block">开始时间（UTC+8）</span>
                <Input
                  type="time"
                  step="60"
                  className="h-8 text-xs"
                  value={startValue.slice(11, 16)}
                  onChange={(event) => onStartChange(replaceInputTime(startValue, event.target.value))}
                />
              </label>
              <label className="text-[10px] text-muted-foreground">
                <span className="mb-1.5 block">结束时间（UTC+8）</span>
                <Input
                  type="time"
                  step="60"
                  className="h-8 text-xs"
                  value={endValue.slice(11, 16)}
                  onChange={(event) => onEndChange(replaceInputTime(endValue, event.target.value))}
                />
              </label>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function UsageEventTable({
  events,
  regionNames,
}: {
  events: UsageEventItem[]
  regionNames: Map<string, string>
}) {
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(events.length / EVENT_PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const rows = events.slice(safePage * EVENT_PAGE_SIZE, (safePage + 1) * EVENT_PAGE_SIZE)
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead>发生时间（UTC+8）</TableHead>
              <TableHead>操作</TableHead>
              <TableHead>APP</TableHead>
              <TableHead>APIKey</TableHead>
              <TableHead>区域</TableHead>
              <TableHead className="text-right">传输量</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((event) => (
              <TableRow key={`${event.region}-${event.id}`}>
                <TableCell>{formatDateTime(event.occurred_at)}</TableCell>
                <TableCell>
                  <span className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                    event.operation === "upload"
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                      : "bg-blue-500/10 text-blue-700 dark:text-blue-400",
                  )}>
                    {event.operation === "upload" ? "上传" : "下载"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="font-medium text-foreground">{event.app_shown_name || event.app_name}</div>
                  <div className="text-[10px] text-muted-foreground">{event.app_name}</div>
                </TableCell>
                <TableCell>{event.api_key_hint || event.api_key_id.slice(0, 12)}</TableCell>
                <TableCell>{regionNames.get(event.region) || event.region}</TableCell>
                <TableCell className="text-right font-medium">{formatBytes(event.bytes_transferred)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-3 flex shrink-0 items-center justify-between border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
        <span>共 {events.length.toLocaleString("zh-CN")} 条请求记录</span>
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7 rounded-md"
            disabled={safePage === 0}
            title="上一页"
            onClick={() => setPage((value) => Math.max(0, value - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <span>{safePage + 1} / {pageCount}</span>
          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7 rounded-md"
            disabled={safePage >= pageCount - 1}
            title="下一页"
            onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function UsagePage() {
  const { accessToken, user } = useAuth()
  const initialEnd = useMemo(() => new Date(), [])
  const [startInput, setStartInput] = useState(() => toShanghaiInput(new Date(initialEnd.getTime() - 7 * DAY_MS)))
  const [endInput, setEndInput] = useState(() => toShanghaiInput(initialEnd))
  const [dimension, setDimension] = useState<Dimension>("app")
  const [appliedDimension, setAppliedDimension] = useState<Dimension>("app")
  const [selectedEntity, setSelectedEntity] = useState("")
  const [interval, setInterval] = useState<Interval>("hour")
  const [view, setView] = useState<ViewMode>("chart")
  const [regionView, setRegionView] = useState<ViewMode>("chart")
  const [activePanel, setActivePanel] = useState<UsagePanel>("timeline")
  const [options, setOptions] = useState<UsageOptionsResponse>({ applications: [], api_keys: [] })
  const [responses, setResponses] = useState<UsageQueryResponse[]>([])
  const [failures, setFailures] = useState<UsageRegionFailure[]>([])
  const [loading, setLoading] = useState(true)
  const [optionsLoading, setOptionsLoading] = useState(true)

  const loadUsage = useCallback(async () => {
    const startAt = shanghaiInputToIso(startInput)
    const endAt = shanghaiInputToIso(endInput)
    if (!startAt || !endAt || new Date(startAt) >= new Date(endAt)) {
      showErrorToast("请选择有效的开始与结束时间")
      return
    }
    if (new Date(endAt).getTime() - new Date(startAt).getTime() > 90 * DAY_MS) {
      showErrorToast("单次最多查询 90 天用量")
      return
    }
    setLoading(true)
    try {
      const result = await fetchUsageAcrossRegionsApi(
        {
          start_at: startAt,
          end_at: endAt,
          interval,
          app_name: dimension === "app" && selectedEntity ? selectedEntity : undefined,
          api_key_id: dimension === "api_key" && selectedEntity ? selectedEntity : undefined,
        },
        accessToken ?? undefined,
      )
      setResponses(result.data)
      setFailures(result.failures)
      setAppliedDimension(dimension)
    } catch {
      setResponses([])
      setFailures([])
    } finally {
      setLoading(false)
    }
  }, [accessToken, dimension, endInput, interval, selectedEntity, startInput])

  useEffect(() => {
    if (!user?.is_admin) return
    const initialize = async () => {
      setOptionsLoading(true)
      try {
        setOptions(await fetchUsageOptionsApi(accessToken ?? undefined))
      } catch {
        setOptions({ applications: [], api_keys: [] })
      } finally {
        setOptionsLoading(false)
      }
      await loadUsage()
    }
    void initialize()
    // 筛选条件由“查询”按钮提交；这里只在登录态变化时初始化。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, user?.is_admin])

  const totals = useMemo(
    () => responses.reduce<UsageTotals>((sum, response) => ({
      upload_requests: sum.upload_requests + response.totals.upload_requests,
      upload_bytes: sum.upload_bytes + response.totals.upload_bytes,
      download_requests: sum.download_requests + response.totals.download_requests,
      download_bytes: sum.download_bytes + response.totals.download_bytes,
    }), { ...EMPTY_TOTALS }),
    [responses],
  )
  const points = useMemo(() => responses.flatMap((response) => response.points), [responses])
  const chartPoints = useMemo(
    () => aggregateChartPoints(points, appliedDimension),
    [appliedDimension, points],
  )
  const events = useMemo(
    () => responses
      .flatMap((response) => response.events)
      .sort((a, b) => (parseBackendDate(b.occurred_at)?.getTime() ?? 0) - (parseBackendDate(a.occurred_at)?.getTime() ?? 0)),
    [responses],
  )
  const regionRows = useMemo<RegionRow[]>(
    () => responses.map((response) => ({
      region: response.region,
      shownName: response.region_name || response.region,
      ...response.totals,
    })).sort((a, b) => b.upload_bytes + b.download_bytes - a.upload_bytes - a.download_bytes),
    [responses],
  )
  const regionNames = useMemo(
    () => new Map(regionRows.map((row) => [row.region, row.shownName])),
    [regionRows],
  )
  const hasData = totals.upload_requests + totals.download_requests > 0
  const truncated = responses.some((response) => response.truncated)

  if (!user?.is_admin) return <Navigate to="/data/basic/region" replace />

  return (
    <div className="mx-auto flex min-h-full w-full max-w-8xl flex-col gap-4 lg:h-full lg:min-h-0">
      <div className="shrink-0">
        <h1 className="text-lg font-semibold text-foreground">用量统计</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          汇总各区域上传、下载请求与传输量；所有时间均按 UTC+8 展示。
        </p>
      </div>

      <section className="shrink-0 rounded-lg border border-border/70 bg-card/45 p-3" aria-label="统计筛选条件">
        <div className="grid gap-3 lg:grid-cols-[auto_minmax(12rem,1fr)_minmax(18rem,1.45fr)_auto_auto] lg:items-end">
          <div>
            <div className="mb-1.5 text-[11px] text-muted-foreground">统计维度</div>
            <Segment
              value={dimension}
              label="统计维度"
              options={[{ value: "app", label: "APP" }, { value: "api_key", label: "APIKey" }]}
              onChange={(value) => {
                setDimension(value)
                setSelectedEntity("")
              }}
            />
          </div>
          <label className="min-w-0 text-[11px] text-muted-foreground">
            <span className="mb-1.5 block">{dimension === "app" ? "APP 范围" : "APIKey 范围"}</span>
            <select
              className={cn(SELECT_CLASS, "w-full")}
              value={selectedEntity}
              disabled={optionsLoading}
              onChange={(event) => setSelectedEntity(event.target.value)}
            >
              <option value="">{dimension === "app" ? "全部 APP" : "全部 APIKey"}</option>
              {dimension === "app"
                ? options.applications.map((app) => (
                    <option key={app.name} value={app.name}>{app.shown_name || app.name} · {app.name}</option>
                  ))
                : options.api_keys.map((key) => (
                    <option key={key.id} value={key.id}>{key.hint} · {key.app_shown_name || key.app_name}</option>
                  ))}
            </select>
          </label>
          <div className="min-w-0 text-[11px] text-muted-foreground">
            <span className="mb-1.5 block">统计时间（UTC+8）</span>
            <DateTimeRangePicker
              startValue={startInput}
              endValue={endInput}
              onStartChange={setStartInput}
              onEndChange={setEndInput}
              onPresetSelect={(days) => setInterval(days > 14 ? "day" : "hour")}
            />
          </div>
          <label className="text-[11px] text-muted-foreground">
            <span className="mb-1.5 block">聚合粒度</span>
            <select className={SELECT_CLASS} value={interval} onChange={(event) => setInterval(event.target.value as Interval)}>
              <option value="hour">按小时</option>
              <option value="day">按天</option>
            </select>
          </label>
          <Button className="h-9 gap-1.5 rounded-md" disabled={loading} onClick={() => void loadUsage()}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden />
            查询
          </Button>
        </div>
      </section>

      {failures.length > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <div className="font-medium">部分区域暂未纳入本次汇总</div>
            <div className="mt-0.5 text-[11px] opacity-85">
              {failures.map((failure) => `${failure.region}：${failure.message}`).join("；")}
            </div>
          </div>
        </div>
      ) : null}

      <section className={cn(
        "flex flex-col rounded-lg border border-border/70 bg-card/45 lg:min-h-0",
        activePanel === "timeline" ? "min-h-[26rem] flex-1" : "shrink-0",
      )}>
        <div className={cn(
          "flex flex-wrap items-center justify-between gap-3 px-4 py-3",
          activePanel === "timeline" && "border-b border-border/60",
        )}>
          <button
            type="button"
            className="group flex min-w-0 flex-1 items-center gap-3 text-left"
            aria-expanded={activePanel === "timeline"}
            aria-controls="usage-timeline-panel"
            onClick={() => setActivePanel("timeline")}
          >
            <ChartScatter className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">请求时序</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">纵轴为请求次数，点面积随传输量增大；可滚轮缩放时间范围。</span>
            </span>
            <ChevronDown className={cn(
              "ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              activePanel === "timeline" && "rotate-180",
            )} aria-hidden />
          </button>
          {activePanel === "timeline" ? (
            <Segment
              value={view}
              label="请求时序视图"
              options={[{ value: "chart", label: "散点图" }, { value: "table", label: "明细" }]}
              onChange={setView}
            />
          ) : null}
        </div>
        {activePanel === "timeline" ? <div id="usage-timeline-panel" className="flex min-h-0 flex-1 flex-col p-3 sm:p-4">
          {loading ? (
            <div className="flex min-h-[20rem] flex-1 items-center justify-center text-xs text-muted-foreground lg:min-h-0">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden />正在汇总各区域用量...
            </div>
          ) : !hasData ? (
            <div className="flex min-h-[20rem] flex-1 flex-col items-center justify-center text-center lg:min-h-0">
              <ChartScatter className="h-8 w-8 text-muted-foreground/55" aria-hidden />
              <div className="mt-3 text-sm font-medium text-foreground">所选范围暂无传输记录</div>
              <div className="mt-1 text-xs text-muted-foreground">完成新的上传或下载后，成功请求会出现在这里。</div>
            </div>
          ) : view === "chart" ? (
            <UsageScatterChart points={chartPoints} dimension={appliedDimension} />
          ) : (
            <UsageEventTable events={events} regionNames={regionNames} />
          )}
          {truncated ? (
            <div className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">当前范围明细较多，列表仅展示各区域最近 2,000 条；图表仍为完整聚合结果。</div>
          ) : null}
        </div> : null}
      </section>

      <section className={cn(
        "flex flex-col rounded-lg border border-border/70 bg-card/45 lg:min-h-0",
        activePanel === "region" ? "min-h-[26rem] flex-1" : "shrink-0",
      )}>
        <div className={cn(
          "flex flex-wrap items-center justify-between gap-3 px-4 py-3",
          activePanel === "region" && "border-b border-border/60",
        )}>
          <button
            type="button"
            className="group flex min-w-0 flex-1 items-center gap-3 text-left"
            aria-expanded={activePanel === "region"}
            aria-controls="usage-region-panel"
            onClick={() => setActivePanel("region")}
          >
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">区域用量对比</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">按请求实际进入的区域统计，不重复计算 MinIO 后台副本流量。</span>
            </span>
            <ChevronDown className={cn(
              "ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              activePanel === "region" && "rotate-180",
            )} aria-hidden />
          </button>
          {activePanel === "region" ? (
            <Segment
              value={regionView}
              label="区域用量视图"
              options={[{ value: "chart", label: "图表" }, { value: "table", label: "列表" }]}
              onChange={setRegionView}
            />
          ) : null}
        </div>
        {activePanel === "region" ? <div id="usage-region-panel" className="flex min-h-0 flex-1 flex-col p-3 sm:p-4">
          {loading ? (
            <div className="flex min-h-[20rem] flex-1 items-center justify-center text-xs text-muted-foreground lg:min-h-0">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden />正在加载区域数据...
            </div>
          ) : !hasData || regionRows.length === 0 ? (
            <div className="flex min-h-[20rem] flex-1 flex-col items-center justify-center text-center lg:min-h-0">
              <MapPin className="h-8 w-8 text-muted-foreground/55" aria-hidden />
              <div className="mt-3 text-sm font-medium text-foreground">所选范围暂无区域用量</div>
              <div className="mt-1 text-xs text-muted-foreground">新的上传或下载请求会按实际接入区域汇总到这里。</div>
            </div>
          ) : regionView === "chart" ? (
            <RegionUsageChart rows={regionRows} />
          ) : (
            <div className="min-h-0 flex-1 overflow-auto"><Table>
              <TableHeader>
                <TableRow>
                  <TableHead>区域</TableHead>
                  <TableHead className="text-right">上传请求</TableHead>
                  <TableHead className="text-right">上传传输量</TableHead>
                  <TableHead className="text-right">下载请求</TableHead>
                  <TableHead className="text-right">下载传输量</TableHead>
                  <TableHead className="text-right">总传输量</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {regionRows.map((row) => (
                  <TableRow key={row.region}>
                    <TableCell><div className="font-medium text-foreground">{row.shownName}</div><div className="text-[10px] text-muted-foreground">{row.region}</div></TableCell>
                    <TableCell className="text-right">{row.upload_requests.toLocaleString("zh-CN")}</TableCell>
                    <TableCell className="text-right">{formatBytes(row.upload_bytes)}</TableCell>
                    <TableCell className="text-right">{row.download_requests.toLocaleString("zh-CN")}</TableCell>
                    <TableCell className="text-right">{formatBytes(row.download_bytes)}</TableCell>
                    <TableCell className="text-right font-medium">{formatBytes(row.upload_bytes + row.download_bytes)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></div>
          )}
        </div> : null}
      </section>
    </div>
  )
}
