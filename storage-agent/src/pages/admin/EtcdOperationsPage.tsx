import { useCallback, useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import { AlertTriangle, CheckCircle2, CircleAlert, CircleHelp, Database, RefreshCw, Server, ShieldAlert, WifiOff } from "lucide-react"

import { fetchEtcdOperationsApi, type EtcdClusterStatusResponse, type EtcdEndpointStatus, type EtcdStatus } from "../../api/client"
import { useAuth } from "../../auth/AuthContext"
import { hasPermission, PERMISSIONS } from "../../auth/permissions"
import { BrandLoading } from "../../components/BrandLoading"
import { Button } from "../../components/ui/button"
import { Card, CardContent } from "../../components/ui/card"
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog"
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

function hasMemberIssues(member: EtcdEndpointStatus): boolean {
  return member.status !== "healthy" || Boolean(member.error) || member.alarms.length > 0 || member.reasons.length > 0
}

function EtcdMemberIssueDialog({ member, onClose }: { member: EtcdEndpointStatus; onClose: () => void }) {
  return (
    <DialogContent className="max-w-2xl rounded-lg">
      <DialogHeader>
        <div className="min-w-0">
          <DialogTitle>Etcd 节点问题详情</DialogTitle>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{member.name} · {member.endpoint}</p>
        </div>
        <StatusBadge status={member.status} />
      </DialogHeader>
      <DialogBody className="space-y-3">
        <div className="grid gap-3 rounded-md border border-border/70 bg-muted/20 px-3 py-3 text-xs sm:grid-cols-2">
          <div><span className="text-muted-foreground">连接状态</span><div className="mt-1 font-medium">{member.reachable ? "可达 · " + member.latency_ms + " ms" : "不可达"}</div></div>
          <div><span className="text-muted-foreground">版本</span><div className="mt-1 font-medium">{member.version || "-"}</div></div>
          <div><span className="text-muted-foreground">Raft term</span><div className="mt-1 font-mono font-medium">{member.raft_term || "-"}</div></div>
          <div><span className="text-muted-foreground">Raft 延迟</span><div className="mt-1 font-mono font-medium">{member.raft_lag}</div></div>
        </div>
        {member.error ? <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs leading-5 text-rose-700 dark:text-rose-300"><div className="font-medium">连接或检查错误</div><div className="mt-1">{member.error}</div></div> : null}
        {member.alarms.length > 0 ? <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs leading-5 text-rose-700 dark:text-rose-300"><div className="font-medium">活动告警</div><div className="mt-1">{member.alarms.join("、")}</div></div> : null}
        {member.reasons.length > 0 ? <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs leading-5 text-amber-700 dark:text-amber-300"><div className="font-medium">状态判定依据</div><div className="mt-1 leading-5">{member.reasons.join("；")}</div></div> : null}
      </DialogBody>
      <DialogFooter><Button variant="outline" onClick={onClose}>关闭</Button></DialogFooter>
    </DialogContent>
  )
}

function MemberCard({ member, onIssue }: { member: EtcdEndpointStatus; onIssue: () => void }) {
  const borderClass = member.status === "critical" ? "border-rose-500/50" : member.status === "warning" ? "border-amber-500/50" : "border-border/70"
  return (
    <div className={cn("flex h-full min-w-0 w-full flex-col rounded-lg border bg-card p-4", borderClass)}>
      <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><Server className="h-4 w-4 shrink-0 text-primary" aria-hidden /><span className="truncate text-sm font-semibold">{member.name}</span>{member.is_leader ? <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">Leader</span> : null}</div><div className="flex shrink-0 items-center gap-1.5">{hasMemberIssues(member) ? <Button variant="destructive" size="sm" className="h-7 gap-1 px-2 text-[10px]" aria-label={member.name + "问题详情"} onClick={onIssue}><CircleAlert className="h-3.5 w-3.5" aria-hidden />问题详情</Button> : null}<StatusBadge status={member.status} /></div></div>
      <div className="mt-3 flex min-w-0 items-center justify-between gap-3 border-b border-border/60 pb-3 text-xs"><span className="truncate text-muted-foreground" title={member.endpoint}>{member.endpoint}</span><span className={cn("shrink-0", member.reachable ? "text-muted-foreground" : "text-rose-600 dark:text-rose-300")}>{member.reachable ? String(member.latency_ms) + " ms" : "不可达"}</span></div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs"><div><dt className="text-muted-foreground">版本</dt><dd className="mt-1 truncate font-medium">{member.version || "-"}</dd></div><div><dt className="text-muted-foreground">数据库大小</dt><dd className="mt-1 font-medium">{formatBytes(member.db_size_bytes)}</dd></div><div><dt className="text-muted-foreground">Raft term</dt><dd className="mt-1 font-mono font-medium">{member.raft_term || "-"}</dd></div><div><dt className="text-muted-foreground">Raft index</dt><dd className="mt-1 break-all font-mono font-medium">{member.raft_index || "-"}</dd></div><div><dt className="text-muted-foreground">Raft 延迟</dt><dd className={cn("mt-1 font-mono font-medium", member.raft_lag > 0 ? "text-amber-600 dark:text-amber-300" : "text-foreground")}>{member.raft_lag}</dd></div><div><dt className="text-muted-foreground">Member ID</dt><dd className="mt-1 break-all font-mono font-medium">{member.member_id || "-"}</dd></div><div className="sm:col-span-2"><dt className="text-muted-foreground">Leader ID</dt><dd className="mt-1 break-all font-mono font-medium">{member.leader_id || "-"}</dd></div></dl>
    </div>
  )
}

function SyncSummary({ data }: { data: EtcdClusterStatusResponse }) {
  return <Card className="rounded-lg shadow-none"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><Database className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden /><div><h2 className="text-base font-semibold">Etcd 控制面状态</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">只读检查 Etcd 连接、Leader、quorum、成员同步和 Storagent Watch 状态。</p></div></div><StatusBadge status={data.status} /></div>{data.reasons.length > 0 ? <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">{data.reasons.join("；")}</div> : null}<div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><div><div className="text-[11px] text-muted-foreground">Leader</div><div className="mt-1 truncate text-sm font-medium">{data.leader_endpoint || "未发现"}</div></div><div><div className="text-[11px] text-muted-foreground">Quorum</div><div className={cn("mt-1 text-sm font-medium", data.quorum ? "text-emerald-600" : "text-rose-600")}>{data.quorum ? "满足" : "不满足"}</div></div><div><div className="text-[11px] text-muted-foreground">成员可达</div><div className="mt-1 text-sm font-medium">{data.reachable_endpoint_count} / {data.configured_endpoint_count}</div></div><div><div className="text-[11px] text-muted-foreground">数据库大小</div><div className="mt-1 text-sm font-medium">{formatBytes(data.database_size_bytes)}</div></div><div><div className="text-[11px] text-muted-foreground">版本</div><div className="mt-1 truncate text-sm font-medium">{data.versions.join(", ") || "-"}</div></div></div><div className="mt-5 grid gap-3 border-t border-border/60 pt-4 text-xs sm:grid-cols-4"><div><span className="text-muted-foreground">Watch</span><div className="mt-1"><StatusBadge status={data.sync.watch_status} /></div></div><div><span className="text-muted-foreground">Watch 重连</span><div className="mt-1 font-medium">{data.sync.watch_reconnects}</div></div><div><span className="text-muted-foreground">周期校准</span><div className="mt-1 font-medium">{data.sync.reconcile_runs} 次 / {data.sync.reconcile_failures} 失败</div></div><div><span className="text-muted-foreground">最近成功</span><div className="mt-1 font-medium">{data.sync.last_reconcile_success_at ? formatDateTime(data.sync.last_reconcile_success_at) : "暂无记录"}</div></div></div></CardContent></Card>
}

export default function EtcdOperationsPage() {
  const { accessToken, user } = useAuth()
  const [data, setData] = useState<EtcdClusterStatusResponse | null>(null)
  const [issueMember, setIssueMember] = useState<EtcdEndpointStatus | null>(null)
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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Etcd 状态读取失败")
    } finally { setLoading(false); setRefreshing(false) }
  }, [accessToken])

  useEffect(() => { void load() }, [load])
  useEffect(() => { const timer = window.setInterval(() => void load(true), 30000); return () => window.clearInterval(timer) }, [load])

  if (!canOperate) return <Navigate to="/data/basic/region" replace />
  const members = data?.members ?? []
  return <div className="mx-auto flex h-full min-h-[680px] max-w-8xl flex-col pb-10"><div className="mb-4 flex shrink-0 flex-wrap items-start justify-between gap-3"><div><h1 className="text-lg font-semibold">同步存储运维</h1><p className="mt-1 text-xs text-muted-foreground">Etcd 控制面只读巡检与 Storagent 同步状态。</p></div><Button type="button" variant="outline" size="sm" onClick={() => void load(true)} disabled={loading || refreshing}><RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", refreshing && "animate-spin")} aria-hidden />刷新</Button></div>{loading && !data ? <BrandLoading label="正在检查 Etcd 状态..." /> : error && !data ? <Card className="rounded-lg shadow-none"><CardContent className="p-6 text-sm text-destructive">{error}</CardContent></Card> : data ? <div className="min-h-0 flex-1 space-y-4 overflow-auto"><SyncSummary data={data} /><Card className="rounded-lg shadow-none"><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold">Etcd 成员</h2><p className="mt-1 text-xs text-muted-foreground">各节点的连接、Raft、数据库和告警信息。</p></div><span className="text-xs text-muted-foreground">检查于 {formatDateTime(data.checked_at)}</span></div>{error ? <div className="mt-3 text-xs text-rose-600 dark:text-rose-300">刷新失败，保留上一次成功结果：{error}</div> : null}<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{members.map((member) => <MemberCard key={member.name} member={member} onIssue={() => setIssueMember(member)} />)}</div>{members.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground"><WifiOff className="mx-auto mb-2 h-6 w-6" aria-hidden />没有配置 Etcd 检查端点</div> : null}</CardContent></Card></div> : null}<Dialog open={Boolean(issueMember)} onOpenChange={(open) => !open && setIssueMember(null)}>{issueMember ? <EtcdMemberIssueDialog member={issueMember} onClose={() => setIssueMember(null)} /> : null}</Dialog></div>
}
