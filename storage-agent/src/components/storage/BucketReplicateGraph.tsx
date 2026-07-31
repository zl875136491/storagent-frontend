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
  CircleDashed,
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
import { Button } from "../ui/button"

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
    <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 px-3 py-2 last:border-b-0">
      <div className="flex min-w-0 items-center gap-2 font-mono text-[11px] text-foreground">
        <span className="truncate" title={from}>{from}</span>
        <ArrowRight size={13} className="shrink-0 text-muted-foreground" />
        <span className="truncate" title={to}>{to}</span>
      </div>
      <div className="flex items-center gap-2">
        {rule && (
          <span
            className="hidden max-w-28 truncate font-mono text-[10px] text-muted-foreground sm:inline"
            title={rule.rule_id}
          >
            {rule.rule_id}
          </span>
        )}
        <span className={cn("inline-flex min-w-16 items-center justify-end gap-1 text-[11px] font-medium", TONE_CLASSES[tone])}>
          <StatusIcon tone={tone} size={13} />
          {statusText(rules)}
        </span>
      </div>
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
  return (
    <section className="border-t border-border" aria-label={`${left} 与 ${right} 的方向状态`}>
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <h4 className="text-xs font-semibold text-foreground">双向规则</h4>
        <span className="truncate font-mono text-[10px] text-muted-foreground">
          {left} / {right}
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
    <section className="border-t border-border" aria-label={`${server} 的方向状态`}>
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <h4 className="text-xs font-semibold text-foreground">站点方向</h4>
        <span className="font-mono text-[10px] text-muted-foreground">
          {server} · {directions.length} 个方向
        </span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2">
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
    <div className="docs-scroll min-h-0 flex-1 overflow-auto p-3">
      <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-32 border-b border-r border-border bg-card px-2 py-2 text-left text-[10px] font-medium text-muted-foreground">
              源站点 / 目标站点
            </th>
            {servers.map((server) => (
              <th
                key={server}
                className="border-b border-border px-2 py-2 text-center font-mono text-[10px] font-medium text-muted-foreground"
                title={server}
              >
                <span className="block truncate">{server}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {servers.map((from) => (
            <tr key={from}>
              <th
                className="sticky left-0 z-10 border-b border-r border-border bg-card px-2 py-2 text-left font-mono text-[11px] font-medium text-foreground"
                title={from}
              >
                <span className="block truncate">{from}</span>
              </th>
              {servers.map((to) => {
                if (from === to) {
                  return (
                    <td key={to} className="h-12 border-b border-border bg-muted/25 text-center text-muted-foreground">
                      <Minus size={15} className="mx-auto" aria-label="不适用" />
                    </td>
                  )
                }
                const pairRules = rulesForPair(rules, from, to)
                const tone = directedTone(pairRules)
                const selected = selectedPair?.[0] === from && selectedPair[1] === to
                return (
                  <td key={to} className="h-12 border-b border-border text-center">
                    <button
                      type="button"
                      className={cn(
                        "mx-auto inline-flex h-8 w-16 items-center justify-center gap-1 rounded-md border border-transparent text-[10px] font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        TONE_CLASSES[tone],
                        selected && "border-current bg-muted",
                      )}
                      title={`${from} -> ${to}: ${statusText(pairRules)}`}
                      aria-label={`${from} 到 ${to}: ${statusText(pairRules)}`}
                      onClick={() => onSelectPair([from, to])}
                    >
                      <StatusIcon tone={tone} size={14} />
                      {tone === "healthy" ? "正常" : statusText(pairRules)}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
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

function shortenLine(from: Point, to: Point, distance = 42) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.max(Math.hypot(dx, dy), 1)
  const ux = dx / length
  const uy = dy / length
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
    <div className="min-h-0 flex-1 overflow-hidden p-2 sm:p-3">
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
              markerWidth="7"
              markerHeight="7"
              refX="5.5"
              refY="3.5"
              orient="auto-start-reverse"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L7,3.5 L0,7 Z" fill={stroke[tone]} />
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
              className="cursor-pointer"
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
                strokeWidth="18"
              />
              <line
                {...line}
                stroke={stroke[tone]}
                strokeWidth={selected ? 3.5 : 2}
                strokeOpacity={active ? (tone === "healthy" ? 0.68 : 0.9) : 0.1}
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
              className="cursor-pointer"
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
                strokeWidth={selected ? 2.5 : 1.5}
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
  const [view, setView] = useState<ViewMode>("matrix")
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
        <div className="flex min-h-52 flex-1 items-center justify-center text-muted-foreground">
          <CircleDashed size={20} className="animate-spin" aria-label="加载中" />
        </div>
      ) : servers.length === 0 ? (
        <div className="flex min-h-52 flex-1 items-center justify-center text-xs text-muted-foreground">
          暂无可用站点
        </div>
      ) : (
        <>
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
          {selectedPair && <PairDetails pair={selectedPair} rules={rules} />}
          {selectedNode && (
            <NodeDetails server={selectedNode} servers={servers} rules={rules} />
          )}
        </>
      )}
    </div>
  )
}
