import { useCallback, useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import { AlertTriangle, CheckCircle2, CircleHelp, Database, RefreshCw, Server, ShieldAlert, WifiOff } from "lucide-react"

import { fetchEtcdOperationsApi, type EtcdClusterStatusResponse, type EtcdEndpointStatus, type EtcdStatus } from "../../api/client"
import { useAuth } from "../../auth/AuthContext"
import { hasPermission, PERMISSIONS } from "../../auth/permissions"
import { BrandLoading } from "../../components/BrandLoading"
import { Button } from "../../components/ui/button"
import { Card, CardContent } from "../../components/ui/card"
import { cn } from "../../lib/utils"
import { formatDateTime } from "../../lib/format"

const STATUS_META: Record<EtcdStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  healthy: { label: "正常", className: "text-emerald-700 bg-emerald-500/10 dark:text-emerald-300", icon: CheckCircle2 },
  warning: { label: "预警", className: "text-amber-700 bg-amber-500/10 dark:text-amber-300", icon: AlertTriangle },
  critical: { label: "严重", className: "text-rose-700 bg-rose-500/10 dark:text-rose-300", icon: ShieldAlert },
  unknown: { label: "未知", className: "text-muted-foreground bg-muted", icon: CircleHelp },
}

function StatusBadge({ status }: { status: EtcdStatus }) {
  const meta = STATUS_META[status]
  const Icon = meta.icon
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", meta.className)}><Icon className="h-3.5 w-3.5" aria-hidden />{meta.label}</span>
}

function formatBytes(value: number) {
  if (!value) return "0 B"
  const units = ["B", "KiB", "MiB", "GiB", "TiB"]
  let size = value
  let index = 0
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1 }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function MemberCard({ member, onSelect }: { member: EtcdEndpointStatus; onSelect: () => void }) {
  return <button type="button" className={cn("flex min-w-0 w-full flex-col rounded-lg border p-4 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", member.status === "critical" ? "border-rose-500/40" : "border-border/70")} onClick={onSelect}>
    <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><Server className="h-4 w-4 shrink-0 text-primary" aria-hidden /><span className="truncate text-sm font-semibold">{member.name}</span>{member.is_leader ? <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">Leader</span> : null}</div><StatusBadge status={member.status} /></div>
    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs"><span className="truncate text-muted-foreground" title={member.endpoint}>{member.endpoint}</span><span className="text-right text-muted-foreground">{member.reachable ? `${member.latency_ms} ms` : "不可达"}</span><span className="text-muted-foreground">版本 {member.version || "-"}</span><span className="text-right text-muted-foreground">Raft {member.raft_index || "-"}</span></div>
    {member.reasons.length > 0 ? <div className="mt-3 text-xs leading-5 text-rose-600 dark:text-rose-300">{member.reasons.join("；")}</div> : null}
  </button>
}

function MemberDetail({ member, onClose }: { member: EtcdEndpointStatus; onClose: () => void }) {
  return <div className="rounded-lg border border-border/70 bg-muted/20 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">{member.name} 详情</h3><p className="mt-1 text-xs text-muted-foreground">{member.endpoint}</p></div><Button type="button" variant="ghost" size="sm" onClick={onClose}>关闭</Button></div><div className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3"><div><span className="text-muted-foreground">状态</span><div className="mt-1"><StatusBadge status={member.status} /></div></div><div><span className="text-muted-foreground">Member ID</span><div className="mt-1 break-all font-mono">{member.member_id || "-"}</div></div><div><span className="text-muted-foreground">Leader ID</span><div className="mt-1 break-all font-mono">{member.leader_id || "-"}</div></div><div><span className="text-muted-foreground">Raft term</span><div className="mt-1 font-mono">{member.raft_term || "-"}</div></div><div><span className="text-muted-foreground">Raft index</span><div className="mt-1 font-mono">{member.raft_index || "-"}</div></div><div><span className="text-muted-foreground">数据库大小</span><div className="mt-1">{formatBytes(member.db_size_bytes)}</div></div></div>{member.error ? <p className="mt-3 text-xs text-rose-600 dark:text-rose-300">{member.error}</p> : null}{member.alarms.length > 0 ? <p className="mt-3 text-xs text-rose-600 dark:text-rose-300">活动告警：{member.alarms.join("、")}</p> : null}</div>
}

function SyncSummary({ data }: { data: EtcdClusterStatusResponse }) {
  return <Card className="rounded-lg shadow-none"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><Database className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden /><div><h2 className="text-base font-semibold">Etcd 控制面状态</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">只读检查 Etcd 连接、Leader、quorum、成员同步和 Storagent Watch 状态。</p></div></div><StatusBadge status={data.status} /></div>{data.reasons.length > 0 ? <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">{data.reasons.join("；")}</div> : null}<div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><div><div className="text-[11px] text-muted-foreground">Leader</div><div className="mt-1 truncate text-sm font-medium">{data.leader_endpoint || "未发现"}</div></div><div><div className="text-[11px] text-muted-foreground">Quorum</div><div className={cn("mt-1 text-sm font-medium", data.quorum ? "text-emerald-600" : "text-rose-600")}>{data.quorum ? "满足" : "不满足"}</div></div><div><div className="text-[11px] text-muted-foreground">成员可达</div><div className="mt-1 text-sm font-medium">{data.reachable_endpoint_count} / {data.configured_endpoint_count}</div></div><div><div className="text-[11px] text-muted-foreground">数据库大小</div><div className="mt-1 text-sm font-medium">{formatBytes(data.database_size_bytes)}</div></div><div><div className="text-[11px] text-muted-foreground">版本</div><div className="mt-1 truncate text-sm font-medium">{data.versions.join(", ") || "-"}</div></div></div><div className="mt-5 grid gap-3 border-t border-border/60 pt-4 text-xs sm:grid-cols-4"><div><span className="text-muted-foreground">Watch</span><div className="mt-1"><StatusBadge status={data.sync.watch_status} /></div></div><div><span className="text-muted-foreground">Watch 重连</span><div className="mt-1 font-medium">{data.sync.watch_reconnects}</div></div><div><span className="text-muted-foreground">周期校准</span><div className="mt-1 font-medium">{data.sync.reconcile_runs} 次 / {data.sync.reconcile_failures} 失败</div></div><div><span className="text-muted-foreground">最近成功</span><div className="mt-1 font-medium">{data.sync.last_reconcile_success_at ? formatDateTime(data.sync.last_reconcile_success_at) : "暂无记录"}</div></div></div></CardContent></Card>
}

export default function EtcdOperationsPage() {
  const { accessToken, user } = useAuth()
  const [data, setData] = useState<EtcdClusterStatusResponse | null>(null)
  const [selected, setSelected] = useState<EtcdEndpointStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canOperate = hasPermission(user, PERMISSIONS.storageOperationsManage)

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true); else setLoading(true)
    setError(null)
    try {
      const response = await fetchEtcdOperationsApi(accessToken ?? undefined, force)
      setData(response)
      setSelected((current) => response.members.find((item) => item.name === current?.name) ?? null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Etcd 状态读取失败")
    } finally { setLoading(false); setRefreshing(false) }
  }, [accessToken])

  useEffect(() => { void load() }, [load])
  useEffect(() => { const timer = window.setInterval(() => void load(true), 30000); return () => window.clearInterval(timer) }, [load])

  if (!canOperate) return <Navigate to="/data/basic/region" replace />
  const members = data?.members ?? []
  return <div className="mx-auto flex h-full min-h-[680px] max-w-8xl flex-col pb-10"><div className="mb-4 flex shrink-0 flex-wrap items-start justify-between gap-3"><div><h1 className="text-lg font-semibold">同步存储运维</h1><p className="mt-1 text-xs text-muted-foreground">Etcd 控制面只读巡检与 Storagent 同步状态。</p></div><Button type="button" variant="outline" size="sm" onClick={() => void load(true)} disabled={loading || refreshing}><RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", refreshing && "animate-spin")} aria-hidden />刷新</Button></div>{loading && !data ? <BrandLoading label="正在检查 Etcd 状态..." /> : error && !data ? <Card className="rounded-lg shadow-none"><CardContent className="p-6 text-sm text-destructive">{error}</CardContent></Card> : data ? <div className="min-h-0 flex-1 space-y-4 overflow-auto"><SyncSummary data={data} /><Card className="rounded-lg shadow-none"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold">Etcd 成员</h2><p className="mt-1 text-xs text-muted-foreground">点击成员查看版本、Raft、数据库和活动告警详情。</p></div><span className="text-xs text-muted-foreground">检查于 {formatDateTime(data.checked_at)}</span></div>{error ? <div className="mt-3 text-xs text-rose-600 dark:text-rose-300">刷新失败，保留上一次成功结果：{error}</div> : null}<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{members.map((member) => <MemberCard key={member.name} member={member} onSelect={() => setSelected(member)} />)}</div>{members.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground"><WifiOff className="mx-auto mb-2 h-6 w-6" aria-hidden />没有配置 Etcd 检查端点</div> : null}{selected ? <div className="mt-4"><MemberDetail member={selected} onClose={() => setSelected(null)} /></div> : null}</CardContent></Card></div> : null}</div>
}
