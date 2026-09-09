import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Navigate } from "react-router-dom"
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Database,
  ListTodo,
  RefreshCw,
  ServerCog,
  TimerReset,
  Workflow,
  X,
} from "lucide-react"

import {
  fetchCeleryHistoryApi,
  fetchCeleryOverviewApi,
  type CeleryHistoryResponse,
  type CeleryOverviewResponse,
  type CeleryTaskCatalogItem,
  type CeleryTaskExecution,
} from "../../api/client"
import { useAuth } from "../../auth/AuthContext"
import { hasPermission, PERMISSIONS } from "../../auth/permissions"
import { BrandLoading } from "../../components/BrandLoading"
import { Button } from "../../components/ui/button"
import { BoundedVerticalSplit } from "../../components/ui/resizable"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table"
import { formatDateTime } from "../../lib/format"
import { useDocumentTitle } from "../../lib/useDocumentTitle"
import { cn } from "../../lib/utils"

type ExecutionTab = "active" | "reserved" | "scheduled" | "history"

const PAGE_SIZE = 50

const stateMeta: Record<string, { label: string; className: string }> = {
  SUCCESS: { label: "成功", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  STARTED: { label: "执行中", className: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  RESERVED: { label: "待取", className: "bg-violet-500/10 text-violet-700 dark:text-violet-300" },
  SCHEDULED: { label: "定时", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  RETRY: { label: "重试中", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  FAILURE: { label: "失败", className: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  PENDING: { label: "等待中", className: "bg-muted text-muted-foreground" },
  REVOKED: { label: "已撤销", className: "bg-muted text-muted-foreground" },
}

const workerMeta: Record<string, { label: string; className: string }> = {
  online: { label: "在线", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  stale: { label: "心跳超时", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  offline: { label: "已离线", className: "bg-rose-500/10 text-rose-700 dark:text-rose-300" },
  unknown: { label: "未知", className: "bg-muted text-muted-foreground" },
}

function StateBadge({ status }: { status: string }) {
  const meta = stateMeta[status] ?? { label: status || "未知", className: "bg-muted text-muted-foreground" }
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-medium", meta.className)}>{meta.label}</span>
}

function WorkerBadge({ status }: { status: string }) {
  const meta = workerMeta[status] ?? workerMeta.unknown
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-medium", meta.className)}>{meta.label}</span>
}

function formatDuration(value: number | null): string {
  if (value == null || value < 0) return "-"
  if (value < 1000) return `${value} ms`
  if (value < 60_000) return `${(value / 1000).toFixed(1)} 秒`
  return `${Math.floor(value / 60_000)} 分 ${Math.floor((value % 60_000) / 1000)} 秒`
}

function formatAge(value: number | null): string {
  if (value == null) return "-"
  if (value < 60) return `${value} 秒前`
  if (value < 3600) return `${Math.floor(value / 60)} 分前`
  return `${Math.floor(value / 3600)} 小时前`
}

function taskLabel(item: CeleryTaskExecution, labels: Map<string, string>): string {
  const fromApi = item.display_name?.trim()
  if (fromApi) return fromApi
  return labels.get(item.name) || item.name
}

function ExecutionRows({
  data,
  labels,
}: {
  data: CeleryTaskExecution[]
  labels: Map<string, string>
}) {
  if (!data.length) {
    return (
      <div className="flex min-h-40 flex-1 items-center justify-center px-4 text-sm text-muted-foreground">
        当前没有对应任务。
      </div>
    )
  }
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>任务</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>Worker / 区域</TableHead>
            <TableHead>队列</TableHead>
            <TableHead>时间</TableHead>
            <TableHead>耗时</TableHead>
            <TableHead>结果</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item) => {
            const label = taskLabel(item, labels)
            return (
              <TableRow key={`${item.source}-${item.id}-${item.status}`}>
                <TableCell className="min-w-60 max-w-[22rem] align-middle">
                  <div className="truncate text-xs font-medium" title={label}>{label}</div>
                  {label !== item.name ? (
                    <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground" title={item.name}>{item.name}</div>
                  ) : null}
                  <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground" title={item.id}>{item.id}</div>
                </TableCell>
                <TableCell className="align-middle"><StateBadge status={item.status} /></TableCell>
                <TableCell className="min-w-44 align-middle text-xs">
                  <div className="truncate" title={item.worker}>{item.worker || "-"}</div>
                  <div className="mt-1 text-muted-foreground">执行区 {item.region || "未上报区域"}</div>
                  {item.origin_region ? (
                    <div className="mt-1 text-muted-foreground">
                      来源区 {item.origin_region}{item.task_protocol ? ` · v${item.task_protocol}` : ""}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="align-middle font-mono text-xs">{item.queue || "celery"}</TableCell>
                <TableCell className="min-w-36 align-middle text-xs text-muted-foreground">
                  {formatDateTime(item.finished_at ?? item.started_at ?? item.received_at ?? item.eta)}
                  {item.eta ? <div className="mt-1">计划：{formatDateTime(item.eta)}</div> : null}
                </TableCell>
                <TableCell className="whitespace-nowrap align-middle text-xs">{formatDuration(item.duration_ms)}</TableCell>
                <TableCell className="min-w-56 max-w-96 align-middle text-xs">
                  {item.error ? (
                    <div className="break-words text-rose-700 dark:text-rose-300">{item.error}</div>
                  ) : item.result_summary ? (
                    <div className="break-words text-muted-foreground">{item.result_summary}</div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function RegisteredTasksDrawer({
  open,
  onOpenChange,
  catalog,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  catalog: CeleryTaskCatalogItem[]
}) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onOpenChange])

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-[200]">
      <div
        role="presentation"
        aria-hidden
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />
      <aside
        className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col bg-card shadow-xl ring-1 ring-border/70"
        role="dialog"
        aria-modal="true"
        aria-labelledby="celery-registered-tasks-title"
      >
        <h2 id="celery-registered-tasks-title" className="sr-only">已注册任务</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4 z-10 text-muted-foreground hover:text-foreground"
          aria-label="关闭已注册任务"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
        <div className="min-h-0 flex-1 overflow-auto px-6 py-5 pt-14">
          {catalog.length ? (
            <ul className="space-y-3">
              {catalog.map((item) => {
                const period = item.schedule_seconds == null ? "按事件" : `${item.schedule_seconds} 秒`
                const scheduled = item.schedule_seconds != null
                return (
                  <li key={item.name} className="overflow-hidden rounded-lg border border-primary/20 bg-primary/5">
                    <div className="flex">
                      <span className="w-1.5 shrink-0 bg-primary" aria-hidden />
                      <div className="min-w-0 flex-1 px-4 py-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold text-foreground" title={item.display_name}>{item.display_name}</h3>
                            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground" title={item.name}>{item.name}</p>
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                            {scheduled ? <Clock3 className="h-3 w-3" aria-hidden /> : <Workflow className="h-3 w-3" aria-hidden />}
                            {item.trigger} · {period}
                          </span>
                        </div>
                        <p className="mt-2 truncate text-xs text-muted-foreground" title={[item.execution_scope, item.description].filter(Boolean).join(" · ")}>
                          {item.execution_scope}
                          {item.description ? ` · ${item.description}` : ""}
                        </p>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="flex h-24 items-center justify-center text-sm text-muted-foreground">暂无已注册任务。</p>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  )
}

export default function CeleryOperationsPage() {
  useDocumentTitle("Celery 运维")
  const { accessToken, user } = useAuth()
  const [overview, setOverview] = useState<CeleryOverviewResponse | null>(null)
  const [history, setHistory] = useState<CeleryHistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [error, setError] = useState("")
  const [tab, setTab] = useState<ExecutionTab>("history")
  const [page, setPage] = useState(1)
  const [catalogOpen, setCatalogOpen] = useState(false)
  const pageRef = useRef(1)
  pageRef.current = page

  const loadHistory = useCallback(async (targetPage: number) => {
    setHistoryLoading(true)
    try {
      const offset = Math.max(targetPage - 1, 0) * PAGE_SIZE
      const nextHistory = await fetchCeleryHistoryApi(accessToken ?? undefined, {
        limit: PAGE_SIZE,
        offset,
      })
      const total = nextHistory.total ?? nextHistory.data.length
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1)
      if (total > 0 && targetPage > totalPages) {
        const clamped = await fetchCeleryHistoryApi(accessToken ?? undefined, {
          limit: PAGE_SIZE,
          offset: (totalPages - 1) * PAGE_SIZE,
        })
        setHistory(clamped)
        setPage(totalPages)
        return
      }
      setHistory(nextHistory)
      setPage(targetPage)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法读取 Celery 运行状态")
    } finally {
      setHistoryLoading(false)
    }
  }, [accessToken])

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    else setLoading(true)
    setError("")
    try {
      const [nextOverview] = await Promise.all([
        fetchCeleryOverviewApi(accessToken ?? undefined),
        loadHistory(pageRef.current),
      ])
      setOverview(nextOverview)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法读取 Celery 运行状态")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [accessToken, loadHistory])

  useEffect(() => { void load() }, [load])

  const labels = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of overview?.task_catalog ?? []) {
      map.set(item.name, item.display_name)
    }
    return map
  }, [overview?.task_catalog])

  const execution = useMemo(() => {
    if (!overview) return []
    if (tab === "active") return overview.active_tasks
    if (tab === "reserved") return overview.reserved_tasks
    if (tab === "scheduled") return overview.scheduled_tasks
    return history?.data ?? []
  }, [history?.data, overview, tab])

  if (!hasPermission(user, PERMISSIONS.storageOperationsManage)) {
    return <Navigate to="/data/basic/region" replace />
  }
  if (loading && !overview) {
    return <div className="flex h-full min-h-80 items-center justify-center"><BrandLoading label="正在读取 Celery 运行状态..." /></div>
  }

  const broker = overview?.broker
  const onlineWorkers = overview?.workers.filter((item) => item.status === "online").length ?? 0
  const pendingTasks = overview?.queues.reduce((total, item) => total + item.pending_count, 0) ?? 0
  const historyTotal = history?.total ?? history?.data.length ?? 0
  const totalPages = Math.max(1, Math.ceil(historyTotal / PAGE_SIZE) || 1)
  const tabs: Array<{ id: ExecutionTab; label: string; count: number }> = [
    { id: "active", label: "执行中", count: overview?.active_tasks.length ?? 0 },
    { id: "reserved", label: "待取任务", count: overview?.reserved_tasks.length ?? 0 },
    { id: "scheduled", label: "定时任务", count: overview?.scheduled_tasks.length ?? 0 },
    { id: "history", label: "历史记录", count: historyTotal },
  ]

  return (
    <div className="mx-auto flex h-full min-h-0 max-w-8xl flex-col">
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Workflow className="h-5 w-5 text-sky-600 dark:text-sky-300" aria-hidden />
            <h1 className="text-lg font-semibold text-foreground">Celery 运维</h1>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">区域队列、Worker、任务执行与历史记录。</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border/80 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground">只读</span>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setCatalogOpen(true)}>
            <TimerReset className="h-3.5 w-3.5" aria-hidden />
            已注册任务
          </Button>
          <Button variant="outline" size="icon" onClick={() => void load(true)} disabled={refreshing} aria-label="刷新 Celery 状态" title="刷新">
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden />
          </Button>
        </div>
      </div>

      {error ? <div className="mb-4 shrink-0 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</div> : null}
      {overview?.inspection_message ? <div className="mb-4 shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">{overview.inspection_message}</div> : null}

      <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border/80 bg-card px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Database className="h-3.5 w-3.5" aria-hidden />Broker</div>
          <div className="mt-2 flex items-center gap-2 text-sm font-semibold">
            {broker?.enabled ? broker.reachable ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> : <CircleAlert className="h-4 w-4 text-rose-600" aria-hidden /> : <CircleAlert className="h-4 w-4 text-amber-600" aria-hidden />}
            {broker?.enabled ? broker.reachable ? "可用" : "不可用" : "未启用"}
          </div>
          <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{broker?.database || "-"}</div>
          <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground" title={broker?.expected_queue}>
            {broker?.region || "-"} · v{broker?.task_protocol || "-"} · {broker?.expected_queue || "未配置队列"}
          </div>
        </div>
        <div className="rounded-lg border border-border/80 bg-card px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><ServerCog className="h-3.5 w-3.5" aria-hidden />Worker</div>
          <div className="mt-2 text-sm font-semibold">{onlineWorkers} / {overview?.workers.length ?? 0} 在线</div>
          <div className="mt-1 text-[11px] text-muted-foreground">inspect 与心跳联合判定</div>
        </div>
        <div className="rounded-lg border border-border/80 bg-card px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><ListTodo className="h-3.5 w-3.5" aria-hidden />队列积压</div>
          <div className="mt-2 text-sm font-semibold">{pendingTasks.toLocaleString("zh-CN")}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">{overview?.queues.length ?? 0} 个任务队列</div>
        </div>
        <div className="rounded-lg border border-border/80 bg-card px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" aria-hidden />采样时间</div>
          <div className="mt-2 text-sm font-semibold">{formatDateTime(overview?.generated_at)}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">手动刷新获取新快照</div>
        </div>
      </div>

      <BoundedVerticalSplit
        className="mt-4"
        measureKey={`${overview?.workers.length ?? 0}:${overview?.queues.length ?? 0}:${overview?.beat_leaders.length ?? 0}`}
        top={(
          <div data-bounded-split-content className="grid h-full min-h-0 gap-4 lg:grid-cols-3">
            <section data-bounded-split-card className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/80 bg-card">
              <div data-bounded-split-card-header className="shrink-0 border-b border-border/70 px-4 py-3"><h2 className="text-sm font-semibold">Worker 状态</h2></div>
              <div className="min-h-0 flex-1 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Worker</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>负载</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview?.workers.length ? overview.workers.map((item) => (
                      <TableRow key={item.name}>
                        <TableCell className="min-w-40">
                          <div className="truncate font-mono text-[11px]" title={item.name}>{item.name}</div>
                          <div className="mt-1 text-[11px] text-muted-foreground">{item.region || "未上报区域"} · {formatAge(item.heartbeat_age_seconds)}</div>
                          <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground" title={item.queue}>
                            {item.queue || "未上报队列"} · v{item.task_protocol || "-"} · {item.beat_enabled ? "参与 Beat" : "仅 Worker"}
                          </div>
                        </TableCell>
                        <TableCell><WorkerBadge status={item.status} /></TableCell>
                        <TableCell className="text-xs">
                          <div>执行 {item.active_count} / 待取 {item.reserved_count}</div>
                          <div className="mt-1 text-muted-foreground">并发 {item.concurrency ?? "-"} · 已处理 {item.processed_count}</div>
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={3} className="h-20 text-center text-sm text-muted-foreground">未发现 worker。</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>

            <section data-bounded-split-card className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/80 bg-card">
              <div data-bounded-split-card-header className="shrink-0 border-b border-border/70 px-4 py-3"><h2 className="text-sm font-semibold">任务队列</h2></div>
              <div className="min-h-0 flex-1 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>队列</TableHead>
                      <TableHead>积压</TableHead>
                      <TableHead>Worker</TableHead>
                      <TableHead>路由</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview?.queues.length ? overview.queues.map((item) => (
                      <TableRow key={item.name}>
                        <TableCell className="font-mono text-xs">{item.name}</TableCell>
                        <TableCell className="font-medium">{item.pending_count.toLocaleString("zh-CN")}</TableCell>
                        <TableCell className="text-xs">{item.worker_count}</TableCell>
                        <TableCell className="max-w-36 truncate font-mono text-[10px] text-muted-foreground" title={item.routing_keys.join(", ")}>
                          {item.routing_keys.join(", ")}
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={4} className="h-20 text-center text-sm text-muted-foreground">未读取到队列信息。</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>

            <section data-bounded-split-card className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border/80 bg-card">
              <div data-bounded-split-card-header className="shrink-0 border-b border-border/70 px-4 py-3"><h2 className="text-sm font-semibold">Beat 领导者</h2></div>
              <div className="min-h-0 flex-1 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>区域协议</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview?.beat_leaders.length ? overview.beat_leaders.map((item) => (
                      <TableRow key={item.key}>
                        <TableCell className="min-w-40">
                          <div className="truncate font-mono text-[10px]" title={item.key}>{item.key}</div>
                          <div className="mt-1 truncate text-[10px] text-muted-foreground" title={item.owner}>{item.owner || "-"}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {item.active ? (
                            <span className="text-emerald-700 dark:text-emerald-300">持有中</span>
                          ) : (
                            <span className="text-muted-foreground">已过期</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={2} className="h-20 text-center text-sm text-muted-foreground">尚未发现 Beat 租约。</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>
        )}
        bottom={(
      <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/80 bg-card">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">任务执行</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {tab === "history"
                ? "历史记录保留最近 30 天，可分页查询全部未过期记录；不包含任务参数和密钥。"
                : "实时视图不包含任务参数和密钥。执行中任务会合并 Worker inspect 与未完成历史记录。"}
            </p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-md border border-border bg-muted/40 p-1" aria-label="Celery 任务视图">
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "h-8 rounded px-3 text-xs",
                  tab === item.id ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
                <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{item.count.toLocaleString("zh-CN")}</span>
              </button>
            ))}
          </div>
        </div>
        {tab === "history" && history?.message ? (
          <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-[11px] text-amber-800 dark:text-amber-200">{history.message}</div>
        ) : null}
        {historyLoading && tab === "history" && !history?.data.length ? (
          <div className="flex flex-1 items-center justify-center"><BrandLoading compact label="正在读取历史记录" /></div>
        ) : (
          <ExecutionRows data={execution} labels={labels} />
        )}
        {tab === "history" ? (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/70 px-4 py-3">
            <span className="text-xs text-muted-foreground">
              {historyTotal
                ? `共 ${historyTotal.toLocaleString("zh-CN")} 条，第 ${page} / ${totalPages} 页`
                : "暂无历史记录"}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-md"
                title="上一页"
                disabled={historyLoading || page <= 1}
                onClick={() => void loadHistory(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-md"
                title="下一页"
                disabled={historyLoading || page >= totalPages}
                onClick={() => void loadHistory(page + 1)}
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        ) : null}
      </section>
        )}
      />

      <RegisteredTasksDrawer
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        catalog={overview?.task_catalog ?? []}
      />
    </div>
  )
}
