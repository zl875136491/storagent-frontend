import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  Grid3X3,
  Minus,
  Network,
  RefreshCw,
  X,
} from "lucide-react"

import type {
  BucketReplicateRule,
  BucketReplicatesResponse,
  BucketReplicationPolicySummary,
} from "../../api/client"
import { fetchBucketReplicatesApi } from "../../api/client"
import { cn } from "../../lib/utils"
import { BrandLoading } from "../BrandLoading"
import { Button } from "../ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table"

type ViewMode = "matrix" | "graph"
type Pair = [string, string]
type PairTone = "healthy" | "degraded" | "missing"

const TONE_CLASSES: Record<PairTone, string> = {
  healthy: "text-emerald-700 dark:text-emerald-300",
  degraded: "text-amber-700 dark:text-amber-300",
  missing: "text-destructive",
}

function collectServerIds(response: BucketReplicatesResponse): string[] {
  const ids = new Set(response.server_ids ?? [])
  if (Array.isArray(response.servers)) {
    response.servers.forEach((server) => ids.add(server))
  } else {
    Object.keys(response.servers ?? {}).forEach((server) => ids.add(server))
  }
  response.replicates.forEach((rule) => {
    ids.add(rule.from)
    ids.add(rule.to)
  })
  return [...ids].sort((left, right) => left.localeCompare(right))
}

function settingEnabled(value: string | undefined): boolean {
  return value?.toLowerCase() === "enabled"
}

function ruleHealthy(rule: BucketReplicateRule): boolean {
  const status = rule.status
  return (
    status?.status?.toLowerCase() === "success" &&
    (status.rule_status == null || settingEnabled(status.rule_status)) &&
    settingEnabled(status.delete_marker_replication) &&
    settingEnabled(status.existing_object_replication) &&
    settingEnabled(status.source_selection_criteria)
  )
}

function rulesForPair(
  rules: BucketReplicateRule[],
  from: string,
  to: string,
): BucketReplicateRule[] {
  return rules.filter((rule) => rule.from === from && rule.to === to)
}

function directedTone(rules: BucketReplicateRule[]): PairTone {
  if (rules.length === 0) return "missing"
  if (rules.length !== 1 || !ruleHealthy(rules[0])) return "degraded"
  return "healthy"
}

function bidirectionalTone(
  rules: BucketReplicateRule[],
  left: string,
  right: string,
): PairTone {
  const forward = directedTone(rulesForPair(rules, left, right))
  const reverse = directedTone(rulesForPair(rules, right, left))
  if (forward === "healthy" && reverse === "healthy") return "healthy"
  if (forward === "missing" || reverse === "missing") return "missing"
  return "degraded"
}

function fallbackPolicy(
  servers: string[],
  rules: BucketReplicateRule[],
): BucketReplicationPolicySummary {
  const expected = servers.length * Math.max(servers.length - 1, 0)
  const healthy = rules.filter(ruleHealthy).length
  const everyPairHealthy = servers.every((from) =>
    servers.every((to) => (
      from === to || directedTone(rulesForPair(rules, from, to)) === "healthy"
    )),
  )
  const complete = expected > 0 && rules.length === expected && everyPairHealthy
  return {
    type: "full_mesh",
    site_count: servers.length,
    expected_rule_count: expected,
    actual_rule_count: rules.length,
    healthy_rule_count: healthy,
    complete,
    status: complete ? "ready" : "degraded",
  }
}

function StatusIcon({ tone, size = 15 }: { tone: PairTone; size?: number }) {
  if (tone === "healthy") return <Check size={size} strokeWidth={2.5} />
  if (tone === "degraded") return <AlertTriangle size={size} strokeWidth={2.2} />
  return <X size={size} strokeWidth={2.3} />
}

function statusText(rules: BucketReplicateRule[]): string {
  if (rules.length === 0) return "缺失"
  if (rules.length > 1) return `重复 (${rules.length})`
  const rule = rules[0]
  if (ruleHealthy(rule)) return "健康"
  if (rule.status?.rule_status != null && !settingEnabled(rule.status.rule_status)) return "已停用"
  return "配置异常"
}

function DirectionRow({
  from,
  to,
  rules,
}: {
  from: string
  to: string
  rules: BucketReplicateRule[]
}) {
  const tone = directedTone(rules)
  const rule = rules[0]
  return (
    <div className="border-b border-border/60 px-3 py-2.5 last:border-b-0">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-foreground">
          <span className="truncate" title={from}>{from}</span>
          <ArrowRight size={12} className="shrink-0 text-muted-foreground" />
          <span className="truncate" title={to}>{to}</span>
        </div>
        <span className={cn("inline-flex min-w-16 items-center justify-end gap-1 text-[11px] font-medium", TONE_CLASSES[tone])}>
          <StatusIcon tone={tone} size={13} />
          {statusText(rules)}
        </span>
      </div>
      {rule ? (
        <div
          className="mt-1.5 truncate font-mono text-[10px] text-muted-foreground"
          title={rule.rule_id}
        >
          Rule ID · {rule.rule_id}
        </div>
      ) : null}
    </div>
  )
}

function PairDetails({
  pair,
  rules,
}: {
  pair: Pair
  rules: BucketReplicateRule[]
}) {
  const [left, right] = pair
  const tone = bidirectionalTone(rules, left, right)
  const summary = tone === "healthy" ? "双向健康" : tone === "missing" ? "规则缺失" : "配置待修复"
  return (
    <section aria-label={`${left} 与 ${right} 的方向状态`}>
      <div className="border-b border-border/70 px-3 py-3">
        <div className="text-[10px] font-medium text-muted-foreground">复制关系</div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 font-mono text-xs font-semibold text-foreground">
          <span className="truncate" title={left}>{left}</span>
          <ArrowRight size={13} className="shrink-0 text-muted-foreground" />
          <span className="truncate" title={right}>{right}</span>
        </div>
        <span className={cn("mt-2 inline-flex items-center gap-1 text-[11px] font-medium", TONE_CLASSES[tone])}>
          <StatusIcon tone={tone} size={13} />
          {summary}
        </span>
      </div>
      <DirectionRow from={left} to={right} rules={rulesForPair(rules, left, right)} />
      <DirectionRow from={right} to={left} rules={rulesForPair(rules, right, left)} />
    </section>
  )
}

function NodeDetails({
  server,
  servers,
  rules,
}: {
  server: string
  servers: string[]
  rules: BucketReplicateRule[]
}) {
  const directions = servers
    .filter((target) => target !== server)
    .flatMap((target) => [[server, target], [target, server]] as Pair[])
  return (
    <section aria-label={`${server} 的方向状态`}>
      <div className="border-b border-border/70 px-3 py-3">
        <div className="text-[10px] font-medium text-muted-foreground">站点详情</div>
        <h4 className="mt-1 truncate font-mono text-xs font-semibold text-foreground" title={server}>
          {server}
        </h4>
        <div className="mt-1 text-[11px] text-muted-foreground">
          共 {directions.length} 个复制方向
        </div>
      </div>
      <div>
        {directions.map(([from, to]) => (
          <DirectionRow
            key={`${from}->${to}`}
            from={from}
            to={to}
            rules={rulesForPair(rules, from, to)}
          />
        ))}
      </div>
    </section>
  )
}

function PolicyDetails({ policy }: { policy: BucketReplicationPolicySummary }) {
  const items = [
    ["策略类型", "全连接拓扑"],
    ["站点数", String(policy.site_count)],
    ["规则数", `${policy.actual_rule_count} / ${policy.expected_rule_count}`],
    ["健康规则", `${policy.healthy_rule_count} / ${policy.expected_rule_count}`],
  ]
  return (
    <section aria-label="复制策略详情">
      <div className="border-b border-border/70 px-3 py-3">
        <div className="text-[10px] font-medium text-muted-foreground">策略详情</div>
        <h4 className="mt-1 text-sm font-semibold text-foreground">全连接复制</h4>
        <div
          className={cn(
            "mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium",
            policy.complete
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-amber-700 dark:text-amber-300",
          )}
        >
          {policy.complete ? <Check size={13} /> : <AlertTriangle size={13} />}
          {policy.complete ? "策略已收敛" : "策略待修复"}
        </div>
      </div>
      <dl className="px-3 py-2">
        {items.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 border-b border-border/50 py-2 last:border-b-0">
            <dt className="text-[11px] text-muted-foreground">{label}</dt>
            <dd className="text-right text-[11px] font-medium tabular-nums text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function SelectionDetails({
  selectedPair,
  selectedNode,
  servers,
  rules,
  policy,
}: {
  selectedPair: Pair | null
  selectedNode: string | null
  servers: string[]
  rules: BucketReplicateRule[]
  policy: BucketReplicationPolicySummary
}) {
  return (
    <aside className="docs-scroll min-h-[220px] overflow-y-auto rounded-lg border border-border/80 bg-card shadow-sm lg:min-h-0">
      {selectedPair ? (
        <PairDetails pair={selectedPair} rules={rules} />
      ) : selectedNode ? (
        <NodeDetails server={selectedNode} servers={servers} rules={rules} />
      ) : (
        <PolicyDetails policy={policy} />
      )}
    </aside>
  )
}

function PolicySummary({ policy }: { policy: BucketReplicationPolicySummary }) {
  const stats = [
    ["策略", "全连接"],
    ["站点", String(policy.site_count)],
    ["规则", `${policy.actual_rule_count}/${policy.expected_rule_count}`],
    ["健康", `${policy.healthy_rule_count}/${policy.expected_rule_count}`],
    ["收敛", policy.complete ? "已收敛" : "待修复"],
  ]
  return (
    <div className="grid grid-cols-2 border-b border-border sm:grid-cols-5">
      {stats.map(([label, value], index) => (
        <div
          key={label}
          className={cn(
            "min-w-0 border-border px-3 py-2.5",
            index > 0 && "sm:border-l",
            index > 1 && "border-t sm:border-t-0",
            index === 1 && "border-l sm:border-l",
            index === 4 && "col-span-2 sm:col-span-1",
          )}
        >
          <div className="text-[10px] text-muted-foreground">{label}</div>
          <div
            className={cn(
              "mt-0.5 truncate text-sm font-semibold tabular-nums text-foreground",
              label === "收敛" && (policy.complete ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"),
            )}
            title={value}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  )
}

function StatusMatrix({
  servers,
  rules,
  selectedPair,
  onSelectPair,
}: {
  servers: string[]
  rules: BucketReplicateRule[]
  selectedPair: Pair | null
  onSelectPair: (pair: Pair) => void
}) {
  return (
    <div className="docs-scroll h-full min-h-[360px] overflow-auto bg-background">
      <Table className="min-w-[640px] table-fixed">
        <TableHeader className="bg-muted/35">
          <TableRow className="hover:bg-muted/35">
            <TableHead className="sticky left-0 z-20 w-36 border-r border-border bg-muted/80 text-[10px]">
              源站点 / 目标站点
            </TableHead>
            {servers.map((server) => (
              <TableHead
                key={server}
                className="px-2 text-center font-mono text-[10px]"
                title={server}
              >
                <span className="block truncate">{server}</span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {servers.map((from) => (
            <TableRow key={from}>
              <TableCell
                className="sticky left-0 z-10 border-r border-border bg-background px-2 font-mono text-[11px] font-medium text-foreground"
                title={from}
              >
                <span className="block truncate">{from}</span>
              </TableCell>
              {servers.map((to) => {
                if (from === to) {
                  return (
                    <TableCell key={to} className="h-12 bg-muted/20 text-center text-muted-foreground">
                      <Minus size={15} className="mx-auto" aria-label="不适用" />
                    </TableCell>
                  )
                }
                const pairRules = rulesForPair(rules, from, to)
                const tone = directedTone(pairRules)
                const selected = selectedPair?.[0] === from && selectedPair[1] === to
                return (
                  <TableCell key={to} className="h-12 text-center">
                    <button
                      type="button"
                      aria-pressed={selected}
                      className={cn(
                        "mx-auto inline-flex h-8 min-w-16 items-center justify-center gap-1 rounded-md px-2 text-[10px] font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected
                          ? "bg-accent text-accent-foreground shadow-sm"
                          : TONE_CLASSES[tone],
                      )}
                      title={`${from} -> ${to}: ${statusText(pairRules)}`}
                      aria-label={`${from} 到 ${to}: ${statusText(pairRules)}`}
                      onClick={() => onSelectPair([from, to])}
                    >
                      <StatusIcon tone={tone} size={14} />
                      {tone === "healthy" ? "正常" : statusText(pairRules)}
                    </button>
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

type Point = { x: number; y: number }

function circlePoints(servers: string[]): Map<string, Point> {
  const points = new Map<string, Point>()
  servers.forEach((server, index) => {
    const angle = (Math.PI * 2 * index) / servers.length - Math.PI / 2
    points.set(server, {
      x: 400 + Math.cos(angle) * 260,
      y: 250 + Math.sin(angle) * 175,
    })
  })
  return points
}

function shortenLine(from: Point, to: Point) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.max(Math.hypot(dx, dy), 1)
  const ux = dx / length
  const uy = dy / length
  const horizontalDistance = Math.abs(ux) < 0.001 ? Number.POSITIVE_INFINITY : 58 / Math.abs(ux)
  const verticalDistance = Math.abs(uy) < 0.001 ? Number.POSITIVE_INFINITY : 21 / Math.abs(uy)
  const distance = Math.min(horizontalDistance, verticalDistance) + 8
  return {
    x1: from.x + ux * distance,
    y1: from.y + uy * distance,
    x2: to.x - ux * distance,
    y2: to.y - uy * distance,
  }
}

function AggregatedGraph({
  servers,
  rules,
  selectedNode,
  selectedPair,
  onSelectNode,
  onSelectPair,
}: {
  servers: string[]
  rules: BucketReplicateRule[]
  selectedNode: string | null
  selectedPair: Pair | null
  onSelectNode: (server: string) => void
  onSelectPair: (pair: Pair) => void
}) {
  const points = useMemo(() => circlePoints(servers), [servers])
  const pairs = useMemo(
    () => servers.flatMap((left, index) => servers.slice(index + 1).map((right) => [left, right] as Pair)),
    [servers],
  )
  const stroke: Record<PairTone, string> = {
    healthy: "#059669",
    degraded: "#d97706",
    missing: "#dc2626",
  }

  return (
    <div className="h-full min-h-[360px] overflow-hidden p-2 sm:p-3">
      <svg
        className="h-full min-h-[360px] w-full"
        viewBox="0 0 800 500"
        role="img"
        aria-label="全连接复制关系图"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {(Object.keys(stroke) as PairTone[]).map((tone) => (
            <marker
              key={tone}
              id={`replicate-arrow-${tone}`}
              markerWidth="5"
              markerHeight="5"
              refX="4.25"
              refY="2.5"
              orient="auto-start-reverse"
              markerUnits="userSpaceOnUse"
            >
              <path d="M0,0 L5,2.5 L0,5 Z" fill={stroke[tone]} />
            </marker>
          ))}
        </defs>
        {pairs.map(([left, right]) => {
          const from = points.get(left)
          const to = points.get(right)
          if (!from || !to) return null
          const line = shortenLine(from, to)
          const tone = bidirectionalTone(rules, left, right)
          const nodeActive = !selectedNode || selectedNode === left || selectedNode === right
          const pairActive = !selectedPair || (
            selectedPair.includes(left) && selectedPair.includes(right)
          )
          const active = nodeActive && pairActive
          const selected = Boolean(selectedPair && selectedPair.includes(left) && selectedPair.includes(right))
          return (
            <g
              key={`${left}<->${right}`}
              role="button"
              tabIndex={0}
              aria-label={`关系 ${left} 与 ${right}`}
              aria-pressed={selected}
              className="cursor-pointer outline-none focus:outline-none"
              onClick={() => onSelectPair([left, right])}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  onSelectPair([left, right])
                }
              }}
            >
              <line
                {...line}
                stroke="transparent"
                strokeWidth="14"
              />
              <line
                {...line}
                stroke={stroke[tone]}
                strokeWidth={selected ? 1.8 : 1.1}
                strokeOpacity={active ? (selected ? 0.95 : tone === "healthy" ? 0.45 : 0.72) : 0.08}
                strokeLinecap="round"
                markerStart={`url(#replicate-arrow-${tone})`}
                markerEnd={`url(#replicate-arrow-${tone})`}
                className="pointer-events-none transition-opacity"
              />
            </g>
          )
        })}
        {servers.map((server) => {
          const point = points.get(server)
          if (!point) return null
          const selected = selectedNode === server
          const incidentRules = rules.filter(
            (rule) => rule.from === server || rule.to === server,
          )
          const nodeHealthy = (
            incidentRules.length === Math.max((servers.length - 1) * 2, 0)
            && incidentRules.every(ruleHealthy)
          )
          return (
            <g
              key={server}
              className="cursor-pointer outline-none focus:outline-none"
              role="button"
              aria-label={`站点 ${server}`}
              tabIndex={0}
              onClick={() => onSelectNode(server)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onSelectNode(server)
              }}
            >
              <rect
                x={point.x - 58}
                y={point.y - 21}
                width="116"
                height="42"
                rx="6"
                fill="var(--card)"
                stroke={selected ? "var(--primary)" : "var(--border)"}
                strokeWidth={selected ? 1.75 : 1}
                opacity="1"
              />
              <circle
                cx={point.x - 43}
                cy={point.y}
                r="4"
                fill={nodeHealthy ? "#059669" : "#d97706"}
              />
              <text
                x={point.x + 5}
                y={point.y + 4}
                textAnchor="middle"
                fill="var(--foreground)"
                fontSize="12"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontWeight="600"
              >
                {server.length > 13 ? `${server.slice(0, 12)}…` : server}
              </text>
              <title>{server}</title>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function IconTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-20 mt-1 hidden whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-[10px] text-popover-foreground shadow-sm group-hover:block group-focus-within:block"
      >
        {label}
      </span>
    </span>
  )
}

export interface BucketReplicateGraphProps {
  bucketName: string
  accessToken?: string
}

export function BucketReplicateGraph({ bucketName, accessToken }: BucketReplicateGraphProps) {
  const [response, setResponse] = useState<BucketReplicatesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [view, setView] = useState<ViewMode>("graph")
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [selectedPair, setSelectedPair] = useState<Pair | null>(null)
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const current = ++requestId.current
    setLoading(true)
    setError("")
    try {
      const data = await fetchBucketReplicatesApi(bucketName, accessToken)
      if (current === requestId.current) setResponse(data)
    } catch (caught) {
      if (current === requestId.current) {
        setError(caught instanceof Error ? caught.message : "复制策略读取失败")
      }
    } finally {
      if (current === requestId.current) setLoading(false)
    }
  }, [accessToken, bucketName])

  useEffect(() => {
    void load()
    return () => {
      requestId.current += 1
    }
  }, [load])

  useEffect(() => {
    setSelectedNode(null)
    setSelectedPair(null)
  }, [bucketName, view])

  const servers = useMemo(() => response ? collectServerIds(response) : [], [response])
  const rules = response?.replicates ?? []
  const policy = response?.policy ?? fallbackPolicy(servers, rules)

  const selectNode = (server: string) => {
    setSelectedNode((current) => current === server ? null : server)
    setSelectedPair(null)
  }
  const selectPair = (pair: Pair) => {
    setSelectedPair(pair)
    setSelectedNode(null)
  }

  return (
    <div className="flex h-full min-h-[560px] flex-col overflow-hidden bg-background/50 lg:min-h-0">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Network size={16} className="shrink-0 text-primary" />
            <h3 className="truncate text-sm font-semibold text-foreground">复制策略</h3>
          </div>
          <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground" title={bucketName}>
            {bucketName}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5" role="tablist" aria-label="复制策略视图">
            <button
              type="button"
              role="tab"
              aria-selected={view === "graph"}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors",
                view === "graph" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setView("graph")}
            >
              <Network size={13} />
              关系图
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "matrix"}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors",
                view === "matrix" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setView("matrix")}
            >
              <Grid3X3 size={13} />
              状态矩阵
            </button>
          </div>
          <IconTooltip label="刷新复制状态">
            <Button
              variant="outline"
              size="icon"
              aria-label="刷新复制状态"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </Button>
          </IconTooltip>
        </div>
      </header>

      {response && <PolicySummary policy={policy} />}

      {error ? (
        <div className="flex min-h-52 flex-1 items-center justify-center px-4 text-center">
          <div className="max-w-md text-sm text-destructive">
            <AlertCircle size={20} className="mx-auto mb-2" />
            {error}
          </div>
        </div>
      ) : !response && loading ? (
        <BrandLoading label="正在加载复制关系..." className="min-h-52 flex-1" compact />
      ) : servers.length === 0 ? (
        <div className="flex min-h-52 flex-1 items-center justify-center text-xs text-muted-foreground">
          暂无可用站点
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="min-h-[380px] overflow-hidden rounded-lg border border-border/80 bg-background lg:min-h-0">
            {view === "matrix" ? (
              <StatusMatrix
                servers={servers}
                rules={rules}
                selectedPair={selectedPair}
                onSelectPair={selectPair}
              />
            ) : (
              <AggregatedGraph
                servers={servers}
                rules={rules}
                selectedNode={selectedNode}
                selectedPair={selectedPair}
                onSelectNode={selectNode}
                onSelectPair={selectPair}
              />
            )}
          </div>
          <SelectionDetails
            selectedPair={selectedPair}
            selectedNode={selectedNode}
            servers={servers}
            rules={rules}
            policy={policy}
          />
        </div>
      )}
    </div>
  )
}
