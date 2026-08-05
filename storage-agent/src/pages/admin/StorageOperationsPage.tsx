import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Navigate } from "react-router-dom"
import {
  Activity,
  Box,
  CheckCircle2,
  CircleAlert,
  CircleX,
  Clock3,
  DatabaseZap,
  Gauge,
  HardDrive,
  LoaderCircle,
  Info,
  RefreshCw,
  RotateCcw,
  ServerCog,
  ShieldCheck,
  WifiOff,
  Wrench,
  X,
} from "lucide-react"
import { useAuth } from "../../auth/AuthContext"
import { hasPermission, PERMISSIONS } from "../../auth/permissions"
import {
  fetchClusterHealthOperationsApi,
  fetchClusterHealStatusApi,
  fetchReplicationOperationsApi,
  fetchStorageOperationsApi,
  reconcileReplicationApi,
  startClusterHealApi,
  startReplicationResyncApi,
  type ClusterHealthItem,
  type ClusterHealthResponse,
  type ClusterHealStatusResponse,
  type ReplicationOperationsResponse,
  type ReplicationSourceMetric,
  type ReplicationStatusReason,
  type ReplicationTargetMetric,
  type StorageOperationHealth,
  type StorageOperationItem,
} from "../../api/client"
import { Button } from "../../components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { Input } from "../../components/ui/input"
import { Label } from "../../components/ui/label"
import { Progress } from "../../components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table"
import { cn } from "../../lib/utils"

type OperationsView = "replication" | "clusters"

const sourceAggregateReasonCodes = new Set([
  "critical_target_links",
  "degraded_target_links",
  "syncing_target_links",
  "replication_transfer_active",
])

const replicationStatusMeta: Record<
  StorageOperationHealth,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  healthy: { label: "当前正常", className: "text-emerald-700 bg-emerald-500/10 dark:text-emerald-300", icon: CheckCircle2 },
  syncing: { label: "同步中", className: "text-sky-700 bg-sky-500/10 dark:text-sky-300", icon: LoaderCircle },
  degraded: { label: "需关注", className: "text-amber-700 bg-amber-500/10 dark:text-amber-300", icon: CircleAlert },
  critical: { label: "异常", className: "text-rose-700 bg-rose-500/10 dark:text-rose-300", icon: CircleAlert },
  unreachable: { label: "不可达", className: "text-rose-700 bg-rose-500/10 dark:text-rose-300", icon: WifiOff },
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B"
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"]
  const index = Math.max(
    0,
    Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1),
  )
  const scaled = value / 1024 ** index
  return `${scaled.toFixed(scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2)} ${units[index]}`
}

function formatRate(value: number): string {
  return `${formatBytes(value)}/s`
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "—"
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(parsed)
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 秒"
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days) return `${days} 天 ${hours} 小时`
  if (hours) return `${hours} 小时 ${minutes} 分钟`
  if (minutes) return `${minutes} 分钟`
  return `${Math.floor(seconds)} 秒`
}

function ReplicationStatus({
  status,
  scope = "aggregate",
}: {
  status: StorageOperationHealth
  scope?: "aggregate" | "link"
}) {
  const meta = replicationStatusMeta[status]
  const Icon = meta.icon
  const label = status === "healthy" && scope === "link" ? "链路正常" : meta.label
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium", meta.className)}>
      <Icon className={cn("h-3.5 w-3.5", status === "syncing" && "animate-spin")} aria-hidden />
      {label}
    </span>
  )
}

function uniqueStatusReasons(reasons: ReplicationStatusReason[]): ReplicationStatusReason[] {
  const seen = new Set<string>()
  return reasons.filter((reason) => {
    const message = reason.message.trim()
    if (!message) return false
    const key = `${reason.code}:${statusReasonText(reason)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function statusReasonText(reason: ReplicationStatusReason): string {
  const { value } = reason
  if (value === null || value === undefined || value === "") return reason.message
  if (typeof value === "number") return `${reason.message}（${value.toLocaleString("zh-CN")}）`
  if (typeof value === "string") {
    const detail = value.length > 120 ? `${value.slice(0, 120)}…` : value
    return `${reason.message}（${detail}）`
  }
  if (typeof value === "object") {
    const counts = value as { actual?: unknown; expected?: unknown }
    if (counts.actual !== undefined && counts.expected !== undefined) {
      return `${reason.message}（实际 ${String(counts.actual)} / 预期 ${String(counts.expected)}）`
    }
  }
  return reason.message
}

function StatusReasonSummary({
  status,
  reasons = [],
  mrfCount = 0,
  label,
}: {
  status: StorageOperationHealth
  reasons?: ReplicationStatusReason[]
  mrfCount?: number
  label: string
}) {
  const normalized = uniqueStatusReasons(reasons)
  const statusReasons = normalized.filter((reason) => reason.severity !== "info")
  const diagnostics = normalized.filter((reason) => reason.severity === "info")
  const hasMrfDiagnostic = diagnostics.some((reason) => reason.code === "mrf_recent_backlog_observed")
  const diagnosticMessages = diagnostics.map(statusReasonText)
  if (mrfCount > 0 && !hasMrfDiagnostic) {
    diagnosticMessages.push(
      `MinIO MRF 近 5 分钟诊断计数为 ${mrfCount}；该指标可能在故障恢复后继续粘滞，不代表当前仍在漏复制。`,
    )
  }
  const reasonMessages = statusReasons.map(statusReasonText)
  const reasonText = reasonMessages.length > 0
    ? reasonMessages.join("；")
    : status === "healthy"
      ? "当前没有影响状态的异常条件。"
      : "后端暂未返回具体判定原因，请刷新后查看源站与链路指标。"

  return (
    <div className="shrink-0 border-b border-border/60 bg-muted/15 px-3 py-2 text-[11px] leading-5">
      <div className="flex items-start gap-2">
        {status === "healthy"
          ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
          : <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />}
        <div className="min-w-0">
          <span className="font-medium text-foreground">{label}判定依据：</span>
          <span className="text-muted-foreground">{reasonText}</span>
        </div>
      </div>
      {diagnosticMessages.length > 0 ? (
        <div className="mt-0.5 flex items-start gap-2 text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <div className="min-w-0">
            <span className="font-medium text-foreground">诊断提示：</span>
            {diagnosticMessages.join("；")}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ClusterStatus({ status }: { status: ClusterHealthItem["status"] }) {
  const meta = status === "online"
    ? { label: "在线", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", Icon: CheckCircle2 }
    : status === "degraded"
      ? { label: "降级", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300", Icon: CircleAlert }
      : { label: "离线", className: "bg-rose-500/10 text-rose-700 dark:text-rose-300", Icon: WifiOff }
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium", meta.className)}>
      <meta.Icon className="h-3.5 w-3.5" aria-hidden />
      {meta.label}
    </span>
  )
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[360px] flex-1 flex-col items-center justify-center gap-3 text-xs text-muted-foreground">
      <LoaderCircle className="h-7 w-7 animate-spin text-primary" aria-hidden />
      {label}
    </div>
  )
}

interface LinkRow {
  source: ReplicationSourceMetric
  target: ReplicationTargetMetric
}

type ActionNotice = {
  kind: "success" | "info" | "error"
  title: string
  description: string
}

function resyncStatusMeta(target: ReplicationTargetMetric) {
  switch (target.resync_status) {
    case "running":
      return { label: "补传中", className: "text-sky-700 dark:text-sky-300", Icon: LoaderCircle }
    case "completed":
      return { label: "已完成", className: "text-emerald-700 dark:text-emerald-300", Icon: CheckCircle2 }
    case "partial":
      return { label: "部分失败", className: "text-amber-700 dark:text-amber-300", Icon: CircleAlert }
    case "failed":
      return { label: "补传失败", className: "text-rose-700 dark:text-rose-300", Icon: CircleX }
  }
  if (!target.arn) {
    return { label: "规则缺失", className: "text-rose-700 dark:text-rose-300", Icon: CircleX }
  }
  if (!target.online) {
    return { label: "目标离线", className: "text-rose-700 dark:text-rose-300", Icon: WifiOff }
  }
  if (target.resync_status === "unknown") {
    return { label: "状态未知", className: "text-amber-700 dark:text-amber-300", Icon: CircleAlert }
  }
  return { label: "未执行", className: "text-muted-foreground", Icon: DatabaseZap }
}

function resyncElapsed(target: ReplicationTargetMetric): string {
  if (!target.resync_started_at) return "—"
  const started = new Date(target.resync_started_at).getTime()
  const updated = target.resync_status === "running"
    ? Date.now()
    : new Date(target.resync_updated_at ?? "").getTime()
  if (!Number.isFinite(started) || !Number.isFinite(updated) || updated < started) return "—"
  return formatDuration(Math.round((updated - started) / 1000))
}

function resyncProgressText(target: ReplicationTargetMetric): string {
  if (target.resync_status === "idle" || !target.resync_status) return "尚无任务记录"
  if (target.resync_status === "unknown") return "无法读取 MinIO 状态"
  const processed = `${(target.resync_object_count ?? 0).toLocaleString("zh-CN")} 个 · ${formatBytes(target.resync_completed_bytes ?? 0)}`
  if (target.resync_status === "partial") {
    return `${target.resync_failed_count ?? 0} 个失败 · ${processed}`
  }
  if (target.resync_status === "failed") {
    return target.resync_error || `${target.resync_failed_count ?? 0} 个对象失败`
  }
  return processed
}

function resyncGuidance(target: ReplicationTargetMetric): string {
  switch (target.resync_status) {
    case "running":
      return "MinIO 正在扫描并补传。原生接口不提供待扫描总量，因此无法计算百分比；请以已处理对象、数据量和耗时判断推进，不要重复启动。"
    case "completed":
      return "本次补传已完成。表格中的“历史累计失败”不会因补传成功清零，请结合本次失败数、近 1 小时失败和两端对象一致性判断结果。"
    case "partial":
      return "本次扫描完成，但仍有对象补传失败。待链路稳定后可再次补传；若连续失败，请人工检查源节点 MinIO 日志、目标桶写权限、容量和版本控制状态。"
    case "failed":
      return "任务未完成。请先检查两端在线状态、目标容量和复制规则，再查看源节点 MinIO 日志定位具体对象后重试。"
  }
  if (!target.arn) return "当前方向没有可用复制规则。先执行“校准规则”，确认链路恢复后再启动补传。"
  if (!target.online) return "目标站点当前不可达。先恢复目标 MinIO、网络和容量状态，刷新确认在线后再补传。"
  if (target.resync_status === "unknown") {
    return "后端暂时无法读取 MinIO 补传状态。为避免重复任务，当前不允许启动；请刷新，仍失败时检查源节点管理 API 和 mc 日志。"
  }
  return "MinIO 未返回该方向的补传记录。启动后页面会自动轮询；若仍没有记录，请根据操作反馈检查复制规则、目标在线状态和源节点 MinIO 日志。"
}

function actionErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  try {
    const parsed = JSON.parse(raw) as { data?: { reason?: string }; msg?: string; message?: string }
    return parsed.data?.reason || parsed.msg || parsed.message || "请求失败"
  } catch {
    return raw || "请求失败"
  }
}

function resyncOperationTitle(target: ReplicationTargetMetric): string {
  const meta = resyncStatusMeta(target)
  return `${meta.label} · ${resyncProgressText(target)}`
}

function ReplicationWorkspace({ accessToken }: { accessToken?: string }) {
  const [data, setData] = useState<ReplicationOperationsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [resyncing, setResyncing] = useState(false)
  const [resyncTarget, setResyncTarget] = useState<LinkRow | null>(null)
  const [olderThan, setOlderThan] = useState("")
  const [actionNotice, setActionNotice] = useState<ActionNotice | null>(null)
  const loadInFlightRef = useRef<Promise<void> | null>(null)

  const load = useCallback((
    quiet = false,
    showRefreshing = quiet,
    bucketFilter?: string,
  ): Promise<void> => {
    if (loadInFlightRef.current) return loadInFlightRef.current

    const request = (async () => {
      if (!quiet) setLoading(true)
      else if (showRefreshing) setRefreshing(true)
      try {
        const response = await fetchReplicationOperationsApi(bucketFilter, accessToken)
        setData((current) => {
          if (!bucketFilter || !current) return response
          const refreshedBucket = response.buckets[0]
          if (!refreshedBucket) return current
          return {
            ...current,
            generated_at: response.generated_at,
            buckets: current.buckets.map((item) => (
              item.bucket === refreshedBucket.bucket ? refreshedBucket : item
            )),
          }
        })
        if (!bucketFilter) {
          setSelectedBucket((current) => {
            if (current && response.buckets.some((item) => item.bucket === current)) return current
            return response.buckets[0]?.bucket ?? null
          })
        }
      } finally {
        if (!quiet) setLoading(false)
        if (showRefreshing) setRefreshing(false)
        loadInFlightRef.current = null
      }
    })()
    loadInFlightRef.current = request
    return request
  }, [accessToken])

  useEffect(() => {
    void load()
  }, [load])

  const bucket = useMemo(
    () => data?.buckets.find((item) => item.bucket === selectedBucket) ?? null,
    [data, selectedBucket],
  )
  const links = useMemo<LinkRow[]>(
    () => bucket?.sources.flatMap((source) => source.targets.map((target) => ({ source, target }))) ?? [],
    [bucket],
  )
  const inspectedResync = useMemo(() => {
    if (!resyncTarget) return null
    return links.find(({ source, target }) => (
      source.server === resyncTarget.source.server
      && target.target === resyncTarget.target.target
    )) ?? resyncTarget
  }, [links, resyncTarget])
  const hasRunningResync = useMemo(
    () => data?.buckets.some((item) => (
      item.sources.some((source) => source.targets.some((target) => target.resync_status === "running"))
    )) ?? false,
    [data],
  )
  const bucketSummary = useMemo(() => {
    const sources = bucket?.sources ?? []
    return {
      expected: sources.reduce((sum, item) => sum + item.expected_target_count, 0),
      actual: sources.reduce((sum, item) => sum + item.actual_target_count, 0),
      queued: sources.reduce((sum, item) => sum + item.queued_count, 0),
      queuedBytes: sources.reduce((sum, item) => sum + item.queued_bytes, 0),
      mrf: sources.reduce((sum, item) => sum + item.mrf_failed_last_5m, 0),
      recentFailed: sources.reduce((sum, item) => sum + (item.recent_failed_count ?? 0), 0),
    }
  }, [bucket])
  const bucketStatusReasons = useMemo<ReplicationStatusReason[]>(() => {
    if (!bucket) return []
    const details: ReplicationStatusReason[] = []
    for (const source of bucket.sources) {
      for (const reason of source.status_reasons ?? []) {
        if (sourceAggregateReasonCodes.has(reason.code)) continue
        details.push({ ...reason, message: `${source.server}：${reason.message}` })
      }
      for (const target of source.targets) {
        for (const reason of target.status_reasons ?? []) {
          details.push({
            ...reason,
            message: `${source.server} → ${target.target}：${reason.message}`,
          })
        }
      }
    }
    return details.length > 0 ? details : (bucket.status_reasons ?? [])
  }, [bucket])

  const reconcile = async () => {
    if (!bucket) return
    setReconciling(true)
    try {
      const response = await reconcileReplicationApi(bucket.bucket, accessToken)
      setActionNotice({
        kind: "success",
        title: response.message,
        description: `${bucket.bucket} 的全连接规则已重新校准，请结合链路状态确认目标均在线。`,
      })
      await load(true)
    } catch (error) {
      setActionNotice({
        kind: "error",
        title: "复制规则校准失败",
        description: `${actionErrorMessage(error)}。请检查 MinIO 管理接口与站点连通性后重试。`,
      })
    } finally {
      setReconciling(false)
    }
  }

  const startResync = async () => {
    if (!bucket || !inspectedResync) return
    setResyncing(true)
    try {
      const response = await startReplicationResyncApi(
        bucket.bucket,
        {
          source_server: inspectedResync.target.source,
          target_server: inspectedResync.target.target,
          older_than: olderThan.trim() || null,
        },
        accessToken,
      )
      const alreadyRunning = response.detail.already_running === true
      setActionNotice({
        kind: alreadyRunning ? "info" : "success",
        title: response.message,
        description: alreadyRunning
          ? "系统已接管现有任务并继续轮询，无需再次操作。"
          : "系统将每 10 秒读取 MinIO 原生状态；补传结束后会保留完成或失败结果。",
      })
      setResyncTarget(null)
      setOlderThan("")
      await load(true, false, bucket.bucket)
    } catch (error) {
      const reason = actionErrorMessage(error)
      const alreadyRunning = /already in progress|already running|正在运行/i.test(reason)
      setActionNotice({
        kind: alreadyRunning ? "info" : "error",
        title: alreadyRunning ? "已有补传任务" : "补传未启动",
        description: alreadyRunning
          ? "MinIO 已有相同方向任务，页面会刷新并跟踪现有进度。"
          : `${reason}。请先刷新确认规则与目标在线；仍失败时检查源节点 MinIO 日志、目标容量和写权限。`,
      })
      if (alreadyRunning) await load(true, false, bucket.bucket)
    } finally {
      setResyncing(false)
    }
  }

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return
      void load(true, false).catch(() => undefined)
    }
    let lastResumeRefreshAt = 0
    const refreshOnResume = () => {
      if (document.visibilityState !== "visible") return
      const now = Date.now()
      if (now - lastResumeRefreshAt < 1_000) return
      lastResumeRefreshAt = now
      refreshWhenVisible()
    }
    const timer = window.setInterval(refreshWhenVisible, hasRunningResync ? 10_000 : 60_000)
    window.addEventListener("focus", refreshOnResume)
    document.addEventListener("visibilitychange", refreshOnResume)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", refreshOnResume)
      document.removeEventListener("visibilitychange", refreshOnResume)
    }
  }, [hasRunningResync, load])

  if (loading) return <LoadingState label="正在读取五地复制状态..." />
  if (!data) return <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">复制状态暂不可用</div>

  const summary = data.summary
  const inspectedTarget = inspectedResync?.target ?? null
  const inspectedMeta = inspectedTarget ? resyncStatusMeta(inspectedTarget) : null
  const InspectedIcon = inspectedMeta?.Icon
  const canStartInspected = Boolean(
    inspectedTarget?.arn
    && inspectedTarget.online
    && inspectedTarget.resync_status !== "running"
    && inspectedTarget.resync_status !== "unknown",
  )
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-2 border-b border-border/70 md:grid-cols-6">
        <div className="border-b border-r border-border/60 px-4 py-3 md:border-b-0">
          <div className="text-[11px] text-muted-foreground">总体状态</div>
          <div className="mt-1"><ReplicationStatus status={summary.status} /></div>
        </div>
        <div className="border-b border-border/60 px-4 py-3 md:border-b-0 md:border-r">
          <div className="text-[11px] text-muted-foreground">在线链路</div>
          <div className="mt-1 text-sm font-semibold">{summary.online_link_count} / {summary.expected_link_count}</div>
        </div>
        <div className="border-b border-r border-border/60 px-4 py-3 md:border-b-0">
          <div className="text-[11px] text-muted-foreground">等待复制</div>
          <div className="mt-1 text-sm font-semibold">{summary.queued_count} · {formatBytes(summary.queued_bytes)}</div>
        </div>
        <div className="border-b border-border/60 px-4 py-3 md:border-b-0 md:border-r" title="MinIO 进程生命周期累计值，补传成功后不会清零">
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">历史累计失败 <Info className="h-3 w-3" aria-hidden /></div>
          <div className="mt-1 text-sm font-semibold">{summary.failed_count} · {formatBytes(summary.failed_bytes)}</div>
        </div>
        <div className="border-r border-border/60 px-4 py-3">
          <div className="text-[11px] text-muted-foreground">近 1 小时失败</div>
          <div className="mt-1 text-sm font-semibold">{summary.recent_failed_count ?? 0} · {formatBytes(summary.recent_failed_bytes ?? 0)}</div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[11px] text-muted-foreground">当前吞吐</div>
          <div className="mt-1 text-sm font-semibold">{formatRate(summary.current_rate_bps)}</div>
        </div>
      </div>
      <StatusReasonSummary
        status={summary.status}
        reasons={summary.status_reasons}
        mrfCount={summary.mrf_failed_last_5m}
        label="总体状态"
      />

      {actionNotice ? (
        <div className={cn(
          "flex shrink-0 items-start gap-2 border-b px-4 py-2.5 text-xs",
          actionNotice.kind === "success" && "border-emerald-500/20 bg-emerald-500/5 text-emerald-800 dark:text-emerald-200",
          actionNotice.kind === "info" && "border-sky-500/20 bg-sky-500/5 text-sky-800 dark:text-sky-200",
          actionNotice.kind === "error" && "border-rose-500/20 bg-rose-500/5 text-rose-800 dark:text-rose-200",
        )} role="status">
          {actionNotice.kind === "success"
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            : actionNotice.kind === "info"
              ? <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
          <div className="min-w-0 flex-1">
            <div className="font-medium">{actionNotice.title}</div>
            <div className="mt-0.5 text-[11px] opacity-80">{actionNotice.description}</div>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label="关闭操作提示" onClick={() => setActionNotice(null)}>
            <X className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="min-h-0 border-b border-border/70 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
            <span className="text-[11px] font-medium text-muted-foreground">受管存储桶 · {data.buckets.length}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="刷新复制状态"
              aria-label="刷新复制状态"
              disabled={refreshing}
              onClick={() => void load(true)}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} aria-hidden />
            </Button>
          </div>
          <div className="docs-scroll max-h-48 overflow-y-auto p-2 lg:max-h-none lg:h-[calc(100%-45px)]">
            {data.buckets.map((item) => (
              <button
                key={item.bucket}
                type="button"
                className={cn(
                  "mb-1 flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left hover:bg-muted/60",
                  selectedBucket === item.bucket && "bg-muted",
                )}
                onClick={() => setSelectedBucket(item.bucket)}
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{item.bucket}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{item.shown_name || "未关联显示名"}</span>
                </span>
                <ReplicationStatus status={item.status} />
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <div className="truncate text-sm font-semibold">{bucket?.bucket ?? "未选择存储桶"}</div>
                {bucket ? <ReplicationStatus status={bucket.status} /> : null}
              </div>
              <div className="text-[10px] text-muted-foreground">
                链路 {bucketSummary.actual}/{bucketSummary.expected} · 等待 {bucketSummary.queued}（{formatBytes(bucketSummary.queuedBytes)}）· 近 1 小时失败 {bucketSummary.recentFailed} · <span title="MinIO MRF 指标可能在故障恢复后继续粘滞，仅用于诊断，不代表当前仍在漏复制">MRF 诊断 {bucketSummary.mrf}（可能粘滞）</span> · {formatDateTime(data.generated_at)}
              </div>
            </div>
            <Button variant="outline" size="sm" disabled={!bucket || reconciling} onClick={() => void reconcile()}>
              <RotateCcw className={cn("mr-1.5 h-3.5 w-3.5", reconciling && "animate-spin")} aria-hidden />
              校准规则
            </Button>
          </div>
          {bucket ? (
            <StatusReasonSummary
              status={bucket.status}
              reasons={bucketStatusReasons}
              mrfCount={bucketSummary.mrf}
              label="当前桶"
            />
          ) : null}
          <div className="min-h-0 flex-1 [&>[data-slot=table-container]]:h-full [&>[data-slot=table-container]]:overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>复制链路</TableHead>
                  <TableHead>目标状态</TableHead>
                  <TableHead className="text-right">实时延迟</TableHead>
                  <TableHead className="text-right">已复制</TableHead>
                  <TableHead className="text-right" title="近 1 小时失败 / MinIO 进程生命周期历史累计失败">近期 / 历史失败</TableHead>
                  <TableHead className="text-right">当前吞吐</TableHead>
                  <TableHead>最后在线</TableHead>
                  <TableHead className="w-48">补传任务</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map(({ source, target }) => {
                  const resyncMeta = resyncStatusMeta(target)
                  const ResyncIcon = resyncMeta.Icon
                  const operationTitle = resyncOperationTitle(target)
                  return (
                    <TableRow key={`${source.server}:${target.target}`}>
                      <TableCell>
                        <div className="font-medium">{source.server} → {target.target}</div>
                        <div className="mt-0.5 max-w-48 truncate font-mono text-[10px] text-muted-foreground" title={target.endpoint}>{target.endpoint || "规则缺失"}</div>
                      </TableCell>
                      <TableCell><ReplicationStatus status={target.status} scope="link" /></TableCell>
                      <TableCell className="text-right font-mono">{target.online ? `${Math.round(target.latency_current_ms)} ms` : "—"}</TableCell>
                      <TableCell className="text-right">{target.replication_count} · {formatBytes(target.completed_bytes)}</TableCell>
                      <TableCell className="text-right">
                        <div className={cn((target.recent_failed_count ?? 0) > 0 && "font-medium text-rose-600")}>{target.recent_failed_count ?? 0} · {formatBytes(target.recent_failed_bytes ?? 0)}</div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground" title="历史累计值不会因补传成功清零">历史 {target.failed_count} · {formatBytes(target.failed_bytes)}</div>
                      </TableCell>
                      <TableCell className="text-right">{formatRate(target.current_rate_bps)}</TableCell>
                      <TableCell>{formatDateTime(target.last_online)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "h-auto min-h-9 w-full justify-start gap-2 px-2 py-1 text-left",
                            resyncMeta.className,
                          )}
                          title={operationTitle}
                          aria-label={`查看 ${source.server} 到 ${target.target} 补传状态`}
                          onClick={() => setResyncTarget({ source, target })}
                        >
                          <ResyncIcon className={cn("h-4 w-4 shrink-0", target.resync_status === "running" && "animate-spin")} aria-hidden />
                          <span className="min-w-0">
                            <span className="block text-[11px] font-medium">{resyncMeta.label}</span>
                            <span className="block max-w-36 truncate text-[10px] opacity-75">{resyncProgressText(target)}</span>
                          </span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            {links.length === 0 ? (
              <div className="flex min-h-48 items-center justify-center text-xs text-muted-foreground">暂无复制链路</div>
            ) : null}
          </div>
        </section>
      </div>

      <Dialog open={Boolean(resyncTarget)} onOpenChange={(open) => !open && setResyncTarget(null)}>
        <DialogContent className="max-w-lg rounded-lg">
          <DialogHeader><DialogTitle>对象补传状态</DialogTitle></DialogHeader>
          <DialogBody>
            <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs">
              <div>
                <div className="font-medium">{bucket?.bucket} · {inspectedTarget?.source} → {inspectedTarget?.target}</div>
                <div className="mt-1 font-mono text-[10px] text-muted-foreground">{inspectedTarget?.endpoint || "复制规则未建立"}</div>
              </div>
              {inspectedMeta && InspectedIcon ? (
                <span className={cn("inline-flex shrink-0 items-center gap-1.5 font-medium", inspectedMeta.className)}>
                  <InspectedIcon className={cn("h-4 w-4", inspectedTarget?.resync_status === "running" && "animate-spin")} aria-hidden />
                  {inspectedMeta.label}
                </span>
              ) : null}
            </div>

            {inspectedTarget?.resync_status === "running" ? (
              <div className="flex items-center gap-2 rounded-md bg-sky-500/10 px-3 py-2 text-[11px] text-sky-800 dark:text-sky-200" role="status">
                <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                <span>任务持续运行中，MinIO 未提供待扫描总量，因此不显示百分比。</span>
              </div>
            ) : null}

            {inspectedTarget ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                <div><div className="text-[10px] text-muted-foreground">已处理对象</div><div className="mt-0.5 font-medium">{(inspectedTarget.resync_object_count ?? 0).toLocaleString("zh-CN")}</div></div>
                <div><div className="text-[10px] text-muted-foreground">已处理数据</div><div className="mt-0.5 font-medium">{formatBytes(inspectedTarget.resync_completed_bytes ?? 0)}</div></div>
                <div><div className="text-[10px] text-muted-foreground">本次失败</div><div className={cn("mt-0.5 font-medium", (inspectedTarget.resync_failed_count ?? 0) > 0 && "text-amber-700 dark:text-amber-300")}>{inspectedTarget.resync_failed_count ?? 0} 个 · {formatBytes(inspectedTarget.resync_failed_bytes ?? 0)}</div></div>
                <div><div className="text-[10px] text-muted-foreground">任务耗时</div><div className="mt-0.5 font-medium">{resyncElapsed(inspectedTarget)}</div></div>
                <div><div className="text-[10px] text-muted-foreground">开始时间</div><div className="mt-0.5">{formatDateTime(inspectedTarget.resync_started_at)}</div></div>
                <div><div className="text-[10px] text-muted-foreground">{inspectedTarget.resync_status === "running" ? "最后更新" : "完成时间"}</div><div className="mt-0.5">{formatDateTime(inspectedTarget.resync_updated_at)}</div></div>
              </div>
            ) : null}

            {inspectedTarget?.resync_current_object ? (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-[10px]">
                <span className="text-muted-foreground">最后处理对象：</span>
                <span className="break-all font-mono">{inspectedTarget.resync_current_object}</span>
              </div>
            ) : null}

            {inspectedTarget ? (
              <div className={cn(
                "rounded-md border px-3 py-2 text-xs leading-5",
                inspectedTarget.resync_status === "partial" || inspectedTarget.resync_status === "failed"
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-border bg-muted/20",
              )}>
                <div className="flex gap-2"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden /><span>{resyncGuidance(inspectedTarget)}</span></div>
                {inspectedTarget.resync_error ? <div className="mt-2 break-words font-mono text-[10px] text-rose-600">{inspectedTarget.resync_error}</div> : null}
              </div>
            ) : null}

            {canStartInspected ? (
              <div>
                <Label htmlFor="resync-older-than" className="mb-1.5 block text-xs">仅补传早于指定时长的对象</Label>
                <Input
                  id="resync-older-than"
                  value={olderThan}
                  onChange={(event) => setOlderThan(event.target.value)}
                  placeholder="留空表示全部，例如 7d12h"
                />
                <p className="mt-1.5 text-[10px] text-muted-foreground">留空会扫描规则生效时间之前的全部已有对象；运行期间不能重复启动同一方向。</p>
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" disabled={resyncing} onClick={() => setResyncTarget(null)}>关闭</Button>
            {canStartInspected ? (
              <Button disabled={resyncing} onClick={() => void startResync()}>
                {resyncing ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : <DatabaseZap className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
                {inspectedTarget?.resync_status === "idle" ? "启动补传" : "再次补传"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function latestJobFor(server: string, jobs: StorageOperationItem[]): StorageOperationItem | null {
  return jobs.find((job) => job.server === server) ?? null
}

function operationStatusLabel(status: StorageOperationItem["status"]): string {
  if (status === "queued") return "排队中"
  if (status === "running") return "执行中"
  if (status === "succeeded") return "已完成"
  return "失败"
}

function ClusterWorkspace({ accessToken }: { accessToken?: string }) {
  const [data, setData] = useState<ClusterHealthResponse | null>(null)
  const [jobs, setJobs] = useState<StorageOperationItem[]>([])
  const [healStatus, setHealStatus] = useState<ClusterHealStatusResponse | null>(null)
  const [selectedServer, setSelectedServer] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [healDialog, setHealDialog] = useState(false)
  const [startingHeal, setStartingHeal] = useState(false)

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    else setRefreshing(true)
    try {
      const [health, operations] = await Promise.all([
        fetchClusterHealthOperationsApi(accessToken),
        fetchStorageOperationsApi(accessToken),
      ])
      setData(health)
      setJobs(operations.data)
      setSelectedServer((current) => {
        if (current && health.clusters.some((item) => item.server === current)) return current
        return health.clusters[0]?.server ?? null
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [accessToken])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!selectedServer) {
      setHealStatus(null)
      return
    }
    void fetchClusterHealStatusApi(selectedServer, accessToken).then(setHealStatus).catch(() => setHealStatus(null))
  }, [accessToken, selectedServer, jobs])

  const hasActiveJob = jobs.some((job) => job.status === "queued" || job.status === "running")
  useEffect(() => {
    if (!hasActiveJob) return
    const timer = window.setInterval(() => void load(true), 5000)
    return () => window.clearInterval(timer)
  }, [hasActiveJob, load])

  const selected = data?.clusters.find((item) => item.server === selectedServer) ?? null
  const selectedJob = selected ? latestJobFor(selected.server, jobs) : null

  const openHealDialog = (server: string) => {
    setHealStatus(null)
    setSelectedServer(server)
    setHealDialog(true)
  }

  const startHeal = async () => {
    if (!selected) return
    setStartingHeal(true)
    try {
      const operation = await startClusterHealApi(selected.server, accessToken)
      setJobs((current) => [operation, ...current.filter((item) => item.id !== operation.id)])
      setHealDialog(false)
    } finally {
      setStartingHeal(false)
    }
  }

  if (loading) return <LoadingState label="正在读取五地集群健康状态..." />
  if (!data) return <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">集群状态暂不可用</div>

  const summary = data.summary
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-7 gap-y-3 border-b border-border/70 bg-muted/10 px-4 py-3 text-xs">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden />
          <span className="text-muted-foreground">集群在线</span>
          <strong>{summary.online_clusters} / {summary.cluster_count}</strong>
          {summary.degraded_clusters > 0 ? <span className="text-amber-600">{summary.degraded_clusters} 降级</span> : null}
          {summary.offline_clusters > 0 ? <span className="text-rose-600">{summary.offline_clusters} 离线</span> : null}
        </div>
        <div className="flex items-center gap-2"><HardDrive className="h-4 w-4 text-sky-600" aria-hidden /><span className="text-muted-foreground">磁盘</span><strong>{summary.online_disks} 在线</strong><span className={cn(summary.offline_disks > 0 ? "text-rose-600" : "text-muted-foreground")}>{summary.offline_disks} 离线</span><span className="text-muted-foreground">{summary.healing_disks} 修复中</span></div>
        <div className="flex min-w-56 items-center gap-2">
          <Gauge className="h-4 w-4 text-amber-600" aria-hidden />
          <span className="text-muted-foreground">物理容量</span>
          <strong>{formatBytes(summary.raw_used_bytes)} / {formatBytes(summary.raw_capacity_bytes)}</strong>
          <Progress className="h-1.5 w-24" value={summary.raw_capacity_bytes ? summary.raw_used_bytes / summary.raw_capacity_bytes * 100 : 0} />
        </div>
        <div className="flex items-center gap-2"><Box className="h-4 w-4 text-violet-600" aria-hidden /><span className="text-muted-foreground">对象</span><strong>{summary.object_count.toLocaleString("zh-CN")}</strong><span className="text-muted-foreground">逻辑 {formatBytes(summary.logical_usage_bytes)}</span></div>
        <div className="ml-auto flex items-center gap-2 text-muted-foreground">
          <Activity className="h-4 w-4" aria-hidden />
          自动跟踪 {data.auto_heal_enabled ? "已启用" : "已停用"} · 权威区域 {data.auto_heal_authority_region}
          <Button variant="ghost" size="icon" className="h-7 w-7" title="刷新集群状态" aria-label="刷新集群状态" disabled={refreshing} onClick={() => void load(true)}>
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} aria-hidden />
          </Button>
        </div>
      </div>

      <div className="docs-scroll min-h-0 flex-1 overflow-y-auto p-3">
        <div className="grid min-h-full auto-rows-[minmax(280px,1fr)] grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {data.clusters.map((cluster) => {
            const capacityPercent = cluster.raw_capacity_bytes > 0
              ? cluster.raw_used_bytes / cluster.raw_capacity_bytes * 100
              : 0
            const clusterJob = latestJobFor(cluster.server, jobs)
            const jobActive = clusterJob?.status === "queued" || clusterJob?.status === "running"
            return (
              <article key={cluster.server} className="flex min-h-0 flex-col rounded-md border border-border/80 bg-background">
                <header className="flex items-start justify-between gap-3 border-b border-border/60 px-3.5 py-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold">{cluster.shown_name}集群</h2>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground" title={cluster.endpoint}>{cluster.server} · {cluster.endpoint}</p>
                  </div>
                  <ClusterStatus status={cluster.status} />
                </header>

                <div className="docs-scroll min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
                  {cluster.error ? <div className="mb-3 rounded-md bg-rose-500/10 px-2.5 py-2 text-[11px] text-rose-700 dark:text-rose-300">{cluster.error}</div> : null}

                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <div><div className="flex items-center gap-1 text-[10px] text-muted-foreground"><HardDrive className="h-3 w-3" aria-hidden />磁盘</div><div className="mt-0.5 text-xs font-medium">{cluster.online_disks} / {cluster.online_disks + cluster.offline_disks} 在线</div></div>
                    <div><div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Box className="h-3 w-3" aria-hidden />对象</div><div className="mt-0.5 text-xs font-medium">{cluster.object_count.toLocaleString("zh-CN")}</div></div>
                    <div><div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Activity className="h-3 w-3" aria-hidden />探测耗时</div><div className="mt-0.5 font-mono text-xs font-medium">{cluster.reachable ? `${Math.round(cluster.command_latency_ms)} ms` : "—"}</div></div>
                    <div><div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Clock3 className="h-3 w-3" aria-hidden />运行时间</div><div className="mt-0.5 text-xs font-medium">{cluster.reachable ? formatDuration(cluster.uptime_seconds) : "—"}</div></div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between text-[10px]"><span className="text-muted-foreground">物理容量</span><span className="font-medium">{capacityPercent.toFixed(1)}%</span></div>
                    <Progress className="mt-1.5 h-1.5" value={capacityPercent} />
                    <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground"><span>{formatBytes(cluster.raw_used_bytes)} 已用</span><span>{formatBytes(cluster.raw_capacity_bytes)} 总量</span></div>
                  </div>

                  <div className="mt-4 border-t border-border/60 pt-3">
                    <div className="mb-1.5 flex items-center justify-between text-[10px] text-muted-foreground"><span>驱动器</span><span>{cluster.healing_disks > 0 ? `${cluster.healing_disks} 修复中` : `${cluster.drives.length} 个`}</span></div>
                    <div className="divide-y divide-border/50">
                      {cluster.drives.map((drive) => (
                        <div key={`${drive.endpoint}:${drive.path}`} className="py-1.5 text-[10px]">
                          <div className="flex items-center justify-between gap-2"><span className="truncate font-mono" title={drive.endpoint}>{drive.endpoint || drive.path}</span><span className={drive.state.toLowerCase() === "ok" || drive.state.toLowerCase() === "online" ? "text-emerald-600" : "text-rose-600"}>{drive.state}</span></div>
                          <div className="mt-0.5 flex justify-between text-muted-foreground"><span>{formatBytes(drive.used_bytes)} / {formatBytes(drive.total_bytes)}</span><span>等待 {drive.waiting_operations}</span></div>
                        </div>
                      ))}
                      {cluster.drives.length === 0 ? <div className="py-2 text-[10px] text-muted-foreground">暂无驱动器明细</div> : null}
                    </div>
                  </div>
                </div>

                <footer className="flex items-center justify-between gap-2 border-t border-border/60 px-3.5 py-2.5">
                  <div className="min-w-0 text-[10px]">
                    {clusterJob ? (
                      <>
                        <div className={cn("truncate font-medium", clusterJob.status === "failed" && "text-rose-600", clusterJob.status === "running" && "text-sky-600")}>{operationStatusLabel(clusterJob.status)} · {clusterJob.message || "自愈巡检"}</div>
                        <div className="mt-0.5 text-muted-foreground">{formatDateTime(clusterJob.created_at)}</div>
                      </>
                    ) : (
                      <><div className="font-medium">原生自愈</div><div className="mt-0.5 text-muted-foreground">最近检查 {formatDateTime(cluster.checked_at)}</div></>
                    )}
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0" disabled={!cluster.reachable || jobActive} onClick={() => openHealDialog(cluster.server)}>
                    {jobActive ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : <Wrench className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
                    {jobActive ? "巡检中" : "自愈巡检"}
                  </Button>
                </footer>
              </article>
            )
          })}
        </div>
      </div>

      <Dialog open={healDialog} onOpenChange={setHealDialog}>
        <DialogContent className="max-w-md rounded-lg">
          <DialogHeader><DialogTitle>集群自愈巡检</DialogTitle></DialogHeader>
          <DialogBody>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">目标集群：{selected?.shown_name} · {selected?.server}</div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><div className="text-[10px] text-muted-foreground">MinIO Heal 状态</div><div className="mt-0.5 font-medium">{healStatus ? (healStatus.status === "healing" ? "修复中" : healStatus.status === "idle" ? "空闲" : healStatus.status) : "正在读取..."}</div></div>
              <div><div className="text-[10px] text-muted-foreground">已扫描项目</div><div className="mt-0.5 font-medium">{healStatus?.scanned_items.toLocaleString("zh-CN") ?? "—"}</div></div>
              <div><div className="text-[10px] text-muted-foreground">待修复磁盘</div><div className="mt-0.5 font-medium">{healStatus?.heal_disks.length ?? "—"}</div></div>
              <div><div className="text-[10px] text-muted-foreground">离线节点</div><div className="mt-0.5 font-medium">{healStatus?.offline_nodes.length ?? "—"}</div></div>
            </div>
            {selectedJob ? (
              <div className="rounded-md bg-muted/40 px-3 py-2 text-[11px]">
                <div className="flex items-center justify-between gap-2"><span>{selectedJob.message || "最近一次自愈巡检"}</span><span className="text-muted-foreground">{operationStatusLabel(selectedJob.status)}</span></div>
                <div className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(selectedJob.created_at)} · {selectedJob.actor}</div>
              </div>
            ) : null}
            {healStatus?.error ? <div className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">{healStatus.error}</div> : null}
            <p className="text-xs leading-5 text-muted-foreground">MinIO 会在服务端自动修复损坏或缺失的数据。本操作读取原生 Heal 状态并记录巡检结果，不会中断集群读写。</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" disabled={startingHeal} onClick={() => setHealDialog(false)}>取消</Button>
            <Button disabled={startingHeal} onClick={() => void startHeal()}>
              {startingHeal ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : <Wrench className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
              开始巡检
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function StorageOperationsPage() {
  const { accessToken, user } = useAuth()
  const [view, setView] = useState<OperationsView>("replication")

  if (!hasPermission(user, PERMISSIONS.storageOperationsManage)) {
    return <Navigate to="/data/basic/region" replace />
  }

  return (
    <div className="mx-auto flex h-full min-h-[680px] max-w-8xl flex-col">
      <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">存储运维</h1>
          <p className="mt-1 text-xs text-muted-foreground">复制数据收敛、五地 MinIO 集群健康与原生自愈跟踪。</p>
        </div>
        <div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5" role="tablist" aria-label="存储运维视图">
          <button
            type="button"
            role="tab"
            aria-selected={view === "replication"}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded px-3 text-xs", view === "replication" ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
            onClick={() => setView("replication")}
          >
            <DatabaseZap className="h-3.5 w-3.5" aria-hidden />
            复制运维
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "clusters"}
            className={cn("inline-flex h-8 items-center gap-1.5 rounded px-3 text-xs", view === "clusters" ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
            onClick={() => setView("clusters")}
          >
            <ServerCog className="h-3.5 w-3.5" aria-hidden />
            集群健康
          </button>
        </div>
      </div>

      <div className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden",
        view === "replication" && "rounded-lg border border-border/80 bg-background",
      )}>
        {view === "replication"
          ? <ReplicationWorkspace accessToken={accessToken ?? undefined} />
          : <ClusterWorkspace accessToken={accessToken ?? undefined} />}
      </div>
    </div>
  )
}
