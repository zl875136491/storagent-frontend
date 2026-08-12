/* eslint-disable react-refresh/only-export-components -- Markdown and diagrams share one definition. */
import { useState } from "react"
import { Cloud, FileDown, FileUp, Laptop, Maximize2, Server, Trash2, X } from "lucide-react"

import { cn } from "@/lib/utils"

type Actor = "browser" | "app" | "storagent"
type FlowKind = "upload" | "download" | "delete"
type FlowTone = "public" | "control" | "data" | "internal"
type FlowLink = { id: string; order: number; from: Actor; to: Actor; label: string; auth: string; input: string; output: string; tone: FlowTone }

const ACTORS = {
  browser: { label: "App 前端", icon: Laptop },
  app: { label: "App 后端", icon: Server },
  storagent: { label: "Storagent", icon: Cloud },
} as const

const FLOW_TITLES: Record<FlowKind, string> = { upload: "上传调用时序", download: "下载调用时序", delete: "删除与恢复调用时序" }

// Each link is both the rendered line and the source for the downloadable Markdown.
// Keeping authentication and I/O beside the action prevents the diagram and docs drifting apart.
const FLOWS: Record<FlowKind, FlowLink[]> = {
  upload: [
    { id: "discover", order: 1, from: "browser", to: "storagent", label: "探测节点", auth: "无需认证（公共接口）", input: "文件所在页面的请求环境", output: "候选节点与延迟，选出直连地址", tone: "public" },
    { id: "init", order: 2, from: "browser", to: "app", label: "申请上传", auth: "App 业务接口认证", input: "文件大小、类型和业务上下文", output: "上传会话信息", tone: "internal" },
    { id: "reserve", order: 3, from: "app", to: "storagent", label: "初始化会话", auth: "x-api-key（控制面）", input: "完整文件大小与类型", output: "upload_id、object_key", tone: "control" },
    { id: "token", order: 4, from: "app", to: "browser", label: "下发上传凭证", auth: "App 业务接口认证", input: "上传会话信息", output: "part_token、直连地址（不含 APIKey）", tone: "internal" },
    { id: "part", order: 5, from: "browser", to: "storagent", label: "上传分片", auth: "token（数据面）", input: "分片二进制、upload_id、object_key", output: "part_number、etag", tone: "data" },
    { id: "complete-request", order: 6, from: "browser", to: "app", label: "提交分片结果", auth: "App 业务接口认证", input: "全部分片编号与 ETag", output: "业务侧完成请求", tone: "internal" },
    { id: "complete", order: 7, from: "app", to: "storagent", label: "合并上传", auth: "x-api-key（控制面）", input: "upload_id、object_key、分片 ETag 列表", output: "对象 ETag、版本信息，释放预留容量", tone: "control" },
  ],
  download: [
    { id: "request", order: 1, from: "browser", to: "app", label: "申请下载", auth: "App 业务接口认证", input: "object_key 与业务上下文", output: "下载授权请求", tone: "internal" },
    { id: "locate", order: 2, from: "app", to: "storagent", label: "定位对象（可选）", auth: "x-api-key（控制面）", input: "object_key", output: "对象所在节点或可用地址", tone: "control" },
    { id: "sign", order: 3, from: "app", to: "browser", label: "签发下载凭证", auth: "App 业务接口认证", input: "业务鉴权结果、object_key", output: "短期 download_url（不含 APIKey）", tone: "internal" },
    { id: "download", order: 4, from: "browser", to: "storagent", label: "直连下载", auth: "token（数据面）", input: "download_url，可选字节区间", output: "二进制响应流", tone: "data" },
  ],
  delete: [
    { id: "delete-request", order: 1, from: "browser", to: "app", label: "申请删除", auth: "App 业务接口认证", input: "业务文件标识或 object_id", output: "删除授权请求", tone: "internal" },
    { id: "list-object", order: 2, from: "app", to: "storagent", label: "查找对象", auth: "x-api-key（控制面）", input: "object_id，或 object_key 的业务映射", output: "对象归属与当前状态", tone: "control" },
    { id: "soft-delete", order: 3, from: "app", to: "storagent", label: "软删除对象", auth: "x-api-key（控制面）", input: "object_id", output: "soft_deleted、restore_until、request_id", tone: "control" },
    { id: "delete-result", order: 4, from: "app", to: "browser", label: "返回回收期", auth: "App 业务接口认证", input: "删除结果", output: "恢复截止时间和业务展示状态", tone: "internal" },
  ],
}

const TONES: Record<FlowTone, { line: string; badge: string; label: string }> = {
  public: { line: "#38bdf8", badge: "bg-sky-500/15 text-sky-700 dark:text-sky-300", label: "公共" },
  internal: { line: "#f59e0b", badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300", label: "业务" },
  control: { line: "#34d399", badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", label: "控制面" },
  data: { line: "#a78bfa", badge: "bg-violet-500/15 text-violet-700 dark:text-violet-300", label: "数据面" },
}

function FlowCanvas({ flow, selected, onSelect, fullscreen = false }: { flow: FlowLink[]; selected: string; onSelect: (id: string) => void; fullscreen?: boolean }) {
  const width = fullscreen ? 1120 : 720
  const height = Math.max(fullscreen ? 450 : 380, 156 + flow.length * (fullscreen ? 43 : 39))
  const x = { browser: width * 0.15, app: width * 0.5, storagent: width * 0.85 }
  const markerId = fullscreen ? "workflow-arrow-full" : "workflow-arrow"
  const laneGap = fullscreen ? 43 : 39
  return <svg viewBox={"0 0 " + width + " " + height} className="h-auto w-full" role="img" aria-label="接口调用关系图">
    <defs><marker id={markerId} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="context-stroke" /></marker></defs>
    {(Object.keys(ACTORS) as Actor[]).map((actor) => { const item = ACTORS[actor]; const Icon = item.icon; return <g key={actor}><line x1={x[actor]} y1="84" x2={x[actor]} y2={height - 22} stroke="currentColor" strokeDasharray="4 5" opacity=".16" /><circle cx={x[actor]} cy="58" r="23" fill="currentColor" opacity=".08" /><foreignObject x={x[actor] - 15} y="43" width="30" height="30"><div className="flex h-full w-full items-center justify-center text-foreground"><Icon className="h-4 w-4" /></div></foreignObject><foreignObject x={x[actor] - 88} y="2" width="176" height="28"><div className="flex h-full items-center justify-center text-xs font-semibold text-foreground">{item.label}</div></foreignObject></g> })}
    {flow.map((link) => { const startX = x[link.from]; const endX = x[link.to]; const forward = startX < endX; const laneY = 118 + (link.order - 1) * laneGap; const midX = (startX + endX) / 2; const path = "M " + startX + " " + laneY + " Q " + midX + " " + (laneY + (forward ? 20 : -20)) + " " + endX + " " + laneY; const tone = TONES[link.tone]; const active = selected === link.id; return <g key={link.id} className="cursor-pointer" onClick={() => onSelect(link.id)}><path d={path} stroke="transparent" strokeWidth="20" fill="none" /><path d={path} stroke={tone.line} strokeWidth={active ? 3.5 : 2} fill="none" markerEnd={"url(#" + markerId + ")"} opacity={active ? 1 : .78} /><circle cx={startX + (forward ? 15 : -15)} cy={laneY} r="12" fill={tone.line} /><text x={startX + (forward ? 15 : -15)} y={laneY + 4} fill="#07110b" fontSize="10" fontWeight="700" textAnchor="middle">{link.order}</text><text x={midX} y={laneY - 9} fill="currentColor" fontSize={fullscreen ? "13" : "11"} fontWeight={active ? "700" : "600"} textAnchor="middle">{link.label}</text></g> })}
    <text x={width / 2} y={height - 7} fill="currentColor" opacity=".48" fontSize="11" textAnchor="middle">点击连线查看认证、输入和输出</text>
  </svg>
}

function LinkDetails({ link }: { link: FlowLink }) { const tone = TONES[link.tone]; return <aside className="h-full bg-muted/20 p-4 text-xs"><div className="flex flex-wrap items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-background" style={{ backgroundColor: tone.line }}>{link.order}</span><span className="font-semibold text-foreground">{link.label}</span><span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", tone.badge)}>{tone.label}</span></div><dl className="mt-4 space-y-4"><div><dt className="font-semibold text-muted-foreground">认证</dt><dd className="mt-1 font-mono text-[11px] leading-relaxed text-foreground">{link.auth}</dd></div><div><dt className="font-semibold text-muted-foreground">输入</dt><dd className="mt-1 leading-relaxed text-foreground">{link.input}</dd></div><div><dt className="font-semibold text-muted-foreground">输出</dt><dd className="mt-1 leading-relaxed text-foreground">{link.output}</dd></div></dl></aside> }

function FlowCard({ kind, onExpand }: { kind: FlowKind; onExpand: () => void }) { const flow = FLOWS[kind]; const [selected, setSelected] = useState(flow[0].id); const active = flow.find((link) => link.id === selected) ?? flow[0]; const Icon = kind === "upload" ? FileUp : kind === "download" ? FileDown : Trash2; return <section className="overflow-hidden rounded-lg border border-border/70 bg-card/40"><header className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3"><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary" aria-hidden /><h3 className="text-sm font-semibold text-foreground">{FLOW_TITLES[kind]}</h3></div><button type="button" onClick={onExpand} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-foreground hover:bg-accent"><Maximize2 className="h-3.5 w-3.5" />全屏</button></header><div className="grid overflow-hidden lg:grid-cols-[minmax(0,1fr)_15rem]"><div className="flex min-h-[24rem] items-center bg-background/35 p-2 sm:p-4"><FlowCanvas flow={flow} selected={selected} onSelect={setSelected} /></div><div className="border-t border-border/70 lg:border-l lg:border-t-0"><LinkDetails link={active} /></div></div></section> }

function FullscreenFlow({ kind, onClose }: { kind: FlowKind; onClose: () => void }) { const flow = FLOWS[kind]; const [selected, setSelected] = useState(flow[0].id); const active = flow.find((link) => link.id === selected) ?? flow[0]; return <div className="fixed inset-0 z-[220] bg-background"><div className="flex h-full flex-col"><header className="flex shrink-0 items-center justify-between border-b border-border/70 px-5 py-4"><div><div className="text-base font-semibold text-foreground">{FLOW_TITLES[kind]}</div><div className="mt-1 text-xs text-muted-foreground">三方实体关系与调用次序</div></div><button type="button" onClick={onClose} aria-label="退出全屏" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground hover:bg-accent"><X className="h-4 w-4" /></button></header><div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_19rem]"><div className="flex min-h-0 items-center overflow-auto p-5 sm:p-10"><FlowCanvas flow={flow} selected={selected} onSelect={setSelected} fullscreen /></div><div className="overflow-y-auto border-t border-border/70 lg:border-l lg:border-t-0"><LinkDetails link={active} /></div></div></div></div> }

function flowKinds(version: string): FlowKind[] { return version === "v2" ? ["upload", "download", "delete"] : ["upload", "download"] }

/** Exports exactly the flows displayed for the selected API version. */
export function generateWorkflowMarkdown(version: string): string {
  const lines = ["# Storagent 调用时序总览（" + version + "）", "", "本文件对应控制台快速开始中的调用关系图。", "", "## 网关入口", "", "Storagent 的页面与 API 都通过 Nginx 访问。唯一默认基址是 `http://stor.1oa.com.cn/server/local`；`local` 表示当前服务器的 Storagent 后端。所有 API 路径追加在该基址后，Nginx 转发时会移除 `/server/{region}` 前缀。", "", "仅在数据驻留、固定区域任务、跨区域调度或区域运维处置等明确场景下，才将 `local` 替换为 `bj`、`tj`、`ks`、`sz` 或 `hz`。", "", "| 接入方式 | 网关基址 | 路由结果 |", "| --- | --- | --- |", "| 默认 | `http://stor.1oa.com.cn/server/local` | 当前服务器后端 |", "| 指定区域（示例：北京） | `http://stor.1oa.com.cn/server/bj` | 北京后端 |", ""]
  for (const kind of flowKinds(version)) { const flow = FLOWS[kind]; lines.push("## " + FLOW_TITLES[kind], "", "```mermaid", "sequenceDiagram", "    participant F as App 前端", "    participant B as App 后端", "    participant S as Storagent"); for (const link of flow) { const from = link.from === "browser" ? "F" : link.from === "app" ? "B" : "S"; const to = link.to === "browser" ? "F" : link.to === "app" ? "B" : "S"; lines.push("    " + from + "->>" + to + ": " + link.order + ". " + link.label) } lines.push("```", "", "### 调用详情", "", "| 序号 | 动作 | 认证 | 输入 | 输出 |", "| --- | --- | --- | --- | --- |"); for (const link of flow) lines.push("| " + link.order + " | " + link.label + " | " + link.auth + " | " + link.input + " | " + link.output + " |"); lines.push("") }
  if (version === "v2") lines.push("## 删除语义", "", "- 删除先将对象标记为 `soft_deleted`，应用逻辑配额立即释放，MinIO 原始数据在恢复期内保留。", "- `restore_until` 前可调用恢复接口；恢复时服务端会再次校验当前配额。", "- 过期对象由周期任务归档与清理，后续只能由运维从归档存储人工提取。", "")
  lines.push("## 固定边界", "", "- App 后端使用 Python，负责业务鉴权、控制面调用和能力令牌签发。", "- App 前端使用 TypeScript，负责以 token 直连数据面上传或下载。", "- 其他技术栈由开发者依据同一调用边界自行适配。", "")
  return lines.join("\n")
}

export function ApiWorkflowDiagram({ version }: { version: string }) { const [fullscreen, setFullscreen] = useState<FlowKind | null>(null); return <div className="mt-4 space-y-4">{flowKinds(version).map((kind) => <FlowCard key={kind} kind={kind} onExpand={() => setFullscreen(kind)} />)}{fullscreen ? <FullscreenFlow kind={fullscreen} onClose={() => setFullscreen(null)} /> : null}</div> }
