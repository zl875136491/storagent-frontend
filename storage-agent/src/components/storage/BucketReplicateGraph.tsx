import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
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
  deleteBucketReplicateApi,
  fetchBucketReplicatesApi,
  postBucketGraphEdgePosition,
  postBucketGraphNodePosition,
} from "../../api/client"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Switch } from "../ui/switch"
import { cn } from "../../lib/utils"
import { useAuth } from "../../auth/AuthContext"

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

/** 画布像素坐标（后端已统一为像素；遗留百分比由后端读取时迁移） */
function isServersRecord(
  servers: BucketReplicatesResponse["servers"],
): servers is BucketReplicateServersMap {
  return servers != null && !Array.isArray(servers) && typeof servers === "object"
}

function serverEntryToPixel(
  entry: { position_x: number; position_y: number },
): { x: number; y: number } {
  return { x: entry.position_x, y: entry.position_y }
}

function pixelToGraphPayload(x: number, y: number): { position_x: number; position_y: number } {
  return { position_x: Math.round(x), position_y: Math.round(y) }
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
  removeEdge: (edgeId: string, options?: { persist?: boolean }) => void
  persistEdgePorts?: (from: string, to: string, from_side: ReplicateSide, to_side: ReplicateSide) => void
  openInspectorEdgeId: string | null
  closeEdgeInspector: () => void
} | null>(null)

function collectServerIds(resp: BucketReplicatesResponse): string[] {
  const ids = new Set<string>()
  if (Array.isArray(resp.server_ids) && resp.server_ids.length > 0) {
    for (const s of resp.server_ids) ids.add(s)
  }
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

  if (isServersRecord(resp.servers)) {
    const sm = resp.servers
    for (const [id, entry] of Object.entries(sm)) {
      posMap.set(id, serverEntryToPixel(entry))
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
}: {
  mode: GraphMode
  replicate: BucketReplicateRule
  onApply: (r: BucketReplicateRule) => void
  onDelete: () => void
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

/** 与边卡片 Tailwind 尺寸一致，用于将 fixed 定位钳在视口内，避免贴边裁切 */
function edgeInspectCardMaxSize() {
  if (typeof window === "undefined") return { maxW: 300, maxH: 440 }
  return {
    maxW: Math.min(window.innerWidth * 0.92, 300),
    maxH: Math.min(window.innerHeight * 0.72, 440),
  }
}

function clampEdgeInspectCardToViewport(cx: number, cy: number, pad = 8) {
  const { maxW, maxH } = edgeInspectCardMaxSize()
  const vw = typeof window !== "undefined" ? window.innerWidth : maxW
  const vh = typeof window !== "undefined" ? window.innerHeight : maxH
  const halfW = maxW / 2 + pad
  const halfH = maxH / 2 + pad
  return {
    x: Math.min(Math.max(cx, halfW), Math.max(halfW, vw - halfW)),
    y: Math.min(Math.max(cy, halfH), Math.max(halfH, vh - halfH)),
  }
}

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
  const { flowToScreenPosition } = useReactFlow()
  /** 平移/缩放时重算屏幕坐标（卡片经 portal 挂到 body，不在缩放层内） */
  const transform = useStore((s) => s.transform)
  void transform

  const [resizeTick, setResizeTick] = useState(0)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const dragSessionRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)
  const prevShowCardRef = useRef(false)
  const showCard = ctx != null && replicate != null && ctx.openInspectorEdgeId === id

  useEffect(() => {
    if (showCard && !prevShowCardRef.current) {
      setDragOffset({ x: 0, y: 0 })
    }
    prevShowCardRef.current = showCard
  }, [showCard])

  useEffect(() => {
    if (!showCard) return
    const onResize = () => setResizeTick((n) => n + 1)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [showCard])

  void resizeTick

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const stroke = selected ? "var(--primary)" : "var(--muted-foreground)"

  const rawScreen =
    showCard && typeof window !== "undefined"
      ? flowToScreenPosition({ x: labelX, y: labelY })
      : { x: 0, y: 0 }
  const screen = showCard
    ? clampEdgeInspectCardToViewport(rawScreen.x + dragOffset.x, rawScreen.y + dragOffset.y)
    : rawScreen

  const onInspectDragPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragSessionRef.current = {
      px: e.clientX,
      py: e.clientY,
      ox: dragOffset.x,
      oy: dragOffset.y,
    }
  }

  const onInspectDragPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragSessionRef.current
    if (!d) return
    e.preventDefault()
    setDragOffset({
      x: d.ox + (e.clientX - d.px),
      y: d.oy + (e.clientY - d.py),
    })
  }

  const onInspectDragPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragSessionRef.current) return
    dragSessionRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

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
      {showCard && typeof document !== "undefined" && (
        createPortal(
          <div
            className="nodrag nopan nowheel pointer-events-auto"
            style={{
              position: "fixed",
              left: screen.x,
              top: screen.y,
              transform: "translate(-50%, -50%)",
              zIndex: 10050,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex max-h-[min(72vh,440px)] w-[min(92vw,300px)] flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-lg ring-1 ring-border/60">
              <div
                className={cn(
                  "flex shrink-0 cursor-grab items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-2 select-none active:cursor-grabbing",
                  "[touch-action:none]",
                )}
                onPointerDown={onInspectDragPointerDown}
                onPointerMove={onInspectDragPointerMove}
                onPointerUp={onInspectDragPointerUp}
                onPointerCancel={onInspectDragPointerUp}
                onClick={(e) => e.stopPropagation()}
              >
                <span className="inline-block h-1 w-8 rounded-full bg-muted-foreground/35" aria-hidden />
                {/* <span className="text-[10px] font-medium text-muted-foreground">拖动调整位置</span> */}
              </div>
              <div className="docs-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 [touch-action:pan-y]">
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
                />
              </div>
            </div>
          </div>,
          document.body,
        )
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
  const { user } = useAuth()
  const isAdmin = user?.is_admin === true
  const [mode, setMode] = useState<GraphMode>("view")
  const canEdit = isAdmin && mode === "edit"
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
  const edgesRef = useRef<Edge[]>([])
  edgesRef.current = edges

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
    if (!isAdmin && mode === "edit") {
      setMode("view")
    }
  }, [isAdmin, mode])

  useEffect(() => {
    setEdges((eds) => eds.map((e) => ({ ...e, deletable: canEdit })))
  }, [canEdit, payload, setEdges])

  const isDraftEdgeId = useCallback(
    (edgeId: string) => edgeId.startsWith("draft-") || newEdgeDraft?.edgeId === edgeId,
    [newEdgeDraft],
  )

  const persistDeleteReplicate = useCallback(
    async (edge: Edge) => {
      if (isDraftEdgeId(edge.id)) return
      const replicate = (edge.data as { replicate?: BucketReplicateRule } | undefined)?.replicate
      if (!replicate?.from || !replicate?.to) return
      await deleteBucketReplicateApi(
        bucketName,
        {
          from: replicate.from,
          to: replicate.to,
          rule_id: replicate.rule_id?.startsWith("draft-") ? undefined : replicate.rule_id,
        },
        accessToken,
      )
    },
    [accessToken, bucketName, isDraftEdgeId],
  )

  const removeEdgeById = useCallback(
    (edgeId: string, options?: { persist?: boolean }) => {
      const persist = options?.persist !== false
      const edge = edgesRef.current.find((e) => e.id === edgeId)
      setOpenInspectorEdgeId((cur) => (cur === edgeId ? null : cur))
      setEdges((eds) => eds.filter((e) => e.id !== edgeId))
      if (!persist || !edge || isDraftEdgeId(edgeId)) return
      void persistDeleteReplicate(edge).catch(() => {
        void reload()
      })
    },
    [isDraftEdgeId, persistDeleteReplicate, reload, setEdges],
  )

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const edge of deleted) {
        if (isDraftEdgeId(edge.id)) continue
        void persistDeleteReplicate(edge).catch(() => {
          void reload()
        })
      }
    },
    [isDraftEdgeId, persistDeleteReplicate, reload],
  )

  const closeEdgeInspector = useCallback(() => {
    setOpenInspectorEdgeId(null)
  }, [])

  useEffect(() => {
    if (mode !== "view") return
    setNewEdgeDraft((draft) => {
      if (draft) {
        queueMicrotask(() => removeEdgeById(draft.edgeId, { persist: false }))
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
      if (!canEdit) return
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
    [canEdit, edges, setEdges],
  )

  const cancelNewEdge = useCallback(() => {
    if (newEdgeDraft) {
      removeEdgeById(newEdgeDraft.edgeId, { persist: false })
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
      if (!canEdit) return
      const { position_x, position_y } = pixelToGraphPayload(node.position.x, node.position.y)
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
    [accessToken, bucketName, canEdit],
  )

  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      if (!canEdit) return
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
    [accessToken, bucketName, canEdit, setEdges],
  )

  const onEdgeClick = useCallback((_e: MouseEvent, edge: Edge) => {
    if (edge.type !== "replicateBezier") return
    /** 始终打开当前边；勿在同边上 toggle 关闭，否则 portal 卡片与边命中区重叠时易穿透触发而误关 */
    setOpenInspectorEdgeId(edge.id)
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
          <div className="relative">
            <div
              className={cn(
                "flex rounded-full border border-border bg-muted/40 p-0.5",
                !isAdmin && "pointer-events-none opacity-55",
              )}
            >
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
                onClick={() => {
                  if (!isAdmin) return
                  setMode("edit")
                }}
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
            {!isAdmin ? (
              <div
                className="absolute inset-0 z-10 flex cursor-not-allowed items-center justify-center rounded-full bg-background/55 backdrop-blur-[1px]"
                title="仅管理员可编辑复制拓扑"
                aria-label="仅管理员可编辑复制拓扑"
              >
                <span className="rounded-full border border-border/70 bg-card/90 px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">
                  仅管理员可编辑
                </span>
              </div>
            ) : null}
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
              onEdgesDelete={onEdgesDelete}
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
