import { useCallback, useEffect, useMemo, useState } from "react"
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
import { formatBytes, formatDateTime, parseBackendDate } from "../../lib/format"
import { cn } from "../../lib/utils"
import {
  RegionUsageChart,
  type RegionUsageRow,
  UsageScatterChart,
} from "./UsageCharts"

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
  const regionRows = useMemo<RegionUsageRow[]>(
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
              <span className="mt-0.5 block text-[11px] text-muted-foreground">纵轴为请求次数，上传使用上三角、下载使用下三角，图形随传输量增大；可滚轮缩放时间范围。</span>
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
