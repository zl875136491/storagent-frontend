import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  reconnectEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useStore,
  MarkerType,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  ConnectionLineType,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import type {
  BucketReplicateRule,
  BucketReplicatesResponse,
  BucketReplicateCreatePayload,
  BucketReplicateServersMap,
  ReplicateGraphLayoutV1,
  ReplicateGraphPortPosition,
  ReplicateSide,
} from "../../api/client"
import {
  createBucketReplicateApi,
  fetchBucketReplicatesApi,
  postBucketGraphEdgePosition,
  postBucketGraphNodePosition,
} from "../../api/client"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Switch } from "../ui/switch"
import { cn } from "../../lib/utils"

const SIDES: ReplicateSide[] = ["top", "right", "bottom", "left"]

function sideToPosition(side: ReplicateSide): Position {
  switch (side) {
    case "top":
      return Position.Top
    case "right":
      return Position.Right
    case "bottom":
      return Position.Bottom
    case "left":
      return Position.Left
    default:
      return Position.Bottom
  }
}

export function outHandleId(side: ReplicateSide): string {
  return `out-${side}`
}

export function inHandleId(side: ReplicateSide): string {
  return `in-${side}`
}

export function parseOutSide(handleId: string | null | undefined): ReplicateSide | null {
  if (!handleId?.startsWith("out-")) return null
  const s = handleId.slice(4) as ReplicateSide
  return SIDES.includes(s) ? s : null
}

export function parseInSide(handleId: string | null | undefined): ReplicateSide | null {
  if (!handleId?.startsWith("in-")) return null
  const s = handleId.slice(3) as ReplicateSide
  return SIDES.includes(s) ? s : null
}

/** 与后端 GET 坐标及画布像素互转时的基准区域 */
const GRAPH_AREA_W = 900
const GRAPH_AREA_H = 560

function isServersRecord(
  servers: BucketReplicatesResponse["servers"],
): servers is BucketReplicateServersMap {
  return servers != null && !Array.isArray(servers) && typeof servers === "object"
}

function graphCoordModeFromServersMap(map: BucketReplicateServersMap): "percent" | "pixel" {
  const vals = Object.values(map)
  if (vals.length === 0) return "percent"
  return vals.some((v) => v.position_x > 100 || v.position_y > 100) ? "pixel" : "percent"
}

function getGraphCoordMode(resp: BucketReplicatesResponse): "percent" | "pixel" {
  if (isServersRecord(resp.servers)) {
    return graphCoordModeFromServersMap(resp.servers)
  }
  return "percent"
}

function serverEntryToPixel(
  entry: { position_x: number; position_y: number },
  mode: "percent" | "pixel",
): { x: number; y: number } {
  if (mode === "pixel") {
    return { x: entry.position_x, y: entry.position_y }
  }
  return {
    x: (entry.position_x / 100) * GRAPH_AREA_W,
    y: (entry.position_y / 100) * GRAPH_AREA_H,
  }
}

function pixelToGraphPayload(
  x: number,
  y: number,
  mode: "percent" | "pixel",
): { position_x: number; position_y: number } {
  if (mode === "pixel") {
    return { position_x: Math.round(x), position_y: Math.round(y) }
  }
  const px = Math.round((x / GRAPH_AREA_W) * 100)
  const py = Math.round((y / GRAPH_AREA_H) * 100)
  return {
    position_x: Math.min(100, Math.max(0, px)),
    position_y: Math.min(100, Math.max(0, py)),
  }
}

function apiPortToSide(p: ReplicateGraphPortPosition): ReplicateSide {
  switch (p) {
    case "up":
      return "top"
    case "down":
      return "bottom"
    case "left":
      return "left"
    case "right":
      return "right"
    default:
      return "bottom"
  }
}

function sideToApiPort(side: ReplicateSide): ReplicateGraphPortPosition {
  switch (side) {
    case "top":
      return "up"
    case "bottom":
      return "down"
    case "left":
      return "left"
    case "right":
      return "right"
    default:
      return "down"
  }
}

function inferSides(
  fromId: string,
  toId: string,
  positions: Map<string, { x: number; y: number }>,
  nodeW: number,
  nodeH: number,
): { from_side: ReplicateSide; to_side: ReplicateSide } {
  const a = positions.get(fromId)
  const b = positions.get(toId)
  if (!a || !b) return { from_side: "bottom", to_side: "top" }
  const ax = a.x + nodeW / 2
  const ay = a.y + nodeH / 2
  const bx = b.x + nodeW / 2
  const by = b.y + nodeH / 2
  const dx = bx - ax
  const dy = by - ay
  const from_side: ReplicateSide =
    Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : dy >= 0 ? "bottom" : "top"
  const to_side: ReplicateSide =
    Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "left" : "right") : dy >= 0 ? "top" : "bottom"
  return { from_side, to_side }
}

/**
 * 将当前画布导出为可与 GET `/replicates` 一并持久化的布局结构（version 便于后端演进）。
 *
 * @example
 * ```json
 * {
 *   "version": 1,
 *   "nodes": [{ "id": "beijing", "x": 320, "y": 120 }],
 *   "edges": [{
 *     "rule_id": "abc123",
 *     "from": "beijing",
 *     "to": "tianjin",
 *     "from_side": "right",
 *     "to_side": "left"
 *   }]
 * }
 * ```
 */
export function serializeReplicateGraphLayout(nodes: Node[], edges: Edge[]): ReplicateGraphLayoutV1 {
  return {
    version: 1,
    nodes: nodes.map((n) => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
    })),
    edges: edges.map((e) => {
      const r = e.data?.replicate as BucketReplicateRule | undefined
      const from_side =
        r?.from_side ?? parseOutSide(e.sourceHandle) ?? ("bottom" as ReplicateSide)
      const to_side = r?.to_side ?? parseInSide(e.targetHandle) ?? ("top" as ReplicateSide)
      return {
        rule_id: r?.rule_id ?? e.id,
        from: r?.from ?? e.source,
        to: r?.to ?? e.target,
        from_side,
        to_side,
      }
    }),
  }
}

function mergeReplicateSidesFromHandles(eds: Edge[]): Edge[] {
  let changed = false
  const next = eds.map((e) => {
    const r = e.data?.replicate as BucketReplicateRule | undefined
    if (!r) return e
    const fs = parseOutSide(e.sourceHandle) ?? r.from_side ?? "bottom"
    const ts = parseInSide(e.targetHandle) ?? r.to_side ?? "top"
    if (r.from_side === fs && r.to_side === ts) return e
    changed = true
    return {
      ...e,
      data: {
        ...e.data,
        replicate: { ...r, from_side: fs, to_side: ts },
      },
    }
  })
  return changed ? next : eds
}

type ServerNodeData = { label: string }

function ServerFlowNode({ data, selected }: NodeProps<Node<ServerNodeData>>) {
  const hcls =
    "replicate-quad-handle !h-2.5 !w-2.5 !min-h-[10px] !min-w-[10px] !border-0 !bg-muted-foreground/45"
  return (
    <div
      className={cn(
        "relative box-border min-h-[44px] min-w-[112px] rounded-xl border bg-card px-3 py-2 text-center text-xs font-semibold text-card-foreground shadow-sm ring-1 ring-border/70",
        selected && "ring-2 ring-emerald-500/60",
      )}
    >
      {SIDES.map((side) => {
        const p = sideToPosition(side)
        return (
          <span key={side} className="contents">
            <Handle type="source" position={p} id={outHandleId(side)} className={hcls} />
            <Handle type="target" position={p} id={inHandleId(side)} className={hcls} />
          </span>
        )
      })}
      <div className="relative z-[1] flex min-h-[28px] items-center justify-center">{data.label}</div>
    </div>
  )
}

type GraphMode = "view" | "edit"

const ReplicateEdgeContext = createContext<{
  mode: GraphMode
  updateReplicate: (edgeId: string, next: BucketReplicateRule) => void
  removeEdge: (edgeId: string) => void
  persistEdgePorts?: (from: string, to: string, from_side: ReplicateSide, to_side: ReplicateSide) => void
  openInspectorEdgeId: string | null
  closeEdgeInspector: () => void
} | null>(null)

function collectServerIds(resp: BucketReplicatesResponse): string[] {
  const ids = new Set<string>()
  const srv = resp.servers
  if (Array.isArray(srv)) {
    for (const s of srv) ids.add(s)
  } else if (isServersRecord(srv)) {
    for (const k of Object.keys(srv)) ids.add(k)
  }
  for (const r of resp.replicates ?? []) {
    ids.add(r.from)
    ids.add(r.to)
  }
  return [...ids].sort((a, b) => a.localeCompare(b))
}

function circleLayout(ids: string[], centerX: number, centerY: number, radius: number) {
  const map = new Map<string, { x: number; y: number }>()
  const n = ids.length
  if (n === 0) return map
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    map.set(ids[i], {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    })
  }
  return map
}

function defaultReplicateStatus(): BucketReplicateRule["status"] {
  return {
    status: "pending",
    priority: 0,
    delete_marker_replication: "Enabled",
    existing_object_replication: "Enabled",
    source_selection_criteria: "Enabled",
  }
}

function replicateToEdge(r: BucketReplicateRule): Edge {
  const from_side = r.from_side ?? "bottom"
  const to_side = r.to_side ?? "top"
  const merged: BucketReplicateRule = { ...r, from_side, to_side }
  return {
    id: r.rule_id || `${r.from}->${r.to}`,
    source: r.from,
    target: r.to,
    sourceHandle: outHandleId(from_side),
    targetHandle: inHandleId(to_side),
    type: "replicateBezier",
    animated: r.status.status !== "success",
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 18,
      height: 18,
      color: "var(--muted-foreground)",
    },
    style: { stroke: "var(--muted-foreground)", strokeWidth: 1.5 },
    data: { replicate: merged },
  }
}

const NODE_W = 112
const NODE_H = 44

function buildFlowState(resp: BucketReplicatesResponse): { nodes: Node[]; edges: Edge[] } {
  const ids = collectServerIds(resp)
  const posMap = new Map<string, { x: number; y: number }>()
  const layout = resp.layout
  const coordMode = getGraphCoordMode(resp)

  if (isServersRecord(resp.servers)) {
    const sm = resp.servers
    for (const [id, entry] of Object.entries(sm)) {
      posMap.set(id, serverEntryToPixel(entry, coordMode))
    }
  }

  if (layout?.nodes?.length) {
    for (const nn of layout.nodes) {
      if (!posMap.has(nn.id)) {
        posMap.set(nn.id, { x: nn.x, y: nn.y })
      }
    }
  }

  const circle = circleLayout(ids, 380, 300, 200)
  for (const id of ids) {
    if (!posMap.has(id)) {
      posMap.set(id, circle.get(id) ?? { x: 0, y: 0 })
    }
  }

  const nodes: Node[] = ids.map((id) => ({
    id,
    type: "server",
    position: posMap.get(id) ?? { x: 0, y: 0 },
    width: NODE_W,
    height: NODE_H,
    data: { label: id },
  }))
  const edgeLayoutByRule = new Map((resp.layout?.edges ?? []).map((e) => [e.rule_id, e]))
  const edges = (resp.replicates ?? []).map((r) => {
    let from_side = r.from_side
    let to_side = r.to_side
    if (r.from_position) {
      from_side = from_side ?? apiPortToSide(r.from_position)
    }
    if (r.to_position) {
      to_side = to_side ?? apiPortToSide(r.to_position)
    }
    const le = edgeLayoutByRule.get(r.rule_id)
    if (le) {
      from_side = from_side ?? le.from_side
      to_side = to_side ?? le.to_side
    }
    if (!from_side || !to_side) {
      const inf = inferSides(r.from, r.to, posMap, NODE_W, NODE_H)
      from_side = from_side ?? inf.from_side
      to_side = to_side ?? inf.to_side
    }
    return replicateToEdge({ ...r, from_side, to_side })
  })
  return { nodes, edges }
}

function FitViewOnData({ token }: { token: number }) {
  const { fitView } = useReactFlow()
  useEffect(() => {
    if (token <= 0) return
    const t = requestAnimationFrame(() => {
      fitView({ padding: 0.2, duration: 200 })
    })
    return () => cancelAnimationFrame(t)
  }, [token, fitView])
  return null
}

const triStateOptions = ["Enabled", "Disabled"] as const

function replicationTriEnabled(v: string): boolean {
  return v === "Enabled" || v?.toLowerCase?.() === "enabled"
}

function statusDisplayZh(s: string): string {
  const key = s.toLowerCase()
  const map: Record<string, string> = {
    success: "成功",
    pending: "待处理",
    running: "运行中",
    failed: "失败",
  }
  return map[key] ?? s
}

function StatusPill({ value }: { value: string }) {
  const key = value.toLowerCase()
  const tone =
    key === "success"
      ? "border-emerald-500/45 bg-emerald-500/12 text-emerald-900 dark:text-emerald-100"
      : key === "pending" || key === "running"
        ? "border-amber-500/45 bg-amber-500/12 text-amber-950 dark:text-amber-100"
        : key === "failed"
          ? "border-destructive/45 bg-destructive/10 text-destructive"
          : "border-border bg-muted text-foreground"
  return (
    <span
      className={cn(
        "max-w-[8rem] shrink-0 truncate rounded-full border px-2 py-0.5 text-center text-[10px] font-semibold",
        tone,
      )}
      title={value}
    >
      {statusDisplayZh(value)}
    </span>
  )
}

function ReadonlyReplicationSwitchRow({ label, checked }: { label: string; checked: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/20 px-2.5 py-1.5">
      <Label className="cursor-default text-[11px] font-normal leading-snug text-muted-foreground">{label}</Label>
      <Switch checked={checked} disabled className="shrink-0 opacity-90" />
    </div>
  )
}

function EdgePriorityReadout({ priority }: { priority: number }) {
  const n = typeof priority === "number" && !Number.isNaN(priority) ? priority : Number(priority)
  const value = Number.isFinite(n) ? n : 0
  const belowMin = value < 0
  return (
    <div className="rounded-lg border border-border/60 bg-muted/25 px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium text-muted-foreground">优先级 (数值越大优先级越高)</span>
        <span
          className="font-mono text-lg font-semibold tabular-nums leading-none tracking-tight text-foreground"
          title={`优先级数值：${value}`}
        >
          {value}
        </span>
      </div>
      {/* <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
        ；约定从 <span className="font-medium text-foreground/90">0</span> 起，上不封顶。
      </p> */}
      {belowMin && (
        <p className="mt-1 text-[10px] leading-snug text-amber-800 dark:text-amber-200">
          当前值小于 0，与常见约定不一致，仅作展示。
        </p>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label className="mb-1">{label}</Label>
      {children}
    </div>
  )
}

function TriSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <Label className="mb-1">{label}</Label>
      <select
        className="flex h-9 w-full rounded-xl border border-input bg-background px-2 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={triStateOptions.includes(value as (typeof triStateOptions)[number]) ? value : "Enabled"}
        onChange={(e) => onChange(e.target.value)}
      >
        {triStateOptions.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}

function sideLabel(s: ReplicateSide): string {
  switch (s) {
    case "top":
      return "上"
    case "right":
      return "右"
    case "bottom":
      return "下"
    case "left":
      return "左"
    default:
      return s
  }
}

function SideSelect({
  label,
  value,
  onChange,
}: {
  label: string
  value: ReplicateSide
  onChange: (v: ReplicateSide) => void
}) {
  return (
    <div>
      <Label className="mb-1">{label}</Label>
      <select
        className="flex h-9 w-full rounded-xl border border-input bg-background px-2 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={value}
        onChange={(e) => onChange(e.target.value as ReplicateSide)}
      >
        {SIDES.map((s) => (
          <option key={s} value={s}>
            {sideLabel(s)}
          </option>
        ))}
      </select>
    </div>
  )
}

function EdgeInspector({
  mode,
  replicate,
  onApply,
  onDelete,
  onClose: _onClose,
}: {
  mode: GraphMode
  replicate: BucketReplicateRule
  onApply: (r: BucketReplicateRule) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [fromSide, setFromSide] = useState<ReplicateSide>(replicate.from_side ?? "bottom")
  const [toSide, setToSide] = useState<ReplicateSide>(replicate.to_side ?? "top")
  useEffect(() => {
    setFromSide(replicate.from_side ?? "bottom")
    setToSide(replicate.to_side ?? "top")
  }, [replicate])

  const st = replicate.status
  const dmOn = replicationTriEnabled(st.delete_marker_replication)
  const exOn = replicationTriEnabled(st.existing_object_replication)
  const srcOn = replicationTriEnabled(st.source_selection_criteria)

  const readonlyFlags = (
    <div className="space-y-1.5">
      <ReadonlyReplicationSwitchRow label="删除同步" checked={dmOn} />
      <ReadonlyReplicationSwitchRow label="存量数据复制" checked={exOn} />
      <ReadonlyReplicationSwitchRow label="跨源同步" checked={srcOn} />
    </div>
  )

  const endpointReadonly = (
    <>
      <div className="rounded-lg border border-border/60 bg-muted/25 px-2.5 py-2">
        <div className="text-[10px] text-muted-foreground">源站点</div>
        <div className="mt-0.5 break-all font-mono text-[11px] text-foreground">{replicate.from}</div>
        <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-border/40 pt-1.5">
          <span className="text-[10px] text-muted-foreground">出线侧</span>
          <span className="text-[11px] font-medium text-foreground">{sideLabel(replicate.from_side ?? "bottom")}</span>
        </div>
      </div>
      <div className="rounded-lg border border-border/60 bg-muted/25 px-2.5 py-2">
        <div className="text-[10px] text-muted-foreground">目标站点</div>
        <div className="mt-0.5 break-all font-mono text-[11px] text-foreground">{replicate.to}</div>
        <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-border/40 pt-1.5">
          <span className="text-[10px] text-muted-foreground">入线侧</span>
          <span className="text-[11px] font-medium text-foreground">{sideLabel(replicate.to_side ?? "top")}</span>
        </div>
      </div>
    </>
  )

  const header = (
    <div className="mb-2 flex items-start justify-between gap-2 border-b border-border/60 pb-2">
      <div className="min-w-0 text-xs font-semibold leading-snug text-foreground">
        <span className="break-all font-mono">{replicate.from}</span>
        <span className="text-muted-foreground"> → </span>
        <span className="break-all font-mono">{replicate.to}</span>
      </div>
      <StatusPill value={st.status} />
    </div>
  )

  if (mode === "view") {
    return (
      <div className="text-xs">
        {header}
        {/* <dl className="space-y-2">
          <div>
            <dt className="text-[10px] text-muted-foreground/90">规则 ID</dt>
            <dd className="mt-0.5 break-all font-mono text-[11px] text-foreground">{replicate.rule_id || "—"}</dd>
          </div>
        </dl> */}
        <div className="mt-2 space-y-2">{endpointReadonly}</div>
        <div className="mt-2">
          <EdgePriorityReadout priority={st.priority} />
        </div>
        <div className="mt-2">{readonlyFlags}</div>
        {/* <div className="mt-3 flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            关闭
          </Button>
        </div> */}
      </div>
    )
  }

  return (
    <div className="space-y-2 text-xs">
      {header}
      {/* <Field label="规则 ID">
        <Input value={replicate.rule_id} readOnly disabled className="font-mono text-[11px]" />
      </Field> */}
      <div className="grid gap-2">
        <div className="rounded-lg border border-border/60 bg-muted/25 px-2.5 py-2">
          <div className="text-[10px] text-muted-foreground">源站点</div>
          <div className="mt-0.5 break-all font-mono text-[11px] text-foreground">{replicate.from}</div>
          <div className="mt-2">
            <SideSelect
              label="出线侧"
              value={fromSide}
              onChange={(v) => setFromSide(v)}
            />
          </div>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/25 px-2.5 py-2">
          <div className="text-[10px] text-muted-foreground">目标站点</div>
          <div className="mt-0.5 break-all font-mono text-[11px] text-foreground">{replicate.to}</div>
          <div className="mt-2">
            <SideSelect label="入线侧" value={toSide} onChange={(v) => setToSide(v)} />
          </div>
        </div>
      </div>
      {/* <Field label="同步状态（只读）">
        <Input value={st.status} readOnly disabled className="text-[11px]" />
      </Field> */}
      <EdgePriorityReadout priority={st.priority} />
      {readonlyFlags}
      <div className="flex flex-wrap justify-between pt-1">
        <Button
          type="button"
          size="sm"
          onClick={() =>
            onApply({
              ...replicate,
              from_side: fromSide,
              to_side: toSide,
            })
          }
        >
          应用
        </Button>
        <Button type="button" size="sm" variant="destructive" onClick={onDelete}>
          删除
        </Button>
      </div>
    </div>
  )
}

type ReplicateEdgeData = { replicate: BucketReplicateRule }

function ReplicateBezierEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
  selected,
}: EdgeProps<Edge<ReplicateEdgeData>>) {
  const ctx = useContext(ReplicateEdgeContext)
  const replicate = data?.replicate
  /** 与画布 viewport 的 zoom 相抵，避免边标签随缩放变形；edgelabel-renderer 仍在变换层内 */
  const viewportZoom = useStore((s) => s.transform[2])
  const labelInverseScale = 1 / Math.max(viewportZoom, 0.001)

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const stroke = selected ? "var(--primary)" : "var(--muted-foreground)"
  const showCard = ctx != null && replicate != null && ctx.openInspectorEdgeId === id

  if (!replicate || !ctx) {
    return (
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{ ...style, stroke }}
        interactionWidth={22}
      />
    )
  }

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{ ...style, stroke, strokeWidth: selected ? 2.25 : 1.5 }}
        interactionWidth={26}
      />
      {showCard && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan nowheel pointer-events-auto"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px) scale(${labelInverseScale})`,
              transformOrigin: "center center",
              zIndex: 1001,
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="max-h-[min(72vh,440px)] w-[min(92vw,300px)] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-3 text-card-foreground shadow-lg ring-1 ring-border/60 [touch-action:pan-y]">
              <EdgeInspector
                mode={ctx.mode}
                replicate={replicate}
                onApply={(next) => {
                  const fs = next.from_side ?? "bottom"
                  const ts = next.to_side ?? "top"
                  ctx.updateReplicate(id, { ...next, from_side: fs, to_side: ts })
                  ctx.persistEdgePorts?.(next.from, next.to, fs, ts)
                }}
                onDelete={() => {
                  ctx.removeEdge(id)
                  ctx.closeEdgeInspector()
                }}
                onClose={() => ctx.closeEdgeInspector()}
              />
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const nodeTypes = { server: ServerFlowNode }
const edgeTypes = { replicateBezier: ReplicateBezierEdge }

function NewReplicateEdgeDialog({
  open,
  replicate,
  saving,
  onCancel,
  onConfirm,
}: {
  open: boolean
  replicate: BucketReplicateRule
  saving: boolean
  onCancel: () => void
  onConfirm: (payload: BucketReplicateCreatePayload) => void
}) {
  const [draft, setDraft] = useState(replicate)
  useEffect(() => {
    setDraft(replicate)
  }, [replicate])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm"
      role="presentation"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card p-5 text-card-foreground shadow-xl ring-1 ring-border/70"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-base font-semibold text-foreground">新建复制连接</div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          方向：<span className="font-mono text-foreground">{draft.from}</span>（
          {sideLabel(draft.from_side ?? "bottom")}）→{" "}
          <span className="font-mono text-foreground">{draft.to}</span>（
          {sideLabel(draft.to_side ?? "top")}）
        </p>
        <div className="mt-4 space-y-3 text-xs">
          <SideSelect
            label="from 侧"
            value={draft.from_side ?? "bottom"}
            onChange={(v) => setDraft((d) => ({ ...d, from_side: v }))}
          />
          <SideSelect
            label="to 侧"
            value={draft.to_side ?? "top"}
            onChange={(v) => setDraft((d) => ({ ...d, to_side: v }))}
          />
          <Field label="status">
            <Input
              value={draft.status.status}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  status: { ...d.status, status: e.target.value },
                }))
              }
            />
          </Field>
          <Field label="priority">
            <Input
              type="number"
              value={draft.status.priority}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  status: { ...d.status, priority: Number(e.target.value) || 0 },
                }))
              }
            />
          </Field>
          <TriSelect
            label="delete_marker_replication"
            value={draft.status.delete_marker_replication}
            onChange={(v) =>
              setDraft((d) => ({
                ...d,
                status: { ...d.status, delete_marker_replication: v },
              }))
            }
          />
          <TriSelect
            label="existing_object_replication"
            value={draft.status.existing_object_replication}
            onChange={(v) =>
              setDraft((d) => ({
                ...d,
                status: { ...d.status, existing_object_replication: v },
              }))
            }
          />
          <TriSelect
            label="source_selection_criteria"
            value={draft.status.source_selection_criteria}
            onChange={(v) =>
              setDraft((d) => ({
                ...d,
                status: { ...d.status, source_selection_criteria: v },
              }))
            }
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={saving} onClick={onCancel}>
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() =>
              onConfirm({
                from: draft.from,
                to: draft.to,
                from_side: draft.from_side ?? "bottom",
                to_side: draft.to_side ?? "top",
                status: { ...draft.status },
              })
            }
          >
            {saving ? "保存中…" : "确定"}
          </Button>
        </div>
      </div>
    </div>
  )
}

export interface BucketReplicateGraphProps {
  bucketName: string
  accessToken?: string
}

export function BucketReplicateGraph({ bucketName, accessToken }: BucketReplicateGraphProps) {
  const [mode, setMode] = useState<GraphMode>("view")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<BucketReplicatesResponse | null>(null)
  const [fitToken, setFitToken] = useState(0)
  const [showMinimap] = useState(false)
  const [openInspectorEdgeId, setOpenInspectorEdgeId] = useState<string | null>(null)
  const [newEdgeDraft, setNewEdgeDraft] = useState<{
    edgeId: string
    replicate: BucketReplicateRule
  } | null>(null)
  const [newEdgeSaving, setNewEdgeSaving] = useState(false)

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const graphCoordModeRef = useRef<"percent" | "pixel">("percent")

  const onEdgesChangeWrapped = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      onEdgesChange(changes)
      queueMicrotask(() => {
        setEdges((eds) => mergeReplicateSidesFromHandles(eds))
      })
    },
    [onEdgesChange, setEdges],
  )

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchBucketReplicatesApi(bucketName, accessToken)
      setPayload(data)
      graphCoordModeRef.current = getGraphCoordMode(data)
      const { nodes: n, edges: e } = buildFlowState(data)
      setNodes(n)
      setEdges(e)
      setFitToken((x) => x + 1)
      setOpenInspectorEdgeId(null)
    } catch {
      setPayload(null)
      setNodes([])
      setEdges([])
      setError("加载复制关系失败")
    } finally {
      setLoading(false)
    }
  }, [accessToken, bucketName, setEdges, setNodes])

  useEffect(() => {
    setEdges((eds) => eds.map((e) => ({ ...e, deletable: mode === "edit" })))
  }, [mode, payload, setEdges])

  const removeEdgeById = useCallback(
    (edgeId: string) => {
      setOpenInspectorEdgeId((cur) => (cur === edgeId ? null : cur))
      setEdges((eds) => eds.filter((e) => e.id !== edgeId))
    },
    [setEdges],
  )

  const closeEdgeInspector = useCallback(() => {
    setOpenInspectorEdgeId(null)
  }, [])

  useEffect(() => {
    if (mode !== "view") return
    setNewEdgeDraft((draft) => {
      if (draft) {
        queueMicrotask(() => removeEdgeById(draft.edgeId))
      }
      return null
    })
  }, [mode, removeEdgeById])

  const reloadRef = useRef(reload)
  reloadRef.current = reload

  useEffect(() => {
    void reloadRef.current()
  }, [bucketName, accessToken])

  const onConnect = useCallback(
    (conn: Connection) => {
      if (mode !== "edit") return
      if (!conn.source || !conn.target || conn.source === conn.target) return
      const from_side = parseOutSide(conn.sourceHandle)
      const to_side = parseInSide(conn.targetHandle)
      if (!from_side || !to_side) return
      const dup = edges.some((e) => e.source === conn.source && e.target === conn.target)
      if (dup) return
      const tempId = `draft-${Date.now().toString(36)}`
      const replicate: BucketReplicateRule = {
        from: conn.source,
        to: conn.target,
        from_side,
        to_side,
        rule_id: tempId,
        status: defaultReplicateStatus(),
      }
      setEdges((eds) => addEdge({ ...replicateToEdge(replicate), deletable: true }, eds))
      setNewEdgeDraft({ edgeId: tempId, replicate })
    },
    [edges, mode, setEdges],
  )

  const cancelNewEdge = useCallback(() => {
    if (newEdgeDraft) {
      removeEdgeById(newEdgeDraft.edgeId)
    }
    setNewEdgeDraft(null)
  }, [newEdgeDraft, removeEdgeById])

  const confirmNewEdge = useCallback(
    async (body: BucketReplicateCreatePayload) => {
      if (!newEdgeDraft) return
      setNewEdgeSaving(true)
      try {
        await createBucketReplicateApi(bucketName, body, accessToken)
        setNewEdgeDraft(null)
        await reload()
      } catch {
        // toast 已由 api client 处理
      } finally {
        setNewEdgeSaving(false)
      }
    },
    [accessToken, bucketName, newEdgeDraft, reload],
  )

  const updateReplicateById = useCallback(
    (edgeId: string, next: BucketReplicateRule) => {
      const from_side = next.from_side ?? "bottom"
      const to_side = next.to_side ?? "top"
      const merged: BucketReplicateRule = { ...next, from_side, to_side }
      setEdges((eds) =>
        eds.map((edge) => {
          if (edge.id !== edgeId) return edge
          const r = merged
          return {
            ...edge,
            id: r.rule_id || edge.id,
            source: r.from,
            target: r.to,
            sourceHandle: outHandleId(from_side),
            targetHandle: inHandleId(to_side),
            animated: r.status.status !== "success",
            data: { replicate: r },
          }
        }),
      )
    },
    [setEdges],
  )

  const persistEdgePorts = useCallback(
    (from: string, to: string, from_side: ReplicateSide, to_side: ReplicateSide) => {
      void postBucketGraphEdgePosition(
        {
          bucket: bucketName,
          from_server: from,
          to_server: to,
          from_position: sideToApiPort(from_side),
          to_position: sideToApiPort(to_side),
        },
        accessToken,
      )
    },
    [accessToken, bucketName],
  )

  const onNodeDragStop = useCallback(
    (_event: unknown, node: Node) => {
      if (mode !== "edit") return
      const { position_x, position_y } = pixelToGraphPayload(
        node.position.x,
        node.position.y,
        graphCoordModeRef.current,
      )
      void postBucketGraphNodePosition(
        {
          bucket: bucketName,
          server: node.id,
          position_x,
          position_y,
        },
        accessToken,
      )
    },
    [accessToken, bucketName, mode],
  )

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (mode !== "edit") return
      setEdges((eds) => {
        const reconnected = reconnectEdge(oldEdge, newConnection, eds)
        return mergeReplicateSidesFromHandles(
          reconnected.map((e) => {
            if (e.id !== oldEdge.id) return e
            const r = e.data?.replicate as BucketReplicateRule | undefined
            if (!r) return e
            const fs = parseOutSide(e.sourceHandle) ?? r.from_side ?? "bottom"
            const ts = parseInSide(e.targetHandle) ?? r.to_side ?? "top"
            return {
              ...e,
              data: {
                ...e.data,
                replicate: {
                  ...r,
                  from: e.source,
                  to: e.target,
                  from_side: fs,
                  to_side: ts,
                },
              },
            }
          }),
        )
      })
      const fs = parseOutSide(newConnection.sourceHandle)
      const ts = parseInSide(newConnection.targetHandle)
      if (!newConnection.source || !newConnection.target || !fs || !ts) return
      void postBucketGraphEdgePosition(
        {
          bucket: bucketName,
          from_server: newConnection.source,
          to_server: newConnection.target,
          from_position: sideToApiPort(fs),
          to_position: sideToApiPort(ts),
        },
        accessToken,
      )
    },
    [accessToken, bucketName, mode, setEdges],
  )

  const onEdgeClick = useCallback((_e: MouseEvent, edge: Edge) => {
    if (edge.type !== "replicateBezier") return
    setOpenInspectorEdgeId((cur) => (cur === edge.id ? null : edge.id))
  }, [])

  const onPaneClick = useCallback(() => {
    setOpenInspectorEdgeId(null)
  }, [])

  const edgeCtx = useMemo(
    () => ({
      mode,
      updateReplicate: updateReplicateById,
      removeEdge: removeEdgeById,
      persistEdgePorts: mode === "edit" ? persistEdgePorts : undefined,
      openInspectorEdgeId,
      closeEdgeInspector,
    }),
    [closeEdgeInspector, mode, openInspectorEdgeId, persistEdgePorts, removeEdgeById, updateReplicateById],
  )

  const graphReady = payload && collectServerIds(payload).length > 0

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-0.5">
        <div>
          <div className="text-sm font-medium text-foreground">跨站点复制拓扑</div>
          {/* <p className="mt-0.5 max-w-xl text-[11px] text-muted-foreground">
            节点坐标与边的连接桩（上/下/左/右）由接口返回；编辑模式下拖拽节点或调整边会写入
            <span className="font-mono"> /api/graph/bucket-node-position </span>与
            <span className="font-mono"> /api/graph/bucket-edge-position </span>。可从任一侧出线桩拖到目标入线桩新建边；亦可复制布局 JSON 备用。
          </p> */}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-full border border-border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setMode("view")}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                mode === "view"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              显示
            </button>
            <button
              type="button"
              onClick={() => setMode("edit")}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                mode === "edit"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              编辑
            </button>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
            重新加载
          </Button>
          {/* {mode === "edit" && graphReady && (
            <Button type="button" variant="outline" size="sm" onClick={() => void copyLayoutJson()}>
              复制布局 JSON
            </Button>
          )} */}
          {/* {graphReady && (
            <Button
              type="button"
              variant={showMinimap ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowMinimap((v) => !v)}
            >
              全局
            </Button>
          )} */}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-12 text-xs text-muted-foreground">
          正在加载复制关系…
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
          <div>{error}</div>
          <Button type="button" variant="outline" size="sm" onClick={() => void reload()}>
            重试
          </Button>
        </div>
      ) : !graphReady ? (
        <div className="flex flex-1 items-center justify-center py-12 text-xs text-muted-foreground">
          当前存储桶暂无站点或复制数据。
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/80 bg-background">
          <ReplicateEdgeContext.Provider value={edgeCtx}>
            <ReactFlow
              className="replicate-bucket-flow h-full w-full min-h-0 rounded-xl"
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChangeWrapped}
              onConnect={onConnect}
              onNodeDragStop={onNodeDragStop}
              onReconnect={onReconnect}
              onEdgeClick={onEdgeClick}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              connectionLineType={ConnectionLineType.Bezier}
              connectionRadius={48}
              nodesDraggable={mode === "edit"}
              nodesConnectable={mode === "edit"}
              elementsSelectable
              edgesReconnectable={mode === "edit"}
              edgesFocusable
              deleteKeyCode={mode === "edit" ? ["Backspace", "Delete"] : null}
              panOnDrag
              zoomOnScroll
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <FitViewOnData token={fitToken} />
              <Background gap={16} color="var(--border)" />
              <Controls showInteractive={mode === "edit"} />
              {showMinimap && (
                <MiniMap
                  zoomable
                  pannable
                  className="!rounded-lg !border !border-border !bg-card"
                  nodeClassName="!fill-muted !stroke-border"
                  maskColor="color-mix(in oklch, var(--background) 55%, transparent)"
                />
              )}
            </ReactFlow>
          </ReplicateEdgeContext.Provider>
        </div>
      )}

      <NewReplicateEdgeDialog
        open={!!newEdgeDraft}
        replicate={newEdgeDraft?.replicate ?? defaultReplicateRule()}
        saving={newEdgeSaving}
        onCancel={cancelNewEdge}
        onConfirm={confirmNewEdge}
      />
    </div>
  )
}

function defaultReplicateRule(): BucketReplicateRule {
  return {
    from: "",
    to: "",
    from_side: "bottom",
    to_side: "top",
    rule_id: "",
    status: defaultReplicateStatus(),
  }
}
