import { useCallback, useEffect, useMemo, useState } from "react"
import { Navigate } from "react-router-dom"
import {
  CheckCircle2,
  CircleAlert,
  Clock3,
  Database,
  ListTodo,
  RefreshCw,
  ServerCog,
  TimerReset,
  Workflow,
} from "lucide-react"

import {
  fetchCeleryHistoryApi,
  fetchCeleryOverviewApi,
  type CeleryHistoryResponse,
  type CeleryOverviewResponse,
  type CeleryTaskExecution,
} from "../../api/client"
import { useAuth } from "../../auth/AuthContext"
import { hasPermission, PERMISSIONS } from "../../auth/permissions"
import { BrandLoading } from "../../components/BrandLoading"
import { Button } from "../../components/ui/button"
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

function ExecutionRows({ data }: { data: CeleryTaskExecution[] }) {
  if (!data.length) {
    return <div className="flex min-h-40 items-center justify-center px-4 text-sm text-muted-foreground">当前没有对应任务。</div>
  }
  return (
    <div className="max-h-[32rem] overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>任务</TableHead><TableHead>状态</TableHead><TableHead>Worker / 区域</TableHead><TableHead>队列</TableHead><TableHead>时间</TableHead><TableHead>耗时</TableHead><TableHead>结果</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item) => (
            <TableRow key={`${item.source}-${item.id}-${item.status}`}>
              <TableCell className="min-w-60 max-w-[22rem] align-top"><div className="truncate font-mono text-[11px]" title={item.name}>{item.name}</div><div className="mt-1 truncate font-mono text-[10px] text-muted-foreground" title={item.id}>{item.id}</div></TableCell>
              <TableCell className="align-top"><StateBadge status={item.status} /></TableCell>
              <TableCell className="min-w-44 align-top text-xs"><div className="truncate" title={item.worker}>{item.worker || "-"}</div><div className="mt-1 text-muted-foreground">{item.region || "未上报区域"}</div></TableCell>
              <TableCell className="align-top font-mono text-xs">{item.queue || "celery"}</TableCell>
              <TableCell className="min-w-36 align-top text-xs text-muted-foreground">{formatDateTime(item.finished_at ?? item.started_at ?? item.received_at ?? item.eta)}{item.eta ? <div className="mt-1">计划：{formatDateTime(item.eta)}</div> : null}</TableCell>
              <TableCell className="whitespace-nowrap align-top text-xs">{formatDuration(item.duration_ms)}</TableCell>
              <TableCell className="min-w-56 max-w-96 align-top text-xs">{item.error ? <div className="break-words text-rose-700 dark:text-rose-300">{item.error}</div> : item.result_summary ? <div className="break-words text-muted-foreground">{item.result_summary}</div> : <span className="text-muted-foreground">-</span>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export default function CeleryOperationsPage() {
  useDocumentTitle("Celery 运维")
  const { accessToken, user } = useAuth()
  const [overview, setOverview] = useState<CeleryOverviewResponse | null>(null)
  const [history, setHistory] = useState<CeleryHistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [tab, setTab] = useState<ExecutionTab>("active")

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true)
    else setLoading(true)
    setError("")
    try {
      const [nextOverview, nextHistory] = await Promise.all([
        fetchCeleryOverviewApi(accessToken ?? undefined),
        fetchCeleryHistoryApi(accessToken ?? undefined),
      ])
      setOverview(nextOverview)
      setHistory(nextHistory)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法读取 Celery 运行状态")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [accessToken])

  useEffect(() => { void load() }, [load])

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
  const tabs: Array<{ id: ExecutionTab; label: string; count: number }> = [
    { id: "active", label: "执行中", count: overview?.active_tasks.length ?? 0 },
    { id: "reserved", label: "待取任务", count: overview?.reserved_tasks.length ?? 0 },
    { id: "scheduled", label: "定时任务", count: overview?.scheduled_tasks.length ?? 0 },
    { id: "history", label: "历史记录", count: history?.data.length ?? 0 },
  ]

  return (
    <div className="mx-auto max-w-8xl pb-4">
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div><div className="flex items-center gap-2"><Workflow className="h-5 w-5 text-sky-600 dark:text-sky-300" aria-hidden /><h1 className="text-lg font-semibold text-foreground">Celery 运维</h1></div><p className="mt-1 text-xs text-muted-foreground">运行状态、默认队列、任务执行与历史记录。</p></div>
        <div className="flex items-center gap-2"><span className="rounded-full border border-border/80 bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground">只读</span><Button variant="outline" size="icon" onClick={() => void load(true)} disabled={refreshing} aria-label="刷新 Celery 状态" title="刷新"><RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden /></Button></div>
      </div>

      {error ? <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</div> : null}
      {overview?.inspection_message ? <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">{overview.inspection_message}</div> : null}

      <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border/80 bg-background px-4 py-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Database className="h-3.5 w-3.5" aria-hidden />Broker</div><div className="mt-2 flex items-center gap-2 text-sm font-semibold">{broker?.enabled ? broker.reachable ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden /> : <CircleAlert className="h-4 w-4 text-rose-600" aria-hidden /> : <CircleAlert className="h-4 w-4 text-amber-600" aria-hidden />}{broker?.enabled ? broker.reachable ? "可用" : "不可用" : "未启用"}</div><div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{broker?.database || "-"}</div></div>
        <div className="rounded-lg border border-border/80 bg-background px-4 py-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><ServerCog className="h-3.5 w-3.5" aria-hidden />Worker</div><div className="mt-2 text-sm font-semibold">{onlineWorkers} / {overview?.workers.length ?? 0} 在线</div><div className="mt-1 text-[11px] text-muted-foreground">inspect 与心跳联合判定</div></div>
        <div className="rounded-lg border border-border/80 bg-background px-4 py-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><ListTodo className="h-3.5 w-3.5" aria-hidden />队列积压</div><div className="mt-2 text-sm font-semibold">{pendingTasks.toLocaleString("zh-CN")}</div><div className="mt-1 text-[11px] text-muted-foreground">{overview?.queues.length ?? 0} 个任务队列</div></div>
        <div className="rounded-lg border border-border/80 bg-background px-4 py-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" aria-hidden />采样时间</div><div className="mt-2 text-sm font-semibold">{formatDateTime(overview?.generated_at)}</div><div className="mt-1 text-[11px] text-muted-foreground">手动刷新获取新快照</div></div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
        <section className="overflow-hidden rounded-lg border border-border/80 bg-background">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3"><div><h2 className="text-sm font-semibold">任务执行</h2><p className="mt-1 text-xs text-muted-foreground">实时视图不包含任务参数和密钥。</p></div><div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5" role="tablist" aria-label="Celery 任务视图">{tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={cn("h-8 rounded px-2.5 text-xs", tab === item.id ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>{item.label}<span className="ml-1.5 font-mono text-[10px] text-muted-foreground">{item.count}</span></button>)}</div></div>
          {tab === "history" && history?.message ? <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-[11px] text-amber-800 dark:text-amber-200">{history.message}</div> : null}
          <ExecutionRows data={execution} />
        </section>

        <div className="flex flex-col gap-4">
          <section className="overflow-hidden rounded-lg border border-border/80 bg-background"><div className="border-b border-border/70 px-4 py-3"><h2 className="text-sm font-semibold">Worker 状态</h2></div><div className="max-h-[23rem] overflow-auto"><Table><TableHeader><TableRow><TableHead>Worker</TableHead><TableHead>状态</TableHead><TableHead>负载</TableHead></TableRow></TableHeader><TableBody>{overview?.workers.length ? overview.workers.map((item) => <TableRow key={item.name}><TableCell className="min-w-48"><div className="truncate font-mono text-[11px]" title={item.name}>{item.name}</div><div className="mt-1 text-[11px] text-muted-foreground">{item.region || "未上报区域"} · {formatAge(item.heartbeat_age_seconds)}</div></TableCell><TableCell><WorkerBadge status={item.status} /></TableCell><TableCell className="text-xs"><div>执行 {item.active_count} / 待取 {item.reserved_count}</div><div className="mt-1 text-muted-foreground">并发 {item.concurrency ?? "-"} · 已处理 {item.processed_count}</div></TableCell></TableRow>) : <TableRow><TableCell colSpan={3} className="h-24 text-center text-sm text-muted-foreground">未发现 worker。</TableCell></TableRow>}</TableBody></Table></div></section>
          <section className="overflow-hidden rounded-lg border border-border/80 bg-background"><div className="border-b border-border/70 px-4 py-3"><h2 className="text-sm font-semibold">任务队列</h2></div><div className="max-h-[18rem] overflow-auto"><Table><TableHeader><TableRow><TableHead>队列</TableHead><TableHead>积压</TableHead><TableHead>路由</TableHead></TableRow></TableHeader><TableBody>{overview?.queues.length ? overview.queues.map((item) => <TableRow key={item.name}><TableCell className="font-mono text-xs">{item.name}</TableCell><TableCell className="font-medium">{item.pending_count.toLocaleString("zh-CN")}</TableCell><TableCell className="max-w-44 truncate font-mono text-[10px] text-muted-foreground" title={item.routing_keys.join(", ")}>{item.routing_keys.join(", ")}</TableCell></TableRow>) : <TableRow><TableCell colSpan={3} className="h-24 text-center text-sm text-muted-foreground">未读取到队列信息。</TableCell></TableRow>}</TableBody></Table></div></section>
        </div>
      </div>

      <section className="mt-4 overflow-hidden rounded-lg border border-border/80 bg-background"><div className="flex items-center gap-2 border-b border-border/70 px-4 py-3"><TimerReset className="h-4 w-4 text-muted-foreground" aria-hidden /><h2 className="text-sm font-semibold">已注册任务</h2></div><div className="max-h-[26rem] overflow-auto"><Table><TableHeader><TableRow><TableHead>任务</TableHead><TableHead>触发</TableHead><TableHead>周期</TableHead><TableHead>执行范围</TableHead><TableHead>说明</TableHead></TableRow></TableHeader><TableBody>{overview?.task_catalog.map((item) => <TableRow key={item.name}><TableCell className="min-w-64"><div className="font-medium text-xs">{item.display_name}</div><div className="mt-1 font-mono text-[10px] text-muted-foreground">{item.name}</div></TableCell><TableCell className="text-xs">{item.trigger}</TableCell><TableCell className="whitespace-nowrap text-xs">{item.schedule_seconds == null ? "按事件" : `${item.schedule_seconds} 秒`}</TableCell><TableCell className="text-xs">{item.execution_scope}</TableCell><TableCell className="min-w-64 text-xs text-muted-foreground">{item.description}</TableCell></TableRow>)}</TableBody></Table></div></section>
    </div>
  )
}
