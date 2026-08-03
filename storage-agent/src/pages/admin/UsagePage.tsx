import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as echarts from "echarts"
import {
  Activity,
  ChartScatter,
  ChevronLeft,
  ChevronRight,
  Download,
  MapPin,
  RefreshCw,
  TriangleAlert,
  Upload,
} from "lucide-react"
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
import { Card, CardContent } from "../../components/ui/card"
import { Input } from "../../components/ui/input"
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

const EMPTY_TOTALS: UsageTotals = {
  upload_requests: 0,
  upload_bytes: 0,
  download_requests: 0,
  download_bytes: 0,
}
const EVENT_PAGE_SIZE = 50
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

type ScatterValue = [number, number, number, string, string, string, string, string]

function entityLabel(point: UsagePoint, dimension: Dimension): string {
  if (dimension === "app") return point.app_shown_name || point.app_name
  return `${point.api_key_hint || point.api_key_id.slice(0, 12)} · ${point.app_shown_name || point.app_name}`
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
    const groups = new Map<
      string,
      { name: string; operation: "upload" | "download"; data: ScatterValue[] }
    >()

    for (const point of points) {
      const timestamp = parseBackendDate(point.period_start)?.getTime()
      if (!timestamp) continue
      const label = entityLabel(point, dimension)
      for (const operation of ["upload", "download"] as const) {
        const requests = point[`${operation}_requests`]
        if (requests <= 0) continue
        const bytes = point[`${operation}_bytes`]
        const key = `${label}\u0000${operation}`
        const group = groups.get(key) ?? {
          name: `${label} · ${operation === "upload" ? "上传" : "下载"}`,
          operation,
          data: [],
        }
        group.data.push([
          timestamp,
          requests,
          bytes,
          label,
          point.api_key_hint || point.api_key_id.slice(0, 12),
          point.region,
          point.first_at,
          point.last_at,
        ])
        groups.set(key, group)
      }
    }

    const maxBytes = Math.max(1, ...points.flatMap((point) => [point.upload_bytes, point.download_bytes]))
    const series = [...groups.values()].map((group) => ({
      name: group.name,
      type: "scatter" as const,
      symbol: group.operation === "upload" ? "circle" : "diamond",
      data: group.data,
      symbolSize: (rawValue: unknown) => {
        const bytes = Number((rawValue as ScatterValue)[2] ?? 0)
        return Math.max(9, Math.min(42, 9 + Math.sqrt(bytes / maxBytes) * 33))
      },
      itemStyle: {
        color: group.operation === "upload" ? "#10b981" : "#3b82f6",
        opacity: 0.78,
        shadowBlur: 7,
        shadowColor: group.operation === "upload" ? "rgba(16,185,129,.28)" : "rgba(59,130,246,.28)",
      },
      emphasis: { scale: 1.15, itemStyle: { opacity: 1 } },
    }))

    const option: echarts.EChartsOption = {
      animationDuration: 320,
      grid: { left: 54, right: 22, top: 52, bottom: 58, containLabel: false },
      legend: {
        type: "scroll",
        top: 4,
        left: 8,
        right: 8,
        textStyle: { color: muted, fontSize: 10 },
        pageTextStyle: { color: muted },
      },
      tooltip: {
        trigger: "item",
        borderWidth: 1,
        backgroundColor: dark ? "rgba(24,24,27,.96)" : "rgba(255,255,255,.98)",
        borderColor: dark ? "#3f3f46" : "#e4e4e7",
        textStyle: { color: foreground, fontSize: 11 },
        formatter: (params: echarts.TooltipComponentFormatterCallbackParams) => {
          const item = (Array.isArray(params) ? params[0] : params) as echarts.DefaultLabelFormatterCallbackParams
          const value = item.value as unknown as ScatterValue
          const operation = item.seriesName?.endsWith("上传") ? "上传" : "下载"
          return [
            `<strong>${escapeHtml(value[3])} · ${operation}</strong>`,
            `时间桶：${escapeHtml(formatChartTime(new Date(value[0])))}`,
            `请求次数：${Number(value[1]).toLocaleString("zh-CN")} 次`,
            `传输量：${escapeHtml(formatBytes(Number(value[2])))}`,
            `APIKey：${escapeHtml(value[4])}`,
            `区域：${escapeHtml(value[5])}`,
            `发生范围：${escapeHtml(formatDateTime(value[6]))} 至 ${escapeHtml(formatDateTime(value[7]))}`,
          ].join("<br/>")
        },
      },
      xAxis: {
        type: "time",
        axisLabel: { color: muted, fontSize: 10, formatter: (value: number) => formatChartTime(new Date(value)) },
        axisLine: { lineStyle: { color: grid } },
        splitLine: { show: true, lineStyle: { color: grid, type: "dashed" } },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        name: "请求次数",
        nameTextStyle: { color: muted, fontSize: 10 },
        axisLabel: { color: muted, fontSize: 10 },
        splitLine: { lineStyle: { color: grid, type: "dashed" } },
      },
      dataZoom: [
        { type: "inside", xAxisIndex: 0 },
        { type: "slider", xAxisIndex: 0, height: 16, bottom: 12, borderColor: "transparent" },
      ],
      series,
    }
    chart.setOption(option, true)
  }, [chartRef, dark, dimension, points])

  return <div ref={containerRef} className="h-[360px] min-h-[280px] w-full" />
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
    const muted = dark ? "#a1a1aa" : "#71717a"
    const grid = dark ? "rgba(113,113,122,.22)" : "rgba(113,113,122,.16)"
    const option: echarts.EChartsOption = {
      grid: { left: 34, right: 44, top: 42, bottom: 32, containLabel: true },
      legend: { top: 3, textStyle: { color: muted, fontSize: 10 } },
      tooltip: {
        trigger: "axis",
        formatter: (params: echarts.TooltipComponentFormatterCallbackParams) => {
          const items = (Array.isArray(params) ? params : [params]) as echarts.DefaultLabelFormatterCallbackParams[]
          const title = escapeHtml(String(items[0]?.name || ""))
          const lines = items.map((item) => {
            const name = String(item.seriesName || "")
            const raw = Array.isArray(item.value) ? item.value[1] : item.value
            const display = name.endsWith("请求")
              ? `${Number(raw).toLocaleString("zh-CN")} 次`
              : formatBytes(Number(raw))
            return `${item.marker || ""}${escapeHtml(name)}：${escapeHtml(display)}`
          })
          return [`<strong>${title}</strong>`, ...lines].join("<br/>")
        },
      },
      xAxis: {
        type: "category",
        data: rows.map((row) => row.shownName),
        axisLabel: { color: muted, fontSize: 10 },
        axisLine: { lineStyle: { color: grid } },
      },
      yAxis: [
        {
          type: "value",
          name: "传输量",
          nameTextStyle: { color: muted, fontSize: 10 },
          axisLabel: { color: muted, fontSize: 10, formatter: (value: number) => formatBytes(value) },
          splitLine: { lineStyle: { color: grid, type: "dashed" } },
        },
        {
          type: "value",
          name: "请求数",
          nameTextStyle: { color: muted, fontSize: 10 },
          axisLabel: { color: muted, fontSize: 10 },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "上传传输量",
          type: "bar",
          data: rows.map((row) => row.upload_bytes),
          itemStyle: { color: "#10b981", borderRadius: [3, 3, 0, 0] },
        },
        {
          name: "下载传输量",
          type: "bar",
          data: rows.map((row) => row.download_bytes),
          itemStyle: { color: "#3b82f6", borderRadius: [3, 3, 0, 0] },
        },
        {
          name: "上传请求",
          type: "line",
          yAxisIndex: 1,
          data: rows.map((row) => row.upload_requests),
          symbolSize: 7,
          lineStyle: { color: "#059669", width: 1.5 },
          itemStyle: { color: "#059669" },
        },
        {
          name: "下载请求",
          type: "line",
          yAxisIndex: 1,
          data: rows.map((row) => row.download_requests),
          symbol: "diamond",
          symbolSize: 7,
          lineStyle: { color: "#2563eb", width: 1.5 },
          itemStyle: { color: "#2563eb" },
        },
      ],
    }
    chart.setOption(option, true)
  }, [chartRef, dark, rows])
  return <div ref={containerRef} className="h-[300px] min-h-[260px] w-full" />
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

function SummaryCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string
  value: string
  detail: string
  icon: React.ReactNode
}) {
  return (
    <Card className="rounded-lg shadow-none">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground">{label}</div>
          <div className="mt-1 truncate text-xl font-semibold text-foreground">{value}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">{detail}</div>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground ring-1 ring-border/70">
          {icon}
        </div>
      </CardContent>
    </Card>
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
    <>
      <Table>
        <TableHeader>
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
      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
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
    </>
  )
}

export default function UsagePage() {
  const { accessToken, user } = useAuth()
  const initialEnd = useMemo(() => new Date(), [])
  const [startInput, setStartInput] = useState(() => toShanghaiInput(new Date(initialEnd.getTime() - 7 * 86400000)))
  const [endInput, setEndInput] = useState(() => toShanghaiInput(initialEnd))
  const [dimension, setDimension] = useState<Dimension>("app")
  const [appliedDimension, setAppliedDimension] = useState<Dimension>("app")
  const [selectedEntity, setSelectedEntity] = useState("")
  const [interval, setInterval] = useState<Interval>("hour")
  const [view, setView] = useState<ViewMode>("chart")
  const [regionView, setRegionView] = useState<ViewMode>("chart")
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

  const setQuickRange = (days: number) => {
    const end = new Date()
    setEndInput(toShanghaiInput(end))
    setStartInput(toShanghaiInput(new Date(end.getTime() - days * 86400000)))
    setInterval(days > 14 ? "day" : "hour")
  }

  return (
    <div className="mx-auto max-w-8xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">用量统计</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            汇总各区域上传、下载请求与传输量；所有时间均按 UTC+8 展示。
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-md bg-muted p-0.5">
          {[{ days: 1, label: "24 小时" }, { days: 7, label: "7 天" }, { days: 30, label: "30 天" }].map((item) => (
            <button
              key={item.days}
              type="button"
              className="rounded-[5px] px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-background hover:text-foreground"
              onClick={() => setQuickRange(item.days)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <section className="rounded-lg border border-border/70 bg-card/45 p-3" aria-label="统计筛选条件">
        <div className="grid gap-3 lg:grid-cols-[auto_minmax(12rem,1fr)_minmax(11rem,1fr)_minmax(11rem,1fr)_auto_auto] lg:items-end">
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
          <label className="min-w-0 text-[11px] text-muted-foreground">
            <span className="mb-1.5 block">开始时间（UTC+8）</span>
            <Input type="datetime-local" className="h-9 text-xs" value={startInput} onChange={(event) => setStartInput(event.target.value)} />
          </label>
          <label className="min-w-0 text-[11px] text-muted-foreground">
            <span className="mb-1.5 block">结束时间（UTC+8）</span>
            <Input type="datetime-local" className="h-9 text-xs" value={endInput} onChange={(event) => setEndInput(event.target.value)} />
          </label>
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="上传请求" value={totals.upload_requests.toLocaleString("zh-CN")} detail={`涉及 ${responses.length} 个区域`} icon={<Upload className="h-4 w-4 text-emerald-600" aria-hidden />} />
        <SummaryCard label="上传传输量" value={formatBytes(totals.upload_bytes)} detail="成功上传分片的实际字节" icon={<Activity className="h-4 w-4 text-emerald-600" aria-hidden />} />
        <SummaryCard label="下载请求" value={totals.download_requests.toLocaleString("zh-CN")} detail={`涉及 ${responses.length} 个区域`} icon={<Download className="h-4 w-4 text-blue-600" aria-hidden />} />
        <SummaryCard label="下载传输量" value={formatBytes(totals.download_bytes)} detail="客户端实际读取的字节" icon={<Activity className="h-4 w-4 text-blue-600" aria-hidden />} />
      </div>

      <section className="rounded-lg border border-border/70 bg-card/45">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">请求时序</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">纵轴为请求次数，点面积随传输量增大；可滚轮缩放时间范围。</p>
          </div>
          <Segment
            value={view}
            label="请求时序视图"
            options={[{ value: "chart", label: "散点图" }, { value: "table", label: "明细" }]}
            onChange={setView}
          />
        </div>
        <div className="p-3 sm:p-4">
          {loading ? (
            <div className="flex h-[320px] items-center justify-center text-xs text-muted-foreground">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" aria-hidden />正在汇总各区域用量...
            </div>
          ) : !hasData ? (
            <div className="flex h-[260px] flex-col items-center justify-center text-center">
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
            <div className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">当前范围明细较多，列表仅展示各区域最近 2,000 条；汇总指标与图表仍为完整聚合结果。</div>
          ) : null}
        </div>
      </section>

      <section className="rounded-lg border border-border/70 bg-card/45">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><MapPin className="h-4 w-4" aria-hidden />区域用量对比</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">按请求实际进入的区域统计，不重复计算 MinIO 后台副本流量。</p>
          </div>
          <Segment
            value={regionView}
            label="区域用量视图"
            options={[{ value: "chart", label: "图表" }, { value: "table", label: "列表" }]}
            onChange={setRegionView}
          />
        </div>
        <div className="p-3 sm:p-4">
          {loading ? (
            <div className="flex h-[260px] items-center justify-center text-xs text-muted-foreground">正在加载区域数据...</div>
          ) : regionRows.length === 0 ? (
            <div className="flex h-[180px] items-center justify-center text-xs text-muted-foreground">暂无区域统计数据</div>
          ) : regionView === "chart" ? (
            <RegionUsageChart rows={regionRows} />
          ) : (
            <Table>
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
            </Table>
          )}
        </div>
      </section>
    </div>
  )
}
