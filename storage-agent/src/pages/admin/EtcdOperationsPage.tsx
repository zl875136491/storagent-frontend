import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, NavLink } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  Database,
  Download,
  FileCheck2,
  Network,
  RefreshCw,
  Server,
  ShieldAlert,
  Wrench,
  WifiOff,
} from "lucide-react";
import {
  createEtcdTaskApi,
  downloadEtcdSnapshotApi,
  fetchEtcdEventsApi,
  fetchEtcdOperationsApi,
  fetchEtcdRevisionOptionsApi,
  fetchEtcdTaskApi,
  fetchEtcdTasksApi,
  fetchEtcdTrendApi,
  stageEtcdRestoreApi,
  type EtcdClusterStatusResponse,
  type EtcdEndpointStatus,
  type EtcdEventItem,
  type EtcdRevisionOptionsResponse,
  type EtcdStatus,
  type EtcdTaskResponse,
  type EtcdTrendResponse,
} from "../../api/client";
import { showErrorToast, showSuccessToast } from "../../api/toast";
import { useAuth } from "../../auth/AuthContext";
import { hasPermission, PERMISSIONS } from "../../auth/permissions";
import { BrandLoading } from "../../components/BrandLoading";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { cn } from "../../lib/utils";
import { formatDateTime } from "../../lib/format";

type PageView = "status" | "trend" | "operations" | "tasks" | "events";
type TaskKind = "keyspace" | "compact" | "defrag" | "alarm-disarm";
const STATUS_META: Record<
  EtcdStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  healthy: {
    label: "正常",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    icon: CheckCircle2,
  },
  warning: {
    label: "预警",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    icon: AlertTriangle,
  },
  critical: {
    label: "严重",
    className: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
    icon: ShieldAlert,
  },
  unknown: {
    label: "未知",
    className: "bg-muted text-muted-foreground",
    icon: CircleHelp,
  },
};
const ACTIONS: Record<
  TaskKind,
  { title: string; description: string; note: string; button: string }
> = {
  keyspace: {
    title: "Key 空间检查",
    description: "检查 Storagent 前缀下的 key 数量、总大小和当前 revision。",
    note: "只读操作，不会修改 Etcd 数据。",
    button: "开始检查",
  },
  compact: {
    title: "历史压缩",
    description: "删除所选 revision 之前的历史版本，减少 Etcd 历史存储压力。",
    note: "只选择系统提供的 revision；压缩后不能读取被清理的历史版本。",
    button: "创建压缩任务",
  },
  defrag: {
    title: "碎片整理",
    description: "对当前配置的 Etcd 成员执行 defrag，回收数据库内部空闲空间。",
    note: "执行期间可能增加磁盘 IO，建议安排在低峰期。",
    button: "创建整理任务",
  },
  "alarm-disarm": {
    title: "解除活动告警",
    description: "解除已经确认并处理过的 Etcd 活动告警。",
    note: "解除告警不会修复根因，请先查看成员和事件详情。",
    button: "创建解除任务",
  },
};
const EVENT_LABELS: Record<string, string> = {
  status: "状态检查",
  keyspace: "Key 空间检查",
  compact: "历史压缩",
  defrag: "碎片整理",
  alarm_disarm: "解除告警",
  snapshot: "快照备份",
  restore: "恢复登记",
};

function StatusBadge({ status }: { status: EtcdStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        meta.className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {meta.label}
    </span>
  );
}
function formatBytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return size.toFixed(index === 0 ? 0 : 1) + " " + units[index];
}
function JsonCode({ value }: { value: unknown }) {
  const text =
    typeof value === "string"
      ? value
      : JSON.stringify(value, null, 2) || "null";
  const escaped = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  const html = escaped
    .replace(
      /(&quot;(?:\.|[^&])*?&quot;)(\s*:)/g,
      '<span class="text-sky-300">$1</span>$2',
    )
    .replace(
      /(&quot;(?:\.|[^&])*?&quot;)/g,
      '<span class="text-emerald-300">$1</span>',
    )
    .replace(/\b(true|false|null)\b/g, '<span class="text-amber-300">$1</span>')
    .replace(/\b-?\d+(?:\.\d+)?\b/g, '<span class="text-violet-300">$1</span>');
  return (
    <pre
      className="h-full max-h-full overflow-auto whitespace-pre-wrap break-words rounded-md border border-slate-700 bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-200"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
function MemberIssueDialog({
  member,
  onClose,
}: {
  member: EtcdEndpointStatus;
  onClose: () => void;
}) {
  return (
    <DialogContent className="max-w-2xl rounded-lg">
      <DialogHeader>
        <div className="min-w-0">
          <DialogTitle>Etcd 节点问题详情</DialogTitle>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {member.name} · {member.endpoint}
          </p>
        </div>
        <StatusBadge status={member.status} />
      </DialogHeader>
      <DialogBody className="space-y-3">
        <div className="grid gap-3 rounded-md border border-border/70 bg-muted/20 px-3 py-3 text-xs sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">连接状态</span>
            <div className="mt-1 font-medium">
              {member.reachable
                ? "可达 · " + member.latency_ms + " ms"
                : "不可达"}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">版本</span>
            <div className="mt-1 font-medium">{member.version || "-"}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Raft term</span>
            <div className="mt-1 font-mono font-medium">
              {member.raft_term || "-"}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">Raft 延迟</span>
            <div className="mt-1 font-mono font-medium">{member.raft_lag}</div>
          </div>
        </div>
        {member.error ? (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs leading-5 text-rose-700">
            <div className="font-medium">连接或检查错误</div>
            <div className="mt-1">{member.error}</div>
          </div>
        ) : null}
        {member.alarms.length > 0 ? (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs leading-5 text-rose-700">
            <div className="font-medium">活动告警</div>
            <div className="mt-1">{member.alarms.join("、")}</div>
          </div>
        ) : null}
        {member.reasons.length > 0 ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700">
            <div className="font-medium">状态判定依据</div>
            <div className="mt-1">{member.reasons.join("；")}</div>
          </div>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          关闭
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
function MemberCard({
  member,
  onIssue,
}: {
  member: EtcdEndpointStatus;
  onIssue: () => void;
}) {
  const issue =
    member.status !== "healthy" ||
    Boolean(member.error) ||
    member.alarms.length > 0 ||
    member.reasons.length > 0;
  const border =
    member.status === "critical"
      ? "border-rose-500/50"
      : member.status === "warning"
        ? "border-amber-500/50"
        : "border-border/70";
  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col rounded-lg border bg-card p-4",
        border,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Server className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="truncate text-sm font-semibold">{member.name}</span>
          {member.is_leader ? (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
              Leader
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {issue ? (
            <Button
              variant="destructive"
              size="sm"
              className="h-7 gap-1 px-2 text-[10px]"
              onClick={onIssue}
            >
              <CircleAlert className="h-3.5 w-3.5" aria-hidden />
              问题详情
            </Button>
          ) : null}
          <StatusBadge status={member.status} />
        </div>
      </div>
      <div className="mt-3 flex min-w-0 items-center justify-between gap-3 border-b border-border/60 pb-3 text-xs">
        <span
          className="truncate text-muted-foreground"
          title={member.endpoint}
        >
          {member.endpoint}
        </span>
        <span
          className={
            member.reachable
              ? "shrink-0 text-muted-foreground"
              : "shrink-0 text-rose-600"
          }
        >
          {member.reachable ? member.latency_ms + " ms" : "不可达"}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
        <div>
          <dt className="text-muted-foreground">版本</dt>
          <dd className="mt-1 truncate font-medium">{member.version || "-"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">数据库大小</dt>
          <dd className="mt-1 font-medium">
            {formatBytes(member.db_size_bytes)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Revision</dt>
          <dd className="mt-1 font-mono font-medium">
            {member.revision || "-"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Raft 延迟</dt>
          <dd className="mt-1 font-mono font-medium">{member.raft_lag}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Raft index</dt>
          <dd className="mt-1 break-all font-mono font-medium">
            {member.raft_index || "-"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Member ID</dt>
          <dd className="mt-1 break-all font-mono font-medium">
            {member.member_id || "-"}
          </dd>
        </div>
      </dl>
    </div>
  );
}
function ControlPlaneSummary({ data }: { data: EtcdClusterStatusResponse }) {
  const values = [
    ["Leader", data.leader_endpoint || "未发现"],
    ["Quorum", data.quorum ? "满足" : "不满足"],
    [
      "成员可达",
      data.reachable_endpoint_count + " / " + data.configured_endpoint_count,
    ],
    ["Revision", String(data.revision || "-")],
    ["数据库大小", formatBytes(data.database_size_bytes)],
    ["版本", data.versions.join(", ") || "-"],
  ];
  return (
    <Card className="shrink-0 rounded-lg shadow-none">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <Database
              className="mt-0.5 h-5 w-5 shrink-0 text-primary"
              aria-hidden
            />
            <div>
              <h2 className="text-base font-semibold">Etcd 控制面状态</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                连接、Leader、quorum、revision、成员同步和 Storagent Watch
                状态。
              </p>
            </div>
          </div>
          <StatusBadge status={data.status} />
        </div>
        {data.reasons.length > 0 ? (
          <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
            {data.reasons.join("；")}
          </div>
        ) : null}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {values.map(([label, value]) => (
            <div key={label}>
              <div className="text-[11px] text-muted-foreground">{label}</div>
              <div className="mt-1 truncate text-sm font-medium">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-3 border-t border-border/60 pt-4 text-xs sm:grid-cols-4">
          <div>
            <span className="text-muted-foreground">Watch</span>
            <div className="mt-1">
              <StatusBadge status={data.sync.watch_status} />
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">Watch 重连</span>
            <div className="mt-1 font-medium">{data.sync.watch_reconnects}</div>
          </div>
          <div>
            <span className="text-muted-foreground">周期校准</span>
            <div className="mt-1 font-medium">
              {data.sync.reconcile_runs} 次 / {data.sync.reconcile_failures}{" "}
              失败
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">最近成功</span>
            <div className="mt-1 font-medium">
              {data.sync.last_reconcile_success_at
                ? formatDateTime(data.sync.last_reconcile_success_at)
                : "暂无记录"}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
function StatusPage({
  data,
  onIssue,
}: {
  data: EtcdClusterStatusResponse;
  onIssue: (member: EtcdEndpointStatus) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      <ControlPlaneSummary data={data} />
      <Card className="shrink-0 rounded-lg shadow-none">
        <CardContent className="p-5">
          <div className="flex shrink-0 items-start gap-2">
            <Server className="h-5 w-5 text-primary" aria-hidden />
            <div>
              <h2 className="text-base font-semibold">Etcd 成员</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                当前测试环境 Etcd 集群的成员连接、Raft、数据库和告警信息。
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {data.members.map((member) => (
              <MemberCard
                key={member.name}
                member={member}
                onIssue={() => onIssue(member)}
              />
            ))}
          </div>
          {data.members.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <WifiOff className="mx-auto mb-2 h-6 w-6" aria-hidden />
              没有配置 Etcd 端点
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
function TrendView({ trend }: { trend: EtcdTrendResponse | null }) {
  const rows = trend?.data.slice(-12) || [];
  const latest = rows[rows.length - 1];
  return (
    <Card className="h-full rounded-lg shadow-none">
      <CardContent className="flex h-full flex-col p-5">
        <h2 className="text-base font-semibold">状态趋势</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          每次 Etcd 状态检查生成一个采样点：成员可达反映连接情况，quorum
          反映多数派，revision 反映数据变更进度，数据库大小反映存储增长，Raft
          延迟反映成员同步落后程度。
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-md border border-border/70 p-3">
            <div className="text-[11px] text-muted-foreground">采样点</div>
            <div className="mt-1 text-lg font-semibold">{rows.length}</div>
          </div>
          <div className="rounded-md border border-border/70 p-3">
            <div className="text-[11px] text-muted-foreground">
              当前 Revision
            </div>
            <div className="mt-1 text-lg font-semibold">
              {latest?.revision || "-"}
            </div>
          </div>
          <div className="rounded-md border border-border/70 p-3">
            <div className="text-[11px] text-muted-foreground">
              平均检查延迟
            </div>
            <div className="mt-1 text-lg font-semibold">
              {latest?.average_latency_ms || 0} ms
            </div>
          </div>
          <div className="rounded-md border border-border/70 p-3">
            <div className="text-[11px] text-muted-foreground">
              最大 Raft 延迟
            </div>
            <div className="mt-1 text-lg font-semibold">
              {latest?.max_raft_lag || 0}
            </div>
          </div>
          <div className="rounded-md border border-border/70 p-3">
            <div className="text-[11px] text-muted-foreground">最新状态</div>
            <div className="mt-1">
              <StatusBadge status={latest?.status || "unknown"} />
            </div>
          </div>
        </div>
        <div className="mt-5 overflow-x-auto">
          <div className="min-w-[900px] text-xs">
            <div className="grid grid-cols-8 gap-3 border-b border-border/70 pb-2 font-medium text-muted-foreground">
              <span>采样时间</span>
              <span>状态</span>
              <span>Leader</span>
              <span>Revision</span>
              <span>成员可达</span>
              <span>平均延迟</span>
              <span>最大 Raft 延迟</span>
              <span>数据库大小</span>
            </div>
            {rows.map((row) => (
              <div
                className="grid grid-cols-8 gap-3 border-b border-border/50 py-2.5"
                key={row.checked_at}
              >
                <span>{formatDateTime(row.checked_at)}</span>
                <span>
                  <StatusBadge status={row.status} />
                </span>
                <span className="truncate">{row.leader_endpoint || "-"}</span>
                <span>{row.revision || "-"}</span>
                <span>
                  {row.reachable_endpoint_count} /{" "}
                  {row.configured_endpoint_count}
                </span>
                <span>{row.average_latency_ms} ms</span>
                <span>{row.max_raft_lag}</span>
                <span>{formatBytes(row.database_size_bytes)}</span>
              </div>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            暂无趋势采样，刷新服务状态后会产生数据。
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
function TaskBadge({ status }: { status: EtcdTaskResponse["status"] }) {
  const labels = {
    queued: "排队中",
    running: "执行中",
    succeeded: "成功",
    failed: "失败",
  };
  return (
    <span
      className={cn(
        "text-xs font-medium",
        status === "failed"
          ? "text-rose-600"
          : status === "succeeded"
            ? "text-emerald-600"
            : "text-amber-600",
      )}
    >
      {labels[status]}
    </span>
  );
}
const TASK_LABELS: Record<string, string> = {
  keyspace: "Key 空间检查",
  compact: "历史压缩",
  defrag: "碎片整理",
  "alarm-disarm": "解除活动告警",
};

function TaskHistory({
  tasks,
  token,
}: {
  tasks: EtcdTaskResponse[];
  token?: string;
}) {
  const [updates, setUpdates] = useState<Record<string, EtcdTaskResponse>>({});
  const items = useMemo(() => {
    const merged = new Map(tasks.map((item) => [item.id, item]));
    Object.values(updates).forEach((item) => merged.set(item.id, item));
    return Array.from(merged.values()).sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
  }, [tasks, updates]);

  useEffect(() => {
    const active = items.filter(
      (item) => item.status === "queued" || item.status === "running",
    );
    if (active.length === 0) return;
    const timer = window.setInterval(() => {
      void Promise.all(active.map((item) => fetchEtcdTaskApi(item.id, token)))
        .then((updates) => {
          setUpdates((current) => ({
            ...current,
            ...Object.fromEntries(updates.map((item) => [item.id, item])),
          }));
        })
        .catch(() => undefined);
    }, 1200);
    return () => window.clearInterval(timer);
  }, [items, token]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((item) => item.id === selectedId) || null;

  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,0.85fr)]">
      <Card className="flex h-full min-h-0 min-w-0 flex-col rounded-lg shadow-none">
        <CardContent className="flex h-full min-h-0 flex-col p-0">
          <div className="shrink-0 border-b border-border/70 px-5 py-4">
            <h2 className="text-base font-semibold">运维任务</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              查看 Etcd 异步运维任务的执行状态和结果。
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {items.length === 0 ? (
              <div className="flex h-full min-h-32 items-center justify-center text-xs text-muted-foreground">
                暂无运维任务记录
              </div>
            ) : (
              <div className="min-w-[620px] text-xs">
                <div className="grid grid-cols-[1.1fr_1.5fr_0.8fr_1.2fr] gap-3 border-b border-border/70 px-5 py-2.5 font-medium text-muted-foreground">
                  <span>任务</span>
                  <span>任务 ID / 信息</span>
                  <span>状态</span>
                  <span>操作者 / 时间</span>
                </div>
                {items.map((item) => (
                  <button
                    type="button"
                    className={cn(
                      "grid w-full grid-cols-[1.1fr_1.5fr_0.8fr_1.2fr] gap-3 border-b border-border/50 px-5 py-3 text-left hover:bg-muted/40",
                      selectedId === item.id && "bg-primary/10",
                    )}
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span className="font-medium">
                      {TASK_LABELS[item.kind] || item.kind}
                    </span>
                    <span className="min-w-0">
                      <span
                        className="block truncate font-mono text-[11px]"
                        title={item.id}
                      >
                        {item.id}
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                        {item.message || "-"}
                      </span>
                    </span>
                    <TaskBadge status={item.status} />
                    <span className="min-w-0 text-[11px] text-muted-foreground">
                      <span className="block truncate">
                        操作者：{item.actor || "-"}
                      </span>
                      <span className="mt-1 block truncate">
                        {formatDateTime(item.created_at)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <Card className="h-full min-h-0 rounded-lg shadow-none">
        {selected ? (
          <CardContent className="flex h-full min-h-0 flex-col p-5">
            <div className="flex items-start justify-between gap-3 border-b border-border/70 pb-4">
              <div>
                <h2 className="text-base font-semibold">任务详情</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {TASK_LABELS[selected.kind] || selected.kind} ·{" "}
                  {formatDateTime(selected.created_at)}
                </p>
              </div>
              <TaskBadge status={selected.status} />
            </div>
            <dl className="grid shrink-0 gap-3 py-4 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">任务 ID</dt>
                <dd className="mt-1 break-all font-mono font-medium">
                  {selected.id}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">操作者</dt>
                <dd className="mt-1 font-medium">{selected.actor || "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">开始时间</dt>
                <dd className="mt-1 font-medium">
                  {selected.started_at
                    ? formatDateTime(selected.started_at)
                    : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">完成时间</dt>
                <dd className="mt-1 font-medium">
                  {selected.finished_at
                    ? formatDateTime(selected.finished_at)
                    : "-"}
                </dd>
              </div>
            </dl>
            {selected.error ? (
              <div className="mb-3 shrink-0 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-700">
                {selected.error}
              </div>
            ) : null}
            <div className="min-h-0 flex-1">
              <JsonCode
                value={
                  Object.keys(selected.result).length > 0
                    ? selected.result
                    : { message: selected.message, status: selected.status }
                }
              />
            </div>
          </CardContent>
        ) : (
          <CardContent className="flex h-full min-h-0 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            选择左侧任务查看结构化详情
          </CardContent>
        )}
      </Card>
    </div>
  );
}
function OperationsView({
  token,
  revisions,
}: {
  token?: string;
  revisions: EtcdRevisionOptionsResponse | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedRevision, setSelectedRevision] = useState("");
  const restoreInput = useRef<HTMLInputElement>(null);
  const run = async (kind: TaskKind) => {
    if (kind === "compact" && !selectedRevision) {
      showErrorToast("请选择要清理的 revision");
      return;
    }
    if (
      kind !== "keyspace" &&
      !window.confirm("确认执行：" + ACTIONS[kind].title + "？")
    )
      return;
    setBusy(kind);
    try {
      await createEtcdTaskApi(
        {
          kind,
          revision: kind === "compact" ? Number(selectedRevision) : undefined,
        },
        token,
      );
      showSuccessToast("运维任务已创建，可在“运维任务”中查看");
    } catch (reason) {
      showErrorToast(reason instanceof Error ? reason.message : "任务创建失败");
    } finally {
      setBusy(null);
    }
  };
  const download = async () => {
    setBusy("snapshot");
    try {
      const blob = await downloadEtcdSnapshotApi(token);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "etcd-snapshot.db";
      anchor.click();
      URL.revokeObjectURL(url);
      showSuccessToast("快照已下载");
    } catch (reason) {
      showErrorToast(reason instanceof Error ? reason.message : "快照下载失败");
    } finally {
      setBusy(null);
    }
  };
  const restore = async (file?: File) => {
    if (!file) return;
    setBusy("restore");
    try {
      const result = await stageEtcdRestoreApi(file, token);
      showSuccessToast(result.message);
    } catch (reason) {
      showErrorToast(reason instanceof Error ? reason.message : "快照登记失败");
    } finally {
      setBusy(null);
      if (restoreInput.current) restoreInput.current.value = "";
    }
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Card className="h-full min-h-0 flex-1 rounded-lg shadow-none">
        <CardContent className="flex h-full min-h-0 flex-col p-5">
          <div className="flex items-start gap-2">
            <Wrench className="h-5 w-5 text-primary" aria-hidden />
            <div>
              <h2 className="text-base font-semibold">运维操作</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                每项操作都会创建异步任务并持续反馈状态。历史压缩的 revision
                由当前 Etcd 数据自动生成候选值。
              </p>
            </div>
          </div>
          <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-auto pr-1">
            {(Object.keys(ACTIONS) as TaskKind[]).map((kind) => (
              <div
                className="rounded-md border border-border/70 p-4"
                key={kind}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">
                      {ACTIONS[kind].title}
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {ACTIONS[kind].description}
                    </p>
                    <p className="mt-2 text-xs text-amber-700">
                      注意事项：{ACTIONS[kind].note}
                    </p>
                  </div>
                  {kind === "compact" ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <select
                        aria-label="选择压缩 revision"
                        className="h-9 min-w-56 rounded-md border border-input bg-background px-3 text-xs"
                        value={selectedRevision}
                        onChange={(event) =>
                          setSelectedRevision(event.target.value)
                        }
                      >
                        <option value="">选择 revision</option>
                        {revisions?.options.map((option) => (
                          <option
                            value={String(option.revision)}
                            key={option.revision}
                          >
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void run(kind)}
                        disabled={Boolean(busy)}
                      >
                        {ACTIONS[kind].button}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      className="shrink-0"
                      size="sm"
                      variant="outline"
                      onClick={() => void run(kind)}
                      disabled={Boolean(busy)}
                    >
                      {ACTIONS[kind].button}
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <div className="rounded-md border border-border/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">快照备份</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    导出当前 Etcd 一致性快照，用于离线归档或灾备留存。
                  </p>
                  <p className="mt-2 text-xs text-amber-700">
                    注意事项：下载文件包含 Etcd 数据，请按安全要求保存。
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void download()}
                  disabled={Boolean(busy)}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  下载快照
                </Button>
              </div>
            </div>
            <div className="rounded-md border border-border/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">恢复备份</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    上传并校验快照，登记到下一次 Etcd 停机维护窗口执行恢复。
                  </p>
                  <p className="mt-2 text-xs text-amber-700">
                    注意事项：这里只登记恢复文件，不会在线替换正在运行的 Etcd。
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => restoreInput.current?.click()}
                  disabled={Boolean(busy)}
                >
                  <FileCheck2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  选择快照
                </Button>
              </div>
            </div>
          </div>
          <input
            ref={restoreInput}
            className="hidden"
            type="file"
            accept=".db,.snapshot,application/octet-stream"
            onChange={(event) => void restore(event.target.files?.[0])}
          />
        </CardContent>
      </Card>
    </div>
  );
}
function EventsView({ events }: { events: EtcdEventItem[] }) {
  const [selected, setSelected] = useState<EtcdEventItem | null>(null);
  const statusText = (value: string) =>
    value === "failed"
      ? "失败"
      : value === "staged"
        ? "已登记"
        : value === "started"
          ? "进行中"
          : "成功";
  return (
    <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,0.85fr)]">
      <Card className="flex h-full min-h-0 min-w-0 flex-col rounded-lg shadow-none">
        <CardContent className="flex h-full min-h-0 flex-col p-0">
          <div className="shrink-0 border-b border-border/70 px-5 py-4">
            <h2 className="text-base font-semibold">事件历史</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              点击一条记录，在右侧查看完整的结构化 JSON 详情。
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="min-w-[620px] text-xs">
              <div className="grid grid-cols-[1.2fr_1fr_0.8fr_1.2fr_1.4fr] gap-3 border-b border-border/70 px-5 py-2.5 font-medium text-muted-foreground">
                <span>时间</span>
                <span>动作</span>
                <span>状态</span>
                <span>操作者</span>
                <span>目标 / revision</span>
              </div>
              {events.map((event, index) => (
                <button
                  type="button"
                  className={cn(
                    "grid w-full grid-cols-[1.2fr_1fr_0.8fr_1.2fr_1.4fr] gap-3 border-b border-border/50 px-5 py-3 text-left hover:bg-muted/40",
                    selected === event && "bg-primary/10",
                  )}
                  key={event.created_at + event.kind + index}
                  onClick={() => setSelected(event)}
                >
                  <span>{formatDateTime(event.created_at)}</span>
                  <span className="font-medium">
                    {EVENT_LABELS[event.kind] || event.kind}
                  </span>
                  <span
                    className={
                      event.status === "failed"
                        ? "text-rose-600"
                        : event.status === "staged"
                          ? "text-amber-600"
                          : "text-emerald-600"
                    }
                  >
                    {statusText(event.status)}
                  </span>
                  <span className="truncate">{event.actor || "-"}</span>
                  <span className="truncate">
                    {event.endpoint ||
                      (event.revision ? "revision " + event.revision : "-")}
                  </span>
                </button>
              ))}
              {events.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  暂无事件记录
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="min-w-0">
        <Card className="h-full min-h-0 rounded-lg shadow-none">
          {selected ? (
            <CardContent className="flex h-full min-h-0 flex-col p-5">
              <div className="flex items-start justify-between gap-3 border-b border-border/70 pb-4">
                <div>
                  <h2 className="text-base font-semibold">事件详情</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {EVENT_LABELS[selected.kind] || selected.kind} ·{" "}
                    {formatDateTime(selected.created_at)}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-xs font-medium",
                    selected.status === "failed"
                      ? "text-rose-600"
                      : selected.status === "staged"
                        ? "text-amber-600"
                        : "text-emerald-600",
                  )}
                >
                  {statusText(selected.status)}
                </span>
              </div>
              <dl className="grid shrink-0 gap-3 py-4 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">操作者</dt>
                  <dd className="mt-1 font-medium">{selected.actor || "-"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">目标</dt>
                  <dd className="mt-1 truncate font-medium">
                    {selected.endpoint || "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Revision</dt>
                  <dd className="mt-1 font-mono font-medium">
                    {selected.revision || "-"}
                  </dd>
                </div>
              </dl>
              <div className="min-h-0 flex-1">
                <JsonCode value={selected.detail} />
              </div>
            </CardContent>
          ) : (
            <CardContent className="flex h-full min-h-0 items-center justify-center p-6 text-center text-sm text-muted-foreground">
              选择左侧事件查看 JSON 详情
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
function PageTabs({ view }: { view: PageView }) {
  // Use the same compact segmented navigation pattern as the other
  // operations pages while keeping each view addressable by its own path.
  return (
    <nav
      className="inline-flex items-center rounded-lg border border-border/80 bg-card p-1"
      aria-label="Etcd 运维分页"
    >
      <NavLink
        to="/admin/etcd-operations/status"
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs transition-colors",
          view === "status"
            ? "bg-background font-medium text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
        服务状态
      </NavLink>
      <span
        className="px-0.5 text-sm leading-none text-muted-foreground/70"
        aria-hidden
      >
        &gt;
      </span>
      <NavLink
        to="/admin/etcd-operations/maintenance/trend"
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs transition-colors",
          view !== "status"
            ? "bg-background font-medium text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Wrench className="h-3.5 w-3.5" aria-hidden />
        服务运维
      </NavLink>
    </nav>
  );
}
function MaintenanceNav({ view }: { view: PageView }) {
  const links: Array<[string, PageView, string]> = [
    ["/admin/etcd-operations/maintenance/trend", "trend", "状态趋势"],
    ["/admin/etcd-operations/maintenance/operations", "operations", "运维操作"],
    ["/admin/etcd-operations/maintenance/tasks", "tasks", "运维任务"],
    ["/admin/etcd-operations/maintenance/events", "events", "事件历史"],
  ];
  return (
    <aside className="rounded-lg border border-border/70 bg-card p-2">
      <div className="flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-muted-foreground">
        <Network className="h-3.5 w-3.5" aria-hidden />
        服务运维
      </div>
      {links.map(([href, itemView, label]) => (
        <NavLink
          key={href}
          to={href}
          className={cn(
            "block rounded-md px-3 py-2.5 text-xs",
            view === itemView
              ? "bg-primary/10 font-medium text-primary"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
        >
          {label}
        </NavLink>
      ))}
    </aside>
  );
}
export default function EtcdOperationsPage({
  view = "status",
}: {
  view?: PageView;
}) {
  const { accessToken, user } = useAuth();
  const [data, setData] = useState<EtcdClusterStatusResponse | null>(null);
  const [trend, setTrend] = useState<EtcdTrendResponse | null>(null);
  const [events, setEvents] = useState<EtcdEventItem[]>([]);
  const [revisions, setRevisions] =
    useState<EtcdRevisionOptionsResponse | null>(null);
  const [tasks, setTasks] = useState<EtcdTaskResponse[]>([]);
  const [issueMember, setIssueMember] = useState<EtcdEndpointStatus | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canOperate = hasPermission(user, PERMISSIONS.storageOperationsManage);
  const loadStatus = useCallback(
    async (force = false) => {
      if (force) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        setData(await fetchEtcdOperationsApi(accessToken || undefined, force));
      } catch (reason) {
        setError(
          reason instanceof Error ? reason.message : "Etcd 状态读取失败",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [accessToken],
  );
  const loadMaintenance = useCallback(async () => {
    try {
      const [trendResult, eventResult, taskResult] = await Promise.all([
        fetchEtcdTrendApi(accessToken || undefined),
        fetchEtcdEventsApi(accessToken || undefined),
        fetchEtcdTasksApi(accessToken || undefined),
      ]);
      setTrend(trendResult);
      setEvents(eventResult.data);
      setTasks(taskResult.data);
      if (view === "operations")
        setRevisions(
          await fetchEtcdRevisionOptionsApi(accessToken || undefined),
        );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Etcd 运维数据读取失败",
      );
    }
  }, [accessToken, view]);
  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);
  useEffect(() => {
    if (view !== "status") void loadMaintenance();
  }, [loadMaintenance, view]);
  useEffect(() => {
    const timer = window.setInterval(() => void loadStatus(true), 30000);
    return () => window.clearInterval(timer);
  }, [loadStatus]);
  if (!canOperate) return <Navigate to="/data/basic/region" replace />;
  if (loading && !data)
    return <BrandLoading label="正在检查测试 Etcd 集群..." />;
  if (error && !data)
    return (
      <Card className="rounded-lg shadow-none">
        <CardContent className="p-6 text-sm text-destructive">
          {error}
        </CardContent>
      </Card>
    );
  if (!data) return null;
  return (
    <div className="mx-auto flex h-full min-h-0 max-w-8xl flex-col">
      <div className="mb-4 flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Etcd 运维</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            第一分页为服务状态，第二分页为服务运维。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PageTabs view={view} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadStatus(true)}
            disabled={refreshing}
          >
            <RefreshCw
              className={cn("mr-1.5 h-3.5 w-3.5", refreshing && "animate-spin")}
              aria-hidden
            />
            刷新
          </Button>
        </div>
      </div>
      {view === "status" ? (
        <StatusPage data={data} onIssue={setIssueMember} />
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[12rem_minmax(0,1fr)]">
          <MaintenanceNav view={view} />
          <main className="flex min-h-0 min-w-0 flex-1 flex-col">
            {view === "trend" ? (
              <TrendView trend={trend} />
            ) : view === "tasks" ? (
              <TaskHistory tasks={tasks} token={accessToken || undefined} />
            ) : view === "events" ? (
              <EventsView events={events} />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col gap-4">
                <OperationsView
                  token={accessToken || undefined}
                  revisions={revisions}
                />
              </div>
            )}
            {error ? (
              <div className="mt-3 text-xs text-rose-600">
                部分运维数据刷新失败：{error}
              </div>
            ) : null}
          </main>
        </div>
      )}
      <Dialog
        open={Boolean(issueMember)}
        onOpenChange={(open) => !open && setIssueMember(null)}
      >
        {issueMember ? (
          <MemberIssueDialog
            member={issueMember}
            onClose={() => setIssueMember(null)}
          />
        ) : null}
      </Dialog>
    </div>
  );
}
