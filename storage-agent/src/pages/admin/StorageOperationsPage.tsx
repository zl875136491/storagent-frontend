import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Activity,
  CheckCircle2,
  CircleAlert,
  DatabaseZap,
  Gauge,
  HardDrive,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  ServerCog,
  ShieldCheck,
  WifiOff,
  Wrench,
} from "lucide-react"
import { useAuth } from "../../auth/AuthContext"
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

const replicationStatusMeta: Record<
  StorageOperationHealth,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  healthy: { label: "已收敛", className: "text-emerald-700 bg-emerald-500/10 dark:text-emerald-300", icon: CheckCircle2 },
  syncing: { label: "同步中", className: "text-sky-700 bg-sky-500/10 dark:text-sky-300", icon: LoaderCircle },
  degraded: { label: "需关注", className: "text-amber-700 bg-amber-500/10 dark:text-amber-300", icon: CircleAlert },
  critical: { label: "异常", className: "text-rose-700 bg-rose-500/10 dark:text-rose-300", icon: CircleAlert },
  unreachable: { label: "不可达", className: "text-rose-700 bg-rose-500/10 dark:text-rose-300", icon: WifiOff },
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B"
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"]
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
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

function ReplicationStatus({ status }: { status: StorageOperationHealth }) {
  const meta = replicationStatusMeta[status]
  const Icon = meta.icon
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium", meta.className)}>
      <Icon className={cn("h-3.5 w-3.5", status === "syncing" && "animate-spin")} aria-hidden />
      {meta.label}
    </span>
  )
}

function worseReplicationStatus(
  first: StorageOperationHealth,
  second: StorageOperationHealth,
): StorageOperationHealth {
  const priority: StorageOperationHealth[] = ["unreachable", "critical", "degraded", "syncing", "healthy"]
  return priority.indexOf(first) <= priority.indexOf(second) ? first : second
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

function ReplicationWorkspace({ accessToken }: { accessToken?: string }) {
  const [data, setData] = useState<ReplicationOperationsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [resyncing, setResyncing] = useState(false)
  const [resyncTarget, setResyncTarget] = useState<LinkRow | null>(null)
  const [olderThan, setOlderThan] = useState("")

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    else setRefreshing(true)
    try {
      const response = await fetchReplicationOperationsApi(undefined, accessToken)
      setData(response)
      setSelectedBucket((current) => {
        if (current && response.buckets.some((item) => item.bucket === current)) return current
        return response.buckets[0]?.bucket ?? null
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
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
  const bucketSummary = useMemo(() => {
    const sources = bucket?.sources ?? []
    return {
      expected: sources.reduce((sum, item) => sum + item.expected_target_count, 0),
      actual: sources.reduce((sum, item) => sum + item.actual_target_count, 0),
      queued: sources.reduce((sum, item) => sum + item.queued_count, 0),
      queuedBytes: sources.reduce((sum, item) => sum + item.queued_bytes, 0),
      mrf: sources.reduce((sum, item) => sum + item.mrf_failed_last_5m, 0),
    }
  }, [bucket])

  const reconcile = async () => {
    if (!bucket) return
    setReconciling(true)
    try {
      await reconcileReplicationApi(bucket.bucket, accessToken)
      await load(true)
    } finally {
      setReconciling(false)
    }
  }

  const startResync = async () => {
    if (!bucket || !resyncTarget) return
    setResyncing(true)
    try {
      await startReplicationResyncApi(
        bucket.bucket,
        {
          source_server: resyncTarget.target.source,
          target_server: resyncTarget.target.target,
          older_than: olderThan.trim() || null,
        },
        accessToken,
      )
      setResyncTarget(null)
      setOlderThan("")
      await load(true)
    } finally {
      setResyncing(false)
    }
  }

  if (loading) return <LoadingState label="正在读取五地复制状态..." />
  if (!data) return <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">复制状态暂不可用</div>

  const summary = data.summary
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
        <div className="border-b border-border/60 px-4 py-3 md:border-b-0 md:border-r">
          <div className="text-[11px] text-muted-foreground">累计失败</div>
          <div className="mt-1 text-sm font-semibold">{summary.failed_count} · {formatBytes(summary.failed_bytes)}</div>
        </div>
        <div className="border-r border-border/60 px-4 py-3">
          <div className="text-[11px] text-muted-foreground">近期漏复制</div>
          <div className="mt-1 text-sm font-semibold">{summary.mrf_failed_last_5m}</div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[11px] text-muted-foreground">当前吞吐</div>
          <div className="mt-1 text-sm font-semibold">{formatRate(summary.current_rate_bps)}</div>
        </div>
      </div>

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
              <div className="truncate text-sm font-semibold">{bucket?.bucket ?? "未选择存储桶"}</div>
              <div className="text-[10px] text-muted-foreground">
                链路 {bucketSummary.actual}/{bucketSummary.expected} · 等待 {bucketSummary.queued}（{formatBytes(bucketSummary.queuedBytes)}）· 近期漏复制 {bucketSummary.mrf} · {formatDateTime(data.generated_at)}
              </div>
            </div>
            <Button variant="outline" size="sm" disabled={!bucket || reconciling} onClick={() => void reconcile()}>
              <RotateCcw className={cn("mr-1.5 h-3.5 w-3.5", reconciling && "animate-spin")} aria-hidden />
              校准规则
            </Button>
          </div>
          <div className="docs-scroll min-h-0 flex-1 overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-background">
                <TableRow>
                  <TableHead>复制链路</TableHead>
                  <TableHead>目标状态</TableHead>
                  <TableHead className="text-right">实时延迟</TableHead>
                  <TableHead className="text-right">已复制</TableHead>
                  <TableHead className="text-right">失败</TableHead>
                  <TableHead className="text-right">当前吞吐</TableHead>
                  <TableHead>最后在线</TableHead>
                  <TableHead className="w-12 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map(({ source, target }) => (
                  <TableRow key={`${source.server}:${target.target}`}>
                    <TableCell>
                      <div className="font-medium">{source.server} → {target.target}</div>
                      <div className="mt-0.5 max-w-48 truncate font-mono text-[10px] text-muted-foreground" title={target.endpoint}>{target.endpoint || "规则缺失"}</div>
                    </TableCell>
                    <TableCell><ReplicationStatus status={worseReplicationStatus(source.status, target.status)} /></TableCell>
                    <TableCell className="text-right font-mono">{target.online ? `${Math.round(target.latency_current_ms)} ms` : "—"}</TableCell>
                    <TableCell className="text-right">{target.replication_count} · {formatBytes(target.completed_bytes)}</TableCell>
                    <TableCell className={cn("text-right", target.failed_count > 0 && "text-rose-600")}>{target.failed_count} · {formatBytes(target.failed_bytes)}</TableCell>
                    <TableCell className="text-right">{formatRate(target.current_rate_bps)}</TableCell>
                    <TableCell>{formatDateTime(target.last_online)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="为此链路启动对象补传"
                        aria-label={`补传 ${source.server} 到 ${target.target}`}
                        disabled={!target.arn || !target.online}
                        onClick={() => setResyncTarget({ source, target })}
                      >
                        <DatabaseZap className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {links.length === 0 ? (
              <div className="flex min-h-48 items-center justify-center text-xs text-muted-foreground">暂无复制链路</div>
            ) : null}
          </div>
        </section>
      </div>

      <Dialog open={Boolean(resyncTarget)} onOpenChange={(open) => !open && setResyncTarget(null)}>
        <DialogContent className="max-w-md rounded-lg">
          <DialogHeader><DialogTitle>启动对象补传</DialogTitle></DialogHeader>
          <DialogBody>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
              {bucket?.bucket} · {resyncTarget?.target.source} → {resyncTarget?.target.target}
            </div>
            <div>
              <Label htmlFor="resync-older-than" className="mb-1.5 block text-xs">仅补传早于指定时长的对象</Label>
              <Input
                id="resync-older-than"
                value={olderThan}
                onChange={(event) => setOlderThan(event.target.value)}
                placeholder="留空表示全部，例如 7d12h"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" disabled={resyncing} onClick={() => setResyncTarget(null)}>取消</Button>
            <Button disabled={resyncing} onClick={() => void startResync()}>
              {resyncing ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : <DatabaseZap className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
              启动补传
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function latestJobFor(server: string, jobs: StorageOperationItem[]): StorageOperationItem | null {
  return jobs.find((job) => job.server === server) ?? null
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
  const capacityPercent = selected && selected.raw_capacity_bytes > 0
    ? (selected.raw_used_bytes / selected.raw_capacity_bytes) * 100
    : 0

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
      <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-b border-border/70 px-4 py-3 text-xs">
        <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden /><span className="text-muted-foreground">在线集群</span><strong>{summary.online_clusters} / {summary.cluster_count}</strong></div>
        <div className="flex items-center gap-2"><HardDrive className="h-4 w-4 text-sky-600" aria-hidden /><span className="text-muted-foreground">磁盘</span><strong>{summary.online_disks} 在线 · {summary.offline_disks} 离线 · {summary.healing_disks} 修复中</strong></div>
        <div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-amber-600" aria-hidden /><span className="text-muted-foreground">物理容量</span><strong>{formatBytes(summary.raw_used_bytes)} / {formatBytes(summary.raw_capacity_bytes)}</strong></div>
        <div className="ml-auto flex items-center gap-2 text-muted-foreground">
          <Activity className="h-4 w-4" aria-hidden />
          自动跟踪 {data.auto_heal_enabled ? "已启用" : "已停用"} · {data.auto_heal_authority_region}
          <Button variant="ghost" size="icon" className="h-7 w-7" title="刷新集群状态" aria-label="刷新集群状态" disabled={refreshing} onClick={() => void load(true)}>
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} aria-hidden />
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="docs-scroll min-h-0 overflow-auto border-b border-border/70 xl:border-b-0 xl:border-r">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead>集群</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>磁盘</TableHead>
                <TableHead>容量</TableHead>
                <TableHead className="text-right">对象</TableHead>
                <TableHead className="text-right">探测耗时</TableHead>
                <TableHead>运行时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.clusters.map((cluster) => (
                <TableRow
                  key={cluster.server}
                  data-state={selectedServer === cluster.server ? "selected" : undefined}
                  className="cursor-pointer"
                  onClick={() => setSelectedServer(cluster.server)}
                >
                  <TableCell>
                    <div className="font-medium">{cluster.shown_name} · {cluster.server}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{cluster.endpoint}</div>
                  </TableCell>
                  <TableCell><ClusterStatus status={cluster.status} /></TableCell>
                  <TableCell>{cluster.online_disks} / {cluster.online_disks + cluster.offline_disks}</TableCell>
                  <TableCell>
                    <div>{formatBytes(cluster.raw_used_bytes)} / {formatBytes(cluster.raw_capacity_bytes)}</div>
                    <Progress className="mt-1 h-1.5 w-28" value={cluster.raw_capacity_bytes ? cluster.raw_used_bytes / cluster.raw_capacity_bytes * 100 : 0} />
                  </TableCell>
                  <TableCell className="text-right">{cluster.object_count.toLocaleString("zh-CN")}</TableCell>
                  <TableCell className="text-right font-mono">{Math.round(cluster.command_latency_ms)} ms</TableCell>
                  <TableCell>{formatDuration(cluster.uptime_seconds)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <aside className="docs-scroll min-h-0 overflow-y-auto p-4">
          {selected ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{selected.shown_name}集群</h2>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">{selected.version || selected.endpoint}</p>
                </div>
                <ClusterStatus status={selected.status} />
              </div>

              {selected.error ? <div className="rounded-md bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">{selected.error}</div> : null}

              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">物理容量使用率</span><span>{capacityPercent.toFixed(1)}%</span></div>
                <Progress value={capacityPercent} />
                <div className="flex justify-between text-[10px] text-muted-foreground"><span>{formatBytes(selected.raw_used_bytes)}</span><span>{formatBytes(selected.raw_capacity_bytes)}</span></div>
              </div>

              <div>
                <div className="mb-2 text-[11px] font-medium text-muted-foreground">磁盘明细</div>
                <div className="space-y-1.5">
                  {selected.drives.map((drive) => (
                    <div key={drive.endpoint} className="rounded-md border border-border/70 px-2.5 py-2 text-[11px]">
                      <div className="flex items-center justify-between gap-2"><span className="truncate font-mono">{drive.endpoint}</span><span className={drive.state === "ok" ? "text-emerald-600" : "text-rose-600"}>{drive.state}</span></div>
                      <div className="mt-1 flex justify-between text-muted-foreground"><span>{formatBytes(drive.used_bytes)} / {formatBytes(drive.total_bytes)}</span><span>等待 {drive.waiting_operations}</span></div>
                    </div>
                  ))}
                  {selected.drives.length === 0 ? <div className="text-xs text-muted-foreground">没有可用的磁盘明细</div> : null}
                </div>
              </div>

              <div className="border-t border-border/70 pt-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-medium">原生自愈</div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">{healStatus?.status === "healing" ? `已扫描 ${healStatus.scanned_items} 项` : "当前没有进行中的自愈"}</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!selected.reachable || selectedJob?.status === "queued" || selectedJob?.status === "running"}
                    onClick={() => setHealDialog(true)}
                  >
                    <Wrench className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    自愈巡检
                  </Button>
                </div>
                {selectedJob ? (
                  <div className="rounded-md bg-muted/50 px-3 py-2 text-[11px]">
                    <div className="flex items-center justify-between gap-2"><span>{selectedJob.message || "维护任务"}</span><span className="font-mono uppercase text-muted-foreground">{selectedJob.status}</span></div>
                    <div className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(selectedJob.created_at)} · {selectedJob.actor}</div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : <div className="text-xs text-muted-foreground">请选择一个集群</div>}
        </aside>
      </div>

      <Dialog open={healDialog} onOpenChange={setHealDialog}>
        <DialogContent className="max-w-md rounded-lg">
          <DialogHeader><DialogTitle>启动自愈巡检</DialogTitle></DialogHeader>
          <DialogBody>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">目标集群：{selected?.shown_name} · {selected?.server}</div>
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
  const { accessToken } = useAuth()
  const [view, setView] = useState<OperationsView>("replication")

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

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/80 bg-background">
        {view === "replication"
          ? <ReplicationWorkspace accessToken={accessToken ?? undefined} />
          : <ClusterWorkspace accessToken={accessToken ?? undefined} />}
      </div>
    </div>
  )
}
